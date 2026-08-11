import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build1799PrimeAuditSnapshot } from "./1799-prime-audit-catalog.mjs";

export const cocktailSourceUrl1799Prime =
  "https://1799prime.com/wp-content/uploads/Cocktail-Menu-06.2026.pdf";

const cocktails = [
  ["Island Vice", "Michter's bourbon, amaretto, fresh citrus, pineapple, grilled pineapple."],
  ["Matcha Made Me Do It", "Chopin vodka, vanilla, white chocolate, espresso, matcha dusting."],
  ["Forbidden Fruit", "Aged Tequila Ocho, passion fruit, dragon fruit, citrus, floral notes."],
  ["Lena Marie", "Frozen peach bellini, pomegranate, cherry."],
  ["Caught in the Garden", "Ghost tequila, cucumber, citrus, agave, mint-sugar rim."],
  ["Dirty Diana", "Empress 1908 gin, pear, vanilla, champagne, botanicals, dehydrated pear."],
  ["Smoke Signal", "Los Siete mezcal, citrus, cherry notes, aromatic smoke, torched orange peel."],
  ["Cloud Nine", "Whipped Chopin vodka, limoncello, cream, citrus, graham cracker crumble."],
  ["Cognac Confessions", "Remy V cognac, dark chocolate, cherry undertones."],
  ["I Am Quando", "Los Siete mezcal, Fort Mose bourbon, amaro, bitters, cognac-soaked Luxardo cherries."],
  ["Skywalker", "Caribbean Plantery 3 Star rum, mango, citrus, coconut, pineapple-coconut cream."],
  ["Bourbon Nada", "Fort Mose bourbon, mango, optional tableside smoke."],
];

export function build1799PrimeCocktailAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const base = build1799PrimeAuditSnapshot({ retrievedAt });
  const cocktailItems = cocktails.map(([name, description], index) => {
    const allergens = name === "Cloud Nine"
      ? ["milk", "wheat", "gluten"]
      : name === "Matcha Made Me Do It"
        ? ["milk"]
        : [];
    return {
      auditItemKey: `${base.items.length + index + 1}:${slugify(name)}`,
      id: slugify(name),
      name,
      category: "Beverages · Cocktails",
      description,
      ingredientsText: description,
      sourceUrls: [cocktailSourceUrl1799Prime],
      sourceType: "official-pdf-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  const items = [...base.items, ...cocktailItems];

  return {
    ...base,
    restaurantId: "1799-prime-steak-and-seafood-alexandria-va-dc-metro",
    sourceUrls: [...base.sourceUrls, cocktailSourceUrl1799Prime],
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    crossContactOnlyCount: items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: `${base.sourceWarning} Cocktail descriptions are also partial menu text rather than a complete allergen matrix.`,
    items,
  };
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/repairs/1799-prime-steak-and-seafood-alexandria-va-dc-metro/corrected-menu.json",
  );
  const snapshot = build1799PrimeCocktailAuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
