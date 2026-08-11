import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAma = "ama-dc";
export const sourceUrlsAma = Object.freeze({
  home: "https://www.amarestaurant.bar/",
  caffe: "https://www.amarestaurant.bar/caffe-menu",
  lunchDinner: "https://www.amarestaurant.bar/lunchanddinner",
  brunch: "https://www.amarestaurant.bar/ama-brunch",
  aperitivo: "https://www.amarestaurant.bar/aperitivo-hour",
  order: "https://order.toasttab.com/online/ama-dc",
  sitemap: "https://www.amarestaurant.bar/sitemap.xml",
  menuSitemap: "https://www.amarestaurant.bar/restaurants-menu-sitemap.xml",
});

const artifactRoot = `data/restaurant-verification/artifacts/${restaurantIdAma}`;
const sourceArtifacts = Object.freeze({
  caffe: `${artifactRoot}/official-caffe-menu.html`,
  lunchDinner: `${artifactRoot}/official-lunch-dinner-menu.html`,
  brunch: `${artifactRoot}/official-brunch-menu.html`,
});

const expectedSourceNames = Object.freeze({
  caffe: [
    "Caffè", "CAPPUCINO", "Macchiato", "Marocchino", "Caffè Americano", "Caffè Latte",
    "Caffè Corretto", "Bicerin", "Ama's Tea Program", "cioccolato Caldo",
    "Ama's Signature Bone Broth", "Bone Broth Hot Chocolate", "Chaga Chai Latte",
    "autonomy smart matcha latte", "Caffè Freddo", "CAPPUCINO Freddo", "latte Freddo",
    "shakerato", "zabaglione shakerato freddo", "AFFOGATO", "Spremuta", "ZP Libations",
    "cornetto vuoto (V)", "cornetto ripieno (V)", "Leafy green Frittata (V) (GF)",
    "contadino frittata (GF)", "Torta di Riso (V)", "Farinata (VG) (GF)",
    "Parfait (V) (GF)", "Torta del Giorno (V) (AGF)", "Cantucci (V) (DF)",
    "Focaccia Genovese (VG) (DF)",
  ],
  lunchDinner: [
    "Farinata (GF) (VG) (DF)", "Focaccia di Formaggio (V)", "Fügassa (VG) (DF)",
    "Ancient Grain Sourdough Crostini (AGF)", "Gnocco Fritto", "Mondeghili Polpette",
    "Fior di Zucca (GF) (V)", "Rösti (GF)", "Knödel mit Krautsalat", "Fritto Misto (DF)",
    "Vitello Tonnato (GF) (DF)", "Carpaccio (GF) (ADF)", "Tartare di Salmone (GF) (DF)",
    "Insalata Verde (AVG) (DF) (GF)", "Finocchio (V) (AVG) (GF)",
    "Barbabietole (V) (AVG) (ADF)(GF)", "Spaghetti al Pomodoro (V) (AVG) (AGF*)",
    "Borage Lasagna con Ragù alla Bolognese", "Raviolini al Tocco",
    "Trofie di Castagne al Pesto (V) (AGF*)", "Pici con Ragù di Cinghiale (AGF*)",
    "Schlutzkrapfen (V)", "Paccheri con Sugo di Mare (AGF*)", "Pasta Fagioli (VG) (DF) (AGF*)",
    "BiSTECCA (GF)", "Vitello alla Milanese (GF) (DF)", "Agnello (GF) (DF)",
    "Pesce (GF) (DF)", "Pollo Arrosto al Forno (GF) (DF)", "Coniglio (aGF) (DF)",
    "Patate al Forno (VG) (GF)", "Funghi in Agrodolce (GF) (VG) (DF)",
    "Sauerkraut (GF) (VG) (DF)", "Erbe in Padella (VG) (GF)",
  ],
  brunch: [
    "Farinata", "Focaccia di Formaggio", "Fügassa", "Insalata Verde", "Barbabietole",
    "Finocchio", "Protein Add on", "Affettati & Formaggio", "Crostini", "Speck Carbonara",
    "Spaghetti al Pomodoro (V)(AGF)", "Trenette con Pesto Genovese (V)(AGF)",
    "Raviolini al Tocco", "Can Also be served on", "Buffalo Mozzarella (V)",
    "​Prosciutto Cotto", "Mortadella", "Prosciutto San Daniele", "Sbriciolona", "Pesce",
    "Bistecca", "Vitello alla Milanese", "Minestrone", "Sauerkraut", "Frittata", "Parfait",
    "Uova in Tegame", "Rösti", "Cornetti", "Torte del Giorno", "Cantucci", "TIRAMISU",
    "Gelato", "Kaisershmarrn",
  ],
});

const excludedRows = new Set([
  normalize("Caffè Corretto"),
  normalize("Protein Add on"),
  normalize("Can Also be served on"),
]);

const displayNames = new Map([
  [normalize("CAPPUCINO"), "Cappuccino"],
  [normalize("cioccolato Caldo"), "Cioccolato Caldo"],
  [normalize("autonomy smart matcha latte"), "Autonomy Smart Matcha Latte"],
  [normalize("CAPPUCINO Freddo"), "Cappuccino Freddo"],
  [normalize("latte Freddo"), "Latte Freddo"],
  [normalize("shakerato"), "Shakerato"],
  [normalize("zabaglione shakerato freddo"), "Zabaglione Shakerato Freddo"],
  [normalize("AFFOGATO"), "Affogato"],
  [normalize("cornetto vuoto"), "Cornetto Vuoto"],
  [normalize("cornetto ripieno"), "Cornetto Ripieno"],
  [normalize("Leafy green Frittata"), "Leafy Green Frittata"],
  [normalize("contadino frittata"), "Contadino Frittata"],
  [normalize("BiSTECCA"), "Bistecca"],
  [normalize("TIRAMISU"), "Tiramisu"],
  [normalize("Kaisershmarrn"), "Kaiserschmarrn"],
  [normalize("Torte del Giorno"), "Torta del Giorno"],
  [normalize("Focaccia Genovese"), "Fügassa"],
]);

const configurableNames = new Set([
  "Cioccolato Caldo", "Bone Broth Hot Chocolate", "Chaga Chai Latte", "Affogato",
  "Cornetto Ripieno", "Fügassa", "Ancient Grain Sourdough Crostini", "Torta del Giorno",
  "Affettati & Formaggio", "Crostini", "Cornetti", "Gelato",
].map(normalize));

const signalOverrides = new Map(Object.entries({
  "Cappuccino": ["milk"],
  "Macchiato": ["milk"],
  "Marocchino": ["milk"],
  "Caffè Latte": ["milk"],
  "Bicerin": ["milk"],
  "Autonomy Smart Matcha Latte": ["tree-nut"],
  "Cappuccino Freddo": ["milk"],
  "Latte Freddo": ["milk"],
  "Zabaglione Shakerato Freddo": ["milk"],
  "Affogato": ["milk"],
  "Whey Lemonade": ["milk"],
  "Cornetto Vuoto": ["wheat", "gluten"],
  "Cornetto Ripieno": ["wheat", "gluten"],
  "Leafy Green Frittata": ["milk", "egg"],
  "Contadino Frittata": ["milk", "egg"],
  "Torta di Riso": ["milk", "egg", "wheat", "gluten"],
  "Parfait": ["milk"],
  "Cantucci": ["tree-nut", "wheat", "gluten"],
  "Fügassa": ["wheat", "gluten"],
  "Focaccia di Formaggio": ["milk", "wheat", "gluten"],
  "Ancient Grain Sourdough Crostini": ["wheat", "gluten"],
  "Gnocco Fritto": ["wheat", "gluten"],
  "Mondeghili Polpette": ["tree-nut"],
  "Fior di Zucca": ["milk", "tree-nut"],
  "Rösti (Lunch & Dinner)": ["milk", "fish"],
  "Knödel mit Krautsalat": ["wheat", "gluten"],
  "Fritto Misto": ["wheat", "gluten"],
  "Vitello Tonnato": ["fish"],
  "Carpaccio": ["milk"],
  "Tartare di Salmone": ["fish"],
  "Insalata Verde": ["fish"],
  "Finocchio": ["milk"],
  "Barbabietole": ["milk", "tree-nut"],
  "Spaghetti al Pomodoro": ["wheat", "gluten"],
  "Borage Lasagna con Ragù alla Bolognese": ["milk", "wheat", "gluten"],
  "Raviolini al Tocco": ["wheat", "gluten"],
  "Trofie di Castagne al Pesto": ["tree-nut", "wheat", "gluten"],
  "Pici con Ragù di Cinghiale": ["wheat", "gluten"],
  "Schlutzkrapfen": ["milk", "wheat", "gluten"],
  "Paccheri con Sugo di Mare": ["wheat", "gluten", "fish", "shellfish"],
  "Pasta Fagioli": ["wheat", "gluten"],
  "Bistecca (Lunch & Dinner)": ["milk"],
  "Pesce": ["fish"],
  "Coniglio": ["wheat", "gluten"],
  "Affettati & Formaggio": ["wheat", "gluten"],
  "Crostini": ["wheat", "gluten"],
  "Speck Carbonara": ["egg"],
  "Trenette con Pesto Genovese": ["tree-nut", "wheat", "gluten"],
  "Buffalo Mozzarella": ["milk", "wheat", "gluten"],
  "Prosciutto Cotto": ["milk", "wheat", "gluten"],
  "Mortadella": ["milk", "wheat", "gluten"],
  "Prosciutto San Daniele": ["milk", "wheat", "gluten"],
  "Sbriciolona": ["milk", "wheat", "gluten"],
  "Frittata": ["egg"],
  "Uova in Tegame": ["egg"],
  "Cornetti": ["wheat", "gluten"],
  "Tiramisu": ["milk"],
}).map(([name, signals]) => [normalize(name), signals]));

export async function buildAmaAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const sourceRows = new Map();
  for (const [sourceKey, artifact] of Object.entries(sourceArtifacts)) {
    const $ = cheerio.load(await readFile(artifact, "utf8"));
    const rows = $(".wixui-repeater__item").map((_index, element) => {
      const lines = $(element).find("h1,h2,h3,h4,h5,h6,p")
        .map((_lineIndex, line) => clean($(line).text())).get().filter(Boolean);
      return { sourceKey, lines };
    }).get();
    assertSourceManifest(sourceKey, rows);
    sourceRows.set(sourceKey, rows);
  }

  const itemsByName = new Map();
  let auditOrder = 0;
  for (const sourceKey of ["caffe", "lunchDinner", "brunch"]) {
    for (const [sourceIndex, raw] of sourceRows.get(sourceKey).entries()) {
      const strippedName = stripDietaryMarkers(raw.lines[0]);
      if (excludedRows.has(normalize(strippedName))) continue;

      if (normalize(strippedName) === normalize("ZP Libations")) {
        for (const beverageName of raw.lines.slice(1)) {
          addPresentation(itemsByName, {
            auditOrder: auditOrder++,
            canonicalName: beverageName,
            category: "Caffè • Cold Nonalcoholic Drinks",
            description: beverageName,
            rawText: raw.lines.join(" | "),
            sourceKey,
            sourceName: beverageName,
          });
        }
        continue;
      }

      addPresentation(itemsByName, {
        auditOrder: auditOrder++,
        canonicalName: canonicalName(sourceKey, strippedName),
        category: categoryFor(sourceKey, sourceIndex),
        description: raw.lines.slice(1).join(" • ") || null,
        rawText: raw.lines.join(" | "),
        sourceKey,
        sourceName: strippedName,
      });
    }
  }

  const items = [...itemsByName.values()]
    .map(finalizeItem)
    .sort((left, right) => left.auditOrder - right.auditOrder)
    .map(({ auditOrder: _auditOrder, ...item }) => item);
  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((item) => normalize(item.name)).sort().join("\n"))
    .digest("hex");

  if (items.length !== 84 || presentationCount !== 100 || new Set(items.map((item) => item.id)).size !== 84) {
    throw new Error(`Ama current manifest changed: ${items.length} formulations and ${presentationCount} presentations.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAma,
    retrievedAt,
    sourceUrls: [sourceUrlsAma.caffe, sourceUrlsAma.lunchDinner, sourceUrlsAma.brunch],
    itemCount: items.length,
    presentationCount,
    itemNameFingerprint,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "Ama publishes current restaurant-issued Caffè, Lunch & Dinner, and Brunch menu descriptions, but no complete recipe-level allergen matrix or item-level cross-contact disclosure. Positive signals are limited to fixed named ingredients and unavoidable named formats. Dietary labels, optional milks or fillings, selectable variants, daily selections, culinary assumptions, and absent recipes are not promoted into negative or cross-contact claims; unsupported rows remain unavailable.",
    items,
  };
}

function assertSourceManifest(sourceKey, rows) {
  const expected = expectedSourceNames[sourceKey];
  if (rows.length !== expected.length) {
    throw new Error(`Ama ${sourceKey} source changed: expected ${expected.length} rows, found ${rows.length}.`);
  }
  for (const [index, expectedName] of expected.entries()) {
    const actualName = rows[index]?.lines?.[0];
    if (normalize(actualName) !== normalize(expectedName)) {
      throw new Error(`Ama ${sourceKey} row ${index + 1} changed: expected ${expectedName}, found ${actualName}.`);
    }
  }
}

function canonicalName(sourceKey, sourceName) {
  const corrected = displayNames.get(normalize(sourceName)) ?? sourceName;
  if (normalize(corrected) === normalize("Rösti")) {
    return sourceKey === "lunchDinner" ? "Rösti (Lunch & Dinner)" : "Rösti (Brunch)";
  }
  if (normalize(corrected) === normalize("Bistecca")) {
    return sourceKey === "lunchDinner" ? "Bistecca (Lunch & Dinner)" : "Bistecca (Brunch)";
  }
  return corrected;
}

function addPresentation(itemsByName, presentation) {
  const key = normalize(presentation.canonicalName);
  let item = itemsByName.get(key);
  if (!item) {
    item = {
      auditOrder: presentation.auditOrder,
      aliases: [],
      category: presentation.category,
      description: presentation.description,
      name: presentation.canonicalName,
      presentations: [],
      sourceUrls: new Set(),
    };
    itemsByName.set(key, item);
  }
  if (presentation.description && (!item.description || presentation.description.length > item.description.length)) {
    item.description = presentation.description;
  }
  const serviceVariant = /\((?:Lunch & Dinner|Brunch)\)$/.test(item.name);
  if (!serviceVariant && normalize(presentation.sourceName) !== normalize(item.name) &&
      !item.aliases.some((alias) => normalize(alias) === normalize(presentation.sourceName))) {
    item.aliases.push(presentation.sourceName);
  }
  const sourceUrl = sourceUrlFor(presentation.sourceKey);
  item.presentations.push({
    category: presentation.category,
    description: presentation.description,
    rawText: presentation.rawText,
    sourceName: presentation.sourceName,
    sourceUrls: [sourceUrl],
  });
  item.sourceUrls.add(sourceUrl);
}

function finalizeItem(item) {
  const allergens = orderedAllergens(signalOverrides.get(normalize(item.name)) ?? []);
  return {
    auditOrder: item.auditOrder,
    auditItemKey: `${item.auditOrder + 1}:${slugify(item.name)}`,
    id: slugify(item.name),
    name: item.name,
    category: item.category,
    description: item.description,
    ingredientsText: item.description,
    imageUrl: null,
    isConfigurable: configurableNames.has(normalize(item.name)),
    aliases: item.aliases,
    presentations: item.presentations,
    sourceUrls: [...item.sourceUrls],
    sourceType: "restaurant-issued-wix-menu",
    allergens,
    mayContain: [],
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
  };
}

function categoryFor(sourceKey, index) {
  if (sourceKey === "caffe") {
    if (index <= 8) return "Caffè • Hot Drinks";
    if (index <= 13) return "Caffè • Seasonal Specialties";
    if (index <= 21) return "Caffè • Cold Drinks";
    return "Caffè • To Eat";
  }
  if (sourceKey === "lunchDinner") {
    if (index <= 3) return "Pane";
    if (index <= 7) return "Stuzzichini";
    if (index <= 12) return "Antipasti";
    if (index <= 15) return "Insalate";
    if (index <= 23) return "Primi";
    if (index <= 29) return "Secondi";
    return "Contorni";
  }
  if (index <= 2) return "Brunch • Focaccia";
  if (index <= 6) return "Brunch • Insalate";
  if (index <= 8) return "Brunch • Stuzzichini";
  if (index <= 13) return "Brunch • Primi";
  if (index <= 18) return "Brunch • Focaccia Farcita";
  if (index <= 21) return "Brunch • Secondi";
  if (index <= 27) return "Brunch • Contorni";
  return "Brunch • Dolci";
}

function sourceUrlFor(sourceKey) {
  return sourceKey === "caffe" ? sourceUrlsAma.caffe
    : sourceKey === "lunchDinner" ? sourceUrlsAma.lunchDinner
      : sourceUrlsAma.brunch;
}

function stripDietaryMarkers(value) {
  return clean(value).replace(/\s*\((?:AGF\*?|ADF|AVG|GF|DF|VG|V)\)/gi, "").trim();
}

function clean(value) {
  return String(value ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&amp;/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAmaAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAma}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
