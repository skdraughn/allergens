import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAir = "air-restaurant-washington-dc-dc-metro";
export const sourceUrlAir = "https://theairdc.com/menu";

const formulations = Object.freeze([
  item("Happy Hour", "Fried Shrimp", "", ["shellfish"]),
  item("Happy Hour", "Air Southern Chicken Tenders", "", []),
  item("Happy Hour", "Wings", "Choice of Jerk or Fried", []),
  item("Happy Hour", "Hand Cut Fries", "", []),

  item("Dine & Dance — First Course", "Mix Greens Chef Salad", "", []),
  item("Dine & Dance — Second Course", "Crab Cake", "Served w/ Tricolor Corn & Relish w/ a Lobster Cream Sauce", ["milk", "shellfish"]),
  item("Dine & Dance — Second Course", "Broiled Twin Lobster Tails", "Served w/ Mashed Potato & Asparagus", ["shellfish"]),
  item("Dine & Dance — Third Course", "Mixed Berries", "", []),

  item("Pre-Fix Late Brunch", "Chicken & Waffles", "", ["milk", "egg", "wheat", "gluten"]),
  item("Pre-Fix Late Brunch", "Steak Burger w/ Fries", "", ["wheat", "gluten"]),

  item("Dinner — Starters", "Fried Green Tomato", "Cornmeal crusted, House Pimento cheese, Brown sugar and pepper glazed bacon", ["milk"]),
  item("Dinner — Starters", "Air Chicken Tenders", "w/ Honey Mustard | French Fries", ["mustard"]),
  item("Dinner — Starters", "Fried Shrimp", "Served w/ Cocktail Sauce", ["shellfish"]),
  item("Dinner — Starters", "Jerk Wings", "Mango Chutney | Fries + $4", []),
  item("Dinner — Starters", "Fried Wings", "Honey Mustard | Fries + $4", ["mustard"]),
  item("Dinner — Starters", "Shrimp & Grits", "A Low Country Classic", ["shellfish"], {
    presentations: [
      { surface: "Dinner Menu", category: "Starters" },
      { surface: "Pre-Fix Late Brunch Menu", category: "Entree" },
    ],
  }),
  item("Dinner — Starters", "Chopped Salad", "Greens, Cucumber, Tomato, Carrots, Croutons, Buttermilk Dressing", ["milk", "wheat", "gluten"]),

  item("Dinner — Entrees", "Rotisserie Chicken", "W/ Vegetables & Yellow Rice", []),
  item("Dinner — Entrees", "SIRLOIN STEAK STRIPS", "W/ DEMI GLAZE SAUCE, SEASONED FRIES & SIDE SALAD", [], {
    presentations: [
      { surface: "Dinner Menu", category: "Entrees" },
      { surface: "Pre-Fix Late Brunch Menu", category: "Entree" },
    ],
  }),
  item("Dinner — Entrees", "Grilled Lamb Chops", "Served w/ Mashed Potato & Todays Vegetable", [], {
    presentations: [
      { surface: "Dinner Menu", category: "Entrees" },
      { surface: "Dine & Dance Menu", category: "Second Course" },
    ],
  }),
  item("Dinner — Entrees", "Blackened Salmon", "Served w/ Mashed Potatoes, Todays Vegetable", ["fish"]),
  item("Dinner — Entrees", "8 oz. Center Cut Filet Mignon", "8 oz Served w/ Mashed Potatoes, Demi Glaze & Todays vegetable", []),
  item("Dinner — Entrees", "Bowtie Pasta", "Spinach, Shitake Mushrooms, Caramelized Onions, Parmesan & Cream | Add Shrimp +10 | Add Chicken +8 | Add Salmon +10", ["milk", "wheat", "gluten"], {
    isConfigurable: true,
    presentations: [
      { surface: "Dinner Menu", category: "Entrees" },
      { surface: "Dine & Dance Menu", category: "Second Course" },
    ],
  }),
  item("Dinner — Entrees", "AIR Angus Burger", "Angus burger (8oz) served with fries", ["wheat", "gluten"]),

  item("Dinner — Sides", "Mac & Cheese", "", ["milk", "wheat", "gluten"]),
  item("Dinner — Sides", "Mashed Potatoes", "", []),
  item("Dinner — Sides", "Air Fries", "", []),
  item("Dinner — Sides", "Todays Vegetables", "", []),

  item("Dinner — Sweets", "Chocolate Mousse Cake", "", ["milk", "egg", "wheat", "gluten"], {
    presentations: [
      { surface: "Dinner Menu", category: "Sweets" },
      { surface: "Dine & Dance Menu", category: "Third Course", publishedName: "Chocolate Moose Cake" },
    ],
  }),

  item("Late Night", "Caesar Salad", "", []),
  item("Late Night", "Jerk Wings", "", []),
  item("Late Night", "Fried Wings", "", []),
  item("Late Night", "Chicken Tenders w/ Fries", "", []),
  item("Late Night", "French Fries", "", []),
  item("Late Night", "AIR Angus Burger", "Angus burger (8oz) with fries", ["wheat", "gluten"]),

  item("Party Platters", "Jerk Chicken", "Feeds around 8–10 people", []),
  item("Party Platters", "Fried Chicken", "Feeds around 8–10 people", []),
  item("Party Platters", "Salmon", "Feeds around 8–10 people", ["fish"]),
  item("Party Platters", "French Fries", "Feeds around 8–10 people", []),
  item("Party Platters", "Steamed Vegtables", "Feeds around 8–10 people", []),
]);

export function buildAirRestaurantAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = formulations.map((formulation, index) => {
    const id = `${slugify(formulation.category)}-${slugify(formulation.name)}`;
    return {
      auditItemKey: `${index + 1}:${id}`,
      id,
      name: formulation.name,
      category: formulation.category,
      variantGroup: formulation.category,
      description: formulation.description,
      ingredientsText: fixedText(formulation.description),
      isConfigurable: Boolean(formulation.isConfigurable),
      presentations: formulation.presentations ?? [{ surface: surface(formulation.category), category: section(formulation.category) }],
      sourceUrls: [sourceUrlAir],
      sourceType: "restaurant-issued-menu",
      allergens: [...formulation.allergens],
      mayContain: [],
      allergenSourceType: formulation.allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  if (items.length !== 40 || new Set(items.map((item) => item.id)).size !== 40) {
    throw new Error("Air Restaurant current formulation identities changed.");
  }
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAir,
    retrievedAt,
    sourceUrls: [sourceUrlAir],
    presentationCount: 45,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "Air publishes current menu names and selected descriptions but no complete allergen matrix, recipes, or cross-contact policy. Positive signals use fixed published text and unavoidable named formats only. Optional Bowtie Pasta add-ons, the page-wide raw-food warning, bottle service, and alcohol are not assigned as item allergens.",
    items,
  };
}

function item(category, name, description, allergens, options = {}) {
  return { category, name, description, allergens, ...options };
}

function fixedText(description) {
  return description.split(/\|\s*Add\s/i)[0].trim();
}

function surface(category) {
  if (category.startsWith("Dine & Dance")) return "Dine & Dance Menu";
  if (category === "Pre-Fix Late Brunch") return "Pre-Fix Late Brunch Menu";
  if (category === "Happy Hour") return "Happy Hour Menu";
  if (category === "Late Night") return "Late Night Menu";
  if (category === "Party Platters") return "Party Platters";
  return "Dinner Menu";
}

function section(category) {
  return category.includes(" — ") ? category.split(" — ").slice(1).join(" — ") : category;
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAirRestaurantAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAir}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ itemCount: snapshot.itemCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
