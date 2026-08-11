import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const aventinoRestaurantId = "aventino-bethesda";
export const aventinoDuplicateRestaurantId = "osm-aventino-cucina-romana-12342520793";
export const aventinoSourceUrls = Object.freeze({
  menu: "https://aventinocucina.com/menus/",
  faq: "https://aventinocucina.com/faq/",
  toast: "https://order.toasttab.com/online/aventino-extended-csd",
});

const menuArtifact =
  `data/restaurant-verification/artifacts/${aventinoRestaurantId}/official-menus-current.html`;
const linkedLabelIds = new Set([
  "pizza-rossa",
  "ricotta",
  "suppli-al-telefono",
  "piselli",
  "tonnarelli",
  "bucatini",
  "lumache",
  "rigatoni-carbonara",
  "prosciutto-panino",
  "aventino-burger",
  "milanese",
  "pesce-online-ordering",
]);

const definitions = Object.freeze([
  d("pizza-rossa", "Pizza Rossa", "Dinner — Aperitivi", ["wheat", "gluten"], ["Dinner|APERITIVI|PIZZA ROSSA", "Lunch|ANTIPASTI|PIZZA ROSSA", "Brunch|ANTIPASTI|PIZZA ROSSA"]),
  d("acciughe-e-burro", "Acciughe e Burro", "Dinner — Aperitivi", ["milk", "wheat", "gluten", "fish"], ["Dinner|APERITIVI|ACCIUGHE E BURRO"]),
  d("suppli-al-telefono", "Suppli al Telefono", "Dinner — Aperitivi", ["milk", "wheat", "gluten"], ["Dinner|APERITIVI|SUPPLI AL TELEFONO", "Lunch|ANTIPASTI|SUPPLI AL TELEFONO", "Brunch|ANTIPASTI|SUPPLI AL TELEFONO", "Happy Hour|APERITIVO HOUR|SUPPLI AL TELEFONO"]),
  d("ricotta", "Ricotta", "Dinner — Aperitivi", ["milk", "wheat", "gluten"], ["Dinner|APERITIVI|RICOTTA", "Lunch|ANTIPASTI|RICOTTA", "Brunch|ANTIPASTI|RICOTTA"]),
  d("crostini", "Crostini", "Dinner — Aperitivi", ["milk", "tree-nut", "wheat", "gluten"], ["Dinner|APERITIVI|CROSTINI"]),
  d("fiori", "Fiori", "Dinner — Aperitivi", ["milk", "tree-nut"], ["Dinner|APERITIVI|FIORI"]),
  d("prosciutto", "Prosciutto", "Dinner — Aperitivi", ["milk"], ["Dinner|APERITIVI|PROSCIUTTO"]),
  d("misticanza", "Misticanza", "Dinner — Antipasti", [], ["Dinner|ANTIPASTI|MISTICANZA", "Lunch|ANTIPASTI|MISTICANZA", "Brunch|ANTIPASTI|MISTICANZA"]),
  d("piselli", "Piselli", "Dinner — Antipasti", ["milk", "tree-nut"], ["Dinner|ANTIPASTI|PISELLI", "Lunch|ANTIPASTI|PISELLI", "Brunch|ANTIPASTI|PISELLI"]),
  d("funghi", "Funghi", "Dinner — Antipasti", [], ["Dinner|ANTIPASTI|FUNGHI"]),
  d("caprese", "Caprese", "Dinner — Antipasti", ["milk"], ["Dinner|ANTIPASTI|CAPRESE"]),
  d("fritto", "Fritto", "Dinner — Antipasti", ["shellfish"], ["Dinner|ANTIPASTI|FRITTO"]),
  d("capesante", "Capesante", "Dinner — Antipasti", ["shellfish"], ["Dinner|ANTIPASTI|CAPESANTE"]),
  d("tonnarelli", "Tonnarelli", "Dinner — Pasta", ["milk", "wheat", "gluten"], ["Dinner|PASTA|TONNARELLI", "Lunch|PASTA|TONNARELLI", "Brunch|PIATTI|TONNARELLI"]),
  d("lumache", "Lumache", "Dinner — Pasta", ["milk", "wheat", "gluten"], ["Dinner|PASTA|LUMACHE", "Lunch|PASTA|LUMACHE"]),
  d("bucatini", "Bucatini", "Dinner — Pasta", ["milk", "tree-nut"], ["Dinner|PASTA|BUCATINI", "Lunch|PASTA|BUCATINI", "Brunch|PIATTI|BUCATINI"]),
  d("rigatoni", "Rigatoni", "Dinner — Pasta", ["milk"], ["Dinner|PASTA|RIGATONI"]),
  d("fettucine", "Fettucine", "Dinner — Pasta", ["wheat", "gluten", "shellfish"], ["Dinner|PASTA|FETTUCINE"]),
  d("pappardelle", "Pappardelle", "Dinner — Pasta", ["mustard"], ["Dinner|PASTA|PAPPARDELLE"]),
  d("pesce-secondi", "Pesce", "Dinner — Secondi", ["fish"], ["Dinner|SECONDI|PESCE"]),
  d("pollo", "Pollo", "Dinner — Secondi", [], ["Dinner|SECONDI|POLLO"]),
  d("brasato", "Brasato", "Dinner — Secondi", [], ["Dinner|SECONDI|BRASATO"]),
  d("prosciutto-antipasti", "Prosciutto", "Lunch — Antipasti", [], ["Lunch|ANTIPASTI|PROSCUITTO", "Brunch|ANTIPASTI|PROSCUITTO"]),
  d("rigatoni-carbonara", "Rigatoni Carbonara", "Lunch — Pasta", ["milk", "egg", "wheat", "gluten"], ["Lunch|PASTA|RIGATONI", "Brunch|PIATTI|RIGATONI"]),
  d("prosciutto-panino", "Prosciutto Panino", "Lunch — Pranzo", ["milk", "tree-nut", "wheat", "gluten"], ["Lunch|PRANZO|PANINO", "Brunch|PIATTI|PANINO"]),
  d("aventino-burger", "Aventino Burger", "Lunch — Pranzo", ["milk", "wheat", "gluten"], ["Lunch|PRANZO|AVENTINO BURGER", "Brunch|PIATTI|AVENTINO BURGER"]),
  d("milanese", "Milanese", "Lunch — Pranzo", ["milk", "egg", "wheat", "gluten", "fish"], ["Lunch|PRANZO|MILANESE", "Brunch|PIATTI|MILANESE"]),
  d("pesce-pranzo", "Pesce", "Lunch — Pranzo", ["fish"], ["Lunch|PRANZO|PESCE", "Brunch|PIATTI|PESCE"]),
  d("chocolate-nemesis-cake", "Chocolate Nemesis Cake", "Lunch — Dolci", ["milk", "tree-nut"], ["Lunch|DOLCI|CHOCOLATE NEMESIS CAKE"]),
  d("gelato-selection", "Gelato Selection", "Lunch — Dolci", ["tree-nut"], ["Lunch|DOLCI|GELATO SELECTION"]),
  d("affogato", "Affogato", "Lunch — Dolci", [], ["Lunch|DOLCI|AFFOGATO", "Dessert|DOLCI|AFFOGATO"]),
  d("bombolini", "Bombolini", "Brunch Specialties", ["milk"], ["Brunch|BRUNCH SPECIALTIES|BOMBOLINI"]),
  d("blueberry-coffee-cake", "Blueberry Coffee Cake", "Brunch Specialties", ["milk"], ["Brunch|BRUNCH SPECIALTIES|BLUEBERY COFFEE CAKE"]),
  d("breakfast-panino", "Breakfast Panino", "Brunch Specialties", ["milk", "egg", "wheat", "gluten"], ["Brunch|BRUNCH SPECIALTIES|BREAKFAST PANINO"]),
  d("lemon-ricotta-pancakes", "Lemon Ricotta Pancakes", "Brunch Specialties", ["milk", "tree-nut"], ["Brunch|BRUNCH SPECIALTIES|LEMON RICOTTA PANCAKES"]),
  d("omelette-del-giorno", "Omelette 'Del Giorno'", "Brunch Specialties", ["milk", "egg"], ["Brunch|BRUNCH SPECIALTIES|OMELETTE 'DEL GIORNO'"]),
  d("eggs-allamatriciana", "Eggs all'Amatriciana", "Brunch Specialties", ["milk", "egg", "wheat", "gluten"], ["Brunch|BRUNCH SPECIALTIES|EGGS ALL'AMATRICIANA"]),
  d("aventino-tiramisu", "Aventino Tiramisu", "Dessert", ["milk", "tree-nut"], ["Dessert|DOLCI|AVENTINO TIRAMISU"]),
  d("mascarpone-cheesecake", "Mascarpone Cheesecake", "Dessert", ["milk", "tree-nut"], ["Dessert|DOLCI|MASCARPONE CHEESECAKE"]),
  d("chocolate-nemesis", "Chocolate Nemesis", "Dessert", ["milk", "tree-nut"], ["Dessert|DOLCI|CHOCOLATE NEMESIS"]),
  d("angel-food-cake", "Angel Food Cake", "Dessert", ["milk"], ["Dessert|DOLCI|ANGEL FOOD CAKE"]),
  d("cookie-plate", "Cookie Plate", "Dessert", [], ["Dessert|DOLCI|COOKIE PLATE"]),
  d("gelato-e-sorbetto", "Gelato e Sorbetto", "Dessert", ["tree-nut"], ["Dessert|DOLCI|GELATO E SORBETTO"]),
  d("pasta-al-zozzone", "Pasta al Zozzone", "Happy Hour — Pasta", ["milk"], [], "tomato, guanciale, chili, sausage, pecorino Romano, black pepper"),
  d("pizza-bianca", "Pizza Bianca", "Happy Hour — Aperitivo", [], ["Happy Hour|APERITIVO HOUR|PIZZA BIANCA"]),
  d("italian-olives", "Italian Olives", "Happy Hour — Aperitivo", [], ["Happy Hour|APERITIVO HOUR|ITALIAN OLIVES"]),
  d("rosemary-taralli", "Rosemary Taralli", "Happy Hour — Aperitivo", [], ["Happy Hour|APERITIVO HOUR|ROSEMARY TARALLI"]),
  d("prosciutto-di-parma", "Prosciutto di Parma", "Happy Hour — Aperitivo", [], ["Happy Hour|APERITIVO HOUR|PROSCIUTTO DI PARMA"]),
  d("aventino-burger-happy-hour", "Aventino Burger", "Happy Hour — Aperitivo", ["milk"], ["Happy Hour|APERITIVO HOUR|AVENTINO BURGER"]),
  d("chocolate-chip-cookies", "Chocolate Chip Cookies", "Restaurant-linked Menu", [], [], "Three (3) soft & chewy cookies with chocolate chunks and caramelized cocoa nibs", true),
  d("sourdough-bread", "Sourdough Bread", "Restaurant-linked Menu", [], [], "house-made sourdough bread, extra-virgin olive oil", true),
  d("pesce-online-ordering", "Pesce", "Restaurant-linked Menu", ["milk", "tree-nut", "fish"], [], "pan roasted market fish, grilled local asparagus, romesco sauce, toasted hazelnuts", true),
]);

export async function buildAventinoAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  menuHtml,
} = {}) {
  const html = menuHtml ?? await readFile(menuArtifact, "utf8");
  const sourceIndex = buildSourceIndex(html);
  const items = definitions.map((definition, index) => finalizeDefinition(definition, index, sourceIndex));
  const officialIngredientCount = items.filter(
    (item) => item.allergenSourceType === "official-ingredients",
  ).length;
  const linkedPositiveCount = items.filter(
    (item) => item.allergenSourceType === "restaurant-linked-product-allergen-section",
  ).length;
  const unavailableAllergenCount = items.filter(
    (item) => item.allergenSourceType === "unavailable",
  ).length;

  if (
    items.length !== 52 ||
    new Set(items.map((item) => item.id)).size !== 52 ||
    officialIngredientCount !== 27 ||
    linkedPositiveCount !== 12 ||
    unavailableAllergenCount !== 13 ||
    items.some((item) => item.mayContain.length > 0)
  ) {
    throw new Error(
      `Aventino manifest changed: ${items.length} rows, ${officialIngredientCount} official, ` +
        `${linkedPositiveCount} linked, ${unavailableAllergenCount} unavailable.`,
    );
  }

  return {
    schemaVersion: 1,
    restaurantId: aventinoRestaurantId,
    retrievedAt,
    sourceUrls: [aventinoSourceUrls.menu, aventinoSourceUrls.faq, aventinoSourceUrls.toast],
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount,
    linkedPositiveCount,
    positiveDisclosureCount: officialIngredientCount + linkedPositiveCount,
    unavailableAllergenCount,
    sourceWarning: "The current restaurant-issued menus define the food catalog and supply narrow positive ingredient evidence, but no allergen matrix, negative claims, or cross-contact policy. The owner-linked Toast menu supplies partial affirmative labels for matching formulations only; missing labels are never negative evidence. Seasonal, service-specific, and Toast formulations remain separate when their published ingredients differ. Alcohol-only sections and non-dish links are excluded.",
    items,
  };
}

function d(id, name, category, allergens, refs, description = null, linkedOnly = false) {
  return { id, name, category, allergens, refs, description, linkedOnly };
}

function buildSourceIndex(html) {
  const $ = cheerio.load(html);
  const script = $("script[type='application/ld+json']").toArray()
    .map((element) => $(element).text())
    .find((text) => text.includes('"hasMenuSection"') && text.includes('"@type":"Menu"'));
  if (!script) throw new Error("Aventino menu JSON-LD was not found.");
  const graph = JSON.parse(script)["@graph"] ?? [];
  const menu = graph.find((node) => node["@type"] === "Menu");
  if (!menu) throw new Error("Aventino Menu node was not found.");
  const index = new Map();
  for (const surface of menu.hasMenuSection ?? []) {
    for (const section of surface.hasMenuSection ?? []) {
      for (const item of section.hasMenuItem ?? []) {
        index.set(`${surface.name}|${section.name}|${item.name}`, {
          surface: surface.name,
          section: section.name,
          name: item.name,
          description: clean(item.description) || null,
        });
      }
    }
  }
  return index;
}

function finalizeDefinition(definition, index, sourceIndex) {
  const presentations = definition.refs.map((ref) => {
    const source = sourceIndex.get(ref);
    if (!source) throw new Error(`Missing current Aventino source presentation ${ref}.`);
    return source;
  });
  if (definition.id === "pasta-al-zozzone") {
    presentations.push({
      surface: "Happy Hour",
      section: "A.S.A.P. Hour",
      name: "PASTA AL ZOZZONE",
      description: definition.description,
    });
  }
  const description = definition.description ?? presentations[0]?.description ?? null;
  const linkedPositive = linkedLabelIds.has(definition.id);
  const sourceUrls = definition.linkedOnly
    ? [aventinoSourceUrls.toast]
    : linkedPositive
      ? [aventinoSourceUrls.menu, aventinoSourceUrls.toast]
      : [aventinoSourceUrls.menu];
  const allergens = orderedAllergens(definition.allergens);
  const allergenSourceType = allergens.length === 0
    ? "unavailable"
    : linkedPositive
      ? "restaurant-linked-product-allergen-section"
      : "official-ingredients";
  return {
    auditItemKey: `${index + 1}:${definition.id}`,
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description,
    ingredientsText: description,
    imageUrl: null,
    isConfigurable: [
      "gelato-selection",
      "gelato-e-sorbetto",
      "pasta-al-zozzone",
    ].includes(definition.id),
    allergens,
    mayContain: [],
    allergenSourceType,
    sourceType: definition.linkedOnly
      ? "restaurant-linked-toast-menu"
      : linkedPositive
        ? "restaurant-issued-and-linked-menu"
        : "restaurant-issued-json-ld-menu",
    sourceUrls,
    sourceSummary: allergenSourceType === "unavailable"
      ? "The current source does not provide enough direct ingredient or affirmative allergen detail for this formulation. Allergen status remains unavailable."
      : linkedPositive
        ? "Restaurant-issued ingredient text and the restaurant-linked Toast menu's partial affirmative labels were reconciled for this matching formulation. Missing labels are not negative evidence."
        : "Direct positive ingredients or unavoidable identities from the current restaurant-issued menu are represented as partial ingredient evidence; this is not a complete allergen matrix.",
    evidence: [
      ...presentations.map((presentation) => ({
        sourceKind: "restaurant-issued-menu-text",
        sourceUrl: aventinoSourceUrls.menu,
        text: `${presentation.surface} — ${presentation.section}: ${presentation.name}; ${presentation.description ?? ""}`,
      })),
      ...(linkedPositive || definition.linkedOnly
        ? [{
            sourceKind: "restaurant-linked-product-allergen-section",
            sourceUrl: aventinoSourceUrls.toast,
            text: `Affirmative linked-menu review for ${definition.name}: ${allergens.join(", ") || "no direct label"}.`,
          }]
        : []),
    ],
    presentations,
    variantGroup: presentations.length > 0
      ? presentations.map((presentation) => `${presentation.surface} — ${presentation.section}`).join("; ")
      : "Restaurant-linked Toast menu",
  };
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
  const snapshot = await buildAventinoAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${aventinoRestaurantId}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    linkedPositiveCount: snapshot.linkedPositiveCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
