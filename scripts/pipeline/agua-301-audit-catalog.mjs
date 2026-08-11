import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAgua301 = "agua-301-restaurant-washington-dc-dc-metro";
export const sourceUrlAgua301 = "https://agua301.com/washington-yards-park-agua-301-food-menu";
export const drinkSourceUrlAgua301 = "https://agua301.com/washington-yards-park-agua-301-drink-menu";

const structuralNames = new Set([
  "dips served with housemade tortilla chips",
  "croquettes breadcrumbed and fried roll of",
  "huaraches handmade corn flat bread topped with",
  "empanadas fried corn masa turnovers filled with your choice of",
  "additional items",
  "flautas lightly fried rolled corn tortilla stuffed with",
  "sopes masa corn cakes spread with black bean puree and topped with",
  "add 1",
  "add 4",
  "aperitivos add 4 person",
  "postres add 4 person",
  "bocaditos",
  "platos principales",
  "tacos",
  "enchiladas",
  "especiales",
  "first course",
  "entrees taco platters taco platters come with 3 tacos rice and beans",
  "dessert",
  "entrees",
  "add ons",
]);

export function parseAgua301Presentations(html) {
  const $ = cheerio.load(html);
  const labelByClass = new Map();
  $(".food-menu-nav-item").each((_index, element) => {
    labelByClass.set(`menu_${$(element).attr("href")}`, clean($(element).text()));
  });
  const rows = [];
  $(".food-menu-grid").each((_gridIndex, grid) => {
    const gridClass = String($(grid).attr("class") ?? "").split(/\s+/).find((value) => /^menu_\d+$/.test(value));
    const surface = labelByClass.get(gridClass);
    if (!surface) throw new Error(`Unknown Agua 301 menu surface: ${gridClass}`);
    $(grid).find(".food-menu-grid-item-content").each((_sectionIndex, section) => {
      const category = clean($(section).children("h2").first().text());
      $(section).find(".food-item-holder").each((_itemIndex, item) => {
        const name = clean($(item).find(".food-item-title h3").first().text());
        if (!name) return;
        const description = clean($(item).find(".food-item-description").first().text()) || null;
        rows.push({ surface, category, name, description, sourceUrl: sourceUrlAgua301 });
      });
    });
  });
  if (rows.length !== 432) throw new Error(`Agua 301 source shape changed: expected 432 presentations; found ${rows.length}.`);
  return rows;
}

export function buildAgua301AuditSnapshot({ html, drinkHtml, retrievedAt = new Date().toISOString() }) {
  const presentations = parseAgua301Presentations(html);
  const real = presentations.filter((row) => !isStructural(row));
  if (presentations.length - real.length !== 29) {
    throw new Error(`Agua 301 structural-row count changed: expected 29; found ${presentations.length - real.length}: ${presentations.filter(isStructural).map((row) => `${row.surface}/${row.category}/${row.name}`).join(" | ")}.`);
  }
  const byFormulation = new Map();
  for (const row of real) {
    const key = `${normalize(row.name)}|${normalize(row.description)}`;
    const existing = byFormulation.get(key);
    if (existing) {
      existing.presentations.push({ surface: row.surface, category: row.category });
      continue;
    }
    byFormulation.set(key, { ...row, presentations: [{ surface: row.surface, category: row.category }] });
  }
  const formulations = [...byFormulation.values(), ...parseNonAlcoholicBeverages(drinkHtml)];
  if (formulations.length !== 301) {
    throw new Error(`Agua 301 formulation count changed: expected 301; found ${formulations.length}.`);
  }
  const items = formulations.map((row, index) => {
    const allergens = publishedSignalsAgua301(row);
    const id = `${slugify(row.name)}-${shortHash(`${normalize(row.name)}|${normalize(row.description)}`)}`;
    return {
      auditItemKey: `${index + 1}:${id}`,
      id,
      name: row.name,
      category: `${row.surface} — ${row.category}`,
      description: row.description,
      ingredientsText: row.description,
      isConfigurable: /\b(?:choice|option|add)\b/i.test(row.description ?? ""),
      presentations: row.presentations,
      sourceUrls: [row.sourceUrl],
      sourceType: "restaurant-issued-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Duplicate Agua 301 formulation ids.");
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAgua301,
    retrievedAt,
    sourceUrls: [sourceUrlAgua301, drinkSourceUrlAgua301],
    presentationCount: real.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "Agua 301 publishes current item descriptions across ten restaurant-issued food, catering, banquet, dessert, and breakfast surfaces, but no complete allergen matrix, complete recipes, or cross-contact policy. Exact repeated formulations are consolidated while changed formulations remain separate. Positive fields use fixed published ingredients and mandatory named formats; optional add-ons and substitutions are excluded from fixed fields.",
    items,
  };
}

function parseNonAlcoholicBeverages(html) {
  const $ = cheerio.load(html);
  const section = $("h2").filter((_index, element) => clean($(element).text()) === "Non-Alcoholic Beverages").first().closest(".food-menu-grid-item-content");
  const rows = section.find(".food-item-holder").map((_index, item) => ({
    surface: "Drinks",
    category: "Non-Alcoholic Beverages",
    name: clean($(item).find(".food-item-title h3").first().text()),
    description: clean($(item).find(".food-item-description").first().text()) || null,
    sourceUrl: drinkSourceUrlAgua301,
    presentations: [{ surface: "Drinks", category: "Non-Alcoholic Beverages" }],
  })).get().filter((row) => row.name);
  if (rows.length !== 3) throw new Error(`Agua 301 non-alcoholic beverage count changed: expected 3; found ${rows.length}.`);
  return rows;
}

export function publishedSignalsAgua301({ name, description }) {
  let text = clean(`${name} ${description ?? ""}`).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  text = text
    .replace(/\beggplant\b/g, "aubergine")
    .replace(/\boption to add\b[\s\S]*$/g, "")
    .replace(/\badd (?:ground beef|chorizo|chicken|steak|shrimp)\b[\s\S]*$/g, "")
    .replace(/choice of 3 proteins \([^)]*\)/g, "")
    .replace(/\(may request flour\)/g, "");
  const allergens = [];
  if (/\b(?:cheese|queso|cotija|chihuahua|parmesan|crema|cream|sour cream|yogurt|buttermilk|butter|cheesecake|tres leches|ice cream|milk|flan|custard|mousse)\b/.test(text)) allergens.push("milk");
  if (/\b(?:eggs?|omelettes?|omelets?|benedict|hollandaise|mayo|aioli|flan|custard)\b/.test(text)) allergens.push("egg");
  if (/\b(?:flour tortillas?|croutons?|bread|sandwich|torta|beer battered|french toast|bagels?|pastr(?:y|ies)|pancakes?|churros?|puff pastry|cake|xango)\b/.test(text)) allergens.push("wheat", "gluten");
  if (/\b(?:fish|tilapia|salmon|anchovies)\b/.test(text)) allergens.push("fish");
  if (/\b(?:shrimp|mussels?|clams?|crab|oysters?|shellfish)\b/.test(text)) allergens.push("shellfish");
  if (/\b(?:walnuts?|almonds?|pine nuts?|pistachios?|hazelnuts?)\b/.test(text)) allergens.push("tree-nut");
  if (/\b(?:tahini|sesame)\b/.test(text)) allergens.push("sesame");
  if (/\bmustard\b/.test(text)) allergens.push("mustard");
  return [...new Set(allergens)];
}

function isStructural(row) {
  return structuralNames.has(normalize(row.name));
}
function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normalize(value) { return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
function slugify(value) { return normalize(value).replace(/\s+/g, "-") || "item"; }
function shortHash(value) { return createHash("sha256").update(value).digest("hex").slice(0, 10); }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [html, drinkHtml] = await Promise.all([
    readFile(`data/restaurant-verification/artifacts/${restaurantIdAgua301}/official-food-menu.html`, "utf8"),
    readFile(`data/restaurant-verification/artifacts/${restaurantIdAgua301}/official-drink-menu.html`, "utf8"),
  ]);
  const snapshot = buildAgua301AuditSnapshot({ html, drinkHtml });
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAgua301}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ presentationCount: snapshot.presentationCount, itemCount: snapshot.itemCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
