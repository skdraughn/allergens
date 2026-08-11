import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAfghania = "replacement-afghania-washington-dc";
export const sourceUrlsAfghania = Object.freeze({
  dinner: "https://www.afghaniadc.com/menu-1",
  rawMeats: "https://www.afghaniadc.com/menu-1?location=2811+M+Street+Northwest&menu=marinated-raw-meats",
});

const categoryOrder = Object.freeze([
  "LIMITED TIME TO-GO SPECIALS",
  "MAZZA (APPETIZERS)",
  "DUMPLINGS",
  "GRILLED MEATS TO START WITH",
  "SOUP & SALADS",
  "CHOPS AND KABOBS",
  "QORMAS & ENTREES",
  "VEGETARIAN & VEGAN",
  "VEGAN APPETIZERS",
  "VEGAN QORMAS (SLOW COOKED STEWS)",
  "ADDITIONAL SIDES",
  "RAW MARINATED MEATS",
]);

const expectedPresentationCounts = Object.freeze({ Dinner: 94, "Raw Marinated Meats": 9 });

export function parseAfghaniaMenuPage(html, { surface, sourceUrl }) {
  const $ = cheerio.load(html);
  const rows = [];
  $("[id^='section-']").each((_sectionIndex, section) => {
    const sectionNode = $(section);
    const category = clean(sectionNode.find("[data-hook='section.name']").first().text()).toUpperCase();
    const sectionDescription = clean(
      sectionNode.find("[data-hook='section.description']").first().text(),
    );
    sectionNode.find("[data-hook='item.container']").each((_itemIndex, item) => {
      const itemNode = $(item);
      const name = clean(itemNode.find("[data-hook='item.name']").first().text()).replace(/\s*\*+$/, "");
      if (!name) return;
      rows.push({
        name,
        category,
        description: clean(itemNode.find("[data-hook='item.description']").first().text()) || null,
        sectionDescription: sectionDescription || null,
        labels: unique(itemNode.find("[data-hook='item.label']").map((_index, label) =>
          clean($(label).text())
        ).get().filter(Boolean)),
        modifierGroups: itemNode.find("[data-hook='item.modifierGroups']").map((_index, group) => {
          const groupNode = $(group);
          return {
            name: clean(groupNode.find("[data-hook^='modifierGroup.name']").first().text()),
            options: groupNode.find("[data-hook='modifier.name']").map((_optionIndex, option) =>
              clean($(option).text())
            ).get().filter(Boolean),
          };
        }).get(),
        surface,
        sourceUrl,
      });
    });
  });
  const expectedCount = expectedPresentationCounts[surface];
  if (expectedCount !== undefined && rows.length !== expectedCount) {
    throw new Error(
      `Afghania ${surface} source shape changed: expected ${expectedCount} presentations; found ${rows.length}.`,
    );
  }
  return rows;
}

export function buildAfghaniaAuditSnapshot({
  dinnerHtml,
  rawMeatsHtml,
  retrievedAt = new Date().toISOString(),
}) {
  const rows = [
    ...parseAfghaniaMenuPage(dinnerHtml, { surface: "Dinner", sourceUrl: sourceUrlsAfghania.dinner }),
    ...parseAfghaniaMenuPage(rawMeatsHtml, {
      surface: "Raw Marinated Meats",
      sourceUrl: sourceUrlsAfghania.rawMeats,
    }),
  ];
  const duplicateKeys = duplicates(rows.map((row) => `${normalize(row.category)}:${normalize(row.name)}`));
  if (duplicateKeys.length > 0) {
    throw new Error(`Afghania has duplicate section-level product identities: ${duplicateKeys.join(", ")}.`);
  }

  const items = rows.map((row, index) => {
    const allergens = publishedSignalsAfghania(row);
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
      id: `${slugify(row.category)}-${slugify(row.name)}`,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      isConfigurable: row.modifierGroups.length > 0,
      officialLabels: row.labels,
      sourceUrls: [row.sourceUrl],
      sourceType: "restaurant-issued-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  }).sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    return categoryDifference || left.auditItemKey.localeCompare(right.auditItemKey, "en", { numeric: true });
  });

  const glutenLabelConflicts = items.filter((item) =>
    item.officialLabels.some((label) => /^gluten free$/i.test(label)) &&
    (item.allergens.includes("wheat") || item.allergens.includes("gluten"))
  );
  if (glutenLabelConflicts.length > 0) {
    throw new Error(
      `Afghania wheat/gluten signals conflict with item-specific gluten-free labels: ${glutenLabelConflicts.map((item) => `${item.category}/${item.name}`).join(", ")}.`,
    );
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAfghania,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAfghania),
    presentationCount: items.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Afghania publishes current section-level dinner and raw-marinated-meat presentations, descriptions, modifiers, vegan categories, and item-specific gluten-free labels, but no complete allergen matrix, complete recipes, or cross-contact policy. Repeated names in regular and vegan sections remain separate because their formulations differ. Positive signals are limited to fixed published ingredients and mandatory named formats; non-dairy yogurt and explicitly vegan category context do not produce milk signals, mustard greens do not produce mustard, and item-specific gluten-free labels cannot conflict with wheat/gluten fields.",
    items,
  };
}

export function publishedSignalsAfghania(row) {
  let text = clean(`${row.name} ${row.description ?? ""}`).normalize("NFKD")
    .replace(/\p{M}/gu, "").toLowerCase();
  text = text
    .replace(/\bnon-?dairy yogurt\b/g, "plant-cultured topping")
    .replace(/\beggplant\b/g, "eggplant")
    .replace(/\bmustard greens?\b/g, "greens");
  const veganCategory = /^VEGAN\b/.test(row.category);
  const allergens = [];

  if (!veganCategory && /\b(?:milk|yogurt|rice pudding|rosewater pudding|pudding)\b/.test(text)) {
    allergens.push("milk");
  }
  if (/\b(?:walnuts?|pistachios?|baklava)\b/.test(text)) allergens.push("tree-nut");
  if (/\bsalmon\b/.test(text)) allergens.push("fish");
  if (
    /\b(?:bread|brioche|croutons?|noodles?|dumplings?|turnovers?|sambosa|quroti|baklava)\b/.test(text)
  ) {
    allergens.push("wheat", "gluten");
  }

  return unique(allergens);
}

function normalize(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values)];
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const artifactRoot = path.join(root, `artifacts/${restaurantIdAfghania}`);
  const [dinnerHtml, rawMeatsHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "official-dinner-menu.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-raw-meats-menu.html"), "utf8"),
  ]);
  const snapshot = buildAfghaniaAuditSnapshot({ dinnerHtml, rawMeatsHtml });
  const outputDir = path.join(root, `repairs/${restaurantIdAfghania}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
