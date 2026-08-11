import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const arepaZoneRestaurantId = "arepa-zone-dc";
export const arepaZoneAllergenGuideUrl = "https://cdn.shopify.com/s/files/1/0901/7707/7557/files/Nutrition_and_Allergens_Arepa_Zone_Mosaico_1.pdf?v=1731433077";
export const arepaZoneAllergenPageUrl = "https://www.arepazone.com/pages/nutrition-allergens";
export const arepaZoneShopifyProductsUrl = "https://www.arepazone.com/collections/all/products.json?limit=250";

export const arepaZoneLocationSources = Object.freeze([
  ["Mosaico", "1NWVXYZV0RNE2", "arepa-zone-mosaico-products-api.json"],
  ["14th Street", "ZTXDA8K0T1H3K", "arepa-zone-14th-street-products-api.json"],
  ["Western Market", "L1K6K5QCF3JEY", "arepa-zone-western-market-products-api.json"],
]);

const apiBase = "https://order.arepazone.com/api/stores/869ecfeb-ca29-4710-93e9-45f873671acf/products";
const facilityAllergens = Object.freeze(["milk", "egg", "wheat", "gluten"]);

const matrixRows = new Map([
  ...section("Arepas", [
    ["Carne Mechada", []], ["Pelúa", ["milk"]], ["Canosa", ["milk"]],
    ["Pabellón", ["milk"]], ["Pollo Mechado", []], ["Reina Pepiada", ["egg"]],
    ["Catira", ["milk"]], ["Sifrina", ["milk", "egg"]], ["Jamón y Queso", ["milk"]],
    ["Capresa con Jamón", ["milk"]], ["Pernil", ["milk"]], ["Queso Rellado", ["milk"]],
    ["Dominó", ["milk"]], ["Albina", ["milk"]], ["Capresa Vegetariana", ["milk"]],
    ["Vegana", []],
  ]),
  ...section("Sides", [
    ["Shredded Beef", []], ["Shredded Chicken", []], ["Roasted Pork", []],
    ["Reina Pepiada", ["egg"]], ["Basmati Rice", []], ["Sweet Plantains", []],
    ["Salsa de Ajo", ["egg"]], ["Salsa de Guayaba", []], ["Salsa Picante", ["egg"]],
  ]),
  ...section("Pepitos", [["Pepito Mosaico", ["milk", "wheat"]], ["Pepito Fondue", ["milk", "wheat"]]]),
  ...section("Perros Calientes", [["Perro Caraqueño", ["milk", "egg", "wheat"]], ["Perro Colombiano", ["milk", "egg", "wheat"]]]),
  ...section("Empanadas", [
    ["Queso", ["milk", "wheat"]], ["Carne Mechada", ["wheat", "soy"]],
    ["Carne Molda", ["wheat", "soy"]], ["Pollo Mechado", ["wheat", "soy"]],
    ["Pabellón", ["milk", "wheat", "soy"]], ["Cazón", ["fish", "wheat", "soy"]],
    ["Mariscos", ["egg", "shellfish", "wheat", "soy"]],
    ["Camarón", ["egg", "shellfish", "wheat", "soy"]],
    ["Dominó", ["milk", "wheat", "soy"]], ["Jamón y Queso", ["milk", "wheat"]],
  ]),
  ...section("Appetizers", [
    ["Tequeños", ["milk", "egg", "wheat", "soy"]],
    ["Tequeños de Chocolate", ["milk", "egg", "wheat", "soy"]],
    ["Yucca Fritters", ["milk"]], ["Mandocas", ["milk", "soy"]],
    ["Golfeados", ["milk", "egg", "wheat"]],
  ]),
  ...section("Cachapas", [
    ["Clásica", ["milk", "wheat"]], ["Washingtonian", ["milk", "wheat"]],
    ["Primera Dama", ["milk", "wheat"]], ["Presidencial", ["milk", "wheat"]],
    ["American Dream", ["milk", "wheat"]], ["Full House", ["milk", "wheat"]],
  ]),
  ...section("Patacón", [
    ["Beef", ["milk", "egg"]], ["Chicken", ["milk", "egg"]],
    ["Pork", ["milk", "egg"]], ["Veggie", ["milk", "egg"]],
  ]),
  ...section("Pastelitos", [
    ["Queso", ["milk", "egg", "wheat"]], ["Papa con Queso", ["milk", "egg", "wheat"]],
    ["Carne Molida", ["milk", "egg", "wheat", "soy"]],
    ["Pizza", ["milk", "egg", "wheat"]], ["Pollo", ["milk", "egg", "wheat", "soy"]],
  ]),
  ...section("Items Viudos", [
    ["Arepa Viuda", ["wheat"]], ["Cachapa Viuda", ["milk", "wheat", "soy"]],
    ["Patacón Viudo", ["wheat", "soy"]],
  ]),
  ...section("Desserts", [
    ["Tres Leches", ["milk", "egg", "wheat"]], ["Quesillo", ["milk", "egg"]],
    ["Marquesa de Chocolate", ["milk", "egg", "wheat"]],
    ["Marquesa de Parchita", ["wheat"]], ["Pie de Limón", ["milk", "egg", "wheat"]],
    ["Pie de Parchita", ["milk", "egg", "wheat"]],
  ]),
  ...section("Bakery", [
    ["Cachitos", ["milk", "egg", "wheat", "soy"]],
    ["Pan Piñitas", ["milk", "egg", "wheat", "soy"]], ["Pan de Guyaba", ["milk"]],
  ]),
]);

const currentToMatrixKey = Object.freeze({
  "Sifrina Arepa": "Arepas::Sifrina",
  "Canosa Arepa": "Arepas::Canosa",
  "Pollo Mechado Arepa": "Arepas::Pollo Mechado",
  "Pernil Arepa": "Arepas::Pernil",
  "Carne Mechada Arepa": "Arepas::Carne Mechada",
  "Pabellón Arepa": "Arepas::Pabellón",
  "Dominó Arepa": "Arepas::Dominó",
  "Catira Arepa": "Arepas::Catira",
  "Reina Pepiada Arepa": "Arepas::Reina Pepiada",
  "Vegana Arepa": "Arepas::Vegana",
  "Pelua Arepa": "Arepas::Pelúa",
  "Viuda Arepa": "Items Viudos::Arepa Viuda",
  "Queso Rallado Arepa": "Arepas::Queso Rellado",
  "Capresa Arepa": "Arepas::Capresa con Jamón",
  "Jamón y Queso Arepa": "Arepas::Jamón y Queso",
  "Tequeños de Queso": "Appetizers::Tequeños",
  "Tequeños Tray": "Appetizers::Tequeños",
  "Pepito Fondue": "Pepitos::Pepito Fondue",
  "Pepito Mosaico": "Pepitos::Pepito Mosaico",
  "Cachitos de Jamón Horneado": "Bakery::Cachitos",
  "Salsa de Ajo": "Sides::Salsa de Ajo",
  "Salsa Picante": "Sides::Salsa Picante",
  "Clásica Cachapa": "Cachapas::Clásica",
  "Full House Cachapa": "Cachapas::Full House",
  "American Dream Cachapa": "Cachapas::American Dream",
  "Primera Dama Cachapa": "Cachapas::Primera Dama",
  "Presidencial Cachapa": "Cachapas::Presidencial",
  "Washingtonian Cachapa": "Cachapas::Washingtonian",
  Patacón: "Patacón::*",
  "Carne Mechada Empanada": "Empanadas::Carne Mechada",
  "Pabellón Empanada": "Empanadas::Pabellón",
  "Pollo Empanada": "Empanadas::Pollo Mechado",
  "Tres Leches": "Desserts::Tres Leches",
  "Marquesa de Parchita": "Desserts::Marquesa de Parchita",
});

const currentToShopifyTitle = Object.freeze({
  "Sifrina Arepa": "Sifrina Arepa", "Canosa Arepa": "Canosa Arepa",
  "Pollo Mechado Arepa": "Pollo Mechado Arepa", "Pernil Arepa": "Pernil Arepa",
  "Carne Mechada Arepa": "Carne Mechada Arepa", "Pabellón Arepa": "Pabellón Arepa",
  "Catira Arepa": "Catira Arepa", "Vegana Arepa": "Vegana Arepa",
  "Pelua Arepa": "Pelúa Arepa", "Viuda Arepa": "Arepa Viuda",
  "Queso Rallado Arepa": "Queso Rallado Arepa", "Arepa Asado Negro": "Asado Negro",
  "Tequeños de Queso": "Tequeños", "Tequeños Tray": "Tequeños",
  "Jamón y Queso Arepa": "Jamón y Queso Arepa", "Marquesa de Parchita": "Marquesa de Parchita",
});

const categoryOrder = Object.freeze([
  "Specials", "Arepas", "Bowls", "Cachapas", "Patacón", "Tequeños", "Empanadas",
  "Perro Caliente", "Bakery", "Desserts", "Sides", "Beverages", "Groceries", "Candy",
]);

export function buildArepaZoneCatalog(
  { productsByLocation, shopifyProducts },
  { retrievedAt = new Date().toISOString() } = {},
) {
  if (matrixRows.size !== 71) throw new Error(`Arepa Zone matrix transcription expected 71 rows, found ${matrixRows.size}.`);
  const expectedCounts = new Map([["Mosaico", 47], ["14th Street", 56], ["Western Market", 52]]);
  const products = new Map();
  for (const [locationName, locationId] of arepaZoneLocationSources) {
    const rows = productsByLocation[locationName]?.products ?? [];
    if (rows.length !== expectedCounts.get(locationName)) {
      throw new Error(`Arepa Zone ${locationName} expected ${expectedCounts.get(locationName)} current products, found ${rows.length}.`);
    }
    for (const row of rows) {
      if (!row.product_id || !row.name || !row.category?.name) throw new Error(`Incomplete Arepa Zone product in ${locationName}.`);
      const current = products.get(row.product_id) ?? {
        sourceProductId: row.product_id,
        sourceItemIds: new Set(),
        name: row.name,
        category: row.category.category_name === "Specials" ? "Specials" : row.category.name,
        descriptions: [],
        imageUrl: row.image_url ?? null,
        locationNames: [],
        locationIds: [],
        sourceUrls: [],
        modifierLists: [],
        vendorAllergens: new Set(),
      };
      if (current.name !== row.name) throw new Error(`Arepa Zone product ${row.product_id} changed names across DC locations.`);
      current.sourceItemIds.add(row.id);
      if (row.description) current.descriptions.push(clean(row.description));
      current.locationNames.push(locationName);
      current.locationIds.push(locationId);
      current.sourceUrls.push(locationApiUrl(locationId));
      current.modifierLists.push(...(row.modifier_lists ?? []));
      for (const allergen of row.foodAndBeverageDetails?.allergens ?? []) current.vendorAllergens.add(allergen);
      products.set(row.product_id, current);
    }
  }
  if (products.size !== 75) throw new Error(`Arepa Zone DC union expected 75 unique products, found ${products.size}.`);

  const shopifyByTitle = new Map((shopifyProducts?.products ?? []).map((product) => [product.title, product]));
  if (shopifyByTitle.size !== 74) throw new Error(`Arepa Zone owner Shopify catalog expected 74 products, found ${shopifyByTitle.size}.`);
  const items = [...products.values()].map((product) => buildCurrentProduct(product, shopifyByTitle));
  items.sort((left, right) =>
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) || left.name.localeCompare(right.name),
  );
  const keyedItems = items.map((item, index) => ({ auditItemKey: `${index + 1}:${item.id}`, ...item }));
  return {
    schemaVersion: 1,
    restaurantId: arepaZoneRestaurantId,
    retrievedAt,
    sourceUrls: [
      arepaZoneAllergenPageUrl,
      arepaZoneAllergenGuideUrl,
      arepaZoneShopifyProductsUrl,
      ...arepaZoneLocationSources.map(([, locationId]) => locationApiUrl(locationId)),
    ],
    matrixPublishedRowCount: matrixRows.size,
    matrixMatchedCurrentProductCount: keyedItems.filter((item) => item.matrixKey).length,
    currentProductCountByLocation: Object.fromEntries(arepaZoneLocationSources.map(
      ([locationName]) => [locationName, productsByLocation[locationName].products.length],
    )),
    itemCount: keyedItems.length,
    categoryCount: new Set(keyedItems.map((item) => item.category)).size,
    officialAllergenCount: keyedItems.filter((item) => /official/.test(item.allergenSourceType)).length,
    officialMatrixCount: keyedItems.filter((item) => item.allergenSourceType === "official-allergen-menu").length,
    globalContactOnlyCount: keyedItems.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length,
    unavailableAllergenCount: keyedItems.filter((item) => item.allergenSourceType === "unavailable").length,
    matrixFacilityScopeCount: keyedItems.filter((item) => item.matrixKey).length,
    nonRedundantFacilityContactCount: keyedItems.filter((item) => item.mayContain.length > 0).length,
    locationLimitedProductCount: keyedItems.filter((item) => item.locationNames.length < 3).length,
    items: keyedItems,
  };
}

function buildCurrentProduct(product, shopifyByTitle) {
  const matrixKey = currentToMatrixKey[product.name] ?? null;
  let matrixAllergens = [];
  if (matrixKey === "Patacón::*") {
    const variants = ["Beef", "Chicken", "Pork", "Veggie"].map((name) => matrixRows.get(`Patacón::${name}`).allergens);
    matrixAllergens = intersection(variants);
  } else if (matrixKey) {
    matrixAllergens = matrixRows.get(matrixKey)?.allergens ?? [];
    if (!matrixRows.has(matrixKey)) throw new Error(`Unknown Arepa Zone matrix key ${matrixKey}.`);
  }
  const shopifyProduct = shopifyByTitle.get(currentToShopifyTitle[product.name]);
  const ownerText = htmlToText(shopifyProduct?.body_html);
  const ownerAllergens = directContainsAllergens(ownerText);
  const hasConflictingViudaWheatClaim = product.name === "Viuda Arepa";
  const allergens = hasConflictingViudaWheatClaim ? [] : unique([...matrixAllergens, ...ownerAllergens]);
  const hasMatrix = Boolean(matrixKey);
  const mayContain = hasMatrix ? facilityAllergens.filter((allergen) => !allergens.includes(allergen)) : [];
  const description = longest(product.descriptions) || ownerText || null;
  const sourceUrls = unique([
    ...product.sourceUrls,
    ...(hasMatrix ? [arepaZoneAllergenGuideUrl, arepaZoneAllergenPageUrl] : []),
    ...(shopifyProduct ? [`https://www.arepazone.com/products/${shopifyProduct.handle}`] : []),
  ]);
  const sourceSummary = hasConflictingViudaWheatClaim
    ? "The currently linked owner matrix marks wheat while also labeling this row gluten-free, and the current owner catalog labels Arepa Viuda gluten-free. Fixed formulation evidence is contradictory; only the matrix's wheat/milk/egg facility-contact warning is represented."
    : hasMatrix
    ? `The current ${product.locationNames.join(", ")} ordering product was reconciled to the currently linked owner allergen matrix. Matrix dots are fixed allergens; the guide's wheat/milk/egg facility statement is represented separately as may-contain contact. Menu and suppliers may vary.`
    : product.vendorAllergens.size > 0
      ? `The current ordering catalog lists ${[...product.vendorAllergens].join(", ").toLowerCase()} metadata for this product, but the restaurant-linked vendor field is not promoted to restaurant-issued allergen evidence and the app profile set may not represent it directly.`
      : `This product is currently published at ${product.locationNames.join(", ")}, but it has no defensible matching row in the currently linked owner allergen matrix. Fixed and cross-contact data remain unavailable.`;
  const evidence = [
    ...product.sourceUrls.map((sourceUrl) => ({
      sourceKind: "restaurant-linked-square-product",
      sourceUrl,
      text: `${product.name}: ${description ?? "No description"}; locations: ${product.locationNames.join(", ")}`,
    })),
    ...(hasMatrix ? [{
      sourceKind: "restaurant-issued-allergen-matrix",
      sourceUrl: arepaZoneAllergenGuideUrl,
      text: `${matrixKey}; published matrix dots: ${matrixAllergens.join(", ") || "none"}; adjudicated fixed: ${allergens.join(", ") || "none"}; facility processes wheat, milk, and eggs`,
    }] : []),
    ...(shopifyProduct ? [{
      sourceKind: "restaurant-issued-product-text",
      sourceUrl: `https://www.arepazone.com/products/${shopifyProduct.handle}`,
      text: ownerText || product.name,
    }] : []),
  ];
  return {
    id: slugify(product.name),
    sourceProductId: product.sourceProductId,
    sourceItemIds: [...product.sourceItemIds],
    name: product.name,
    category: product.category,
    description,
    ingredientsText: description,
    imageUrl: product.imageUrl,
    isConfigurable: product.modifierLists.some((list) => Number(list.min ?? 0) > 0) || ["Side", "Patacón", "Mini Arepa Trio"].includes(product.name),
    allergens,
    mayContain,
    allergenSourceType: hasConflictingViudaWheatClaim
      ? "official-global-cross-contact-note"
      : hasMatrix ? "official-allergen-menu" : "unavailable",
    sourceType: hasMatrix ? "restaurant-linked-square+official-allergen-matrix" : "restaurant-linked-square-menu",
    sourceUrls,
    sourceSummary,
    evidence,
    matrixKey,
    locationNames: product.locationNames,
    locationIds: product.locationIds,
    variantGroup: product.locationNames.join(" / "),
  };
}

function section(name, rows) {
  return rows.map(([itemName, allergens]) => [`${name}::${itemName}`, { section: name, name: itemName, allergens: addGluten(allergens) }]);
}

function addGluten(allergens) {
  return unique([...allergens, ...(allergens.includes("wheat") ? ["gluten"] : [])]);
}

function directContainsAllergens(value) {
  const contains = String(value ?? "").match(/\bcontains?\b([^.]*)/i)?.[1] ?? "";
  const ids = [];
  if (/\b(?:dairy|milk)\b/i.test(contains)) ids.push("milk");
  if (/\beggs?\b/i.test(contains)) ids.push("egg");
  if (/\bfish\b/i.test(contains)) ids.push("fish");
  if (/\bshellfish\b/i.test(contains)) ids.push("shellfish");
  if (/\bsoy(?:bean)?s?\b/i.test(contains)) ids.push("soy");
  if (/\bwheat\b/i.test(contains)) ids.push("wheat", "gluten");
  return unique(ids);
}

function intersection(groups) {
  return groups[0].filter((value) => groups.every((group) => group.includes(value)));
}

function locationApiUrl(locationId) {
  return `${apiBase}/${locationId}?limit=1000`;
}

function htmlToText(value) {
  return clean(String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
}

function longest(values) {
  return [...new Set(values)].sort((left, right) => right.length - left.length)[0] ?? null;
}

function unique(values) {
  return [...new Set(values)];
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const directory = path.resolve("data/restaurant-verification/artifacts/arepa-zone-dc");
  const productsByLocation = Object.fromEntries(await Promise.all(arepaZoneLocationSources.map(
    async ([locationName, , fileName]) => [locationName, JSON.parse(await readFile(path.join(directory, fileName), "utf8"))],
  )));
  const shopifyProducts = JSON.parse(await readFile(path.join(directory, "official-arepa-zone-shopify-products-api.json"), "utf8"));
  const snapshot = buildArepaZoneCatalog(
    { productsByLocation, shopifyProducts },
    { retrievedAt: "2026-07-15T09:41:45.995Z" },
  );
  const destination = path.resolve("data/restaurant-verification/repairs/arepa-zone-dc/corrected-menu.json");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    matrixPublishedRowCount: snapshot.matrixPublishedRowCount,
    matrixMatchedCurrentProductCount: snapshot.matrixMatchedCurrentProductCount,
    officialAllergenCount: snapshot.officialAllergenCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    officialMatrixCount: snapshot.officialMatrixCount,
    globalContactOnlyCount: snapshot.globalContactOnlyCount,
    matrixFacilityScopeCount: snapshot.matrixFacilityScopeCount,
    nonRedundantFacilityContactCount: snapshot.nonRedundantFacilityContactCount,
    locationLimitedProductCount: snapshot.locationLimitedProductCount,
  }, null, 2));
}
