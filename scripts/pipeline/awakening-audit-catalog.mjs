import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const awakeningRestaurantId =
  "replacement-awakening-bar-and-grill-washington-dc";
export const awakeningSourceUrls = Object.freeze({
  home: "https://awakeningdc.com/",
  menu: "https://awakeningdc.com/food-menu",
});

const menuArtifact =
  `data/restaurant-verification/artifacts/${awakeningRestaurantId}/official-food-menu-current.html`;
const menuDefinitions = Object.freeze([
  { id: "1117292", name: "Lunch & Dinner" },
  { id: "1231505", name: "Brunch Menu" },
  { id: "1240778", name: "Happy Hour" },
]);
const excludedPromotions = new Set([
  "1240778:All Bar Bites and Specialty Cocktails",
]);

const allergensByPresentation = new Map(Object.entries({
  "1117292:Crab Rolls": ["shellfish"],
  "1117292:Candied Bacon Deviled Eggs": ["egg"],
  "1117292:Crispy Green Beans": [],
  "1117292:Old Bay Shrimp": ["shellfish"],
  "1117292:Wings": [],
  "1117292:Fried Green Tomatoes": ["milk"],
  "1117292:Half Smoke": ["milk"],
  "1117292:Veggie Roll": [],
  "1117292:Gouda Burger Sliders": ["milk"],
  "1117292:Avocado Bruschetta": [],
  "1117292:Black & Blue Bites": ["milk"],
  "1117292:Crab Cake Sandwich": ["shellfish"],
  "1117292:Uptown Burger": ["milk"],
  "1117292:Impossible Burger": [],
  "1117292:Awakening Burger": ["milk"],
  "1117292:Cream of Crab Soup": ["milk", "shellfish"],
  "1117292:Loaded Chili": ["milk"],
  "1117292:Chopped Kale Salad": ["milk"],
  "1117292:House Salad": [],
  "1117292:Caesar Salad": ["milk"],
  "1117292:Blackened Salmon": ["fish"],
  "1117292:Jumbo Lump Crabcakes": ["shellfish"],
  "1117292:Lamb Chops": ["milk"],
  "1117292:Rasta Pasta": [],
  "1117292:Chicken & Waffles": ["milk"],
  "1117292:Pasta Primavera": [],
  "1117292:Steak Frites": [],
  "1117292:Mac N Cheese": ["milk"],
  "1117292:Braised Kale": [],
  "1117292:Garlic Green Beans": [],
  "1117292:House Fries": ["milk"],
  "1117292:Mimi’s Homemade Biscuits (2)": ["milk"],
  "1117292:Rock Creek Peach Cake": ["milk"],
  "1117292:Million - Dollar Brownie": ["milk"],
  "1117292:Bourbon Bread Pudding": [],
  "1231505:Chicken & Waffles": [],
  "1231505:Artisanal Avocado Bruschetta": [],
  "1231505:Shrimp & Grits": ["milk", "shellfish"],
  "1231505:BLT": [],
  "1231505:Sirloin Steak & Eggs With Chimichurri": ["egg"],
  "1231505:Cognac-Scented Crabcake Benedict": ["egg", "shellfish"],
  "1231505:Sirloin Hash": ["egg"],
  "1231505:Bread Pudding French Toast": ["milk"],
  "1231505:Sweet Cream Grits & Berries": ["milk"],
  "1231505:Mimi's Homemade Buttermilk Biscuits": ["milk"],
  "1240778:Crispy Green Beans": [],
  "1240778:Candied Bacon Deviled Eggs": ["egg"],
  "1240778:Mambo Wings (4)": [],
  "1240778:Select Draft Beers": [],
  "1240778:House Mixed Drinks": [],
}));

export async function buildAwakeningAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  menuHtml,
} = {}) {
  const html = menuHtml ?? await readFile(menuArtifact, "utf8");
  const $ = cheerio.load(html);
  const items = [];
  const rawCards = [];

  for (const menu of menuDefinitions) {
    $(`.menu_${menu.id} section`).each((_sectionIndex, section) => {
      const sourceCategory = clean($(section).find("h2.menu-section-name").first().text());
      $(section).find(".food-item-holder").each((_itemIndex, element) => {
        const name = clean($(element).find(".food-item-title").first().text());
        if (!name) return;
        const sourceItemId = String($(element).attr("id") ?? "").replace(/^menu_item_/, "");
        const key = `${menu.id}:${name}`;
        rawCards.push(key);
        if (excludedPromotions.has(key)) return;
        if (!allergensByPresentation.has(key)) {
          throw new Error(`Missing Awakening allergen adjudication for ${key}.`);
        }
        const description = clean($(element).find(".food-item-description").first().text()) || null;
        const allergens = [...allergensByPresentation.get(key)];
        const baseId = slugify(name);
        const duplicate = items.some((item) => item.id === baseId);
        const category = menu.name === "Lunch & Dinner"
          ? sourceCategory
          : menu.name.replace(/ Menu$/, "");
        items.push({
          auditItemKey: `${items.length + 1}:${menu.id}:${baseId}`,
          id: duplicate ? `${baseId}-${slugify(category)}` : baseId,
          sourceItemId,
          name,
          category,
          description,
          ingredientsText: description,
          imageUrl: null,
          isConfigurable: ["Salads", "Mains"].includes(sourceCategory) ||
            ["Wings", "Cream of Crab Soup", "Loaded Chili"].includes(name),
          allergens,
          mayContain: [],
          allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
          sourceType: "restaurant-issued-html-menu",
          sourceUrls: [awakeningSourceUrls.menu],
          sourceSummary: allergens.length > 0
            ? "Direct positive ingredients or unambiguous food identities from the restaurant-issued current menu are represented as partial ingredient evidence. The menu is not a complete allergen matrix."
            : "The restaurant-issued current menu does not provide enough direct ingredient or allergen detail for this item. Allergen status remains unavailable.",
          evidence: [{
            sourceKind: "restaurant-issued-menu-text",
            sourceUrl: awakeningSourceUrls.menu,
            text: description ?? name,
          }],
          variantGroup: `${menu.name} — ${sourceCategory}`,
        });
      });
    });
  }

  const ingredientSignalCount = items.filter(
    (item) => item.allergenSourceType === "official-ingredients",
  ).length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  if (
    rawCards.length !== 51 ||
    items.length !== 50 ||
    new Set(items.map((item) => item.id)).size !== 50 ||
    ingredientSignalCount !== 31 ||
    unavailableAllergenCount !== 19 ||
    allergensByPresentation.size !== 50
  ) {
    throw new Error(
      `Awakening manifest changed: ${rawCards.length} raw, ${items.length} published, ` +
        `${ingredientSignalCount} ingredient-positive, ${unavailableAllergenCount} unavailable.`,
    );
  }

  return {
    schemaVersion: 1,
    restaurantId: awakeningRestaurantId,
    retrievedAt,
    sourceUrls: [awakeningSourceUrls.home, awakeningSourceUrls.menu],
    rawCardCount: rawCards.length,
    excludedPromotionCount: 1,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount,
    unavailableAllergenCount,
    sourceWarning: "The current restaurant-issued menu provides product names and narrative descriptions, but no allergen matrix, allergen legend, negative claims, or cross-contact disclosure. Only explicit positive ingredients and unavoidable named food identities are represented as partial restaurant-issued ingredient evidence. Culinary formulation assumptions remain Ingredient Intelligence only. Two service-specific Chicken & Waffles presentations and repeated Happy Hour products remain distinct offerings, and beverage rows are placed last.",
    items,
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAwakeningAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${awakeningRestaurantId}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "corrected-menu.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    rawCardCount: snapshot.rawCardCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
