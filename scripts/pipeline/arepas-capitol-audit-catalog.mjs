import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";

export const arepasCapitolRestaurantId = "osm-arepas-capitol-12316378227";
export const arepasCapitolReviewedAt = "2026-07-15T09:56:29.610Z";
export const arepasCapitolSourceUrls = Object.freeze({
  currentMerchantMenu: "https://www.doordash.com/store/arepas-capitol-dale-city-929219/",
  currentCorroboratingMenu: "https://www.beyondmenu.com/61039/woodbridge/arepas-capitol-woodbridge-22191.aspx",
  currentCorroboratingUberMenu: "https://www.ubereats.com/store/arepas-capitol-venezuelan-restaurant/TsCqd0wwRbiHNUx3qwbpBg",
  reviewedMenuPdf: "https://wnam-cdn.menuweb.menu/storage/media/companies_menu_pdf/114493331/arepas-capitol-woodbridge-menu.pdf",
  replacementDomain: "http://arepascapitoldalecityva.com/",
  retiredDomain: "http://www.arepascapitolusa.com/",
});

const reviewedMenuSections = Object.freeze([
  section("Appetizers", [
    item("Chicharron (Pork Bellies)", "Crispy fried pork belly served with a small corn patty."),
    item("4 Mini Cachapas"),
    item("5 Mini Arepas", "With nata and garlic sauce on the side."),
    item("Patacones De Carne O Pollo", "Green fried plantains topped with beef or chicken."),
    item("4 Mini Arepas Rellenas", "Pollo, carne, queso, and reina fillings."),
    item("4 Tequeños", "Mini cheese sticks wrapped in dough."),
    item("Appetizer Platter", "Four mini empanadas, four tequeños, and four mini cachapas."),
  ]),
  section("Breakfast", [
    item("3 Mini Arepas Breakfast", "Three mini arepas with scrambled eggs, black beans, and a choice of shredded beef, shredded chicken, or vegetables."),
    item("Cachitos", "Stuffed bread rolls filled with ham and cheese."),
  ]),
  section("Chef Specials", [
    item("Pabellon Criollo", "Rice, shredded beef, black beans, sweet plantains, eggs, and two mini arepas."),
    item("Grilled Salmon", "Grilled salmon served with yucca and sautéed vegetables."),
    item("Grilled Rib Eye Steak", "Grilled rib eye steak served with yucca fries, asparagus, and cilantro aioli."),
  ]),
  section("Soups", [
    item("Mondongo", "Tripe and vegetable stew."),
    item("Hervido De Res", "Beef and vegetable soup."),
  ]),
  section("Empanadas", [
    item("Venezuelan Empanada - Carne", "Fried empanada filled with shredded beef, onions, garlic, and cilantro."),
    item("Venezuelan Empanada - Pollo", "Fried corn-flour empanada filled with shredded chicken."),
    item("Venezuelan Empanada - Carne Molida", "Fried corn-flour empanada filled with seasoned ground beef."),
    item("Venezuelan Empanada - Queso", "Fried cornmeal empanada filled with white Venezuelan cheese."),
    item("Venezuelan Empanada - Pabellon", "Black beans, beef, plantains, and cheese."),
  ]),
  section("Arepas", [
    item("Carne Molida (Ground Beef)", "Arepa filled with seasoned ground beef and cheese."),
    item("Queso (Cheese)", "Grilled cornmeal arepa filled with white and shredded yellow cheese."),
    item("Atun (Tuna)", "Arepa with tuna, avocado, red onions, tomato, and mayonnaise."),
    item("Pelua (Beef and Cheese)", "Arepa filled with shredded beef and yellow cheese."),
    item("Catira (Chicken and Cheese)", "Corn-flour arepa filled with shredded chicken and gouda cheese."),
    item("Pabellon (Beef, Beans, Cheese and Plantains)", "Arepa filled with shredded beef, black beans, white cheese, and sweet plantains."),
    item("Reina Pepiada (Chicken Salad and Avocado)", "Arepa filled with shredded chicken, avocado, mayonnaise, and cilantro."),
    item("Domino (Black Beans and Cheese)", "Arepa filled with black beans and white cheese."),
    item("Arepas Combo", "Two arepas of your choice with a soda."),
    item("Vegena Sweet Plantains", "Arepa with sweet plantains, avocado, and black beans."),
    item("Jamon Y Queso (Ham and Cheese)", "Arepa filled with sliced ham and white Venezuelan cheese."),
    item("Carne Mechada (Shredded Beef)", "Arepa filled with shredded beef, white cheese, and cilantro sauce."),
    item("Pollo Mechado (Shredded Chicken)", "Arepa filled with shredded chicken seasoned with sweet peppers, onions, and garlic."),
  ]),
  section("Sandwiches & Burgers", [
    item("Cuban Sandwich", "Roasted pork, ham, cheese, mayonnaise, mustard, and pickles. Served with french fries."),
    item("Beef Pepito", "Melted cheese, beef, lettuce, tomatoes, onions, mayonnaise, mustard, and ketchup. Served with french fries."),
    item("Chicken Pepito", "Melted cheese, chicken, lettuce, tomatoes, onions, mayonnaise, mustard, and ketchup. Served with french fries."),
    item("Beef & Chicken Pepito", "Melted cheese, beef, chicken, lettuce, tomatoes, onions, mayonnaise, mustard, and ketchup. Served with french fries."),
    item("La Sifrina Burger", "Melted cheese, beef, lettuce, tomatoes, onions, mayonnaise, mustard, and ketchup. Served with french fries."),
    item("La Guerrera Burger", "Melted cheese, beef, lettuce, tomatoes, onions, mayonnaise, mustard, ketchup, bacon, ham, egg, and mushroom. Served with french fries."),
    item("Chicken Burger", "Melted cheese, grilled chicken breast, lettuce, tomatoes, onions, mayonnaise, mustard, and ketchup. Served with french fries."),
  ]),
  section("Kids Menu", [
    item("Chicken Tenders with French Fries", "Breaded fried chicken tenders with french fries."),
    item("Macaroni & Cheese with French Fries", "Elbow macaroni in cheese sauce with french fries."),
    item("Hot Dog with French Fries", "Hot dog on a bun with ketchup and mustard, served with french fries."),
    item("Pasta with Meatballs", "Spaghetti with beef meatballs and marinara sauce."),
    item("Apple Juice"),
  ]),
  section("Parrillas", [
    item("Parrilla Mar Y Tierra", "Beef, chicken, shrimp, and calamari sautéed with onions and peppers, with garden salad and a choice of french fries or fried yucca."),
    item("Parrilla De Carne", "Beef sautéed with onions and peppers, with garden salad and a choice of french fries or fried yucca."),
    item("Parrilla Mixta", "Beef and chicken sautéed with onions and peppers, with garden salad and a choice of french fries or fried yucca."),
  ]),
  section("Extra Sides", [
    item("Rice"),
    item("Sweet Plantains"),
    item("Fried Yucca"),
    item("French Fries"),
    item("Arepa Viuda", "Grilled cornmeal arepa without a filling."),
    item("Black Beans"),
    item("Avocado"),
    item("Small Garden Salad", "Lettuce, tomatoes, onions, bell peppers, banana peppers, and cheese."),
    item("4 Tostones", "Four fried green plantains."),
    item("8 Tostones", "Eight fried green plantains."),
    item("Extra Salsa", "Spicy house salsa."),
  ]),
  section("Desserts", [
    item("Tres Leches", "Sponge cake soaked in three milks and topped with whipped cream and a cherry."),
    item("Quesillo", "Venezuelan flan."),
  ]),
  section("Drinks", [
    item("Coke"), item("Diet Coke"), item("Sprite"), item("Sunkist"), item("Pepsi"),
    item("Diet Pepsi"), item("Inca Cola"), item("Coke Zero"), item("Canada Dry Ginger Ale"),
    item("Fress Kolita (Venezuelan Soda)"),
    item("Malta Polar (Venezuelan Malt)", "Non-alcoholic malt beverage brewed from barley, hops, and water with sugar and caramel color."),
    item("Colombiana (Colombian Soda)"), item("Manzanita Postobon (Colombian)"),
    item("Sweet Tea"), item("Bottle of Water"), item("Black Coffee"),
    item("Café Con Leche", "Espresso with steamed milk."), item("Hot Tea"),
  ]),
  section("Natural Juices", [
    item("Parchita (Passion Fruit)"), item("Mora (Blackberry)"), item("Tamarindo (Tamarind)"),
    item("Guanabana (Soursop)"), item("Papaya"),
    item("Cocada", "Coconut milkshake with toasted coconut flakes."),
    item("Chicha (Cooked Rice with Milk Cream)", "Cooked rice, milk, condensed milk, and cinnamon."),
  ]),
]);

const categoryOrder = reviewedMenuSections.map((entry) => entry.category);

export async function buildArepasCapitolCatalog({ retrievedAt = arepasCapitolReviewedAt } = {}) {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const items = reviewedMenuSections.flatMap(({ category, items: rows }) => rows.map((row) => {
    const base = {
      auditItemKey: "",
      id: slugify(row.name),
      name: row.name,
      category,
      description: row.description,
      ingredientsText: row.description,
      imageUrl: null,
      isConfigurable: row.name === "Arepas Combo",
      allergenSourceType: "unavailable",
      allergens: [],
      mayContain: [],
      sourceType: "reviewed-third-party-merchant-menu",
      sourceUrls: [
        arepasCapitolSourceUrls.currentMerchantMenu,
        arepasCapitolSourceUrls.currentCorroboratingMenu,
        arepasCapitolSourceUrls.reviewedMenuPdf,
      ],
      sourceSummary: "The exact-address current merchant menu and two corroborating third-party catalogs support this product, but no current restaurant-issued allergen guide or complete ingredient disclosure was found. Menu wording remains labeled Ingredient Intelligence and official fixed and cross-contact data stay unavailable.",
      evidence: [
        {
          sourceKind: "third-party-merchant-set-menu-text",
          sourceUrl: arepasCapitolSourceUrls.currentMerchantMenu,
          text: `${row.name}${row.description ? `: ${row.description}` : ""}`,
        },
        {
          sourceKind: "third-party-current-menu-corroboration",
          sourceUrl: arepasCapitolSourceUrls.currentCorroboratingMenu,
          text: row.name,
        },
        {
          sourceKind: "third-party-reviewed-menu-pdf",
          sourceUrl: arepasCapitolSourceUrls.reviewedMenuPdf,
          text: row.name,
        },
      ],
      variantGroup: null,
    };
    return correctIngredientIntelligence(annotateMenuItemWithIngredientIntelligence(base, { manifest }));
  }));

  items.sort((left, right) =>
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
    left.name.localeCompare(right.name),
  );
  items.forEach((entry, index) => { entry.auditItemKey = `${index + 1}:${entry.id}`; });

  if (items.length !== 85) throw new Error(`Arepas Capitol expected 85 canonical current products, found ${items.length}.`);
  if (new Set(items.map((entry) => entry.id)).size !== items.length) throw new Error("Arepas Capitol product ids are not unique.");
  return {
    schemaVersion: 1,
    restaurantId: arepasCapitolRestaurantId,
    retrievedAt,
    sourceUrls: Object.values(arepasCapitolSourceUrls),
    sourceAddress: "1000 Cannons Ct Unit 105, Woodbridge, VA 22191",
    itemCount: items.length,
    sourcePresentationCount: 86,
    categoryCount: new Set(items.map((entry) => entry.category)).size,
    officialIngredientCount: 0,
    unavailableAllergenCount: items.length,
    itemNameFingerprint: createHash("sha256")
      .update(items.map((entry) => normalize(entry.name)).sort().join("\n"))
      .digest("hex"),
    sourceWarning: "The configured arepascapitolusa.com domain no longer resolves, and the replacement restaurant-branded domain now serves a generic FromTheRestaurant app-download page. The current exact-address DoorDash menu says prices are set directly by the merchant and is corroborated by current Beyond Menu and Uber Eats listings plus an April 2026 third-party PDF. These sources establish the working menu boundary but are not restaurant-issued allergen evidence. The 86 source presentations deduplicate to 85 products because 8 Tostones appears in both Appetizers and Extra Sides. All 85 products remain officially unavailable; explicit wording is retained only as labeled Ingredient Intelligence, and no cross-contact claim is invented.",
    items,
  };
}

function correctIngredientIntelligence(entry) {
  let next = entry;
  if (
    /corn(?:meal|-flour)/i.test(entry.description ?? "") &&
    /(?:arepa|empanada)/i.test(`${entry.name} ${entry.description ?? ""}`)
  ) {
    next = removeInferences(next, ["wheat", "gluten"], ["empanada_wrapper", "flour_tortilla", "wheat_flour"]);
  }
  if (entry.name === "Malta Polar (Venezuelan Malt)") {
    next = removeInferences(next, ["wheat"], []);
  }
  return next;
}

function removeInferences(entry, allergenIds, ingredientIds) {
  return {
    ...entry,
    extractedIngredientMentions: (entry.extractedIngredientMentions ?? []).filter(
      (mention) => !ingredientIds.includes(mention.ingredientId),
    ),
    inferredIngredients: (entry.inferredIngredients ?? []).filter((id) => !ingredientIds.includes(id)),
    inferredAllergenSignals: (entry.inferredAllergenSignals ?? []).filter(
      (signal) => !allergenIds.includes(signal.id),
    ),
    inferenceQuestions: (entry.inferenceQuestions ?? []).filter((question) =>
      !(allergenIds.includes("wheat") && /wheat flour|bread|pasta|tortilla/i.test(question)) &&
      !(allergenIds.includes("gluten") && /gluten/i.test(question))
    ),
    inferenceSummary: "Current third-party menu wording was reviewed; explicit cornmeal or corn-flour wording is not treated as wheat/gluten evidence, and barley malt is gluten but not wheat evidence.",
    inferenceVersion: "restaurant-menu-review-2026-07-15",
  };
}

function section(category, items) { return { category, items }; }
function item(name, description = null) { return { name, description }; }
function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildArepasCapitolCatalog();
  const outputPath = path.resolve(`data/restaurant-verification/repairs/${arepasCapitolRestaurantId}/corrected-menu.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    restaurantId: snapshot.restaurantId,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
  }, null, 2));
}
