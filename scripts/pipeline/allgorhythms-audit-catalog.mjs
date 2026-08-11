import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

import { extractJsonMenuFragmentItems } from "./legacy-scrape-engine.mjs";

export const restaurantIdAllGoRhythms = "osm-allgorhythms-12234974276";
export const sourceUrlsAllGoRhythms = Object.freeze({
  home: "https://gorhythms.com/",
  menu: "https://gorhythms.com/food-menu",
  locationMenu: "https://gorhythms.com/sterling-dulles-town-center-allgorhythms-bar-and-restaurant-food-menu",
  about: "https://gorhythms.com/about",
  spotApps: "https://tmt.spotapps.co/ordering-menu/?spot_id=321717",
});

const artifactRoot = `data/restaurant-verification/artifacts/${restaurantIdAllGoRhythms}`;
const officialMenuArtifact = `${artifactRoot}/official-food-menu.html`;
const spotAppsArtifact = `${artifactRoot}/linked-spotapps-ordering.html`;

const allergensByCanonicalName = new Map(Object.entries({
  "Boom Boom Cauli Bites (Cauliflower Bites)": [],
  "Chicken Wings Harmony": [],
  "Chips and Chords(Chips)": [],
  "Nacho Jam Session": ["milk"],
  "Fish-tastic Bites(Fish Bites)": ["fish"],
  "Dynamite Dragon Shrimp": ["shellfish"],
  "Lettuce Wraps": [],
  "Hummus Harmony": ["wheat", "gluten"],
  "Personal Pizza": ["milk", "wheat", "gluten"],
  "Murgh Pakoda": [],
  "Rhythm & Spice Sukha": [],
  "Crispy Spice 65": [],
  "Bold Chilli Bites": [],
  "Pop Start Poppers": [],
  "Tornado Potato": [],
  "Corn Cheese Balls": ["milk"],
  "Chicken Lollipop": [],
  "Signature Chaat": ["milk"],
  "Tomato Tango": ["milk", "wheat", "gluten"],
  "Dumpling Dance": ["wheat", "gluten", "soy"],
  "Chicken Corn Soup": [],
  "Grilled Dumplings": ["wheat", "gluten", "soy"],
  "Grilled Paneer": ["milk"],
  "Signature Kabob Sizzler": [],
  "Salmon Serenade": ["fish"],
  "Lamb Chop Lullaby": [],
  "Grilled Sea Bass Fish": ["fish"],
  "Tandoori Salmon": ["fish"],
  "Veggie Kabob": [],
  "Paneer Tikka Tango": ["milk"],
  "Falafel Funk": [],
  "Gyro Salad": [],
  "Veggie Delight Burger": ["wheat", "gluten"],
  "Spicy Chicken Shuffle burger": ["wheat", "gluten"],
  "Mushroom Melody swiss smash burger": ["milk", "wheat", "gluten"],
  "Philly Cheese Steak": ["milk", "wheat", "gluten"],
  "Veggie Delight Wrap": ["milk", "wheat", "gluten"],
  "Kabob Wrap": ["wheat", "gluten"],
  "Gyro wrap": ["wheat", "gluten"],
  "Quesadilla": ["milk"],
  "Burrito Wrap": ["milk", "wheat", "gluten"],
  "Dosa Disco": [],
  "Taco Twist": [],
  "Fajita Fiesta": [],
  "Pasta Prelude": ["milk", "wheat", "gluten"],
  "Family Combo": [],
  "Mughal Vegetable Melodies": ["milk"],
  "Butter Ballad": ["milk"],
  "Cashew Curry": ["tree-nut"],
  "Biryani Beat": [],
  "Boogie Fried Rice": [],
  "Curry Delight": [],
  "Tikka Masala": ["milk"],
  "Kadai Curry": [],
  "Goat Rogan Josh": ["milk"],
  "Fries": [],
  "Waffle Waltz": [],
  "SAUTÉED SERENADE": [],
  "Garlic Groove Rice": [],
  "Rhythmic Rice": [],
  "Pita Pas De Deux": ["wheat", "gluten"],
  "Coleslaw Chorus": [],
  "Naan/ Bread": ["wheat", "gluten"],
  "Blast Naan": ["wheat", "gluten"],
  "Paratha": ["wheat", "gluten"],
  "Hot Molten Chocolate Lullaby": ["milk", "egg", "wheat", "gluten"],
  "Dulce Dance": ["milk"],
  "Gulab Groove": ["milk"],
  "Baklava": ["milk", "tree-nut", "wheat", "gluten"],
  "Double Ka Meetha Flambee": ["milk", "tree-nut", "wheat", "gluten"],
  "Mango Chia Seed Pudding": ["tree-nut"],
  "Caramel Tres Leches Cake": ["milk", "egg", "wheat", "gluten"],
  "Dubai Chocolate Kunafa Nest": ["wheat", "gluten"],
  "Fish and Chips": ["wheat", "gluten", "fish"],
  "Dragon Shrimp": ["shellfish"],
  "Butter Chicken": ["milk"],
}));

const canonicalAliases = new Map([
  [normalize("Crispy Spice"), "Crispy Spice 65"],
  [normalize("Signature Kabob Sizzle"), "Signature Kabob Sizzler"],
]);

const configurableNames = new Set([
  "Chicken Wings Harmony",
  "Chips and Chords(Chips)",
  "Nacho Jam Session",
  "Dynamite Dragon Shrimp",
  "Lettuce Wraps",
  "Personal Pizza",
  "Rhythm & Spice Sukha",
  "Crispy Spice 65",
  "Bold Chilli Bites",
  "Signature Chaat",
  "Signature Kabob Sizzler",
  "Gyro Salad",
  "Philly Cheese Steak",
  "Veggie Delight Wrap",
  "Kabob Wrap",
  "Gyro wrap",
  "Quesadilla",
  "Burrito Wrap",
  "Dosa Disco",
  "Taco Twist",
  "Fajita Fiesta",
  "Pasta Prelude",
  "Butter Ballad",
  "Biryani Beat",
  "Boogie Fried Rice",
  "Curry Delight",
  "Tikka Masala",
  "Kadai Curry",
  "Fries",
  "Naan/ Bread",
]);

export async function buildAllGoRhythmsAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  officialHtml,
  spotAppsHtml,
} = {}) {
  const [officialSource, linkedSource] = await Promise.all([
    officialHtml ?? readFile(officialMenuArtifact, "utf8"),
    spotAppsHtml ?? readFile(spotAppsArtifact, "utf8"),
  ]);
  const itemsByName = new Map();

  for (const presentation of extractOfficialPresentations(officialSource)) {
    addPresentation(itemsByName, presentation);
  }
  for (const presentation of extractSpotAppsPresentations(linkedSource)) {
    addPresentation(itemsByName, presentation);
  }

  const items = [...itemsByName.values()]
    .map((item, index) => finalizeItem(item, index))
    .sort((left, right) => left.auditOrder - right.auditOrder)
    .map(({ auditOrder: _auditOrder, ...item }) => item);

  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;

  if (
    items.length !== 76 ||
    presentationCount !== 171 ||
    categoryCount !== 9 ||
    new Set(items.map((item) => item.id)).size !== items.length
  ) {
    throw new Error(
      `AllGoRhythms current manifest changed: ${items.length} formulations, ${presentationCount} presentations, ${categoryCount} categories.`,
    );
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAllGoRhythms,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAllGoRhythms),
    presentationCount,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "AllGoRhythms publishes a restaurant-issued main and event menu plus a restaurant-linked SpotApps ordering catalog, but no recipe-level allergen matrix or item-level cross-contact disclosure. Positive signals use only fixed published ingredients and unavoidable named formats. Selectable proteins, sides, sauces, and optional butter or cheese are not promoted into fixed claims; the site's general allergy-accommodation and gluten-free/vegan statements are not treated as item-level negative claims. Unsupported rows remain unavailable.",
    items,
  };
}

function extractOfficialPresentations(html) {
  const $ = cheerio.load(html);
  const rows = [];
  for (const [menuId, menuName] of [["631994", "Main Menu"], ["1139171", "EVENT MENU"]]) {
    $(`.menu_${menuId} section`).each((_sectionIndex, section) => {
      const category = clean($(section).find("h2").first().text());
      $(section).find(".food-item-holder").each((_itemIndex, element) => {
        const sourceName = clean($(element).find(".food-item-title h3").first().text());
        if (!sourceName) return;
        rows.push({
          category,
          description: clean($(element).find(".food-item-description").first().text()) || null,
          menuName,
          prices: $(element).find(".food-price").map((_index, price) => clean($(price).text())).get(),
          sourceName,
          sourceType: "restaurant-issued-html-menu",
          sourceUrl: sourceUrlsAllGoRhythms.menu,
        });
      });
    });
  }
  return rows;
}

function extractSpotAppsPresentations(html) {
  const restaurant = { category: "bar_and_grill", id: restaurantIdAllGoRhythms, name: "AllGoRhythms" };
  return extractJsonMenuFragmentItems(html, restaurant, sourceUrlsAllGoRhythms.spotApps, "menu")
    .filter((record) => record.sourceKind === "spotapps-nuxt-menu")
    .map((record) => ({
      category: record.category,
      description: record.description || null,
      menuName: record.variantGroup,
      prices: [],
      sourceName: record.name,
      sourceType: "restaurant-linked-ordering-menu",
      sourceUrl: sourceUrlsAllGoRhythms.spotApps,
    }));
}

function addPresentation(itemsByName, presentation) {
  const canonicalName = canonicalNameFor(presentation.sourceName);
  const key = normalize(canonicalName);
  let item = itemsByName.get(key);
  if (!item) {
    item = {
      auditOrder: itemsByName.size,
      aliases: [],
      category: presentation.category,
      description: presentation.description,
      name: canonicalName,
      presentations: [],
      sourceTypes: new Set(),
      sourceUrls: new Set(),
    };
    itemsByName.set(key, item);
  }

  if (!item.description && presentation.description) item.description = presentation.description;
  if (
    normalize(presentation.sourceName) !== normalize(item.name) &&
    !item.aliases.some((alias) => normalize(alias) === normalize(presentation.sourceName))
  ) {
    item.aliases.push(presentation.sourceName);
  }
  item.presentations.push({
    category: presentation.category,
    description: presentation.description,
    menuName: presentation.menuName,
    prices: presentation.prices,
    sourceName: presentation.sourceName,
    sourceUrls: [presentation.sourceUrl],
  });
  item.sourceTypes.add(presentation.sourceType);
  item.sourceUrls.add(presentation.sourceUrl);
}

function finalizeItem(item, index) {
  if (!allergensByCanonicalName.has(item.name)) {
    throw new Error(`AllGoRhythms allergen adjudication missing for ${item.name}.`);
  }
  const allergens = orderedAllergens(allergensByCanonicalName.get(item.name));
  const sourceTypes = [...item.sourceTypes];
  return {
    auditItemKey: `${index + 1}:${slugify(item.name)}`,
    auditOrder: item.auditOrder,
    id: slugify(item.name),
    name: item.name,
    category: normalizeCategory(item.category),
    description: item.description,
    ingredientsText: item.description,
    imageUrl: null,
    isConfigurable: configurableNames.has(item.name),
    aliases: item.aliases,
    presentations: item.presentations,
    sourceUrls: [...item.sourceUrls],
    sourceType: sourceTypes.length > 1 ? "restaurant-issued-and-linked-menu" : sourceTypes[0],
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
  };
}

function canonicalNameFor(value) {
  return canonicalAliases.get(normalize(value)) ?? value;
}

function normalizeCategory(value) {
  return /^entrees$/i.test(value) ? "Entrees" : value;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAllGoRhythmsAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAllGoRhythms}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
