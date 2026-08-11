import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";

export const restaurantIdAmoos = "amoo-s-restaurant-mclean-va-dc-metro";

export const sourceUrlsAmoos = Object.freeze({
  home: "https://amoosrestaurant.com/",
  currentMenu: "https://www.orderspoon.com/delivery/virginia/mclean/amoo-s-restaurant?source=mealme",
  legacyDineIn: "https://amoosrestaurant.weebly.com/uploads/1/2/3/2/123203214/dine_in_menu_for_website-2_2.pdf",
  legacyTakeout: "https://amoosrestaurant.weebly.com/uploads/1/2/3/2/123203214/take_out_menu.pdf",
});

const artifactPaths = Object.freeze({
  home: `data/restaurant-verification/artifacts/${restaurantIdAmoos}/official-home.html`,
  currentMenu: `data/restaurant-verification/artifacts/${restaurantIdAmoos}/orderspoon-current-menu.html`,
});

const featuredNames = new Set([
  "Koobideh",
  "Family Platter for 2",
  "Saffron Chicken",
  "Chimichurri Chicken",
  "Shirazi Salad",
  "Persian Saffron Ice Cream",
]);

const officialAllergens = new Map([
  ["Family Platter for 2", ["wheat", "gluten"]],
  ["Persian Saffron Ice Cream", ["milk", "tree-nut"]],
]);

const canonicalNames = new Map([
  ["family platters 3 skewrs of kabob perfect for 2 persons", "Family Platter for 2"],
  ["shirin sweet polo", "Shirin Sweet Polo"],
  ["baghali lima beans polo", "Baghali Polo"],
  ["albaloo cherry polo", "Albaloo Polo"],
  ["zereshk berry polo", "Zereshk Polo"],
  ["fasl garden salad", "Fasl Garden Salad"],
]);

const categoryOrder = [
  "Shareables",
  "Soups",
  "Meats",
  "Poultry",
  "Seafood",
  "Stews",
  "Vegetarian Options",
  "A La Carte Rice Specialties",
  "Sandwich Wraps",
  "Kid's Menu",
  "Sides",
  "Dessert",
  "Beverages",
];

const allergenOrder = [
  "milk",
  "peanut",
  "tree-nut",
  "egg",
  "fish",
  "shellfish",
  "wheat",
  "gluten",
  "soy",
  "sesame",
  "mustard",
  "sulfites",
];

export async function buildAmoosAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  homeHtml,
  currentMenuHtml,
} = {}) {
  const [resolvedHomeHtml, resolvedCurrentMenuHtml, manifest] = await Promise.all([
    homeHtml ?? readFile(artifactPaths.home, "utf8"),
    currentMenuHtml ?? readFile(artifactPaths.currentMenu, "utf8"),
    getDefaultIngredientIntelligenceManifest(),
  ]);
  const featured = extractOfficialFeaturedItems(resolvedHomeHtml);
  const currentMenu = extractOrderspoonMenu(resolvedCurrentMenuHtml);
  const items = currentMenu.categories.flatMap((category) =>
    category.items.map((sourceItem) => {
      const name = canonicalizeName(sourceItem.name);
      const officialFeature = featured.get(name) ?? null;
      const allergens = orderedAllergens(officialAllergens.get(name) ?? []);
      const isOfficialIngredientRow = allergens.length > 0;
      const sourceUrls = officialFeature
        ? [sourceUrlsAmoos.home, sourceUrlsAmoos.currentMenu]
        : [sourceUrlsAmoos.currentMenu];
      const base = {
        auditItemKey: "",
        id: slugify(name),
        vendorItemId: String(sourceItem.vendorItemId),
        name,
        category: canonicalizeCategory(category.name),
        description: officialFeature?.description ?? sourceItem.description,
        ingredientsText: officialFeature?.description ?? sourceItem.description,
        price: sourceItem.price,
        imageUrl: null,
        isConfigurable: false,
        allergenSourceType: isOfficialIngredientRow ? "official-ingredients" : "unavailable",
        allergens,
        mayContain: [],
        sourceType: officialFeature
          ? "restaurant-issued-feature-and-reviewed-delivery-menu"
          : "reviewed-third-party-delivery-menu",
        sourceUrls,
        sourceSummary: isOfficialIngredientRow
          ? "Amoo's current restaurant-issued homepage description directly supports these positive allergen signals, and the exact formulation is present in the current restaurant-matched delivery catalog. The homepage is not a complete allergen matrix and does not establish safety from other allergens or cross-contact."
          : officialFeature
            ? "Amoo's current restaurant-issued homepage corroborates this formulation but does not disclose a positive top-allergen signal for it. Missing ingredient terms are not negative assurances; official allergen data remains unavailable."
            : "The current restaurant-matched delivery catalog supports this formulation and description, but it is third-party evidence and is not promoted to a restaurant-issued allergen claim. Official allergen data remains unavailable.",
        evidence: [
          ...(officialFeature ? [{
            sourceKind: "restaurant-issued-menu-text",
            sourceUrl: sourceUrlsAmoos.home,
            text: `${officialFeature.name}: ${officialFeature.description}`,
          }] : []),
          {
            sourceKind: "third-party-delivery-menu-text",
            sourceUrl: sourceUrlsAmoos.currentMenu,
            text: `${sourceItem.name}${sourceItem.description ? `: ${sourceItem.description}` : ""}`,
          },
        ],
      };
      return correctInference(
        annotateMenuItemWithIngredientIntelligence(base, { manifest }),
      );
    }),
  ).sort((left, right) =>
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
    left.name.localeCompare(right.name),
  );

  items.forEach((item, index) => {
    item.auditItemKey = `${index + 1}:${item.id}`;
  });

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmoos,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAmoos),
    currentStore: currentMenu.store,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialFeaturedCount: items.filter((item) => item.sourceUrls.includes(sourceUrlsAmoos.home)).length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    itemNameFingerprint: createHash("sha256")
      .update(items.map((item) => normalize(item.name)).sort().join("\n"))
      .digest("hex"),
    sourceWarning: "Amoo's current homepage publishes six featured formulations and identity details, but its advertised full-menu download buttons have no links and its ordering links include an unrelated Chopped NYC Ann Arbor store. The complete 71-row working catalog therefore comes from a current exact-address third-party delivery page, corroborated by the six first-party features, current exact-address vendor listings, and restaurant-issued legacy menus only for history. Third-party descriptions remain Ingredient Intelligence and are never promoted to official allergen evidence. Only the current first-party Family Platter bread and Persian Saffron Ice Cream cream/pistachio wording support restaurant-issued positive signals; every may-contain value remains empty because no current item-level cross-contact disclosure was found.",
    items,
  };
}

export function extractOfficialFeaturedItems(html) {
  const $ = cheerio.load(html);
  const result = new Map();
  $("h3").each((_, heading) => {
    const name = cleanText($(heading).text());
    if (!featuredNames.has(name) || result.has(name)) return;
    const container = $(heading).closest('[data-framer-name="Title"]');
    const description = cleanText(container.find("p").first().text());
    if (!description) throw new Error(`Missing Amoo's official description for ${name}`);
    result.set(name, { name, description });
  });
  if (result.size !== featuredNames.size) {
    throw new Error(`Expected ${featuredNames.size} Amoo's featured items; found ${result.size}`);
  }
  return result;
}

export function extractOrderspoonMenu(html) {
  const $ = cheerio.load(html);
  const payload = $("#__NUXT_DATA__").html();
  if (!payload) throw new Error("Missing Orderspoon __NUXT_DATA__ payload");
  const values = JSON.parse(payload);
  const state = values.find((value) =>
    value && !Array.isArray(value) && typeof value === "object" && Object.hasOwn(value, "$smmMenu"),
  );
  if (!state) throw new Error("Missing Orderspoon menu state");
  const store = resolveObject(values, state.$smmStore);
  const address = resolveObject(values, store.address);
  const menu = resolveObject(values, state.$smmMenu);
  const categories = resolveArray(values, menu.categories).map((categoryIndex) => {
    const category = resolveObject(values, categoryIndex);
    return {
      name: cleanText(resolveValue(values, category.name)),
      items: resolveArray(values, category.menu_item_list).map((itemIndex) => {
        const item = resolveObject(values, itemIndex);
        return {
          vendorItemId: resolveValue(values, item.id),
          name: cleanText(resolveValue(values, item.name)),
          description: cleanText(resolveValue(values, item.description)) || null,
          price: cleanText(resolveValue(values, item.formatted_price)) || null,
          isAvailable: Boolean(resolveValue(values, item.is_available)),
        };
      }),
    };
  });
  return {
    store: {
      id: String(resolveValue(values, store.id)),
      name: cleanText(resolveValue(values, store.name)),
      phone: cleanText(resolveValue(values, store.phone_number)),
      address: [
        resolveValue(values, address.street_addr),
        resolveValue(values, address.city),
        resolveValue(values, address.state),
        resolveValue(values, address.zipcode),
      ].filter(Boolean).join(", ").replace(/, ([A-Z]{2}), /, ", $1 "),
      storeId: cleanText(resolveValue(values, store.store_id)),
    },
    categories,
  };
}

function correctInference(item) {
  if (item.name === "Extra Chimichurri Sauce") {
    return {
      ...item,
      extractedIngredientMentions: [],
      inferredIngredients: [],
      inferredAllergenSignals: [],
      inferenceQuestions: [],
      inferenceSummary: "No supported item-level allergen signal is available; suggested bread service and an either-or vinegar/lemon description are not fixed sauce ingredients.",
      inferenceVersion: "restaurant-menu-review-2026-07-15",
    };
  }
  if (item.name === "Soupe Jo Kurdi") {
    return {
      ...item,
      extractedIngredientMentions: [
        { ingredientId: "barley", label: "barley", sourceField: "ingredientsText", text: "barley" },
        { ingredientId: "noodles", label: "noodles", sourceField: "ingredientsText", text: "noodles" },
      ],
      inferredIngredients: ["barley", "noodles"],
      inferredAllergenSignals: [
        { id: "gluten", c: "high", e: ["menu:barley", "ingredient:barley"] },
        { id: "wheat", c: "medium", e: ["menu:noodles", "ingredient:noodles"] },
      ],
      inferenceQuestions: [
        "Are the noodles wheat-based?",
        "Does the soup contain any additional gluten sources beyond the disclosed barley?",
      ],
      inferenceSummary: "The reviewed third-party description directly names barley, which supports gluten but not wheat; noodles make wheat a separate question rather than a certainty.",
      inferenceVersion: "restaurant-menu-review-2026-07-15",
    };
  }
  return item;
}

function resolveValue(values, index) {
  return Number.isInteger(index) ? values[index] : index;
}

function resolveObject(values, index) {
  const value = resolveValue(values, index);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Expected object at Orderspoon value ${index}`);
  }
  return value;
}

function resolveArray(values, index) {
  const value = resolveValue(values, index);
  if (!Array.isArray(value)) throw new Error(`Expected array at Orderspoon value ${index}`);
  return value;
}

function canonicalizeName(value) {
  const cleaned = cleanText(value);
  return canonicalNames.get(normalize(cleaned)) ?? cleaned;
}

function canonicalizeCategory(value) {
  return normalize(value) === "sandwich wraps" ? "Sandwich Wraps" : cleanText(value);
}

function orderedAllergens(values) {
  return [...new Set(values)].sort(
    (left, right) => allergenOrder.indexOf(left) - allergenOrder.indexOf(right),
  );
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmoos}/corrected-menu.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  const snapshot = await buildAmoosAuditSnapshot();
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialFeaturedCount: snapshot.officialFeaturedCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
