import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAlaBethesda = "ala-bethesda-dc-metro";
export const sourceUrlsAlaBethesda = Object.freeze({
  home: "https://www.aladc.com/",
  menu: "https://order.toasttab.com/online/ala-bethesda",
});

const currentRows = Object.freeze([
  row("COLD MEZZE", "HUMMUS", "Pickled dates, crispy fritters"),
  row("COLD MEZZE", "BABA GHANOUSH", "Charred eggplant, tahini, chermoula"),
  row("COLD MEZZE", "SKORDALIA", "Potatoes, garlic, chives, Urfa spice, walnut"),
  row("COLD MEZZE", "ZA'ATAR LABNEH", "Labneh, home made za'atar, dill oil"),
  row("COLD MEZZE", "MIXED SPREADS", "Small portions of each spread (Hummus, Baba Ghanoush, Kousayyeh, Za'atar Labneh)"),
  row("COLD MEZZE", "DUCK PROSCIUTTO", "Cured Duck Prosciutto, Crispy lavash, orange, golden shatta (mild spicy), Turkish Coffee"),
  row("COLD MEZZE", "TUNA TARTARE DOLMADES", "Dolmades, yellowfin tuna, Urfa pepper, mustard, garlic, yogurt"),
  row("COLD MEZZE", "HALF AGED BASTURMA", "Basturma spice, beef tenderloin slices, aragula, parmesan, qiraz harissa"),
  row("COLD MEZZE", "SALT & MELON", "Watermelon, feta, sesame, tomato, cucumber, watercress, herbs"),
  row("COLD MEZZE", "FATTOUSH", "Roasted tamarind infused apricot, tomato, cucumber, watercress, herbs, crispy lavash"),
  row("COLD MEZZE", "SALMON KIBBEH NAYAH", "House-smoked salmon tartare, bulgur, hot Urfa pepper, radish, pickles"),
  row("COLD MEZZE", "PITA (2 pc)", "2 pieces of famous pita bread"),
  row("HOT MEZZE", "KECHI", "Goat cheese, za'atar, preserved fig, pita crumbs"),
  row("HOT MEZZE", "HALLOUMI WRAPS", "Cyprus Halloumi, phyllo dough, quince preserve, pistachio dukkah"),
  row("HOT MEZZE", "FALAFEL", "Falafel, herb seeds, pickles"),
  row("HOT MEZZE", "DOLMA BI LAHM", "Grape leaves stuffed rice, minced beef, herbs, yogurt, cherry, toum"),
  row("HOT MEZZE", "BATATA HARA", "Fried potatoes, harissa, toum"),
  row("HOT MEZZE", "MANTI", "Mini beef dumplings, beef stock, labneh, harissa, fried fresh mint"),
  row("HOT MEZZE", "KARANAB", "Fried Brussels sprouts, currants, toum, walnuts"),
  row("HOT MEZZE", "CARROT MAHMAS", "Tamarind, tahini-labneh, chermoula, feta, pistachio dukkah"),
  row("HOT MEZZE", "GARIDES KEBAB", "Grilled tiger shrimp, parsley tahini pesto, grilled lettuce, seven spice"),
  row("HOT MEZZE", "TAWOOK SHISH KEBAB", "Grilled chicken thigh cubes, spicy amba"),
  row("HOT MEZZE", "GOLDEN CAULIFLOWER", "Fried cauliflower, turmeric, cloves, dates, golden shatta (mild spicy)"),
  row("HOT MEZZE", "BASTURMA PIDE (flatbread)", "Cured beef tenderloin, Kashkaval cheese, parsley pesto, aragula, parmesan"),
  row("HOT MEZZE", "SOUJOUK PIDE (flatbread)", "Turkish butcher sausage, Kashkaval cheese, hot Urfa pepper honey"),
  row("HOT MEZZE", "ZA’ATAR PIDE (flatbread)", "Palestinian Za’atar, Kashkaval cheese, labneh, thyme oil"),
  row("HOT MEZZE", "MUJADARA", "Rice, green lentils, labneh, crispy onions, seven spices"),
  row("LARGE PLATES", "ADANA KEBAB", "Minced rib-eye, Labneh, harissa, onion, lavash"),
  row("LARGE PLATES", "MUSHROOM SHISH KEBAB", "Marinated portobello mushroom cubes, pea salad, eggplant sogulme"),
  row("LARGE PLATES", "TARKHUN LAVRAKI", "Butterflied wild-caught Aegean branzino cooked in paper, fresh tarragon, fresh garlic scapes, bay leaves, lemon"),
  row("LARGE PLATES", "FENNEL TAWOOK", "Half chicken, fennel seeds, toum roasted fennel, salad, grilled carrot"),
  row("LARGE PLATES", "RAS-EL HANOUT SHORT RIBS", "Braised short ribs, ras-el hanout, mashed tarragon potatoes"),
  row("SWEETS", "ANTEP BAKLAVA", "Pistachio baklava, white chocolate dukkah"),
  row("SWEETS", "KUNAFA", "Sweet cheese, rose petals"),
  row("SWEETS", "LAYALI LUBNAN", "Semolina, oat milk, pistachio, jallab (rose infused date-tamarind molasses)"),
]);

export function buildAlaBethesdaAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = currentRows.map((sourceRow, index) => {
    const allergens = publishedSignalsAlaBethesda(sourceRow);
    return {
      auditItemKey: `${index + 1}:${slugify(sourceRow.category)}:${slugify(sourceRow.name)}`,
      id: `${slugify(sourceRow.category)}-${slugify(sourceRow.name)}`,
      name: sourceRow.name,
      category: sourceRow.category,
      description: sourceRow.description,
      ingredientsText: sourceRow.description,
      imageUrl: null,
      isConfigurable: false,
      presentations: [{ category: sourceRow.category }],
      sourceUrls: [sourceUrlsAlaBethesda.menu],
      sourceType: "restaurant-linked-ordering-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  if (items.length !== 35 || new Set(items.map((item) => item.id)).size !== 35) {
    throw new Error("ala Bethesda current Toast menu manifest changed.");
  }
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAlaBethesda,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAlaBethesda),
    presentationCount: items.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount,
    unavailableAllergenCount: items.length - ingredientSignalCount,
    sourceWarning: "ala Bethesda's restaurant-linked Toast menu publishes current names and selected descriptions but no complete allergen matrix, complete recipes, or cross-contact policy. Toast's vegan and gluten-free labels are retained as source context but are not converted into negative allergen claims. Positive signals use fixed published ingredients and unavoidable named formats only.",
    items,
  };
}

export function publishedSignalsAlaBethesda(item) {
  const text = normalizeText(`${item.name} ${item.description}`);
  const signals = [];
  if (/\b(?:labneh|yogurt|parmesan|feta|goat cheese|halloumi|kashkaval cheese|sweet cheese|white chocolate)\b/.test(text)) signals.push("milk");
  if (/\b(?:walnuts?|pistachio)\b/.test(text)) signals.push("tree-nut");
  if (/\b(?:lavash|bulgur|pita|crumbs?|phyllo|flatbread|pide|dumplings?|baklava|semolina)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:tuna|salmon|branzino)\b/.test(text)) signals.push("fish");
  if (/\bshrimp\b/.test(text)) signals.push("shellfish");
  if (/\b(?:tahini|sesame)\b/.test(text)) signals.push("sesame");
  if (/\bmustard\b/.test(text)) signals.push("mustard");
  return orderedUnique(signals);
}

function row(category, name, description) {
  return { category, name, description };
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
  const snapshot = buildAlaBethesdaAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAlaBethesda}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
