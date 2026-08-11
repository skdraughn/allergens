import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const restaurantIdAnafre = "anafre-dc";
export const officialAnafreMenuUrl = "https://anafredc.com/menu";
export const officialAnafreHomeUrl = "https://anafredc.com/";
export const linkedAnafreOrderingUrl = "https://www.mealage.com/2foodmenu8.jsp?id=9079";

const vendorCategoryNames = new Map([
  ["SIDES", "Sides"],
  ["BEVERAGES", "Beverages"],
  ["TO SHARE", "To Share"],
  ["PIZZAS", "Pizzas"],
  ["SANDWICHES", "Sandwiches"],
  ["TACOS DE GUISADO", "Tacos de Guisados"],
  ["PLATOS FUERTES", "Entrées"],
  ["LAS GRINGAS", "Gringas"],
]);

const categoryOrder = [
  "Appetizers",
  "To Share",
  "Pizzas",
  "Sandwiches",
  "Tacos de Guisados",
  "Entrées",
  "Gringas",
  "Happy Hour",
  "Sides",
  "Beverages",
];

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedName(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalizedName(value).replace(/\s+/g, "-");
}

function parsePrice(value) {
  const match = cleanText(value).match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function directOfficialAllergens({ category, description, name }) {
  const text = normalizedName(`${name} ${description}`);
  const allergens = [];
  if (/\b(?:shrimp|crab|lobster|oyster|octopus|calamari|mussel|scallop|clam|shellfish)\b/.test(text)) {
    allergens.push("shellfish");
  }
  if (/\b(?:fish|salmon|flounder)\b/.test(text)) allergens.push("fish");
  if (/\b(?:cheese|queso|mozzarella|butter|sour cream)\b/.test(text)) allergens.push("milk");
  if (/\b(?:egg|eggs|aioli|tartar sauce)\b/.test(text)) allergens.push("egg");
  if (
    /\b(?:bolillo|bread|breaded|flour tortilla|tempura|wrap)\b/.test(text) ||
    (category === "Pizzas" && !/\bchurrasco\b/.test(text)) ||
    /\bpizza\b/.test(normalizedName(name))
  ) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function officialItem({ category, description, name, price, sourceUrl, idPrefix = "" }) {
  const correctedName = name === "Queso Fundindo en Hoja de Platano"
    ? "Queso Fundido en Hoja de Platano"
    : name;
  const correctedCategory = category === "Pizzas" && /^Churrasco\b/i.test(correctedName)
    ? "Entrées"
    : category;
  const allergens = directOfficialAllergens({
    category: correctedCategory,
    description,
    name: correctedName,
  });
  return {
    id: `${idPrefix}${slugify(`${correctedCategory}-${correctedName}`)}`,
    name: correctedName,
    category: correctedCategory,
    description: description || null,
    ingredientsText: description || null,
    price,
    isConfigurable: false,
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    sourceType: idPrefix ? "official-happy-hour" : "official-menu",
    sourceUrls: [sourceUrl],
    presentations: [
      {
        authorityTier: "restaurant_issued",
        category,
        name,
        price,
        sourceUrl,
      },
    ],
    evidence: [
      {
        sourceKind: "restaurant-issued-menu-text",
        sourceUrl,
        text: cleanText([category, name, description, price === null ? null : `$${price}`].filter(Boolean).join(" — ")),
      },
    ],
  };
}

export function parseAnafreOfficialMenu(html, { sourceUrl = officialAnafreMenuUrl } = {}) {
  const $ = cheerio.load(html);
  const items = [];
  $(".menu-section").each((_sectionIndex, section) => {
    const category = cleanText($(section).find(".menu-section-title").first().text());
    if (!category) return;
    $(section).find(".menu-item").each((_itemIndex, element) => {
      const name = cleanText($(element).find(".menu-item-title").first().text());
      if (!name) return;
      const description = cleanText($(element).find(".menu-item-description").first().text());
      const price = parsePrice($(element).find(".menu-item-price-bottom").first().text());
      items.push(officialItem({ category, description, name, price, sourceUrl }));
    });
  });
  return items;
}

export function parseAnafreOfficialHappyHour(
  html,
  { sourceUrl = officialAnafreHomeUrl } = {},
) {
  const $ = cheerio.load(html);
  const panel = $('[role="tabpanel"][aria-label="Happy Hour"]').first();
  const items = [];
  let inBites = false;
  panel.find(".menu-item").each((_index, element) => {
    const name = cleanText($(element).find(".menu-item-title").first().text());
    if (name === "Bites") {
      inBites = true;
      return;
    }
    if (name === "Drinks:") {
      inBites = false;
      return;
    }
    if (!inBites || !name) return;
    items.push(
      officialItem({
        category: "Happy Hour",
        description: "",
        name,
        price: 10,
        sourceUrl,
        idPrefix: "happy-hour-",
      }),
    );
  });
  return items;
}

export function parseAnafreOfficialNonAlcoholicDrinks(
  html,
  { sourceUrl = officialAnafreHomeUrl } = {},
) {
  const $ = cheerio.load(html);
  const panel = $('[role="tabpanel"][aria-label="Non-Alcoholic Drinks"]').first();
  const items = [];
  panel.find(".menu-section").each((_sectionIndex, section) => {
    const sectionTitle = cleanText($(section).find(".menu-section-title").first().text());
    const sharedPrice = parsePrice(sectionTitle);
    if (/^Sodas\b/i.test(sectionTitle)) {
      $(section).find(".menu-item-title").each((_itemIndex, title) => {
        const name = cleanText($(title).text());
        if (!name) return;
        items.push(
          officialItem({
            category: "Beverages",
            description: "",
            name,
            price: sharedPrice,
            sourceUrl,
            idPrefix: "beverage-",
          }),
        );
      });
      return;
    }
    if (/^Agua Fresca$/i.test(sectionTitle)) {
      const menuItem = $(section).find(".menu-item").first();
      items.push(
        officialItem({
          category: "Beverages",
          description: cleanText(menuItem.find(".menu-item-title").first().text()),
          name: "Agua Fresca",
          price: parsePrice(menuItem.find(".menu-item-price-bottom").first().text()),
          sourceUrl,
          idPrefix: "beverage-",
        }),
      );
    }
  });
  return items;
}

export function parseAnafreLinkedOrderingMenu(
  html,
  { sourceUrl = linkedAnafreOrderingUrl } = {},
) {
  const $ = cheerio.load(html);
  const items = [];
  $("tr[id^=c]").each((_categoryIndex, header) => {
    const publishedCategory = cleanText($(header).find("a[name]").first().text());
    const category = vendorCategoryNames.get(publishedCategory);
    if (!category) return;
    $(header)
      .next()
      .find('td[onclick*="itemId="]')
      .filter((_index, element) => $(element).parents('td[onclick*="itemId="]').length === 0)
      .each((_itemIndex, element) => {
        const click = $(element).attr("onclick") ?? "";
        const vendorItemId = click.match(/itemId=(\d+)/)?.[1];
        const text = cleanText($(element).clone().find("script,style").remove().end().text());
        const match = text.match(/\$\d+(?:\.\d{1,2})?/);
        const name = cleanText(match ? text.slice(0, match.index) : text);
        if (!vendorItemId || !name) return;
        const price = parsePrice(match?.[0]);
        const description = cleanText(match ? text.slice(match.index + match[0].length) : "");
        items.push({
          id: `mealage-${vendorItemId}-${slugify(name)}`,
          vendorItemId,
          name,
          category,
          description: description || null,
          ingredientsText: null,
          price,
          isConfigurable: false,
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceType: "restaurant-linked-ordering",
          sourceUrls: [sourceUrl],
          presentations: [
            {
              authorityTier: "restaurant_linked_vendor",
              category: publishedCategory,
              name,
              price,
              sourceUrl,
              vendorItemId,
            },
          ],
          evidence: [
            {
              sourceKind: "restaurant-linked-ordering-item",
              sourceUrl,
              text: `${publishedCategory} — ${name}${price === null ? "" : ` — $${price}`}`,
            },
          ],
        });
      });
  });
  return items;
}

function formulationKey(category, name) {
  return `${category}|${normalizedName(name)}`;
}

function officialKey(category, name) {
  const correctedCategory = category === "Pizzas" && /^Churrasco\b/i.test(name)
    ? "Entrées"
    : category;
  const correctedName = name === "Queso Fundindo en Hoja de Platano"
    ? "Queso Fundido en Hoja de Platano"
    : name;
  return formulationKey(correctedCategory, correctedName);
}

const vendorAliases = new Map([
  [formulationKey("To Share", "Ceviche Vuelve a la Vida"), officialKey("Appetizers", "Sinaloa Vuelve à la Vida")],
  [formulationKey("To Share", "Camaron Aguachile"), officialKey("Appetizers", "Camarón Aguachile")],
  [formulationKey("To Share", "Los Cabos Guacamole"), officialKey("Appetizers", "Los Cabos Guacamole")],
  [formulationKey("To Share", "Oysters al Carbon con Crab Meat"), officialKey("Appetizers", "Oysters al Carbon con Crab Meat")],
  [formulationKey("To Share", "Acapulco Seafood Nachos"), officialKey("Appetizers", "Acapulco Seafood Nachos")],
  [formulationKey("To Share", "Queso Fundido en Hoja de Platano"), officialKey("Appetizers", "Queso Fundindo en Hoja de Platano")],
  [formulationKey("To Share", "Chicharon Preparado"), officialKey("Appetizers", "Chicharron Preparado")],
  [formulationKey("Pizzas", "Jardin pizza"), officialKey("Pizzas", "Jardin")],
  [formulationKey("Pizzas", "China Poblana pizza"), officialKey("Pizzas", "China Poblana")],
  [formulationKey("Pizzas", "pizza chicken mole poblano"), officialKey("Pizzas", "China Poblana")],
  [formulationKey("Pizzas", "Pizza El Golfo Shrimp/Chorizo"), officialKey("Pizzas", "El Golfo")],
  [formulationKey("Pizzas", "Pizza Octupus"), officialKey("Pizzas", "El Gallego")],
  [formulationKey("Pizzas", "pizza queso con rajas"), officialKey("Pizzas", "Chile Relleno")],
  [formulationKey("Tacos de Guisados", "Baja California Taco"), officialKey("Tacos de Guisados", "Baja California Fish ( Served on Flour Tortilla)")],
  [formulationKey("Tacos de Guisados", "Arrachera Taco"), officialKey("Tacos de Guisados", "Arrachera")],
  [formulationKey("Tacos de Guisados", "Shrimp Gobernador Taco"), officialKey("Tacos de Guisados", "Shrimp Gobernador (Served on Flour Tortilla)")],
  [formulationKey("Tacos de Guisados", "Taco Chicken con Mole Rojo"), formulationKey("Tacos de Guisados", "Chicken con Mole Rojo Taco")],
  [formulationKey("Entrées", "Submarino (Shrimp)"), officialKey("Entrées", "Submarino")],
  [formulationKey("Entrées", "Churrasco"), officialKey("Pizzas", "Churrasco à la Carbon")],
  [formulationKey("Gringas", "Al Pastor Gringas"), officialKey("Entrées", "La Gringa")],
  [formulationKey("Beverages", "Mineral Water"), officialKey("Beverages", "Agua Mineral")],
  [formulationKey("Beverages", "Agua Fresca of the Day"), officialKey("Beverages", "Agua Fresca")],
]);

function mergePresentation(target, source) {
  target.sourceUrls = unique([...target.sourceUrls, ...source.sourceUrls]);
  target.presentations.push(...source.presentations);
  target.evidence.push(...source.evidence);
  target.sourceType = "official-menu-and-linked-ordering";
}

export function buildAnafreAuditSnapshot(
  { officialMenuHtml, officialHomeHtml, linkedOrderingHtml },
  { retrievedAt = new Date().toISOString() } = {},
) {
  const officialItems = parseAnafreOfficialMenu(officialMenuHtml);
  const happyHourItems = parseAnafreOfficialHappyHour(officialHomeHtml);
  const officialBeverageItems = parseAnafreOfficialNonAlcoholicDrinks(officialHomeHtml);
  const vendorItems = parseAnafreLinkedOrderingMenu(linkedOrderingHtml);
  const itemsByKey = new Map();

  for (const item of [...officialItems, ...happyHourItems, ...officialBeverageItems]) {
    const key = formulationKey(item.category, item.name);
    if (itemsByKey.has(key)) {
      throw new Error(`Duplicate first-party Anafre formulation: ${key}`);
    }
    itemsByKey.set(key, item);
  }

  for (const item of vendorItems) {
    const rawKey = formulationKey(item.category, item.name);
    const key = vendorAliases.get(rawKey) ?? rawKey;
    const existing = itemsByKey.get(key);
    if (existing) {
      mergePresentation(existing, item);
    } else {
      itemsByKey.set(key, item);
    }
  }

  const items = [...itemsByKey.values()].sort((left, right) => {
    const categoryDelta = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    if (categoryDelta !== 0) return categoryDelta;
    return left.name.localeCompare(right.name);
  });
  const officialIngredientCount = items.filter(
    (item) => item.allergenSourceType === "official-ingredients",
  ).length;

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAnafre,
    retrievedAt,
    sourceUrls: [officialAnafreMenuUrl, officialAnafreHomeUrl, linkedAnafreOrderingUrl],
    presentationCount:
      officialItems.length + happyHourItems.length + officialBeverageItems.length + vendorItems.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialMenuPresentationCount: officialItems.length,
    officialHappyHourPresentationCount: happyHourItems.length,
    officialBeveragePresentationCount: officialBeverageItems.length,
    linkedOrderingPresentationCount: vendorItems.length,
    officialIngredientCount,
    unavailableAllergenCount: items.length - officialIngredientCount,
    sourceWarning:
      "Anafre's current restaurant-issued menu and happy-hour page are reconciled with the active Mealage ordering catalog linked by the restaurant. The official menu publishes descriptions but no allergen matrix or cross-contact disclosure; only direct positive ingredient or unambiguous formulation terms become fixed allergen signals, missing terms are never negative assurances, and linked-vendor-only rows remain allergen-unavailable. Alcohol-only sections are excluded. Churrasco is restored to Entrées because its steak-and-sides formulation and the linked Platos Fuertes catalog contradict the official page's malformed Pizza placement. Same-formulation spelling and surface variants are consolidated while every source presentation remains recorded.",
    items,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactRoot = path.resolve("data/restaurant-verification/artifacts/anafre-dc");
  const [officialMenuHtml, officialHomeHtml, linkedOrderingHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "official-anafre-menu.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-anafre-home.html"), "utf8"),
    readFile(path.join(artifactRoot, "linked-mealage-ordering.html"), "utf8"),
  ]);
  const snapshot = buildAnafreAuditSnapshot({
    officialMenuHtml,
    officialHomeHtml,
    linkedOrderingHtml,
  });
  const outputDir = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAnafre}`,
  );
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "corrected-menu.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        presentationCount: snapshot.presentationCount,
        itemCount: snapshot.itemCount,
        categoryCount: snapshot.categoryCount,
        officialIngredientCount: snapshot.officialIngredientCount,
        unavailableAllergenCount: snapshot.unavailableAllergenCount,
      },
      null,
      2,
    ),
  );
}
