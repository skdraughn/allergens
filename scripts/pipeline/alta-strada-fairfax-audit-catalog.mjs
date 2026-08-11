import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAltaStradaFairfax = "replacement-alta-strada-fairfax-va-fairfax-va";
export const sourceUrlsAltaStradaFairfax = Object.freeze({
  home: "https://www.altastradarestaurant.com/",
  locations: "https://www.altastradarestaurant.com/locations",
  menuIndex: "https://www.altastradarestaurant.com/mosaic-district-menus",
  lunch: "https://www.altastradarestaurant.com/mosaic-district-lunch-menu",
  dinner: "https://www.altastradarestaurant.com/mosaic-district-dinner-menu",
  brunch: "https://www.altastradarestaurant.com/mosaic-district-brunch-menu",
  happyHour: "https://www.altastradarestaurant.com/mosaic-district-happy-hour-menu",
  orderIndex: "https://www.altastradarestaurant.com/order-online",
  sitemap: "https://www.altastradarestaurant.com/sitemap.xml",
});

const artifactRoot = `data/restaurant-verification/artifacts/${restaurantIdAltaStradaFairfax}`;
const sourceArtifacts = Object.freeze({
  lunch: `${artifactRoot}/official-mosaic-lunch.html`,
  dinner: `${artifactRoot}/official-mosaic-dinner.html`,
  brunch: `${artifactRoot}/official-mosaic-brunch.html`,
  happyHour: `${artifactRoot}/official-mosaic-happy-hour.html`,
});

const menuRows = [
  row("lunch", "Antipasti", "Whipped Ricotta", "Whipped Ricotta, Roasted Red Peppers, Chives, Rosemary Focaccia | 14", "Roasted Red Peppers, Chives, Rosemary Focaccia"),
  row("lunch", "Antipasti", "Organic Romaine Hearts", "Organic Romaine Hearts, Caesar Dressing, Garlicky Breadcrumbs, Parm | 13", "Caesar Dressing, Garlicky Breadcrumbs, Parm"),
  row("lunch", "Antipasti", "Fried Calamari", "Fried Calamari, Hot Peppers, Parsley, Lemon Aioli | 16", "Hot Peppers, Parsley, Lemon Aioli"),
  row("lunch", "Antipasti", "Baby Arugula Salad", "Baby Arugula Salad, Artichokes, Extra Virgin Olive Oil, Lemon, Parm | 15", "Artichokes, Extra Virgin Olive Oil, Lemon, Parm"),
  row("lunch", "Antipasti", "Nonna’s Slow Cooked Meatballs", "Nonna’s Slow Cooked Meatballs, Spicy Tomato Basil Sauce |15", "Spicy Tomato Basil Sauce"),
  row("lunch", "Antipasti", "Prosciutto di Parma", "Prosciutto di Parma, Mozzarella Balls, Honeydew Melon, Grilled Bread | 16", "Mozzarella Balls, Honeydew Melon, Grilled Bread"),
  row("lunch", "Antipasti", "Imported Burrata", "Imported Burrata, Cherry Tomatoes, Basil, Balsamic Glaze, Grilled Bread | 17", "Cherry Tomatoes, Basil, Balsamic Glaze, Grilled Bread"),
  row("lunch", "Antipasti", "Alta Strada World Famous Garlic Bread", "Alta Strada World Famous Garlic Bread, Tomato-Basil Dipping Sauce | 12", "Tomato-Basil Dipping Sauce"),
  row("lunch", "Pasta + Entrees", "Alta Strada Smashburger", "Alta Strada Smashburger, Melted Cheese, Pickles, Special Sauce, Toasted Brioche Bun, Fries | 18", "Melted Cheese, Pickles, Special Sauce, Toasted Brioche Bun, Fries"),
  row("lunch", "Pasta + Entrees", "Meatball Sub", "Meatball Sub, Mozzarella and Parmesan Cheese with Arugula Salad | 15", "Mozzarella and Parmesan Cheese with Arugula Salad"),
  row("lunch", "Pasta + Entrees", "Italian Sub", "Italian Sub, Prosciutto, Salami, Mozzarella, Pesto, Balsamic Vinaigrette, Arugula & Tomatoes with Fries | 15", "Prosciutto, Salami, Mozzarella, Pesto, Balsamic Vinaigrette, Arugula & Tomatoes with Fries"),
  row("lunch", "Pasta + Entrees", "Chicken Parm Sandwich", "Chicken Parm Sandwich on Ciabatta, Fries | 15", "On Ciabatta, Fries"),
  row("lunch", "Pasta + Entrees", "The Big Salad", "“The Big Salad”, Grilled Chicken, Field Greens, Tomatoes, Cucumbers, Chickpeas, Red Onion, House Vinaigrette | 17", "Grilled Chicken, Field Greens, Tomatoes, Cucumbers, Chickpeas, Red Onion, House Vinaigrette"),
  row("lunch", "Pasta + Entrees", "Spaghetti AOP", "Spaghetti AOP, San Marzano Tomatoes, Garlic, EVOO, Hot Pepper, Parsley | 16", "San Marzano Tomatoes, Garlic, EVOO, Hot Pepper, Parsley"),
  row("lunch", "Pasta + Entrees", "Penne Alla Vodka", "Penne Alla Vodka, Garlic, Basil, Creamy Tomato, Parmigiano | 16", "Garlic, Basil, Creamy Tomato, Parmigiano"),
  row("lunch", "Pasta + Entrees", "Rigatoni", "Rigatoni, Spicy Sausage Ragu, Rosemary, Parm | 17", "Spicy Sausage Ragu, Rosemary, Parm"),
  row("lunch", "Pasta + Entrees", "Chicken Milanese or Parmigiano", "Chicken Milanese, Baby Arugula, Ripe Tomato, Red Onion, Grilled Lemon | 19", "Baby Arugula, Ripe Tomato, Red Onion, Grilled Lemon", "Chicken Milanese"),
  row("lunch", "Pasta + Entrees", "Rockfish Picatta", "Rockfish Picatta, Lemon, Butter, Capers, Garlicky Greens, Roasted Yukon Potatoes | 28", "Lemon, Butter, Capers, Garlicky Greens, Roasted Yukon Potatoes"),
  row("lunch", "Pasta + Entrees", "Zucchini and Eggplant Parmigiano", "Zucchini and Eggplant Parmigiano, San Marzano Tomato, Mozzarella | 22", "San Marzano Tomato, Mozzarella"),
  row("lunch", "Pasta + Entrees", "Lasagna Bolognese", "Lasagna Bolognese, Layers of Pasta, Beef, Pork, Veal, Mozzarella and Ricotta Cheese | 28", "Layers of Pasta, Beef, Pork, Veal, Mozzarella and Ricotta Cheese"),

  row("dinner", "Antipasti", "Whipped Ricotta", "Whipped Ricotta, Roasted Red Peppers, Chives, Rosemary Focaccia | 14", "Roasted Red Peppers, Chives, Rosemary Focaccia"),
  row("dinner", "Antipasti", "Organic Romaine Hearts", "Organic Romaine Hearts, Caesar Dressing, Garlicky Breadcrumbs, Parm | 14", "Caesar Dressing, Garlicky Breadcrumbs, Parm"),
  row("dinner", "Antipasti", "Fried Calamari", "Fried Calamari, Hot Peppers, Fresh Parsley, Lemon Aioli | 17", "Hot Peppers, Fresh Parsley, Lemon Aioli"),
  row("dinner", "Antipasti", "Baby Arugula Salad", "Baby Arugula Salad, Artichokes, Extra Virgin Olive Oil, Lemon, Parm | 15", "Artichokes, Extra Virgin Olive Oil, Lemon, Parm"),
  row("dinner", "Antipasti", "Prosciutto di Parma", "Prosciutto di Parma, Mozzarella Balls, Honeydew Melon, Grilled Bread | 18", "Mozzarella Balls, Honeydew Melon, Grilled Bread"),
  row("dinner", "Antipasti", "Nonna’s Slow Cooked Meatballs", "Nonna’s Slow Cooked Meatballs, Spicy Tomato Basil Sauce | 16", "Spicy Tomato Basil Sauce"),
  row("dinner", "Antipasti", "Imported Burrata", "Imported Burrata, Cherry Tomatoes, Basil, Balsamic Glaze, Grilled Bread |18", "Cherry Tomatoes, Basil, Balsamic Glaze, Grilled Bread"),
  row("dinner", "Antipasti", "Alta Strada World Famous Garlic Bread", "Alta Strada World Famous Garlic Bread, Tomato-Basil Dipping Sauce | 12", "Tomato-Basil Dipping Sauce"),
  row("dinner", "Pasta + Entrees", "Spaghetti AOP", "Spaghetti AOP, San Marzano Tomatoes, Garlic, EVOO, Hot Pepper, Parsley | 22", "San Marzano Tomatoes, Garlic, EVOO, Hot Pepper, Parsley"),
  row("dinner", "Pasta + Entrees", "Penne Alla Vodka", "Penne Alla Vodka, Garlic, Basil, Creamy Tomato, Parmigiano | 23", "Garlic, Basil, Creamy Tomato, Parmigiano"),
  row("dinner", "Pasta + Entrees", "Rigatoni", "Rigatoni, Spicy Sausage Ragu, Rosemary, Parm | 24", "Spicy Sausage Ragu, Rosemary, Parm"),
  row("dinner", "Pasta + Entrees", "Potato Gnocchi", "Potato Gnocchi, Asparagus, Wild Mushrooms, Truffle, Butter, Parm | 26", "Asparagus, Wild Mushrooms, Truffle, Butter, Parm"),
  row("dinner", "Pasta + Entrees", "Chicken Milanese or Parmigiano", "Chicken Milanese or Parmigiano | 29", null),
  row("dinner", "Pasta + Entrees", "Grilled NY Strip", "Grilled NY Strip, Yukon Mashed Potatoes, Grilled Asparagus, Peppercorn Sauce | 47", "Yukon Mashed Potatoes, Grilled Asparagus, Peppercorn Sauce"),
  row("dinner", "Pasta + Entrees", "Rockfish Picatta", "Rockfish Picatta, Lemon, Butter, Capers, GarlicS, Roasted Yukon Potatoes | 34", "Lemon, Butter, Capers, Garlic, Roasted Yukon Potatoes"),
  row("dinner", "Pasta + Entrees", "Red Wine Braised Short Ribs", "Red Wine Braised Short Ribs, Creamy Polenta, Roasted Tri-Color Baby Carrots, Gremolata | 36", "Creamy Polenta, Roasted Tri-Color Baby Carrots, Gremolata"),
  row("dinner", "Pasta + Entrees", "Zucchini and Eggplant Parmigiano", "Zucchini and Eggplant Parmigiano, San Marzano Tomato, Mozzarella | 29", "San Marzano Tomato, Mozzarella"),
  row("dinner", "Pasta + Entrees", "Lasagna Bolognese", "Lasagna Bolognese, Layers of Pasta, Beef, Pork, Veal, Mozzarella and Ricotta Cheese | 28", "Layers of Pasta, Beef, Pork, Veal, Mozzarella and Ricotta Cheese"),

  row("happyHour", "Cicchetti", "House Mixed Olives", "House Mixed Olives | 5", null),
  row("happyHour", "Cicchetti", "Truffle Parmesan Fries", "Truffle Parmesan Fries | 8", null),
  row("happyHour", "Cicchetti", "Organic Romaine Hearts", "Caesar Salad | 8", null, "Caesar Salad"),
  row("happyHour", "Cicchetti", "Baby Arugula Salad", "Baby Arugula Salad | 8", null),
  row("happyHour", "Cicchetti", "Nonna’s Slow Cooked Meatballs", "Nonna’s Meatballs | 8", null, "Nonna’s Meatballs"),
  row("happyHour", "Cicchetti", "Whipped Ricotta", "Whipped Ricotta​ | 10", null),
  row("happyHour", "Cicchetti", "Fried Calamari", "Crispy Calamari | 14", null, "Crispy Calamari"),
  row("happyHour", "Cicchetti", "Prosciutto di Parma", "Prosciutto di Parma with Grilled Bread | 14", "With Grilled Bread", "Prosciutto di Parma with Grilled Bread"),
  row("happyHour", "Cicchetti", "Imported Burrata", "Creamy Burrata with Grilled Bread | 14", "With Grilled Bread", "Creamy Burrata with Grilled Bread"),
  row("happyHour", "Pasta", "Spaghetti AOP", "Spaghetti AOP", null),
  row("happyHour", "Pasta", "Penne Alla Vodka", "Penne alla Vodka", null),
  row("happyHour", "Pasta", "Cacio e Pepe", "Cacio e Pepe", null),
  row("happyHour", "Pasta", "Penne Alfredo", "Penne Alfredo", null),
  row("happyHour", "Happy Hour Entrees", "Alta Strada Smashburger", "Grass-fed Virginia Beef, Cheddar, House Pickles, Special Sauce, Brioche Bun Served w/ Side of Fries | 18", "Grass-fed Virginia Beef, Cheddar, House Pickles, Special Sauce, Brioche Bun Served w/ Side of Fries", "The Strada Burger"),

  brunchRow("Soft Scrambled Eggs", "SOFT SCRAMBLED EGGS | 14", ["Chives, Cheddar, Rosemary Potatoes, Grilled Bread", "Choice of Thick-cut Bacon or Apple Sausage"]),
  brunchRow("Farmer’s Market Omelette", "FARMER’S MARKET OMELETTE | 16", ["Mushrooms, Goat Cheese, Tomatoes, Grilled Bread, Rosemary Potatoes", "Choice of Thick-cut Bacon or Apple Sausage"]),
  brunchRow("French Toast", "FRENCH TOAST | 18", ["Topped with Citrus Strawberries, Maple Syrup and Powdered Sugar"]),
  brunchRow("Prosciutto di Parma Benedict", "PROSCIUTTO DI PARMA BENEDICT | 21", ["Crostini, Bearnaise, Poached Eggs, Rosemary Potatoes"]),
  brunchRow("Crab Cake Benedict", "CRAB CAKE BENEDICT | 25", ["English Muffin, Poached Egg, Bearnaise Sauce and Mixed Green Salad"]),
  brunchRow("Short Rib Hash", "SHORT RIB HASH | 18", ["Potatoes, Caramelized Onions, Bearnaise and Poached Egg"]),
  brunchRow("Spaghetti Carbonara", "SPAGHETTI CARBONARA | 24", ["Crispy Pancetta, Soft Egg, Parmigiano"]),
  brunchRow("Breakfast Short Rib Sandwich", "BREAKFAST SHORT RIB SANDWICH | 18", ["Cheddar Cheese, Fried Egg, Arugula, Caramelized Onion Ailoi with Fries"]),
  brunchRow("Smoked Salmon Avocado Toast", "SMOKED SALMON AVOCADO TOAST | 18", ["Crostini topped with Avocado, Chili Flakes, EVOO, Arugula, and Smoked Salmon"]),
  brunchRow("Bruschetta Scramble", "BRUSCHETTA SCRAMBLE | 18", ["Baguette topped with Scrambled Eggs, Roasted Tomatoes, Sauteed Shrimp, Spicy Mayo and Mascarpone"]),
];

const signalOverrides = new Map([
  [normalize("Chicken Milanese or Parmigiano"), ["wheat", "gluten"]],
  [normalize("Cacio e Pepe"), ["milk", "wheat", "gluten"]],
  [normalize("French Toast"), ["egg", "wheat", "gluten"]],
]);

export async function buildAltaStradaFairfaxAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const sourceLines = new Map();
  for (const [key, artifact] of Object.entries(sourceArtifacts)) {
    const html = await readFile(artifact, "utf8");
    const $ = cheerio.load(html);
    sourceLines.set(key, new Set($(".sqs-html-content p").map((_index, element) => clean($(element).text())).get().filter(Boolean)));
  }

  const itemsByName = new Map();
  for (const [order, spec] of menuRows.entries()) {
    const lines = sourceLines.get(spec.sourceKey);
    for (const requiredLine of spec.requiredLines) {
      if (!lines?.has(clean(requiredLine))) {
        throw new Error(`Missing Alta Strada ${spec.sourceKey} source row: ${requiredLine}`);
      }
    }
    addPresentation(itemsByName, spec, order);
  }

  const items = [...itemsByName.values()]
    .map(finalizeItem)
    .sort((left, right) => left.auditOrder - right.auditOrder)
    .map(({ auditOrder: _auditOrder, ...item }) => item);
  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((item) => normalize(item.name)).sort().join("\n"))
    .digest("hex");
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;

  if (items.length !== 37 || presentationCount !== 62 || new Set(items.map((item) => item.id)).size !== 37) {
    throw new Error(`Alta Strada Fairfax current manifest changed: ${items.length} formulations and ${presentationCount} presentations.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAltaStradaFairfax,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAltaStradaFairfax),
    itemCount: items.length,
    presentationCount,
    itemNameFingerprint,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "Alta Strada publishes current restaurant-issued Mosaic lunch, dinner, brunch, and happy-hour menu text, but no complete recipe-level allergen matrix or item-level cross-contact disclosure. Positive signals are limited to fixed ingredient wording and mandatory named formats. Optional add-ons, selectable preparations, variable sauces, general culinary assumptions, and absent recipes are not promoted into fixed or cross-contact claims; unsupported rows remain unavailable.",
    items,
  };
}

function row(sourceKey, category, canonicalName, requiredLine, description, sourceName = canonicalName) {
  return { sourceKey, category, canonicalName, sourceName, description, requiredLines: [requiredLine] };
}

function brunchRow(canonicalName, title, descriptions) {
  return {
    sourceKey: "brunch",
    category: "Brunch",
    canonicalName,
    sourceName: canonicalName,
    description: descriptions.join(". "),
    requiredLines: [title, ...descriptions],
  };
}

function addPresentation(itemsByName, spec, order) {
  const key = normalize(spec.canonicalName);
  let item = itemsByName.get(key);
  if (!item) {
    item = {
      auditOrder: order,
      name: spec.canonicalName,
      category: spec.category,
      description: spec.description,
      aliases: [],
      presentations: [],
      sourceUrls: new Set(),
    };
    itemsByName.set(key, item);
  }
  if (spec.description && (!item.description || spec.description.length > item.description.length)) item.description = spec.description;
  if (normalize(spec.sourceName) !== normalize(item.name) && !item.aliases.some((alias) => normalize(alias) === normalize(spec.sourceName))) {
    item.aliases.push(spec.sourceName);
  }
  const sourceUrl = sourceUrlsAltaStradaFairfax[spec.sourceKey];
  item.presentations.push({
    category: spec.category,
    description: spec.description,
    sourceName: spec.sourceName,
    sourceUrls: [sourceUrl],
  });
  item.sourceUrls.add(sourceUrl);
}

function finalizeItem(item) {
  const allergens = reviewedSignals(item);
  return {
    auditOrder: item.auditOrder,
    auditItemKey: `${item.auditOrder + 1}:${slugify(item.name)}`,
    id: slugify(item.name),
    name: item.name,
    category: item.category,
    description: item.description,
    ingredientsText: item.description,
    imageUrl: null,
    isConfigurable: item.name === "Chicken Milanese or Parmigiano",
    aliases: item.aliases,
    presentations: item.presentations,
    sourceUrls: [...item.sourceUrls],
    sourceType: "restaurant-issued-squarespace-menu",
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
  };
}

function reviewedSignals(item) {
  const override = signalOverrides.get(normalize(item.name));
  if (override) return orderedAllergens(override);
  const text = normalize([item.name, ...item.presentations.flatMap((presentation) => [presentation.sourceName, presentation.description])].join(" "));
  const signals = [];
  if (/\b(?:ricotta|parm|parmesan|parmigiano|mozzarella|burrata|butter|creamy|cheese|cheddar|goat cheese|mascarpone|cacio|alfredo)\b/.test(text)) signals.push("milk");
  if (/\b(?:eggs?|omelette|scrambled|scramble|carbonara)\b/.test(text)) signals.push("egg");
  if (/\b(?:focaccia|breadcrumbs?|bread|brioche|subs?|ciabatta|spaghetti|penne|rigatoni|pasta|gnocchi|milanese|lasagna|crostini|muffin|sandwich|toast|baguette|bruschetta)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:rockfish|salmon)\b/.test(text)) signals.push("fish");
  if (/\b(?:calamari|shrimp|crab)\b/.test(text)) signals.push("shellfish");
  return orderedAllergens(signals);
}

function clean(value) {
  return String(value ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&amp;/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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
  const snapshot = await buildAltaStradaFairfaxAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAltaStradaFairfax}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
