import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAuntieAnnes = "auntie-annes";
export const sourceUrlAuntieAnnes =
  "https://assets.ctfassets.net/zqt8tllj2cy0/2jjVNaTNGDoMGd4QVucpSy/0f94c0d0541ec11a334dba7ce6fc56b0/Auntie-Annes-Nutrition-Guide.pdf";

const repairRoot = `data/restaurant-verification/repairs/${restaurantIdAuntieAnnes}`;
const manifestPath = `${repairRoot}/source-manifest.json`;
const artifactPath =
  "data/restaurant-verification/artifacts/auntie-annes/official-us-nutrition-guide-2025.pdf";
const expectedArtifactHash =
  "b97ecac61de57a815b711d16988f3c4fc7edd397d7dd6dbd2736d24ffbd16a02";
const allergenOrder = [
  "egg",
  "fish",
  "milk",
  "peanut",
  "sesame",
  "shellfish",
  "soy",
  "tree-nut",
  "wheat",
];

export async function buildAuntieAnnesAuditSnapshot({
  retrievedAt = new Date().toISOString(),
} = {}) {
  const [manifest, artifact] = await Promise.all([
    readJson(manifestPath),
    readFile(artifactPath),
  ]);
  const artifactHash = createHash("sha256").update(artifact).digest("hex");
  if (artifactHash !== expectedArtifactHash) {
    throw new Error(
      `Auntie Anne's current guide changed: expected ${expectedArtifactHash}, found ${artifactHash}.`,
    );
  }
  const commonMayContain = orderedAllergens(manifest.commonMayContain);
  const items = manifest.items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    description: null,
    ingredientsText: null,
    isConfigurable: false,
    allergens: orderedAllergens(item.allergens),
    mayContain: [...commonMayContain],
    allergenSourceType: item.allergenSourceType,
    sourceType: item.sourceType,
    sourceUrls: [sourceUrlAuntieAnnes],
    sourceSummary: item.allergenSourceType === "official-allergen-menu"
      ? "The current U.S. restaurant-issued guide supplies a direct allergen-matrix row and separately warns that all food and beverages may contact nine listed allergens. The may-contain warning is not a direct contains claim."
      : "The current U.S. restaurant-issued guide publishes this fountain product in its nutrition table but not its direct-allergen matrix; only the guide's all-food-and-beverage global may-contain warning is represented.",
    evidence: [
      ...(item.allergenSourceType === "official-allergen-menu"
        ? [{
            sourceKind: "restaurant-issued-pdf-allergen-matrix",
            sourceUrl: sourceUrlAuntieAnnes,
            text: `Direct matrix row: ${item.name}; contains ${item.allergens.length > 0 ? item.allergens.join(", ") : "no listed direct allergen"}.`,
          }]
        : [{
            sourceKind: "restaurant-issued-pdf-nutrition-table",
            sourceUrl: sourceUrlAuntieAnnes,
            text: `Current nutrition-table product: ${item.name}; no direct matrix row.`,
          }]),
      {
        sourceKind: "restaurant-issued-global-cross-contact-note",
        sourceUrl: sourceUrlAuntieAnnes,
        text: `All food and beverage products may contain ${commonMayContain.join(", ")} due to cross contact.`,
      },
    ],
  }));
  const sourceTypeCounts = countBy(items, "allergenSourceType");
  const categoryCounts = Object.fromEntries(
    manifest.sectionOrder.map((section) => [
      section.name,
      items.filter((item) => item.category === section.name).length,
    ]),
  );
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((item) => normalize(item.name)).sort().join("\n"))
    .digest("hex");

  assertEqual(items.length, 46, "item count");
  assertEqual(new Set(items.map((item) => item.id)).size, 46, "unique item IDs");
  assertEqual(items.filter((item) => item.allergens.includes("gluten") || item.mayContain.includes("gluten")).length, 0, "unsupported gluten rows");
  assertDeepEqual(sourceTypeCounts, {
    "official-allergen-menu": 39,
    "official-global-cross-contact-note": 7,
  }, "source type counts");
  assertDeepEqual(
    categoryCounts,
    Object.fromEntries(manifest.sectionOrder.map((section) => [section.name, section.count])),
    "category counts",
  );
  if (items.some((item) => JSON.stringify(item.mayContain) !== JSON.stringify(commonMayContain))) {
    throw new Error("Every current Auntie Anne's row must carry the exact global may-contain set.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAuntieAnnes,
    retrievedAt,
    sourceUrls: [sourceUrlAuntieAnnes],
    sourceStats: {
      artifactPath,
      artifactHash,
      byteLength: artifact.length,
      pageCount: 8,
      documentLabel: "03.25 WF 1515085",
    },
    sectionOrder: manifest.sectionOrder.map((section) => section.name),
    categoryCounts,
    itemCount: items.length,
    itemNameFingerprint,
    sourceTypeCounts,
    commonMayContain,
    sourceWarning:
      "The March 2025 U.S. restaurant-issued guide supplies current nutrition rows, a 39-product direct allergen matrix, and a page-one warning that all food and beverage products may contact nine listed allergens. That global warning is applied as may-contain to every current product, including seven fountain rows absent from the matrix. The guide identifies wheat, not gluten; gluten is not inferred. The stale 2016 chart is comparison evidence only.",
    items,
  };
}

function orderedAllergens(values) {
  const found = new Set(values ?? []);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Auntie Anne's ${label}: expected ${expected}, found ${actual}.`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `Auntie Anne's ${label} changed: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`,
    );
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAuntieAnnesAuditSnapshot();
  await mkdir(repairRoot, { recursive: true });
  await writeFile(`${repairRoot}/corrected-menu.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
    categoryCounts: snapshot.categoryCounts,
    sourceTypeCounts: snapshot.sourceTypeCounts,
  }, null, 2));
}
