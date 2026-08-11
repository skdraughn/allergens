import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAndysPizzaAdamsMorgan = "andys-pizza-dc";
export const sourceUrlsAndysPizzaAdamsMorgan = Object.freeze({
  menu: "https://www.eatandyspizza.com/menu/adams-morgan/",
  allMenus: "https://www.eatandyspizza.com/menus/",
  location: "https://www.eatandyspizza.com/location/adams-morgan-andys-pizza/",
});

const categoryOrder = Object.freeze([
  "Starters + Salads",
  "Specialty Pies",
  "Standard Pies & Slices",
]);

function clean(value) {
  return cheerio.load(String(value ?? ""), null, false).text().replace(/\s+/g, " ").trim();
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

function structuredMenus(html) {
  const $ = cheerio.load(html);
  return $("script[type='application/ld+json']")
    .map((_index, element) => {
      try {
        return JSON.parse($(element).html());
      } catch {
        return null;
      }
    })
    .get()
    .filter((row) => row?.["@type"] === "Menu");
}

function offerPrices(offers) {
  return (Array.isArray(offers) ? offers : [offers])
    .filter(Boolean)
    .map((offer) => Number(offer.price))
    .filter(Number.isFinite);
}

export function parseAndysPizzaStructuredMenu(html, { expectedMenuName }) {
  const menus = structuredMenus(html);
  const menu = menus.find((row) => row.name === expectedMenuName);
  if (!menu) {
    throw new Error(`Andy's Pizza source does not contain the ${expectedMenuName} structured menu.`);
  }
  const rows = [];
  for (const section of menu.hasMenuSection ?? []) {
    const category = clean(section.name);
    for (const item of section.hasMenuItem ?? []) {
      rows.push({
        name: clean(item.name),
        category,
        description: clean(item.description) || null,
        prices: offerPrices(item.offers),
        dietaryLabels: unique(
          (item.suitableForDiet ?? []).map((diet) => clean(diet.name).toLowerCase()),
        ),
        menuDescription: clean(menu.description) || null,
      });
    }
  }
  return rows;
}

export function parseAndysPizzaAllLocations(html) {
  return structuredMenus(html).map((menu) => ({
    locationName: menu.name,
    items: (menu.hasMenuSection ?? []).flatMap((section) =>
      (section.hasMenuItem ?? []).map((item) => ({
        name: clean(item.name),
        category: clean(section.name),
      }))
    ),
  }));
}

export function publishedSignalsAndysPizzaAdamsMorgan(row) {
  const fixedText = normalize(`${row.name} ${row.description ?? ""}`)
    .replace(/\bvegan vertage cheese\b/g, "plant based topping");
  const allergens = [];

  if (
    /\b(?:mozzarella|parmigiano|goat cheese|provolone|ricotta|burrata|cream sauce)\b/.test(
      fixedText,
    ) || row.name === "8 Makes a Pie"
  ) {
    allergens.push("milk");
  }
  if (
    /\b(?:breadcrumbs?|croutons?)\b/.test(fixedText) ||
    /\b(?:pies?|pizza)\b/.test(normalize(`${row.category} ${row.name}`))
  ) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

export function buildAndysPizzaAdamsMorganAuditSnapshot({
  menuHtml,
  allMenusHtml,
  retrievedAt = new Date().toISOString(),
}) {
  const parsed = parseAndysPizzaStructuredMenu(menuHtml, { expectedMenuName: "Adams Morgan" });
  if (parsed.length !== 16) {
    throw new Error(
      `Andy's Pizza Adams Morgan source shape changed: expected 16 structured rows; found ${parsed.length}.`,
    );
  }

  const allLocations = parseAndysPizzaAllLocations(allMenusHtml);
  if (allLocations.length !== 10) {
    throw new Error(
      `Andy's Pizza all-menus source shape changed: expected 10 location menus; found ${allLocations.length}.`,
    );
  }
  const indexedAdamsMorgan = allLocations.find((location) => location.locationName === "Adams Morgan");
  if (!indexedAdamsMorgan || indexedAdamsMorgan.items.length !== 16) {
    throw new Error("Andy's Pizza all-menus page no longer corroborates the 16-row Adams Morgan menu.");
  }

  const modifiers = parsed.filter((row) => row.prices.length === 0);
  if (modifiers.length !== 1 || modifiers[0].name !== "Whole Pie Toppings:") {
    throw new Error("Andy's Pizza Adams Morgan modifier-group classification changed.");
  }
  const retained = parsed.filter((row) => row.prices.length > 0);
  const items = retained.map((row) => {
    const allergens = publishedSignalsAndysPizzaAdamsMorgan(row);
    const universalCrustText = /Pies & Slices|Specialty Pies/.test(row.category)
      ? row.menuDescription
      : null;
    return {
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: clean([universalCrustText, row.description].filter(Boolean).join(" ")) || null,
      prices: row.prices,
      isConfigurable: row.name === "8 Makes a Pie",
      officialLabels: row.dietaryLabels,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-issued-structured-menu",
      sourceUrls: [sourceUrlsAndysPizzaAdamsMorgan.menu],
      sourceSummary:
        "The current Adams Morgan menu's item description and applicable universal 72-hour sourdough-crust description were reviewed for direct positive allergen signals. This is not a complete allergen matrix or cross-contact disclosure.",
      evidence: [
        {
          sourceKind: "restaurant-issued-structured-menu",
          sourceUrl: sourceUrlsAndysPizzaAdamsMorgan.menu,
          text: clean([
            row.category,
            row.name,
            universalCrustText,
            row.description,
          ].filter(Boolean).join(" — ")),
        },
      ],
    };
  }).sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    return categoryDifference || left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  const retainedNames = new Set(items.map((item) => normalize(item.name)));
  const otherLocationItemLocations = {};
  for (const location of allLocations.filter((row) => row.locationName !== "Adams Morgan")) {
    for (const item of location.items) {
      const key = normalize(item.name);
      if (retainedNames.has(key)) continue;
      otherLocationItemLocations[item.name] = unique([
        ...(otherLocationItemLocations[item.name] ?? []),
        location.locationName,
      ]);
    }
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAndysPizzaAdamsMorgan,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAndysPizzaAdamsMorgan),
    publishedStructuredRowCount: parsed.length,
    itemCount: items.length,
    modifierGroupCount: modifiers.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    excludedModifierGroups: modifiers.map((row) => ({
      name: row.name,
      category: row.category,
      reason: "price-less configurable topping group, not a standalone product",
    })),
    otherLocationItemLocations,
    sourceWarning:
      "This snapshot is scoped only to Andy's Pizza at 2465 18th St NW in Adams Morgan. The restaurant's current exact-location page publishes 16 structured rows: 15 purchasable products and one price-less Whole Pie Toppings modifier group. The all-menus page contains nine other location catalogs and is used only to identify location bleed, never to add products to Adams Morgan. The current menu publishes a universal 72-hour sourdough crust description and direct item ingredients but no complete allergen matrix or cross-contact disclosure. Positive milk, wheat, and gluten signals are retained; missing terms are not negative assurances and no may-contain claim is invented.",
    items,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const artifactRoot = path.join(root, `artifacts/${restaurantIdAndysPizzaAdamsMorgan}`);
  const [menuHtml, allMenusHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "official-andys-adams-morgan-menu.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-andys-all-menus.html"), "utf8"),
  ]);
  const snapshot = buildAndysPizzaAdamsMorganAuditSnapshot({ menuHtml, allMenusHtml });
  const outputDir = path.join(root, `repairs/${restaurantIdAndysPizzaAdamsMorgan}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "corrected-menu.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    publishedStructuredRowCount: snapshot.publishedStructuredRowCount,
    itemCount: snapshot.itemCount,
    modifierGroupCount: snapshot.modifierGroupCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
