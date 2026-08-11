import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sourceUrls2941 = Object.freeze({
  home: "https://www.2941.com/",
  aLaCarte: "https://www.2941.com/agrave-la-carte.html",
  prixFixe: "https://www.2941.com/prix-fixe-menu.html",
  tasting: "https://www.2941.com/chefs-tasting-menu.html",
  cocktails: "https://www.2941.com/barmenu.html",
});

export const auditRetrievedAt2941 = "2026-07-14T18:09:41.268Z";

function rows(category, sourceUrl, text) {
  return text.trim().split("\n").filter(Boolean).map((line) => {
    const [name, description = ""] = line.split("\t");
    return {
      category,
      name: name.trim(),
      description: description.trim() || null,
      sourceUrls: [sourceUrl],
    };
  });
}

const aLaCarteRows = [
  ...rows("Appetizers", sourceUrls2941.aLaCarte, `
Yellowfin Tuna Tartare	Grand Marnier aioli, avocado mousse, jalapeño
American Wagyu Tartare	matsutake-shoyu aioli, soy cured egg yolk, micro arugula, crostini
Caesar Salad	baby romaine, shaved pecorino, marinated anchovy
White Asparagus Velouté	smoked egg sabayon, morel mushrooms, matsutake shoyu "caviar", chive blossoms
Crispy Calamari	miso-bergamot aioli
East Coast Oysters	raspberry mignonette, cocktail sauce, lemon
  `),
  ...rows("Specials", sourceUrls2941.aLaCarte, `
Kaviari Baenki Caviar	blini, egg mimosa, capers, chives
32 oz Prime Bone-in Ribeye	jumbo asparagus-bacon, Parmesan pomme purée, Rossini jus
  `),
  ...rows("Entrées", sourceUrls2941.aLaCarte, `
Grilled Braveheart Farm Ribeye	romano beans, Grafton Village cheddar pomme rösti, cherry tomato jus
ⓥ Artichoke & Goat Cheese Raviolini	brown butter, capers, lemon zest, micro arugula
Butter Poached Lobster	fennel-tomato raviolini, cherry tomatoes, basil, lobster sauce
Australian Lamb Duo	grilled chop, confit belly, crispy eggplant, tomato sabayon, fava beans gremolata
Wild Halibut	English pea-basil purée, bacon, royal trumpet mushrooms, lemon, thyme jus
Maryland Softshell Crab Tempura	corn espuma, marinated tomatoes, pickled ramps
  `),
  ...rows("Sides", sourceUrls2941.aLaCarte, `
Crispy Potato Wedges	truffle aioli
Oyster Mushrooms	garlic-parsley butter
Asparagus & Bacon
  `),
  ...rows("Cheese Selection", sourceUrls2941.aLaCarte, `
Goot Essa Der Alpen, Howard, Pennsylvania	pasteurized cow's milk, cave aged Alpine style cheese; served with honeycomb, caramelized pecans, and sourdough
Humboldt Fog, Arcata, California	pasteurized goat's milk, bloomy rind and creamy texture; served with honeycomb, caramelized pecans, and sourdough
Valdeón, Castile y León, Spain	pasteurized cow's and goat's milk blue cheese, wrapped in sycamore leaves; served with honeycomb, caramelized pecans, and sourdough
Tomme De Brebis, Pyrénées, France	pasteurized sheep's milk, semi-hard cheese with natural rind; served with honeycomb, caramelized pecans, and sourdough
Sunny Ridge, Washington, Wisconsin	pasteurized goat's milk, semi firm wheel washed in beer; served with honeycomb, caramelized pecans, and sourdough
  `),
  ...rows("Desserts", sourceUrls2941.aLaCarte, `
Noisette Noir	hazelnut dacquoise, gianduja crémeux, mesquite gelato
Wildflower Honey Cake	crema fraîche gelato, honey tuile
Local Strawberry	strawberry gelée, granita, vanilla crémeux
Chocolate Indulgence Tart	Dulcey chocolate crémeux, Guanaja ganache, Caramélia chocolate gelato
  `),
];

const additionalPrixFixeRows = [
  ...rows("Prix Fixe · Appetizers", sourceUrls2941.prixFixe, `
Braised Beef Cheeks	ricotta cavatelli, cherry tomatoes, burrata, rosemary salt
  `),
  ...rows("Prix Fixe · Entrées", sourceUrls2941.prixFixe, `
Grilled Branzino	pattypan squash, fennel salad, San Marzano beurre blanc, crispy squash blossom
Berkshire Pork Chop	Swiss chard, fingerling potatoes, apricot glaze, lemon thyme jus
  `),
];

const tastingRows = [
  ...rows("July Tasting · First Course", sourceUrls2941.tasting, `
Hudson Valley Foie Gras Terrine	Marcona almonds, cherry-hibiscus marmalade, mâche salad, grilled sourdough
FJ Medina Farm Tomato Gazpacho	watermelon radish, blond cucumber, toasted bread ice cream
  `),
  ...rows("July Tasting · Second Course", sourceUrls2941.tasting, `
Sablefish	chanterelles, smoked sea trout caviar, vermouth cream
Squash Blossom Provençale	eggplant, summer squash, roasted red pepper espuma, olive-caper tapenade
  `),
  ...rows("July Tasting · Third Course", sourceUrls2941.tasting, `
Summer Pea Clam Chowder	Cherrystone clams, lobster, sugar snap peas
Summer Pea Campanelle	lemon zest, mint, sugar snap peas, Village Cheeseworks feta cheese
  `),
  ...rows("July Tasting · Fourth Course", sourceUrls2941.tasting, `
Creekstone Dry-Aged Prime Ribeye	patty pan squash, sofrico, pommes dauphine, sauce Choron
Robinson Farms Duck Egg Cassolette	spinach-rosemary cream, jumbo white asparagus, fiddlehead ferns, sourdough
  `),
  ...rows("July Tasting · Fifth Course", sourceUrls2941.tasting, `
Grand Marnier Soufflé	fig leaf-vanilla bean gelato
Opéra aux Chocolats	Tainori biscuit, Jivara crémeux, Guanaja mousse, caramelized Opalys gelato
  `),
];

const cocktailRows = [
  ...rows("Cocktails", sourceUrls2941.cocktails, `
Manhattan Project	Buffalo Trace Bourbon, Cocchi di Torino, Angostura Bitters, Luxardo Cherry
House Old-Fashioned	2941 Maker's Mark, Spiced Pear Brandy, Demerara, Prohibition Bitters
Fairview Oasis	White Rum, Aged Rum, Angostura, Lime, Pineapple, Hazelnut Orgeat, Coconut Foam
Sakura Blossom	Sakura Flower Infused Roku Gin, Cointreau, Giffard Lichi-Li, Lemon, Hibiscus Essence
Spring Spritz	Cucumber and Mint Infused Tequila Blanco, St-Germain, Lime, Sparkling Grapefruit
Citrus Serenade	Ketel One Citroen, Orange Liqueur, Lime, Ginger Beer
Pandan Blvd.	Pandan-Infused Rye, Sweet Vermouth, Campari
Rosa Amara	Braulio Amaro, Maraschino Liqueur, Lime, Rosemary
  `),
  ...rows("Zero Proof", sourceUrls2941.cocktails, `
Red Coupe	Pineapple Infused Seedlip Grove, Strawberry, Citrus-Cordial, Thai Basil
Passion-Rita	Seedlip Spice 94, Spiced Passionfruit, Lime, Coconut Water
Yuzu's Revenge	Lemon, Pineapple, Sparkling Water, Yuzu Foam
Mule-ish	Blood Orange Cordial, Lime, Ginger Beer
  `),
];

const categoryOrder = new Map([
  ["Appetizers", 10], ["Specials", 20], ["Entrées", 30], ["Sides", 40],
  ["Cheese Selection", 50], ["Prix Fixe · Appetizers", 60], ["Prix Fixe · Entrées", 61],
  ["July Tasting · First Course", 70], ["July Tasting · Second Course", 71],
  ["July Tasting · Third Course", 72], ["July Tasting · Fourth Course", 73],
  ["July Tasting · Fifth Course", 74], ["Desserts", 80], ["Cocktails", 90], ["Zero Proof", 91],
]);

export function build2941AuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = [...aLaCarteRows, ...additionalPrixFixeRows, ...tastingRows, ...cocktailRows]
    .map((row, index) => {
      const allergens = directAllergens(`${row.name} ${row.description ?? ""}`);
      return {
        auditItemKey: `${index + 1}:${slugify(row.name)}`,
        id: slugify(row.name),
        name: row.name,
        category: row.category,
        description: row.description,
        ingredientsText: row.description,
        sourceUrls: row.sourceUrls,
        sourceType: "official-website-menu",
        allergens,
        mayContain: [],
        allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      };
    })
    .sort((left, right) => {
      const categoryDifference =
        (categoryOrder.get(left.category) ?? 999) - (categoryOrder.get(right.category) ?? 999);
      return categoryDifference || left.name.localeCompare(right.name, "en", { sensitivity: "base" });
    });

  return {
    schemaVersion: 1,
    restaurantId: "2941-restaurant-falls-church-va-dc-metro",
    retrievedAt,
    sourceUrls: Object.values(sourceUrls2941),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "2941 does not publish a complete allergen matrix. Positive signals come only from explicit ingredients or species in the restaurant's current official menu text; no negative or general cross-contact claim is inferred.",
    items,
  };
}

export function directAllergens2941(value) {
  return directAllergens(value);
}

function directAllergens(value) {
  const text = ` ${String(value).normalize("NFKC").toLowerCase()
    .replace(/coconut (?:foam|water|milk|cream)/g, "coconut")
    .replace(/oyster mushrooms?/g, "mushrooms")
    .replace(/matsutake shoyu ["“”]?caviar["“”]?/g, "matsutake shoyu")} `;
  const patterns = [
    ["shellfish", /\b(?:oyster|oysters|calamari|lobster|crab|clams?|cherrystone clams?|shrimp|prawn|scallop|mussel|squid)\b/],
    ["milk", /\b(?:milk|cheese|pecorino|parmesan|cheddar|ricotta|burrata|feta|butter|cream|cr[eè]meux|crema fra[iî]che|crema fraîche|gelato|ganache|beurre blanc)\b/],
    ["egg", /\b(?:egg|eggs|aioli|sabayon|souffl[eé])\b/],
    ["fish", /\b(?:tuna|anchovy|halibut|branzino|sablefish|sea trout|caviar)\b/],
    ["soy", /\b(?:soy|shoyu|miso|tofu|tamari)\b/],
    ["tree-nut", /\b(?:almond|almonds|hazelnut|hazelnuts|pecan|pecans|walnut|cashew|pistachio|macadamia|orgeat)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["mustard", /\bmustard\b/],
  ];
  const allergens = patterns.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
  if (/\b(?:bread|sourdough|crostini|blini|biscuit|cavatelli|campanelle|raviolini|tempura|flour|wheat)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function slugify(value) {
  return String(value).replace(/ⓥ/g, "").replace(/&/g, " and ")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/repairs/2941-restaurant-falls-church-va-dc-metro/corrected-menu.json",
  );
  const snapshot = build2941AuditSnapshot({ retrievedAt: auditRetrievedAt2941 });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
