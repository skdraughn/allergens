import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const restaurantIdAmelieDc = "replacement-amelie-dc-bistro-and-wine-bar-washington-dc";

export const sourceUrlsAmelieDc = Object.freeze({
  home: "https://www.ameliedc.com/",
  lunch: "https://www.ameliedc.com/lunch",
  dinner: "https://www.ameliedc.com/dinner",
  brunch: "https://www.ameliedc.com/brunch",
  happyHour: "https://www.ameliedc.com/happy-hour",
});

const artifactPaths = Object.freeze({
  lunch: `data/restaurant-verification/artifacts/${restaurantIdAmelieDc}/official-lunch.html`,
  dinner: `data/restaurant-verification/artifacts/${restaurantIdAmelieDc}/official-dinner.html`,
  brunch: `data/restaurant-verification/artifacts/${restaurantIdAmelieDc}/official-brunch.html`,
  happyHour: `data/restaurant-verification/artifacts/${restaurantIdAmelieDc}/official-happy-hour.html`,
});

const alcoholOnlySections = new Set([
  "Dessert Wines",
  "Armagnac, Cognac, Calvados",
  "Apéritif & Digestif",
  "HAPPY HOUR COCKTAILS",
  "HAPPY HOUR WINE OF THE DAY",
  "HAPPY HOUR FLIGHTS $14",
]);

const canonicalNames = new Map([
  ["french onion soup", "Onion Soup"],
  ["onion soup", "Onion Soup"],
  ["escargots a lail", "Escargots à L’Ail"],
  ["salade nicoise 8", "Salade Niçoise"],
  ["salade nicoise", "Salade Niçoise"],
  ["amelie burger 5", "Amélie Burger"],
  ["amelie burger", "Amélie Burger"],
  ["cheeseburger", "Amélie Burger"],
  ["amelie burger beer or wine", "Amélie Burger"],
  ["steak frites 10", "Steak-Frites"],
  ["steak frites", "Steak-Frites"],
  ["cheese charcuterie", "Cheese and Charcuterie Plate"],
  ["cheese and charcuterie plate", "Cheese and Charcuterie Plate"],
  ["warm pistachio crusted goat cheese ball", "Warm Pistachio Crusted Goat Cheese"],
  ["warm pistachio crusted goat cheese", "Warm Pistachio Crusted Goat Cheese"],
  ["crispy artichokes", "Crispy Artichokes"],
  ["crispy artichoke", "Crispy Artichokes"],
  ["baked camembert de normandie", "Baked Camembert"],
  ["baked camembert", "Baked Camembert"],
  ["burrata", "Burrata"],
  ["burratta", "Burrata"],
  ["local burrata", "Burrata"],
  ["moules frites mariniere", "Moules-Frites"],
  ["moules frites", "Moules-Frites"],
  ["moules frites white wine", "Moules-Frites"],
  ["truffle fries truffle oil parmesan cheese", "Truffle Fries"],
  ["truffle fries", "Truffle Fries"],
  ["chocolate mousse", "Chocolate Mousse"],
  ["vanilla creme brulee", "Vanilla Crème Brûlée"],
  ["profitronut", "Profitronut"],
  ["warm apple tarte tatin", "Warm Apple Tarte Tatin"],
  ["becc", "B.E.C.C."],
]);

const categories = new Map([
  ...mapCategory("Appetizers", [
    "Soup du Jour",
    "Onion Soup",
    "Chicken Liver Mousse",
    "Escargots à L’Ail",
    "Roasted Cauliflower",
    "Warm Pistachio Crusted Goat Cheese",
    "Crispy Artichokes",
    "Baked Camembert",
    "Burrata",
    "Beef Tartare",
    "Grilled Octopus",
    "Crudo of the Day",
  ]),
  ...mapCategory("Salads", ["Salade Amélie", "Salade Niçoise"]),
  ...mapCategory("Entrées", [
    "Amélie Burger",
    "Le Croque Monsieur",
    "Fried Chicken Sandwich",
    "Moules-Frites",
    "Steak-Frites",
    "Ravioles du Royans",
    "Maryland Seared Monkfish",
    "Roasted Lemon Chicken",
    "Long Island Duck Breast",
  ]),
  ...mapCategory("Brunch Specialties", [
    "B.E.C.C.",
    "Avocado Tahini Toast",
    "Crêpes au Chocolat",
    "Weekend Croissant",
    "Croque Madame à l'Américaine",
    "Eggs Benedict",
    "Spring Omelette",
    "Parisian Omelette",
    "French Breakfast",
  ]),
  ...mapCategory("Desserts", [
    "Chocolate Mousse",
    "Vanilla Crème Brûlée",
    "Banana Crème Brûlée",
    "Profitronut",
    "Warm Apple Tarte Tatin",
  ]),
  ...mapCategory("For the Table", ["Cheese and Charcuterie Plate", "Plateau Apéro"]),
  ...mapCategory("Sides", [
    "Extra Breadbasket",
    "Pommes Frites/Haricots Verts/Asparagus",
    "Pommes Frites/Haricots Verts/Ratatouille/Sauteed corn/Bok Choy/Spinach",
    "Truffle Fries",
  ]),
]);

const supportedAllergens = new Map([
  ["Amélie Burger", ["milk", "egg", "wheat", "gluten"]],
  ["Avocado Tahini Toast", ["wheat", "gluten", "sesame"]],
  ["B.E.C.C.", ["milk", "egg", "wheat", "gluten"]],
  ["Baked Camembert", ["milk"]],
  ["Banana Crème Brûlée", ["milk", "egg"]],
  ["Beef Tartare", ["egg", "wheat", "gluten"]],
  ["Burrata", ["milk", "tree-nut"]],
  ["Chocolate Mousse", ["milk"]],
  ["Cheese and Charcuterie Plate", ["milk"]],
  ["Chicken Liver Mousse", ["sulfites"]],
  ["Crispy Artichokes", ["milk"]],
  ["Croque Madame à l'Américaine", ["milk", "egg", "wheat", "gluten"]],
  ["Crêpes au Chocolat", ["milk", "tree-nut", "egg", "wheat", "gluten"]],
  ["Eggs Benedict", ["egg", "fish", "wheat", "gluten"]],
  ["Escargots à L’Ail", ["milk", "wheat", "gluten"]],
  ["Extra Breadbasket", ["wheat", "gluten"]],
  ["French Breakfast", ["milk", "wheat", "gluten"]],
  ["Fried Chicken Sandwich", ["wheat", "gluten"]],
  ["Grilled Octopus", ["shellfish"]],
  ["Le Croque Monsieur", ["milk", "wheat", "gluten"]],
  ["Maryland Seared Monkfish", ["fish"]],
  ["Moules-Frites", ["milk", "shellfish", "sulfites"]],
  ["Onion Soup", ["milk", "wheat", "gluten"]],
  ["Parisian Omelette", ["milk", "egg"]],
  ["Plateau Apéro", ["milk"]],
  ["Profitronut", ["milk", "tree-nut", "egg", "wheat", "gluten"]],
  ["Ravioles du Royans", ["milk", "tree-nut", "egg", "wheat", "gluten"]],
  ["Salade Amélie", ["milk"]],
  ["Salade Niçoise", ["egg", "fish"]],
  ["Spring Omelette", ["milk", "egg"]],
  ["Truffle Fries", ["milk"]],
  ["Vanilla Crème Brûlée", ["milk", "egg"]],
  ["Warm Apple Tarte Tatin", ["milk", "wheat", "gluten"]],
  ["Warm Pistachio Crusted Goat Cheese", ["milk", "tree-nut"]],
  ["Weekend Croissant", ["milk", "fish", "wheat", "gluten"]],
]);

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

export async function buildAmelieDcAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  htmlBySurface,
} = {}) {
  const sourceHtml = htmlBySurface ?? Object.fromEntries(
    await Promise.all(Object.entries(artifactPaths).map(async ([surface, artifactPath]) => [
      surface,
      await readFile(artifactPath, "utf8"),
    ])),
  );
  const presentations = Object.entries(sourceHtml).flatMap(([surface, html]) =>
    extractPresentations(surface, html),
  );
  const grouped = new Map();
  for (const presentation of presentations) {
    const canonicalName = canonicalizeName(presentation.sourceName);
    const values = grouped.get(canonicalName) ?? [];
    values.push(presentation);
    grouped.set(canonicalName, values);
  }

  const items = [...grouped.entries()].map(([name, itemPresentations], index) => {
    const allergens = orderedAllergens(supportedAllergens.get(name) ?? []);
    const descriptions = [...new Set(itemPresentations.map((entry) => entry.description).filter(Boolean))];
    const description = [...descriptions].sort((left, right) =>
      right.length - left.length || left.localeCompare(right),
    )[0] ?? null;
    const sourceUrls = [...new Set(itemPresentations.map((entry) => entry.sourceUrl))];
    const allergenSourceType = allergens.length > 0 ? "official-ingredients" : "unavailable";
    return {
      auditItemKey: `${index + 1}:${slugify(name)}`,
      id: slugify(name),
      name,
      category: categories.get(name) ?? "Menu",
      description,
      ingredientsText: descriptions.join(" | ") || null,
      imageUrl: null,
      isConfigurable: false,
      presentations: itemPresentations,
      sourceUrls,
      sourceType: "restaurant-issued-menu-page",
      allergens,
      mayContain: [],
      allergenSourceType,
      sourceSummary: allergens.length > 0
        ? "Direct ingredient terms and unambiguous formulation identity across Amélie's current restaurant-issued menu presentations support these positive signals. The menu is not a complete allergen matrix and does not establish safety from other allergens or cross-contact."
        : "Amélie's current restaurant-issued menu does not disclose enough fixed ingredient detail for a positive item-level allergen claim; allergen data remains unavailable.",
      ...(allergens.length === 0 ? {
        extractedIngredientMentions: [],
        inferredIngredients: [],
        inferredAllergenSignals: [],
        inferenceQuestions: [],
        inferenceSummary: "No supported item-level allergen signal is available.",
        inferenceVersion: "restaurant-menu-review-2026-07-15",
      } : {}),
      evidence: itemPresentations.map((entry) => ({
        sourceKind: "restaurant-issued-menu-text",
        sourceUrl: entry.sourceUrl,
        text: `${entry.sourceName}${entry.description ? `: ${entry.description}` : ""}`,
      })),
    };
  }).sort((left, right) =>
    categoryRank(left.category) - categoryRank(right.category) || left.name.localeCompare(right.name),
  );

  items.forEach((item, index) => {
    item.auditItemKey = `${index + 1}:${slugify(item.name)}`;
  });
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((item) => normalize(item.name)).sort().join("\n"))
    .digest("hex");

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmelieDc,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAmelieDc),
    itemCount: items.length,
    presentationCount: presentations.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    itemNameFingerprint,
    sourceWarning: "The current first-party lunch, dinner, brunch, and happy-hour pages contain 99 food presentations after excluding alcohol-only sections, collapsing to 43 formulations. Ingredient names and unambiguous formulation identities support positive signals, but the pages are not allergen matrices: their instruction to alert a server is not a row-level allergen or cross-contact disclosure, missing ingredients are not negative assurances, and no may-contain claim is invented. Current service variants are consolidated with every presentation retained. The current menu replaces Maryland Rockfish with Maryland Seared Monkfish and Local Roasted Chicken with Roasted Lemon Chicken. Wine and wine gelée support sulfites; octopus and mussels map to shellfish; 'creamy' alone is not treated as dairy.",
    items,
  };
}

function extractPresentations(surface, html) {
  const $ = cheerio.load(html);
  const sourceUrl = sourceUrlsAmelieDc[surface === "happy-hour" ? "happyHour" : surface];
  if (!sourceUrl) throw new Error(`Unknown Amélie surface: ${surface}`);
  const rows = [];
  $(".menu-section").each((_, sectionElement) => {
    const sourceSection = cleanText($(sectionElement).find(".menu-section-title").first().text());
    if (alcoholOnlySections.has(sourceSection)) return;
    $(sectionElement).find(".menu-item").each((__, itemElement) => {
      const sourceName = cleanText($(itemElement).find(".menu-item-title").first().text());
      if (!sourceName) return;
      rows.push({
        surface,
        sourceSection,
        sourceName,
        description: cleanText($(itemElement).find(".menu-item-description").first().text()) || null,
        sourceUrl,
      });
    });
  });
  return rows;
}

function canonicalizeName(value) {
  const normalized = normalize(value);
  return canonicalNames.get(normalized) ?? cleanText(value);
}

function mapCategory(category, names) {
  return names.map((name) => [name, category]);
}

function categoryRank(category) {
  return [
    "For the Table",
    "Appetizers",
    "Salads",
    "Entrées",
    "Brunch Specialties",
    "Sides",
    "Desserts",
  ].indexOf(category);
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
  return String(value ?? "")
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
    `data/restaurant-verification/repairs/${restaurantIdAmelieDc}/corrected-menu.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  const snapshot = await buildAmelieDcAuditSnapshot();
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
