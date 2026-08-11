import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAandJOfficialMenu, publishedAllergenSignals } from "./aandj-audit-catalog.mjs";

export const sourceUrlsAandJRockville = Object.freeze({
  home: "https://www.aandjrestaurant.com/",
  menu: "https://www.aandjrestaurant.com/menu",
  toast: "https://www.toasttab.com/a-j-restaurant-1319-rockville-pike-suite-c",
});

export const auditRetrievedAtAandJRockville = "2026-07-14T19:39:15.491Z";

const categoryOrder = Object.freeze([
  "NOODLES",
  "SOUPS",
  "RICE",
  "BUNS // DUMPLINGS // BREADS",
  "MEATS",
  "COLD PLATES",
  "SIDES",
  "SWEETS",
  "DRINKS",
]);

const toastSupplements = Object.freeze({
  "1109-wonton-noodle": { category: "NOODLES", name: "餛飩麵 Wonton Noodle", description: null },
  "3105-pork-chop": { category: "MEATS", name: "炸豬排 Pork Chop", description: "Fried pork chop" },
  "3106-fried-chicken": { category: "MEATS", name: "炸雞排 Fried Chicken", description: "Fried chicken cutlet" },
  "1207-plain-noodle": { category: "SIDES", name: "麵底 Plain Noodle", description: "Plain noodle" },
  "2207-vegetable": { category: "SIDES", name: "青菜 Vegetable", description: "Blanched Shanghai bok choy" },
  "3104-rice": { category: "SIDES", name: "白飯 Rice", description: "Plain white rice" },
  "5302-pickled-mustard-green": { category: "SIDES", name: "酸菜 Pickled Mustard Green", description: "Pickled mustard greens" },
  "5303-chili-sauce": { category: "SIDES", name: "辣椒醬 Chili Sauce", description: "Housemade chili sauce" },
  "5304-preserved-egg": { category: "SIDES", name: "皮蛋 Preserved Egg", description: null },
  "3109-braised-pork": { category: "SIDES", name: "卤肉 Braised Pork", description: null },
  "4111-biscuit": { category: "SIDES", name: "燒餅 Biscuit", description: null },
});

export function parseAandJRockvilleToastMenu(markdown) {
  const text = String(markdown ?? "");
  const startMarker = "\n## A&J Restaurant 1319 Rockville Pike, Suite C\n";
  const endMarker = "\n## A&J Restaurant 1319 Rockville Pike, Suite C Location and Ordering Hours\n";
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start < 0 || end <= start) throw new Error("A&J Rockville Toast menu boundaries were not found.");

  const rows = [];
  let category = null;
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    const categoryMatch = line.match(/^### (.+)$/);
    if (categoryMatch) {
      category = normalizeWhitespace(categoryMatch[1]);
      continue;
    }
    const itemMatch = line.match(/### \[?(.+?)\]\((https?:\/\/[^)]+\/item-([a-z0-9-]+)_[^)]+)\)/i);
    if (!itemMatch || !category || category === "Featured Items") continue;
    const label = normalizeWhitespace(itemMatch[1].replace(/^.*?\]\s*###\s*/, ""));
    rows.push({
      category,
      label,
      code: label.match(/^(\d{4})\./)?.[1] ?? null,
      sourceItemId: itemMatch[3].replace(/-+$/, ""),
      sourceUrl: itemMatch[2].replace(/^http:/, "https:"),
      isAvailable: !/\bOUT OF STOCK\b/i.test(label),
    });
  }
  return rows;
}

export function buildAandJRockvilleAuditSnapshot({
  officialMenuHtml,
  toastMarkdown,
  retrievedAt = auditRetrievedAtAandJRockville,
} = {}) {
  const officialRows = parseAandJOfficialMenu(officialMenuHtml);
  const toastRows = parseAandJRockvilleToastMenu(toastMarkdown);
  if (officialRows.length !== 67) {
    throw new Error(`Expected 67 A&J official-site products; found ${officialRows.length}.`);
  }
  if (toastRows.length !== 79 || toastRows.filter((row) => row.isAvailable).length !== 75) {
    throw new Error("A&J Rockville Toast product counts changed; review the current menu before rebuilding.");
  }

  const supplements = Object.entries(toastSupplements).map(([sourceItemId, supplement]) => {
    const candidates = toastRows.filter((row) => row.sourceItemId === sourceItemId && row.isAvailable);
    if (candidates.length === 0) throw new Error(`A&J Rockville Toast supplement missing: ${sourceItemId}.`);
    const source = candidates.find((row) => row.category === titleCase(supplement.category)) ?? candidates.at(-1);
    return {
      ...supplement,
      sourceItemId,
      sourceUrl: source.sourceUrl,
      rawName: supplement.name,
      labels: [],
      isConfigurable: false,
      sourceType: "restaurant-linked-vendor-menu",
      sourceUrls: [source.sourceUrl, sourceUrlsAandJRockville.toast, sourceUrlsAandJRockville.home],
    };
  });

  const allRows = [
    ...officialRows.map((row) => ({
      ...row,
      sourceType: "restaurant-issued-structured-menu",
      sourceUrls: [sourceUrlsAandJRockville.menu],
    })),
    ...supplements,
  ].sort((left, right) => {
    const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
    if (categoryDifference !== 0) return categoryDifference;
    const leftOfficial = left.sourceType === "restaurant-issued-structured-menu" ? 0 : 1;
    const rightOfficial = right.sourceType === "restaurant-issued-structured-menu" ? 0 : 1;
    return leftOfficial - rightOfficial;
  });

  const items = allRows.map((row, index) => {
    const allergens = publishedAllergenSignals(row);
    const itemSlug = slugify(row.name) || row.code || row.sourceItemId;
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${itemSlug}`,
      id: `${slugify(row.category)}-${itemSlug}`,
      sourceItemId: row.sourceItemId,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: [row.name, row.description].filter(Boolean).join(" ") || null,
      isConfigurable: Boolean(row.isConfigurable),
      sourceUrls: row.sourceUrls,
      sourceType: row.sourceType,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceLabels: row.labels,
      isAvailable: true,
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: "osm-aandj-s-northern-chinese-dim-sum-633639009",
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAandJRockville),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "A&J publishes current product descriptions and a contains-peanuts footnote on its official menu, plus current Rockville ordering products through Toast linked by the restaurant. It does not publish a complete allergen matrix, complete recipes, or a cross-contact guide. The duplicated Vegetable placement, out-of-stock Toast products, and separate Bubble Tea flavor SKUs are not duplicated in the compact catalog. Only fixed published ingredients, the peanut footnote, and mandatory wheat formats are represented; rows without positive item-level evidence remain unavailable.",
    items,
  };
}

function titleCase(value) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "").toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve("data/restaurant-verification");
  const restaurantId = "osm-aandj-s-northern-chinese-dim-sum-633639009";
  const [officialMenuHtml, toastMarkdown] = await Promise.all([
    readFile(path.join(root, `artifacts/${restaurantId}/official-menu.html`), "utf8"),
    readFile(path.join(root, `artifacts/${restaurantId}/third-party-rockville-toast-render-proxy.txt`), "utf8"),
  ]);
  const snapshot = buildAandJRockvilleAuditSnapshot({ officialMenuHtml, toastMarkdown });
  const outputDir = path.join(root, `repairs/${restaurantId}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
