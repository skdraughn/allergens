import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAlTiramisu = "replacement-al-tiramisu-washington-dc";
export const sourceUrlsAlTiramisu = Object.freeze({
  home: "https://www.altiramisu.com/",
  menu: "https://www.altiramisu.com/menu",
  dessert: "https://www.altiramisu.com/menu?menu=dessert-menu",
});

const artifactRoot = path.resolve(`data/restaurant-verification/artifacts/${restaurantIdAlTiramisu}`);
const capturedPages = [
  { url: sourceUrlsAlTiramisu.menu, html: readFileSync(path.join(artifactRoot, "official-menu.html"), "utf8") },
  { url: sourceUrlsAlTiramisu.dessert, html: readFileSync(path.join(artifactRoot, "official-dessert-menu.html"), "utf8") },
];

export function buildAlTiramisuAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const rows = capturedPages.flatMap(({ url, html }) => extractRenderedMenuRows(html, url));
  const items = rows.map((row, index) => {
    const allergens = publishedSignalsAlTiramisu(row);
    return {
      auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
      id: `${slugify(row.category)}-${slugify(row.name)}`,
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description || null,
      imageUrl: null,
      isConfigurable: row.name === "Gelato artigianale",
      presentations: [{ category: row.category }],
      sourceUrls: [row.sourceUrl],
      sourceType: "restaurant-issued-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  if (items.length !== 25 || new Set(items.map((item) => item.id)).size !== 25) {
    throw new Error("Al Tiramisu current rendered menu manifest changed.");
  }
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAlTiramisu,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAlTiramisu),
    presentationCount: items.length,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    unavailableAllergenCount: items.length - ingredientSignalCount,
    sourceWarning: "Al Tiramisu's restaurant-issued menu pages publish current names and selected descriptions but no complete allergen matrix, complete recipes, or cross-contact policy. Positive signals use explicit fixed ingredients and unavoidable named formats only. Optional gelato flavors are not promoted to fixed tree-nut claims, and absent text is not an allergen-free claim.",
    items,
  };
}

export function extractRenderedMenuRows(html, sourceUrl) {
  const tokenPattern = /data-hook="(section\.name|item\.name|item\.description|item\.price)"[^>]*>([\s\S]*?)<\/(?:span|p)>/g;
  const rows = [];
  let category = "";
  let match;
  while ((match = tokenPattern.exec(html))) {
    const value = decodeHtmlText(match[2]);
    if (match[1] === "section.name") {
      category = value;
    } else if (match[1] === "item.name") {
      rows.push({ category, name: value, description: "", price: null, sourceUrl });
    } else if (match[1] === "item.description" && rows.length) {
      rows.at(-1).description = value;
    } else if (match[1] === "item.price" && rows.length) {
      rows.at(-1).price = value;
    }
  }
  return rows;
}

export function publishedSignalsAlTiramisu(item) {
  if (item.name === "Gelato artigianale") return ["milk"];
  const text = normalizeText(`${item.name} ${item.description}`);
  const signals = [];
  if (/\b(?:burrata|parmigiano|cheese|ricotta|cacio|butter|mascarpone|yogurt|gelato)\b/.test(text)) signals.push("milk");
  if (/\b(?:ladyfingers?|zabaglione)\b/.test(text)) signals.push("egg");
  if (/\b(?:almonds?|hazelnuts?|pistachio)\b/.test(text)) signals.push("tree-nut");
  if (/\b(?:breaded|pasta|fettuccine|laganelle|ravioli|linguine|ladyfingers?)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:salmon|fish)\b/.test(text)) signals.push("fish");
  if (/\b(?:calamari|clams?|vongole)\b/.test(text)) signals.push("shellfish");
  return orderedUnique(signals);
}

function decodeHtmlText(value) {
  return String(value).replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
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
  const snapshot = buildAlTiramisuAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAlTiramisu}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
