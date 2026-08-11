import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAmbassador = "replacement-ambassador-restaurant-washington-dc";

export const sourceUrlsAmbassador = Object.freeze({
  officialHome: "https://ambassadorwashington.com/",
  officialMenu: "https://ambassadorwashington.com/menu/",
  uberMenu: "https://www.ubereats.com/store/ambassador-eritrean-%26-ethiopian-restaurant/CBbWOUs_SZOy4_p_DciOwg",
  restaurantji: "https://www.restaurantji.com/dc/washington/ambassador-restaurant-/",
  restaurantjiDesktop: "https://cdn6.localdatacdn.com/images/4891264/d_ambassador_restaurant_menu.jpg?q=6a4793a994eb8",
  restaurantjiMobile: "https://cdn6.localdatacdn.com/images/4891264/m_ambassador_restaurant_menu.jpg?q=6a4793a994eba",
  allmenus: "https://www.allmenus.com/dc/washington/352924-ambassador-restaurant-bar/menu/",
});

const restaurantLinkedRows = [
  row("Breakfast", "Jambo Fatta", "Chopped bread mixed with spicy Eritrean tomato sauce.", ["wheat", "gluten"]),
  row("Breakfast", "Kitcha Fitfit", "Chopped Eritrean barley bread mixed with spicy tomato sauce, butter, and hot pepper.", ["milk", "gluten"]),
  row("Breakfast", "Egg Frittata", "Scrambled egg mixed in spicy tomato sauce and bread.", ["egg", "wheat", "gluten"]),
  row("Breakfast", "Mortadella Sandwich", "Mortadella, lettuce, tomato, green pepper, onion, and spicy dressing.", ["wheat", "gluten"], { confidence: "medium" }),
  row("Breakfast", "Fuul", "Squashed fava beans mixed with chopped tomato, onion, plain yogurt, feta cheese, and olive oil.", ["milk"]),
  row("Breakfast", "Sandwich", "Lettuce, tomato, green pepper, onion, and spicy dressing.", ["wheat", "gluten"], { confidence: "medium" }),
  row("Vegetarian Dishes", "Veggie Combo", "Shiro chickpea stew, spinach, cabbage, yellow split peas, red lentils, okra, beets, and salad."),
  row("Vegetarian Dishes", "Shiro", "Chickpea stew simmered in berbere."),
  row("Vegetarian Dishes", "Bozena Shiro", "Chickpea stew simmered in berbere with chunks of lean beef."),
  row("Vegetarian Dishes", "Hamli with Dinish", "Spinach and potato stew."),
  row("Traditional Dishes", "Special Tibsi", "Fresh lamb strips fried with onions, tomatoes, garlic, jalapeno pepper, and sauce."),
  row("Traditional Dishes", "Ambassador Tibsi", "Strips of tender beef fried with onions, tomatoes, garlic, jalapeno pepper, and sauce."),
  row("Traditional Dishes", "Siga Dinish", "Stew with strips of fresh beef and potato cooked with garlic, onions, ginger, and olive oil."),
  row("Traditional Dishes", "Chicken Tibsi", "Chicken tibsi; the restaurant-linked delivery description is internally corrupted and is not used for ingredient inference."),
  row("Traditional Dishes", "Hamli with Siga", "Spinach pan fried with strips of beef, onions, and tomato sauce."),
  row("Traditional Dishes", "Hamli Chicken", "Spinach pan fried with chicken, onions, and tomato sauce."),
  row("Italian or Mediterranean Dishes", "Spaghetti with Tibsi", "Tibsi with tomatoes, onions, and jalapenos, served with spaghetti, salad, and bread.", ["wheat", "gluten"]),
  row("Italian or Mediterranean Dishes", "Fish", "Fish prepared with tomatoes, onions, and spices, served with salad and bread.", ["fish", "wheat", "gluten"]),
  row("Italian or Mediterranean Dishes", "Spaghetti", "Spaghetti served with salad and bread.", ["wheat", "gluten"]),
  row("Italian or Mediterranean Dishes", "Chicken", "Chicken breast pan fried in breadcrumbs, served with salad and bread.", ["wheat", "gluten"], { officialOverlap: true }),
];

const officialOnlyRows = [
  row("Official Guest Favorites", "Espresso", null, [], { officialOnly: true }),
  row("Official Guest Favorites", "Ethiopian Stew", null, [], { officialOnly: true }),
  row("Official Guest Favorites", "Beets", null, [], { officialOnly: true }),
  row("Official Guest Favorites", "Spinach", null, [], { officialOnly: true }),
  row("Official Guest Favorites", "Lettuce", null, [], { officialOnly: true }),
  row("Official Guest Favorites", "Cabbage", null, [], { officialOnly: true }),
];

export function buildAmbassadorAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const rows = [...restaurantLinkedRows, ...officialOnlyRows];
  const items = rows.map((entry, index) => {
    const restaurantLinked = !entry.officialOnly;
    const sourceUrls = restaurantLinked
      ? [
          ...(entry.officialOverlap ? [sourceUrlsAmbassador.officialMenu] : []),
          sourceUrlsAmbassador.uberMenu,
          sourceUrlsAmbassador.restaurantji,
          sourceUrlsAmbassador.restaurantjiDesktop,
          sourceUrlsAmbassador.restaurantjiMobile,
          sourceUrlsAmbassador.allmenus,
        ]
      : [sourceUrlsAmbassador.officialMenu];
    const inferredAllergenSignals = entry.inferredAllergens.map((id) => ({
      id,
      c: entry.confidence ?? "high",
      e: [`reviewed-menu-wording:${slugify(entry.name)}`],
    }));
    const presentationSources = [
      ...(entry.officialOnly || entry.officialOverlap
        ? [{ sourceName: entry.name, sourceUrl: sourceUrlsAmbassador.officialMenu }]
        : []),
      ...(restaurantLinked
        ? [{ sourceName: entry.name, sourceUrl: sourceUrlsAmbassador.uberMenu }]
        : []),
    ];

    return {
      auditItemKey: `${index + 1}:${slugify(entry.name)}`,
      id: slugify(entry.name),
      name: entry.name,
      category: entry.category,
      description: entry.description,
      ingredientsText: entry.description,
      imageUrl: null,
      isConfigurable: false,
      presentations: presentationSources,
      sourceUrls: [...new Set(sourceUrls)],
      sourceType: entry.officialOnly
        ? "restaurant-issued-menu-page"
        : entry.officialOverlap
          ? "restaurant-issued-menu-page+reviewed-restaurant-linked-delivery-menu"
          : "reviewed-restaurant-linked-delivery-menu",
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary: inferredAllergenSignals.length > 0
        ? "No restaurant-issued allergen disclosure was located. Ingredient Intelligence reflects only the named ingredients in current/recent menu wording and is not an official or complete allergen statement."
        : "No restaurant-issued item-level ingredient or allergen disclosure was located; allergen data remains unavailable.",
      extractedIngredientMentions: entry.inferredAllergens.map((allergen) => ({
        ingredientId: `reviewed_${allergen}`,
        label: allergen,
        sourceField: "reviewedMenuDescription",
        text: entry.description ?? entry.name,
      })),
      inferredIngredients: entry.inferredAllergens.map((allergen) => `reviewed_${allergen}`),
      inferredAllergenSignals,
      inferenceQuestions: [],
      inferenceSummary: inferredAllergenSignals.length > 0
        ? `Reviewed menu wording supports Ingredient Intelligence signals for ${entry.inferredAllergens.join(", ")}.`
        : "No supported item-level allergen signal is available.",
      inferenceVersion: "restaurant-menu-review-2026-07-15",
      evidence: [{
        sourceKind: entry.officialOnly ? "restaurant-issued-menu-text" : "reviewed-restaurant-linked-menu-text",
        sourceUrl: entry.officialOnly ? sourceUrlsAmbassador.officialMenu : sourceUrlsAmbassador.uberMenu,
        text: `${entry.name}${entry.description ? `: ${entry.description}` : ""}`,
      }],
    };
  });

  const normalizedNames = items.map((item) => normalize(item.name));
  if (new Set(normalizedNames).size !== items.length) {
    throw new Error("Ambassador audit snapshot contains duplicate formulations.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmbassador,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAmbassador),
    itemCount: items.length,
    presentationCount: items.reduce((sum, item) => sum + item.presentations.length, 0),
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialAllergenCount: 0,
    unavailableAllergenCount: items.length,
    itemNameFingerprint: createHash("sha256").update([...normalizedNames].sort().join("\n")).digest("hex"),
    sourceWarning: "The current first-party site publishes only seven generic guest-favorite rows and no allergen disclosure. A restaurant-identity-matched Uber Eats catalog closed May 5, 2026; the same 20-row catalog is preserved in Restaurantji menu images on a page updated in May 2026 and is corroborated by the longer AllMenus catalog. Those 20 formulations are retained as reviewed restaurant-linked evidence, never promoted to restaurant-issued allergen evidence. Twelve frozen rows are page chrome or marketing copy. Ingredient Intelligence is limited to explicit item wording; barley malt/bread supports gluten but not wheat unless wheat bread is separately identified, and no absent allergen is treated as a negative assurance.",
    items,
  };
}

function row(category, name, description = null, inferredAllergens = [], options = {}) {
  return { category, name, description, inferredAllergens, ...options };
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
    `data/restaurant-verification/repairs/${restaurantIdAmbassador}/corrected-menu.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  const snapshot = buildAmbassadorAuditSnapshot();
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
  }, null, 2));
}
