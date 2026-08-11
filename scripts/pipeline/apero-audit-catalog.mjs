import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "cheerio";

export const restaurantIdApero = "replacement-apero-washington-dc";
export const retrievedAtApero = "2026-07-15T08:04:57.441Z";

export const sourceUrlsApero = Object.freeze({
  home: "https://www.aperodc.com/",
  summerPrixFixe:
    "https://static1.squarespace.com/static/650f7d73221264489123e767/t/6a2201aff8f858551ef7a454/1780613551030/Summer+Prix+Fixe+Menu.pdf",
  brunch:
    "https://static1.squarespace.com/static/650f7d73221264489123e767/t/6a2305bee695f676c459a5f0/1780680126690/Brunch+Menu+06.5.26.pdf",
  lunch:
    "https://static1.squarespace.com/static/650f7d73221264489123e767/t/6a2305d28ed579448cbf15fc/1780680146916/Lunch+06.5.26.pdf",
  dinner:
    "https://static1.squarespace.com/static/650f7d73221264489123e767/t/6a2305e9a0a034147a1fe58c/1780680169218/Dinner+Menu+6.5.26.pdf",
  caviarHour: "https://www.aperodc.com/s/Caviar-Hour-923-1.pdf",
  prideSpecials: "https://www.aperodc.com/s/Pride-Month-Specials.pdf",
  toast: "https://order.toasttab.com/online/apero-2622-p-nw",
  nutella:
    "https://www.nutella.com/us/en/nutellar-jar-nutellar-united-states-official-website",
});

const scopeUrls = Object.freeze({
  brunch: sourceUrlsApero.brunch,
  lunch: sourceUrlsApero.lunch,
  dinner: sourceUrlsApero.dinner,
  caviarHour: sourceUrlsApero.caviarHour,
  toast: sourceUrlsApero.toast,
});

const categoryOrder = new Map([
  ["Caviar Selections", 10],
  ["Small Plates", 20],
  ["Soups & Salads", 30],
  ["Large Plates", 40],
  ["Desserts", 50],
  ["Brunch Features", 60],
  ["Caviar Hour", 70],
]);

const allCaviarAllergens = Object.freeze(["milk", "fish"]);

function item(category, name, description, allergens, scopes, options = {}) {
  return Object.freeze({
    category,
    name,
    description,
    allergens: Object.freeze(allergens),
    scopes: Object.freeze(scopes),
    anchor: options.anchor ?? name,
    isConfigurable: Boolean(options.isConfigurable),
  });
}

// The owner PDFs are the in-house menu authority. The linked Toast menu is used
// only to corroborate current descriptions and the few explicit linked-menu
// allergen disclosures; it does not turn absent text into a negative assurance.
const catalogRows = Object.freeze([
  item("Caviar Selections", "Kaluga Hybrid — Imperial Golden Dynasty", "Farmed in China; light golden-brown large pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Imperial Golden Dynasty", isConfigurable: true }),
  item("Caviar Selections", "Kaluga Hybrid — Petrossian Royal Daurenki", "Marbled-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Petrossian Royal Daurenki", isConfigurable: true }),
  item("Caviar Selections", "Osetra — Prunier D’Aquitaine", "Farmed in France; dark-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Prunier D’Aquitaine", isConfigurable: true }),
  item("Caviar Selections", "Osetra — Lyna Polska Classic", "Farmed in Poland; dark grey-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Lyna Polska Classic", isConfigurable: true }),
  item("Caviar Selections", "Osetra — Royal Belgium", "Farmed in Belgium; dark-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Royal", isConfigurable: true }),
  item("Caviar Selections", "Osetra — Platinum Imperial", "Farmed in Belgium; dark grey-green large pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Platinum Imperial", isConfigurable: true }),
  item("Caviar Selections", "Osetra — Giaveri Classic", "Farmed in Italy; grey-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Giaveri Classic", isConfigurable: true }),
  item("Caviar Selections", "Osetra — Black River Royale", "Farmed in Uruguay; green-grey medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Black River Royale", isConfigurable: true }),
  item("Caviar Selections", "Osetra — Black River Imperial", "Farmed in Uruguay; amber-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Black River Imperial", isConfigurable: true }),
  item("Caviar Selections", "Siberian Sturgeon — Lyna Polska Classic", "Farmed in Poland; deep dark grey-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Siberian Sturgeon", isConfigurable: true }),
  item("Caviar Selections", "Siberian Sturgeon — Royal Belgium", "Farmed in Belgium; dark-charcoal medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Siberian Sturgeon", isConfigurable: true }),
  item("Caviar Selections", "Siberian Sturgeon — Giaveri", "Farmed in Italy; dark-charcoal medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Giaveri", isConfigurable: true }),
  item("Caviar Selections", "White Sturgeon — Classic Italian", "Farmed in Italy; earthy grey-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Classic Italian", isConfigurable: true }),
  item("Caviar Selections", "Beluga Hybrid — Beluga-Baerii", "Farmed in Italy; dark grey-green medium pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Beluga-Baerii", isConfigurable: true }),
  item("Caviar Selections", "Beluga Hybrid — Beluga-Bester", "Farmed in Romania; dark charcoal-brown small pearls; served with chips/pizzelles, crème fraîche, and accoutrements.", allCaviarAllergens, ["brunch", "lunch", "dinner"], { anchor: "Beluga-Bester", isConfigurable: true }),

  item("Small Plates", "Deviled Eggs", "Bacon and chives; optional caviar add-on.", ["egg"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Deviled Eggs" }),
  item("Small Plates", "Gougères", "Black truffle and gruyère cheese.", ["milk", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Gougères" }),
  item("Small Plates", "Mushroom Cigarettes", "Parmesan crème.", ["milk"], ["brunch", "lunch", "dinner"], { anchor: "Mushroom Cigarettes" }),
  item("Small Plates", "House Mixed Vegetable Pickles", "House mixed-vegetable pickles.", [], ["brunch", "lunch", "dinner", "toast"], { anchor: "House Mixed" }),
  item("Small Plates", "Potato Chips", "French onion crème and chives; optional caviar add-on.", ["milk", "soy"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Potato Chips" }),
  item("Small Plates", "Marinated Olives", "Marinated olives.", [], ["brunch", "lunch", "dinner", "toast"], { anchor: "Marinated Olives" }),
  item("Small Plates", "Pâté Mousseline", "Pistachio crust, port-poached figs, red-currant jam, and toasted brioche.", ["tree-nut", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Pâté Mousseline" }),
  item("Small Plates", "Salmon Rillettes", "Black-garlic purée and toasted brioche.", ["fish", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Salmon Rillettes" }),
  item("Small Plates", "Escargot Tartine", "Parmesan, beurre d’escargot, and rustico baguette.", ["milk", "shellfish", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Escargot Tartine" }),
  item("Small Plates", "Fresh Oysters", "Hibiscus-citrus-honey foam; optional caviar add-on.", ["shellfish"], ["brunch", "lunch", "dinner"], { anchor: "Fresh Oysters" }),
  item("Small Plates", "Charcuterie Board", "Dijon, house pickles, marinated olives, and baguette.", ["mustard", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Charcuterie Board" }),
  item("Small Plates", "Fromage Trio", "Blueberry mostarda, dried fruit, candied nuts, honeycomb, and baguette.", ["milk", "tree-nut", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Fromage Trio" }),
  item("Small Plates", "Chef’s Caviar du Jour", "Caviar with accoutrements and chips.", ["fish"], ["lunch"], { anchor: "Chef’s Caviar du Jour" }),

  item("Soups & Salads", "French Onion Soup", "Gruyère cheese and baguette crostini.", ["milk", "wheat", "gluten"], ["brunch", "lunch", "dinner"], { anchor: "French Onion Soup" }),
  item("Soups & Salads", "Apéro Bistro Salad", "Shaved red onion, champagne vinaigrette, and fine herbs.", [], ["lunch", "dinner", "toast"], { anchor: "Apero Bistro Salad" }),
  item("Soups & Salads", "Strawberry & Arugula Salad", "Crumbled goat cheese, toasted pistachios, and strawberry-champagne vinaigrette.", ["milk", "tree-nut"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Strawberry & Arugula Salad" }),
  item("Soups & Salads", "Marinated Artichokes Salad", "Microgreen salad, artichoke ricotta, and lemon gremolata.", ["milk"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Marinated Artichokes Salad" }),
  item("Soups & Salads", "Fresh Fruit and Yogurt Parfait", "Pumpkin-seed and oat granola with maple syrup.", ["milk"], ["brunch"], { anchor: "Fresh Fruit and Yogurt Parfait" }),

  item("Large Plates", "Mini Dutch Baby", "Fresh berry compote, lemon curd, and powdered sugar.", ["milk", "egg", "wheat", "gluten"], ["brunch"], { anchor: "Mini    Dutch Baby" }),
  item("Large Plates", "Eggs en Cocotte", "Two baked eggs, mushrooms, caramelized onions, goat cheese, and baguette; optional caviar add-on.", ["milk", "egg", "wheat", "gluten"], ["brunch"], { anchor: "Eggs    en Cocotte" }),
  item("Large Plates", "Smoked Salmon Tartine", "Boursin, multigrain toast, fried capers, and pickled red onion.", ["milk", "fish", "wheat", "gluten"], ["brunch"], { anchor: "Smoked Salmon Tartine" }),
  item("Large Plates", "Steamed PEI Mussels", "Lemongrass-and-ginger broth, fried garlic, fresh coriander, and espelette oil.", ["shellfish"], ["brunch", "lunch", "dinner"], { anchor: "Steamed PEI Mussels" }),
  item("Large Plates", "Croissant Eggs Benedict", "Ham and hollandaise with house salad; optional caviar add-on.", ["egg", "wheat", "gluten"], ["brunch"], { anchor: "Croissant Eggs Benedict" }),
  item("Large Plates", "Croque Madame", "Ham, gruyère, egg, and béchamel with house salad; optional caviar add-on.", ["milk", "egg", "wheat", "gluten"], ["brunch"], { anchor: "Croque Madame" }),
  item("Large Plates", "Apéro Burger", "Gruyère, mushrooms, caramelized onions, and Dijon; choice of chips or house salad.", ["milk", "mustard"], ["brunch", "lunch", "toast"], { anchor: "Apéro Burger", isConfigurable: true }),
  item("Large Plates", "Jambon & Brie Baguette", "Amish herb butter, arugula, and champagne vinaigrette.", ["milk", "wheat", "gluten"], ["lunch", "toast"], { anchor: "Jambon & Brie Baguette" }),
  item("Large Plates", "Royal Trumpet French Dip Sandwich", "Caramelized onions, gruyère, horseradish cream sauce, and mushroom au jus.", ["milk", "wheat", "gluten"], ["lunch", "toast"], { anchor: "Royal Trumpet French Dip Sandwich" }),
  item("Large Plates", "Lemon Chittara & Caviar", "Lemon-and-parmesan sauce, crème fraîche, and Black River Tradition caviar.", ["milk", "fish", "wheat", "gluten"], ["lunch", "dinner", "toast"], { anchor: "Lemon Chittara & Caviar" }),
  item("Large Plates", "Pan Seared Scallops", "Thyme pea purée, snow peas, English peas, and lemon beurre blanc; optional caviar add-on.", ["milk", "shellfish"], ["dinner"], { anchor: "Pan Seared Scallops" }),
  item("Large Plates", "Trout Almondine", "Jumbo green asparagus, sliced almonds, capers, and garlic beurre noisette; optional caviar add-on.", ["milk", "tree-nut", "fish"], ["dinner"], { anchor: "Trout Almondine" }),
  item("Large Plates", "Confit Canard", "Fingerling potato, haricots verts, and morel mushroom sauce.", [], ["dinner"], { anchor: "Confit Canard" }),
  item("Large Plates", "Braised Rabbit Leg", "Glazed Thumbelina carrots, potato-and-leek purée, and Dijon cream sauce.", ["milk", "mustard"], ["dinner"], { anchor: "Braised Rabbit Leg" }),

  item("Desserts", "Caramel Bread Pudding", "Vanilla ice cream.", ["milk", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Caramel Bread Pudding" }),
  item("Desserts", "Apricot Galette", "Puff pastry, apricot gelée, and apricot ice cream.", ["milk", "wheat", "gluten"], ["brunch", "lunch", "dinner", "toast"], { anchor: "Apricot Galette" }),
  item("Desserts", "Guanaja Chocolate Pot de Crème", "Vanilla whipped cream.", ["milk"], ["brunch", "lunch", "dinner"], { anchor: "Guanaja Chocolate Pot de Crème" }),
  item("Brunch Features", "Petit-Déjeuner Français", "Croissant basket with homemade jam, Nutella, fresh-squeezed orange juice, and a choice of espresso, cappuccino, Americano, or tea.", ["milk", "tree-nut", "soy", "wheat", "gluten"], ["brunch"], { anchor: "Petit-Déjeuner Français", isConfigurable: true }),

  item("Caviar Hour", "Black River Osetra Caviar", "Served with potato chips and accoutrement.", ["fish"], ["caviarHour"], { anchor: "Black River Osetra Caviar", isConfigurable: true }),
  item("Caviar Hour", "Chef’s Selection Cheese & Charcuterie Board", "Chef’s selection of cheese and charcuterie.", ["milk"], ["caviarHour"], { anchor: "Chef’s Selection Cheese & Charcuterie Board" }),
]);

const requiredHomeLinks = Object.freeze([
  ["Summer Prix Fixe", "/s/Summer-Prix-Fixe-Menu.pdf"],
  ["Brunch", "/s/Brunch-Menu-06526.pdf"],
  ["Lunch", "/s/Lunch-06526.pdf"],
  ["Caviar Hour", "/s/Caviar-Hour-923-1.pdf"],
  ["Dinner", "/s/Dinner-Menu-6526.pdf"],
]);

export function buildAperoAuditSnapshot({
  homeHtml,
  brunchText,
  lunchText,
  dinnerText,
  caviarHourText,
  toastText,
  nutellaText,
  retrievedAt = retrievedAtApero,
} = {}) {
  const sourceText = {
    brunch: String(brunchText ?? ""),
    lunch: String(lunchText ?? ""),
    dinner: String(dinnerText ?? ""),
    caviarHour: String(caviarHourText ?? ""),
    toast: String(toastText ?? ""),
  };
  assertCurrentHomeLinks(homeHtml);
  assertSourceShapes(sourceText);
  if (!String(nutellaText ?? "").includes("Contains tree nuts (hazelnuts), milk, soy.")) {
    throw new Error("Nutella manufacturer label changed: reviewed milk/tree-nut/soy statement is missing.");
  }

  const items = catalogRows.map((row, index) => {
    const sourceScopes = row.scopes.filter((scope) => sourceText[scope]?.includes(row.anchor));
    if (sourceScopes.length === 0) {
      throw new Error(`Apéro source shape changed: missing reviewed anchor “${row.anchor}” for ${row.name}.`);
    }
    const usesNutellaIngredientIntelligence = row.name === "Petit-Déjeuner Français";
    const sourceUrls = unique([
      ...sourceScopes.map((scope) => scopeUrls[scope]),
      usesNutellaIngredientIntelligence ? sourceUrlsApero.nutella : null,
    ]);
    const positiveSignals = row.allergens.length > 0;
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      imageUrl: null,
      isConfigurable: row.isConfigurable,
      allergens: [...row.allergens],
      mayContain: [],
      allergenSourceType: positiveSignals ? "official-ingredients" : "unavailable",
      sourceType: usesNutellaIngredientIntelligence
        ? "restaurant-issued-pdf-plus-manufacturer-ingredient-intelligence"
        : sourceScopes.includes("toast")
          ? "restaurant-issued-pdf-and-linked-ordering-menu"
          : "restaurant-issued-pdf-menu",
      sourceUrls,
      sourceSummary: usesNutellaIngredientIntelligence
        ? "Apéro's current brunch PDF names Nutella; milk, tree-nut, and soy signals come from Nutella's current manufacturer label, while croissant wheat/gluten is a mandatory named-format signal. Ingredient intelligence remains labeled separately and neither source is a complete restaurant cross-contact assurance."
        : positiveSignals
        ? "Positive signals are limited to fixed terms and unavoidable named formats in Apéro's current owner-issued PDFs, with linked Toast text used only where explicitly represented. These menus are not a complete allergen matrix or cross-contact assurance."
        : "Apéro currently publishes this item, but the reviewed menu text provides no supported positive signal and no complete allergen or cross-contact disclosure; absent terms are not a negative assurance.",
      evidence: [
        ...sourceScopes.map((scope) => ({
        sourceKind: scope === "toast"
          ? "restaurant-linked-ordering-menu"
          : "restaurant-issued-pdf-menu",
        sourceUrl: scopeUrls[scope],
        text: row.anchor,
        })),
        ...(usesNutellaIngredientIntelligence ? [{
          sourceKind: "manufacturer-ingredient-intelligence",
          sourceUrl: sourceUrlsApero.nutella,
          text: "Contains tree nuts (hazelnuts), milk, soy.",
        }] : []),
      ],
    };
  });

  const categories = unique(items.map((entry) => entry.category));
  if (items.length !== 53 || new Set(items.map((entry) => entry.id)).size !== 53) {
    throw new Error(`Apéro canonical shape changed: expected 53 unique items, found ${items.length}.`);
  }
  if (categories.length !== 7 || categories.at(-1) !== "Caviar Hour") {
    throw new Error("Apéro canonical categories changed.");
  }
  if (items.some((entry, index) => {
    const next = items[index + 1];
    return next && (categoryOrder.get(entry.category) ?? 999) > (categoryOrder.get(next.category) ?? 999);
  })) {
    throw new Error("Apéro items are not in canonical category order.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdApero,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsApero),
    itemCount: items.length,
    categoryCount: categories.length,
    caviarSelectionCount: items.filter((entry) => entry.category === "Caviar Selections").length,
    officialIngredientCount: items.filter((entry) => entry.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((entry) => entry.allergenSourceType === "unavailable").length,
    excludedAlcoholPresentationCount: 2,
    excludedRetailItemCount: 2,
    excludedPosControlCount: 1,
    items,
  };
}

function assertCurrentHomeLinks(homeHtml) {
  const $ = load(String(homeHtml ?? ""));
  const links = $("a").toArray().map((anchor) => ({
    text: clean($(anchor).text()),
    href: $(anchor).attr("href") ?? "",
  }));
  for (const [text, href] of requiredHomeLinks) {
    if (!links.some((link) => link.text === text && link.href === href)) {
      throw new Error(`Apéro home changed: missing current ${text} link ${href}.`);
    }
  }
}

function assertSourceShapes(sourceText) {
  const anchors = {
    brunch: ["Sustainably Farmed Caviar Selections", "Brunch Menu", "Petit-Déjeuner Français"],
    lunch: ["Sustainably Farmed Caviar Selections", "Lunch Menu", "Royal Trumpet French Dip Sandwich"],
    dinner: ["Sustainably Farmed Caviar Selections", "Dinner Menu", "Braised Rabbit Leg"],
    caviarHour: ["Caviar Hour", "Black River Osetra Caviar", "Chef’s Selection Cheese & Charcuterie Board"],
    toast: ["Apéro & La Bohème 2622 P NW", "Apéro Lunch", "Black Truffle Gougeres", "Chips & Dip"],
  };
  for (const [scope, required] of Object.entries(anchors)) {
    for (const anchor of required) {
      if (!sourceText[scope].includes(anchor)) {
        throw new Error(`Apéro ${scope} source changed: missing “${anchor}”.`);
      }
    }
  }
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugify(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactRoot = path.resolve(`data/restaurant-verification/artifacts/${restaurantIdApero}`);
  const [homeHtml, brunchText, lunchText, dinnerText, caviarHourText, toastText, nutellaText] = await Promise.all([
    readFile(path.join(artifactRoot, "official-apero-home.html"), "utf8"),
    readFile(path.join(artifactRoot, "official-apero-brunch-june-2026.txt"), "utf8"),
    readFile(path.join(artifactRoot, "official-apero-lunch-june-2026.txt"), "utf8"),
    readFile(path.join(artifactRoot, "official-apero-dinner-june-2026.txt"), "utf8"),
    readFile(path.join(artifactRoot, "official-apero-caviar-hour.txt"), "utf8"),
    readFile(path.join(artifactRoot, "apero-toast-readable-proxy.txt"), "utf8"),
    readFile(path.join(artifactRoot, "nutella-official-product-label.html"), "utf8"),
  ]);
  const snapshot = buildAperoAuditSnapshot({
    homeHtml,
    brunchText,
    lunchText,
    dinnerText,
    caviarHourText,
    toastText,
    nutellaText,
  });
  const outputDirectory = path.resolve(`data/restaurant-verification/repairs/${restaurantIdApero}`);
  const outputPath = path.join(outputDirectory, "corrected-menu.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    caviarSelectionCount: snapshot.caviarSelectionCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
