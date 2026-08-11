import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const sourceUrls1983 = Object.freeze({
  home: "https://1983chinesecuisine.com/",
  toast: "https://order.toasttab.com/online/1983-restaurant-1101-south-joyce-street-b26",
});
export const auditRetrievedAt1983 = "2026-07-14T17:50:38.913Z";

const toastMenuNames = new Set(["Main Menu", "Morning Dim Sum", "Togo All Day"]);

const categoryOrder = new Map([
  ["Appetizers", 10],
  ["Dim Sum", 20],
  ["Main Dishes", 30],
  ["Noodles & Fried Rice", 40],
  ["Soup", 50],
  ["Side", 60],
  ["Special Menu", 70],
  ["Dessert", 80],
  ["Beverages", 90],
]);

const officialCategoryNames = new Map([
  ["MENU_CATEGORY_APPETIZERS", "Appetizers"],
  ["MENU_CATEGORY_MAIN_DISHES", "Main Dishes"],
  ["MENU_CATEGORY_FRIED_RICE__NOODLES", "Noodles & Fried Rice"],
  ["MENU_CATEGORY_SOUP", "Soup"],
  ["MENU_CATEGORY_DESSERT", "Dessert"],
  ["MENU_CATEGORY_DIM_SUM", "Dim Sum"],
  ["MENU_CATEGORY_SPECIAL_MENU", "Special Menu"],
]);

const chineseOnlyDisplayNames = new Map([
  ["生蚝 豉汁/蒜蓉/XO酱", "Oysters — Black Bean, Garlic, or XO Sauce"],
]);

const exactDisplayCorrections = new Map([
  ["Marinated Pork,", "Marinated Pork, Tofu and Beef"],
  ["Poke Belly with Crispy Skin", "Pork Belly with Crispy Skin"],
  ["Poached Crab Meat, Scallop, Shrimp and Crispy Rice in Lobster So", "Poached Crab Meat, Scallop, Shrimp and Crispy Rice in Lobster Sauce"],
  ["Lamp Chop", "Lamb Chop"],
  ["Pineapple Bun with Molten Salted Egg Custart", "Pineapple Bun with Molten Salted Egg Custard"],
  ["Portuguese EggTart", "Portuguese Egg Tart"],
  ["Buddha's Delight Traditional Veggie Dish for Luna New Year", "Buddha's Delight"],
]);

const matchAliases = new Map([
  ["passion fruit crepe layer cake", "passion fruit crepe cake"],
  ["pan fried lamb chops", "pan fried lamb chop"],
  ["soft shell crab salt and pepper xo sauce", "soft crab salt and pepper xo sauce"],
  ["sauteed squid with shredded pork and chinese chives 1983", "sauteed squid with shredded pork and chinese chives"],
  ["pepper mushroom sauted beef filet", "pepper mushroom sautee beef filet"],
  ["hot and spicy boiled beef", "sichuan boiled beef"],
  ["pineapple bun with molten salted egg custart", "pineapple bun with molten salted egg custard"],
  ["fried glutinous rice dumplings", "fried glutinous rice dumpling"],
  ["shrimp stuffed beancurd roll", "shrimp stuffed bean curd roll"],
  ["portuguese eggtart", "portuguese egg tart"],
  ["ginseng chicken soup", "ginseng stewed chicken soup"],
  ["braised duck soup with tea tree mushrooms", "tea tree mushroom stewed duck soup"],
  ["mango sago cream with pomelo", "chilled mango sago cream with pomelo"],
  ["dim sum platter", "dim sum platters"],
  ["crispy honey chilli beef", "crispy honey chili beef"],
  ["poached chicken", "poach chicken"],
  ["seafood with vermicelli pot", "seafood vermicelli pot"],
  ["eggplant with minced pork in casserole", "eggplant in casserole"],
  ["hot and spicy boiled fish", "hot and spicy boil fish"],
  ["sizzling chicken with mushrooms and sausages in clay pot", "sizzling chicken in claypot"],
  ["spring rolls stuffed with shrimps", "fried shrimps spring rolls"],
  ["jellyfish in rice vinegar", "vinegar jellyfish head"],
  ["sliced conch with dressing", "marinated conch appetizer"],
]);

export function parse1983ToastMarkdown(markdown) {
  const rows = [];
  let menu = null;
  let category = null;

  for (const line of String(markdown).split(/\r?\n/)) {
    const menuHeading = line.match(/^## (.+?)\s*$/);
    if (menuHeading) {
      menu = toastMenuNames.has(menuHeading[1]) ? menuHeading[1] : null;
      category = null;
      continue;
    }

    if (!menu) {
      continue;
    }

    const categoryHeading = line.match(/^### ([^\[].*?)\s*$/);
    if (categoryHeading) {
      category = normalizeCategory(categoryHeading[1]);
      continue;
    }

    const itemUrlMatch = line.match(
      /\((https?:\/\/order\.toasttab\.com\/online\/1983-restaurant-1101-south-joyce-street-b26\/item-[^)]+)\)/,
    );
    if (!itemUrlMatch || !category) {
      continue;
    }

    const labelEnd = line.lastIndexOf("](");
    const label = labelEnd >= 0 ? line.slice(0, labelEnd) : line;
    const nameMatch = label.match(
      /###\s+(?:\[)?([^\]]+?)\s*(?:OUT OF STOCK\s*)?(?:\$\d+(?:\.\d{2})?\+?)?$/,
    );
    if (!nameMatch) {
      continue;
    }

    const sourceTitle = cleanSpace(nameMatch[1]).replace(/\s+OUT OF STOCK$/i, "");
    const name = cleanDisplayName(sourceTitle);
    rows.push({
      menu,
      category,
      name,
      sourceTitle,
      sourceUrl: itemUrlMatch[1],
      outOfStock: /OUT OF STOCK/i.test(label),
    });
  }

  return rows;
}

export function parse1983OfficialHome(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $('h4[data-aid^="MENU_SECTION"][data-aid$="_TITLE"]').each((_index, element) => {
    const title = cleanSpace($(element).text());
    const categoryContainer = $(element).closest('div[data-aid^="MENU_CATEGORY_"]');
    const categoryAid = categoryContainer.attr("data-aid") ?? "";
    const heading = cleanSpace(categoryContainer.find("h3").first().text());
    const category = officialCategoryNames.get(categoryAid) ?? normalizeCategory(heading);
    if (!title || !category) {
      return;
    }

    rows.push({
      category,
      name: cleanDisplayName(title),
      sourceTitle: title,
      sourceUrl: sourceUrls1983.home,
    });
  });

  return rows;
}

export function build1983AuditSnapshot({
  toastMarkdown,
  officialHtml,
  retrievedAt = new Date().toISOString(),
} = {}) {
  const toastRows = parse1983ToastMarkdown(toastMarkdown);
  const officialRows = parse1983OfficialHome(officialHtml);
  const itemsByKey = new Map();

  for (const row of toastRows) {
    mergeCatalogRow(itemsByKey, {
      ...row,
      sourceType: "restaurant-linked-menu",
      sourceAuthority: "restaurant_linked_vendor",
    });
  }

  for (const row of officialRows) {
    mergeCatalogRow(itemsByKey, {
      ...row,
      sourceType: "official-website-menu",
      sourceAuthority: "restaurant_issued",
    });
  }

  const items = [...itemsByKey.values()]
    .map((row) => {
      const evidenceText = unique([row.name, ...row.sourceTitles]).join("; ");
      const allergens = directAllergens(evidenceText);
      return {
        auditItemKey: matchKey(row.name),
        id: slugify(row.name),
        name: row.name,
        category: row.category,
        description: null,
        ingredientsText: unique(row.sourceTitles).join("; "),
        sourceUrls: unique(row.sourceUrls),
        sourceType: row.sourceAuthorities.includes("restaurant_issued")
          ? "official-website-menu"
          : "restaurant-linked-menu",
        allergens,
        mayContain: [],
        allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
        menuSurfaces: unique(row.menuSurfaces),
        currentlyOutOfStock: row.availabilitySignals.length > 0 && row.availabilitySignals.every(Boolean),
      };
    })
    .sort(compareCatalogItems);

  return {
    schemaVersion: 1,
    restaurantId: "osm-1983-chinese-cuisine-10746777097",
    retrievedAt,
    sourceUrls: Object.values(sourceUrls1983),
    rawToastRowCount: toastRows.length,
    officialWebsiteRowCount: officialRows.length,
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "The restaurant does not publish a complete allergen matrix. Positive signals below come only from explicit allergen-bearing terms in current restaurant-issued or restaurant-linked menu titles; no absence or cross-contact claim is inferred.",
    items,
  };
}

function mergeCatalogRow(itemsByKey, row) {
  const key = matchKey(row.name);
  const existing = itemsByKey.get(key);
  if (!existing) {
    itemsByKey.set(key, {
      name: row.name,
      category: row.category,
      sourceTitles: [row.sourceTitle],
      sourceUrls: [row.sourceUrl],
      sourceAuthorities: [row.sourceAuthority],
      menuSurfaces: [row.menu].filter(Boolean),
      availabilitySignals: row.outOfStock === undefined ? [] : [row.outOfStock],
    });
    return;
  }

  existing.sourceTitles.push(row.sourceTitle);
  existing.sourceUrls.push(row.sourceUrl);
  existing.sourceAuthorities.push(row.sourceAuthority);
  if (row.menu) existing.menuSurfaces.push(row.menu);
  if (row.outOfStock !== undefined) existing.availabilitySignals.push(row.outOfStock);

  // Toast's ordering UI usually has the cleaner current English title. The official
  // site still upgrades authority and supplies additional current menu coverage.
  if (row.sourceAuthority === "restaurant_linked_vendor" && existing.name.length > row.name.length) {
    existing.name = row.name;
  }
  // Preserve the first ordering-menu category. The source is ordered Main Menu,
  // Morning Dim Sum, then Togo All Day, so shared desserts stay in Dessert while
  // items unique to the morning menu remain in Dim Sum.
}

export function directAllergens1983(value) {
  return directAllergens(value);
}

function directAllergens(value) {
  const text = ` ${String(value).normalize("NFKC").toLowerCase()} `;
  const matches = [
    ["shellfish", /\b(?:shrimp|shrimps|prawn|prawns|crab|crabs|lobster|lobsters|scallop|scallops|squid|conch|oyster|oysters|geoduck|clam|clams|abalone|mantis shrimp)\b/],
    ["egg", /\b(?:egg|eggs|eggtart)\b/],
    ["fish", /\b(?:fish|grouper|cod|croaker|branzino|caviar)\b/],
    ["soy", /\b(?:soy|tofu|bean curd|beancurd)\b/],
    ["sesame", /\bsesame\b/],
    ["peanut", /\bpeanuts?\b/],
    ["tree-nut", /\b(?:pistachio|almond|cashew|hazelnut|pecan|walnut|macadamia)s?\b/],
  ];
  const allergens = matches.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);

  if ((/\b(?:milk tea|cheese|cheesecake)\b/.test(text) || /奶茶/.test(text)) && !/\bsoy milk\b/.test(text)) {
    allergens.push("milk");
  }
  if (/\bmilk\b/.test(text) && !/\bsoy milk\b/.test(text)) {
    allergens.push("milk");
  }
  if (/\bmustard\b/.test(text) && !/\bmustard green\b/.test(text)) {
    allergens.push("mustard");
  }
  if (/\bwheat\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }

  return unique(allergens);
}

export function matchKey1983(value) {
  return matchKey(value);
}

function matchKey(value) {
  let normalized = cleanDisplayName(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bw\//g, " with ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bgf\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  normalized = matchAliases.get(normalized) ?? normalized;
  return normalized;
}

function cleanDisplayName(value) {
  const raw = cleanSpace(value).replace(/\s+OUT OF STOCK\b/gi, "").replace(/\s*\$\d+(?:\.\d{2})?\+?\s*$/g, "");
  if (chineseOnlyDisplayNames.has(raw)) {
    return chineseOnlyDisplayNames.get(raw);
  }
  const withoutHan = cleanSpace(raw.replace(/\p{Script=Han}+/gu, " "))
    .replace(/^[^a-z0-9]+/i, "")
    .trim();
  const corrected = exactDisplayCorrections.get(withoutHan) ?? withoutHan;
  return corrected.replace(/\s+OUT OF STOCK$/i, "").trim();
}

function normalizeCategory(value) {
  const normalized = cleanSpace(value).replace(/\*/g, "").toLowerCase();
  if (/appetizer/.test(normalized)) return "Appetizers";
  if (/dim sum/.test(normalized)) return "Dim Sum";
  if (/main dish/.test(normalized)) return "Main Dishes";
  if (/noodle|fried rice/.test(normalized)) return "Noodles & Fried Rice";
  if (/soup/.test(normalized)) return "Soup";
  if (/side/.test(normalized)) return "Side";
  if (/dessert/.test(normalized)) return "Dessert";
  if (/drink|beverage/.test(normalized)) return "Beverages";
  if (/special/.test(normalized)) return "Special Menu";
  return cleanSpace(value) || null;
}

function compareCatalogItems(left, right) {
  const categoryDifference =
    (categoryOrder.get(left.category) ?? 999) - (categoryOrder.get(right.category) ?? 999);
  if (categoryDifference !== 0) return categoryDifference;
  return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function cleanSpace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactRoot = path.resolve(
    "data/restaurant-verification/artifacts/osm-1983-chinese-cuisine-10746777097",
  );
  const outputPath = path.resolve(
    process.argv[2] ??
      "data/restaurant-verification/repairs/osm-1983-chinese-cuisine-10746777097/corrected-menu.json",
  );
  const [toastMarkdown, officialHtml] = await Promise.all([
    readFile(path.join(artifactRoot, "third-party-toast-render-proxy.txt"), "utf8"),
    readFile(path.join(artifactRoot, "official-home.html"), "utf8"),
  ]);
  const snapshot = build1983AuditSnapshot({
    toastMarkdown,
    officialHtml,
    retrievedAt: auditRetrievedAt1983,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
