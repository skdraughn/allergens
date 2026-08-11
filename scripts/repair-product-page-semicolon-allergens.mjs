import { existsSync } from "node:fs";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const repositoryPaths = [
  "src/data/generated/restaurants.generated.json",
  "data/restaurants.generated.json",
];
const reportPath = `data/scraped/audits/product-page-semicolon-allergen-repair-${timestampForFile(
  new Date(),
)}.json`;
const todayIso = new Date().toISOString();

const report = {
  generatedAt: todayIso,
  repositoryPaths,
  changedRestaurants: [],
  changedItems: [],
};
const allergenTerms = [
  { id: "milk", terms: ["milk", "dairy"] },
  { id: "egg", terms: ["egg", "eggs"] },
  { id: "wheat", terms: ["wheat"] },
  { id: "gluten", terms: ["gluten"] },
  { id: "soy", terms: ["soy", "soybean", "soybeans"] },
  { id: "sesame", terms: ["sesame", "sesame seed", "sesame seeds"] },
  { id: "fish", terms: ["fish"] },
  { id: "shellfish", terms: ["shellfish", "crustacean shellfish", "crustaceans"] },
  { id: "peanut", terms: ["peanut", "peanuts"] },
  { id: "tree-nut", terms: ["tree nut", "tree nuts", "almond", "cashew", "pecan", "walnut"] },
];

for (const repositoryPath of repositoryPaths) {
  if (!existsSync(repositoryPath)) {
    continue;
  }

  const repository = JSON.parse(await readFile(repositoryPath, "utf8"));

  for (const restaurant of repository.restaurants ?? []) {
    if (restaurant.id !== "crumbl") {
      continue;
    }

    let changedCount = 0;
    const nextItems = [];

    for (const item of restaurant.items ?? []) {
      const profileUrl = (item.sourceUrls ?? []).find((url) =>
        /^https:\/\/crumblcookies\.com\/profiles\//i.test(url),
      );

      if (!profileUrl || item.allergenSourceType !== "official-product-allergen-section") {
        nextItems.push(item);
        continue;
      }

      const disclosure = await fetchAllergenDisclosure(profileUrl);

      if (!disclosure) {
        nextItems.push(cleanPollutedIngredientText(item));
        continue;
      }

      const { directText, mayContainText } = partitionAllergenDisclosure(disclosure);
      const directAllergens = findAllergensInText(directText);
      const mayContain = findAllergensInText(mayContainText).filter(
        (allergen) => !directAllergens.includes(allergen),
      );
      const cleanedItem = cleanPollutedIngredientText({
        ...item,
        allergens: directAllergens,
        mayContain,
        evidence: [
          ...(item.evidence ?? []).filter((entry) => entry?.sourceKind !== "official-allergen-disclosure"),
          {
            sourceKind: "official-allergen-disclosure",
            sourceUrl: profileUrl,
            text: `Official product allergen disclosure: ${disclosure}`,
          },
        ],
      });

      if (
        allergenSetKey(cleanedItem.allergens) !== allergenSetKey(item.allergens) ||
        allergenSetKey(cleanedItem.mayContain) !== allergenSetKey(item.mayContain) ||
        cleanedItem.ingredientsText !== item.ingredientsText
      ) {
        changedCount += 1;
        report.changedItems.push({
          repositoryPath,
          restaurantId: restaurant.id,
          itemId: item.id,
          name: item.name,
          disclosure,
          allergensBefore: item.allergens ?? [],
          mayContainBefore: item.mayContain ?? [],
          allergensAfter: cleanedItem.allergens,
          mayContainAfter: cleanedItem.mayContain,
        });
      }

      nextItems.push(cleanedItem);
    }

    if (changedCount > 0) {
      restaurant.items = nextItems;
      restaurant.sourceStatus = {
        ...(restaurant.sourceStatus ?? {}),
        productPageSemicolonAllergenRepair: {
          generatedAt: todayIso,
          changedItems: changedCount,
          decision:
            "Official product allergen values that use a semicolon are treated as direct allergens before the semicolon and may-contain/cross-contact after it.",
        },
      };
      report.changedRestaurants.push({
        repositoryPath,
        id: restaurant.id,
        name: restaurant.name,
        changedItems: changedCount,
      });
    }
  }

  repository.generatedAt = todayIso;
  repository.metadata = {
    ...(repository.metadata ?? {}),
    generatedAt: todayIso,
    productPageSemicolonAllergenRepair: {
      generatedAt: todayIso,
      changedRestaurantCount: report.changedRestaurants.filter(
        (entry) => entry.repositoryPath === repositoryPath,
      ).length,
      changedItemCount: report.changedItems.filter((entry) => entry.repositoryPath === repositoryPath).length,
    },
  };

  await writeFile(repositoryPath, `${JSON.stringify(repository, null, 2)}\n`);
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      reportPath,
      changedRestaurantCount: report.changedRestaurants.length,
      changedItemCount: report.changedItems.length,
    },
    null,
    2,
  ),
);

async function fetchAllergenDisclosure(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    return "";
  }

  const html = await response.text();
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const [, rawJson] of scripts) {
    try {
      const parsed = JSON.parse(rawJson.trim());
      const value = findAllergenPropertyValue(parsed);

      if (value) {
        return value;
      }
    } catch {}
  }

  const fallback = html.match(/"name"\s*:\s*"Allergens"\s*,\s*"value"\s*:\s*"([^"]+)"/i);
  return fallback ? decodeJsonString(fallback[1]) : "";
}

function findAllergenPropertyValue(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findAllergenPropertyValue(entry);
      if (found) {
        return found;
      }
    }
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const name = String(value.name ?? value.propertyID ?? value.label ?? "");
  if (/^allergens?$/i.test(name) && value.value) {
    return String(value.value);
  }

  for (const key of ["additionalProperty", "@graph", "hasPart"]) {
    const found = findAllergenPropertyValue(value[key]);
    if (found) {
      return found;
    }
  }

  return "";
}

function partitionAllergenDisclosure(text) {
  const normalized = cleanText(text);

  if (!normalized.includes(";")) {
    return {
      directText: normalized,
      mayContainText: "",
    };
  }

  const [directText, ...mayContainSegments] = normalized.split(";").map(cleanText);
  return {
    directText,
    mayContainText: mayContainSegments.join(" "),
  };
}

function findAllergensInText(text) {
  const normalized = ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const matches = [];

  for (const allergen of allergenTerms) {
    if (
      allergen.terms.some((term) =>
        normalized.includes(` ${term.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `),
      )
    ) {
      matches.push(allergen.id);
    }
  }

  return [...new Set(matches)];
}

function cleanPollutedIngredientText(item) {
  if (
    item.ingredientsText &&
    (item.ingredientsText.length > 1200 || /crumbl_drinks_|download_the_app|__NEXT_DATA__/i.test(item.ingredientsText))
  ) {
    return {
      ...item,
      ingredientsText: null,
    };
  }

  return item;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value;
  }
}

function allergenSetKey(values) {
  return [...new Set(values ?? [])].sort().join("|");
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
