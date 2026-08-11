import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAnatolianBistro = "osm-anatolian-bistro-6230019077";

export const sourceUrlsAnatolianBistro = Object.freeze({
  lunch: "https://anatolianbistro.com/lunch/",
  dinner: "https://anatolianbistro.com/dinner-menu/",
  order: "https://anatolianbistro.com/order/",
});

const expectedPresentationCounts = Object.freeze({
  Lunch: 77,
  Dinner: 81,
});

const categoryOrder = Object.freeze([
  "Soup & Salads",
  "Appetizers",
  "Hot Appetizers",
  "Entrees (Lunch)",
  "Vegetarian Entrees (Lunch)",
  "Seafood (Lunch)",
  "Entrees (Dinner)",
  "Vegetarian Entrees (Dinner)",
  "Seafood (Dinner)",
  "Side Orders",
  "Desserts",
  "Ice Cream",
  "Beverages",
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
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
  const match = clean(value).match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function canonicalName(publishedName) {
  return clean(publishedName)
    .replace(/^\*+\s*/, "")
    .replace(/\s+-\s+Sold Out$/i, "")
    .trim();
}

function officialLabels(name, description) {
  const text = `${name} ${description ?? ""}`;
  return /\(GF\)|\bgluten[ -]?free\b/i.test(text) ? ["GF"] : [];
}

function isEntreeCategory(category) {
  return /^(?:Entrees|Vegetarian Entrees|Seafood) \((?:Lunch|Dinner)\)$/.test(category);
}

export function parseAnatolianMenuPage(html, { mealPeriod, sourceUrl }) {
  const $ = cheerio.load(html);
  const rows = [];

  $(".exwf-mngr-item").each((_categoryIndex, categoryElement) => {
    const category = clean($(categoryElement).find(".mn-namegroup").first().text());
    if (!category) return;

    $(categoryElement).find(".fditem-list").each((_itemIndex, itemElement) => {
      const item = $(itemElement);
      const publishedName = clean(item.find(".fdlist_1_name").first().text());
      const sourceItemId = clean(item.attr("data-id_food"));
      const productUrl = item.find("a.exfd_modal_click").first().attr("href");
      if (!publishedName || !sourceItemId || !productUrl) return;

      const description = clean(item.find(".fdlist_1_des").first().text());
      rows.push({
        sourceItemId,
        publishedName,
        name: canonicalName(publishedName),
        category,
        description: description || null,
        price: parsePrice(item.find(".fdlist_1_price").first().text()),
        productUrl,
        mealPeriod,
        sourceUrl,
        labels: officialLabels(publishedName, description),
        isAvailable: !/\bSold Out\b/i.test(publishedName),
      });
    });
  });

  const expectedCount = expectedPresentationCounts[mealPeriod];
  if (expectedCount !== undefined && rows.length !== expectedCount) {
    throw new Error(
      `Anatolian Bistro ${mealPeriod} source shape changed: expected ${expectedCount} presentations; found ${rows.length}.`,
    );
  }
  return rows;
}

export function parseAnatolianOrderProductIds(html) {
  const $ = cheerio.load(html);
  return unique(
    $(".fditem-list")
      .map((_index, element) => clean($(element).attr("data-id_food")))
      .get(),
  );
}

export function publishedSignalsAnatolianBistro(row) {
  const fixedDescription = String(row.description ?? "").replace(
    /\((?:additional|optional)\b[^)]*\)/gi,
    "",
  );
  const text = normalize(`${row.name} ${fixedDescription}`);
  const glutenFree = row.labels.includes("GF");
  const allergens = [];

  if (/\b(?:shrimp|crab|calamari|shellfish|lobster|clam|oyster|scallop|mussel|squid)\b/.test(text)) {
    allergens.push("shellfish");
  }
  if (/\b(?:salmon|bronzino|tilapia|fish)\b/.test(text)) allergens.push("fish");
  if (
    /\b(?:milk|milky|yogurt|cheese|feta|mozzarella|cream|ice cream|ayran)\b/.test(text)
  ) {
    allergens.push("milk");
  }
  if (/\b(?:walnuts?|pistachios?|hazelnuts?)\b/.test(text)) allergens.push("tree-nut");
  if (/\b(?:tahini|sesame)\b/.test(text)) allergens.push("sesame");

  const mixedAppetizer = /^Anatolian Mixed Appetizer Plate/i.test(row.name);
  const falafelSandwich = /^Falafel Sandwich/i.test(row.name);
  if (mixedAppetizer) allergens.push("milk", "sesame", "wheat", "gluten");
  if (falafelSandwich) allergens.push("sesame");

  const directWheat = /\b(?:wheat|bread|breaded|pita|lavash|pastry|pastries|dough|phyllo|dumpling|dumplings)\b/.test(text);
  const universalBread = isEntreeCategory(row.category);
  if (!glutenFree && (directWheat || universalBread)) allergens.push("wheat", "gluten");

  return unique(allergens);
}

function mergePresentations(presentations) {
  const bySourceItemId = new Map();
  for (const row of presentations) {
    const existing = bySourceItemId.get(row.sourceItemId);
    if (!existing) {
      bySourceItemId.set(row.sourceItemId, { ...row, presentations: [row] });
      continue;
    }
    const comparableFields = ["name", "category", "description", "price", "productUrl", "isAvailable"];
    const conflicts = comparableFields.filter((field) => existing[field] !== row[field]);
    if (conflicts.length > 0) {
      throw new Error(
        `Anatolian Bistro product ${row.sourceItemId} conflicts across menu surfaces: ${conflicts.join(", ")}.`,
      );
    }
    existing.presentations.push(row);
    existing.labels = unique([...existing.labels, ...row.labels]);
  }
  return [...bySourceItemId.values()];
}

export function buildAnatolianBistroAuditSnapshot({
  lunchHtml,
  dinnerHtml,
  orderHtml,
  retrievedAt = new Date().toISOString(),
}) {
  const presentations = [
    ...parseAnatolianMenuPage(lunchHtml, {
      mealPeriod: "Lunch",
      sourceUrl: sourceUrlsAnatolianBistro.lunch,
    }),
    ...parseAnatolianMenuPage(dinnerHtml, {
      mealPeriod: "Dinner",
      sourceUrl: sourceUrlsAnatolianBistro.dinner,
    }),
  ];
  const merged = mergePresentations(presentations);
  if (merged.length !== 105) {
    throw new Error(
      `Anatolian Bistro source shape changed: expected 105 unique products; found ${merged.length}.`,
    );
  }

  const orderProductIds = parseAnatolianOrderProductIds(orderHtml);
  const currentIds = new Set(merged.map((row) => row.sourceItemId));
  const unknownOrderIds = orderProductIds.filter((id) => !currentIds.has(id));
  if (unknownOrderIds.length > 0) {
    throw new Error(
      `Anatolian Bistro order page contains products absent from lunch/dinner: ${unknownOrderIds.join(", ")}.`,
    );
  }

  const items = merged.map((row) => {
    const allergens = publishedSignalsAnatolianBistro(row);
    const sourceUrls = unique(row.presentations.map((presentation) => presentation.sourceUrl));
    const sourceSummary = row.labels.includes("GF")
      ? "The restaurant labels this item gluten-free and publishes its current name and description. The label prevents contradictory wheat/gluten inference but is not a cross-contact or broad safety assurance. Only direct positive ingredient terms are represented as allergens."
      : isEntreeCategory(row.category)
        ? "The restaurant publishes this current formulation and states that all entrées are served with homemade bread. Direct positive ingredient terms and that fixed bread accompaniment are represented as allergens; the menu is not a complete allergen matrix or cross-contact guide."
        : "Direct positive ingredient or mandatory formulation terms from the restaurant's current menu text are represented as allergens. Missing terms are not negative assurances, and the menu is not a complete allergen matrix or cross-contact guide.";
    return {
      id: `${slugify(row.category)}-${slugify(row.name)}`,
      sourceItemId: row.sourceItemId,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      price: row.price,
      isConfigurable: /\b(?:choose three|or wrap|additional)\b/i.test(
        `${row.name} ${row.description ?? ""}`,
      ),
      isAvailable: row.isAvailable,
      officialLabels: row.labels,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-issued-menu",
      sourceUrls,
      sourceSummary,
      presentations: row.presentations.map((presentation) => ({
        authorityTier: "restaurant_issued",
        mealPeriod: presentation.mealPeriod,
        category: presentation.category,
        name: presentation.publishedName,
        price: presentation.price,
        productUrl: presentation.productUrl,
        sourceItemId: presentation.sourceItemId,
        sourceUrl: presentation.sourceUrl,
      })),
      evidence: row.presentations.map((presentation) => ({
        sourceKind: "restaurant-issued-menu-text",
        sourceUrl: presentation.sourceUrl,
        text: clean([
          presentation.mealPeriod,
          presentation.category,
          presentation.publishedName,
          presentation.description,
          presentation.price === null ? null : `$${presentation.price}`,
        ].filter(Boolean).join(" — ")),
      })),
    };
  }).sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    return categoryDifference || left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  const duplicateIds = items.filter((item, index) =>
    items.findIndex((candidate) => candidate.id === item.id) !== index
  );
  if (duplicateIds.length > 0) {
    throw new Error(
      `Anatolian Bistro corrected catalog has duplicate IDs: ${duplicateIds.map((item) => item.id).join(", ")}.`,
    );
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAnatolianBistro,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAnatolianBistro),
    presentationCount: presentations.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    orderPageCorroboratingItemCount: orderProductIds.length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    glutenFreeLabelCount: items.filter((item) => item.officialLabels.includes("GF")).length,
    soldOutCount: items.filter((item) => !item.isAvailable).length,
    sourceWarning:
      "Anatolian Bistro's current restaurant-issued lunch and dinner pages publish 158 presentations representing 105 unique products; the first 100 are independently corroborated by the restaurant's pickup-order page. The site defines GF as gluten-free but publishes no complete allergen matrix or cross-contact disclosure. Item-specific GF labels suppress contradictory wheat/gluten inference without becoming broad safety claims. Non-GF entrées inherit the menu's explicit homemade-bread accompaniment. Only direct positive ingredient, named-component, or mandatory formulation terms become fixed allergen signals; optional add-ons are excluded, missing terms are never negative assurances, and beverages are placed last.",
    items,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const artifactRoot = path.join(root, `artifacts/${restaurantIdAnatolianBistro}`);
  const [lunchHtml, dinnerHtml, orderHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "official-anatolian-lunch.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-anatolian-dinner.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-anatolian-order.html"), "utf8"),
  ]);
  const snapshot = buildAnatolianBistroAuditSnapshot({ lunchHtml, dinnerHtml, orderHtml });
  const outputDir = path.join(root, `repairs/${restaurantIdAnatolianBistro}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "corrected-menu.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    presentationCount: snapshot.presentationCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    orderPageCorroboratingItemCount: snapshot.orderPageCorroboratingItemCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    glutenFreeLabelCount: snapshot.glutenFreeLabelCount,
    soldOutCount: snapshot.soldOutCount,
  }, null, 2));
}
