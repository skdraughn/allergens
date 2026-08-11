import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const restaurantIdAdyar = "osm-adyar-ananda-bhavan-638589103";

export const sourceUrlsAdyar = Object.freeze({
  home: "https://a2bva.com/",
  menu: "https://a2bva.com/menu/",
  toast: "https://order.toasttab.com/online/a2b-herndon-645-elden-st",
});

export const auditRetrievedAtAdyar = "2026-07-14T20:13:57.022Z";

const categoryOrder = Object.freeze([
  "SOUPS", "APPETIZERS", "FROM THE HOUSE OF STEAM", "DOSAI CORNER", "A2B COMBOS",
  "THALI’S", "HOUSE SPECIALS", "SOUTH INDIAN FAVORITES", "SOUTH INDIAN CURRIES",
  "NORTH INDIAN CURRIES", "ACCOMPANIMENTS", "RICE & NOODLES", "CHAATS", "DESSERTS",
  "PREMIUM SWEETS", "SPECIAL SWEETS", "SAVORIES", "BEVERAGES",
]);

const toastSupplements = Object.freeze({
  "rasam-vadai": ["APPETIZERS", "RASAM VADAI", null],
  "mini-podi-idly": ["FROM THE HOUSE OF STEAM", "MINI PODI IDLY", null],
  "onion-rava-masala-dosai": ["DOSAI CORNER", "ONION RAVA MASALA DOSAI", "Popular dosai made with semolina, topped with chopped onions and potato masala."],
  "choice-of-millet-dosa": ["HOUSE SPECIALS", "CHOICE OF MILLET DOSA", "Choose from ragi (finger millet) or kambu (pearl millet), served with varieties of chutney and sambar."],
  "paneer-veg-momo-8-pieces": ["HOUSE SPECIALS", "PANEER VEG MOMO (8 PIECES)", null],
  "paneer-khurchan": ["NORTH INDIAN CURRIES", "PANEER KHURCHAN", "Strips of cottage cheese tossed with juliennes of onion, tomato and capsicum sautéed in onion sauce and Indian spices."],
  "papadappalam-2-nos": ["ACCOMPANIMENTS", "PAPAD/APPALAM - 2 NOS", null],
  "quinoa": ["ACCOMPANIMENTS", "QUINOA", null],
  "sweet-of-the-day": ["DESSERTS", "SWEET OF THE DAY", null],
  "lemonade": ["BEVERAGES", "LEMONADE", null],
  "soda-water": ["BEVERAGES", "SODA WATER", null],
});

const packageDisclosures = Object.freeze({
  ADHIRASAM: {
    toastSlug: "athirasam",
    allergens: ["milk"],
    mayContain: ["wheat", "gluten", "soy", "peanut", "tree-nut"],
  },
  "CASHEW HALWA": {
    toastSlug: "cashewnut-halwa",
    allergens: ["milk", "tree-nut"],
    mayContain: ["wheat", "gluten", "soy", "peanut"],
  },
  "FRUIT HALWA": {
    toastSlug: "fruit-halwa",
    allergens: ["milk", "tree-nut", "wheat", "gluten"],
    mayContain: ["soy", "peanut"],
  },
  "KAJU KATHLI": {
    toastSlug: "kaju-kathali",
    allergens: ["milk", "tree-nut"],
    mayContain: ["wheat", "gluten", "soy", "peanut"],
  },
  "MAA LADDU": {
    toastSlug: "maa-laddu",
    allergens: ["milk", "tree-nut"],
    mayContain: ["wheat", "gluten", "soy", "peanut"],
  },
  "SPECIAL MYSORE PAUK": {
    toastSlug: "spl-masore-pauk",
    allergens: ["milk"],
    mayContain: ["wheat", "gluten", "soy", "peanut", "tree-nut"],
  },
  SEEDAI: {
    toastSlug: "seedai",
    allergens: ["milk", "sesame"],
    mayContain: [],
  },
});

export function parseAdyarOfficialMenu(html) {
  const $ = cheerio.load(String(html ?? ""));
  const rows = [];

  $(".a2b-food-menu-block").each((_index, block) => {
    const category = normalizeCategory($(block).find("h3").first().text());
    $(block).find("h4").each((_itemIndex, heading) => {
      const name = clean($(heading).text());
      if (!name) return;
      const description = clean($(heading).nextUntil("h4", "p").first().text()) || null;
      rows.push({
        category,
        name,
        description,
        isConfigurable: /\bchoose from\b/i.test(name),
        sourceType: "restaurant-issued-menu",
        sourceUrls: [sourceUrlsAdyar.menu],
      });
    });
  });

  $(".a2b-snacks-menu-block .content-container").each((_index, block) => {
    const category = clean($(block).find("h4").first().text());
    $(block).find("p").each((_itemIndex, paragraph) => {
      const name = clean($(paragraph).text());
      if (!name || /\bGRAMS\b/i.test(name)) return;
      rows.push({
        category,
        name,
        description: null,
        isConfigurable: false,
        sourceType: "restaurant-issued-menu",
        sourceUrls: [sourceUrlsAdyar.menu],
      });
    });
  });

  return rows;
}

export function parseAdyarToastMenu(markdown) {
  const rows = [];
  let menu = null;
  let category = null;
  for (const line of String(markdown ?? "").split(/\r?\n/)) {
    if (/^## /.test(line)) {
      menu = clean(line.slice(3));
      category = null;
      continue;
    }
    if (/^### /.test(line) && !/https?:\/\//.test(line)) {
      category = clean(line.slice(4));
      continue;
    }
    const itemMatch = line.match(/\]\((https?:\/\/[^)]+\/item-([^_]+)_[0-9a-f-]+)\)/i);
    if (!itemMatch) continue;
    const label = clean(line.slice(0, itemMatch.index).split("### ").at(-1).replace(/^\[/, ""));
    rows.push({
      menu,
      category: category ?? menu,
      slug: itemMatch[2],
      label,
      isAvailable: !/\bOUT OF STOCK\b/i.test(label),
      sourceUrl: itemMatch[1].replace(/^http:/, "https:"),
    });
  }
  return rows;
}

export function buildAdyarAuditSnapshot({
  officialMenuHtml,
  toastMarkdown,
  retrievedAt = auditRetrievedAtAdyar,
} = {}) {
  const officialRows = parseAdyarOfficialMenu(officialMenuHtml);
  const toastRows = parseAdyarToastMenu(toastMarkdown);
  if (officialRows.length !== 147) throw new Error(`Expected 147 official Ada's rows; found ${officialRows.length}.`);
  if (toastRows.length !== 153 || toastRows.filter((row) => row.isAvailable).length !== 126) {
    throw new Error("Adyar Toast row counts changed; review the time-specific ordering menu before rebuilding.");
  }

  const toastBySlug = new Map(toastRows.map((row) => [row.slug, row]));
  const rows = officialRows.map((row) => {
    const disclosure = packageDisclosures[row.name];
    if (!disclosure) return row;
    const toast = toastBySlug.get(disclosure.toastSlug);
    if (!toast) throw new Error(`Missing retained package disclosure: ${disclosure.toastSlug}.`);
    return {
      ...row,
      packageDisclosure: disclosure,
      packageLabelText: toast.label.replace(/\s+OUT OF STOCK\b.*$/i, ""),
      sourceType: "restaurant-issued-menu-with-restaurant-linked-package-label",
      sourceUrls: [sourceUrlsAdyar.menu, toast.sourceUrl, sourceUrlsAdyar.toast],
    };
  });

  for (const [slug, [category, name, description]] of Object.entries(toastSupplements)) {
    const toast = toastBySlug.get(slug);
    if (!toast?.isAvailable) throw new Error(`Current Adyar Toast supplement missing or unavailable: ${slug}.`);
    rows.push({
      category,
      name,
      description,
      isConfigurable: /\bchoice of\b/i.test(name),
      sourceType: "restaurant-linked-vendor-menu",
      sourceUrls: [toast.sourceUrl, sourceUrlsAdyar.toast, sourceUrlsAdyar.home],
    });
  }

  rows.sort((left, right) => categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category));

  const items = rows.map((row, index) => {
    const signal = publishedSignalsAdyar(row);
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
      id: `${slugify(row.category)}-${slugify(row.name)}`,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.packageLabelText ?? row.description,
      isConfigurable: row.isConfigurable,
      sourceUrls: row.sourceUrls,
      sourceType: row.sourceType,
      allergens: signal.allergens,
      mayContain: signal.mayContain,
      allergenSourceType: signal.hasPublishedEvidence ? "official-ingredients" : "unavailable",
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAdyar,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAdyar),
    officialSiteItemCount: officialRows.length,
    toastScopedItemCount: toastRows.length,
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Adyar Ananda Bhavan publishes current Herndon menu names and descriptions on its official website but no complete allergen matrix, recipe set, or kitchen cross-contact policy. Positive official signals come only from fixed published ingredient text or mandatory formats. Optional choice ingredients are not merged onto configurable bases. The restaurant-linked Toast catalog is time-dependent; eleven distinct currently available Toast additions are retained, but their name-only allergen implications remain unavailable rather than being promoted to official. For seven products also listed on the official site, retained Toast package labels distinguish contains statements from facility-handling cross-contact statements. Static official sweets and savories remain current menu products even when the captured Golden Hour Toast surface marks its corresponding sellable SKU out of stock. Beverages are last.",
    items,
  };
}

export function publishedSignalsAdyar(row) {
  if (row.packageDisclosure) {
    return {
      allergens: [...row.packageDisclosure.allergens],
      mayContain: [...row.packageDisclosure.mayContain],
      hasPublishedEvidence: true,
    };
  }
  if (row.sourceType === "restaurant-linked-vendor-menu") {
    return { allergens: [], mayContain: [], hasPublishedEvidence: false };
  }

  let text = ` ${`${row.name} ${row.description ?? ""}`.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()} `;
  text = text
    .replace(/\([^)]*choose from[^)]*\)/gi, " ")
    .replace(/\begg-?plant\b/g, "eggplant")
    .replace(/coconut milk/g, "coconut")
    .replace(/coconut based/g, "coconut")
    .replace(/besan flour|rice flour|lentil flour|chick ?peas? flour|chickpea flour|corn flour/g, " ");
  if (row.name.startsWith("KULFI")) text = text.replace(/\band nuts\b|& nuts\b/g, " ");

  const allergens = [];
  if (/\b(?:milk|butter|ghee|cream of|cream|paneer|cottage cheese|mozzarella|yogurt|yoghurt|raitha|khoa|malai|curd|makhani|milkshake|lassi|ice cream|kulfi|rasamalai)\b/.test(text)) allergens.push("milk");
  if (/\b(?:cashews?|cashewnuts?|almonds?|badam|kaju|pistachios?|pistha|nuts?)\b/.test(text)) allergens.push("tree-nut");
  if (/\bpeanuts?\b/.test(text)) allergens.push("peanut");
  if (/\b(?:soy|soya|tofu|miso|tamari)\b/.test(text)) allergens.push("soy");
  if (/\b(?:sesame|tahini)\b/.test(text)) allergens.push("sesame");
  if (/\bmustard\b/.test(text)) allergens.push("mustard");
  if (/\b(?:egg|eggs)\b/.test(text)) allergens.push("egg");
  if (/\b(?:wheat|semolina|rava|naan|chapati|roti|parotta|kulcha|bhature|bread|croutons?|pav|samosa|noodles?|momo|flour)\b/.test(text)) allergens.push("wheat", "gluten");
  return { allergens: unique(allergens), mayContain: [], hasPublishedEvidence: allergens.length > 0 };
}

function normalizeCategory(value) {
  return clean(value).replace(/^RICE\s*&\s*NOODLES$/i, "RICE & NOODLES");
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const [officialMenuHtml, toastMarkdown] = await Promise.all([
    readFile(path.join(root, `artifacts/${restaurantIdAdyar}/official-menu.html`), "utf8"),
    readFile(path.join(root, `artifacts/${restaurantIdAdyar}/third-party-toast-render-proxy.txt`), "utf8"),
  ]);
  const snapshot = buildAdyarAuditSnapshot({ officialMenuHtml, toastMarkdown });
  const outputDir = path.join(root, `repairs/${restaurantIdAdyar}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    officialSiteItemCount: snapshot.officialSiteItemCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
