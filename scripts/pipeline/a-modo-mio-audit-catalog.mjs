import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const sourceUrlsAModoMio = Object.freeze({
  home: "https://amodomiopizza.com/",
  menu: "https://amodomiopizza.com/arlington-a-modo-mio-food-menu",
  toast: "https://order.toasttab.com/online/a-modo-mio-5555-lee-highway",
});

export const auditRetrievedAtAModoMio = "2026-07-14T18:50:19.743Z";

const menuSurfaces = Object.freeze([
  ["Lunch", "116976"],
  ["Dinner", "117035"],
  ["Dessert", "542014"],
  ["Catering", "828740"],
]);

const dessertBeverageCategories = new Set([
  "Coffee", "Grappa", "Digestivi", "Tequila", "Cognac & Brandy", "Bourbon & Rye",
  "Scotch Whisky", "Dessert Wine",
]);

const corroboratingItemNames = new Map([
  ["Catering · Antipasti\u0000Caprese Appetizers", "Caprese"],
  ["Catering · Salads\u0000Caesar", "Caesar"],
  ["Catering · Pasta & Entrees\u0000Pollo Milanese", "Pollo Milanese"],
  ["Catering · Desserts\u0000Tiramisù", "Tiramisu"],
  ["Catering · Desserts\u0000Caprese Cake", "Torta Caprese"],
  ["Catering · Pizza\u0000Family Size Margherita", "Margherita"],
  ["Catering · Pizza\u0000Family Size Pepperoni", "Pepperoni (Pork)"],
  ["Dinner · Refreshments\u0000Affogato", "Affogato"],
]);

const toastSupplementSlugs = new Set([
  "four-polpette-al-sugo",
  "lunch-marinara",
  "marinara-personal-12",
  "marinara-family-16",
  "pizza-kit",
  "pizza-dough",
  "for-3gnocchi-ai-4-formaggi",
  "for-3gnocchi-sorrentina",
  "for-3paccheri-alla-bolognese",
  "for-3spaghetti-al-pomodoro",
  "side-marinara-sauce",
  "side-of-bolognese-sauce",
  "side-caesar",
  "mini-cannoli-3",
  "gelati",
  "gluten-free-cannoli-3-piece",
  "btl-nero-davola-regaleali",
  "btl-corvina-tinazzi",
  "btl-prunicce-pakravan-papi",
  "btl-montepulciano-sinello-riserva",
  "btl-chardonnay-impero",
  "btl-prosecco-gran-cuvee-gambino",
  "btl-rose-fazi-battaglia-marche",
  "btl-falanghina-feudi-san-gregorio-copy",
]);

export function parseAModoMioOfficialMenu(html) {
  const $ = cheerio.load(String(html ?? ""));
  const rows = [];

  for (const [surface, menuId] of menuSurfaces) {
    const menu = $(`.menu_${menuId}.food-menu-grid`).first();
    if (!menu.length) throw new Error(`A Modo Mio ${surface} menu was not found.`);

    menu.find("section").each((_sectionIndex, section) => {
      const category = normalizeWhitespace($(section).find("h2").first().text());
      const categoryDescription = normalizeWhitespace(
        $(section).find(".food-menu-description").first().text(),
      );
      if (!category) return;

      $(section).find(".food-item-holder[id^='menu_item_']").each((_itemIndex, item) => {
        const rawName = normalizeWhitespace($(item).find("h3").first().text());
        if (!rawName) return;
        const rawDescription = normalizeWhitespace($(item).find(".food-item-description").first().text());
        const description = cleanDescription(rawDescription);
        const labels = parseLabels(rawName, description);
        const name = rawName
          .replace(/\s*\((?:(?:GF|DF)(?:\s*,\s*(?:GF|DF))*|GLUTEN FREE)\)\s*$/i, "")
          .trim();
        const fullCategory = `${surface} · ${category}`;
        rows.push({
          sourceItemId: $(item).attr("id"),
          surface,
          category: fullCategory,
          categoryName: category,
          categoryDescription: categoryDescription || null,
          rawName,
          name,
          description: description || null,
          hasVariants: (rawDescription.match(/\$\d/g) ?? []).length > 1,
          labels,
          isBeverage: isBeverageCategory(surface, category),
        });
      });
    });
  }

  return rows;
}

export function parseAModoMioToastMenu(markdown) {
  const rows = [];
  let menuSurface = null;
  let categoryName = null;

  for (const line of String(markdown ?? "").split(/\r?\n/)) {
    const surfaceMatch = line.match(/^## (.+)$/);
    if (surfaceMatch) {
      menuSurface = normalizeWhitespace(surfaceMatch[1]);
      categoryName = null;
      continue;
    }
    const categoryMatch = line.match(/^### (.+)$/);
    if (categoryMatch) {
      categoryName = normalizeWhitespace(categoryMatch[1]);
      continue;
    }
    const itemMatch = line.match(/\*\s+### \[([^\]]+)\]\((https?:\/\/[^)]+\/item-([^_/?]+)_[^)]+)\)/);
    if (!itemMatch || !menuSurface || !categoryName || categoryName === "Featured Items") continue;

    const [, label, sourceUrl, sourceItemSlug] = itemMatch;
    const name = extractToastName(label, sourceItemSlug);
    if (!name) throw new Error(`Could not recover Toast name for ${sourceItemSlug}.`);
    const remainder = label.slice(name.length).trim();
    const description = normalizeWhitespace(remainder
      .replace(/\s+OUT OF STOCK(?=\s+\$)/i, "")
      .replace(/\s*\$\d+(?:\.\d{2})?\+?\s*$/, ""));
    const isWine = menuSurface === "ONLINE WINE MENU";
    const surface = menuSurface === "LUNCH MENU (Weekdays)" ? "Online Lunch"
      : menuSurface === "A MODO MIO TAKEOUT MENU" ? "Online Takeout"
        : isWine ? "Online Wine"
          : menuSurface;

    rows.push({
      sourceItemId: sourceItemSlug,
      surface,
      category: `${surface} · ${categoryName}`,
      categoryName,
      categoryDescription: null,
      rawName: name,
      name,
      description: description || null,
      labels: parseLabels(name, description),
      isBeverage: isWine,
      isAvailable: !/\bOUT OF STOCK\b/i.test(label),
      sourceUrl,
    });
  }

  return [...new Map(rows.map((row) => [row.sourceItemId, row])).values()];
}

export function buildAModoMioAuditSnapshot({
  officialMenuHtml,
  toastMarkdown,
  retrievedAt = auditRetrievedAtAModoMio,
} = {}) {
  const parsed = parseAModoMioOfficialMenu(officialMenuHtml);
  const toastRows = parseAModoMioToastMenu(toastMarkdown);
  const supplements = toastRows.filter((row) => toastSupplementSlugs.has(row.sourceItemId));
  const missingSupplements = [...toastSupplementSlugs].filter(
    (sourceItemId) => !supplements.some((row) => row.sourceItemId === sourceItemId),
  );
  if (missingSupplements.length > 0) {
    throw new Error(`A Modo Mio Toast supplements missing: ${missingSupplements.join(", ")}`);
  }
  const ordered = [...parsed, ...supplements]
    .map((row, sourceIndex) => ({ ...row, sourceIndex }))
    .sort((left, right) => Number(left.isBeverage) - Number(right.isBeverage) || left.sourceIndex - right.sourceIndex);

  const items = ordered.map((row, index) => {
    const corroboratingText = findCorroboratingText(row, parsed);
    const signal = officialAllergenSignal(row, corroboratingText);
    const universalCategoryText = /Pizze|\bPizza\b/i.test(row.categoryName)
      ? row.categoryDescription
      : null;
    const ingredientsText = [universalCategoryText, row.description, corroboratingText]
      .filter(Boolean).join(" ") || null;
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
      id: `${slugify(row.category)}-${slugify(row.name)}`,
      sourceItemId: row.sourceItemId,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText,
      isConfigurable: /\b(?:add|choice|products|combo|package)\b/i.test(
        `${row.name} ${row.description ?? ""}`,
      ) || /\bor\b/i.test(row.name) || Boolean(row.hasVariants),
      sourceUrls: row.sourceUrl
        ? unique([row.sourceUrl, sourceUrlsAModoMio.toast, ...(signal.usesHome ? [sourceUrlsAModoMio.home] : [])])
        : signal.usesHome
          ? [sourceUrlsAModoMio.menu, sourceUrlsAModoMio.home]
          : [sourceUrlsAModoMio.menu],
      sourceType: row.sourceUrl ? "restaurant-linked-vendor-menu" : "restaurant-issued-structured-menu",
      allergens: signal.allergens,
      mayContain: [],
      allergenSourceType: signal.allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceLabels: row.labels,
      isAvailable: row.isAvailable ?? true,
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: "osm-a-modo-mio-207944730",
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAModoMio),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "A Modo Mio publishes current item descriptions and selected GF/DF labels on its public menus and restaurant-linked Toast catalog, not a complete item-by-allergen matrix or cross-contact guide. Positive ingredient terms are represented as fixed allergen signals; GF/DF labels suppress contradictory inference but are not converted into broad safety claims. Rows without positive item-level evidence remain unavailable.",
    items,
  };
}

function officialAllergenSignal(row, corroboratingText) {
  if (row.isBeverage) return { allergens: [], usesHome: false };
  const text = `${row.name} ${row.description ?? ""} ${corroboratingText ?? ""}`;
  const allergens = [];
  const glutenFree = row.labels.includes("GF") || /\bgluten[ -]?free\b/i.test(text);
  const dairyFree = row.labels.includes("DF");
  const pizza = /Pizze|\bPizza\b/i.test(`${row.categoryName} ${row.name}`);
  const milkText = text.replace(/\bno cheese\b/gi, "");

  if (/\b(?:shrimp|prawn|crab|lobster|clam|oyster|scallop|mussel|octopus|squid)s?\b/i.test(text)) {
    allergens.push("shellfish");
  }
  const gelato = row.categoryName === "Gelati E Sorbetti" && !/sorbetto/i.test(row.name);
  if (!dairyFree && (gelato || /\b(?:milk|butter|cream|cheese|yogurt|whey|casein|gelato|mascarpone|mozzarella|burrata|ricotta|parmesan|parmigiano|pecorino|gorgonzola|stracciatella|grana padano|fior di latte|bechamel|béchamel)\b/i.test(milkText))) {
    allergens.push("milk");
  }
  if (/\beggs?\b/i.test(text)) allergens.push("egg");
  if (/\b(?:salmon|anchov(?:y|ies)|tuna|cod|haddock|trout|tilapia)\b/i.test(text)) {
    allergens.push("fish");
  }
  if (/\b(?:almond|pecan|walnut|cashew|pistachio|hazelnut|macadamia)s?\b|\bpine nuts?\b/i.test(text)) {
    allergens.push("tree-nut");
  }
  if (/\b(?:peanut|groundnut)s?\b/i.test(text)) allergens.push("peanut");
  if (/\b(?:soy|tofu|miso|tamari)\b/i.test(text)) allergens.push("soy");
  if (/\b(?:sesame|tahini)\b/i.test(text)) allergens.push("sesame");
  if (/\bmustard\b/i.test(text)) allergens.push("mustard");

  const sandwich = row.categoryName === "Sandwiches";
  const wheatText = /\b(?:wheat|flour|bread|focaccia|foccacia|crostini|croutons?|pasta|spaghetti|lasagna|paccheri|gnocchi|ravioli|penne|noodles?|breaded|panko|pastry|dough|ladyfingers?)\b/i.test(text);
  if (!glutenFree && (wheatText || pizza || sandwich)) allergens.push("wheat", "gluten");

  return {
    allergens: unique(allergens),
    usesHome: pizza,
  };
}

function findCorroboratingText(row, parsed) {
  if (row.sourceItemId === "gluten-free-cannoli-3-piece") {
    return parsed.find((candidate) => /Cannolini \(GLUTEN FREE\)/i.test(candidate.rawName))?.description ?? null;
  }
  if (row.sourceItemId === "side-caesar") {
    return parsed.find((candidate) => candidate.surface === "Dinner" && candidate.name === "Caesar")?.description ?? null;
  }
  const targetName = corroboratingItemNames.get(`${row.category}\u0000${row.name}`);
  if (!targetName) return null;
  return parsed.find((candidate) => candidate.name === targetName && candidate.description)?.description ?? null;
}

function extractToastName(label, sourceItemSlug) {
  const words = normalizeWhitespace(label).split(" ");
  for (let index = 1; index <= words.length; index += 1) {
    const candidate = words.slice(0, index).join(" ");
    const candidateSlug = slugify(candidate);
    if (candidateSlug === sourceItemSlug || candidateSlug.replace(/-/g, "") === sourceItemSlug.replace(/-/g, "")) {
      return candidate;
    }
  }
  return null;
}

function parseLabels(name, description) {
  const match = String(name).match(/\((GF|DF)(?:\s*,\s*(GF|DF))*\)\s*$/i);
  const labels = match
    ? [...String(name).matchAll(/\b(GF|DF)\b/gi)].map((entry) => entry[1].toUpperCase())
    : [];
  if (/\bgluten[ -]?free\b/i.test(`${name} ${description ?? ""}`)) labels.push("GF");
  return unique(labels);
}

function isBeverageCategory(surface, category) {
  return category === "Refreshments" || (surface === "Dessert" && dessertBeverageCategories.has(category));
}

function cleanDescription(value) {
  return normalizeWhitespace(value)
    .replace(/\$\d+(?:\.\d{2})?(?:\/[^\s|•]+)?\+?/g, "")
    .replace(/^\s*Each\s*/i, "")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s*\|\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value).replace(/&/g, " and ")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/artifacts/osm-a-modo-mio-207944730/official-menu.html",
  );
  const outputPath = path.resolve(
    process.argv[3] ?? "data/restaurant-verification/repairs/osm-a-modo-mio-207944730/corrected-menu.json",
  );
  const toastPath = path.resolve(
    process.argv[4] ?? "data/restaurant-verification/artifacts/osm-a-modo-mio-207944730/third-party-toast-render-proxy.txt",
  );
  const snapshot = buildAModoMioAuditSnapshot({
    officialMenuHtml: await readFile(artifactPath, "utf8"),
    toastMarkdown: await readFile(toastPath, "utf8"),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
