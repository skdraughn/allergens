import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sourceUrls2Fifty = Object.freeze({
  home: "https://www.2fiftybbq.com/",
  allergyGuide: "https://www.2fiftybbq.com/allergies",
  dcToast: "https://order.toasttab.com/online/2fifty-bbq-washington-dc",
});

export const auditRetrievedAt2Fifty = "2026-07-14T18:18:34.256Z";

const categoryNames = Object.freeze([
  "Meats OO",
  "Sides OO",
  "Sandwiches",
  "Daily Special",
  "Drinks",
  "Alcohol",
  "Desserts",
  "Catering",
  "Chilled Meats",
  "Extras",
  "Merch",
]);

const expectedNames = Object.freeze({
  "Meats OO": [
    "Prime Brisket",
    "American Wagyu Brisket",
    "Beef Ribs",
    "Whole Hog",
    "Pork Spare Ribs",
    "Poblano Sausage Link",
    "Spicy Cheddar Sausage Link",
    "Whole Prime Brisket (warm)",
    "Whole Wagyu Brisket (warm)",
    "Turkey Breast",
    "Chicken Leg Quarters",
    "Pulled Lamb",
  ],
  "Sides OO": [
    "Mac n Cheese",
    "Brisket Beans",
    "Herby Potato Salad",
    "Coleslaw",
    "Zesty Garden Mix",
    "Rice & Beans",
    "Esquites (Corn salad)",
    "Corn bread",
    "Pickles & Onions",
    "Bun",
    "Jicama Salad",
  ],
  Sandwiches: [
    "Chopped Beef Sandwich",
    "Whole Hog Sandwich",
    "Turkey Sandwich",
    "Wagyu Brisket Sandwich",
  ],
  "Daily Special": [
    "2 Brisket Tamales",
    "Brisket Burger + Rosemary Chips",
    "Texas Chili",
    "Brisket Quesadilla",
  ],
  Drinks: ["Water", "Mexican Coke", "Boylan", "Diet Coke Glass 8oz"],
  Alcohol: [
    "Babbler Bordeaux Wine Bottle",
    "Zillamina, Alicante Rosé Wine bottle",
    "Cora, Colline Pescaresi Pinot Grigio bottle 2024",
    "Viñátigo Listán Negro bottle",
    "Viña Zorzal, Navarra Garnacha Red wine bottle 2023",
    "Wachter Wiesler Bela-Joska Blaufrankisch (Eisenberg)",
    "Laurence et Rémi Dufaitre Beaujolais-Villages Nouveau wine bottle 2025",
    "All American Lager can",
    "All American Lager Six Pack",
    "Lakewood Candeo Bubbly",
    "Sommelier's Wine Bundle",
    "Azimut Cava Brut Nature",
    "Petit Cochon Bronzé Rosé 13 % ABV",
    "Malpasso Wine Bottle",
    "Motorpsico “Bierzo” bottle",
  ],
  Desserts: ["Banana Pudding", "Chocolate Chip Cookie"],
  Catering: [
    "Tray of Brisket Beans",
    "Tray of Mac n Cheese",
    "Tray of Coleslaw",
    "Tray of Esquites",
    "Tray of Herby Potato Salad",
    "Tray of Zesty Garden Mix",
    "Rice & Beans Tray",
    "Tray of Jicama Salad",
  ],
  "Chilled Meats": [
    "Whole Chilled Prime Brisket",
    "Whole Smoked Chicken, Vacuum packed",
    "1 Lb. Smoked Prime Brisket (chilled)",
    "1 Lb. Smoked Pulled Pork (chilled)",
    "2 Chilled Brisket Tamales",
    "1 lb. Wagyu Brisket (chilled)",
  ],
  Extras: [
    "12oz Signature BBQ Sauce Bottle",
    "12oz Spicy BBQ Sauce Bottle",
    "12oz Honey Mustard Sauce Bottle",
    "Chimichurri Sauce",
    "Beef Rub",
    "Pork Rub",
    "Smoked Feta Cheese block",
    "Smoked beef tallow jar",
  ],
  Merch: [
    "2fifty Soccer shirts",
    "Kick-Ash T Shirt",
    "Gathering T-Shirt",
    "Choc Brown Hoodie",
    "Victorinox Boning Knife",
    "Victorinox Slicer Knife",
    "Bottle Opener",
    "Smoke House Corduroy Hat",
  ],
});

const outputCategory = Object.freeze({
  "Meats OO": "Meats",
  "Sides OO": "Sides",
});

const guideSignals = new Map([
  ["mac n cheese", ["milk", "gluten"]],
  ["brisket beans", ["milk"]],
  ["herby potato salad", ["egg", "mustard"]],
  ["coleslaw", ["egg"]],
  ["esquites (corn salad)", ["egg", "milk", "gluten"]],
  ["corn bread", ["egg", "milk", "gluten"]],
  ["bun", ["egg", "milk", "soy", "gluten"]],
  ["brisket quesadilla", ["milk", "gluten"]],
  ["banana pudding", ["milk", "gluten"]],
  ["chocolate chip cookie", ["egg", "milk", "gluten"]],
  ["poblano sausage link", ["milk"]],
  ["spicy cheddar sausage link", ["milk"]],
  ["turkey breast", ["milk"]],
  ["12oz spicy bbq sauce bottle", ["milk", "gluten"]],
  ["12oz honey mustard sauce bottle", ["egg", "mustard"]],
  ["chimichurri sauce", ["milk", "mustard", "tree-nut"]],
]);

const categoryOrder = new Map([
  ["Meats", 10],
  ["Sides", 20],
  ["Sandwiches", 30],
  ["Daily Special", 40],
  ["Desserts", 50],
  ["Catering", 60],
  ["Chilled Meats", 70],
  ["Extras", 80],
  ["Drinks", 90],
  ["Alcohol", 100],
]);

export function parse2FiftyToastReader(markdown) {
  const source = String(markdown ?? "");
  const mainStart = source.indexOf("## Online ordering Main Menu");
  if (mainStart < 0) throw new Error("2Fifty Toast main-menu heading was not found.");
  const main = source.slice(mainStart);
  const rows = [];

  for (let categoryIndex = 0; categoryIndex < categoryNames.length - 1; categoryIndex += 1) {
    const category = categoryNames[categoryIndex];
    const startToken = `\n### ${category}\n`;
    const start = main.indexOf(startToken);
    if (start < 0) throw new Error(`2Fifty Toast category was not found: ${category}.`);
    const nextCategory = categoryNames[categoryIndex + 1];
    const next = nextCategory ? main.indexOf(`\n### ${nextCategory}\n`, start + startToken.length) : -1;
    const block = main.slice(start + startToken.length, next >= 0 ? next : undefined);
    const menuLinks = [...block.matchAll(/###\s+([\s\S]*?)\]\((https?:\/\/[^)\s]+\/item-[^)]+)\)/g)];
    const names = [...expectedNames[category]].sort((left, right) => right.length - left.length);

    for (const match of menuLinks) {
      const text = normalizeWhitespace(match[1]).replace(/^\[/, "");
      const name = names.find((candidate) => text.startsWith(candidate));
      if (!name) throw new Error(`Unrecognized 2Fifty item in ${category}: ${text.slice(0, 120)}.`);
      const description = text.slice(name.length)
        .replace(/^[.\s]+/, "")
        .replace(/\s+\$\d+(?:\.\d{2})?$/, "")
        .trim();
      rows.push({
        category: outputCategory[category] ?? category,
        name,
        description: description || null,
        sourceUrl: match[2].replace(/^http:/, "https:"),
      });
    }

    if (menuLinks.length !== expectedNames[category].length) {
      throw new Error(
        `2Fifty ${category} expected ${expectedNames[category].length} items but parsed ${menuLinks.length}.`,
      );
    }
  }

  return rows.filter((row) => row.category !== "Merch");
}

export function build2FiftyAuditSnapshot({ toastMarkdown, retrievedAt = new Date().toISOString() } = {}) {
  const parsedRows = parse2FiftyToastReader(toastMarkdown);
  const items = parsedRows.map((row, index) => {
    const signal = allergenSignal(row);
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      sourceUrls: signal.usesGuide
        ? [sourceUrls2Fifty.dcToast, sourceUrls2Fifty.allergyGuide]
        : [sourceUrls2Fifty.dcToast],
      sourceType: signal.usesGuide
        ? "restaurant-linked-toast-plus-official-allergy-guide"
        : "restaurant-linked-toast-menu",
      allergens: signal.allergens,
      mayContain: [],
      allergenSourceType: signal.hasEvidence ? "official-ingredients" : "unavailable",
    };
  }).sort((left, right) => {
    const categoryDifference =
      (categoryOrder.get(left.category) ?? 999) - (categoryOrder.get(right.category) ?? 999);
    return categoryDifference || left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return {
    schemaVersion: 1,
    restaurantId: "two-fifty-bbq-dc",
    retrievedAt,
    sourceUrls: Object.values(sourceUrls2Fifty),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "2Fifty publishes a restaurant-issued item list for selected allergens and a general kitchen cross-contact warning, but not a complete matrix. Positive signals are limited to that guide or explicit current menu text; gluten is not automatically relabeled as wheat, coconut is not treated as tree nut, and no negative safety claim is inferred.",
    items,
  };
}

function allergenSignal(row) {
  const key = canonicalGuideName(row.name);
  const allergens = new Set(guideSignals.get(key) ?? []);
  let usesGuide = guideSignals.has(key);

  if (/\b(?:sandwich|burger)\b/i.test(row.name)) {
    for (const allergen of ["egg", "milk", "soy", "gluten"]) allergens.add(allergen);
    usesGuide = true;
  }
  if (/turkey sandwich/i.test(row.name)) {
    allergens.add("milk");
    usesGuide = true;
  }
  if (/\bchimichurri\b/i.test(row.name)) {
    for (const allergen of ["milk", "mustard", "tree-nut"]) allergens.add(allergen);
    usesGuide = true;
  }
  if (/smoked feta/i.test(row.name)) allergens.add("milk");
  const text = `${row.name} ${row.description ?? ""}`;
  const explicitNegative = /\b(?:gluten|nut|dairy|egg|soy|sesame)[- ]free\b/i.test(text);
  const completeIngredientList = /\bingredients\s*:/i.test(text);
  const hasEvidence = allergens.size > 0 || explicitNegative || completeIngredientList;

  return {
    allergens: [...allergens],
    hasEvidence,
    usesGuide,
  };
}

function canonicalGuideName(value) {
  const normalized = String(value ?? "")
    .replace(/^tray of /i, "")
    .replace(/^rice & beans tray$/i, "rice & beans")
    .trim()
    .toLowerCase();
  return normalized === "esquites" ? "esquites (corn salad)" : normalized;
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value).replace(/&/g, " and ")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’'“”]/g, "").replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "").toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/artifacts/two-fifty-bbq-dc/third-party-toast-render-proxy.txt",
  );
  const outputPath = path.resolve(
    process.argv[3] ?? "data/restaurant-verification/repairs/two-fifty-bbq-dc/corrected-menu.json",
  );
  const snapshot = build2FiftyAuditSnapshot({
    toastMarkdown: await readFile(artifactPath, "utf8"),
    retrievedAt: auditRetrievedAt2Fifty,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
