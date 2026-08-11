import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";

export const aromaPizzaRestaurantId = "aroma-pizza-lorton-dc-metro";
export const aromaPizzaReviewedAt = "2026-07-15T10:40:29.922Z";
export const aromaPizzaSourceUrls = Object.freeze({
  toastMenu: "https://order.toasttab.com/online/aroma-pizza-company-new",
  readableTransport: "https://r.jina.ai/http://order.toasttab.com/online/aroma-pizza-company-new",
  compromisedOwnerDomain: "https://www.aromapizzacompany.com/",
  instagram: "https://www.instagram.com/aromapizzacompany/",
});

const artifactPath =
  `data/restaurant-verification/artifacts/${aromaPizzaRestaurantId}/aroma-toast-jina-transport.txt`;
const checkPath =
  `data/restaurant-verification/item-checks/${aromaPizzaRestaurantId}.jsonl`;
const outputPath =
  `data/restaurant-verification/repairs/${aromaPizzaRestaurantId}/corrected-menu.json`;

const categoryOrder = Object.freeze([
  "Wings",
  "Appetizers",
  "Soup & Salad",
  "Cheese Pizzas make your own",
  "Specialty Pizzas",
  "Calzones and Strombolis",
  "Pastas make your own (add topping)",
  "Baked Pastas",
  "Chicken pastas",
  "Seafood Pasta",
  "Subs, warps, and burgers",
  "Desserts",
  "Sides",
  "Daily coupons",
  "Catering",
  "Drinks",
]);
const categorySet = new Set(categoryOrder);

const supplementalProducts = Object.freeze([
  supplement("extra-large-cheese-pizza-16", "extra large cheese pizza 16''", "Cheese Pizzas make your own", "eb719b3e-8d07-45f7-bbc7-fe3f3f72670a"),
  supplement("large-cheese-pizza-14", "Large cheese pizza 14''", "Cheese Pizzas make your own", "fcbb64fa-e8fe-4e0b-b76c-91cb84400a54"),
  supplement("medium-cheese-pizza-12", "Medium cheese pizza 12''", "Cheese Pizzas make your own", "279b335f-d091-4f80-8fc4-5449006eb8e1"),
  supplement("small-cheese-pizza-10", "Small cheese pizza 10''", "Cheese Pizzas make your own", "9fdc3036-05c2-474c-9475-3d22941e9809"),
  supplement("can-soda", "Can Soda", "Drinks", "c0fe97bf-f68e-42e3-9a02-c508dea3208e"),
  supplement("small-bottle-soda", "Small Bottle Soda", "Drinks", "40dfc574-aaed-43e4-8370-b0ba17dba84f"),
  supplement("2l-bottle-soda", "2L Bottle Soda", "Drinks", "4b2ea849-2a04-4128-b8e5-5edd1877f174"),
  supplement("20oz-bottle-juice", "20oz Bottle Juice", "Drinks", "bd7aa89a-74fb-43f2-8fc6-ee31927bce4f"),
  supplement("energy-drink", "Energy Drink", "Drinks", "2429c2b3-f1dd-45cb-aad8-787b22a91445"),
  supplement("100-drinks", "$1.00 drinks", "Drinks", "7cf3aa5a-9787-4352-b3a0-34a6401ee9d0"),
  supplement("zero-sugar-drink", "Zero sugar drink", "Drinks", "279eed67-a3ce-40c5-88ca-48a03d61fea0"),
  supplement("aleovera-drink", "AleoVera drink", "Drinks", "bbc976c5-95e8-42f4-8f26-7412d27147dd"),
  supplement("family-deal-2-large-1-topping-pizzas-10-wings-mozzarella-sticks", "Family deal 2 Large 1 topping pizzas, 10 wings & mozzarella sticks", "Daily coupons", "5a517260-b48f-49ce-b404-8ed0e916afc0"),
  supplement("2-large-pizza-w-1-toppings", "2 large pizza w/ 1 Toppings", "Daily coupons", "2d46579f-111d-4692-910c-d0ff1ed857f2"),
  supplement("xl-cheese-pizza-mozzarella-steaks-2l-pepsi", "XL cheese pizza. Mozzarella steaks. 2L pepsi", "Daily coupons", "5ce7fe2c-3782-4b4a-b39e-d6eba7a4679e", "Xl cheese pizza, order mozzarella steaks. And 2L Pepsi can feed 4 to 6 ppl"),
  supplement("2-med-pizza-1-toppings-and-mozzarella-sticks", "2 MED pizza 1 Toppings and mozzarella sticks", "Daily coupons", "9b067b2d-c437-425c-9ba7-b433de258dc2"),
  supplement("large-pizza-1-topping-pick-up-only", "Large pizza 1 topping pick up only", "Daily coupons", "51cc5c07-4e2d-4b90-8376-24915a97d7e2"),
  supplement("large-pizza-w3-topping-triple-topper", "Large pizza w/3 topping (Triple Topper)", "Daily coupons", "42d6d619-387b-4041-b3ed-9c2668bd5c6c"),
]);

export async function buildAromaPizzaCatalog({
  menuText,
  baselineChecksText,
  retrievedAt = aromaPizzaReviewedAt,
} = {}) {
  const [resolvedText, checksText, manifest] = await Promise.all([
    menuText ?? readFile(artifactPath, "utf8"),
    baselineChecksText ?? readFile(checkPath, "utf8"),
    getDefaultIngredientIntelligenceManifest(),
  ]);
  const baselineNames = new Map(
    checksText.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
      .map((row) => [row.baseline.itemId, row.baseline.name]),
  );
  const extracted = extractAromaPizzaToastMenu(resolvedText, { baselineNames });
  if (extracted.items.length !== 181 || extracted.categoryCount !== 13) {
    throw new Error(
      `Aroma Pizza readable-menu contract changed: ${JSON.stringify({ items: extracted.items.length, categories: extracted.categoryCount })}.`,
    );
  }
  const merged = [...extracted.items, ...supplementalProducts];
  const bySourceProductId = new Map();
  for (const row of merged) bySourceProductId.set(row.sourceProductId, row);
  if (bySourceProductId.size !== 199) {
    throw new Error(`Aroma Pizza expected 199 unique current Toast products, found ${bySourceProductId.size}.`);
  }
  const items = [...bySourceProductId.values()]
    .sort((left, right) => categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category))
    .map((row) => buildItem(row, manifest));
  if (new Set(items.map((row) => row.id)).size !== items.length) {
    throw new Error("Aroma Pizza current product ids are not unique.");
  }
  items.forEach((row, index) => { row.auditItemKey = `${index + 1}:${row.id}`; });
  return {
    schemaVersion: 1,
    restaurantId: aromaPizzaRestaurantId,
    retrievedAt,
    sourceUrls: [aromaPizzaSourceUrls.toastMenu, aromaPizzaSourceUrls.readableTransport],
    itemCount: items.length,
    categoryCount: new Set(items.map((row) => row.category)).size,
    officialIngredientCount: 0,
    unavailableAllergenCount: items.length,
    configurableItemCount: items.filter((row) => row.isConfigurable).length,
    itemNameFingerprint: createHash("sha256")
      .update(items.map((row) => `${row.sourceProductId}\t${normalize(row.name)}`).join("\n"))
      .digest("hex"),
    sourceWarning: "The exact-address current Toast catalog publishes 199 standalone products. The restaurant's configured owner domain is currently compromised and serves unrelated gambling/SEO content, its Instagram could not be fetched, and exhaustive discovery found no current restaurant-issued allergen guide or disclosure. Toast is therefore restaurant-linked vendor menu evidence only. Every fixed allergen and cross-contact field remains unavailable; menu descriptions are retained solely as separate Ingredient Intelligence and never promoted to official evidence or negative assurances.",
    items,
  };
}

export function extractAromaPizzaToastMenu(text, { baselineNames = new Map() } = {}) {
  let category = null;
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^### (.+)$/);
    if (heading) {
      category = categorySet.has(heading[1]) ? heading[1] : null;
      continue;
    }
    if (!category) continue;
    const link = line.match(/^\*\s+\[(.*)\]\((https:\/\/order\.toasttab\.com\/online\/aroma-pizza-company-new\/item-[^)]+)\)$/);
    if (!link) continue;
    const sourceUrl = link[2];
    const { id, sourceProductId } = parseToastProductUrl(sourceUrl);
    const label = clean(link[1].replace(/!\[Image[^\]]*\]\([^)]*\)/g, " "));
    const description = clean(label.replace(/\s*\$\d+(?:\.\d{2})?\s*$/, "")) || null;
    items.push({
      id,
      sourceProductId,
      name: baselineNames.get(id) ?? displayNameFromId(id),
      category,
      description,
      sourceUrl,
    });
  }
  return { items, categoryCount: new Set(items.map((row) => row.category)).size };
}

function buildItem(row, manifest) {
  const ingredientText = [row.name, row.description].filter(Boolean).join(": ");
  const base = {
    auditItemKey: "",
    id: row.id,
    sourceProductId: row.sourceProductId,
    name: row.name,
    category: row.category,
    description: row.description,
    ingredientsText: row.description,
    imageUrl: null,
    isConfigurable: /\b(?:choice|choose|add topping|make your own|any pizza|toppings?|sauce|dipping)\b/i.test(ingredientText),
    allergenSourceType: "unavailable",
    allergens: [],
    mayContain: [],
    sourceType: "restaurant-linked-toast-menu-text",
    sourceUrls: [aromaPizzaSourceUrls.toastMenu, row.sourceUrl],
    sourceSummary: "The restaurant-linked Toast catalog supports this product and menu wording, but no current restaurant-issued allergen source was found. Fixed allergens, absence, and cross-contact remain unavailable; the description is shown only as separate Ingredient Intelligence.",
    evidence: [
      { sourceKind: "restaurant-linked-toast-menu-text", sourceUrl: aromaPizzaSourceUrls.toastMenu, text: ingredientText },
      { sourceKind: "restaurant-linked-toast-menu-text", sourceUrl: row.sourceUrl, text: ingredientText },
    ],
    variantGroup: row.category === "Specialty Pizzas" ? "Specialty Pizzas" : null,
  };
  return annotateMenuItemWithIngredientIntelligence(base, { manifest });
}

function supplement(id, name, category, uuid, description = null) {
  return Object.freeze({
    id,
    sourceProductId: uuid,
    name,
    category,
    description,
    sourceUrl: `${aromaPizzaSourceUrls.toastMenu}/item-${id}_${uuid}`,
  });
}

function parseToastProductUrl(sourceUrl) {
  const tail = new URL(sourceUrl).pathname.split("/").at(-1);
  const match = tail.match(/^item-(.+)_([0-9a-f]{8}-[0-9a-f-]{27})$/i);
  if (!match) throw new Error(`Invalid Aroma Pizza Toast product URL: ${sourceUrl}`);
  return { id: match[1], sourceProductId: match[2] };
}

function displayNameFromId(id) {
  return id
    .split("-")
    .map((word) => ({ pc: "PC", pcs: "pcs", xl: "XL", xlarge: "XL", med: "MED", w3: "w/3", w: "w/" })[word] ?? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ")
    .replace(/^(10|12|14|16) (?=.*Pizza)/, "$1'' ")
    .replace(/\b2l\b/i, "2L")
    .replace(/\b20oz\b/i, "20oz")
    .replace(/\b4045\b/g, "(40-45)")
    .replace(/\bNo Cheese\b/, "(no cheese)");
}

function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normalize(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAromaPizzaCatalog();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    configurableItemCount: snapshot.configurableItemCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
  }, null, 2));
}
