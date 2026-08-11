import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAfghanBistro = "afghan-bistro-springfield-va-dc-metro";

export const sourceUrlsAfghanBistro = Object.freeze({
  lunch: "https://www.afghanbistro.com/menu-1",
  dinner: "https://www.afghanbistro.com/menu-1?location=Alban+Road&menu=dinner-menu-1",
  chutneys: "https://www.afghanbistro.com/menu-1?location=Alban+Road&menu=chutneys",
  rawMeats: "https://www.afghanbistro.com/menu-1?location=Alban+Road&menu=marinated-raw-meats",
});

const categoryOrder = Object.freeze([
  "MAZZA (APPETIZERS)",
  "SOUPS & SALADS",
  "QORMAS (STEWS)",
  "CHOPS AND KABOBS",
  "BURGERS & WRAPS",
  "ENTREES",
  "VEGETARIAN & VEGAN",
  "ADDITIONAL SIDES",
  "DESSERTS",
  "CHUTNEYS",
  "RAW MARINATED MEATS",
]);

const expectedPresentationCounts = Object.freeze({
  Lunch: 96,
  Dinner: 93,
  Chutneys: 4,
  "Raw Marinated Meats": 9,
});

export function parseAfghanBistroMenuPage(html, { mealPeriod, sourceUrl }) {
  const $ = cheerio.load(html);
  const rows = [];

  $("[id^='section-']").each((_sectionIndex, section) => {
    const sectionNode = $(section);
    const rawCategory = clean(sectionNode.find("[data-hook='section.name']").first().text());
    const category = normalizeCategory(rawCategory);
    const sectionDescription = clean(
      sectionNode.find("[data-hook='section.description']").first().text(),
    );

    sectionNode.find("[data-hook='item.container']").each((_itemIndex, item) => {
      const itemNode = $(item);
      const name = clean(itemNode.find("[data-hook='item.name']").first().text());
      if (!name) return;

      const modifierGroups = itemNode.find("[data-hook='item.modifierGroups']").map((_index, group) => {
        const groupNode = $(group);
        return {
          name: clean(groupNode.find("[data-hook^='modifierGroup.name']").first().text()),
          options: groupNode.find("[data-hook='modifier.name']").map((_modifierIndex, modifier) =>
            clean($(modifier).text())
          ).get().filter(Boolean),
        };
      }).get().filter((group) => group.name || group.options.length > 0);

      rows.push({
        name,
        category,
        rawCategory,
        description: clean(itemNode.find("[data-hook='item.description']").first().text()) || null,
        sectionDescription: sectionDescription || null,
        price: clean(itemNode.find("[data-hook='item.price']").first().text()) || null,
        labels: unique(itemNode.find("[data-hook='item.label']").map((_labelIndex, label) =>
          clean($(label).text())
        ).get().filter(Boolean)),
        modifierGroups,
        mealPeriod,
        sourceUrl,
      });
    });
  });

  const expectedCount = expectedPresentationCounts[mealPeriod];
  if (expectedCount !== undefined && rows.length !== expectedCount) {
    throw new Error(
      `Afghan Bistro ${mealPeriod} source shape changed: expected ${expectedCount} presentations, found ${rows.length}.`,
    );
  }

  return rows;
}

export function buildAfghanBistroAuditSnapshot({
  lunchHtml,
  dinnerHtml,
  chutneysHtml,
  rawMeatsHtml,
  retrievedAt = new Date().toISOString(),
}) {
  const presentations = [
    ...parseAfghanBistroMenuPage(lunchHtml, {
      mealPeriod: "Lunch",
      sourceUrl: sourceUrlsAfghanBistro.lunch,
    }),
    ...parseAfghanBistroMenuPage(dinnerHtml, {
      mealPeriod: "Dinner",
      sourceUrl: sourceUrlsAfghanBistro.dinner,
    }),
    ...parseAfghanBistroMenuPage(chutneysHtml, {
      mealPeriod: "Chutneys",
      sourceUrl: sourceUrlsAfghanBistro.chutneys,
    }),
    ...parseAfghanBistroMenuPage(rawMeatsHtml, {
      mealPeriod: "Raw Marinated Meats",
      sourceUrl: sourceUrlsAfghanBistro.rawMeats,
    }),
  ];

  const grouped = new Map();
  for (const [presentationIndex, presentation] of presentations.entries()) {
    const key = normalizeName(presentation.name);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ ...presentation, presentationIndex });
  }

  const items = [...grouped.values()].map((rows) => {
    const first = rows[0];
    const descriptions = unique(rows.map((row) => row.description).filter(Boolean));
    const description = descriptions.length <= 1
      ? descriptions[0] ?? null
      : unique(rows.filter((row) => row.description).map((row) =>
        `${row.mealPeriod}: ${row.description}`
      )).join("; ");
    const signal = publishedSignalsAfghanBistro({
      name: first.name,
      description,
      modifierGroups: rows.flatMap((row) => row.modifierGroups),
    });

    return {
      auditItemKey: `${first.presentationIndex}:${slugify(first.category)}:${slugify(first.name)}`,
      id: slugify(first.name),
      name: first.name,
      category: first.category,
      description,
      ingredientsText: description,
      isConfigurable: rows.some((row) => row.modifierGroups.length > 0),
      mealPeriods: unique(rows.map((row) => row.mealPeriod)),
      officialLabels: unique(rows.flatMap((row) => row.labels)),
      sourceUrls: unique(rows.map((row) => row.sourceUrl)),
      sourceType: "restaurant-issued-menu",
      allergens: signal.allergens,
      mayContain: [],
      allergenSourceType: signal.allergens.length > 0 ? "official-ingredients" : "unavailable",
      firstPresentationIndex: Math.min(...rows.map((row) => row.presentationIndex)),
    };
  }).sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    return categoryDifference || left.firstPresentationIndex - right.firstPresentationIndex;
  }).map(({ firstPresentationIndex: _firstPresentationIndex, ...item }) => item);

  const glutenLabelConflicts = items.filter((item) =>
    item.officialLabels.some((label) => /^gluten free$/i.test(label)) &&
    (item.allergens.includes("wheat") || item.allergens.includes("gluten"))
  );
  if (glutenLabelConflicts.length > 0) {
    throw new Error(
      `Positive wheat/gluten signals conflict with official gluten-free labels: ${glutenLabelConflicts.map((item) => item.name).join(", ")}.`,
    );
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAfghanBistro,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAfghanBistro),
    presentationCount: presentations.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Afghan Bistro publishes current names, descriptions, meal-period sections, modifier choices, and item-specific gluten-free labels, but no complete allergen matrix, complete recipes, or kitchen cross-contact policy. Positive signals are limited to fixed published ingredient terms and mandatory named formats; optional salad proteins and vegan substitutions are excluded. An item-specific gluten-free label prevents a conflicting wheat/gluten signal. The home-page statement that almost everything is gluten free is not converted into item-level negative allergen claims.",
    items,
  };
}

export function publishedSignalsAfghanBistro({ name, description, modifierGroups = [] }) {
  const text = clean(`${name} ${description ?? ""}`).normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const allergens = [];

  if (/\b(?:milk|yogurt|yoghurt|cheese|ricotta|ice cream|rice pudding)\b/.test(text)) {
    allergens.push("milk");
  }
  if (/\b(?:pistachios?|walnuts?)\b/.test(text)) allergens.push("tree-nut");
  if (/\bsalmon\b/.test(text)) allergens.push("fish");
  const namedWheatFormat = /\b(?:turnovers?|dumplings?|aushak|mantu|sambosa|wraps?|cake)\b/i.test(name);
  const fixedWheatText = /\b(?:bread|brioche|buns?|croutons?|aushak|mantu)\b/i.test(description ?? "");
  if (namedWheatFormat || fixedWheatText) {
    allergens.push("wheat", "gluten");
  }
  if (/\bcake\b/i.test(name)) allergens.push("egg");

  if (/^cake$/i.test(name)) {
    const flavorNames = modifierGroups.flatMap((group) => group.options);
    if (
      flavorNames.length > 0 &&
      flavorNames.every((flavor) => /\b(?:milk|ricotta|mousse)\b/i.test(flavor))
    ) {
      allergens.push("milk");
    }
  }

  return { allergens: unique(allergens) };
}

function normalizeCategory(value) {
  const normalized = clean(value)
    .replace(/\s*\|\s*(?:LUNCH|DINNER)\s*$/i, "")
    .replace(/^SOUP\s*&\s*SALADS$/i, "SOUPS & SALADS")
    .replace(/^CHUTNEYS\s*\(NEW\)$/i, "CHUTNEYS")
    .replace(/^Raw Marinated Meats$/i, "RAW MARINATED MEATS");
  return normalized.toUpperCase();
}

function normalizeName(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const artifactRoot = path.join(root, `artifacts/${restaurantIdAfghanBistro}`);
  const [lunchHtml, dinnerHtml, chutneysHtml, rawMeatsHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "official-menu.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-dinner-menu.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-chutneys-menu.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-raw-meats-menu.html"), "utf8"),
  ]);
  const snapshot = buildAfghanBistroAuditSnapshot({
    lunchHtml,
    dinnerHtml,
    chutneysHtml,
    rawMeatsHtml,
  });
  const outputDir = path.join(root, `repairs/${restaurantIdAfghanBistro}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    presentationCount: snapshot.presentationCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
