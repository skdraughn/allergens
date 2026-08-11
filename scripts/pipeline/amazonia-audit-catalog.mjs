import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAmazonia = "amazonia-dc";
export const sourceUrlsAmazonia = Object.freeze({
  home: "https://www.causadc.com/",
  amazonia: "https://www.causadc.com/amazonia",
  dinner: "https://www.causadc.com/menus/amazonia-dinner",
  dessert: "https://www.causadc.com/menus/amazonia-dessert",
  drinks: "https://www.causadc.com/menus/amazonia-drinks",
  sourHour: "https://www.causadc.com/menus/amazonia-sour-hour",
  sitemap: "https://www.causadc.com/sitemap.xml",
});

const artifactRoot = `data/restaurant-verification/artifacts/${restaurantIdAmazonia}`;
const artifacts = Object.freeze({
  dinner: `${artifactRoot}/official-dinner.html`,
  dessert: `${artifactRoot}/official-dessert.html`,
  drinks: `${artifactRoot}/official-drinks.html`,
  sourHour: `${artifactRoot}/official-sour-hour.html`,
});

const dinnerNames = [
  "corazon de res", "Papas de Huancayo", "Pulpo al Josper", "Madurito", "filet mignon",
  "Ensalada de Chonta", "Patarashca", "Patacones", "chicken thigh", "Pulpo al Olivo",
  "Chaufa Putumayo", "Scallops a la Parmesana", "pork belly", "Lomo Saltado",
  "Cebiche Nikkei", "Mafalde", "salmon belly", "Cebiche Amazonico", "Fusili",
  "Cebiche Clásico", "carrot", "mushroom", "Daily Chef's Choice of 5 Anticuchos",
];
const sourHourNames = [
  "Classic Pisco Sour (circa 1941)", "Pisco Punch", "Cocktail of the Day", "Wine", "Beer",
  "Alcohol-Free", "Anticuchos", "Cebiche", "Madurito", "Patacones", "Papas de Huancayo",
  "Josper Wagyu Burger",
];
const displayNames = new Map([
  [normalize("corazon de res"), "Corazón de Res"],
  [normalize("filet mignon"), "Filet Mignon"],
  [normalize("chicken thigh"), "Chicken Thigh"],
  [normalize("pork belly"), "Pork Belly"],
  [normalize("salmon belly"), "Salmon Belly"],
  [normalize("carrot"), "Carrot"],
  [normalize("mushroom"), "Mushroom"],
  [normalize("chicha morada"), "Chicha Morada"],
  [normalize("inca kola"), "Inca Kola"],
  [normalize("seasonal non-alcoholic cocktail"), "Seasonal Non-Alcoholic Cocktail"],
  [normalize("coke, diet coke, sprite, ginger ale"), "Coke, Diet Coke, Sprite, or Ginger Ale"],
  [normalize("Ungurahui AÇaí"), "Ungurahui Açaí"],
  [normalize("espresso"), "Espresso"],
]);

const signalOverrides = new Map(Object.entries({
  "Corazón de Res": ["soy"],
  "Filet Mignon": ["soy"],
  "Chicken Thigh": ["soy"],
  "Pork Belly": ["soy"],
  "Salmon Belly": ["fish", "soy"],
  "Carrot": ["soy"],
  "Mushroom": ["soy"],
  "Daily Chef's Choice of 5 Anticuchos": ["soy"],
  "Papas de Huancayo": ["milk"],
  "Pulpo al Josper": ["shellfish"],
  "Madurito": ["milk", "peanut"],
  "Patarashca": ["fish"],
  "Patacones": ["milk"],
  "Pulpo al Olivo": ["shellfish"],
  "Chaufa Putumayo": ["egg", "soy", "sesame", "shellfish"],
  "Scallops a la Parmesana": ["milk", "shellfish"],
  "Lomo Saltado": ["soy"],
  "Cebiche Nikkei": ["fish", "soy"],
  "Mafalde": ["milk", "wheat", "gluten"],
  "Cebiche Amazonico": ["fish"],
  "Fusili": ["wheat", "gluten", "shellfish"],
  "Cebiche Clásico": ["fish"],
  "Josper Wagyu Burger": ["milk", "wheat", "gluten", "sesame"],
  "Chocolucuma": ["milk", "wheat", "gluten"],
}).map(([name, signals]) => [normalize(name), signals]));

const configurableNames = new Set([
  "Daily Chef's Choice of 5 Anticuchos",
  "Seasonal Non-Alcoholic Cocktail",
  "Coke, Diet Coke, Sprite, or Ginger Ale",
].map(normalize));

export async function buildAmazoniaAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const [dinnerHtml, dessertHtml, drinksHtml, sourHourHtml] = await Promise.all(
    Object.values(artifacts).map((artifact) => readFile(artifact, "utf8")),
  );
  const dinner = cheerio.load(dinnerHtml);
  const dessert = cheerio.load(dessertHtml);
  const drinks = cheerio.load(drinksHtml);
  const sourHour = cheerio.load(sourHourHtml);
  assertSourceManifests({ dinner, dessert, drinks, sourHour });

  const itemsByName = new Map();
  let order = 0;
  const anticucheriaDescription = clean(dinner(".section-desription-text-block").first().text());

  for (const element of visibleRows(dinner, ".collection-item-2", ".item-outer-div-block")) {
    const row = webflowDinnerRow(dinner, element);
    addPresentation(itemsByName, presentation(row, "Dinner • Snacks", sourceUrlsAmazonia.dinner, order++));
  }
  for (const element of dinner(".collection-item-37").toArray()) {
    const row = webflowDinnerRow(dinner, element);
    row.description = anticucheriaDescription;
    addPresentation(itemsByName, presentation(row, "Dinner • Anticuchería", sourceUrlsAmazonia.dinner, order++));
  }
  const dinnerSectionRows = dinner(".dinner-collection-item").toArray();
  for (const [category, rows] of [
    ["Dinner • Cold", dinnerSectionRows.slice(0, 23)],
    ["Dinner • Hot", dinnerSectionRows.slice(23)],
  ]) {
    for (const element of rows.filter((candidate) => isVisible(dinner, candidate, ".item-outer-div-block"))) {
      const row = webflowDinnerRow(dinner, element);
      addPresentation(itemsByName, presentation(row, category, sourceUrlsAmazonia.dinner, order++));
    }
  }

  const sourRows = new Map(sourHour(".sour-hour-collection-item").toArray().map((element) => {
    const row = sourHourRow(sourHour, element);
    return [normalize(row.name), row];
  }));
  const anticuchos = sourRows.get(normalize("Anticuchos"));
  for (const name of ["Corazón de Res", "Salmon Belly", "Carrot", "Mushroom"]) {
    addPresentation(itemsByName, {
      ...presentation({ name, description: anticuchos.descriptions.join(" • "), dietary: null }, "Sour Hour • Food", sourceUrlsAmazonia.sourHour, order++),
      sourceName: `Anticuchos — ${name}`,
      rawText: anticuchos.rawText,
    });
  }
  const cebiche = sourRows.get(normalize("Cebiche"));
  for (const name of ["Cebiche Clásico", "Cebiche Amazonico"]) {
    addPresentation(itemsByName, {
      ...presentation({ name, description: cebiche.descriptions.join(" • "), dietary: null }, "Sour Hour • Food", sourceUrlsAmazonia.sourHour, order++),
      sourceName: `Cebiche — ${name.replace(/^Cebiche /, "")}`,
      rawText: cebiche.rawText,
    });
  }
  for (const name of ["Madurito", "Patacones", "Papas de Huancayo", "Josper Wagyu Burger"]) {
    const row = sourRows.get(normalize(name));
    addPresentation(itemsByName, presentation(row, "Sour Hour • Food", sourceUrlsAmazonia.sourHour, order++));
  }
  const alcoholFree = sourRows.get(normalize("Alcohol-Free"));
  addPresentation(itemsByName, {
    ...presentation({ name: "Prima Pavé Blanc de Blancs", description: alcoholFree.descriptions.join(" • "), dietary: null }, "Sour Hour • Nonalcoholic", sourceUrlsAmazonia.sourHour, order++),
    sourceName: alcoholFree.name,
    rawText: alcoholFree.rawText,
  });

  for (const element of drinks(".collection-item-39").toArray()) {
    const sourceName = clean(drinks(element).find(".zero-proof-menu-item-name").first().text());
    addPresentation(itemsByName, presentation({ name: sourceName, description: null, dietary: null }, "Nonalcoholic Beverages", sourceUrlsAmazonia.drinks, order++));
  }
  const primaRoseElement = drinks(".w-dyn-item").filter((_index, element) =>
    normalize(drinks(element).find(".name").first().text()) === normalize("prima pavé") &&
    /non-alcoholic, brut rose/i.test(drinks(element).text())
  ).first();
  addPresentation(itemsByName, presentation({
    name: "Prima Pavé Brut Rosé",
    description: clean(primaRoseElement.find(".text-block-29").first().text()) || "non-alcoholic, brut rose, italy",
    dietary: null,
  }, "Nonalcoholic Bottles", sourceUrlsAmazonia.drinks, order++));

  for (const element of dessert(".collection-item-14").toArray()) {
    addPresentation(itemsByName, presentation({
      name: clean(dessert(element).find(".menu-item-heading").first().text()),
      description: clean(dessert(element).find(".ingredients-or-list").first().text()),
      dietary: null,
    }, "Dessert", sourceUrlsAmazonia.dessert, order++));
  }
  const espresso = dessert(".w-dyn-item").filter((_index, element) =>
    normalize(dessert(element).find(".menu-item-heading").first().text()) === normalize("espresso")
  ).first();
  addPresentation(itemsByName, presentation({
    name: "Espresso",
    description: clean(espresso.find(".ingredients-or-list").first().text()),
    dietary: null,
  }, "Coffee", sourceUrlsAmazonia.dessert, order++));

  const items = [...itemsByName.values()]
    .map(finalizeItem)
    .sort((left, right) => left.auditOrder - right.auditOrder)
    .map(({ auditOrder: _auditOrder, ...item }) => item);
  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((item) => normalize(item.name)).sort().join("\n"))
    .digest("hex");

  if (items.length !== 34 || presentationCount !== 43 || new Set(items.map((item) => item.id)).size !== 34) {
    throw new Error(`Amazonia current manifest changed: ${items.length} formulations and ${presentationCount} presentations.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmazonia,
    retrievedAt,
    sourceUrls: [sourceUrlsAmazonia.dinner, sourceUrlsAmazonia.sourHour, sourceUrlsAmazonia.dessert, sourceUrlsAmazonia.drinks],
    itemCount: items.length,
    presentationCount,
    itemNameFingerprint,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "Amazonia publishes restaurant-issued food descriptions and a dietary legend, but not a complete recipe-level allergen matrix. Its letters c/d/e/g/s are accommodation or absence signals (and parenthesized letters mean modifiable), so they are not inverted into positive contains claims. Positive allergens are limited to fixed menu ingredients, named seafood, and the Anticuchería section's shared soy-sauce marinade. The celiac-friendly statement is not generalized beyond its coded items, and no unsupported item-level cross-contact claim is added.",
    items,
  };
}

function assertSourceManifests({ dinner, dessert, drinks, sourHour }) {
  assertNames("dinner primary", dinner(".collection-item-2").map((_i, e) => clean(dinner(e).find(".item-heading").first().text())).get(), dinnerNames);
  if (dinner(".dinner-collection-item").length !== 46 || dinner(".collection-item-37").length !== 8) {
    throw new Error(`Amazonia dinner layout changed: ${dinner(".dinner-collection-item").length} section rows and ${dinner(".collection-item-37").length} anticucho rows.`);
  }
  assertNames("dinner anticuchos", dinner(".collection-item-37").map((_i, e) => clean(dinner(e).find("h6").first().text())).get(), [
    "corazon de res", "filet mignon", "chicken thigh", "pork belly", "salmon belly", "carrot", "mushroom", "Daily Chef's Choice of 5 Anticuchos",
  ]);
  assertNames("dessert", dessert(".collection-item-14").map((_i, e) => clean(dessert(e).find(".menu-item-heading").first().text())).get(), ["Ungurahui AÇaí", "Chocolucuma", "Chazuta"]);
  assertNames("zero proof", drinks(".collection-item-39").map((_i, e) => clean(drinks(e).find(".zero-proof-menu-item-name").first().text())).get(), ["chicha morada", "inca kola", "seasonal non-alcoholic cocktail", "coke, diet coke, sprite, ginger ale"]);
  assertNames("sour hour", sourHour(".sour-hour-collection-item").map((_i, e) => clean(sourHour(e).find(".menu-item-heading").first().text())).get(), sourHourNames);
  if (!/c= celiac friendly \(no cross contamination\).*d= dairy free.*e= egg free.*g= gluten friendly.*s= soy free/is.test(dinner.text())) {
    throw new Error("Amazonia dietary legend changed or is missing.");
  }
}

function assertNames(label, actual, expected) {
  if (actual.length !== expected.length || actual.some((name, index) => normalize(name) !== normalize(expected[index]))) {
    throw new Error(`Amazonia ${label} manifest changed: ${JSON.stringify(actual)}.`);
  }
}

function visibleRows($, selector, visibilitySelector) {
  return $(selector).toArray().filter((element) => isVisible($, element, visibilitySelector));
}

function isVisible($, element, visibilitySelector) {
  return !/\bw-condition-invisible\b/.test($(element).find(visibilitySelector).first().attr("class") ?? "");
}

function webflowDinnerRow($, element) {
  return {
    name: clean($(element).find(".item-heading, .heading-22").first().text()),
    description: clean($(element).find(".item-ingredients-paragraph").first().text()) || null,
    dietary: clean($(element).find(".dietary-text-block").first().text()) || null,
  };
}

function sourHourRow($, element) {
  const descriptions = $(element).find(".description-text").map((_index, node) => clean($(node).text())).get().filter(Boolean);
  return {
    name: clean($(element).find(".menu-item-heading").first().text()),
    description: descriptions.join(" • ") || null,
    descriptions,
    dietary: null,
    rawText: clean($(element).text()),
  };
}

function presentation(row, category, sourceUrl, auditOrder) {
  const canonical = displayNames.get(normalize(row.name)) ?? row.name;
  return {
    auditOrder,
    canonicalName: canonical,
    category,
    description: row.description || null,
    dietary: row.dietary || null,
    rawText: [row.name, row.dietary, row.description].filter(Boolean).join(" | "),
    sourceName: row.name,
    sourceUrl,
  };
}

function addPresentation(itemsByName, entry) {
  const key = normalize(entry.canonicalName);
  let item = itemsByName.get(key);
  if (!item) {
    item = {
      auditOrder: entry.auditOrder,
      aliases: [],
      category: entry.category,
      description: entry.description,
      name: entry.canonicalName,
      presentations: [],
      sourceUrls: new Set(),
    };
    itemsByName.set(key, item);
  }
  if (entry.description && (!item.description || entry.description.length > item.description.length)) item.description = entry.description;
  if (normalize(entry.sourceName) !== normalize(item.name) && !item.aliases.some((alias) => normalize(alias) === normalize(entry.sourceName))) {
    item.aliases.push(entry.sourceName);
  }
  item.presentations.push({
    category: entry.category,
    description: entry.description,
    dietary: entry.dietary,
    rawText: entry.rawText,
    sourceName: entry.sourceName,
    sourceUrls: [entry.sourceUrl],
  });
  item.sourceUrls.add(entry.sourceUrl);
}

function finalizeItem(item) {
  const allergens = orderedAllergens(signalOverrides.get(normalize(item.name)) ?? []);
  return {
    auditOrder: item.auditOrder,
    auditItemKey: `${item.auditOrder + 1}:${slugify(item.name)}`,
    id: slugify(item.name),
    name: item.name,
    category: item.category,
    description: item.description,
    ingredientsText: item.description,
    imageUrl: null,
    isConfigurable: configurableNames.has(normalize(item.name)),
    aliases: item.aliases,
    presentations: item.presentations,
    sourceUrls: [...item.sourceUrls],
    sourceType: "restaurant-issued-webflow-menu",
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
  };
}

function clean(value) {
  return String(value ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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
  const snapshot = await buildAmazoniaAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAmazonia}`);
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
