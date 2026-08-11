import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const restaurantIdArtAndSoul = "art-and-soul-dc";
const menuIndexUrl = "https://www.artandsouldc.com/menus";

const sourceContracts = [
  {
    key: "allDay",
    label: "All Day",
    sourceUrl: "https://www.artandsouldc.com/alldaymenu",
    artifactPath:
      "data/restaurant-verification/artifacts/art-and-soul-dc/official-art-and-soul-all-day.html",
    sha256: "68c50f7c910edb645e2aefc20b371d229be717cb6cc0ca07cc6c48473be87ffb",
    expectedRawItemCount: 28,
    expectedProductCount: 27,
  },
  {
    key: "brunch",
    label: "Brunch",
    sourceUrl: "https://www.artandsouldc.com/brunch",
    artifactPath:
      "data/restaurant-verification/artifacts/art-and-soul-dc/official-art-and-soul-brunch.html",
    sha256: "554eae86fd62ca8e8b4ffaae28ac1d89a23450c5736367189475f504127a4710",
    expectedRawItemCount: 31,
    expectedProductCount: 29,
  },
  {
    key: "breakfast",
    label: "Breakfast",
    sourceUrl: "https://www.artandsouldc.com/breakfast",
    artifactPath:
      "data/restaurant-verification/artifacts/art-and-soul-dc/official-art-and-soul-breakfast.html",
    sha256: "01a7c49348c88e7aebf0bdeb74225b86dec75dab78fbb8e0e189999dd6fa7740",
    expectedRawItemCount: 3,
    expectedProductCount: 1,
  },
];

const nonProductTitles = new Set(["add ons", "additions", "each"]);
const sharedFormulations = new Map([
  ["classic caesar salad", "caesar-salad"],
  ["caesar salad", "caesar-salad"],
  ["chopped wedge salad", "wedge-salad"],
  ["wedge salad", "wedge-salad"],
  ["mac & cheese", "mac-and-cheese"],
]);

export async function buildArtAndSoulAuditSnapshot({
  retrievedAt = new Date().toISOString(),
} = {}) {
  const parsed = [];
  const sourceStats = [];

  for (const contract of sourceContracts) {
    const buffer = await readFile(path.resolve(contract.artifactPath));
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== contract.sha256) {
      throw new Error(
        `${contract.label} artifact hash changed: expected ${contract.sha256}, got ${actualSha256}.`,
      );
    }

    const sourceResult = contract.key === "breakfast"
      ? parseBreakfastBuffet(buffer.toString("utf8"), contract)
      : parseServiceMenu(buffer.toString("utf8"), contract);
    if (
      sourceResult.rawItemCount !== contract.expectedRawItemCount ||
      sourceResult.items.length !== contract.expectedProductCount
    ) {
      throw new Error(
        `${contract.label} source boundary changed: ${sourceResult.rawItemCount} raw / ${sourceResult.items.length} products.`,
      );
    }
    parsed.push(...sourceResult.items);
    sourceStats.push({
      key: contract.key,
      label: contract.label,
      sourceUrl: contract.sourceUrl,
      artifactPath: contract.artifactPath,
      sha256: actualSha256,
      rawItemCount: sourceResult.rawItemCount,
      productCount: sourceResult.items.length,
      discardedRowCount: sourceResult.discardedRows.length,
      discardedRows: sourceResult.discardedRows,
    });
  }

  const items = consolidateSharedFormulations(parsed);
  if (items.length !== 54) {
    throw new Error(`Art and Soul canonical catalog changed: expected 54 products, got ${items.length}.`);
  }

  const officialIngredientCount = items.filter(
    (item) => item.allergenSourceType === "official-ingredients",
  ).length;

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdArtAndSoul,
    retrievedAt,
    sourceUrls: [...sourceContracts.map((source) => source.sourceUrl), menuIndexUrl],
    sourceStats,
    presentationCount: parsed.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount,
    unavailableAllergenCount: items.length - officialIngredientCount,
    consolidatedPresentationCount: parsed.length - items.length,
    items,
  };
}

function parseServiceMenu(html, contract) {
  const $ = cheerio.load(html);
  const items = [];
  const discardedRows = [];
  const rawItemCount = $(".menu-section .menu-item").length;

  $(".menu-section").each((_sectionIndex, section) => {
    const sectionName = clean($(section).find(".menu-section-title").first().text());
    $(section).find(".menu-item").each((_itemIndex, element) => {
      const rawTitle = clean($(element).find(".menu-item-title").first().text());
      const normalizedTitle = normalizeName(stripPrice(rawTitle));
      const description = clean($(element).find(".menu-item-description").first().text());

      if (!normalizedTitle || nonProductTitles.has(normalizedTitle)) {
        discardedRows.push({
          name: rawTitle,
          reason: "modifier-or-price-heading",
        });
        return;
      }

      const name = displayName(stripPrice(rawTitle));
      const directText = clean(`${name}. ${description ?? ""}`);
      const allergens = classifyExplicitMenuAllergens(directText);
      items.push({
        id: slugify(`${name}-${contract.label}`),
        name,
        category: `${contract.label} · ${displayName(sectionName)}`,
        description,
        ingredientsText: description,
        isConfigurable: false,
        allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
        allergens,
        mayContain: [],
        sourceType: "restaurant-issued-menu-text",
        sourceUrls: [contract.sourceUrl],
        sourceSummary: allergens.length > 0
          ? "Direct ingredient or formulation terms from Art and Soul's current menu text support these positive allergen signals. The menu is not a complete allergen matrix and does not establish absence or cross-contact safety."
          : "Art and Soul's current menu does not publish enough item-level ingredient or allergen detail for a fixed allergen claim. No absence or cross-contact claim is made.",
        evidence: [
          {
            sourceKind: "restaurant-issued-menu-text",
            sourceUrl: contract.sourceUrl,
            text: directText,
          },
        ],
        variantGroup: contract.label,
      });
    });
  });

  return { rawItemCount, discardedRows, items };
}

function parseBreakfastBuffet(html, contract) {
  const $ = cheerio.load(html);
  const rawItems = $(".menu-section .menu-item");
  const components = [];

  rawItems.each((_index, element) => {
    for (const selector of [
      ".menu-item-price-top",
      ".menu-item-title",
      ".menu-item-description",
    ]) {
      const value = clean($(element).find(selector).first().text());
      if (value) components.push(value);
    }
    $(element).find(".menu-item-option").each((_optionIndex, option) => {
      const value = clean($(option).text());
      if (value) components.push(value);
    });
  });

  const description = clean(
    "Adult $28; Kids 12 and under $12; Continental $22. Items are subject to availability. " +
      components.join("; "),
  );
  const allergens = classifyExplicitMenuAllergens(description);
  return {
    rawItemCount: rawItems.length,
    discardedRows: [
      { name: "HOT ITEMS", reason: "buffet-component-heading" },
      { name: "BAKED ITEMS", reason: "buffet-component-heading" },
      { name: "COLD ITEMS", reason: "buffet-component-heading" },
    ],
    items: [
      {
        id: "breakfast-buffet",
        name: "Breakfast Buffet",
        category: "Breakfast · Buffet",
        description,
        ingredientsText: description,
        isConfigurable: true,
        allergenSourceType: "official-ingredients",
        allergens,
        mayContain: [],
        sourceType: "restaurant-issued-menu-text",
        sourceUrls: [contract.sourceUrl],
        sourceSummary:
          "The current breakfast page publishes one configurable buffet with named components containing egg, milk, and wheat/gluten signals. It is not a complete allergen matrix, and individual buffet availability and cross-contact remain unspecified.",
        evidence: [
          {
            sourceKind: "restaurant-issued-menu-text",
            sourceUrl: contract.sourceUrl,
            text: description,
          },
        ],
        variantGroup: "Breakfast",
      },
    ],
  };
}

function consolidateSharedFormulations(items) {
  const consolidated = [];
  const bySharedKey = new Map();

  for (const item of items) {
    const sharedKey = sharedFormulations.get(normalizeName(item.name));
    if (!sharedKey) {
      consolidated.push(item);
      continue;
    }

    const existing = bySharedKey.get(sharedKey);
    if (!existing) {
      const canonical = {
        ...item,
        id: sharedKey,
        name: sharedKey === "caesar-salad"
          ? "Caesar Salad"
          : sharedKey === "wedge-salad"
            ? "Wedge Salad"
            : "Mac & Cheese",
        category: sharedKey === "mac-and-cheese"
          ? "All Day / Brunch · Sides"
          : "All Day / Brunch · Salads",
        sourceUrls: [...item.sourceUrls],
        evidence: [...item.evidence],
        variantGroup: "All Day / Brunch",
      };
      bySharedKey.set(sharedKey, canonical);
      consolidated.push(canonical);
      continue;
    }

    existing.sourceUrls = [...new Set([...existing.sourceUrls, ...item.sourceUrls])];
    existing.evidence.push(...item.evidence);
    existing.allergens = [...new Set([...existing.allergens, ...item.allergens])].sort();
    if (existing.allergens.length > 0) existing.allergenSourceType = "official-ingredients";
  }

  return consolidated;
}

export function classifyExplicitMenuAllergens(value) {
  const text = String(value ?? "");
  const patterns = [
    ["shellfish", /\b(?:crab|crabcakes?|shrimp|prawn|lobster|scallop|mussel|oyster)s?\b/i],
    ["fish", /\b(?:salmon|tuna|cod|haddock|trout|tilapia|anchov(?:y|ies))\b/i],
    ["milk", /\b(?:milk|butter|buttermilk|cream|cheese|cheddar|parmesan|ricotta|yogurt|creme fraiche)\b/i],
    ["egg", /\b(?:eggs?|mayo|mayonnaise|aioli|hollandaise|b[ée]arnaise)\b/i],
    ["wheat", /\b(?:bread|sourdough|brioche|croutons?|biscuits?|bucatini|eggrolls?|toast|bagels?)\b/i],
    ["gluten", /\b(?:bread|sourdough|brioche|croutons?|biscuits?|bucatini|eggrolls?|toast|bagels?)\b/i],
    ["peanut", /\bpeanuts?\b/i],
    ["tree-nut", /\b(?:almonds?|cashews?|pistachios?|walnuts?|pecans?|hazelnuts?|macadamias?)\b/i],
    ["soy", /\b(?:soy|tofu|miso|tamari)\b/i],
    ["sesame", /\b(?:sesame|tahini)\b/i],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([allergen]) => allergen);
}

function stripPrice(value) {
  return clean(value)?.replace(/\s*\|\s*\$?\d+(?:\.\d+)?(?:\s*each)?\s*$/i, "").trim();
}

function clean(value) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result || null;
}

function normalizeName(value) {
  return clean(value)
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeName(value)?.replace(/&/g, "and").replace(/\s+/g, "-") ?? "item";
}

function displayName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bBlt\b/g, "BLT")
    .replace(/\bOz\b/g, "oz")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOf\b/g, "of")
    .replace(/\bThe\b/g, "the")
    .replace(/^./, (character) => character.toUpperCase());
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildArtAndSoulAuditSnapshot();
  const outputDir = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdArtAndSoul}`,
  );
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "corrected-menu.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        presentationCount: snapshot.presentationCount,
        itemCount: snapshot.itemCount,
        categoryCount: snapshot.categoryCount,
        officialIngredientCount: snapshot.officialIngredientCount,
        unavailableAllergenCount: snapshot.unavailableAllergenCount,
      },
      null,
      2,
    ),
  );
}
