import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";

export const armettasRestaurantId = "osm-armetta-s-italian-pizzeria-3935138350";
export const armettasReviewedAt = "2026-07-15T10:27:30.497Z";
export const armettasSourceUrls = Object.freeze({
  ownerMenu: "https://armettasrestaurant.com/menu",
  retiredOwnerMenuAlias: "https://armettasrestaurant.com/armettas-miniville-menu",
  readableTransport: "https://r.jina.ai/http://armettasrestaurant.com/menu",
});

const artifactPath =
  `data/restaurant-verification/artifacts/${armettasRestaurantId}/armettas-current-menu-jina-transport.txt`;
const outputPath =
  `data/restaurant-verification/repairs/${armettasRestaurantId}/corrected-menu.json`;

const categoryOrder = Object.freeze([
  "Subs 8\" (Lunch Special)",
  "Pasta (Lunch Special)",
  "Appetizers",
  "Salads",
  "Small Subs 8\"",
  "Large Subs 12\"",
  "Small Pizza 10\"",
  "Medium Pizza 12\"",
  "Large Pizza 16\"",
  "Stuffed Pizza",
  "Wraps and Burgers",
  "Traditional Entrées",
  "Chicken Entrées",
  "Seafood Entrées",
  "Kids Menu",
  "Desserts",
  "Sides",
  "Dressings",
  "To Go Drinks",
]);
const categorySet = new Set(categoryOrder);

export async function buildArmettasCatalog({
  menuText,
  retrievedAt = armettasReviewedAt,
} = {}) {
  const [resolvedText, manifest] = await Promise.all([
    menuText ?? readFile(artifactPath, "utf8"),
    getDefaultIngredientIntelligenceManifest(),
  ]);
  const extracted = extractArmettasOwnerMenu(resolvedText);
  if (extracted.items.length !== 225 || extracted.categoryCount !== 19) {
    throw new Error(
      `Armetta's current owner-menu contract changed: ${JSON.stringify({ items: extracted.items.length, categories: extracted.categoryCount })}.`,
    );
  }
  const items = extracted.items.map((row) => buildItem(row, manifest));
  if (new Set(items.map((row) => row.id)).size !== items.length) {
    throw new Error("Armetta's current product ids are not unique.");
  }
  items.forEach((row, index) => { row.auditItemKey = `${index + 1}:${row.id}`; });
  const snapshot = {
    schemaVersion: 1,
    restaurantId: armettasRestaurantId,
    retrievedAt,
    sourceUrls: Object.values(armettasSourceUrls),
    itemCount: items.length,
    categoryCount: extracted.categoryCount,
    officialIngredientCount: items.filter((row) => row.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((row) => row.allergenSourceType === "unavailable").length,
    configurableItemCount: items.filter((row) => row.isConfigurable).length,
    itemNameFingerprint: createHash("sha256")
      .update(items.map((row) => `${row.id}\t${normalize(row.name)}`).join("\n"))
      .digest("hex"),
    sourceWarning: "The current owner menu publishes 225 products across 19 categories. Its retired Minnieville alias redirects to the same menu, while a transient indexed view exposed stale products that disappear when their item links are opened against the current catalog. The frozen extraction mixed 238 products and modifier choices, misassigned categories, and labeled 158 inferred positive signals as official despite recording that no official allergen source was found. The corrected catalog retains current standalone products only. Direct positive ingredients and unambiguous product forms are represented as partial restaurant-issued ingredient evidence; missing terms are never negative or cross-contact assurances, and configurable gluten-free pasta choices are not labeled with fixed wheat or gluten.",
    items,
  };
  return snapshot;
}

export function extractArmettasOwnerMenu(text) {
  let category = null;
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      category = categorySet.has(heading[1]) ? heading[1] : null;
      continue;
    }
    if (!category) continue;
    const link = line.match(/^\[(.+)\]\((https?:\/\/[^)]+\/menu\?item=[^)]+)\)$/);
    if (!link) continue;
    const label = link[1]
      .replace(/\s*!\[Image[^\]]*\]\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const product = label.match(/^(.*?) \$(\d+(?:\.\d{2})?)\+?(?:\s+(.*))?$/);
    if (!product) throw new Error(`Could not parse Armetta's product row: ${line}`);
    const sourceUrl = link[2].replace(/^http:/, "https:");
    const token = new URL(sourceUrl).searchParams.get("item");
    if (!token) throw new Error(`Armetta's product lacks an item token: ${sourceUrl}`);
    items.push({
      id: slugify(token.replace(/-[A-Za-z0-9]{4}$/, "")),
      sourceProductToken: token,
      name: clean(product[1]),
      category,
      description: clean(product[3]) || null,
      sourceUrl,
    });
  }
  items.sort((left, right) =>
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category),
  );
  return { items, categoryCount: new Set(items.map((row) => row.category)).size };
}

function buildItem(row, manifest) {
  const ingredientText = [row.name, row.description].filter(Boolean).join(": ");
  const allergens = explicitAllergens(row);
  const isOfficial = allergens.length > 0;
  const base = {
    auditItemKey: "",
    id: row.id,
    sourceProductId: row.sourceProductToken,
    name: row.name,
    category: row.category,
    description: row.description,
    ingredientsText: row.description,
    imageUrl: null,
    isConfigurable: isConfigurable(row),
    allergenSourceType: isOfficial ? "official-ingredients" : "unavailable",
    allergens,
    mayContain: [],
    sourceType: "restaurant-issued-menu-text",
    sourceUrls: [armettasSourceUrls.ownerMenu, row.sourceUrl],
    sourceSummary: isOfficial
      ? "Armetta's current owner menu directly names these positive allergen ingredients or an unambiguous product form. This is partial menu evidence, not a complete allergen matrix, negative claim, or cross-contact assurance."
      : "Armetta's current owner menu supports this product but does not publish enough direct ingredient detail for a fixed top-allergen claim. Missing terms are not negative or cross-contact assurances.",
    evidence: [armettasSourceUrls.ownerMenu, row.sourceUrl].map((sourceUrl) => ({
      sourceKind: "restaurant-issued-menu-text",
      sourceUrl,
      text: ingredientText,
    })),
    variantGroup: /Lunch Special/.test(row.category) ? "Lunch Special" : null,
  };
  return annotateMenuItemWithIngredientIntelligence(base, { manifest });
}

export function explicitAllergens(row) {
  const text = normalize(`${row.name} ${row.description ?? ""}`);
  const formText = normalize(`${row.category} ${row.name} ${row.description ?? ""}`);
  const fixedText = text
    .replace(/\bwith the option of\b.*$/g, " ")
    .replace(/\bget it with\b.*$/g, " ");
  const found = new Set();
  const configurableGlutenFree = /create your own pasta/.test(text) && /gluten free/.test(text);
  if (/\b(?:milk|mozzarella|provolone|ricotta|parmigiano|parmigiana|parmesan|cheese|cheesecake|cream|butter|feta|mascarpone|gelato|alfredo)\b/.test(fixedText)) {
    if (!/create your own pasta/.test(text)) found.add("milk");
  }
  if (/\b(?:egg|eggs|mayonnaise|mayo)\b/.test(fixedText)) found.add("egg");
  if (/\b(?:fish|flounder|tuna)\b/.test(fixedText)) found.add("fish");
  if (/\b(?:shrimp|crab|mussel|mussels|clam|clams|lobster|calamari)\b/.test(fixedText)) found.add("shellfish");
  if (/\bhazelnut/.test(fixedText)) found.add("tree-nut");
  if (/\bmustard\b/.test(fixedText)) found.add("mustard");
  if (/choice of either cheese or ground beef/.test(text) || /blue cheese or ranch/.test(text)) {
    found.delete("milk");
  }
  if (!configurableGlutenFree && hasUnambiguousWheatForm(formText)) {
    found.add("wheat");
    found.add("gluten");
  }
  return [...found].sort();
}

function hasUnambiguousWheatForm(text) {
  return /\b(?:whole wheat|bread|breadcrumbs|breaded|ciabatta|batter|battered|subs?|hoagie|wraps?|burgers?|pizzas?|calzone|turnover|stromboli|roll|pasta|spaghetti|penne|rigatoni|fettuccine|linguini|linguine|lasagna|ravioli|tortellini|ziti|shells|cannoli|tiramisu|cake)\b/.test(text);
}

function isConfigurable(row) {
  return /\b(?:choice|choose|option|pick one|custom|half\/half|create your own|either|or)\b/i.test(
    `${row.name} ${row.description ?? ""}`,
  );
}

function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normalize(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
function slugify(value) {
  return normalize(value).replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildArmettasCatalog();
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
