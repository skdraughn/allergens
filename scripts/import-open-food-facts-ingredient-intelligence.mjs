import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import path from "node:path";
import readline from "node:readline";

const defaultOutputPath =
  "data/ingredient-intelligence/v1/candidates/open-food-facts-candidates.json";
const allergenTagMap = {
  "en:eggs": "egg",
  "en:fish": "fish",
  "en:gluten": "gluten",
  "en:milk": "milk",
  "en:mustard": "mustard",
  "en:peanuts": "peanut",
  "en:sesame-seeds": "sesame",
  "en:soybeans": "soy",
  "en:sulfites": "sulfites",
  "en:tree-nuts": "tree-nut",
  "en:wheat": "wheat",
};

const inputPath = process.argv[2];
const outputPath = path.resolve(process.argv[3] ?? defaultOutputPath);

if (!inputPath) {
  throw new Error(
    "Usage: node scripts/import-open-food-facts-ingredient-intelligence.mjs <openfoodfacts-products.jsonl[.gz]> [output.json]",
  );
}

const ingredientCounts = new Map();
const allergenEvidence = new Map();
const input = createReadStream(inputPath);
const stream = inputPath.endsWith(".gz") ? input.pipe(createGunzip()) : input;
const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.trim()) {
    continue;
  }

  const product = JSON.parse(line);
  const ingredientText = product.ingredients_text_en ?? product.ingredients_text;
  const tags = normalizeTags([
    ...(product.allergens_tags ?? []),
    ...(product.traces_tags ?? []),
  ]);

  for (const ingredient of extractIngredientCandidates(ingredientText)) {
    ingredientCounts.set(ingredient, (ingredientCounts.get(ingredient) ?? 0) + 1);

    for (const tag of tags) {
      const allergenId = allergenTagMap[tag];

      if (!allergenId) {
        continue;
      }

      const key = `${ingredient}:${allergenId}`;
      allergenEvidence.set(key, (allergenEvidence.get(key) ?? 0) + 1);
    }
  }
}

const candidates = Array.from(ingredientCounts.entries())
  .filter(([, count]) => count >= 5)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 500)
  .map(([ingredient, count]) => ({
    ingredient,
    count,
    allergens: Array.from(allergenEvidence.entries())
      .filter(([key]) => key.startsWith(`${ingredient}:`))
      .map(([key, evidenceCount]) => ({
        id: key.split(":").at(-1),
        evidenceCount,
      }))
      .sort((left, right) => right.evidenceCount - left.evidenceCount),
  }));

const artifact = {
  generatedAt: new Date().toISOString(),
  reviewStatus: "candidate-only",
  source: {
    id: "open-food-facts",
    license: "ODbL-1.0",
    attribution:
      "Contains information derived from Open Food Facts, made available under the Open Database License.",
    inputPath,
  },
  candidates,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Wrote Open Food Facts candidates to ${outputPath}`);

function normalizeTags(tags) {
  return tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
}

function extractIngredientCandidates(value) {
  return Array.from(
    new Set(
      String(value ?? "")
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .split(/[,.;:[\]\n]/)
        .map((part) =>
          part
            .replace(/[^a-z0-9 -]/g, " ")
            .replace(/\b(?:and|or|contains|less than|of|with)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter((part) => part.length >= 3 && part.length <= 40),
    ),
  );
}
