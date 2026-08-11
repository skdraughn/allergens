import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "cheerio";

export const restaurantIdApapachoTaqueria = "replacement-apapacho-taqueria-washington-dc";
export const retrievedAtApapachoTaqueria = "2026-07-15T07:44:59.987Z";
export const sourceUrlsApapachoTaqueria = Object.freeze({
  home: "https://www.apapachotaqueria.com/",
  menu: "https://www.apapachotaqueria.com/menu",
  order: "https://www.apapachotaqueria.com/s/order",
  products:
    "https://www.apapachotaqueria.com/app/store/api/v28/editor/users/149682741/sites/916428179789760537/products?page=1&per_page=200&include=images,media_files,discounts",
  pdf:
    "https://www.apapachotaqueria.com/uploads/b/7b001730-3593-11ef-a80d-fb22eb17238f/3a960d90-f595-11f0-9cc0-1bb54b8fbc87.pdf",
});

const categoryOrder = new Map([
  ["Starters", 10],
  ["Tacos", 20],
  ["Favorites", 30],
  ["Breakfast Tacos", 40],
  ["Seasonal Specials", 50],
  ["Desserts", 60],
  ["Non-Alcoholic Drinks", 70],
]);

// The owner-issued PDF is the current in-house menu. Square's product endpoint is
// an inventory history, so each API-only addition below must also belong to a live
// order-page category. Expired event, holiday, preorder, and alcohol SKUs are not
// promoted merely because Square still returns them as visible products.
const catalogRows = Object.freeze([
  ["Starters", "Guac 'n' Chips", "Guac 'n' Chips", "Tomatillo, avocado, cilantro, jalapeño, lime", 9.5],
  ["Starters", "Chips", "Chips", "Tortilla chips", 2.5],
  ["Tacos", "Tacos al Pastor", "Tacos al Pastor", null, 4.95],
  ["Tacos", "Tacos de Asada", "Tacos de Asada", null, 4.95],
  ["Tacos", "Tacos de Cochinita", "Tacos de Cochinita", null, 4.95],
  ["Tacos", "Tacos de Carnitas", "Tacos de Carnitas", null, 4.95],
  ["Tacos", "Chicken Milanesa", "Chicken Milanesa", null, 4.95],
  ["Tacos", "Tacos de Baja Shrimp", "Tacos de Baja Shrimp", null, 4.95],
  ["Tacos", "Tacos de Mushrooms", "Tacos de Mushrooms", null, 4.95],
  ["Tacos", "Tacos de Suadero", "Tacos de Suadero", null, 4.95],
  ["Tacos", "Tacos Campechano", "Tacos Campechano", null, 4.95],
  ["Tacos", "Taco de Lengua", "Taco de Lengua", null, 4.95],
  ["Tacos", "Grilled Chicken Taco", "Grilled Chicken taco", null, 4.95, "api-only"],
  ["Favorites", "El Tacote", "El Tacote", null, 15],
  ["Favorites", "Gringa", "Gringa", null, 8],
  ["Favorites", "Fried Corn Quesadilla", "Fried Corn Quesadilla", null, 5],
  ["Favorites", "Chilaquiles", null, "Corn tortilla chips, tomatillo salsa, queso fresco, crema, cilantro", 11],
  ["Favorites", "Kids Quesadilla", "Kids Quesadilla", null, 5],
  ["Breakfast Tacos", "Choripapa Taco", "Choripapa Taco", null, 5.5, "api-only"],
  ["Breakfast Tacos", "El Gringuito Taco", "El Gringuito Taco", null, 5.5, "api-only"],
  ["Breakfast Tacos", "El Poblanito Taco", "El Poblanito Taco", null, 5.5, "api-only"],
  ["Breakfast Tacos", "Revoltillo Taco", "Revoltillo Taco", null, 5.5, "api-only"],
  ["Seasonal Specials", "Tortilla Soup", "Tortilla soup", null, 9],
  ["Seasonal Specials", "Beef Stew with Nopalitos", "Taco Beef stew & Cactus", null, 5.5],
  ["Seasonal Specials", "Flautas", "Flautas", null, 12],
  ["Seasonal Specials", "Red Pozole", "Red Pozole", null, 16],
  ["Desserts", "Arroz con Leche", "Arroz con Leche", null, 7],
  ["Desserts", "Concha", "Concha", null, 5],
  ["Desserts", "Grandma Flan", "Grandma Flan", null, 7],
  ["Desserts", "Oaxacan Chocolate Cookie", "Oaxacan Chocolate cookie", null, 5.75],
  ["Desserts", "Seasonal Popsicle", "Seasonal Popsicle", null, 5, "api-only"],
  ["Non-Alcoholic Drinks", "Café de Olla", "Cafe De Olla", null, 4],
  ["Non-Alcoholic Drinks", "Bottled Water", "Water bottle", null, 3],
  ["Non-Alcoholic Drinks", "Agua Fresca", "Agua Fresca 12oz", null, 4],
  ["Non-Alcoholic Drinks", "Mexican Coke", "Coca Cola", null, 5],
  ["Non-Alcoholic Drinks", "Diet Coke", "Diet Coke", null, 4],
  ["Non-Alcoholic Drinks", "Jarritos", "Jarritos", null, 4],
  ["Non-Alcoholic Drinks", "Sidral Mundet", "Sidral Mundet", null, 4],
  ["Non-Alcoholic Drinks", "Sangria Señorial", "Sangria Señorial", null, 4],
  ["Non-Alcoholic Drinks", "Topo Chico", "Topochico", null, 4],
]);

const apiOnlyCategory = new Map([
  ["Grilled Chicken taco", "Tacos"],
  ["Choripapa Taco", "Breakfast Tacos"],
  ["El Gringuito Taco", "Breakfast Tacos"],
  ["El Poblanito Taco", "Breakfast Tacos"],
  ["Revoltillo Taco", "Breakfast Tacos"],
  ["Seasonal Popsicle", "Desserts"],
]);

const requiredPdfAnchors = Object.freeze([
  "Winter",
  "Guac n´chips",
  "Chicken milanesa",
  "Mushrooms “El Isra”",
  "Fried corn quesadilla",
  "Chilaquiles (11am to 3 pm)",
  "Oax Choco - Cookie",
  "N\\A DRINKS",
  "Mexican soda´s",
]);

export function extractApapachoSquareBootstrap(html) {
  const text = String(html);
  const markerIndex = text.indexOf("window.__BOOTSTRAP_STATE__");
  if (markerIndex < 0) throw new Error("Apapacho Square bootstrap state was not found.");
  const objectStart = text.indexOf("{", markerIndex);
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = objectStart; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      return JSON.parse(text.slice(objectStart, index + 1));
    }
  }
  throw new Error("Apapacho Square bootstrap state was incomplete.");
}

export function buildApapachoTaqueriaAuditSnapshot({
  orderHtml,
  productsResponse,
  pdfText,
  retrievedAt = retrievedAtApapachoTaqueria,
} = {}) {
  for (const anchor of requiredPdfAnchors) {
    if (!String(pdfText).includes(anchor)) {
      throw new Error(`Apapacho current PDF changed: missing reviewed anchor “${anchor}”.`);
    }
  }

  const bootstrap = extractApapachoSquareBootstrap(orderHtml);
  const liveCategories = bootstrap.commerceLinks?.categories ?? {};
  const products = productsResponse?.data ?? [];
  if (products.length !== 80) {
    throw new Error(`Apapacho Square shape changed: expected 80 inventory products, found ${products.length}.`);
  }
  if (Object.keys(liveCategories).length !== 14) {
    throw new Error(
      `Apapacho Square shape changed: expected 14 live category records, found ${Object.keys(liveCategories).length}.`,
    );
  }
  const productsByName = new Map(products.map((product) => [clean(product.name), product]));

  const items = catalogRows.map(([
    category,
    name,
    apiName,
    reviewedDescription,
    reviewedPrice,
    evidenceMode = "pdf-and-api",
  ], index) => {
    const product = apiName ? productsByName.get(apiName) : null;
    if (apiName && !product) throw new Error(`Apapacho API product disappeared: ${apiName}.`);
    if (product && (product.visibility !== "visible" || product.fulfillable === false)) {
      throw new Error(`Apapacho reviewed current product is no longer fulfillable/visible: ${apiName}.`);
    }
    if (evidenceMode === "api-only") {
      const liveCategoryNames = (product.categoryIds ?? [])
        .map((categoryId) => liveCategories[categoryId]?.name)
        .filter(Boolean);
      const expectedCategory = apiOnlyCategory.get(apiName);
      if (!liveCategoryNames.includes(expectedCategory)) {
        throw new Error(
          `Apapacho API-only product ${apiName} is no longer in live category ${expectedCategory}.`,
        );
      }
    }

    const apiDescription = htmlText(product?.short_description);
    const description = apiDescription || reviewedDescription || null;
    const price = product?.price?.low ?? reviewedPrice;
    const productUrl = product?.absolute_site_link ?? null;
    const sourceUrls = unique([
      sourceUrlsApapachoTaqueria.menu,
      evidenceMode === "api-only" ? null : sourceUrlsApapachoTaqueria.pdf,
      productUrl,
    ]);
    const allergens = directAllergensApapachoTaqueria(`${name} ${description ?? ""}`);
    const sourceText = clean([name, description, `$${Number(price).toFixed(2)}`].filter(Boolean).join(" — "));
    const evidence = [];
    if (evidenceMode !== "api-only") {
      evidence.push({
        sourceKind: "restaurant-issued-pdf-menu",
        sourceUrl: sourceUrlsApapachoTaqueria.pdf,
        text: sourceText,
      });
    }
    if (product) {
      evidence.push({
        sourceKind: "restaurant-issued-square-product",
        sourceUrl: productUrl ?? sourceUrlsApapachoTaqueria.products,
        text: clean([product.name, apiDescription].filter(Boolean).join(" — ")) || product.name,
      });
    }
    return {
      auditItemKey: `${index + 1}:${slugify(name)}`,
      id: slugify(name),
      name,
      category,
      description,
      ingredientsText: description,
      price,
      isConfigurable: [
        "Tacos al Pastor",
        "Tacos de Asada",
        "Tacos de Cochinita",
        "Tacos de Carnitas",
        "Chicken Milanesa",
        "Tacos de Baja Shrimp",
        "Tacos de Mushrooms",
        "Tacos de Suadero",
        "Tacos Campechano",
        "Taco de Lengua",
        "Grilled Chicken Taco",
        "Chilaquiles",
      ].includes(name),
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-issued-pdf-and-square-menu",
      sourceUrls,
      sourceSummary: allergens.length > 0
        ? "Positive signals come only from fixed ingredient terms in Apapacho's current owner-issued PDF or Square product text. Optional flour-tortilla and egg/meat additions are not applied to base products. The sources are not a complete allergen matrix or cross-contact disclosure."
        : "Apapacho currently publishes this product, but its owner-issued menu text does not provide enough fixed item-level ingredient or allergen detail for a positive or negative claim.",
      evidence,
      evidenceMode,
      squareProductId: product?.id ?? null,
    };
  });

  if (items.length !== 40 || new Set(items.map((item) => item.id)).size !== 40) {
    throw new Error(`Apapacho canonical shape changed: expected 40 unique items, found ${items.length}.`);
  }
  const categories = unique(items.map((item) => item.category));
  if (categories.length !== 7 || categories.at(-1) !== "Non-Alcoholic Drinks") {
    throw new Error("Apapacho canonical categories changed or beverages are no longer last.");
  }
  if (items.some((item, index) => {
    const next = items[index + 1];
    return next && (categoryOrder.get(item.category) ?? 999) > (categoryOrder.get(next.category) ?? 999);
  })) {
    throw new Error("Apapacho items are not in canonical category order.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdApapachoTaqueria,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsApapachoTaqueria),
    sourceInventoryProductCount: products.length,
    liveSquareCategoryCount: Object.keys(liveCategories).length,
    itemCount: items.length,
    categoryCount: categories.length,
    pdfOnlyItemCount: items.filter((item) => item.squareProductId === null).length,
    apiOnlyCurrentItemCount: items.filter((item) => item.evidenceMode === "api-only").length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    excludedHistoricalInventoryCount: products.length - items.filter((item) => item.squareProductId).length,
    sourceWarning:
      "Apapacho's 80-row Square endpoint is inventory history, not a current-menu list: it retains expired holiday, preorder, one-night event, happy-hour, service-control, and alcohol SKUs. The current owner-issued PDF is the in-house menu authority. Square contributes exact descriptions and only six newer products that are visible, fulfillable, and assigned to a live order-page category. Alcohol and duplicate promotional presentations are excluded. Oyster mushroom is not shellfish; corn masa is not wheat. Missing terms are not negative allergen or cross-contact assurances.",
    items: items.map(({ evidenceMode: _evidenceMode, squareProductId: _squareProductId, ...item }) => item),
  };
}

export function directAllergensApapachoTaqueria(value) {
  const text = normalize(value).replace(/\boyster mushrooms?\b/g, "mushroom");
  const allergens = [];
  const patterns = [
    ["shellfish", /\b(?:shrimp|prawn|crab|lobster|scallop|clam|mussel|octopus)\b/],
    ["fish", /\b(?:fish|tuna|salmon|cod|anchovy)\b/],
    ["milk", /\b(?:milk|leche|chihuahua cheese|queso fresco|cheese|chesse|crema|sour cream)\b/],
    ["egg", /\b(?:egg|eggs|mayo|mayonnaise)\b/],
    ["tree-nut", /\b(?:almond|almonds|pecan|pecans|walnut|walnuts|cashew|cashews|pistachio|pistachios)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
  ];
  for (const [allergen, pattern] of patterns) {
    if (pattern.test(text)) allergens.push(allergen);
  }
  if (/\b(?:flour tortilla|breaded|battered)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function htmlText(value) {
  if (!clean(value)) return null;
  return clean(load(`<div>${value}</div>`)("div").first().text()) || null;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactRoot = path.resolve(
    `data/restaurant-verification/artifacts/${restaurantIdApapachoTaqueria}`,
  );
  const outputPath = path.resolve(
    process.argv[2] ??
      `data/restaurant-verification/repairs/${restaurantIdApapachoTaqueria}/corrected-menu.json`,
  );
  const [orderHtml, productsResponse, pdfText] = await Promise.all([
    readFile(path.join(artifactRoot, "official-apapacho-order-page.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-apapacho-square-products.json"), "utf8").then(JSON.parse),
    readFile(path.join(artifactRoot, "official-apapacho-winter-specials-pdf.txt"), "utf8"),
  ]);
  const snapshot = buildApapachoTaqueriaAuditSnapshot({ orderHtml, productsResponse, pdfText });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
