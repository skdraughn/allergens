import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sourceUrlsALitteri = Object.freeze({
  home: "https://alitteri.com/",
  foodbooking: "https://www.foodbooking.com/ordering/restaurant/menu?restaurant_uid=147fa865-9a3b-4e85-af3f-d35dff10e20d",
  foodbookingApi: "https://www.foodbooking.com/api/restaurant/147fa865-9a3b-4e85-af3f-d35dff10e20d/menu",
  cateringPlatters: "https://img1.wsimg.com/isteam/ip/b5556f4d-8c14-406c-9acf-466b82c967fb/Catering%20Platters%20Updated%2002.07.24.jpg",
  cateringTrays: "https://img1.wsimg.com/isteam/ip/b5556f4d-8c14-406c-9acf-466b82c967fb/Catering%20Trays%20Updated%2002.07.24.jpg",
});

export const auditRetrievedAtALitteri = "2026-07-14T19:19:14.300Z";

const cateringRows = Object.freeze([
  {
    sourceItemId: "catering-platter-piccolo",
    name: "Piccolo",
    category: "Catering · Meat & Cheese Platters",
    description: "Serves 10–15. Ham, Genoa salami, turkey breast, roast beef, provolone cheese, Swiss cheese, Litteri's olive salad, and 15 small Italian breads.",
    sourceUrl: sourceUrlsALitteri.cateringPlatters,
  },
  {
    sourceItemId: "catering-platter-americano",
    name: "Americano",
    category: "Catering · Meat & Cheese Platters",
    description: "Serves 15–20. Ham, turkey breast, roast beef, Swiss cheese, cheddar cheese, Litteri's olive salad, and 20 small Italian breads.",
    sourceUrl: sourceUrlsALitteri.cateringPlatters,
  },
  {
    sourceItemId: "catering-platter-paisano",
    name: "Paisano",
    category: "Catering · Meat & Cheese Platters",
    description: "Serves 15–20. Genoa salami, soppressata, prosciuttini, capicola, provolone cheese, Swiss cheese, Litteri's olive salad, and 20 small Italian breads.",
    sourceUrl: sourceUrlsALitteri.cateringPlatters,
  },
  {
    sourceItemId: "catering-platter-lorenzo",
    name: "Lorenzo",
    category: "Catering · Meat & Cheese Platters",
    description: "Serves 45–50. Ham, roast beef, pastrami, turkey breast, Genoa salami, provolone cheese, Swiss cheese, cheddar cheese, Litteri's olive salad, and 50 small Italian breads.",
    sourceUrl: sourceUrlsALitteri.cateringPlatters,
  },
  {
    sourceItemId: "catering-platter-assortimento",
    name: "Assortimento",
    category: "Catering · Meat & Cheese Platters",
    description: "Serves 25–30. Ham, Genoa salami, prosciuttini, roast beef, pepperoni, provolone cheese, Swiss cheese, Litteri's olive salad, and 30 small Italian breads.",
    sourceUrl: sourceUrlsALitteri.cateringPlatters,
  },
  {
    sourceItemId: "catering-three-foot-italian-classic-sub",
    name: "3 Foot Italian Classic Sub",
    category: "Catering · Meat & Cheese Platters",
    description: "Serves 12–15. Capicola, Genoa salami, mortadella, prosciuttini, provolone, lettuce, tomato, onion, hot peppers, and Italian dressing.",
    sourceUrl: sourceUrlsALitteri.cateringPlatters,
  },
  { sourceItemId: "catering-vegetable-platter", name: "Vegetable Platter", category: "Catering · Trays & Platters", description: "Serves 30.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-fruit-platter", name: "Fruit Platter", category: "Catering · Trays & Platters", description: "Serves 20.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-pasta-salad", name: "Pasta Salad", category: "Catering · Trays & Platters", description: "Serves 10.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-olive-salad", name: "Olive Salad", category: "Catering · Trays & Platters", description: "Serves 15.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-baked-lasagna", name: "Baked Lasagna", category: "Catering · Trays & Platters", description: "Serves 12.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-baked-ziti", name: "Baked Ziti", category: "Catering · Trays & Platters", description: "Serves 10.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-sausage-onions-peppers", name: "Sausage, Onions & Peppers", category: "Catering · Trays & Platters", description: "Serves 20–25.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-meatball-tray", name: "Meatball Tray", category: "Catering · Trays & Platters", description: "Serves 20.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-sandwich-platter", name: "Sandwich Platter", category: "Catering · Trays & Platters", description: "Serves 12–15.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-cheese-platter", name: "Cheese Platter", category: "Catering · Trays & Platters", description: "Custom size; price varies.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-garden-salad", name: "Garden Salad", category: "Catering · Trays & Platters", description: "Serves 10.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-greek-salad", name: "Greek Salad", category: "Catering · Trays & Platters", description: "Serves 10.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-caesar-salad", name: "Caesar Salad", category: "Catering · Trays & Platters", description: "Serves 10.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-cannoli-platter", name: "Cannoli Platter", category: "Catering · Trays & Platters", description: "Custom size; price varies.", sourceUrl: sourceUrlsALitteri.cateringTrays },
  { sourceItemId: "catering-cookie-platter", name: "Cookie Platter", category: "Catering · Trays & Platters", description: "Custom size; price varies.", sourceUrl: sourceUrlsALitteri.cateringTrays },
]);

export function parseALitteriFoodBookingMenu(payload) {
  const menu = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!menu || !Array.isArray(menu.categories)) {
    throw new Error("A. Litteri FoodBooking menu categories were not found.");
  }

  return menu.categories.flatMap((category) => (category.items ?? [])
    .filter((item) => item.active !== false && item.is_out_of_stock !== true)
    .map((item) => ({
      sourceItemId: String(item.id),
      name: normalizeWhitespace(item.name),
      category: titleCase(normalizeWhitespace(category.name)),
      description: normalizeWhitespace(item.description) || null,
      sizeNames: (item.sizes ?? []).map((size) => normalizeWhitespace(size.name)).filter(Boolean),
      isConfigurable: (item.sizes?.length ?? 0) > 1 || hasOptions(item),
    })));
}

export function buildALitteriAuditSnapshot({
  foodbookingMenu,
  retrievedAt = auditRetrievedAtALitteri,
} = {}) {
  const orderRows = parseALitteriFoodBookingMenu(foodbookingMenu);
  if (orderRows.length !== 21) {
    throw new Error(`Expected 21 current A. Litteri ordering products; found ${orderRows.length}.`);
  }

  const currentOrderDescriptions = new Map();
  for (const row of orderRows) {
    currentOrderDescriptions.set(normalize(row.name), row.description);
    currentOrderDescriptions.set(normalize(row.name).replace(/ salad$/, ""), row.description);
  }
  const rows = [
    ...orderRows.map((row) => ({
      ...row,
      sourceType: "restaurant-linked-vendor-menu",
      sourceUrls: [sourceUrlsALitteri.foodbookingApi, sourceUrlsALitteri.foodbooking, sourceUrlsALitteri.home],
      ingredientsText: [row.name, row.description, ...row.sizeNames].filter(Boolean).join(" "),
    })),
    ...cateringRows.map((row) => {
      const normalizedName = normalize(row.name);
      const corroboratingDescription = currentOrderDescriptions.get(normalizedName) ??
        currentOrderDescriptions.get(normalizedName.replace(/ salad$/, "")) ?? null;
      return {
        ...row,
        sizeNames: [],
        isConfigurable: /custom size/i.test(row.description),
        sourceType: "restaurant-issued-image-menu",
        sourceUrls: unique([
          row.sourceUrl,
          sourceUrlsALitteri.home,
          ...(corroboratingDescription ? [sourceUrlsALitteri.foodbookingApi] : []),
        ]),
        ingredientsText: [row.name, row.description, corroboratingDescription].filter(Boolean).join(" "),
      };
    }),
  ];

  const items = rows.map((row, index) => {
    const allergens = publishedAllergenSignals(row.ingredientsText, row.name);
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
      id: `${slugify(row.category)}-${slugify(row.name)}`,
      sourceItemId: row.sourceItemId,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.ingredientsText || null,
      isConfigurable: row.isConfigurable,
      sourceUrls: row.sourceUrls,
      sourceType: row.sourceType,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      isAvailable: true,
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: "a-litteri-dc",
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsALitteri),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "A. Litteri publishes current product descriptions through the ordering menu linked from its official website and publishes separate current catering-menu images. It does not publish an allergen matrix, complete recipes, or a cross-contact guide. Only allergens directly signaled by fixed product names, mandatory bread or pasta formats, and published ingredient descriptions are represented; optional modifiers and conventional recipe assumptions are excluded. Rows without positive item-level evidence remain unavailable.",
    items,
  };
}

function publishedAllergenSignals(text, itemName) {
  const value = String(text ?? "");
  const allergens = [];
  if (!/\bbuild your own\b/i.test(itemName) && /\b(?:provolone|swiss|cheddar|mozzarella|parmesan|feta|tzatziki|cheese)\b/i.test(value)) allergens.push("milk");
  if (/\btuna\b/i.test(value)) allergens.push("fish");
  if (/\bcrab\b/i.test(value)) allergens.push("shellfish");
  if (/\b(?:breads?|breaded|roll|rye|pita|pasta|lasagna|ziti|croutons?|sandwich|sub)\b/i.test(value)) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function hasOptions(item) {
  if ((item.groups?.length ?? 0) > 0) return true;
  return (item.sizes ?? []).some((size) => (size.groups?.length ?? 0) > 0);
}

function titleCase(value) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return normalizeWhitespace(value).replace(/&/g, "and").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const foodbookingMenu = await readFile(path.join(root, "artifacts/a-litteri-dc/linked-foodbooking-menu.json"), "utf8");
  const snapshot = buildALitteriAuditSnapshot({ foodbookingMenu });
  const outputDir = path.join(root, "repairs/a-litteri-dc");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
