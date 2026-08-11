import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const twoAmysSourceUrls = Object.freeze({
  officialHome: "https://2amyspizza.com/",
  squareHome: "https://2amyspizza.square.site/",
  squareProducts:
    "https://2amyspizza.square.site/app/store/api/v28/editor/users/132346824/sites/403859514888875166/products",
});

export const twoAmysAuditRetrievedAt = "2026-07-14T18:02:50.256Z";

const categoryNames = new Map([
  ["little things", "Small Plates"],
  ["wine bar goodies", "Wine Bar Food"],
  ["salads", "Salads"],
  ["sides", "Sides"],
  ["pizze", "Pizza"],
  ["stuffed pizze (these cannot be sliced)", "Stuffed Pizza"],
  ["sweets", "Desserts"],
  ["bubbles (all alcoholic beverage purchases must be accompanied by a food purchase)", "Sparkling Wine"],
  ["white wine (all alcoholic beverage purchases must be accompanied by a food purchase)", "White Wine"],
  ["red wine (all alcoholic beverage purchases must be accompanied by a food purchase)", "Red Wine"],
  ["beer & (all alcoholic beverage purchases must be accompanied by a food purchase)", "Beer & Cider"],
]);

const categoryOrder = new Map([
  ["Small Plates", 10],
  ["Wine Bar Food", 20],
  ["Salads", 30],
  ["Pizza", 40],
  ["Stuffed Pizza", 50],
  ["Sides", 60],
  ["Desserts", 70],
  ["Sparkling Wine", 80],
  ["White Wine", 81],
  ["Red Wine", 82],
  ["Beer & Cider", 83],
]);

export function extractTwoAmysBootstrap(html) {
  const marker = "window.__BOOTSTRAP_STATE__";
  const markerIndex = String(html).indexOf(marker);
  if (markerIndex < 0) throw new Error("Square bootstrap state was not found.");
  const objectStart = html.indexOf("{", markerIndex);
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = objectStart; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      return JSON.parse(html.slice(objectStart, index + 1));
    }
  }
  throw new Error("Square bootstrap state was incomplete.");
}

export function buildTwoAmysAuditSnapshot({
  squareHtml,
  productPages,
  retrievedAt = new Date().toISOString(),
} = {}) {
  const bootstrap = extractTwoAmysBootstrap(squareHtml);
  const liveCategories = bootstrap.commerceLinks?.categories ?? {};
  const products = productPages.flatMap((page) => page.data ?? []);
  const seenProducts = new Set();
  const items = [];

  for (const product of products) {
    if (seenProducts.has(product.id)) continue;
    seenProducts.add(product.id);
    if (product.visibility !== "visible" || product.fulfillable === false) continue;

    const liveCategoryNames = (product.categoryIds ?? [])
      .map((categoryId) => liveCategories[categoryId]?.name)
      .filter(Boolean);
    const mappedCategories = liveCategoryNames.map((name) => categoryNames.get(name)).filter(Boolean);
    if (mappedCategories.length === 0) continue;

    const category = mappedCategories.sort(
      (left, right) => (categoryOrder.get(left) ?? 999) - (categoryOrder.get(right) ?? 999),
    )[0];
    const name = cleanSpace(product.name);
    const description = htmlText(product.short_description);
    const evidenceText = `${name} ${description ?? ""}`;
    const mayContain = /may contain nuts?/i.test(evidenceText) ? ["tree-nut"] : [];
    const allergens = directAllergens(evidenceText.replace(/may contain nuts?/gi, ""));
    items.push({
      auditItemKey: String(product.id),
      id: slugify(name),
      productId: String(product.id),
      name,
      category,
      description,
      ingredientsText: description,
      sourceUrls: [product.absolute_site_link ?? twoAmysSourceUrls.squareHome],
      sourceType: "square-online-api",
      allergens,
      mayContain,
      allergenSourceType: allergens.length > 0 || mayContain.length > 0
        ? "official-ingredients"
        : "unavailable",
      availability: product.inventory?.all_variations_sold_out ? "sold_out" : "available",
      updatedAt: product.updated_date ?? null,
    });
  }

  items.sort((left, right) => {
    const categoryDifference =
      (categoryOrder.get(left.category) ?? 999) - (categoryOrder.get(right.category) ?? 999);
    if (categoryDifference !== 0) return categoryDifference;
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return {
    schemaVersion: 1,
    restaurantId: "2-amys-washington-dc-dc-metro",
    retrievedAt,
    sourceUrls: Object.values(twoAmysSourceUrls),
    sourceProductCount: products.length,
    currentSquareCategoryCount: Object.keys(liveCategories).length,
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "The restaurant does not publish a complete allergen matrix. Signals come only from explicit terms in current restaurant-linked Square item titles and descriptions; all other allergens and cross-contact status remain unavailable.",
    items,
  };
}

export function directAllergensTwoAmys(value) {
  return directAllergens(value);
}

function directAllergens(value) {
  const text = ` ${String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/dairy cow/g, "cow")
    .replace(/coconut (?:milk|cream)/g, "coconut")} `;
  const patterns = [
    ["shellfish", /\b(?:cockle|cockles|clam|clams|mussel|mussels|oyster|oysters|shrimp|prawn|crab|lobster|scallop|squid)\b/],
    ["milk", /\b(?:milk|mozzarella|grana|fontina|ricotta|pecorino|cheese|cream|butter|ice cream)\b/],
    ["egg", /\b(?:egg|eggs|aioli)\b/],
    ["fish", /\b(?:anchovy|anchovies|cod|fish|tuna|salmon|sardine|sardines)\b/],
    ["tree-nut", /\b(?:pine nut|pine nuts|almond|almonds|pistachio|pistachios|walnut|walnuts|pecan|pecans|cashew|cashews|hazelnut|hazelnuts)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["soy", /\b(?:soy|tofu|miso|tamari)\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["mustard", /\bmustard\b/],
  ];
  const allergens = patterns.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
  if (/\b(?:bread|breaded|crouton|croutons|durum|wheat|flour)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function htmlText(value) {
  if (!cleanSpace(value)) return null;
  return cleanSpace(cheerio.load(`<div>${value}</div>`)("div").first().text());
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function cleanSpace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactRoot = path.resolve(
    "data/restaurant-verification/artifacts/2-amys-washington-dc-dc-metro",
  );
  const outputPath = path.resolve(
    process.argv[2] ??
      "data/restaurant-verification/repairs/2-amys-washington-dc-dc-metro/corrected-menu.json",
  );
  const squareHtml = await readFile(path.join(artifactRoot, "linked-square-home.html"), "utf8");
  const productPages = await Promise.all(
    Array.from({ length: 6 }, async (_value, index) => {
      const page = index + 1;
      const filename = page === 1
        ? "linked-square-products.json"
        : `linked-square-products-page-${page}.json`;
      return JSON.parse(await readFile(path.join(artifactRoot, filename), "utf8"));
    }),
  );
  const snapshot = buildTwoAmysAuditSnapshot({
    squareHtml,
    productPages,
    retrievedAt: twoAmysAuditRetrievedAt,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
