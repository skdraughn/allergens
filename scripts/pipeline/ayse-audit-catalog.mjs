import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const ayseRestaurantId = "osm-ay-e-meze-lounge-13134929927";
export const ayseSourceUrls = Object.freeze({
  home: "https://aysemeze.com/",
  main: "https://aysemeze.com/wp-content/uploads/2026/05/AY-MENU.pdf",
  lunch: "https://aysemeze.com/wp-content/uploads/2026/07/king-farm-express-lunch-menu.pdf",
  kids: "https://aysemeze.com/wp-content/uploads/2026/03/KIDS-MENU.pdf",
  brunch: "https://aysemeze.com/wp-content/uploads/2026/06/AY-Brunch-Menu.pdf",
  dessert: "https://aysemeze.com/wp-content/uploads/2026/05/AyDessertMenu.pdf",
  happyHour: "https://aysemeze.com/wp-content/uploads/2026/05/AY-Happy-Hour-Menu.pdf",
  drinks: "https://aysemeze.com/wp-content/uploads/2026/05/AY-DRINKMENU.pdf",
  specials: "https://aysemeze.com/wp-content/uploads/2026/07/7.15-dinner.jpg",
  toast: "https://order.toasttab.com/online/ayse",
});

export const ayseSourceManifest = Object.freeze({
  home: "9ca7940d5decc821c3abb5f7304dc9aa3731cfaec0a3ba4be5ea993fabafeb05",
  main: "0f15c2860275b99f4f3e87212f719b48f654c3f178282dd6c518c54cd223e3b1",
  lunch: "535a5425126f218d58358336317dd9445fd902cbbdfb443a434fe3903605af54",
  kids: "66ee6d2a028ff8bd07ece19999403aedf9e20b25d895fff8506a4fb9614c1f29",
  brunch: "8b50228435d83e3b474dd81d7b4f49f6c01cffaf7312aed251e2897b5c7cde70",
  dessert: "c6a62e077e9274fff7213a68b2fee562ec9af1c3192304902dbf05386d058dcc",
  happyHour: "0a69e90083e1ecf3b029cb9547063acbd8da1dbd209b3a8d476d47a752951474",
  drinks: "146746c74c35b837500dbdcc79117069b7463ccc3ecd0999edc19f7f3c5626c6",
  specials: "6d01aab396c72e6150db0abf2cd5acaa1497500d0e92e691be6c4caf2ef12b1c",
  toastCapture: "5f46d4a97cd3df2d99e958187c1a5978dcf8f8bf18f4aeea3b615e83d188b773",
});

const toastArtifact = "data/scraped/raw/osm-ay-e-meze-lounge-13134929927/2026-06-26/5f46d4a97cd3df2d99e958187c1a5978dcf8f8bf18f4aeea3b615e83d188b773.html";
const allergenOrder = ["milk", "egg", "tree-nut", "peanut", "wheat", "gluten", "soy", "fish", "shellfish", "sesame", "mustard"];
const linkedPositiveIds = new Set(["baklava", "side-ayse-aioli", "side-garlic-spinach-yogurt", "side-tzatziki"]);
const linkedIngredientIds = new Set(["strawberry-sundae"]);
const forcedUnavailable = new Set([
  "gluten-free-pita", "artichokes", "kids-ayse-chicken-nuggets", "lamb-chops",
  "pomegranate-sorbet", "raw-vegetables", "red-lentil-soup", "side-ayse-salad",
  "side-basmati-rice", "side-fingerling-potatoes", "side-fries", "side-hot-sauce",
  "side-marinara", "side-mashed-potatoes", "turkish-coffee-gelato", "chocolate-gelato",
  "mastic-gelato", "vanilla-gelato", "salted-caramel-gelato", "meatball",
]);

const allergenOverrides = new Map(Object.entries({
  "all-4-dips": ["milk", "tree-nut", "sesame"], "ayse-salad": ["milk", "wheat", "gluten"],
  baklava: ["milk", "tree-nut", "wheat", "gluten"], "beef-short-rib": [],
  bianca: ["milk", "wheat", "gluten"], bronzino: ["milk", "tree-nut", "fish"],
  calamari: ["milk", "shellfish"], "cheese-cigars": ["milk", "wheat", "gluten"],
  "chicken-shawarma": ["milk", "wheat", "gluten"], "chocolate-evoo-cake": ["tree-nut"],
  "eggplant-parmesan": ["milk"], "fettuccine-alfredo": ["milk", "egg", "wheat", "gluten"],
  "filet-mignon-kebab": ["milk"], "fried-green-tomatoes": ["milk", "egg", "wheat", "gluten"],
  funghi: ["milk", "wheat", "gluten"], "grape-leaves": ["milk", "tree-nut"],
  "grilled-whole-bronzini": ["milk", "fish"], "hummus-bowl": ["milk", "tree-nut", "wheat", "gluten", "sesame"],
  "kids-cheese-pizza": ["milk", "wheat", "gluten"], "kids-smily-face-pepperoni-pizza": ["milk", "wheat", "gluten"],
  kunefe: ["milk", "tree-nut", "wheat", "gluten"], lahmacun: ["wheat", "gluten"],
  "lamb-gyro": ["milk", "wheat", "gluten"], manti: ["milk", "wheat", "gluten"],
  margherita: ["milk", "wheat", "gluten"], marinara: ["wheat", "gluten"],
  "mixed-grille": ["milk"], mykonos: ["milk", "wheat", "gluten"],
  "nezih-pizza": ["milk", "wheat", "gluten"], nutella: [],
  "orange-yogurt-cake": ["milk", "tree-nut"], "p-e-i-mussels": ["milk", "wheat", "gluten", "shellfish"],
  pepperoni: ["milk", "wheat", "gluten"], polpettine: ["milk", "wheat", "gluten"],
  salsiccia: ["milk", "wheat", "gluten"], scallops: ["milk", "shellfish"],
  "spaghetti-meatballs": ["milk", "wheat", "gluten"], "spaghetti-bolognese": ["milk", "wheat", "gluten"],
  spanikopita: ["milk", "wheat", "gluten"], tiramisu: ["milk", "wheat", "gluten"],
  vedge: ["milk", "wheat", "gluten"], versace: ["milk", "wheat", "gluten"],
  "zucchini-cakes": ["milk"], "strawberry-sundae": ["milk", "wheat", "gluten"],
  "side-tzatziki": ["milk"],
  "cream-of-tomato-soup": [], "cig-kofte": ["wheat", "gluten"],
  "orecchiette-pasta": ["milk", "wheat", "gluten"], "tenderloin-supreme": ["milk", "wheat", "gluten"],
  "frutti-di-mare": ["wheat", "gluten", "shellfish"],
}));

export async function buildAyseAuditSnapshot({ retrievedAt = "2026-07-15T21:00:00.000Z", toastHtml } = {}) {
  const html = toastHtml ?? await readFile(toastArtifact, "utf8");
  const digest = createHash("sha256").update(html).digest("hex");
  if (digest !== ayseSourceManifest.toastCapture) throw new Error(`AYŞE Toast artifact hash changed: ${digest}`);
  const toastItems = parseToast(html)
    .filter((item) => !["crabcake-fritters", "new-york-strip-steak"].includes(item.id))
    .map((item) => item.id === "strawberry-rhubarb-sundae"
      ? { ...item, id: "strawberry-sundae", name: "Strawberry Sundae", description: "vanilla gelato / strawberry topping / whipped cream / pizzelle cookie", sourceUrls: [ayseSourceUrls.specials, ayseSourceUrls.toast], sourceKind: "restaurant-issued-and-linked-menu" }
      : item.id === "soup-of-the-day"
        ? { ...item, id: "cream-of-tomato-soup", name: "Cream of Tomato Soup", description: "current daily cream of tomato soup", sourceUrl: ayseSourceUrls.specials, sourceUrls: undefined, sourceKind: "restaurant-issued-specials-menu" }
        : item.id === "linguini-pomodoro"
          ? { ...item, id: "linguine-pomodoro", name: "Linguine Pomodoro" }
        : item)
    .map(finalize);
  for (const row of [
    s("cig-kofte", "Cig Kofte", "Daily Specials", "bulgur / tomato / pepper / spices"),
    s("orecchiette-pasta", "Orecchiette Pasta", "Daily Specials", "orecchiette / cheese / seasonal preparation"),
    s("tenderloin-supreme", "Tenderloin Supreme", "Daily Specials", "beef tenderloin / dairy sauce / bread component"),
    s("frutti-di-mare", "Frutti di Mare", "Daily Specials", "shellfish / pasta / tomato"),
    s("meatball", "Meatball", "Sides", null, [], ayseSourceUrls.toast, "restaurant-linked-toast-menu"),
  ]) toastItems.push(finalize(row));

  const staticItems = staticDefinitions().map(finalize);
  const items = [...toastItems, ...staticItems].map((item, index) => ({ ...item, auditItemKey: `${index + 1}:${item.id}` }));
  const counts = countSources(items);
  if (items.length !== 151 || new Set(items.map((item) => item.id)).size !== 151 || counts.official !== 109 || counts.linkedProduct !== 4 || counts.linkedIngredient !== 1 || counts.unavailable !== 37 || items.some((item) => item.mayContain.length)) {
    throw new Error(`AYŞE manifest changed: ${items.length} rows; ${counts.official} official, ${counts.linkedProduct} linked product, ${counts.linkedIngredient} linked ingredient, ${counts.unavailable} unavailable.`);
  }
  return {
    schemaVersion: 1, restaurantId: ayseRestaurantId, retrievedAt,
    sourceUrls: Object.values(ayseSourceUrls), sourceManifest: ayseSourceManifest,
    itemCount: items.length, categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: counts.official, linkedPositiveCount: counts.linkedProduct,
    linkedIngredientCount: counts.linkedIngredient,
    positiveDisclosureCount: counts.official + counts.linkedProduct + counts.linkedIngredient, unavailableAllergenCount: counts.unavailable,
    sourceWarning: "Current restaurant-issued service menus and the restaurant-linked Toast catalog provide partial affirmative ingredient evidence, not a complete allergen matrix or cross-contact policy. Missing terms are never negative evidence. Alcohol and modifier-only choices are excluded; materially different service formulations remain separate.",
    items,
  };
}

function parseToast(html) {
  const $ = cheerio.load(html); const seen = new Set(); const rows = [];
  $("[data-testid='menu-item-card']").each((_index, element) => {
    const href = $(element).find("a").first().attr("href");
    if (!href || seen.has(href)) return; seen.add(href);
    const name = clean($(element).find("h3").first().text());
    const id = toastId(name);
    const category = title(clean($(element).closest("section.menuSection").find("h2,h3").first().text()) || "Toast Menu");
    rows.push({
      id, name: title(name), category,
      description: clean($(element).find("[data-testid='item-content-description']").text()) || null,
      ...toastSource(category, id),
      imageUrl: $(element).find("img").first().attr("src") ?? null,
    });
  });
  return rows;
}

function staticDefinitions() {
  const main = ayseSourceUrls.main, brunch = ayseSourceUrls.brunch, lunch = ayseSourceUrls.lunch;
  return [
    s("saganaki", "Saganaki", "Main Menu", "flaming kefalograviera / pita", ["milk", "wheat", "gluten"], main),
    s("affogato", "Affogato", "Dessert", "espresso / gelato", [], ayseSourceUrls.dessert),
    ...[
      ["steak-eggs","Steak & Eggs",["milk","egg","wheat","gluten"],"filet mignon kebab / 3 eggs scrambled with cheddar / peppers and onions / Ayse home fries / house pita"],
      ["soujok-benedict","Soujok Benedict",["milk","egg","wheat","gluten"],"pita / tomato / arugula / soujok / sumac red onions / poached eggs / garlic yogurt / aleppo butter / home fries"],
      ["ayses-breakfast","Ayse’s Breakfast",["milk","egg","tree-nut","wheat","gluten"],"boiled eggs / feta / pastirima / salad / olives / grape leaves / warm pita / baklava-blueberry yogurt"],
      ["limoncello-pancakes","Limoncello Pancakes",["milk","wheat","gluten"],"blueberry-limoncello pancakes / lemon-whipped ricotta / white chocolate / butter"],
      ["lfc-french-toast","LFC French Toast",["milk","wheat","gluten","sesame"],"cinnamon french toast / fried chicken / tahini hot honey yogurt"],
      ["breakfast-pizza","Breakfast Pizza",["milk","egg","wheat","gluten"],"Neapolitan pizza crust / spinach-ricotta / mozzarella / scrambled eggs / bacon"],
      ["chicken-lavashadilla","Chicken Lavashadilla",["milk","wheat","gluten"],"toasted lavash / mozzarella / cheddar / chicken / bacon / garlic yogurt"],
      ["brunch-burger","Brunch Burger",["milk","egg","wheat","gluten"],"brioche bun / Ayse aioli / beef / cheddar / bacon / sunny egg"],
      ["greek-omelette","Greek Omelette",["milk","egg","wheat","gluten"],"farm eggs / spanikopita filling / feta / warm pita"],
      ["shrimp-n-grits","Shrimp N’ Grits",["milk","egg","shellfish"],"parmesan polenta / gulf shrimp / chardonnay butter / poached egg"],
      ["kids-brunch","Kid’s Brunch",["wheat","gluten"],"choice of scrambled eggs with toast or french toast or pancakes"],
      ["9-grain-toast","9 Grain Toast",["milk","wheat","gluten"],"grass fed butter / local jam"],
      ["greek-yogurt-brunch","Greek Yogurt",["milk","tree-nut","wheat","gluten"],"pistachio baklava / blueberries"],
      ["bacon-brunch","Bacon",[],"nitrate-free uncured smoked bacon"], ["ayse-home-fries","Ayse Home Fries",[],"peppers / onions / evoo / herbs"],
      ["short-stack","Short Stack",["wheat","gluten"],"two pieces french toast or pancakes / maple syrup"],
    ].map(([id,name,allergens,description]) => s(id,name,"Brunch",description,allergens,brunch)),
    ...[
      ["coffee-tea","Coffee / Tea",[]], ["cappuccino-latte","Cappuccino / Latte",["milk"]], ["espresso-double","Espresso / Double",[]],
      ["turkish-coffee","Turkish Coffee",[]], ["ghirardelli-hot-chocolate","Ghirardelli Hot Chocolate",[]],
    ].map(([id,name,allergens]) => s(id,name,"Hot Drinks",null,allergens,ayseSourceUrls.dessert)),
    ...[
      ["big-greek-salad","Big Greek Salad",["milk","wheat","gluten"],"romaine / arugula / tomatoes / cucumber / red onion / olives / feta / lavash chips"],
      ["lunch-hummus-bowl","Lunch Hummus Bowl",["milk","tree-nut","wheat","gluten","sesame"],"farro / hummus / beets / arugula / red onion / pistachios / feta"],
      ["todays-lunch-feature","Today’s Lunch Feature",[],"inquire with server for today's offering"],
      ["ayse-smashburger","Ayse Smashburger",["milk","egg","wheat","gluten"],"beef / brioche bun / cheddar / Ayse aioli"],
      ["falafelatbread","Falafelatbread",["milk","wheat","gluten","sesame"],"falafel / toasted pita / garlic yogurt / vegetables"],
      ["lunch-chicken-shawarma","Lunch Chicken Shawarma",["milk","wheat","gluten"],"pitaco / chicken / garlic yogurt / vegetables / feta"],
      ["old-school-red-or-white-pizza","Old School Red or White Pizza",["milk","wheat","gluten"],"red or white pizza / choice of toppings"],
      ["9-spiced-cauliflower","9 Spiced Cauliflower",["wheat","gluten","sesame"],"pitaco / cauliflower / green tahini / vegetables"],
    ].map(([id,name,allergens,description]) => s(id,name,"Express Lunch",description,allergens,lunch)),
    ...[
      ["happy-hour-hummus","Hummus",["wheat","gluten","sesame"],"hummus / warm pita"], ["chips-dip","Chips & Dip",["wheat","gluten"],"lavash chips / tomato-cucumber ezme"],
      ["cauliflower-shawarma","Cauliflower Shawarma",["wheat","gluten","sesame"],"green tahini / pickled red onions / zaatar pitaco"], ["happy-hour-lfc","LFC",["milk","sesame"],"fried chicken / hot honey tahini yogurt"],
      ["happy-mac","Happy Mac",["milk","wheat","gluten"],"penne mac and cheese"], ["napoletana-bread","Napoletana Bread",["milk","wheat","gluten"],"bread / evoo / herbs / pecorino / parmesan"],
      ["pistarros-meatballs","Pistarro’s Meatballs",["milk"],"meatballs / marinara / parmesan"], ["turkish-sliders","Turkish Sliders",["milk","wheat","gluten"],"kofte / red onion / tzatziki / pita"],
      ["feta-fries","Feta Fries",["milk","egg"],"fries / feta / Ayse aioli"], ["bowl-olives","Bowl O’Olives",[],"Turkish olives / evoo / lemon"],
    ].map(([id,name,allergens,description]) => s(id,name,"Happy Hour",description,allergens,ayseSourceUrls.happyHour)),
    ...["Pom Cucumber Spritz","Phony Negroni","Athletic Light (0.5%)","Athletic Hazy IPA (0.5%)","Guinness Zero (0.5%)"]
      .map((name) => s(toastId(name), name, "Nonalcoholic Drinks", null, [], ayseSourceUrls.drinks)),
  ];
}

function s(id, name, category, description, allergens, sourceUrl = ayseSourceUrls.specials, sourceKind = "restaurant-issued-menu") {
  return { id, name, category, description, explicitAllergens: allergens, sourceUrl, sourceKind };
}

function toastSource(category, id) {
  if (category === "Daily Specials") {
    return { sourceUrl: ayseSourceUrls.specials, sourceKind: "restaurant-issued-specials-menu" };
  }
  if (category === "Sides" || id === "vanilla-gelato") {
    return { sourceUrl: ayseSourceUrls.toast, sourceKind: "restaurant-linked-toast-menu" };
  }
  if (category === "Kids") {
    return { sourceUrl: ayseSourceUrls.kids, sourceKind: "restaurant-issued-kids-menu" };
  }
  if (category === "Desserts") {
    return id === "baklava"
      ? { sourceUrl: ayseSourceUrls.dessert, sourceUrls: [ayseSourceUrls.dessert, ayseSourceUrls.toast], sourceKind: "restaurant-issued-and-linked-menu" }
      : { sourceUrl: ayseSourceUrls.dessert, sourceKind: "restaurant-issued-dessert-menu" };
  }
  return { sourceUrl: ayseSourceUrls.main, sourceKind: "restaurant-issued-main-menu" };
}

function finalize(row) {
  const id = row.id; const allergens = ordered(row.explicitAllergens ?? allergenOverrides.get(id) ?? infer(row.name, row.description, id));
  const positive = allergens.length > 0; const linked = linkedPositiveIds.has(id); const linkedIngredient = linkedIngredientIds.has(id);
  return {
    id, name: row.name, category: row.category, description: row.description ?? null,
    ingredientsText: row.description ?? null, imageUrl: row.imageUrl ?? null,
    isConfigurable: ["todays-lunch-feature", "kids-brunch", "old-school-red-or-white-pizza"].includes(id),
    allergens, mayContain: [],
    allergenSourceType: !positive ? "unavailable" : linked ? "restaurant-linked-product-allergen-section" : linkedIngredient ? "restaurant-linked-menu-ingredients" : "official-ingredients",
    sourceType: row.sourceKind, sourceUrls: row.sourceUrls ?? [row.sourceUrl],
    sourceSummary: !positive ? "The current source does not publish enough direct affirmative allergen detail for this formulation; status remains unavailable." : "Only direct positive ingredients or unavoidable product identities are represented; this is not a complete allergen or cross-contact matrix.",
    evidence: (row.sourceUrls ?? [row.sourceUrl]).map((sourceUrl) => ({ sourceKind: row.sourceKind, sourceUrl, text: `${row.name}${row.description ? `: ${row.description}` : ""}` })),
    variantGroup: row.category,
  };
}

function infer(name, description, id) {
  if (forcedUnavailable.has(id)) return [];
  const text = `${name} ${description ?? ""}`.toLowerCase(); const found = new Set();
  if (/yogurt|feta|cheese|butter|cream|mozzarella|parmesan|ricotta|cheddar|labne|gelato|mascarpone|besciamella/.test(text)) found.add("milk");
  if (/\begg\b|aioli/.test(text)) found.add("egg");
  if (/walnut|pistachio|almond|pine nut/.test(text)) found.add("tree-nut");
  if (/pita|pitaco|flatbread|bread|yufka|phyllo|pasta|noodle|spaghetti|fettuccine|linguin|lasagna|penne|orecchiette|breadcrumb|garlic-toast|crostini|lavish|pizzelle|brioche|pizza/.test(text)) { found.add("wheat"); found.add("gluten"); }
  if (/salmon|sea bass|bronzino|anchov/.test(text)) found.add("fish");
  if (/shrimp|mussel|scallop|calamari|crab/.test(text)) found.add("shellfish");
  if (/tahini|sesame/.test(text)) found.add("sesame");
  if (/mustard/.test(text)) found.add("mustard");
  return [...found];
}

function countSources(items) { return { official: items.filter((x) => x.allergenSourceType === "official-ingredients").length, linkedProduct: items.filter((x) => x.allergenSourceType === "restaurant-linked-product-allergen-section").length, linkedIngredient: items.filter((x) => x.allergenSourceType === "restaurant-linked-menu-ingredients").length, unavailable: items.filter((x) => x.allergenSourceType === "unavailable").length }; }
function ordered(values) { const set = new Set(values); return allergenOrder.filter((value) => set.has(value)); }
function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function title(value) { return clean(value).replace(/\b\w/g, (c) => c.toUpperCase()).replace(/L\.f\.c\./i, "L.F.C."); }
function toastId(value) { return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " ").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase(); }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAyseAuditSnapshot();
  const output = `data/restaurant-verification/repairs/${ayseRestaurantId}/corrected-menu.json`;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ output, itemCount: snapshot.itemCount }, null, 2));
}
