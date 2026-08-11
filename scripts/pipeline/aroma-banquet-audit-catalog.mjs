import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const aromaBanquetRestaurantId = "osm-aroma-banquet-1395623894";
export const aromaBanquetOrigin = "https://www.aromarestaurant.com";
export const aromaBanquetMenuUrl = `${aromaBanquetOrigin}/menus?menu=online-ordering-menu`;
export const aromaBanquetOnlineOrderingUrl = `${aromaBanquetOrigin}/online-ordering`;
export const aromaBanquetPdfUrl = `${aromaBanquetOrigin}/_files/ugd/2bd880_567a6cb50138426ebe61480ba0b568a2.pdf`;
export const aromaBanquetAccessTokensUrl = `${aromaBanquetOrigin}/_api/v1/access-tokens`;
export const aromaBanquetMenusUrl = `${aromaBanquetOrigin}/_api/restaurants-menus-menu/v1/menus`;
export const aromaBanquetSectionsUrl = `${aromaBanquetOrigin}/_api/restaurants-menus-section/v1/sections`;
export const aromaBanquetItemsUrl = `${aromaBanquetOrigin}/_api/restaurants-menus-item/v1/items`;
export const wixRestaurantMenusAppDefinitionId = "b278a256-2757-4f19-9313-c05c783bec92";

export const aromaBanquetDineInMenuName = "Aroma Restaurant Bar & Banquet";
export const aromaBanquetOrderingMenuName = "Online Ordering Menu";

const categoryBySection = Object.freeze({
  Starters: "Starters",
  Tandoori: "Tandoori",
  Chutneys: "Chutneys",
  "Tandoori Breads": "Tandoori Breads",
  "Goat & Lamb": "Goat & Lamb",
  Chicken: "Chicken",
  "Side Dishes": "Sides",
  Biryani: "Biryani",
  Vindaloo: "Vindaloo",
  Jalfrezi: "Jalfrezi",
  Seafood: "Seafood",
  Salads: "Salads",
  Vegetables: "Vegetables",
  Fusion: "Fusion",
  Desserts: "Desserts",
});

// These nine products remain on the restaurant-issued dine-in PDF but are not
// selectable in the current online-ordering subset. Their continued presence
// is therefore supported by the PDF, not inferred from hidden Wix visibility.
export const dineInOnlyProductNames = Object.freeze([
  "Jalabi Chaat",
  "Tandoori Batair",
  "Chicken Chandi Tikka",
  "Shahi Batair (Quail)",
  "Cauliflower Rice",
  "Scallop Balchao Curry",
  "Coco Mussel Curry",
  "Bagara Baigan",
  "Scoops of Ice Cream",
]);

const allergenOrder = Object.freeze([
  "milk",
  "egg",
  "peanut",
  "tree-nut",
  "wheat",
  "gluten",
  "fish",
  "shellfish",
  "soy",
  "sesame",
  "mustard",
]);

export async function fetchAromaBanquetWixCatalog({ fetchImpl = fetch } = {}) {
  const tokenResponse = await fetchImpl(aromaBanquetAccessTokensUrl, {
    headers: { Accept: "application/json", Referer: aromaBanquetMenuUrl },
  });
  if (!tokenResponse.ok) {
    throw new Error(`Aroma Banquet access-token request failed with HTTP ${tokenResponse.status}.`);
  }
  const tokens = await tokenResponse.json();
  const app = tokens?.apps?.[wixRestaurantMenusAppDefinitionId];
  const authorization = clean(app?.instance) ?? clean(app?.accessToken);
  if (!authorization) throw new Error("Aroma Banquet Wix restaurant-menu authorization token is missing.");

  const headers = {
    Accept: "application/json",
    authorization,
    Referer: aromaBanquetMenuUrl,
    "x-wix-client-artifact-id": "restaurant-menus-showcase-ooi",
  };
  const [menusResponse, sectionsResponse, itemsResponse] = await Promise.all([
    fetchImpl(aromaBanquetMenusUrl, { headers }),
    fetchImpl(aromaBanquetSectionsUrl, { headers }),
    fetchImpl(aromaBanquetItemsUrl, { headers }),
  ]);
  for (const [label, response] of [
    ["menus", menusResponse],
    ["sections", sectionsResponse],
    ["items", itemsResponse],
  ]) {
    if (!response.ok) throw new Error(`Aroma Banquet Wix ${label} request failed with HTTP ${response.status}.`);
  }
  return {
    menus: await menusResponse.json(),
    sections: await sectionsResponse.json(),
    items: await itemsResponse.json(),
  };
}

export function buildAromaBanquetCatalog(
  { menus, sections, items },
  { retrievedAt = new Date().toISOString() } = {},
) {
  assertSourceShape(menus, sections, items);
  const sectionsById = new Map(sections.sections.map((entry) => [entry.id, entry]));
  const itemsById = new Map(items.items.map((entry) => [entry.id, entry]));
  const dineInMenu = menus.menus.find((entry) => clean(entry.name) === aromaBanquetDineInMenuName);
  const orderingMenu = menus.menus.find((entry) => clean(entry.name) === aromaBanquetOrderingMenuName);

  const dineInPresentations = menuPresentations(dineInMenu, sectionsById, itemsById, {
    includeHiddenItems: false,
  }).filter((entry) => normalizeName(entry.item.name) !== normalizeName("House Dressings"));
  const orderingPresentations = menuPresentations(orderingMenu, sectionsById, itemsById, {
    includeHiddenItems: false,
  });

  if (dineInPresentations.length !== 99) {
    throw new Error(`Aroma Banquet PDF-backed dine-in contract changed: ${dineInPresentations.length} products.`);
  }
  if (orderingPresentations.length !== 90) {
    throw new Error(`Aroma Banquet visible ordering contract changed: ${orderingPresentations.length} products.`);
  }

  const productsByKey = new Map();
  for (const presentation of dineInPresentations) {
    const productKey = canonicalProductKey(presentation.item.name);
    if (productsByKey.has(productKey)) {
      throw new Error(`Duplicate Aroma Banquet dine-in product: ${presentation.item.name}.`);
    }
    productsByKey.set(productKey, productFromDineInPresentation(presentation, productKey));
  }
  for (const presentation of orderingPresentations) {
    const productKey = canonicalProductKey(presentation.item.name);
    const product = productsByKey.get(productKey);
    if (!product) {
      throw new Error(`Online-only Aroma Banquet product is not backed by the current dine-in PDF: ${presentation.item.name}.`);
    }
    addOrderingPresentation(product, presentation);
  }

  const actualDineInOnly = [...productsByKey.values()]
    .filter((entry) => entry.presentations.length === 1)
    .map((entry) => entry.name);
  if (!sameNormalizedSet(actualDineInOnly, dineInOnlyProductNames)) {
    throw new Error(`Aroma Banquet dine-in-only set changed: ${actualDineInOnly.join(", ")}.`);
  }

  const catalogItems = [...productsByKey.values()].map((item, index) => ({
    auditItemKey: `${index + 1}:${item.id}`,
    ...item,
  }));
  const officialIngredientCount = catalogItems.filter(
    (item) => item.allergenSourceType === "official-ingredients",
  ).length;
  const inferredRiskCount = catalogItems.filter(
    (item) => (item.inferredAllergenSignals ?? []).length > 0,
  ).length;

  return {
    schemaVersion: 1,
    restaurantId: aromaBanquetRestaurantId,
    retrievedAt,
    sourceUrls: [
      aromaBanquetPdfUrl,
      aromaBanquetOnlineOrderingUrl,
      aromaBanquetMenuUrl,
      aromaBanquetAccessTokensUrl,
      aromaBanquetMenusUrl,
      aromaBanquetSectionsUrl,
      aromaBanquetItemsUrl,
    ],
    sourceMenuCount: menus.menus.length,
    sourceSectionCount: sections.sections.length,
    sourceItemCount: items.items.length,
    dineInPresentationCount: dineInPresentations.length,
    orderingPresentationCount: orderingPresentations.length,
    itemCount: catalogItems.length,
    categoryCount: new Set(catalogItems.map((entry) => entry.category)).size,
    officialIngredientCount,
    inferredRiskCount,
    unavailableAllergenCount: catalogItems.length - officialIngredientCount,
    dineInOnlyProductCount: actualDineInOnly.length,
    excludedHeadingCount: 1,
    items: catalogItems,
  };
}

function assertSourceShape(menus, sections, items) {
  if (!Array.isArray(menus?.menus) || !Array.isArray(sections?.sections) || !Array.isArray(items?.items)) {
    throw new Error("Aroma Banquet Wix catalog response is missing menus, sections, or items arrays.");
  }
  if (menus.menus.length !== 2) throw new Error(`Aroma Banquet menu count changed: ${menus.menus.length}.`);
  const dineIn = menus.menus.find((entry) => clean(entry.name) === aromaBanquetDineInMenuName);
  const ordering = menus.menus.find((entry) => clean(entry.name) === aromaBanquetOrderingMenuName);
  if (!dineIn || dineIn.visible !== false || !ordering || ordering.visible === false) {
    throw new Error("Aroma Banquet dine-in/ordering menu visibility contract changed.");
  }
  if (new Set(menus.menus.map((entry) => entry.id)).size !== menus.menus.length) {
    throw new Error("Aroma Banquet Wix menu IDs are not unique.");
  }
  if (new Set(sections.sections.map((entry) => entry.id)).size !== sections.sections.length) {
    throw new Error("Aroma Banquet Wix section IDs are not unique.");
  }
  if (new Set(items.items.map((entry) => entry.id)).size !== items.items.length) {
    throw new Error("Aroma Banquet Wix item IDs are not unique.");
  }
}

function menuPresentations(menu, sectionsById, itemsById, { includeHiddenItems }) {
  const presentations = [];
  for (const sectionId of menu.sectionIds ?? []) {
    const section = sectionsById.get(sectionId);
    if (!section || section.visible === false) continue;
    const category = categoryBySection[titleCaseSection(section.name)];
    if (!category) throw new Error(`Unreviewed Aroma Banquet section: ${section.name}.`);
    for (const itemId of section.itemIds ?? []) {
      const item = itemsById.get(itemId);
      if (!item || (!includeHiddenItems && item.visible === false)) continue;
      presentations.push({ category, item, menu, section });
    }
  }
  return presentations;
}

function productFromDineInPresentation({ category, item, menu, section }, productKey) {
  const name = canonicalDisplayName(item.name);
  const description = clean(item.description);
  const allergens = directAllergens(name, description);
  const inferred = inferredRisks(name, description, allergens);
  return {
    id: slug(productKey),
    name,
    category,
    description,
    ingredientsText: description,
    imageUrl: clean(item.image?.url) ?? clean(item.imageUrl),
    isConfigurable: Boolean((item.modifierGroups ?? []).length) || name === "Scoops of Ice Cream",
    variantGroup: null,
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    sourceType: "restaurant-issued-pdf-menu",
    sourceUrls: [aromaBanquetPdfUrl, aromaBanquetItemsUrl],
    sourceSummary: allergens.length > 0
      ? "Positive signals are limited to ingredients or unavoidable formulations named by Aroma's current menu. Aroma does not publish a complete allergen matrix or item-level cross-contact assurance."
      : "Aroma publishes the product and description, but no supported fixed allergen signal or allergen-free assurance is available.",
    evidence: [{
      sourceKind: "restaurant-issued-pdf-menu",
      sourceUrl: aromaBanquetPdfUrl,
      text: description ? `${name}: ${description}` : name,
    }],
    inferredIngredients: inferred.ingredients,
    inferredAllergenSignals: inferred.signals,
    inferenceSummary: inferred.summary,
    aliases: [],
    presentations: [{
      sourceName: clean(item.name),
      category,
      sourceKind: "restaurant-issued-pdf-menu",
      sourceUrls: [aromaBanquetPdfUrl],
    }],
    sourceItemIds: [item.id],
    sourceMenuNames: [clean(menu.name)],
    sourceSectionNames: [clean(section.name)],
  };
}

function addOrderingPresentation(product, { category, item, menu, section }) {
  const orderingName = clean(item.name);
  const orderingDescription = clean(item.description);
  if (orderingName !== product.name) product.aliases = unique([...product.aliases, orderingName]);
  if ((orderingDescription?.length ?? 0) > (product.description?.length ?? 0)) {
    product.description = orderingDescription;
    product.ingredientsText = orderingDescription;
  }
  product.imageUrl = clean(item.image?.url) ?? clean(item.imageUrl) ?? product.imageUrl;
  product.isConfigurable ||= Boolean((item.modifierGroups ?? []).length);
  product.sourceType = "restaurant-issued-pdf-and-wix-ordering-menu";
  product.sourceUrls = unique([...product.sourceUrls, aromaBanquetOnlineOrderingUrl, aromaBanquetMenuUrl]);
  product.sourceItemIds = unique([...product.sourceItemIds, item.id]);
  product.sourceMenuNames = unique([...product.sourceMenuNames, clean(menu.name)]);
  product.sourceSectionNames = unique([...product.sourceSectionNames, clean(section.name)]);
  product.presentations.push({
    sourceName: orderingName,
    category,
    sourceKind: "restaurant-issued-wix-ordering-menu",
    sourceUrls: [aromaBanquetOnlineOrderingUrl, aromaBanquetMenuUrl],
  });
  product.evidence.push({
    sourceKind: "restaurant-issued-wix-ordering-menu",
    sourceUrl: aromaBanquetItemsUrl,
    text: orderingDescription ? `${orderingName}: ${orderingDescription}` : orderingName,
  });
  const allergens = directAllergens(product.name, product.description);
  const inferred = inferredRisks(product.name, product.description, allergens);
  product.allergens = allergens;
  product.allergenSourceType = allergens.length > 0 ? "official-ingredients" : "unavailable";
  product.inferredIngredients = inferred.ingredients;
  product.inferredAllergenSignals = inferred.signals;
  product.inferenceSummary = inferred.summary;
}

export function directAllergens(name, description) {
  const text = `${name ?? ""} ${description ?? ""}`.toLowerCase().replace(/eggplant/g, " ");
  const found = new Set();
  const add = (...ids) => ids.forEach((id) => found.add(id));
  if (/\b(?:milk|yogurt|yoghurt|paneer|cottage cheese|cheese|butter|buttery|ghee|cream|ice cream)\b/.test(text)) add("milk");
  if (/\b(?:(?:almond|cashew|hazelnut|macadamia|pecan|pistachio|walnut)s?|nuts)\b/.test(text)) add("tree-nut");
  if (/\bpeanuts?\b/.test(text)) add("peanut");
  if (/\b(?:sesame|tahini)\b/.test(text)) add("sesame");
  if (/\b(?:shrimp|prawn|crab|lobster|clam|oyster|scallop|mussel)s?\b/.test(text)) add("shellfish");
  if (/\b(?:fish|salmon|tilapia|talapia|tuna|cod|trout|anchovy|anchovies)\b/.test(text)) add("fish");
  if (/\b(?:soy|soya|tofu|miso|tamari)\b/.test(text)) add("soy");
  if (/\b(?:raita|raitha)\b/.test(text)) add("milk");
  if (/\b(?:wheat|white flour)\b/.test(text) || isUnavoidableWheatForm(name, description)) add("wheat", "gluten");
  return allergenOrder.filter((id) => found.has(id));
}

function isUnavoidableWheatForm(name, description) {
  const product = normalizeName(name);
  const text = normalizeName(description);
  if (product === "samosa" && /pastry/.test(text)) return true;
  if (/\b(?:naan|nan|kulcha)\b/.test(product) && !/cornbread/.test(text)) return true;
  return false;
}

function inferredRisks(name, description, officialAllergens) {
  const product = normalizeName(name);
  const text = normalizeName(`${name ?? ""} ${description ?? ""}`);
  const ingredients = [];
  const signals = [];
  const add = (id, confidence, evidence, ingredient) => {
    if (officialAllergens.includes(id) || signals.some((entry) => entry.id === id)) return;
    signals.push({ id, c: confidence, e: [evidence] });
    if (ingredient) ingredients.push(ingredient);
  };
  if (/\b(?:batter|battered)\b/.test(text) && !/chickpea batter/.test(text)) {
    add("wheat", "medium", "ingredient:unspecified-batter", "unspecified_batter");
    add("gluten", "medium", "ingredient:unspecified-batter", "unspecified_batter");
  }
  if (/\bnutty\b/.test(text) && !officialAllergens.includes("tree-nut")) {
    add("tree-nut", "medium", "description:nutty", "unspecified_nut");
  }
  if (product === "scoops of ice cream" && /pistachio/.test(text)) {
    add("tree-nut", "high", "variant:pistachio-choice", "pistachio_variant");
  }
  return {
    ingredients: unique(ingredients),
    signals,
    summary: signals.length > 0
      ? "Ingredient Intelligence keeps unspecified batter, flavor wording, and selectable variant risks separate from Aroma's fixed restaurant-issued ingredient signals."
      : null,
  };
}

function canonicalProductKey(value) {
  return normalizeName(value).replace(/\bgulab jamun\b/, "gulab jamoon");
}

function canonicalDisplayName(value) {
  const name = clean(value);
  return normalizeName(name) === "gulab jamoon" ? "Gulab Jamoon" : name;
}

function titleCaseSection(value) {
  const normalized = clean(value)?.toLowerCase();
  if (normalized === "chutney's") return "Chutneys";
  if (normalized === "deserts") return "Desserts";
  const entry = Object.keys(categoryBySection).find((candidate) => candidate.toLowerCase() === normalized);
  return entry ?? clean(value);
}

function normalizeName(value) {
  return clean(value)
    ?.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ") ?? "";
}

function slug(value) {
  return normalizeName(value).replace(/\s+/g, "-") || "item";
}

function clean(value) {
  if (typeof value !== "string") return null;
  return value.replace(/\s+/g, " ").trim() || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sameNormalizedSet(left, right) {
  const normalized = (values) => [...new Set(values.map(canonicalProductKey))].sort();
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function captureCurrentCatalog() {
  const raw = await fetchAromaBanquetWixCatalog();
  const retrievedAt = new Date().toISOString();
  const artifactDirectory = path.resolve(
    `data/restaurant-verification/artifacts/${aromaBanquetRestaurantId}`,
  );
  const repairDirectory = path.resolve(
    `data/restaurant-verification/repairs/${aromaBanquetRestaurantId}`,
  );
  await Promise.all([
    mkdir(artifactDirectory, { recursive: true }),
    mkdir(repairDirectory, { recursive: true }),
  ]);
  const artifacts = [
    ["official-aroma-banquet-wix-menus.json", raw.menus],
    ["official-aroma-banquet-wix-sections.json", raw.sections],
    ["official-aroma-banquet-wix-items.json", raw.items],
  ];
  const hashes = {};
  for (const [filename, value] of artifacts) {
    const buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    await writeFile(path.join(artifactDirectory, filename), buffer);
    hashes[filename] = sha256(buffer);
  }
  const snapshot = buildAromaBanquetCatalog(raw, { retrievedAt });
  const snapshotBuffer = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  const outputPath = path.join(repairDirectory, "corrected-menu.json");
  await writeFile(outputPath, snapshotBuffer);
  return {
    outputPath: path.relative(process.cwd(), outputPath),
    hashes,
    correctedMenuSha256: sha256(snapshotBuffer),
    ...Object.fromEntries(Object.entries(snapshot).filter(([key]) => key.endsWith("Count"))),
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  if (process.argv.includes("--from-artifacts")) {
    const directory = path.resolve(
      `data/restaurant-verification/artifacts/${aromaBanquetRestaurantId}`,
    );
    const [menus, sections, items] = await Promise.all([
      readFile(path.join(directory, "official-aroma-banquet-wix-menus.json"), "utf8").then(JSON.parse),
      readFile(path.join(directory, "official-aroma-banquet-wix-sections.json"), "utf8").then(JSON.parse),
      readFile(path.join(directory, "official-aroma-banquet-wix-items.json"), "utf8").then(JSON.parse),
    ]);
    const snapshot = buildAromaBanquetCatalog({ menus, sections, items }, {
      retrievedAt: "2026-07-15T10:59:45.368Z",
    });
    console.log(JSON.stringify(Object.fromEntries(
      Object.entries(snapshot).filter(([key]) => key.endsWith("Count")),
    ), null, 2));
  } else {
    console.log(JSON.stringify(await captureCurrentCatalog(), null, 2));
  }
}
