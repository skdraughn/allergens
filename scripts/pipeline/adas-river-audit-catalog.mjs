import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAdasRiver = "ada-s-on-the-river-alexandria-va-dc-metro";

export const sourceUrlsAdasRiver = Object.freeze({
  home: "https://adasontheriver.com/",
  menus: "https://adasontheriver.com/wp-json/api/v1/get_menus",
  toast: "https://order.toasttab.com/online/adas-on-the-river",
});

export const auditRetrievedAtAdasRiver = "2026-07-14T20:01:20.332Z";

const menuScopes = Object.freeze([
  {
    menu: "Dinner Menu",
    includeSection: (section) => section.name !== "SAUCES",
    category: (section) => `Dinner · ${displaySection(section.name)}`,
  },
  {
    menu: "Seafood Bar",
    includeSection: () => true,
    category: (section) => `Seafood Bar · ${displaySection(section.name)}`,
  },
  {
    menu: "Lunch Menu",
    includeSection: (section) => section.name !== "SAUCES",
    category: (section) => `Lunch · ${displaySection(section.name)}`,
  },
  {
    menu: "Brunch, Fun & Bubbles Menu",
    includeSection: (section) => !["BRUNCH, FUN & BUBBLES", "WEEKEND LIBATIONS"].includes(section.name),
    category: (section) => `Brunch · ${displaySection(section.name)}`,
  },
  {
    menu: "Dessert Menu",
    includeSection: (section) => section.name === "DESSERTS",
    category: () => "Desserts",
  },
  {
    menu: "Martinis & More Social Hour",
    includeSection: (section) => section.name === "HAPPY HOUR BITES",
    category: () => "Social Hour · Bites",
  },
  {
    menu: "Cocktails, Beer, Whiskey, and Wine",
    includeSection: (section) => section.name === "ZERO PROOF" || section.name === "BOTTLED & CANNED",
    includeItem: (section, item) => section.name === "ZERO PROOF" || /\b0\.0(?:%|\b)/i.test(item.name),
    category: (section) => section.name === "ZERO PROOF" ? "Beverages · Zero Proof" : "Beverages · Nonalcoholic Beer",
  },
]);

const canonicalAliases = new Map([
  ["grilled shrimp and avocado salad", "grilled shrimp and avocado"],
  ["wood grilled fish sandwich", "wood grilled fish"],
  ["crab cake sandwich", "crab cake"],
  ["ada s seasonal cheese plate", "artisan cheese plate"],
]);

export function parseAdasRiverOfficialMenus(input) {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const menus = parsed?.restaurant_menu;
  if (!menus || Array.isArray(menus) || typeof menus !== "object") {
    throw new Error("Ada's structured menu payload is missing restaurant_menu.");
  }

  const rows = [];
  for (const scope of menuScopes) {
    const sections = menus[scope.menu];
    if (!Array.isArray(sections)) throw new Error(`Ada's menu is missing ${scope.menu}.`);
    for (const section of sections) {
      if (!scope.includeSection(section)) continue;
      for (const item of section.items ?? []) {
        if (scope.includeItem && !scope.includeItem(section, item)) continue;
        const rawName = cleanWhitespace(item.name);
        const name = displayItemName(rawName);
        rows.push({
          sourceItemId: item.id,
          menu: scope.menu,
          section: section.name,
          category: scope.category(section),
          rawName,
          name,
          description: cleanWhitespace(item.description) || null,
          fixedSectionContext: fixedSectionContext(scope.menu, section),
          isConfigurable: Array.isArray(item.cost?.options) && item.cost.options.length > 0,
          sourceUrl: sourceUrlsAdasRiver.menus,
        });
      }
    }
  }
  return rows;
}

export function buildAdasRiverAuditSnapshot({
  officialMenus,
  retrievedAt = auditRetrievedAtAdasRiver,
} = {}) {
  const rows = parseAdasRiverOfficialMenus(officialMenus);
  assertRawScopeCounts(rows);

  const compact = new Map();
  for (const row of rows) {
    const key = canonicalItemKey(row.name);
    const existing = compact.get(key);
    if (!existing) {
      compact.set(key, {
        ...row,
        sourceItemIds: [row.sourceItemId],
        sourceContexts: [sourceContext(row)],
        signalTexts: signalTexts(row),
      });
      continue;
    }
    existing.sourceItemIds.push(row.sourceItemId);
    existing.sourceContexts.push(sourceContext(row));
    existing.signalTexts.push(...signalTexts(row));
    existing.isConfigurable ||= row.isConfigurable;
    if ((row.description?.length ?? 0) > (existing.description?.length ?? 0)) {
      existing.description = row.description;
    }
  }

  const items = [...compact.values()].map((row, index) => {
    const allergens = directAllergensAdasRiver(row);
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
      id: `${slugify(row.category)}-${slugify(row.name)}`,
      sourceItemId: row.sourceItemIds[0],
      sourceItemIds: unique(row.sourceItemIds),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: unique(row.signalTexts).join(" | ") || null,
      isConfigurable: row.isConfigurable,
      sourceUrls: [sourceUrlsAdasRiver.menus, sourceUrlsAdasRiver.home],
      sourceType: "restaurant-issued-structured-menu",
      sourceContexts: row.sourceContexts,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAdasRiver,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAdasRiver),
    rawScopedItemCount: rows.length,
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Ada's publishes current structured menus and item descriptions, but no complete allergen matrix or cross-contact guide. V means vegetarian and may include egg or dairy; G means gluten free. Neither label is promoted into a positive allergen claim. Positive signals come only from fixed published ingredients, explicitly named species, or mandatory food formats. Optional add-ons and modifier sauces are excluded from fixed item signals. Duplicate meal-period presentations are consolidated; food and desserts precede the retained zero-proof beverages and 0.0 beer, while alcohol-only lists remain outside this allergen-focused catalog.",
    items,
  };
}

export function directAllergensAdasRiver(row) {
  const text = ` ${unique(row.signalTexts ?? signalTexts(row)).join(" ").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()} `;
  const allergens = [];
  const patterns = [
    ["shellfish", /\b(?:lobster|crab|shrimp|prawns?|oysters?|mussels?|scallops?|octopus|calamari|squid|clams?|shellfish)\b/],
    ["milk", /\b(?:milk|butter|buttermilk|cheese|cheddar|parmesan|parmigiano|pecorino|ricotta|mozzarella|taleggio|raclette|feta|labneh|yogurt|mornay|cream|creme|crème|chantilly|béarnaise|bearnaise|hollandaise|soubise|ganache)\b/],
    ["egg", /\b(?:egg|eggs|aioli|remoulade|dijonnaise|bearnaise|hollandaise|souffle|creme brulee|omelette|benedict)\b/],
    ["fish", /\b(?:tuna|salmon|swordfish|trout|anchovy|daily market fish|fish)\b/],
    ["tree-nut", /\b(?:almonds?|marcona|hazelnuts?|pecans?|pine nuts?|pinenuts?|nutella)\b/],
    ["peanut", /\b(?:peanut|peanuts)\b/],
    ["soy", /\b(?:soy|miso|tamari|tofu|edamame)\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["mustard", /\b(?:mustard|dijon|dijonnaise)\b/],
  ];
  for (const [allergen, pattern] of patterns) if (pattern.test(text)) allergens.push(allergen);

  if (/\b(?:bread|breadcrumbs?|brioche|bun|baguette|biscuit|crostini|croutons?|crackers?|flatbread|pumpernickel|roll|toast|muffin|scones?|sticky bun|babka|coffee cake|pancakes?|french toast|beignets?|graham wafers?|chocolate cake|tart|ginger snap|pasta|campanelle|ravioli|lasagna|schnitzel|rangoon)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  if (/\blager\b/.test(text) || /\bbeer\b/.test(text.replace(/ginger beer/g, ""))) allergens.push("gluten");
  return unique(allergens);
}

function assertRawScopeCounts(rows) {
  const expected = new Map([
    ["Dinner Menu", 45],
    ["Seafood Bar", 11],
    ["Lunch Menu", 40],
    ["Brunch, Fun & Bubbles Menu", 39],
    ["Dessert Menu", 6],
    ["Martinis & More Social Hour", 7],
    ["Cocktails, Beer, Whiskey, and Wine", 7],
  ]);
  for (const [menu, count] of expected) {
    const actual = rows.filter((row) => row.menu === menu).length;
    if (actual !== count) throw new Error(`Expected ${count} scoped Ada's rows for ${menu}; found ${actual}.`);
  }
}

function fixedSectionContext(menu, section) {
  if (menu === "Lunch Menu" && section.name === "WOOD-FIRED CUSTOM AGED PRIME MEATS") {
    return cleanWhitespace(section.description) || null;
  }
  return null;
}

function signalTexts(row) {
  return [row.name, row.description, row.fixedSectionContext].filter(Boolean);
}

function sourceContext(row) {
  return {
    menu: row.menu,
    section: row.section,
    sourceItemId: row.sourceItemId,
    name: row.name,
    description: row.description,
    fixedSectionContext: row.fixedSectionContext,
  };
}

function canonicalItemKey(name) {
  const normalized = normalize(name);
  return canonicalAliases.get(normalized) ?? normalized;
}

function displayItemName(value) {
  const clean = cleanWhitespace(value)
    .replace(/\s+V(?:\s+G)?$/i, "")
    .replace(/\s+G$/i, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.toLowerCase().replace(/(^|[\s“"'’/&-])([a-z])/g, (_match, boundary, letter) => `${boundary}${letter.toUpperCase()}`)
    .replace(/\bNy\b/g, "NY")
    .replace(/\bOz\b/g, "oz")
    .replace(/\bAda'S\b/g, "Ada's")
    .replace(/\bAda’S\b/g, "Ada’s")
    .replace(/\bS'Mores\b/g, "S'mores")
    .replace(/\bCreme Brulee\b/g, "Creme Brulee")
    .replace(/\bNo'tini\b/g, "No’Tini");
}

function displaySection(value) {
  return cleanWhitespace(value).toLowerCase().replace(/(^|[\s&-])([a-z])/g, (_match, boundary, letter) => `${boundary}${letter.toUpperCase()}`);
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
}

function cleanWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const sourcePath = path.join(root, `artifacts/${restaurantIdAdasRiver}/official-structured-menus.json`);
  const officialMenus = await readFile(sourcePath, "utf8");
  const snapshot = buildAdasRiverAuditSnapshot({ officialMenus });
  const outputDir = path.join(root, `repairs/${restaurantIdAdasRiver}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    rawScopedItemCount: snapshot.rawScopedItemCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
