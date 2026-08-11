import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const aztecaRestaurantId = "azteca-restaurant-college-park-md-dc-metro";
export const aztecaSourceUrls = Object.freeze({
  home: "https://www.aztecarestaurantcantinamd.com/",
  menu: "https://aztecarestaurantcantinamd.com/azteca-restaurant-cantina/menu/9505-Baltimore-Ave/",
});
export const aztecaMenuSha256 =
  "711dfc651ec4c65a5036a4dae9232b5dc408a267a20df543e10201ecf5d91ec4";
const menuArtifact =
  `data/restaurant-verification/artifacts/${aztecaRestaurantId}/official-order-menu-current.html`;

export async function buildAztecaCollegeParkAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  menuHtml,
} = {}) {
  const html = menuHtml ?? await readFile(menuArtifact, "utf8");
  const sha256 = createHash("sha256").update(html).digest("hex");
  if (sha256 !== aztecaMenuSha256) throw new Error(`Azteca menu changed: ${sha256}.`);

  const rawPresentations = parsePresentations(html);
  const uniqueVendorProducts = [...new Map(
    rawPresentations.map((presentation) => [presentation.vendorItemId, presentation]),
  ).values()];
  const groupedByName = new Map();
  for (const presentation of uniqueVendorProducts) {
    const key = normalizeName(presentation.name);
    const group = groupedByName.get(key) ?? [];
    group.push(presentation);
    groupedByName.set(key, group);
  }
  const items = [...groupedByName.values()].map((presentations, index) =>
    finalizeProduct(presentations, index)
  );
  const linkedIngredientCount = items.filter(
    (item) => item.allergenSourceType === "restaurant-linked-menu-ingredients",
  ).length;
  const unavailableAllergenCount = items.filter(
    (item) => item.allergenSourceType === "unavailable",
  ).length;
  if (
    rawPresentations.length !== 103 ||
    uniqueVendorProducts.length !== 95 ||
    items.length !== 94 ||
    new Set(items.map((item) => item.id)).size !== 94 ||
    linkedIngredientCount !== 65 ||
    unavailableAllergenCount !== 29 ||
    items.some((item) => item.mayContain.length > 0)
  ) {
    throw new Error(
      `Azteca catalog changed: ${rawPresentations.length} raw, ` +
        `${uniqueVendorProducts.length} vendor products, ${items.length} canonical, ` +
        `${linkedIngredientCount} linked positive, ${unavailableAllergenCount} unavailable.`,
    );
  }
  return {
    schemaVersion: 1,
    restaurantId: aztecaRestaurantId,
    retrievedAt,
    sourceUrls: [aztecaSourceUrls.home, aztecaSourceUrls.menu],
    rawPresentationCount: rawPresentations.length,
    uniqueVendorProductCount: uniqueVendorProducts.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    linkedIngredientCount,
    unavailableAllergenCount,
    sourceWarning: "The restaurant-linked FOX Ordering College Park menu is a complete current product catalog but only a partial ingredient source. Direct major-allergen words and unavoidable named fish or shellfish identities are retained as narrow linked-menu positives. Flour-tortilla wording is not promoted to wheat or gluten; missing description terms are not negative or cross-contact evidence.",
    items,
  };
}

function parsePresentations(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $(".menu_toggle[data-toggle^='toggle_']").each((_index, toggle) => {
    const category = clean($(toggle).find("h3").clone().children().remove().end().text());
    if (!category) return;
    const section = $(`#${$(toggle).attr("data-toggle")}`);
    const firstChild = section.children().first();
    const sectionDescription = firstChild.is("div")
      ? clean(firstChild.text()) || null
      : null;
    section.find("form.fire_submit").each((_formIndex, form) => {
      const vendorItemId = clean($(form).find("input[name='iid']").attr("value"));
      const name = clean($(form).find("h4 div").first().text());
      if (!vendorItemId || !name) return;
      rows.push({
        vendorItemId,
        name,
        category,
        description: clean($(form).find("p").first().text()) || null,
        sectionDescription,
      });
    });
  });
  return rows;
}

function finalizeProduct(presentations, index) {
  const primary = presentations.find(
    (presentation) => presentation.category === "Plato Picadera Especial",
  ) ?? presentations[0];
  const applicableSectionDescription = primary.name === "Plato Picadera Especial"
    ? null
    : primary.sectionDescription;
  const ingredientsText = [primary.description, applicableSectionDescription]
    .filter(Boolean).join(" | ") || null;
  const allergens = directAllergens(primary.name, ingredientsText);
  const allergenSourceType = allergens.length > 0
    ? "restaurant-linked-menu-ingredients"
    : "unavailable";
  return {
    auditItemKey: `${index + 1}:${slugify(primary.name)}`,
    id: slugify(primary.name),
    name: primary.name,
    category: primary.category,
    description: primary.description,
    ingredientsText,
    imageUrl: null,
    isConfigurable: /\b(?:choice|your preference|upon request)\b/i.test(ingredientsText ?? ""),
    allergens,
    mayContain: [],
    allergenSourceType,
    sourceType: "restaurant-linked-fox-ordering-menu",
    sourceUrls: [aztecaSourceUrls.menu],
    sourceSummary: allergens.length > 0
      ? "Direct major-allergen ingredient words or unavoidable named fish and shellfish identities from the current restaurant-linked ordering menu are retained as partial positive evidence only."
      : "The current restaurant-linked ordering menu does not provide enough direct item-level allergen detail; direct and cross-contact status remain unavailable.",
    evidence: presentations.map((presentation) => ({
      sourceKind: "restaurant-linked-menu-ingredients",
      sourceUrl: aztecaSourceUrls.menu,
      text: [
        `${presentation.category}: ${presentation.name}`,
        presentation.description,
        presentation.name === "Plato Picadera Especial" ? null : presentation.sectionDescription,
      ].filter(Boolean).join("; "),
      vendorItemId: presentation.vendorItemId,
    })),
    presentations,
    variantGroup: presentations.map((presentation) => presentation.category).join("; "),
  };
}

function directAllergens(name, ingredientsText) {
  const text = `${name} ${ingredientsText ?? ""}`.toLowerCase();
  const allergens = [];
  if (/\b(?:cheese|queso|cheeseburger|sour cream|cream sauce|garlic butter|lemon butter)\b/.test(text)) {
    allergens.push("milk");
  }
  if (/\beggs?\b/.test(text)) allergens.push("egg");
  if (/\b(?:fish|salmon)\b/.test(text)) allergens.push("fish");
  if (/\b(?:shrimp|shrimps|crab|lobster|mussel|mussels|clam|clams|scallop|scallops|calamari|calamares|octopus)\b/.test(text)) {
    allergens.push("shellfish");
  }
  return orderedAllergens(allergens);
}

function normalizeName(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAztecaCollegeParkAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${aztecaRestaurantId}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    rawPresentationCount: snapshot.rawPresentationCount,
    uniqueVendorProductCount: snapshot.uniqueVendorProductCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    linkedIngredientCount: snapshot.linkedIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
