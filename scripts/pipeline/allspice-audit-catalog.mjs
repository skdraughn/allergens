import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAllSpice = "osm-allspice-catering-3397462219";
export const sourceUrlsAllSpice = Object.freeze({
  home: "https://allspicecatering.com/",
  menuIndex: "https://allspicecatering.com/quick-order/a-la-carte-menu/",
  gatherDine: "https://allspicecatering.com/gather-dine-menu/",
  takeout: "https://allspicecatering.com/product-category/takeout-menu/",
  foodApi1: "https://allspicecatering.com/wp-json/wp/v2/food_menu?per_page=100&page=1&orderby=id&order=asc&context=view",
  foodApi2: "https://allspicecatering.com/wp-json/wp/v2/food_menu?per_page=100&page=2&orderby=id&order=asc&context=view",
  foodApi3: "https://allspicecatering.com/wp-json/wp/v2/food_menu?per_page=100&page=3&orderby=id&order=asc&context=view",
  productApi1: "https://allspicecatering.com/wp-json/wp/v2/product?per_page=100&page=1&orderby=id&order=asc&context=view",
  productApi2: "https://allspicecatering.com/wp-json/wp/v2/product?per_page=100&page=2&orderby=id&order=asc&context=view",
  foodCategories: "https://allspicecatering.com/wp-json/wp/v2/food_menu_cat?per_page=100&hide_empty=false",
  productCategories: "https://allspicecatering.com/wp-json/wp/v2/product_cat?per_page=100&hide_empty=false",
  sitemap: "https://allspicecatering.com/sitemap_index.xml",
});

const artifactRoot = `data/restaurant-verification/artifacts/${restaurantIdAllSpice}`;
const foodApiArtifacts = [1, 2, 3].map((page) => `${artifactRoot}/official-food-api-p${page}.json`);
const productApiArtifacts = [1, 2].map((page) => `${artifactRoot}/official-product-api-p${page}.json`);
const categoryArtifact = `${artifactRoot}/official-food-categories.json`;

const sourceUrlForFoodPage = [sourceUrlsAllSpice.foodApi1, sourceUrlsAllSpice.foodApi2, sourceUrlsAllSpice.foodApi3];
const sourceUrlForProductPage = [sourceUrlsAllSpice.productApi1, sourceUrlsAllSpice.productApi2];

const excludedNames = new Set([
  normalize("Set of Disposable Utensils Per Guest"),
  normalize("Crab Mallet"),
  normalize("Gift Certificate"),
]);

const canonicalAliases = new Map([
  [normalize("5 Bags of Chips"), "Bags of Chips"],
  [normalize("5 Bags of Pretzels"), "Bags of Pretzels"],
  [normalize("5 Whole Fruits"), "Whole Fruits"],
]);

const categoryOverrides = new Map([
  [normalize("Maryland Crab Boil"), "Casual Luncheon"],
  [normalize("Sushi"), "Seafood"],
]);

const signalOverrides = new Map([
  [normalize("Mediterranean Sampler"), ["wheat", "gluten"]],
  [normalize("Mini Chicken Quesadillas"), ["milk"]],
  [normalize("The Basic Holiday Dinner"), ["milk", "wheat", "gluten"]],
  [normalize("The Traditional Holiday Dinner"), ["milk", "wheat", "gluten"]],
  [normalize("The Ultimate Crown Roast of Pork Dinner"), ["milk", "tree-nut", "wheat", "gluten"]],
  [normalize("Prime Rib of Beef Dinner"), ["milk", "wheat", "gluten"]],
  [normalize("Sushi"), []],
]);

export async function buildAllSpiceAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const [foodPages, productPages, categoryRows] = await Promise.all([
    Promise.all(foodApiArtifacts.map((file) => readJson(file))),
    Promise.all(productApiArtifacts.map((file) => readJson(file))),
    readJson(categoryArtifact),
  ]);
  const categories = new Map(categoryRows.map((category) => [category.id, category]));
  const itemsByName = new Map();

  for (const [pageIndex, rows] of foodPages.entries()) {
    for (const row of rows) {
      addPresentation(itemsByName, {
        category: categoryForFoodRow(row, categories),
        description: wordpressText(row.excerpt?.rendered || row.content?.rendered),
        modifiedAt: row.modified_gmt ? `${row.modified_gmt}Z` : row.modified,
        sourceId: row.id,
        sourceName: wordpressText(row.title?.rendered),
        sourceType: "restaurant-issued-wordpress-menu-api",
        sourceUrl: sourceUrlForFoodPage[pageIndex],
      });
    }
  }

  for (const [pageIndex, rows] of productPages.entries()) {
    for (const row of rows) {
      addPresentation(itemsByName, {
        category: categoryOverrides.get(normalize(wordpressText(row.title?.rendered))) ?? "Online Menu",
        description: wordpressText(row.excerpt?.rendered || row.content?.rendered),
        modifiedAt: row.modified_gmt ? `${row.modified_gmt}Z` : row.modified,
        sourceId: row.id,
        sourceName: wordpressText(row.title?.rendered),
        sourceType: "restaurant-issued-woocommerce-product-api",
        sourceUrl: sourceUrlForProductPage[pageIndex],
      });
    }
  }

  const items = [...itemsByName.values()]
    .map((item, index) => finalizeItem(item, index))
    .sort((left, right) => left.auditOrder - right.auditOrder)
    .map(({ auditOrder: _auditOrder, ...item }) => item);
  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((item) => normalize(item.name)).sort().join("\n"))
    .digest("hex");

  if (items.length !== 209 || presentationCount !== 396 || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`AllSpice current manifest changed: ${items.length} formulations and ${presentationCount} presentations.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAllSpice,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAllSpice),
    presentationCount,
    itemCount: items.length,
    itemNameFingerprint,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "AllSpice publishes a restaurant-issued WordPress menu catalog and overlapping WooCommerce ordering catalog, but no complete recipe-level allergen matrix or item-level cross-contact disclosure. Positive signals are limited to fixed published ingredients and unavoidable named formats. Configurable alternatives, general vegetarian/gluten-free labels, absent recipes, and unknown dressing or preparation details are not converted into negative or cross-contact claims; unsupported rows remain unavailable.",
    items,
  };
}

function addPresentation(itemsByName, presentation) {
  if (!presentation.sourceName || excludedNames.has(normalize(presentation.sourceName))) return;
  const canonicalName = canonicalAliases.get(normalize(presentation.sourceName)) ?? presentation.sourceName;
  const key = normalize(canonicalName);
  let item = itemsByName.get(key);
  if (!item) {
    item = {
      auditOrder: itemsByName.size,
      aliases: [],
      category: presentation.category,
      description: presentation.description || null,
      name: canonicalName,
      presentations: [],
      sourceTypes: new Set(),
      sourceUrls: new Set(),
    };
    itemsByName.set(key, item);
  }
  if (presentation.description && (!item.description || presentation.description.length > item.description.length)) {
    item.description = presentation.description;
  }
  if (
    normalize(presentation.sourceName) !== normalize(item.name) &&
    !item.aliases.some((alias) => normalize(alias) === normalize(presentation.sourceName))
  ) {
    item.aliases.push(presentation.sourceName);
  }
  item.presentations.push({
    category: presentation.category,
    description: presentation.description || null,
    modifiedAt: presentation.modifiedAt || null,
    sourceId: presentation.sourceId,
    sourceName: presentation.sourceName,
    sourceUrls: [presentation.sourceUrl],
  });
  item.sourceTypes.add(presentation.sourceType);
  item.sourceUrls.add(presentation.sourceUrl);
}

function finalizeItem(item, index) {
  const allergens = reviewedSignalsAllSpice(item);
  const sourceTypes = [...item.sourceTypes];
  return {
    auditItemKey: `${index + 1}:${slugify(item.name)}`,
    auditOrder: item.auditOrder,
    id: slugify(item.name),
    name: item.name,
    category: item.category,
    description: item.description,
    ingredientsText: item.description,
    imageUrl: null,
    isConfigurable: isConfigurable(item),
    aliases: item.aliases,
    presentations: item.presentations,
    sourceUrls: [...item.sourceUrls],
    sourceType: sourceTypes.length > 1 ? "restaurant-issued-wordpress-and-woocommerce-menu" : sourceTypes[0],
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
  };
}

export function reviewedSignalsAllSpice(item) {
  const override = signalOverrides.get(normalize(item.name));
  if (override) return orderedAllergens(override);
  const text = normalize([
    item.name,
    ...item.presentations.flatMap((presentation) => [presentation.sourceName, presentation.description]),
  ].join(" "));
  const signals = [];

  if (/\b(?:milk|butter|buttered|buttery|cream|creamy|crema|custard|yogurt|cheeses?|cheddar|brie|feta|parmesan|provolone|swiss|pepperjack|mozzarella|chevre|fontina|bleu cheese|blue cheese|caprese|mac n cheese|cheesecakes?|spanakopita)\b/.test(text)) signals.push("milk");
  if (/\b(?:eggs?|custard|quiche|frittata|deviled)\b/.test(text)) signals.push("egg");
  if (/\bpeanuts?\b/.test(text)) signals.push("peanut");
  if (/\b(?:almonds?|walnuts?|pecans?|hazelnuts?|pistachios?|macadamias?|fruit and nut breads?|nut breads?)\b/.test(text)) signals.push("tree-nut");
  if (/\b(?:bagels?|bakery|baguette|biscuits?|bread|breaded|brownies?|bruschetta|challah|cheesesteak|cookies?|couscous|crackers?|croissants?|crostini|croutons?|french toast|hoagie|linguine|mac n cheese|muffins?|noodles?|orzo|pasta|pastry|pastries|penne|phyllo|pita|pretzels?|puffs?|rolls?|sandwiches?|spanakopita|stuffing|sub bar|tabbouleh|tortellini|wellingtons?|wraps?)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:bakery|desserts?|sweet temptations|sweets?)\b/.test(normalize(item.category)) && /\bcakes?\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:salmon|tuna)\b/.test(text)) signals.push("fish");
  if (/\b(?:shrimp|crab)\b/.test(text)) signals.push("shellfish");
  if (/\b(?:tofu|edamame|hoisin)\b/.test(text)) signals.push("soy");
  if (/\b(?:sesame|tahini)\b/.test(text)) signals.push("sesame");
  if (/\b(?:mustard|dijon)\b/.test(text)) signals.push("mustard");
  return orderedAllergens(signals);
}

function isConfigurable(item) {
  const text = normalize(item.presentations.map((presentation) => presentation.description).join(" "));
  return /\b(?:assorted|choice of|menu options|specify choice|which may include|your choice|we ll call you)\b/.test(text);
}

function categoryForFoodRow(row, categories) {
  const candidates = (row.food_menu_cat ?? []).map((id, index) => ({
    category: categories.get(id),
    depth: categoryDepth(id, categories),
    index,
  })).filter((candidate) => candidate.category);
  candidates.sort((left, right) => right.depth - left.depth || left.index - right.index);
  return wordpressText(candidates[0]?.category?.name) || "Online Menu";
}

function categoryDepth(id, categories) {
  let depth = 0;
  let current = categories.get(id);
  const seen = new Set();
  while (current?.parent && !seen.has(current.parent)) {
    seen.add(current.parent);
    depth += 1;
    current = categories.get(current.parent);
  }
  return depth;
}

function wordpressText(value) {
  const text = collapseAdjacentRepeatedTokenRuns(
    cheerio.load(`<div>${value ?? ""}</div>`)("div").text().replace(/\s+/g, " ").trim(),
  );
  const tokens = text.split(" ");
  for (const repeat of [4, 3, 2]) {
    if (tokens.length % repeat !== 0) continue;
    const length = tokens.length / repeat;
    const first = tokens.slice(0, length).join(" ");
    if (Array.from({ length: repeat }, (_unused, index) => tokens.slice(index * length, (index + 1) * length).join(" ")).every((part) => part === first)) {
      return first;
    }
  }
  return text;
}

function collapseAdjacentRepeatedTokenRuns(value) {
  const tokens = String(value ?? "").split(/\s+/).filter(Boolean);
  const comparable = tokens.map((token) => normalize(token));

  while (tokens.length >= 6) {
    let best = null;
    for (let start = 0; start <= tokens.length - 6; start += 1) {
      const maxLength = Math.floor((tokens.length - start) / 2);
      for (let length = 3; length <= maxLength; length += 1) {
        let copies = 1;
        while (
          start + (copies + 1) * length <= tokens.length &&
          comparable.slice(start, start + length).every((token, index) =>
            token === comparable[start + copies * length + index])
        ) {
          copies += 1;
        }
        if (copies < 2) continue;
        const removed = (copies - 1) * length;
        if (!best || removed > best.removed || (removed === best.removed && length > best.length)) {
          best = { start, length, copies, removed };
        }
      }
    }
    if (!best) break;
    tokens.splice(best.start + best.length, best.removed);
    comparable.splice(best.start + best.length, best.removed);
  }

  return tokens.join(" ");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&amp;/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAllSpiceAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAllSpice}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
