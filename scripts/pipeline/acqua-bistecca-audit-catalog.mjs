import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sourceUrlsAcquaBistecca = Object.freeze({
  location: "https://www.acquabistecca.com/location/washington-dc/",
  dinner: "https://mx.michaelmina.net/recipe-exchange/download/?file_id=38066&nodl=true",
  brunch: "https://mx.michaelmina.net/recipe-exchange/download/?file_id=37971&nodl=true",
  happyHour: "https://mx.michaelmina.net/recipe-exchange/download/?file_id=38065&nodl=true",
  beverage: "https://mx.michaelmina.net/recipe-exchange/download/?file_id=38064&nodl=true",
  dessert: "https://mx.michaelmina.net/recipe-exchange/download/?file_id=37620&nodl=true",
});

export const auditRetrievedAtAcquaBistecca = "2026-07-14T19:48:19.000Z";

function rows(category, sourceUrl, text) {
  return text.trim().split("\n").filter(Boolean).map((line) => {
    const [name, description = "", configurable = ""] = line.split("\t");
    return {
      category,
      name: name.trim(),
      description: description.trim() || null,
      isConfigurable: configurable === "configurable",
      sourceUrls: [sourceUrl, sourceUrlsAcquaBistecca.location],
    };
  });
}

const dinnerRows = [
  ...rows("For the Table", sourceUrlsAcquaBistecca.dinner, `
House-Made Focaccia\tChoose one, three, or five spreads: Summer Corn; Eggplant and Fennel Caponata; House Made Ricotta with Tartufo Honey; Castelvetrano Olive Tapenade; Pesto Trapanese.\tconfigurable
  `),
  ...rows("Antipasti", sourceUrlsAcquaBistecca.dinner, `
Tuna Tartare\tCalabrian chili, basil, pine nuts, tomato conserva, pasta frito
Caviar Cannoli\tBurrata, chive, 10g Siberian caviar
Arancini\tSaffron risotto, mozzarella, Sicilian agrodolce
Squash Parmesan\tPistachio pesto, pomodoro, parmesan
Clams Oreganata\tLittlenecks, oregano, fennel, clam nage
Rhode Island Calamari\tTempura battered, capers, hot cherry pepper aioli
AB Meatballs\tAnson Mills polenta, ricotta, fennel
Squash Blossoms\tMozzarella, capers, saffron aioli
  `),
  ...rows("Salads", sourceUrlsAcquaBistecca.dinner, `
Cucumber Salad\tCucumber, baby zucchini, goat cheese, smoked trout roe
Little Gem Caesar\tTangy dressing, crunchy tomato streusel
Tomato Salad\tYellow peaches, burrata, heirloom tomato, basil
  `),
  ...rows("Pasta", sourceUrlsAcquaBistecca.dinner, `
Spaghetti ‘all’ AB’\tPomodoro, basil purée, burrata espuma
Lasagna alla Piastra\tSpicy sausage ragu, Swiss chard, roasted pepper marinara
Pappardelle all’ Uovo\tPancetta, braised rabbit, spring onion, pecorino
Lobster Bucatini\tHalf Maine lobster, cognac, espelette
Saffron Rigatoni\tTomato, mussels, swordfish, capers
Sweet Corn Agnolotti\tMaryland blue crab, green onion, summer truffle
Lumache e Funghi\tPorcini ragu, truffle butter, aged balsamic
  `),
  ...rows("Acqua", sourceUrlsAcquaBistecca.dinner, `
Yellowfin Tuna\tSimply grilled on saffron-orange braised fregola
Branzino\tSimply grilled on saffron-orange braised fregola
Dover Sole\tSimply grilled on saffron-orange braised fregola
Ora King Salmon\tSimply grilled on saffron-orange braised fregola
  `),
  ...rows("Bistecca", sourceUrlsAcquaBistecca.dinner, `
16oz Bone-In NY Strip\tChargrilled, brushed with red Lambrusco butter, served with caponata-stuffed cipollini onion
12oz Flat Iron\tChargrilled, brushed with red Lambrusco butter, served with caponata-stuffed cipollini onion
8oz Filet\tChargrilled, brushed with red Lambrusco butter, served with caponata-stuffed cipollini onion
16oz Delmonico\tChargrilled, brushed with red Lambrusco butter, served with caponata-stuffed cipollini onion
Wagyu Picanha\tChargrilled, brushed with red Lambrusco butter, served with caponata-stuffed cipollini onion
40oz Florentina\tChargrilled, brushed with red Lambrusco butter, served with caponata-stuffed cipollini onion
  `),
  ...rows("Classics", sourceUrlsAcquaBistecca.dinner, `
Black Berkshire Pork Chop\tFennel, apricot, spring onion, vadouvan
Line Caught Swordfish Piccata\tPan seared, brown butter capers, sea beans
Porcini Butter Roasted Chicken\tMushroom-almond crema, asparagus tips
  `),
  ...rows("Sides", sourceUrlsAcquaBistecca.dinner, `
Olive Oil Fried Potatoes
Grilled Broccolini with Preserved Lemon
Grilled Asparagus
Calabrian Chili Wilted Spinach
  `),
];

const brunchOnlyRows = [
  ...rows("Brunch · Spuntini", sourceUrlsAcquaBistecca.brunch, `
Uovo Diavola “Deviled Egg”\tPancetta, chervil
Spice Poached Prawns\tSambuca-spiked cocktail sauce, fresh horseradish
  `),
  ...rows("Brunch · Antipasti", sourceUrlsAcquaBistecca.brunch, `
Caesar Salad\tTangy dressing, tomato-garlic breadcrumb
Prosciutto & Apricot\tSmoked parmesan crema, aged balsamic, arugula
Avocado Toast\tBasil pesto, ricotta salata, pistachio; optional poached egg
Yogurt Parfait\tStrawberry-rhubarb, vanilla yogurt, hazelnuts
Marinated Baby Beets\tGorgonzola dolce budino, green apple, black pepper walnuts
  `),
  ...rows("Brunch · Centro della Tavola", sourceUrlsAcquaBistecca.brunch, `
Eggs Celentano\tTwo eggs any style, Nueske’s bacon or Italian sausage, parmesan-crusted tomato, olive oil fried potatoes; optional 8oz NY strip
Eggs Benedictine\tProsciutto di Parma, pesto hollandaise, tigelle di Modena
Bucatini Carbonara\tGuanciale, pecorino Romano, farm egg
Egg White Frittata\tSpinach, porcini ragu, goat cheese
Burrata Burger\tSpeck, basil, tomato conserva, olive oil fried potatoes
Lemon Ricotta Pancakes\tBlueberry compote, whipped mascarpone
Prawns and Polenta\tGulf prawns, lemon condiment, shellfish vellutata
Tableside Tiramisu Toast\tMascarpone whip, ladyfinger crumble, cacao nib glass
  `),
  ...rows("Brunch · Condimenti", sourceUrlsAcquaBistecca.brunch, `
Italian Breakfast Sausage
Thick Cut Nueske’s Bacon
Market Fruit Cup
  `),
];

const happyHourOnlyRows = [
  ...rows("Happy Hour · Food", sourceUrlsAcquaBistecca.happyHour, `
Caper-Vinegar Chips & Shaved Speck
Ricotta Meatball Spiedini\tPomodoro sauce, polenta
Campanelle Verde\tArugula-pistachio pesto, crispy garlic, pecorino di fossa
  `),
];

const dessertRows = [
  ...rows("Desserts", sourceUrlsAcquaBistecca.dessert, `
Budino al Cioccolato\tCreamy milk chocolate custard, whipped Nutella, warm Calvados caramello, crunchy hazelnut praline
Il Limone\tOlive oil cake, citrus mousse, candied lemon gelée, vanilla bean crumble
Panna Cotta Granita\tButtermilk custard with granita, Sicilian pistachio
Tiramisu Affogato\tEspresso over tiramisu gelato, brown butter ladyfingers, hazelnut mascarpone sabayon, espresso hot fudge, cocoa
Bomba Donuts\tRicotta zeppole with house-made dips, citrus zest, mascarpone cheesecake, roasted strawberries
  `),
];

const nonAlcoholicRows = [
  ...rows("Beverages · Spirit Free", sourceUrlsAcquaBistecca.beverage, `
Lake Garda\tLyre’s Sicilian Orange, spiced peaches, lemon, foam
Lake Como\tThe Pathfinder, orange oleo-saccharum, lemon, club soda
  `),
  ...rows("Beverages · Zero Alcohol & Water", sourceUrlsAcquaBistecca.beverage, `
Domaine Des Grottes Estate ‘Antilope’ 0.0% Still Wine
Spring in a Bottle <0.5% Sparkling Rosé
Peroni 0.0% Alcohol Beer
St Agrestis Phony Negroni Non-Alcoholic Cocktail
San Pellegrino Sparkling Water
Acqua Panna Still Water
  `),
  ...rows("Beverages · Coffee & Tea", sourceUrlsAcquaBistecca.dessert, `
Hot Tea\tChoice of Earl Grey, Jasmine Green, or Chamomile\tconfigurable
Drip Regular Coffee
Latte
Cappuccino
Espresso
  `),
  ...rows("Beverages · Brunch", sourceUrlsAcquaBistecca.brunch, `
High-Performance Living™\tCold brew, almond milk, nutmeg, agave
  `),
];

const categoryOrder = new Map([
  ["For the Table", 10], ["Antipasti", 20], ["Salads", 30], ["Pasta", 40],
  ["Acqua", 50], ["Bistecca", 60], ["Classics", 70], ["Sides", 80],
  ["Brunch · Spuntini", 90], ["Brunch · Antipasti", 91],
  ["Brunch · Centro della Tavola", 92], ["Brunch · Condimenti", 93],
  ["Happy Hour · Food", 100], ["Desserts", 110],
  ["Beverages · Spirit Free", 200], ["Beverages · Zero Alcohol & Water", 201],
  ["Beverages · Coffee & Tea", 202], ["Beverages · Brunch", 203],
]);

export function buildAcquaBisteccaAuditSnapshot({ retrievedAt = auditRetrievedAtAcquaBistecca } = {}) {
  const items = [...dinnerRows, ...brunchOnlyRows, ...happyHourOnlyRows, ...dessertRows, ...nonAlcoholicRows]
    .map((row, index) => {
      const allergens = directAllergensAcquaBistecca(row);
      return {
        auditItemKey: `${index + 1}:${slugify(row.category)}:${slugify(row.name)}`,
        id: `${slugify(row.category)}-${slugify(row.name)}`,
        name: row.name,
        category: row.category,
        description: row.description,
        ingredientsText: row.description,
        isConfigurable: row.isConfigurable,
        sourceUrls: row.sourceUrls,
        sourceType: "official-pdf-menu",
        allergens,
        mayContain: [],
        allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      };
    })
    .sort((left, right) => {
      const categoryDifference = (categoryOrder.get(left.category) ?? 999) - (categoryOrder.get(right.category) ?? 999);
      return categoryDifference;
    });

  return {
    schemaVersion: 1,
    restaurantId: "acqua-bistecca-washington-dc-dc-metro",
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAcquaBistecca),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Acqua Bistecca publishes current Washington dinner, brunch, happy-hour, beverage, and dessert PDFs but no complete allergen matrix or cross-contact guide. Positive signals come only from fixed published ingredients, explicitly named species, or mandatory food formats. Optional choices are not merged onto configurable bases. Alcohol-only cocktails, beer, wine-by-the-glass, and the bottle list remain outside this allergen-focused catalog; current nonalcoholic beverages are retained after food and dessert.",
    items,
  };
}

export function directAllergensAcquaBistecca(row) {
  let text = ` ${`${row.name} ${row.description ?? ""}`.normalize("NFKC").toLowerCase()} `;
  if (row.name === "House-Made Focaccia") {
    text = " house-made focaccia ";
  }
  if (row.name === "Avocado Toast") {
    text = text.replace(/optional poached egg/g, "");
  }
  if (row.name === "Eggs Celentano") {
    text = text.replace(/optional 8oz ny strip/g, "");
  }
  text = text.replace(/almond milk/g, "almonds");

  const patterns = [
    ["shellfish", /\b(?:clams?|littlenecks?|lobster|mussels?|crab|calamari|prawns?|shrimp|shellfish)\b/],
    ["milk", /\b(?:milk|mozzarella|ricotta|burrata|parmesan|pecorino|goat cheese|gorgonzola|yogurt|mascarpone|butter|buttermilk|gelato|crema|creme|custard|hollandaise|cheesecake)\b/],
    ["egg", /\b(?:egg|eggs|egg white|aioli|hollandaise|custard|sabayon|tiramisu|donuts?|pancakes?)\b/],
    ["fish", /\b(?:tuna|caviar|trout roe|swordfish|branzino|sole|salmon)\b/],
    ["tree-nut", /\b(?:pine nuts?|pinenuts?|pistachio|hazelnuts?|walnuts?|almonds?|almond milk|nutella)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["soy", /\b(?:soy|tofu|miso|tamari|edamame)\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["mustard", /\bmustard\b/],
  ];
  const allergens = patterns.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
  if (/\b(?:focaccia|cannoli|pasta|spaghetti|lasagna|pappardelle|bucatini|rigatoni|agnolotti|lumache|campanelle|breadcrumb|breadcrumbs|tigelle|toast|pancakes?|ladyfingers?|cake|crumble|donuts?|zeppole|tempura battered|streusel|burger)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  if (/\bbeer\b/.test(text)) allergens.push("gluten");
  return unique(allergens);
}

function slugify(value) {
  return String(value).replace(/&/g, " and ").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’'“”™]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/repairs/acqua-bistecca-washington-dc-dc-metro/corrected-menu.json",
  );
  const snapshot = buildAcquaBisteccaAuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
