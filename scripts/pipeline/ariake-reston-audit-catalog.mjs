import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";

export const ariakeRestonRestaurantId = "ariake-japanese-restaurant-reston-va-dc-metro";
export const ariakeRestonReviewedAt = "2026-07-15T10:06:39.227Z";
export const ariakeRestonSourceUrls = Object.freeze({
  ownerMenu: "https://ariakerestaurant.com/reston-menu",
  ownerOrderingPage: "https://ariakerestaurant.com/https/wwwtoasttabcom/ariake-japanese-restaurant-reston-12184-glade-dr",
  toastMenu: "https://order.toasttab.com/online/ariake-japanese-restaurant-reston-12184-glade-dr",
  toastTransport: "https://r.jina.ai/http://order.toasttab.com/online/ariake-japanese-restaurant-reston-12184-glade-dr",
});

const artifactPaths = Object.freeze({
  ownerMenu: `data/restaurant-verification/artifacts/${ariakeRestonRestaurantId}/official-ariake-reston-menu.html`,
  toastTransport: `data/restaurant-verification/artifacts/${ariakeRestonRestaurantId}/ariake-toast-jina-transport.txt`,
});

const excludedToastSections = new Set(["Cold Sake", "Beer", "Wanna Roll Tshirt"]);
const categoryOrder = Object.freeze([
  "Lunch Special", "Lunch Teriyaki", "Lunch Donburi", "Sushi Lunch", "Lunch Special Dishes",
  "Happy Hour Appetizers", "Hot Appetizer", "Cold Appetizer", "Soup & Salad", "Tempura",
  "Katsu", "Grill", "Noodles & Nabe", "Bowl", "Dinner Bento Box",
  "Nigiri Sushi or Sashimi", "Maki Sushi", "Rolls w/ Rice Outside", "Chef's Special Rolls",
  "Sushi Combo", "Sashimi Combo", "Specials On Board", "Ice Cream",
]);

export async function buildAriakeRestonCatalog({
  ownerHtml,
  toastText,
  retrievedAt = ariakeRestonReviewedAt,
} = {}) {
  const [resolvedOwnerHtml, resolvedToastText, manifest] = await Promise.all([
    ownerHtml ?? readFile(artifactPaths.ownerMenu, "utf8"),
    toastText ?? readFile(artifactPaths.toastTransport, "utf8"),
    getDefaultIngredientIntelligenceManifest(),
  ]);
  const owner = extractAriakeOwnerMenu(resolvedOwnerHtml);
  const toast = extractAriakeToastTransport(resolvedToastText, owner.allNames);
  if (owner.foodPresentationCount !== 194) {
    throw new Error(`Ariake owner Reston page expected 194 non-alcohol food presentations, found ${owner.foodPresentationCount}.`);
  }
  if (toast.rawProductCount !== 195 || toast.excludedAlcoholCount !== 29 || toast.excludedMerchandiseCount !== 7) {
    throw new Error(`Ariake Toast contract changed: ${JSON.stringify({ raw: toast.rawProductCount, alcohol: toast.excludedAlcoholCount, merchandise: toast.excludedMerchandiseCount })}.`);
  }

  const currentToastItems = toast.items.map((row) => buildItem(row, manifest));
  const ownerDinner = owner.foodRows.filter(isOwnerDinnerSupplement).map((row) => ({
    ...row,
    category: ownerDinnerCategory(row),
  }));
  const supplements = [
    ...owner.lunch.filter((row) => !isOwnerHelperRow(row)).map((row) => buildItem(ownerSupplement(row, "lunch"), manifest)),
    ...owner.happyHour.map((row) => buildItem(ownerSupplement(row, "happy-hour"), manifest)),
    ...owner.nigiri.map((row) => buildItem(ownerSupplement(row, "nigiri"), manifest)),
    ...ownerDinner.map((row) => buildItem(ownerSupplement(row, "owner-current"), manifest)),
  ];
  const items = [...currentToastItems, ...supplements].sort((left, right) =>
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
    left.name.localeCompare(right.name),
  );
  if (items.length !== 235) throw new Error(`Ariake Reston expected 235 canonical scoped products, found ${items.length}.`);
  if (new Set(items.map((row) => row.id)).size !== items.length) throw new Error("Ariake Reston ids are not unique.");
  items.forEach((row, index) => { row.auditItemKey = `${index + 1}:${row.id}`; });
  return {
    schemaVersion: 1,
    restaurantId: ariakeRestonRestaurantId,
    retrievedAt,
    sourceUrls: Object.values(ariakeRestonSourceUrls),
    itemCount: items.length,
    categoryCount: new Set(items.map((row) => row.category)).size,
    liveToastFoodProductCount: currentToastItems.length,
    ownerFoodPresentationCount: owner.foodPresentationCount,
    ownerLunchSupplementCount: owner.lunch.filter((row) => !isOwnerHelperRow(row)).length,
    excludedOwnerHelperCount: owner.lunch.filter(isOwnerHelperRow).length,
    ownerHappyHourSupplementCount: owner.happyHour.length,
    ownerNigiriSupplementCount: owner.nigiri.length,
    ownerDinnerSupplementCount: ownerDinner.length,
    excludedAlcoholCount: toast.excludedAlcoholCount,
    excludedMerchandiseCount: toast.excludedMerchandiseCount,
    officialIngredientCount: items.filter((row) => row.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((row) => row.allergenSourceType === "unavailable").length,
    itemNameFingerprint: createHash("sha256")
      .update(items.map((row) => `${row.id}\t${normalize(row.name)}`).sort().join("\n"))
      .digest("hex"),
    sourceWarning: "The frozen Reston row mixed Reston and Fairfax owner pages and promoted meal components and an ordering-hours heading to products. The repaired catalog starts with 159 current non-alcohol, non-merchandise products from the restaurant-linked Toast storefront, then adds the current owner page's 34 lunch products, 12 happy-hour presentations, 25 nigiri/sashimi products, and five dinner/nabe/sashimi products that are hidden from the time-dependent Toast capture. Two nested lunch option/helper rows and the component list beneath the configurable dinner bento are excluded. Direct positive ingredient terms are represented; missing terms are not negative assurances. The Toast storefront has one explicit milk-marinade allergy note but no complete allergen matrix or cross-contact disclosure.",
    items,
  };
}

export function extractAriakeOwnerMenu(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $(".menu").each((_menuIndex, menu) => {
    const tab = clean($(menu).attr("aria-label"));
    $(menu).find(".menu-section").each((_sectionIndex, section) => {
      const sourceSection = clean($(section).find(".menu-section-title").first().text());
      const sectionDescription = clean($(section).find(".menu-section-description").first().text());
      $(section).find(".menu-item").each((_itemIndex, item) => {
        const name = clean($(item).find(".menu-item-title").text());
        if (!name) return;
        rows.push({
          tab,
          sourceSection,
          sectionDescription,
          name,
          description: clean($(item).find(".menu-item-description").text()) || null,
        });
      });
    });
  });
  const foodRows = rows.filter((row) => row.tab !== "DRINKS");
  const lunch = foodRows.filter((row) => row.tab === "LUNCH").map((row) => ({
    ...row,
    category: lunchCategory(row.sourceSection),
  }));
  const happyHour = foodRows.filter((row) => row.tab === "HAPPY HOUR SPECIALS").map((row) => ({
    ...row,
    category: "Happy Hour Appetizers",
  }));
  const nigiri = foodRows.filter((row) =>
    row.tab === "A LA CARTE" && /^Nigiri Sushi or Sashimi/i.test(row.sourceSection)
  ).map((row) => ({ ...row, category: "Nigiri Sushi or Sashimi" }));
  return {
    allNames: foodRows.map((row) => row.name),
    foodRows,
    foodPresentationCount: foodRows.length,
    lunch,
    happyHour,
    nigiri,
  };
}

export function extractAriakeToastTransport(text, ownerNames = []) {
  let topSection = "";
  let sourceSection = "";
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const topMatch = line.match(/^## (.+)$/);
    if (topMatch) { topSection = clean(topMatch[1]); sourceSection = ""; continue; }
    const sectionMatch = line.match(/^### (.+)$/);
    if (sectionMatch) { sourceSection = clean(sectionMatch[1]); continue; }
    const linkMatch = line.match(/^\*\s+\[(.*)\]\((https:\/\/order\.toasttab\.com\/online\/ariake-japanese-restaurant-reston-12184-glade-dr\/item-[^)]+)\)$/);
    if (!linkMatch) continue;
    const sourceUrl = linkMatch[2];
    const sourceKey = sourceUrl.split("/item-").at(-1);
    const uuidMatch = sourceKey.match(/_([0-9a-f-]{36})$/i);
    if (!uuidMatch) throw new Error(`Ariake Toast item lacks stable UUID: ${sourceUrl}`);
    const slug = sourceKey.slice(0, -37).replace(/-+$/g, "");
    const description = cleanToastDescription(linkMatch[1]);
    rows.push({
      topSection,
      sourceSection,
      sourceProductId: uuidMatch[1],
      slug,
      id: slug,
      name: displayName(slug, ownerNames),
      category: toastCategory(sourceSection),
      description,
      sourceUrl,
    });
  }
  const excludedAlcohol = rows.filter((row) => ["Cold Sake", "Beer"].includes(row.sourceSection));
  const excludedMerchandise = rows.filter((row) => row.sourceSection === "Wanna Roll Tshirt");
  const items = rows.filter((row) => !excludedToastSections.has(row.sourceSection));
  return {
    rawProductCount: rows.length,
    excludedAlcoholCount: excludedAlcohol.length,
    excludedMerchandiseCount: excludedMerchandise.length,
    items,
  };
}

function buildItem(row, manifest) {
  const ingredientText = [row.name, row.description].filter(Boolean).join(": ");
  const allergens = explicitAllergens(ingredientText);
  const isOfficial = allergens.length > 0;
  const sourceUrls = row.sourceKind === "owner-menu"
    ? [ariakeRestonSourceUrls.ownerMenu]
    : [ariakeRestonSourceUrls.toastMenu, row.sourceUrl];
  const base = {
    auditItemKey: "",
    id: row.id,
    sourceProductId: row.sourceProductId ?? null,
    name: row.name,
    category: row.category,
    description: row.description,
    ingredientsText: row.description,
    imageUrl: null,
    isConfigurable: /choice|combination|bento|lunch special/i.test(`${row.name} ${row.description ?? ""}`),
    allergenSourceType: isOfficial ? "official-ingredients" : "unavailable",
    allergens,
    mayContain: [],
    sourceType: row.sourceKind === "owner-menu" ? "restaurant-issued-menu-text" : "restaurant-linked-toast-menu-text",
    sourceUrls,
    sourceSummary: isOfficial
      ? "The current owner menu or restaurant-linked Toast item explicitly names these positive allergen ingredients. The menu is not a complete allergen matrix and does not establish safety from other allergens or cross-contact."
      : "The current owner and restaurant-linked menus support this product, but publish no explicit positive top-allergen ingredient for it. Missing terms are not negative assurances; fixed and cross-contact data remain unavailable.",
    evidence: sourceUrls.map((sourceUrl) => ({
      sourceKind: row.sourceKind === "owner-menu" ? "restaurant-issued-menu-text" : "restaurant-linked-toast-menu-text",
      sourceUrl,
      text: ingredientText,
    })),
    variantGroup: row.variantGroup ?? null,
  };
  return annotateMenuItemWithIngredientIntelligence(base, { manifest });
}

function ownerSupplement(row, kind) {
  const suffix = kind === "happy-hour" ? " (Happy Hour)" : "";
  const idPrefix = kind === "happy-hour" ? "happy-hour" : kind === "nigiri" ? "nigiri" : kind === "owner-current" ? "owner-current" : "lunch";
  const name = `${row.name}${suffix}`;
  return {
    ...row,
    id: `${idPrefix}-${slugify(row.name)}-${shortHash(`${row.sourceSection}\t${row.name}\t${row.description ?? ""}`)}`,
    name,
    description: [row.description, row.sectionDescription].filter(Boolean).join(" — ") || null,
    sourceKind: "owner-menu",
    variantGroup: kind === "happy-hour" ? "Happy Hour" : kind === "lunch" ? "Lunch" : null,
  };
}

function explicitAllergens(value) {
  const text = normalize(value);
  const imitationCrab = /\b(?:imitation crab(?: meat)?|crab ?stick|kani)\b/.test(text);
  const shellfishText = imitationCrab
    ? text.replace(/\b(?:imitation crab(?: meat)?|crab ?stick|kani|crab)\b/g, " ")
    : text;
  const found = new Set();
  if (/\b(?:milk|cheese|cream|butter|ice cream)\b/.test(text)) found.add("milk");
  if (/\b(?:egg|eggs|omelet|mayonnaise|mayo)\b/.test(text)) found.add("egg");
  if (imitationCrab || /\b(?:fish|sashimi|tuna|salmon|yellowtail|albacore|eel|mackerel|flounder|sea bass|seabream|amberjack|trevally|bonito|roe|ikura|masago|tobiko|hamachi|maguro|saba|unagi|anago|hirame|bincho|aji|chu toro|toro|kanpachi|kohada|madai|masaba|kinmedai|suzuki)\b/.test(text)) found.add("fish");
  if (/\b(?:shrimp|prawn|oyster|oysters|crab|softshell|lobster|scallop|clam|octopus|squid|ika|tako|ebi|hotategai|hotate|hokki|aoyagi|zuwaigani)\b/.test(shellfishText)) found.add("shellfish");
  if (/\b(?:soy|soybean|soybeans|tofu|miso|edamame)\b/.test(text)) found.add("soy");
  if (/\b(?:sesame|goma ae)\b/.test(text)) found.add("sesame");
  if (/\bmustard\b/.test(text)) found.add("mustard");
  if (/\bcashew\b/.test(text)) found.add("tree-nut");
  return [...found].sort();
}

function isOwnerHelperRow(row) {
  return /^a\) with 6 pcs California Roll OR$/i.test(row.name) ||
    /^\(spicy chirashi & Korean style chirashi available\)$/i.test(row.name);
}

function isOwnerDinnerSupplement(row) {
  if (row.tab !== "DINNER") return false;
  if (row.sourceSection === "ENTREE - FROM OUR FRYER" && row.name === "Ton Katsu") return true;
  if (row.sourceSection === "NABE" && ["Yose Nabe", "Sukiyaki (SEASONAL)"].includes(row.name)) return true;
  return row.sourceSection === "From our Sushi Bar" && ["Sashimi Regular *", "Assorted Sashimi *"].includes(row.name);
}

function ownerDinnerCategory(row) {
  if (row.sourceSection === "ENTREE - FROM OUR FRYER") return "Katsu";
  if (row.sourceSection === "NABE") return "Noodles & Nabe";
  return "Sashimi Combo";
}

function displayName(slug, ownerNames) {
  const overrides = {
    "shrimp-veg-tempura-app": "Shrimp & Veg Tempura (App)",
    "shrimp-tempura-app": "Shrimp Tempura (App)",
    "chicken-tempura-app": "Chicken Tempura (App)",
    "veggie-tempura-app": "Veggie Tempura (App)",
    "hamachi-kama-app": "Hamachi Kama (App)",
    "korean-chirashi-d": "Korean Chirashi (D)",
    "unagi-don-d": "Unagi Don (D)",
    "chirashi-d": "Chirashi (D)",
    "dinner-bento-box-w-sashimi": "Dinner Bento Box with Sashimi",
    "hirekatsu-app": "Hire Katsu (App)",
    "chashu-app": "Chashu (App)",
    "72-hour-kalbi": "72 Hour Kalbi",
  };
  if (overrides[slug]) return overrides[slug];
  const normalizedSlug = normalizeName(slug);
  const ownerMatch = ownerNames.find((name) => normalizeName(name) === normalizedSlug);
  return ownerMatch ? cleanDisplay(ownerMatch) : titleCase(slug.replace(/-/g, " "));
}

function cleanToastDescription(value) {
  const cleaned = clean(String(value ?? "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\bOUT OF STOCK\b/gi, " ")
    .replace(/\$\d+(?:\.\d{2})?(?:\+)?\s*$/g, " "));
  return cleaned || null;
}

function lunchCategory(section) {
  return ({
    "Lunch Special": "Lunch Special",
    Teriyaki: "Lunch Teriyaki",
    Donburi: "Lunch Donburi",
    "Sushi Lunch": "Sushi Lunch",
    "Special Dishes": "Lunch Special Dishes",
  })[section] ?? `Lunch ${section}`;
}

function toastCategory(section) {
  return ({
    "Rolls W/ Rice Outside": "Rolls w/ Rice Outside",
  })[section] ?? section;
}

function cleanDisplay(value) {
  return clean(value).replace(/^\d+[a-z]?\.\s*/i, "").replace(/\s*\*\s*$/g, "");
}
function normalizeName(value) {
  return normalize(value)
    .replace(/^\d+[a-z]?\s+/, "")
    .replace(/\b(?:app|d|seasonal)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function titleCase(value) {
  const upper = new Set(["bbq", "d", "app", "yts"]);
  return clean(value).split(" ").map((word) => upper.has(word.toLowerCase()) ? word.toUpperCase() : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
}
function shortHash(value) { return createHash("sha256").update(value).digest("hex").slice(0, 8); }
function slugify(value) { return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAriakeRestonCatalog();
  const outputPath = path.resolve(`data/restaurant-verification/repairs/${ariakeRestonRestaurantId}/corrected-menu.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    restaurantId: snapshot.restaurantId,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    liveToastFoodProductCount: snapshot.liveToastFoodProductCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
  }, null, 2));
}
