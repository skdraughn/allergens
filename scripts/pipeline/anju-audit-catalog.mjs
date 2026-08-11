import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAnju = "anju-dc";
export const retrievedAtAnju = "2026-07-15T06:02:24.000Z";
export const sourceUrlsAnju = Object.freeze({
  dinner: "https://www.anjurestaurant.com/dine-in",
  brunch: "https://www.anjurestaurant.com/brunch",
  happyHour: "https://www.anjurestaurant.com/happy-hour",
  faq: "https://www.anjurestaurant.com/faq",
  orderLanding: "https://www.anjurestaurant.com/order-online",
  toastOrder: "https://order.toasttab.com/online/anju",
});

const categoryOrder = Object.freeze([
  "Anju",
  "Main",
  "Mama Lee’s Classics",
  "Panchan",
  "Dessert",
  "From the Kitchen",
  "Add Ons",
  "Happy Hour",
  "Beverages",
]);

const inlineModifierPatterns = Object.freeze([
  /^\*?add\b/i,
  /^\+/, 
  /^\(optional\b/i,
  /^with (?:tito[’']s|chambord)\b/i,
]);

const brunchBeverageAllowlist = new Set([
  "strawberry and lychee lemonade",
  "la colombe cold brew",
  "saam jang blood mary",
  "korean maxx",
]);

function clean(value) {
  return cheerio.load(String(value ?? ""), null, false).text().replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isModifierName(name) {
  return inlineModifierPatterns.some((pattern) => pattern.test(name));
}

function splitPriceRow(text) {
  const separator = text.lastIndexOf("|");
  if (separator < 1) return null;
  const name = clean(text.slice(0, separator));
  const priceText = clean(text.slice(separator + 1));
  if (!name || !/\d/.test(priceText)) return null;
  return { name, priceText };
}

function menuTokens(html) {
  const $ = cheerio.load(html);
  return $(".sqs-html-content h2, .sqs-html-content h3, .sqs-html-content p")
    .map((_index, element) => ({
      tag: element.tagName.toLowerCase(),
      text: clean($(element).text()),
    }))
    .get()
    .filter((row) => row.text);
}

function canonicalCategory(text) {
  const key = normalize(text);
  const categories = new Map([
    ["anju", "Anju"],
    ["main", "Main"],
    ["mama lee s classics", "Mama Lee’s Classics"],
    ["panchan", "Panchan"],
    ["dessert", "Dessert"],
    ["from the kitchen", "From the Kitchen"],
    ["add ons", "Add Ons"],
    ["phil s lemonade stand", "Beverages"],
  ]);
  return categories.get(key) ?? null;
}

export function parseAnjuMenuPage(html, { menuKind, sourceUrl }) {
  const rows = [];
  const modifiers = [];
  const excludedAlcohol = [];
  let category = null;
  let current = null;
  let happyHourState = null;

  function finishCurrent() {
    if (!current) return;
    const description = clean(current.descriptionParts.join(" ")) || null;
    const row = { ...current, description };
    delete row.descriptionParts;

    if (menuKind === "happy-hour" && happyHourState !== "food") {
      excludedAlcohol.push(row);
    } else if (menuKind === "brunch" && row.category === "Beverages") {
      if (brunchBeverageAllowlist.has(normalize(row.name))) rows.push(row);
      else excludedAlcohol.push(row);
    } else {
      rows.push(row);
    }
    current = null;
  }

  for (const token of menuTokens(html)) {
    const text = token.text;
    const headingCategory = token.tag === "h2" || token.tag === "h3"
      ? canonicalCategory(text)
      : null;
    if (headingCategory) {
      finishCurrent();
      category = headingCategory;
      continue;
    }

    if (menuKind === "happy-hour" && /^(?:food|drinks)$/i.test(text)) {
      finishCurrent();
      happyHourState = normalize(text);
      category = happyHourState === "food" ? "Happy Hour" : "Beverages";
      continue;
    }

    if (/^\*parties of 6 or more/i.test(text) || /^add protein to any main:?$/i.test(text)) {
      finishCurrent();
      continue;
    }
    if (menuKind === "happy-hour" && !happyHourState) continue;

    const priced = splitPriceRow(text);
    if (priced) {
      finishCurrent();
      if (isModifierName(priced.name)) {
        modifiers.push({ ...priced, category, sourceUrl, kind: "priced-modifier" });
        continue;
      }
      current = {
        ...priced,
        category,
        menuKind,
        sourceUrl,
        descriptionParts: [],
        inlineModifiers: [],
      };
      continue;
    }

    if (!current) continue;
    if (isModifierName(text)) {
      current.inlineModifiers.push(text);
      modifiers.push({
        name: text,
        priceText: null,
        category,
        sourceUrl,
        kind: "inline-modifier",
        parentName: current.name,
      });
      continue;
    }
    current.descriptionParts.push(text);
  }
  finishCurrent();

  return { rows, modifiers, excludedAlcohol };
}

const linkedToastEvidence = Object.freeze({
  mandu: {
    text: "Mandu — pork and kimchi dumplings, served with a sweet soy dipping sauce — contains shellfish",
    allergens: ["shellfish", "soy"],
  },
  eomuk: {
    text: "Eomuk — fish cakes with carrots, onion, & peppers",
    allergens: ["fish"],
  },
});

export function publishedSignalsAnju(row) {
  const text = normalize(`${row.name} ${row.description ?? ""}`);
  const allergens = [];

  if (/\b(?:american cheese|blue cheese|beer cheese|whipped cream|gelato|condensed milk|dulce de leche|yogurt|sour cream|doenjang butter)\b/.test(text)) {
    allergens.push("milk");
  }
  if (/\b(?:waffle|pancakes?|toasted bun|sourdough|panko|wheat noodles?|somen noodles?|vanilla wafers?|mandu crisps?)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  if (/\b(?:egg|eggs|egg custard|gyeran mari|aioli|mayo)\b/.test(text)) {
    allergens.push("egg");
  }
  if (/\b(?:sweet soy|soy(?: bean)?|soybean|soy marinated|tofu)\b/.test(text)) {
    allergens.push("soy");
  }
  if (/\b(?:branzino|salmon|tuna|fish cakes?)\b/.test(text)) {
    allergens.push("fish");
  }
  if (/\b(?:lobster|crab|shrimp|mussels?|clams?|calamari)\b/.test(text)) {
    allergens.push("shellfish");
  }
  if (/\b(?:cashews?|pine nuts?|pecans?|pistachios?|walnuts?)\b/.test(text)) {
    allergens.push("tree-nut");
  }
  if (/\b(?:sesame|sesame oil|sesame seeds)\b/.test(text)) {
    allergens.push("sesame");
  }

  const toast = linkedToastEvidence[slugify(row.name)];
  allergens.push(...(toast?.allergens ?? []));
  return unique(allergens);
}

function mergePresentations(presentations) {
  const merged = new Map();
  for (const row of presentations) {
    const key = normalize(row.name);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...row,
        sourceUrls: [row.sourceUrl],
        menuKinds: [row.menuKind],
        prices: [{ menuKind: row.menuKind, text: row.priceText }],
      });
      continue;
    }
    existing.sourceUrls = unique([...existing.sourceUrls, row.sourceUrl]);
    existing.menuKinds = unique([...existing.menuKinds, row.menuKind]);
    existing.prices.push({ menuKind: row.menuKind, text: row.priceText });
    if (!existing.description && row.description) existing.description = row.description;
    existing.inlineModifiers = unique([
      ...(existing.inlineModifiers ?? []),
      ...(row.inlineModifiers ?? []),
    ]);
  }
  return [...merged.values()];
}

export function buildAnjuAuditSnapshot({
  dinnerHtml,
  brunchHtml,
  happyHourHtml,
  retrievedAt = new Date().toISOString(),
}) {
  const dinner = parseAnjuMenuPage(dinnerHtml, {
    menuKind: "dinner",
    sourceUrl: sourceUrlsAnju.dinner,
  });
  const brunch = parseAnjuMenuPage(brunchHtml, {
    menuKind: "brunch",
    sourceUrl: sourceUrlsAnju.brunch,
  });
  const happyHour = parseAnjuMenuPage(happyHourHtml, {
    menuKind: "happy-hour",
    sourceUrl: sourceUrlsAnju.happyHour,
  });

  if (dinner.rows.length !== 26 || brunch.rows.length !== 18 || happyHour.rows.length !== 7) {
    throw new Error(
      `Anju source shape changed: expected retained presentation counts 26/18/7; found ${dinner.rows.length}/${brunch.rows.length}/${happyHour.rows.length}.`,
    );
  }
  if (dinner.modifiers.length !== 6 || brunch.modifiers.length !== 7) {
    throw new Error(
      `Anju modifier shape changed: expected 6 dinner and 7 brunch modifier rows; found ${dinner.modifiers.length}/${brunch.modifiers.length}.`,
    );
  }
  if (brunch.excludedAlcohol.length !== 3 || happyHour.excludedAlcohol.length !== 6) {
    throw new Error(
      `Anju alcohol filter changed: expected 3 brunch and 6 happy-hour exclusions; found ${brunch.excludedAlcohol.length}/${happyHour.excludedAlcohol.length}.`,
    );
  }

  const presentations = [...dinner.rows, ...brunch.rows, ...happyHour.rows];
  const merged = mergePresentations(presentations);
  if (merged.length !== 49) {
    throw new Error(`Anju canonical merge changed: expected 49 products; found ${merged.length}.`);
  }

  const items = merged.map((row) => {
    const allergens = publishedSignalsAnju(row);
    const toast = linkedToastEvidence[slugify(row.name)];
    const sourceUrls = unique([
      ...row.sourceUrls,
      ...(toast ? [sourceUrlsAnju.toastOrder] : []),
    ]);
    const ingredientsText = clean([
      row.description,
      toast?.text,
    ].filter(Boolean).join(" ")) || null;
    return {
      id: slugify(row.name),
      name: clean(row.name),
      category: row.category,
      description: row.description,
      ingredientsText,
      prices: row.prices,
      menuKinds: row.menuKinds,
      inlineModifiers: row.inlineModifiers,
      isConfigurable: row.inlineModifiers.length > 0 || [
        "Dolsot Bibim Bap",
        "Gimbap Box",
        "Set of Three (Choose any 3)",
        "Shrimp Juk",
        "Sorbet or Gelato",
      ].includes(row.name),
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: toast
        ? "restaurant-issued-menu-and-linked-order-text"
        : "restaurant-issued-menu-text",
      sourceUrls,
      sourceSummary: allergens.length > 0
        ? "Direct ingredient terms from Anju's current restaurant-issued menu and, where applicable, its restaurant-linked Toast catalog were reviewed for positive allergen signals. The sources are not a complete allergen matrix or cross-contact disclosure."
        : "Anju's current restaurant-issued menu does not provide enough item-level detail to assign a fixed major-allergen signal. Missing terms are not negative assurances, and no may-contain claim is invented.",
      evidence: [
        ...row.sourceUrls.map((sourceUrl) => ({
          sourceKind: "restaurant-issued-menu-text",
          sourceUrl,
          text: clean([row.category, row.name, row.description].filter(Boolean).join(" — ")),
        })),
        ...(toast ? [{
          sourceKind: "restaurant-linked-order-text",
          sourceUrl: sourceUrlsAnju.toastOrder,
          text: toast.text,
        }] : []),
      ],
    };
  }).sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    return categoryDifference || left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAnju,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAnju),
    presentationCount: presentations.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    dinnerPresentationCount: dinner.rows.length,
    brunchPresentationCount: brunch.rows.length,
    happyHourPresentationCount: happyHour.rows.length,
    excludedModifierCount: dinner.modifiers.length + brunch.modifiers.length,
    excludedAlcoholCount: brunch.excludedAlcohol.length + happyHour.excludedAlcohol.length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    excludedModifiers: [...dinner.modifiers, ...brunch.modifiers],
    excludedAlcohol: [...brunch.excludedAlcohol, ...happyHour.excludedAlcohol].map((row) => ({
      name: row.name,
      category: row.category,
      menuKind: row.menuKind,
      reason: "alcohol-only menu product",
    })),
    sourceWarning:
      "The current restaurant-issued dinner, brunch, and happy-hour pages define the catalog. The restaurant-linked Toast ordering page is used only for overlapping item details and explicit positive disclosures, not to add takeout-only products. The online FAQ says printed gluten-free, vegetarian, and dairy-free menus exist but does not publish them. Its blanket no-peanut statement conflicts with a current Toast peanut warning and is therefore not used as a negative assurance. No complete allergen matrix or cross-contact disclosure is available online.",
    items,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const artifactRoot = path.join(root, `artifacts/${restaurantIdAnju}`);
  const [dinnerHtml, brunchHtml, happyHourHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "official-anju-dinner.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-anju-brunch.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-anju-happy-hour.html"), "utf8"),
  ]);
  const snapshot = buildAnjuAuditSnapshot({
    dinnerHtml,
    brunchHtml,
    happyHourHtml,
    retrievedAt: retrievedAtAnju,
  });
  const outputDir = path.join(root, `repairs/${restaurantIdAnju}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "corrected-menu.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    presentationCount: snapshot.presentationCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    excludedModifierCount: snapshot.excludedModifierCount,
    excludedAlcoholCount: snapshot.excludedAlcoholCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
