import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAfghanKabob = "osm-afghan-kabob-3359956639";
export const sourceUrlsAfghanKabob = Object.freeze({
  officialHome: "https://www.afghankabobva.com/",
  linkedMenu: "https://repasorder.com/api/menu/GetMenuView?restaurantID=185&&offset=0",
  linkedIdentity: "https://repasorder.com/api/Restaurant/GetRestaurantID?guId=c0dd6eca-b19d-d9ff-b57a-e845078f3443",
  linkedDetail: "https://repasorder.com/api/Restaurant/GetRestaurantDetail?restaurantID=185",
});

const categoryOrder = Object.freeze([
  "APPETIZERS",
  "SOUP AND SALAD",
  "VEGETARIAN DELIGHT",
  "KABOBS",
  "ENTREES",
  "SIDE ORDERS",
  "LUNCH SPECIALS",
  "DESSERTS",
  "BEVERAGES",
]);

export function parseAfghanKabobRepasMenu(payload) {
  const rows = payload?.result?.menuItemList;
  const categories = payload?.result?.menuCategoryList;
  if (!Array.isArray(rows) || !Array.isArray(categories)) {
    throw new Error("Afghan Kabob linked menu payload is missing menu rows or categories.");
  }
  if (rows.length !== 58 || categories.length !== 9) {
    throw new Error(
      `Afghan Kabob linked menu shape changed: expected 58 products in 9 categories; found ${rows.length} in ${categories.length}.`,
    );
  }
  const categoryCounts = new Map(categories.map((category) => [
    clean(category.categoryName),
    Number(category.itemCount),
  ]));
  for (const [category, expectedCount] of categoryCounts) {
    const actualCount = rows.filter((row) => clean(row.categoryName) === category).length;
    if (actualCount !== expectedCount) {
      throw new Error(
        `Afghan Kabob ${category} count changed: expected ${expectedCount}; found ${actualCount}.`,
      );
    }
  }
  return rows.map((row) => ({
    sourceItemId: String(row.menuItemID),
    name: clean(row.itemName),
    category: clean(row.categoryName),
    description: clean(row.itemDescription) || null,
    isConfigurable: Boolean(row.isCustomizationExist),
    isAlcoholic: Boolean(row.isAlcoholic),
  }));
}

export function buildAfghanKabobAuditSnapshot({
  menuPayload,
  retrievedAt = new Date().toISOString(),
}) {
  const rows = parseAfghanKabobRepasMenu(menuPayload);
  if (rows.some((row) => row.isAlcoholic)) {
    throw new Error("Unexpected alcoholic row in Afghan Kabob's current food menu.");
  }
  const duplicateIds = duplicates(rows.map((row) => row.sourceItemId));
  const duplicateNames = duplicates(rows.map((row) => normalize(row.name)));
  if (duplicateIds.length > 0 || duplicateNames.length > 0) {
    throw new Error(
      `Afghan Kabob linked menu has duplicate identities: ids=${duplicateIds.join(",")}; names=${duplicateNames.join(",")}.`,
    );
  }

  const items = rows.map((row, index) => {
    const allergens = publishedSignalsAfghanKabob(row);
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
      id: slugify(row.name),
      sourceItemId: row.sourceItemId,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      isConfigurable: row.isConfigurable,
      sourceUrls: [sourceUrlsAfghanKabob.linkedMenu, sourceUrlsAfghanKabob.officialHome],
      sourceType: "restaurant-linked-vendor-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceIndex: index,
    };
  }).sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    return categoryDifference || left.sourceIndex - right.sourceIndex;
  }).map(({ sourceIndex: _sourceIndex, ...item }) => item);

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAfghanKabob,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAfghanKabob),
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Afghan Kabob's official website links directly to the current RepasO ordering catalog, whose identity endpoint resolves the restaurant UUID to restaurant 185 at the same Springfield address. The official home page shows only a stale appetizer subset, so the linked current catalog is authoritative for menu identity. Neither source publishes a complete allergen matrix, complete recipes, or cross-contact policy. Positive signals are limited to fixed linked descriptions and mandatory named food formats; optional bread-or-rice choices are excluded.",
    items,
  };
}

export function publishedSignalsAfghanKabob(row) {
  let text = clean(`${row.name} ${row.description ?? ""}`).normalize("NFKD")
    .replace(/\p{M}/gu, "").toLowerCase();
  text = text.replace(/\beggplant\b/g, "eggplant");
  const allergens = [];

  if (/\b(?:milk|yogurt|cream|firnee|pudding)\b/.test(text)) allergens.push("milk");
  if (/\b(?:walnuts?|pistachios?)\b/.test(text)) allergens.push("tree-nut");
  if (/\b(?:tilapia|fish)\b/.test(text)) allergens.push("fish");
  if (/\b(?:tahini|sesame)\b/.test(text)) allergens.push("sesame");

  const optionalBreadOrRice = /\bbread\s+or\s+rice\b/.test(text);
  const explicitWheatText = !optionalBreadOrRice &&
    /\b(?:pastry|flatbread|bread|nan|ravioli|dumplings?|funnel cake)\b/.test(text);
  const namedWheatFormat = /\b(?:aushak|mantu|sambosay|boolawnee|baqlawa|jeleb[ei]e|cream roll)\b/i.test(row.name);
  if (explicitWheatText || namedWheatFormat) allergens.push("wheat", "gluten");

  return unique(allergens);
}

function normalize(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values)];
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const menuPayload = JSON.parse(await readFile(
    path.join(root, `artifacts/${restaurantIdAfghanKabob}/restaurant-linked-repas-menu.json`),
    "utf8",
  ));
  const snapshot = buildAfghanKabobAuditSnapshot({ menuPayload });
  const outputDir = path.join(root, `repairs/${restaurantIdAfghanKabob}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
