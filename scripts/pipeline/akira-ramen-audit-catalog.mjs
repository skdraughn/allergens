import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAkiraRamen = "akira-ramen-and-izakaya-rockville-md-dc-metro";
export const sourceUrlsAkiraRamen = Object.freeze({
  home: "https://www.akiraramenrockville.com/",
  menu: "https://order.mealkeyway.com/merchant/6c567833364f776d74724c4d686e4e5270446f542b513d3d/menu?productLine=ONLINE_ORDER",
});

const menuArtifactPath = path.resolve(
  `data/restaurant-verification/artifacts/${restaurantIdAkiraRamen}/mealkeyway-menu.json`,
);
const menuPayload = JSON.parse(readFileSync(menuArtifactPath, "utf8"));
const modifierArtifacts = new Set(["Extra Mayo Sauce", "Extra Wasabi Sauce"]);

export function buildAkiraRamenAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const publishedRows = menuPayload.menuCategories.flatMap((category, categoryIndex) =>
    (category.saleItems ?? [])
      .filter((row) => !row.hiddenItem)
      .map((row, rowIndex) => ({
        merchantId: row.id,
        category: category.name?.en?.trim() ?? "Menu",
        categoryIndex,
        rowIndex,
        name: row.name?.en?.trim() ?? "",
        description: String(row.description ?? "").trim(),
        price: row.price ?? row.basePrice ?? null,
        isConfigurable: row.itemType === "COMBO" || (row.comboSections ?? []).length > 0,
      })),
  );

  const foodAndBeverageRows = publishedRows.filter((row) => !modifierArtifacts.has(row.name));
  const canonicalRows = collapseDuplicateTunaIkura(foodAndBeverageRows);
  const items = canonicalRows.map((row, index) => {
    const allergens = publishedSignalsAkiraRamen(row);
    return {
      auditItemKey: `${index + 1}:${row.merchantId}:${slugify(row.name)}`,
      id: `${slugify(row.name)}-${row.merchantId}`,
      merchantRowIds: row.merchantRowIds ?? [row.merchantId],
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description || null,
      imageUrl: null,
      isConfigurable: row.isConfigurable,
      presentations: [{ category: row.category }],
      sourceUrls: [sourceUrlsAkiraRamen.menu],
      sourceType: "restaurant-linked-ordering-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });

  if (publishedRows.length !== 83 || foodAndBeverageRows.length !== 81 || items.length !== 80) {
    throw new Error("Akira current public merchant manifest changed.");
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Akira canonical item IDs are not unique.");
  }

  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAkiraRamen,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAkiraRamen),
    sourcePublishedRowCount: publishedRows.length,
    excludedModifierCount: publishedRows.length - foodAndBeverageRows.length,
    collapsedDuplicateCount: foodAndBeverageRows.length - items.length,
    presentationCount: items.length,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    unavailableAllergenCount: items.length - ingredientSignalCount,
    sourceWarning: "Akira's restaurant-linked MealKeyway catalog publishes current product names and selected descriptions but no complete allergen matrix, recipes, or cross-contact policy. Positive signals use explicit fixed ingredients and unavoidable named formats only; absent text is not an allergen-free claim. Crabstick is treated as fish rather than shellfish, and configurable package choices are not promoted to fixed allergens.",
    items,
  };
}

export function publishedSignalsAkiraRamen(item) {
  let text = normalizeText(`${item.name} ${item.description}`);
  text = text.replace(/crab\s*sticks?|crabstick/g, "surimi fish");
  const signals = [];
  if (/\b(?:cheese|cream cheese|ice cream|butter)\b/.test(text)) signals.push("milk");
  if (/\b(?:eggs?|mayo|mayonnaise)\b/.test(text)) signals.push("egg");
  if (/\bpeanuts?\b/.test(text)) signals.push("peanut");
  if (/\b(?:wheat|gluten|pancake|dumplings?|buns?|tempura|spring rolls?|katsu|tonkatsu|cutlets?|ramen|noodles?|soba|udon|takoyaki)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:fish|fishcakes?|tuna|salmon|yellowtail|hamachi|bonito|eel|tobiko|masago|massago|ikura|roe|surimi)\b/.test(text)) signals.push("fish");
  if (/\b(?:shrimp|mussels?|squid|octopus|scallops?|crabmeat|crab meat)\b/.test(text)) signals.push("shellfish");
  if (/\b(?:soy|shoyu|miso|tofu|edamame)\b/.test(text)) signals.push("soy");
  if (/\bsesame\b/.test(text)) signals.push("sesame");
  return orderedUnique(signals);
}

function collapseDuplicateTunaIkura(rows) {
  const duplicates = rows.filter((row) => normalizeText(row.name) === "tuna ikura");
  if (duplicates.length !== 2) throw new Error("Expected two current Tuna Ikura merchant rows.");
  const preferred = duplicates.toSorted((left, right) => right.description.length - left.description.length)[0];
  const duplicateIds = duplicates.map((row) => row.merchantId).toSorted((left, right) => left - right);
  return rows
    .filter((row) => normalizeText(row.name) !== "tuna ikura" || row.merchantId === preferred.merchantId)
    .map((row) => row.merchantId === preferred.merchantId ? { ...row, merchantRowIds: duplicateIds } : row);
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedUnique(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAkiraRamenAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAkiraRamen}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    sourcePublishedRowCount: snapshot.sourcePublishedRowCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
