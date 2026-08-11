import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const arenasRestaurantId = "arenas-georgetown-dc";
export const arenasToastUrl = "https://order.toasttab.com/online/arenas-georgetown";
export const arenasMainMenuUrl = "https://www.arenasdeliandbar.com/wp-content/uploads/2018/01/Arenas-Menu-7-2026.pdf";
export const arenasKidsMenuUrl = "https://www.arenasdeliandbar.com/wp-content/uploads/2018/01/kids-menu-9-22.pdf";

const nameOverrides = Object.freeze({
  "arenas-burger": "Arena's Burger",
  "big-mozzarella-sticks": "Big Mozzarella Sticks",
  "black-bleu-burger": "Black & Bleu Burger",
  blt: "BLT",
  "classic-t": "Classic “T”",
  cocacola: "Coca-Cola",
  "cocacola-cherry": "Coca-Cola Cherry",
  "cocacola-zero-sugar": "Coca-Cola Zero Sugar",
  "fish-and-chips": "Fish and Chips",
  "honey-chicken-club": "Honey Chicken Club",
  "maryland-crab-soup": "Maryland Crab Soup",
  "salad-sandwich-combo": "Salad & Sandwich Combo",
  "soup-salad-combo": "Soup & Salad Combo",
  "soup-sandwich-combo": "Soup & Sandwich Combo",
  "the-italian-hottie": "The Italian Hottie",
});

const mainMenuSlugs = new Set(`
  nachos hummus-platter big-mozzarella-sticks fried-pierogies large-fries large-cheese-fries
  small-cheese-fries large-death-fries small-death-fries basket-of-tater-tots crab-dip
  buffalo-chicken-tenders wings maryland-crab-soup chili caesar-salad chicken-caesar
  chicken-salad-platter cobb-salad crab-caesar garden-salad greek-salad market-salad
  orchard-salad tuna-salad-platter betty big-daddy blt california-club chicken-salad-club
  classic-t dennis-the-menace duckwich duncan french-dip hampshire hungry-kayaker
  italian-cold-cut north-shore philly-cheesesteak reuben the-italian-hottie tiger-cub
  tuna-salad-club buffalo-chicken-cheesesteak buffalo-chicken-sandwich
  cajun-chicken-cheesesteak chicken-caesar-wrap chicken-cheesesteak chicken-parm
  honey-chicken-club mesa-chicken-wrap monterey-chicken texas-chicken
  granny-smith-sandwich veggie-burger sedona-burger yummy-hummy power-house arenas-burger
  texas-burger black-bleu-burger fish-tacos shrimp-tacos rockfish-reuben fish-and-chips
  fried-shrimp-basket crab-cake-sandwich crab-cake-platter crab-cake-dinner
`.trim().split(/\s+/));

const supplementalOwnerRows = Object.freeze([
  ["Soup of the Day", "Soups & Combos", "Made fresh daily. Ask your server what’s cooking in the kitchen.", arenasMainMenuUrl],
  ["Salsa", "Sides", "Side of homemade salsa.", arenasMainMenuUrl],
  ["Guacamole", "Sides", "Side of guacamole.", arenasMainMenuUrl],
  ["Avocado", "Sides", "Side of avocado.", arenasMainMenuUrl],
  ["Sour Cream", "Sides", "Side of sour cream.", arenasMainMenuUrl],
  ["Homemade Coleslaw", "Sides", "Side of homemade coleslaw.", arenasMainMenuUrl],
  ["Green Apple", "Sides", "Side of green apple.", arenasMainMenuUrl],
  ["Kids Chicken Tenders", "Kids Menu", "Chicken tenders (3) served with fries and a side of BBQ sauce.", arenasKidsMenuUrl],
  ["Kids Fried Shrimp", "Kids Menu", "Fried battered shrimp (6) served with fries and a side of cocktail sauce.", arenasKidsMenuUrl],
  ["Kids Fish & Chips", "Kids Menu", "Battered Rockfish (2) with fries and a side of tartar sauce.", arenasKidsMenuUrl],
  ["Grilled Cheese", "Kids Menu", "Melted American cheese on grilled bread.", arenasKidsMenuUrl],
  ["Grilled Cheese w/Ham", "Kids Menu", "Melted American cheese on grilled bread with ham.", arenasKidsMenuUrl],
  ["Kids Turkey", "Kids Menu", "Sliced turkey breast with American cheese and mayo on bread.", arenasKidsMenuUrl],
  ["Small Garden Salad", "Kids Menu", "Seasonal greens with carrots, cucumbers, tomatoes, onion and choice of dressing.", arenasKidsMenuUrl],
  ["Small Caesar Salad", "Kids Menu", "Small Caesar salad.", arenasToastUrl],
]);

export function parseArenasToastMarkdown(text) {
  const products = new Map();
  let section = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^### /.test(line)) section = line.slice(4).trim();
    const match = line.match(/\]\(https:\/\/order\.toasttab\.com\/online\/arenas-georgetown\/item-([^_)]+)_([0-9a-f-]+)\)/i);
    if (!match || !section || section === "Featured Items") continue;
    const slug = match[1];
    const before = line.slice(0, match.index);
    const description = clean((before.match(/\.(?:jpg|png)\)(.*?)\$\d/i) ?? before.match(/\)(.*?)\$\d/i))?.[1]);
    products.set(slug, {
      slug,
      sourceItemId: match[2],
      name: nameOverrides[slug] ?? titleCase(slug),
      category: section,
      description: description || null,
    });
  }
  if (products.size !== 86) throw new Error(`Arena's current Toast proxy expected 86 unique products, found ${products.size}.`);
  return [...products.values()];
}

export function buildArenasGeorgetownCatalog(
  { toastMarkdown, mainMenuText, kidsMenuText },
  { retrievedAt = new Date().toISOString() } = {},
) {
  if (!/7\.26/.test(mainMenuText) || !/ITALIAN COLD CUT/i.test(mainMenuText) || !/HONEY CHICKEN CLUB/i.test(mainMenuText)) {
    throw new Error("Arena's owner main-menu contract changed or the July 2026 text is incomplete.");
  }
  if (!/Georgetown, DE/.test(kidsMenuText) || !/Chicken Tenders/.test(kidsMenuText)) {
    throw new Error("Arena's owner kids-menu contract changed or is incomplete.");
  }
  const toastRows = parseArenasToastMarkdown(toastMarkdown);
  const products = toastRows.map((row) => productFromRow({
    ...row,
    ownerIssued: mainMenuSlugs.has(row.slug),
    sourceUrl: mainMenuSlugs.has(row.slug) ? arenasMainMenuUrl : arenasToastUrl,
  }));
  for (const [name, category, description, sourceUrl] of supplementalOwnerRows) {
    products.push(productFromRow({
      slug: slugify(name),
      name,
      category,
      description,
      ownerIssued: sourceUrl !== arenasToastUrl,
      sourceUrl,
      sourceItemId: null,
    }));
  }
  if (new Set(products.map((item) => item.id)).size !== products.length) {
    throw new Error("Arena's canonical product IDs are not unique.");
  }
  const items = products.map((item, index) => ({ auditItemKey: `${index + 1}:${item.id}`, ...item }));
  return {
    schemaVersion: 1,
    restaurantId: arenasRestaurantId,
    retrievedAt,
    sourceUrls: [
      "https://www.arenasdeliandbar.com/locations/georgetown/",
      "https://www.arenasdeliandbar.com/menu/",
      arenasMainMenuUrl,
      arenasKidsMenuUrl,
      arenasToastUrl,
    ],
    toastPresentationCount: 89,
    toastUniqueProductCount: toastRows.length,
    ownerSupplementalProductCount: supplementalOwnerRows.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    linkedOnlyProductCount: items.filter((item) => item.sourceType === "restaurant-linked-toast-menu").length,
    items,
  };
}

function productFromRow({ slug, sourceItemId, name, category, description, ownerIssued, sourceUrl }) {
  const allergens = ownerIssued ? directOwnerNamedAllergens(`${name} ${description ?? ""}`) : [];
  const sourceKind = ownerIssued ? "restaurant-issued-menu-text" : "restaurant-linked-toast-menu";
  return {
    id: slugify(slug),
    sourceItemId,
    name,
    category,
    description,
    imageUrl: null,
    ingredientsText: description,
    isConfigurable: /combo|choice|your choice|add |soup of the day/i.test(`${name} ${description ?? ""}`),
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    sourceType: sourceKind,
    sourceUrls: [sourceUrl],
    variantGroup: null,
    evidence: [{ sourceKind, sourceUrl, text: description ? `${name}: ${description}` : name }],
    sourceSummary: allergens.length > 0
      ? "Positive fixed signals are limited to allergen-bearing ingredients explicitly named in Arena's owner-issued menu text. The menu is not a complete allergen matrix or cross-contact assurance."
      : ownerIssued
        ? "Arena's owner-issued menu publishes this product, but it does not provide a complete formulation, negative allergen assurance, or cross-contact disclosure for the row."
        : "Arena's restaurant-linked Toast catalog publishes this product, but linked-vendor text is not promoted to restaurant-issued allergen evidence.",
  };
}

export function directOwnerNamedAllergens(value) {
  const text = String(value ?? "").toLowerCase();
  const ids = [];
  if (/\b(?:cheese|cheddar|swiss|provolone|mozzarella|parmesan|feta|bleu cheese|blue cheese|sour cream)\b/.test(text)) ids.push("milk");
  if (/\b(?:mayonnaise|mayo)\b/.test(text)) ids.push("egg");
  if (/\b(?:rockfish|tuna)\b/.test(text)) ids.push("fish");
  if (/\b(?:crab|crabmeat|shrimp)\b/.test(text)) ids.push("shellfish");
  if (/\bmustard\b/.test(text)) ids.push("mustard");
  if (/\b(?:whole wheat|wheat bread|grilled wheat)\b/.test(text)) ids.push("wheat", "gluten");
  return ids;
}

export function canonicalArenasNameKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘“”']/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(?:the|big|homemade)\b/gi, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^arenas /, "")
    .replace(/^reubens reuben$/, "reuben")
    .replace(/^arugula orchard salad$/, "orchard salad")
    .replace(/^mozzarella sticks$/, "mozzarella sticks");
}

function titleCase(slug) {
  return String(slug).split("-").map((word) => {
    if (["and", "of", "the", "w"].includes(word)) return word;
    return word ? word[0].toUpperCase() + word.slice(1) : word;
  }).join(" ");
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactDirectory = path.resolve("data/restaurant-verification/artifacts/arenas-georgetown-dc");
  const [toastMarkdown, mainMenuText, kidsMenuText] = await Promise.all([
    readFile(path.join(artifactDirectory, "arenas-toast-readable-proxy.txt"), "utf8"),
    readFile(path.join(artifactDirectory, "official-arenas-georgetown-july-2026-menu.txt"), "utf8"),
    readFile(path.join(artifactDirectory, "official-arenas-kids-menu.txt"), "utf8"),
  ]);
  const snapshot = buildArenasGeorgetownCatalog(
    { toastMarkdown, mainMenuText, kidsMenuText },
    { retrievedAt: "2026-07-15T09:20:53.792Z" },
  );
  const destination = path.resolve("data/restaurant-verification/repairs/arenas-georgetown-dc/corrected-menu.json");
  await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    linkedOnlyProductCount: snapshot.linkedOnlyProductCount,
  }, null, 2));
}
