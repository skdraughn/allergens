import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAracosia = "osm-aracosia-3584164912";
export const aracosiaOrigin = "https://www.aracosiamclean.com";
export const aracosiaMenuUrl = `${aracosiaOrigin}/menu-1?location=Beverly+Road`;
export const aracosiaAccessTokensUrl = `${aracosiaOrigin}/_api/v1/access-tokens`;
export const aracosiaMenusUrl = `${aracosiaOrigin}/_api/restaurants-menus-menu/v1/menus`;
export const aracosiaSectionsUrl = `${aracosiaOrigin}/_api/restaurants-menus-section/v1/sections`;
export const aracosiaItemsUrl = `${aracosiaOrigin}/_api/restaurants-menus-item/v1/items`;
export const wixRestaurantMenusAppDefinitionId = "b278a256-2757-4f19-9313-c05c783bec92";

export const currentAracosiaMenuNames = Object.freeze([
  "LUNCH MENU",
  "DINNER MENU",
  "MARINATED MEATS & VEGETABLES",
  "CHUTNEYS",
]);

const categoryBySection = Object.freeze({
  "ADDITIONAL SIDES": "Sides",
  "BURGERS & WRAPS": "Burgers & Wraps",
  "CHOPS AND KABOBS": "Chops & Kabobs",
  "CHOPS & KABOBS": "Chops & Kabobs",
  Chutneys: "Chutneys",
  DESSERTS: "Desserts",
  ENTREES: "Entrees",
  "MARINATED RAW MEATS & VEGETABLES": "Marinated Meats & Vegetables",
  "MAZZA (APPETIZERS)": "Appetizers",
  QORMAS: "Qormas",
  "QORMAS (STEWS)": "Qormas",
  "SOUP & SALADS": "Soups & Salads",
  SPECIALS: "Specials",
  "VEGETARIAN & VEGAN": "Vegetarian & Vegan",
});

// The owner publishes lunch and dinner copies as separate Wix products. These
// pairs have the same composition and differ only by meal-period wording.
const mealPeriodAliases = new Map(Object.entries({
  "aushak appetizer": "leek scallion dumplings aushak appetizer",
  "aushak entree": "leek scallion dumplings aushak entree",
  "baadenjaan side": "baadenjaan",
  "beef tenderloin chicken": "beef tenderloin chicken kabob",
  "bistro signature mix grill mazza": "mix grill mazza",
  "daal side": "daal",
  "kadoo side": "kadoo",
  "lamb greens": "braised lamb greens",
  "mantu appetizer": "spicy beef dumplings mantu appetizer",
  "mantu entree": "spicy beef dumplings mantu entree",
  "mixed green salad": "mixed greens salad",
  "nakhoud side": "nakhoud",
  "pumpkin dumplings": "pumpkin dumpling appetizer",
  "risotto lamb": "risotto lamb sholah",
  "risotto with eggplant butternut squash": "spicy risotto with eggplant butternut squash",
  "sabzi side": "sabzi",
  "salmon kabob": "salmon",
  "seekh ground beef kabob": "seekh ground beef",
}));

export function canonicalAracosiaNameKey(value) {
  const normalized = normalizeName(value);
  return mealPeriodAliases.get(normalized) ?? normalized;
}

export async function fetchAracosiaWixCatalog({ fetchImpl = fetch } = {}) {
  const tokenResponse = await fetchImpl(aracosiaAccessTokensUrl, {
    headers: { Accept: "application/json", Referer: aracosiaMenuUrl },
  });
  if (!tokenResponse.ok) {
    throw new Error(`Aracosia access-token request failed with HTTP ${tokenResponse.status}.`);
  }
  const tokens = await tokenResponse.json();
  const app = tokens?.apps?.[wixRestaurantMenusAppDefinitionId];
  const authorization = clean(app?.instance) ?? clean(app?.accessToken);
  if (!authorization) {
    throw new Error("Aracosia Wix restaurant-menu authorization token is missing.");
  }
  const headers = {
    Accept: "application/json",
    authorization,
    Referer: aracosiaMenuUrl,
    "x-wix-client-artifact-id": "restaurant-menus-showcase-ooi",
  };
  const [menusResponse, sectionsResponse, itemsResponse] = await Promise.all([
    fetchImpl(aracosiaMenusUrl, { headers }),
    fetchImpl(aracosiaSectionsUrl, { headers }),
    fetchImpl(aracosiaItemsUrl, { headers }),
  ]);
  for (const [label, response] of [
    ["menus", menusResponse],
    ["sections", sectionsResponse],
    ["items", itemsResponse],
  ]) {
    if (!response.ok) {
      throw new Error(`Aracosia Wix ${label} request failed with HTTP ${response.status}.`);
    }
  }
  return {
    menus: await menusResponse.json(),
    sections: await sectionsResponse.json(),
    items: await itemsResponse.json(),
  };
}

export function buildAracosiaCatalog(
  { menus, sections, items },
  { retrievedAt = new Date().toISOString() } = {},
) {
  assertSourceShape(menus, sections, items);
  const sectionsById = new Map(sections.sections.map((entry) => [entry.id, entry]));
  const itemsById = new Map(items.items.map((entry) => [entry.id, entry]));
  const visibleMenus = menus.menus.filter((entry) => entry.visible !== false);
  const presentations = [];

  for (const menu of visibleMenus) {
    for (const sectionId of menu.sectionIds ?? []) {
      const section = sectionsById.get(sectionId);
      if (!section || section.visible === false) continue;
      const category = categoryBySection[clean(section.name)];
      if (!category) {
        throw new Error(`Unreviewed Aracosia section: ${section.name}.`);
      }
      for (const itemId of section.itemIds ?? []) {
        const item = itemsById.get(itemId);
        if (!item || item.visible === false) continue;
        presentations.push({ category, item, menu, section });
      }
    }
  }

  const productsByKey = new Map();
  for (const presentation of presentations) {
    const productKey = canonicalAracosiaNameKey(presentation.item.name);
    const existing = productsByKey.get(productKey);
    if (!existing) {
      productsByKey.set(productKey, productFromPresentation(presentation, productKey));
      continue;
    }
    mergePresentation(existing, presentation);
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
    restaurantId: restaurantIdAracosia,
    retrievedAt,
    sourceUrls: [
      aracosiaMenuUrl,
      aracosiaAccessTokensUrl,
      aracosiaMenusUrl,
      aracosiaSectionsUrl,
      aracosiaItemsUrl,
    ],
    sourceMenuCount: menus.menus.length,
    sourceSectionCount: sections.sections.length,
    sourceItemCount: items.items.length,
    visibleMenuCount: visibleMenus.length,
    visiblePresentationCount: presentations.length,
    visibleUniqueNameCount: new Set(presentations.map((entry) => normalizeName(entry.item.name))).size,
    itemCount: catalogItems.length,
    categoryCount: new Set(catalogItems.map((entry) => entry.category)).size,
    officialIngredientCount,
    inferredRiskCount,
    unavailableAllergenCount: catalogItems.length - officialIngredientCount,
    excludedHiddenMenuCount: menus.menus.length - visibleMenus.length,
    excludedUnreferencedOrHiddenItemCount: items.items.length - new Set(
      presentations.map((entry) => entry.item.id),
    ).size,
    items: catalogItems,
  };
}

function assertSourceShape(menus, sections, items) {
  if (!Array.isArray(menus?.menus) || !Array.isArray(sections?.sections) || !Array.isArray(items?.items)) {
    throw new Error("Aracosia Wix catalog response is missing menus, sections, or items arrays.");
  }
  const visibleNames = menus.menus.filter((entry) => entry.visible !== false).map((entry) => entry.name);
  if (JSON.stringify(visibleNames) !== JSON.stringify(currentAracosiaMenuNames)) {
    throw new Error(`Aracosia visible menus changed: ${visibleNames.join(", ")}.`);
  }
  if (new Set(menus.menus.map((entry) => entry.id)).size !== menus.menus.length) {
    throw new Error("Aracosia Wix menu IDs are not unique.");
  }
  if (new Set(sections.sections.map((entry) => entry.id)).size !== sections.sections.length) {
    throw new Error("Aracosia Wix section IDs are not unique.");
  }
  if (new Set(items.items.map((entry) => entry.id)).size !== items.items.length) {
    throw new Error("Aracosia Wix item IDs are not unique.");
  }
}

function productFromPresentation({ category, item, menu, section }, productKey) {
  const name = clean(item.name);
  const description = clean(item.description);
  const officialAllergens = directAllergens(`${name ?? ""} ${description ?? ""}`);
  const inferred = inferredRisks(`${name ?? ""} ${description ?? ""}`, officialAllergens);
  const sourceUrl = menuUrl(menu.name);
  const product = {
    id: slug(productKey),
    name,
    category,
    description,
    imageUrl: clean(item.image?.url) ?? clean(item.imageUrl),
    ingredientsText: description,
    isConfigurable: (item.modifierGroups ?? []).length > 0,
    allergens: officialAllergens,
    mayContain: [],
    allergenSourceType: officialAllergens.length > 0 ? "official-ingredients" : "unavailable",
    sourceType: "restaurant-issued-wix-menu-api",
    sourceUrls: [sourceUrl, aracosiaItemsUrl],
    variantGroup: null,
    sourceSummary: officialAllergens.length > 0
      ? "Positive fixed signals are limited to allergen-bearing ingredients explicitly named by Aracosia. The site does not publish a complete allergen matrix or cross-contact assurance."
      : "Aracosia publishes the item and composition, but no supported positive allergen signal or allergen-free assurance is available.",
    evidence: [{
      sourceKind: "restaurant-issued-wix-menu-api",
      sourceUrl: aracosiaItemsUrl,
      text: description ? `${name}: ${description}` : name,
    }],
    inferredIngredients: inferred.ingredients,
    inferredAllergenSignals: inferred.signals,
    inferenceSummary: inferred.summary,
    sourceItemIds: [item.id],
    sourceMenuNames: [clean(menu.name)],
    sourceSectionNames: [clean(section.name)],
  };
  return product;
}

function mergePresentation(product, { item, menu, section }) {
  const name = clean(item.name);
  const description = clean(item.description);
  if ((description?.length ?? 0) > (product.description?.length ?? 0)) {
    product.description = description;
    product.ingredientsText = description;
    product.evidence[0].text = `${product.name}: ${description}`;
  }
  product.sourceItemIds = unique([...product.sourceItemIds, item.id]);
  product.sourceMenuNames = unique([...product.sourceMenuNames, clean(menu.name)]);
  product.sourceSectionNames = unique([...product.sourceSectionNames, clean(section.name)]);
  product.sourceUrls = unique([...product.sourceUrls, menuUrl(menu.name)]);
  const officialAllergens = directAllergens(`${product.name ?? name ?? ""} ${product.description ?? description ?? ""}`);
  product.allergens = officialAllergens;
  product.allergenSourceType = officialAllergens.length > 0 ? "official-ingredients" : "unavailable";
  const inferred = inferredRisks(`${product.name ?? name ?? ""} ${product.description ?? description ?? ""}`, officialAllergens);
  product.inferredIngredients = inferred.ingredients;
  product.inferredAllergenSignals = inferred.signals;
  product.inferenceSummary = inferred.summary;
}

function directAllergens(value) {
  const text = String(value ?? "").toLowerCase().replace(/eggplant/g, " ");
  const patterns = [
    ["egg", /\beggs?\b/],
    ["fish", /\b(?:salmon|tuna|cod|trout|anchov(?:y|ies))\b/],
    ["milk", /\b(?:milk|yogurt|yoghurt|cheese|ice cream|whey|casein)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["shellfish", /\b(?:shrimp|prawn|crab|lobster|clam|oyster|scallop|mussel)s?\b/],
    ["soy", /\b(?:soy|tofu|miso|tamari)\b/],
    ["tree-nut", /\b(?:almond|cashew|hazelnut|macadamia|pecan|pistachio|walnut)s?\b/],
    ["wheat", /\bwheat\b/],
    ["gluten", /\bgluten\b(?![- ]free)/],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([allergen]) => allergen);
}

function inferredRisks(value, officialAllergens) {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/\b(?:pairs well with|you may add to|may add to|enjoy as a dipping sauce)\b[\s\S]*$/, " ");
  const productIdentity = text.slice(0, 100);
  const ingredients = [];
  const signals = [];
  const add = (id, confidence, evidence, ingredient) => {
    if (officialAllergens.includes(id) || signals.some((entry) => entry.id === id)) return;
    signals.push({ id, c: confidence, e: [evidence] });
    if (ingredient) ingredients.push(ingredient);
  };
  if (/\b(?:afghan bread|brioche bun|lavash wrap|croutons?)\b/.test(text)) {
    add("gluten", "high", "ingredient:bread-or-wrap", "bread_or_wrap");
    add("wheat", "high", "ingredient:bread-or-wrap", "bread_or_wrap");
  }
  if (/\b(?:dumpling|dumplings|turnover|turnovers|sambosa)\b/.test(productIdentity)) {
    add("gluten", "high", "dish:dough-wrapper", "dough_wrapper");
    add("wheat", "high", "dish:dough-wrapper", "dough_wrapper");
  }
  if (/\bbrioche\b/.test(text)) {
    add("egg", "medium", "ingredient:brioche", "brioche");
    add("milk", "medium", "ingredient:brioche", "brioche");
  }
  if (/\b(?:cake|baklava)\b/.test(text)) {
    add("egg", "medium", "dish:cake-or-baklava", "cake_or_baklava");
    add("gluten", "high", "dish:cake-or-baklava", "cake_or_baklava");
    add("milk", "medium", "dish:cake-or-baklava", "cake_or_baklava");
    add("tree-nut", "medium", "dish:baklava", "baklava_nuts");
    add("wheat", "high", "dish:cake-or-baklava", "cake_or_baklava");
  }
  return {
    ingredients: unique(ingredients),
    signals,
    summary: signals.length > 0
      ? "Ingredient Intelligence flags common dough, bread, brioche, cake, or baklava risks separately from Aracosia's explicit ingredient signals."
      : null,
  };
}

function menuUrl(menuName) {
  const menuSlug = {
    "CHUTNEYS": "chutneys",
    "DINNER MENU": "dinner-menu-1",
    "LUNCH MENU": "lunch-menu",
    "MARINATED MEATS & VEGETABLES": "marinated-meats--vegetables",
  }[clean(menuName)];
  if (!menuSlug) throw new Error(`No reviewed Aracosia URL for menu ${menuName}.`);
  return `${aracosiaOrigin}/menu-1?location=Beverly+Road&menu=${menuSlug}`;
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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function captureCurrentCatalog() {
  const raw = await fetchAracosiaWixCatalog();
  const retrievedAt = new Date().toISOString();
  const artifactDirectory = path.resolve(
    `data/restaurant-verification/artifacts/${restaurantIdAracosia}`,
  );
  const repairDirectory = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAracosia}`,
  );
  await Promise.all([
    mkdir(artifactDirectory, { recursive: true }),
    mkdir(repairDirectory, { recursive: true }),
  ]);
  const artifacts = [
    ["official-aracosia-wix-menus.json", raw.menus],
    ["official-aracosia-wix-sections.json", raw.sections],
    ["official-aracosia-wix-items.json", raw.items],
  ];
  const hashes = {};
  for (const [filename, value] of artifacts) {
    const buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    await writeFile(path.join(artifactDirectory, filename), buffer);
    hashes[filename] = sha256(buffer);
  }
  const snapshot = buildAracosiaCatalog(raw, { retrievedAt });
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
      `data/restaurant-verification/artifacts/${restaurantIdAracosia}`,
    );
    const [menus, sections, items] = await Promise.all([
      readFile(path.join(directory, "official-aracosia-wix-menus.json"), "utf8").then(JSON.parse),
      readFile(path.join(directory, "official-aracosia-wix-sections.json"), "utf8").then(JSON.parse),
      readFile(path.join(directory, "official-aracosia-wix-items.json"), "utf8").then(JSON.parse),
    ]);
    const snapshot = buildAracosiaCatalog({ menus, sections, items }, {
      retrievedAt: "2026-07-15T08:39:21.866Z",
    });
    console.log(JSON.stringify({
      itemCount: snapshot.itemCount,
      categoryCount: snapshot.categoryCount,
      officialIngredientCount: snapshot.officialIngredientCount,
      inferredRiskCount: snapshot.inferredRiskCount,
      unavailableAllergenCount: snapshot.unavailableAllergenCount,
    }, null, 2));
  } else {
    console.log(JSON.stringify(await captureCurrentCatalog(), null, 2));
  }
}
