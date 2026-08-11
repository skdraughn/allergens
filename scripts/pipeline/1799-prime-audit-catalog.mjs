import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sourceUrls1799Prime = Object.freeze({
  home: "https://1799prime.com/",
  dinner: "https://1799prime.com/wp-content/uploads/Dinner-Menu-JULY-2026.pdf",
});

function rows(section, text) {
  return text.trim().split("\n").map((line) => {
    const [name, description = "", explicitGf = ""] = line.split("\t");
    return {
      section,
      name: name.trim(),
      description: description.trim() || null,
      glutenCrossContact: explicitGf === "gf" || /\(GF\)/i.test(name),
    };
  });
}

const menuRows = [
  ...rows("Starters", `
Truffle Fries (GF)\tParmesan cheese, chipotle ranch.
Blackened Whiskey Shrimp\tMustard cream sauce, toast, scallions.
Crab & Oyster Rockefeller\tLump crab meat, creamed spinach, herb panko crumbles, parmesan cheese, lemon halves.
Crispy Calamari\tHaricots verts, marinara.
Fried Green Tomato\tChilled red bean succotash, cherry pepper aioli.
1799 Steak Roll\tCaramelized onions, sharp cheddar, scallions, roasted red pepper coulis.
Wings\tChoice of buffalo, Szechuan chili, old bay, truffle parmesan, honey espelette, or chipotle-mango BBQ; bleu cheese or ranch dressing, celery and carrots.
Shrimp Ceviche (GF)\tBlack tiger shrimp, smashed avocado, onions, mango, jalapeno, cilantro, corn tortilla chips, lime vinaigrette.
Frito Mixto\tCalamari, shrimp, cherry pepper, marinara sauce.
Crab Avocado Tower\tJumbo lump crab meat, corn succotash, avocado smash, lemon tarragon aioli, basil oil, crostini.
  `),
  ...rows("Soups & Salads", `
Soup Du Jour\tAsk your server for today's offering.
Lobster Bisque\tSmoked chili oil, sherry wine.
Prime House Salad\tArcadian mixed greens, heirloom tomato, onion, shaved carrots, croutons, champagne vinaigrette.
Kale Caesar Salad\tShaved parmesan, toasted oatmeal croutons, caesar dressing.
Citrus Salad (GF)\tSpinach, frisee, shaved fennel, carrots, almonds, feta cheese, citrus segment, mimosa vinaigrette.
Wedge Salad\tIceberg lettuce, smoked bacon, grape tomato, egg, bleu cheese crumbles, bleu cheese dressing.
  `),
  ...rows("Raw Bar", `
Chilled Seafood Duo (GF)\tHalf dozen fresh oysters, jumbo shrimp cocktail, lemon halves, apple mignonette, cocktail sauce.
Oysters on the Half Shell (GF)\tAsk your server for today's selection; minimum of six; tabasco, apple mignonette, cocktail sauce.
  `),
  ...rows("Lunch", `
1799 Burger\tAmerican cheese, house sweet pickles, roasted garlic aioli, brioche bun, lettuce, tomato, onion, house frites.
Prime French Dip Sandwich\tLow and slow prime rib, caramelized onion, provolone, creamy horseradish aioli, au jus, house frites.
Shrimp Tacos\tWhite flour tortillas, apple and mango slaw, avocado, feta cheese.
Grilled Chicken Sandwich\tBacon, garlic spinach, cheddar cheese, BBQ aioli, tomato, onion, baguette, house frites.
Fish & Chips\tAlaskan cod fish, beer battered, roasted poblano tartar sauce, house frites, lemon.
Crab Cake Sandwich\tIceberg lettuce, tomato, roasted poblano tartar, brioche bun, house frites.
Crab Cake\tYellow rice, roasted poblano tartar sauce, asparagus.
Cobb Salad\tArcadian mix greens, grilled chicken, grape tomato, avocado, red onion, bleu cheese, egg, chipotle ranch.
Brussels Sprouts Salad (GF)\tGrilled chicken, roasted peppers, blue cheese, hot honey vinaigrette.
Steak Salad\t8oz sirloin steak, arcadian mix lettuce, crispy onion straws, roasted peppers, grape tomato, gorgonzola cheese, balsamic vinaigrette.
Steak Frites (GF)\t8oz NY striploin, chimichurri, grilled lemon, house frites.
6oz Center-Cut Petit Filet Mignon (GF)\tAsparagus.
  `),
  ...rows("Land & Sea", `
Shrimp & Grits (GF)\tAndouille sausage, cheddar grits, creamy shellfish broth.
Black Pepper Ziti\tShrimp, andouille sausage, sundried tomatoes, roasted red peppers, parmesan cream sauce.
Chicken Scarpariello (GF)\tSemi boneless half chicken, roasted fingerling potato, Italian sausage, kale, tomato, sweet sour pan sauce.
Pappardelle Bolognese\tCreamy rich beef ragu, aromatic vegetables, marinara sauce, Parmigiano Reggiano, fresh basil, ricotta cheese.
Seafood Fra Diavolo\tLinguine pasta, black tiger shrimp, mussels, squid, red peppers, spicy diavolo sauce.
Szechuan Salmon (GF)\tYellow rice, haricots verts, smoked chili oil.
Seared Scallops\tCreamy mushroom risotto, herb truffle butter, parmesan cheese, crispy leeks.
Fresh Catch\tAsk your server for today's catch.
Pan Roasted Branzino (GF)\tTuscan marinated, roasted baby carrots, lemon emulsion, herb oil.
Crab Cakes\tYellow rice, roasted poblano tartar sauce, asparagus.
Featured Entree\tAsk your server for today's features.
  `),
  ...rows("Chef's Butcher Block", `
Bone-In Ribeye - Cowboy Cut 18 oz\t\tgf
Center-Cut Petite Filet Mignon 6 oz\t\tgf
Prime New York Strip 16 oz\t\tgf
Prime Ribeye 16 oz\t\tgf
Prime Tomahawk 44 oz\t\tgf
Junior Prime Rib 10 oz\tServed with horseradish cream and au jus.\tgf
1799 Prime Rib 14 oz\tServed with horseradish cream and au jus.\tgf
Chef's Prime Rib 16 oz\tServed with horseradish cream and au jus.\tgf
  `),
  ...rows("Signature Sides", `
Macaroni & Cheese
Burgundy Mushrooms (GF)
Garlic Mashed Potatoes (GF)
Potatoes Au Gratin (GF)
Frites (GF)
Tuscan Potato
Brussels Sprouts (GF)
Grilled Asparagus (GF)
Haricots Verts (GF)
Braised Collard Greens
Creamed Spinach
Sauteed Spinach (GF)
Onion Rings
Yellow Rice (GF)
  `),
  ...rows("Desserts", `
Featured Dessert\tAsk your server for today's feature.
Cheesecake Crème Brulee\tCaramelized sugar, caramel sauce, whipped cream, fresh berries, white chocolate shavings.
Chocolate Chip Cookies A La Mode\tVanilla ice cream, chocolate ganache drizzle.
Bread Pudding\tCaramel sauce, à la mode, chantilly cream, fresh berries.
Ice Creams and Sorbet\tCookies and cream, pistachio, cherry stracciatella, raspberry sorbet, mango sorbet.
  `),
  ...rows("Beverages · Soda & Water", `
Coke, Diet Coke, Sprite & Ginger Ale
Lemonade
Saratoga Sparkling
Saratoga Distilled
  `),
  ...rows("Beverages · Iced Tea", `
Sweet Tea
Unsweet Black Tea
  `),
  ...rows("Beverages · Hot Tea", `
Vanilla Rooibos
Mint Tea
Chamomile Tea
Jasmine Green Tea
Earl Grey Tea
Oolong Tea
  `),
  ...rows("Beverages · Coffee", `
Medium Roast Drip Coffee
Espresso
Cappuccino
Latte
Macchiato
Americano
  `),
];

export function build1799PrimeAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = menuRows.map((row, index) => {
    const allergens = directAllergens(`${row.name} ${row.description ?? ""}`);
    const mayContain = row.glutenCrossContact ? ["gluten"] : [];
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.section,
      description: row.description,
      ingredientsText: row.description,
      sourceUrls: [sourceUrls1799Prime.dinner],
      sourceType: "official-pdf-menu",
      allergens,
      mayContain,
      allergenSourceType: allergens.length > 0
        ? "official-ingredients"
        : mayContain.length > 0
          ? "official-global-cross-contact-note"
          : "unavailable",
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: "osm-1799-prime-204629784",
    retrievedAt,
    sourceUrls: Object.values(sourceUrls1799Prime),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    crossContactOnlyCount: items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "The menu states that GF foods may contact gluten in the shared kitchen and does not guarantee against gluten cross-contact. Direct contains signals come only from item text; the GF warning is represented as mayContain gluten, not a negative claim.",
    items,
  };
}

function directAllergens(value) {
  const text = ` ${String(value).toLowerCase()} `;
  const matches = [
    ["shellfish", /\b(?:shrimp|crab|oyster|calamari|scallop|lobster|mussel|squid)s?\b/],
    ["milk", /\b(?:milk|cheese|cheddar|cream|creamed|creamy|parmesan|parmigiano|ricotta|feta|gorgonzola|bleu cheese|blue cheese|provolone|fromage|beurre blanc|ranch|au gratin|cheesecake|cr[eè]me brulee|ice cream|a la mode|à la mode|cappuccino|latte|macchiato)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["tree-nut", /\b(?:almond|pistachio|pecan|walnut|cashew|hazelnut|macadamia)s?\b/],
    ["egg", /\b(?:egg|eggs|aioli|tartar sauce|tartar|caesar dressing|b[eé]arnaise)\b/],
    ["fish", /\b(?:cod|salmon|branzino)\b/],
    ["soy", /\b(?:soy|miso|tofu|edamame|tamari)\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["mustard", /\bmustard\b/],
  ];
  const allergens = matches.filter(([, pattern]) => pattern.test(text)).map(([allergen]) => allergen);
  if (/\b(?:toast|panko|crostini|brioche|bun|baguette|sandwich|flour tortillas?|beer battered|croutons?|ziti|pappardelle|linguine|pasta|macaroni|cookies?|bread pudding|onion rings?)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/repairs/osm-1799-prime-204629784/corrected-menu.json",
  );
  const snapshot = build1799PrimeAuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
