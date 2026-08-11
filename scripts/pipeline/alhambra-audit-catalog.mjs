import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAlhambra = "replacement-alhambra-washington-dc";
export const sourceUrlAlhambra = "https://www.alhambradc.com/our-menus";

const capturedMenuPath = fileURLToPath(new URL(
  "../../data/restaurant-verification/artifacts/replacement-alhambra-washington-dc/official-current-menus.html",
  import.meta.url,
));

const excludedAlcohol = new Set([
  "bottomless mimosa",
  "bottomless bloody mary",
  "the red snapper",
  "the capitol mary",
]);

const excludedCmsArtifacts = new Set([
  "continental copy copy copy copy",
  "seasonal fruit",
  "one freshly baked breakfast pastry",
  "choice of juice selection",
  "choice of entree",
  "add ons",
]);

const canonicalNames = new Map([
  ["freshly baked pastry one piece", "Freshly Baked Pastry (One Piece)"],
  ["avacado toast", "Avocado Toast"],
  ["avacado shrimp salad", "Avocado & Shrimp Salad"],
  ["avocado shrimp salad", "Avocado & Shrimp Salad"],
  ["avo poach toast", "Avo-Poach Toast"],
  ["butermilk pancakes", "Buttermilk Pancakes"],
  ["homemade belgian waffle", "Belgian Waffle"],
  ["mediterr anean benedict", "Mediterranean Benedict"],
  ["one egg any style", "One Egg Any Style"],
  ["regular organic cereals", "Regular and Organic Cereals"],
  ["three courses", "Executive Lunch — Three Courses"],
]);

const configurableNames = new Set([
  "freshly baked pastry one piece",
  "bakery basket selection of 3",
  "two eggs any style",
  "create your own eggs benedict",
  "capital",
  "continental",
  "astor",
  "organic steel cut oatmeal",
  "dark roast lavazza coffee or french press",
  "cappuccino or latte",
  "cold brew nitro",
  "selection of juice",
  "alhambra platter",
  "executive lunch three courses",
]);

// These adjudications keep optional choices out of fixed contains claims and
// retain only ingredients common to the purchasable formulation as published.
const fixedAllergenOverrides = new Map([
  ["freshly baked pastry one piece", []],
  ["capital", ["egg", "wheat", "gluten"]],
  ["continental", ["wheat", "gluten"]],
  ["astor", ["wheat", "gluten"]],
  ["organic steel cut oatmeal", []],
  ["create your own eggs benedict", ["milk", "egg"]],
  ["croissant breakfast sandwich", ["milk", "egg", "wheat", "gluten"]],
  ["avocado toast", ["wheat", "gluten"]],
  ["coconut chia parfait", ["tree-nut"]],
  ["peanut butter banana smoothie", ["peanut", "tree-nut"]],
  ["creme caramel french toast", ["milk", "egg", "tree-nut", "wheat", "gluten"]],
  ["mediterranean benedict", ["milk", "egg", "wheat", "gluten"]],
  ["avo poach toast", ["milk", "egg", "wheat", "gluten"]],
  ["cappuccino or latte", ["milk"]],
  ["cappuccino", ["milk"]],
  ["latte", ["milk"]],
  ["alhambra platter", []],
  ["executive lunch three courses", ["milk", "egg", "tree-nut", "wheat", "gluten"]],
  ["organic quinoa salad", ["milk", "tree-nut"]],
  ["freshly baked pastries", ["wheat", "gluten"]],
  ["regular and organic cereals", []],
  ["organic acai bowl", []],
  ["hot chocolate", []],
  ["heirloom tomato bisque", []],
  ["traditional hummus", ["tree-nut"]],
  ["ensalada de alcachofas", ["tree-nut"]],
  ["marbled beef carpaccio", ["milk", "tree-nut"]],
  ["tapas selection", ["milk", "tree-nut"]],
  ["iberico ham croquettes", []],
]);

export function buildAlhambraAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const sourceMenus = readCapturedMenus();
  const byName = new Map();
  let presentationCount = 0;

  for (const menu of sourceMenus) {
    for (const section of menu.hasMenuSection ?? []) {
      for (const rawItem of section.hasMenuItem ?? []) {
        const sourceName = cleanText(rawItem.name);
        const sourceKey = normalize(sourceName);
        if (excludedAlcohol.has(sourceKey) || excludedCmsArtifacts.has(sourceKey)) continue;

        const name = canonicalNames.get(sourceKey) ?? titleCase(sourceName);
        const key = normalize(name);
        const description = cleanText(rawItem.description) || null;
        let item = byName.get(key);
        if (!item) {
          item = {
            id: slugify(name),
            name,
            category: `${menu.name} — ${section.name}`,
            description,
            ingredientsText: description,
            imageUrl: null,
            isConfigurable: configurableNames.has(key),
            aliases: [],
            presentations: [],
            sourceUrls: [sourceUrlAlhambra],
            sourceType: "restaurant-issued-menu",
          };
          byName.set(key, item);
        } else if (!item.description && description) {
          item.description = description;
          item.ingredientsText = description;
        }

        if (normalize(sourceName) !== key && !item.aliases.some((alias) => normalize(alias) === sourceKey)) {
          item.aliases.push(sourceName);
        }
        item.presentations.push({
          menu: menu.name,
          category: section.name,
          sourceName,
          description,
          sourceUrl: sourceUrlAlhambra,
        });
        presentationCount += 1;
      }
    }
  }

  const items = [...byName.values()].map((item, index) => {
    const key = normalize(item.name);
    const allergens = orderedAllergens(
      fixedAllergenOverrides.has(key) ? fixedAllergenOverrides.get(key) : publishedSignalsAlhambra(item),
    );
    return {
      auditItemKey: `${index + 1}:${slugify(item.name)}`,
      ...item,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });

  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  if (presentationCount !== 130 || items.length !== 107 || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`Alhambra current manifest changed: ${items.length} formulations, ${presentationCount} presentations.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAlhambra,
    retrievedAt,
    sourceUrls: [sourceUrlAlhambra],
    presentationCount,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "Alhambra publishes current item names and selected descriptions on its restaurant-issued menu page, but no complete recipe-level allergen matrix or cross-contact disclosure. Positive signals use explicit fixed components and unavoidable named food formats only. Optional add-ons and configurable entree or protein choices are not promoted into fixed claims, and absent menu text is not an allergen-free claim.",
    excluded: {
      alcoholOnly: [...excludedAlcohol],
      cmsArtifacts: [...excludedCmsArtifacts],
    },
    items,
  };
}

export function publishedSignalsAlhambra(item) {
  const text = normalize([
    item.name,
    ...item.presentations.flatMap((presentation) => [
      presentation.sourceName,
      stripOptionalChoices(presentation.description),
    ]),
  ].join(" "));
  const signals = [];
  if (/\b(?:milk|buttermilk|whipped butter|buttered|cream cheese|chantilly|yogurt|whey|burrata|feta|labneh|goat s cheese|sheep s feta|sheep milk cheese|manchego|gruyere|cheddar|parmesan|ricotta|basque cheese|artisanal cheese|custard|ice cream|nutella)\b/.test(text)) signals.push("milk");
  if (/\b(?:eggs?|aioli|hollandaise|omelet|custard|waffles?|pancakes?|french toast)\b/.test(text)) signals.push("egg");
  if (/\bpeanut\b/.test(text)) signals.push("peanut");
  if (/\b(?:almonds?|pine nuts?|pistachios?|walnuts?|hazelnuts?|nutella)\b/.test(text)) signals.push("tree-nut");
  if (/\b(?:croissants?|bread|bagels?|waffles?|pastr(?:y|ies)|toast|pita|flatbread|phyllo|croutons?|focaccia|brioche|pancakes?|french toast|pinza|borek|cake)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:salmon|tuna|rockfish|branzino|caviar)\b/.test(text)) signals.push("fish");
  if (/\b(?:shrimp|crab|lobster|octopus|scallops?|prawns?)\b/.test(text)) signals.push("shellfish");
  if (/\b(?:tahini|sesame)\b/.test(text)) signals.push("sesame");
  if (/\bmustard\b/.test(text)) signals.push("mustard");
  return orderedAllergens(signals);
}

function readCapturedMenus() {
  const html = readFileSync(capturedMenuPath, "utf8");
  const match = html.match(/<script id="mjdatamenu" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Alhambra captured page is missing the structured menu payload.");
  return JSON.parse(match[1]);
}

function stripOptionalChoices(value) {
  return String(value ?? "")
    .replace(/\badd[ -]?ons?:?[\s\S]*$/i, "")
    .replace(/\bchoice of:[\s\S]*$/i, "");
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/&#8217;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function titleCase(value) {
  const small = new Set(["a", "an", "and", "any", "in", "of", "or", "the", "with"]);
  return cleanText(value).toLowerCase().split(/\s+/).map((word, index) => {
    if (index > 0 && small.has(word)) return word;
    return word.replace(/(^|[-/&])([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  }).join(" ")
    .replace(/\bSt\. /g, "St. ")
    .replace(/\bLavazza\b/g, "Lavazza")
    .replace(/\bNitro\b/g, "Nitro");
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAlhambraAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAlhambra}`);
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
