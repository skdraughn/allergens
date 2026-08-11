import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAnnabelle = "annabelle-dc";
export const retrievedAtAnnabelle = "2026-07-15T06:16:00.000Z";
export const sourceUrlsAnnabelle = Object.freeze({
  dinner: "https://annabelledc.com/dinneranddessert",
  bar: "https://annabelledc.com/easter-brunch-menu",
  eat: "https://annabelledc.com/eat-1",
  home: "https://annabelledc.com/",
  fdaCoconut: "https://www.fda.gov/food/food-allergensgluten-free-guidance-documents-regulatory-information/frequently-asked-questions-food-allergen-labeling-guidance-industry",
});

const categoryOrder = Object.freeze([
  "Appetizer",
  "Second Course",
  "Main Course",
  "Sides",
  "Desserts",
  "Bar Bites",
]);

function clean(value) {
  return cheerio.load(String(value ?? ""), null, false).text().replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
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

function parsePrice(value) {
  const match = clean(value).match(/^\$?\s*(\d+(?:\.\d{1,2})?)$/);
  return match ? Number(match[1]) : null;
}

function extractLabels(name) {
  const labels = [...String(name).matchAll(/\(([ndgsv])\)/gi)].map((match) => match[1].toLowerCase());
  return {
    name: clean(String(name).replace(/\s*(?:\([ndgsv]\))+\s*$/gi, "")),
    labels: unique(labels),
  };
}

function canonicalCategory(value) {
  const key = normalize(value);
  return new Map([
    ["appetizer", "Appetizer"],
    ["second course", "Second Course"],
    ["main course", "Main Course"],
    ["sides", "Sides"],
    ["desserts", "Desserts"],
  ]).get(key) ?? null;
}

export function parseAnnabelleDinner(html) {
  const $ = cheerio.load(html);
  const rows = [];
  const discarded = [];
  $(".menu-section").each((_sectionIndex, section) => {
    const category = canonicalCategory($(section).find(".menu-section-title").first().text());
    if (!category) return;
    const elements = $(section).find(".menu-item").toArray();
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const rawTitle = clean($(element).find(".menu-item-title").first().text());
      const description = clean($(element).find(".menu-item-description").first().text());
      const top = clean($(element).find(".menu-item-price-top").first().text());
      if (!rawTitle || parsePrice(rawTitle) !== null) {
        discarded.push({ rawTitle, description, top, category, reason: "empty-or-price-only-layout-row" });
        continue;
      }

      const { name, labels } = extractLabels(rawTitle);
      const descriptionParts = [description];
      let price = parsePrice(top);
      if (top && price === null) descriptionParts.push(top);
      if (price === null && elements[index + 1]) {
        const next = elements[index + 1];
        const nextTitle = clean($(next).find(".menu-item-title").first().text());
        const nextTop = clean($(next).find(".menu-item-price-top").first().text());
        const nextPrice = parsePrice(nextTop) ?? parsePrice(nextTitle);
        if (nextPrice !== null && (!nextTitle || parsePrice(nextTitle) !== null)) price = nextPrice;
      }
      rows.push({
        name,
        rawName: rawTitle,
        labels,
        category,
        description: clean(descriptionParts.join(" ")) || null,
        price,
        sourceUrl: sourceUrlsAnnabelle.dinner,
      });
    }
  });
  return { rows, discarded };
}

export function parseAnnabelleBarBites(html) {
  const $ = cheerio.load(html);
  const content = $(".sqs-html-content").filter((_index, element) =>
    $(element).find("h1").toArray().some((heading) => normalize($(heading).text()) === "bar bites"),
  ).first();
  const rows = [];
  let current = null;
  content.find("h1,p").each((_index, element) => {
    const text = clean($(element).text());
    if (!text) return;
    if (element.tagName.toLowerCase() === "h1") {
      if (current) rows.push(current);
      current = normalize(text) === "bar bites"
        ? null
        : {
          name: text,
          rawName: text,
          labels: [],
          category: "Bar Bites",
          description: null,
          price: null,
          sourceUrl: sourceUrlsAnnabelle.bar,
        };
      return;
    }
    if (!current || /^\([ndgsv]\)/i.test(text) || /^consuming raw/i.test(text)) return;
    current.description = clean([current.description, text].filter(Boolean).join(" ")) || null;
  });
  if (current) rows.push(current);
  return rows;
}

export function publishedSignalsAnnabelle(row) {
  const allergens = [];
  const labelSet = new Set(row.labels ?? []);
  if (labelSet.has("d")) allergens.push("milk");
  if (labelSet.has("g")) allergens.push("gluten");
  if (labelSet.has("n")) allergens.push("tree-nut");
  if (labelSet.has("s")) allergens.push("shellfish");

  const text = normalize(`${row.name} ${row.description ?? ""}`)
    .replace(/\boyster mushrooms?\b/g, "mushrooms")
    .replace(/\bcashew cream\b/g, "cashew paste")
    .replace(/\bcoconut\b/g, "");
  if (/\b(?:cheese|parmigiano|comte|beurre blanc|brown butter|buttermilk|creme fraiche|cream|milk|roquefort|panna cotta|creme brulee|ice cream|cremeux|custard)\b/.test(text)) allergens.push("milk");
  if (/\b(?:egg|eggs|aioli)\b/.test(text)) allergens.push("egg");
  if (/\b(?:cod|snapper|bass|hamachi|trout roe|caviar)\b/.test(text)) allergens.push("fish");
  if (/\b(?:oysters?|lobster|octopus|shrimp|crab)\b/.test(text)) allergens.push("shellfish");
  if (/\b(?:almonds?|hazelnuts?|cashews?|pistachios?|pecans?|walnuts?)\b/.test(text)) allergens.push("tree-nut");
  if (/\b(?:pasta|brioche|bread|baguette|crostini|tartlet|graham|shortbread|cake|sable)\b/.test(text)) allergens.push("wheat", "gluten");
  return unique(allergens);
}

export function buildAnnabelleAuditSnapshot({ dinnerHtml, barHtml, retrievedAt = retrievedAtAnnabelle }) {
  const dinner = parseAnnabelleDinner(dinnerHtml);
  const bar = parseAnnabelleBarBites(barHtml);
  if (dinner.rows.length !== 27 || bar.length !== 6) {
    throw new Error(`Annabelle source shape changed: expected 27 dinner/dessert and 6 bar products; found ${dinner.rows.length}/${bar.length}.`);
  }
  const items = [...dinner.rows, ...bar].map((row) => {
    const allergens = publishedSignalsAnnabelle(row);
    return {
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      price: row.price,
      officialLabels: row.labels,
      isConfigurable: false,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: row.sourceUrl === sourceUrlsAnnabelle.dinner
        ? "restaurant-issued-allergen-keyed-menu"
        : "restaurant-issued-menu-text",
      sourceUrls: [row.sourceUrl],
      sourceSummary: row.sourceUrl === sourceUrlsAnnabelle.dinner
        ? "Annabelle's current menu legend and item description were reconciled for positive allergen signals. The legend does not disclose cross-contact and its generic nuts code does not distinguish peanut from tree-nut species."
        : "Direct ingredient terms from Annabelle's current Bar Bites page were reviewed for positive allergen signals. This is not a complete allergen matrix or cross-contact disclosure.",
      evidence: [{
        sourceKind: row.sourceUrl === sourceUrlsAnnabelle.dinner
          ? "restaurant-issued-allergen-keyed-menu"
          : "restaurant-issued-menu-text",
        sourceUrl: row.sourceUrl,
        text: clean([row.rawName, row.description].filter(Boolean).join(" — ")),
      }],
    };
  }).sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    return categoryDifference || left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAnnabelle,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAnnabelle).filter((url) => url !== sourceUrlsAnnabelle.fdaCoconut),
    menuUpdatedLabel: "Updated 7/11/2026",
    itemCount: items.length,
    dinnerItemCount: dinner.rows.length,
    barItemCount: bar.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    discardedLayoutRowCount: dinner.discarded.length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "The current dinner menu is explicitly dated July 11, 2026 and defines (n) Contains Nuts, (g) Contains Gluten, (d) Contains Dairy, and (s) Contains Shellfish. The parser applies those labels only to the marked item, never globally. Generic (n) is represented as the app's tree-nut signal but remains non-species-specific. Coconut is not mapped to tree-nut because current FDA guidance no longer lists coconut as a major tree nut. Oyster mushrooms and cashew cream are protected from the frozen parser's shellfish and dairy substring false positives. No cross-contact disclosure or negative assurance is invented.",
    discardedLayoutRows: dinner.discarded,
    items,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const artifactRoot = path.join(root, `artifacts/${restaurantIdAnnabelle}`);
  const [dinnerHtml, barHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "official-annabelle-dinner-dessert.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-annabelle-bar-bites.html"), "utf8"),
  ]);
  const snapshot = buildAnnabelleAuditSnapshot({ dinnerHtml, barHtml });
  const outputDir = path.join(root, `repairs/${restaurantIdAnnabelle}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    dinnerItemCount: snapshot.dinnerItemCount,
    barItemCount: snapshot.barItemCount,
    categoryCount: snapshot.categoryCount,
    discardedLayoutRowCount: snapshot.discardedLayoutRowCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
