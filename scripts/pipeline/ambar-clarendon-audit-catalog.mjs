import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAmbarClarendon = "ambar-restaurant-clarendon-arlington-va-dc-metro";

export const sourceUrlsAmbarClarendon = Object.freeze({
  location: "https://ambarrestaurant.com/ambarclarendon",
  menuIndex: "https://ambarrestaurant.com/page/clarendon-menus",
  online: "https://ambarrestaurant.com/menu/ambarclarendon",
  aLaCarte: "https://static-content.owner.com/document/f413c88a-091a-47c8-b839-f244ff229ab1.pdf",
  unlimitedBrunch: "https://static-content.owner.com/document/a51f9ef3-91c0-4f7e-9672-b9dbe484c13b.pdf",
  unlimitedLunch: "https://static-content.owner.com/document/352c4c7a-7a85-4e3d-9e2a-be45f0b5c92c.pdf",
  unlimitedDinner: "https://static-content.owner.com/document/9c0e51c8-4d7e-4201-a89d-c4c122344e47.pdf",
  desserts: "https://static-content.owner.com/document/76160707-5a2f-4b0c-a194-694550cea79e.pdf",
  drinks: "https://static-content.owner.com/document/f35d26c5-87b2-4d35-a5bf-6f4f86960cab.pdf",
  happyHour: "https://static-content.owner.com/document/030e19b3-3601-410c-a33c-a90b9fc90453.pdf",
  allergyLunchDinner: "https://static-content.owner.com/document/0633f2f4-1ebd-4d39-98b9-c24525c1e947.pdf",
  veganVegetarian: "https://static-content.owner.com/document/f66ddf55-30b3-4c75-b62e-16afa2813632.pdf",
  heinekenProduct: "https://www.heineken.com/us/en/our-beers/heineken-0-0",
});

const coreSources = ["aLaCarte", "unlimitedLunch", "unlimitedDinner"];
const sixCodeAllergens = Object.freeze({ D: "milk", G: "gluten", N: "tree-nut", SF: "shellfish", E: "egg", S: "sesame" });

const currentFormulations = Object.freeze([
  // Current June 23, 2026 Clarendon lunch, dinner, and a-la-carte documents.
  item("Lunch & Dinner - Spreads", "Kajmak", "Rich, creamy traditional Balkan skimmed-milk spread; served with a bread basket or vegetables", ["milk", "wheat", "gluten", "egg", "sesame"], coreSources, { aliases: ["Clotted Cream"], codes: ["D", "G*", "E*", "S*"] }),
  item("Lunch & Dinner - Spreads", "Ajvar", "Roasted pepper, garlic, and eggplant spread; served with a bread basket or vegetables", ["wheat", "gluten", "egg", "sesame"], coreSources, { codes: ["G*", "E*", "S*"] }),
  item("Lunch & Dinner - Spreads", "Urnebes", "Feta cheese with chili flakes and roasted pepper jam; served with a bread basket or vegetables", ["milk", "wheat", "gluten", "egg", "sesame"], coreSources, { codes: ["D", "G*", "E*", "S*"] }),
  item("Lunch & Dinner - Spreads", "White Bean Hummus", "Cannellini beans with pickled jalapeno; served with a bread basket or vegetables", ["wheat", "gluten", "egg", "sesame"], [...coreSources, "online"], { codes: ["G*", "E*", "S*"] }),
  item("Lunch & Dinner - Spreads", "House Marinated Olives & Pickles", "Pickled vegetables, mixed marinated olives, sesame seeds, and fresno peppers", ["sesame"], coreSources, { aliases: ["Marinated Olives in Pickled Vegetables"], codes: ["S*"] }),
  item("Lunch & Dinner - Spreads", "Beet Tzatziki", "Beet yogurt spread with garlic and dill; served with a bread basket or vegetables", ["milk", "wheat", "gluten", "egg", "sesame"], [...coreSources, "online"], { codes: ["D", "G*", "E*", "S*"] }),
  item("Lunch & Dinner - Spreads", "Spreads Tasting", "Ajvar, urnebes, white bean hummus, beet tzatziki, marinated olives, and pickles, served with bread or vegetables", ["milk", "wheat", "gluten", "egg", "sesame"], ["aLaCarte", "happyHour"], { codes: ["D*", "G*", "E*", "S*"] }),

  item("Lunch & Dinner - Premium", "Tuna Tartare", "Tuna, pear salsa, arugula, squid-ink butter, almonds, and crostini", ["milk", "tree-nut", "fish", "shellfish", "wheat", "gluten"], coreSources, { codes: ["D*", "G*", "N*", "SF*"] }),
  item("Lunch & Dinner - Premium", "Scallops", "Seared scallops over butternut squash puree with toasted pumpkin seeds", ["milk", "shellfish"], coreSources, { codes: ["D*", "SF"] }),
  item("Lunch & Dinner - Premium", "Grilled Branzino", "Branzino with ladolemono sauce and citrus fennel salad", ["fish"], [...coreSources, "online"], { aliases: ["Branzino"] }),
  item("Lunch & Dinner - Premium", "NY Strip Steak", "NY strip steak with parmesan puree and chimichurri", ["milk", "gluten"], coreSources, { aliases: ["Steak Frites"], codes: ["D*", "G*"] }),
  item("Lunch & Dinner - Premium", "Lamb Chops", "Lamb chops with charred onion labneh and fries", ["milk", "gluten", "shellfish", "egg", "sesame"], coreSources, { codes: ["D*", "G*", "SF*", "E*", "S*"] }),

  item("Lunch & Dinner - Soups & Salads", "Balkan Salad", "Pepper, onion, cucumber, cherry tomatoes, feta, and sherry vinaigrette", ["milk"], [...coreSources, "unlimitedBrunch", "online", "happyHour"], { codes: ["D*"] }),
  item("Lunch & Dinner - Soups & Salads", "Beet Salad", "Roasted beets, arugula, candied pecans, and goat cheese", ["milk", "tree-nut"], coreSources, { codes: ["D*", "N*"] }),
  item("Lunch & Dinner - Soups & Salads", "Vitamin Salad", "Cucumber, beets, apples, carrots, sunflower seeds, and honey-lemon dressing", [], [...coreSources, "unlimitedBrunch", "online"]),
  item("Lunch & Dinner - Soups & Salads", "Ambar Caesar", "Romaine or gem lettuce, Hungarian dressing, croutons, and parmigiano", ["milk", "wheat", "gluten", "egg", "shellfish"], coreSources, { aliases: ["Balkan Caesar Salad"], codes: ["D*", "G*", "E*", "SF*"] }),
  item("Lunch & Dinner - Soups & Salads", "Tomato Soup", "Roasted tomatoes, red bell peppers, basil, and house-made pesto", ["milk", "tree-nut"], [...coreSources, "unlimitedBrunch", "online"], { codes: ["D*", "N*"] }),
  item("Lunch & Dinner - Soups & Salads", "Veal Soup", "Veal, root vegetables, and creme fraiche", ["milk", "gluten"], [...coreSources, "unlimitedBrunch", "online", "happyHour"], { codes: ["D*", "G"] }),

  item("Lunch & Dinner - Chef Signatures", "Pepper & Cheese Croquettes", "Cheese-stuffed piquillo peppers with herb and panko crust and cranberry chutney", ["milk", "wheat", "gluten", "egg"], coreSources, { aliases: ["Piquillo Croquettes", "Pepper & Cheese Croquette"], codes: ["D", "G", "E"] }),
  item("Lunch & Dinner - Chef Signatures", "Fried Chicken", "Buttermilk-marinated chicken with breadcrumb and almond crust and apple-wasabi slaw", ["milk", "tree-nut", "wheat", "gluten"], [...coreSources, "unlimitedBrunch", "online", "happyHour"], { aliases: ["Almond Fried Chicken", "Fried Chicken Sliders"], codes: ["D", "G", "N"] }),
  item("Lunch & Dinner - Chef Signatures", "Halloumi", "Pan-seared cheese with sesame-seed crust and honey", ["milk", "sesame"], coreSources, { codes: ["D", "S*"] }),
  item("Lunch & Dinner - Chef Signatures", "Lamb Lasagna", "Lamb ragu, eggplant, bechamel, cheese, tomato sauce, and lasagna dough", ["milk", "wheat", "gluten", "egg"], [...coreSources, "online"], { codes: ["D", "G", "E"] }),

  item("Lunch & Dinner - Vegetables", "Asparagus", "Asparagus with gorgonzola sauce and balsamic reduction", ["milk"], coreSources, { codes: ["D*"] }),
  item("Lunch & Dinner - Vegetables", "Eggplant Moussaka", "Eggplant, zucchini, potatoes, tomato sauce, feta, and Parmesan", ["milk"], [...coreSources, "online"], { codes: ["D"] }),
  item("Lunch & Dinner - Vegetables", "Cauliflower", "Fried cauliflower with spinach tahini and pine-nut crumble", ["milk", "tree-nut", "gluten", "sesame"], [...coreSources, "online", "happyHour"], { codes: ["D*", "G*", "N*", "S*"] }),
  item("Lunch & Dinner - Vegetables", "Roasted Carrots", "Passion fruit-aji amarillo glaze, tofu-cashew cream, and pepita pistu", ["tree-nut", "soy"], coreSources, { aliases: ["Baby Carrots", "Roasted Baby Carrots"], codes: ["N*"] }),
  item("Lunch & Dinner - Vegetables", "Handcut Fries", "Wedge-cut fries with house spice blend and smoked aioli", ["gluten", "shellfish", "egg", "sesame"], [...coreSources, "happyHour", "online"], { aliases: ["Hand-Cut Fries", "Ambar Fries", "Wedge Potatoes"], codes: ["G", "SF*", "E*", "S*"] }),
  item("Lunch & Dinner - Vegetables", "Brussels Sprouts", "Brussels sprouts with bacon and lemon-garlic yogurt", ["milk"], [...coreSources, "online"], { aliases: ["Brussel Sprouts"], codes: ["D*"] }),
  item("Lunch & Dinner - Vegetables", "Crispy Corn Ribs", "Corn with chimichurri and whipped feta", ["milk"], coreSources, { codes: ["D"] }),
  item("Lunch & Dinner - Vegetables", "Mushroom Pilaf", "Arborio rice, vegetable stock, and mushroom ragu", [], [...coreSources, "unlimitedBrunch", "online"], { aliases: ["Mushroom Pilav"] }),

  item("Lunch & Dinner - Meat & Poultry", "Balkan Kebab", "House-ground beef kebabs served with lepinja and spicy feta", ["milk", "wheat", "gluten"], [...coreSources, "unlimitedBrunch", "online", "happyHour"], { aliases: ["Balkan Kebabs", "Cevapi 'Balkan Kebab'"], codes: ["D*", "G*"] }),
  item("Lunch & Dinner - Meat & Poultry", "Chicken Skewers", "Bell-pepper-marinated chicken with pickled onions and fresnos, served with lepinja", ["wheat", "gluten", "sesame"], coreSources, { codes: ["G", "S"] }),
  item("Lunch & Dinner - Meat & Poultry", "Smoked Sausage", "Smoked pork sausage with mustard, red cabbage slaw, and lepinja", ["egg", "wheat", "gluten", "mustard"], [...coreSources, "unlimitedBrunch"], { aliases: ["Grilled Pork Sausage"], codes: ["E*", "G*"] }),
  item("Lunch & Dinner - Meat & Poultry", "Lamb Medallions", "Lamb with lemon-garlic yogurt, pomegranate molasses, cucumber salad, and lepinja", ["milk", "wheat", "gluten", "egg"], coreSources, { aliases: ["Lamb Kefta", "Lamb Kebab"], codes: ["D*", "G", "E"] }),
  item("Lunch & Dinner - Meat & Poultry", "Beef Goulash", "Braised beef in red-wine reduction with orzo pasta", ["milk", "wheat", "gluten"], [...coreSources, "online"], { aliases: ["Short Rib Goulash", "Beef Short Rib Goulash"], codes: ["D", "G"] }),
  item("Lunch & Dinner - Meat & Poultry", "Pork Belly Stuffed Cabbage", "Cabbage stuffed with pork belly, rice, and root vegetables", ["milk"], [...coreSources, "online"], { aliases: ["Stuffed Cabbage", "Pork Belly Stuffed Sour Cabbage", "Sarma 'Pork Belly Stuffed Cabbage'"], codes: ["D*"] }),
  item("Lunch & Dinner - Meat & Poultry", "Roasted Lamb", "Roasted lamb shoulder with braised onion, carrot, and potatoes", [], coreSources, { aliases: ["Yaga 'Roasted Lamb'"] }),
  item("Lunch & Dinner - Meat & Poultry", "Chicken Stroganoff", "Chicken breast in creamy mushroom sauce with mashed potatoes", ["milk", "gluten", "mustard"], [...coreSources, "online"], { codes: ["D", "G"] }),

  item("Lunch & Dinner - Seafood", "Sesame Crusted Salmon", "Salmon with sesame crust, eggplant jam, horseradish, harissa, and arugula", ["egg", "fish", "sesame"], coreSources, { codes: ["E*", "S*"] }),
  item("Lunch & Dinner - Seafood", "Pan-Seared Trout", "Trout over lentil stew with gremolata", ["fish", "shellfish"], coreSources, { aliases: ["Grilled Trout"], codes: ["SF*"] }),
  item("Lunch & Dinner - Seafood", "Drunken Mussels", "Rakija-flambeed mussels in garlic cream sauce", ["milk", "shellfish"], [...coreSources, "happyHour"], { codes: ["D*", "SF"] }),
  item("Lunch & Dinner - Seafood", "Grilled Shrimp", "Shrimp over corn puree with feta", ["milk", "shellfish"], coreSources, { codes: ["D*", "SF"] }),

  item("Lunch & Dinner - Baked", "Cheese Pie", "Cheese and phyllo dough with ajvar emulsion and yogurt", ["milk", "wheat", "gluten", "egg"], [...coreSources, "unlimitedBrunch", "online"], { codes: ["D", "G", "E"] }),
  item("Lunch & Dinner - Baked", "Meat Pie", "Beef and leeks in phyllo dough with lemon-garlic yogurt", ["milk", "wheat", "gluten", "egg"], [...coreSources, "unlimitedBrunch", "online"], { codes: ["D", "G", "E"] }),
  item("Lunch & Dinner - Baked", "White Flatbread", "Feta and mozzarella with arugula, truffle oil, and olive oil", ["milk", "wheat", "gluten"], [...coreSources, "happyHour", "online"], { aliases: ["White Pizza"], codes: ["D", "G"] }),
  item("Lunch & Dinner - Baked", "Mushroom Flatbread", "Mushrooms, leeks, caramelized onion, arugula, and goat cheese on flatbread", ["milk", "wheat", "gluten"], [...coreSources, "unlimitedBrunch", "online"], { aliases: ["Mushroom Pizza"], codes: ["D*", "G"] }),
  item("Lunch & Dinner - Baked", "Sujuk Flatbread", "Sujuk beef sausage, mozzarella, tomato sauce, oregano, and flatbread", ["milk", "wheat", "gluten"], [...coreSources, "unlimitedBrunch", "online"], { aliases: ["Sujuk Pizza"], codes: ["D", "G"] }),

  // Current May 11, 2026 dessert document.
  item("Desserts", "Raspberry Cake", "Almond flour, whipped cream cheese, raspberry jelly, and chocolate glaze", ["milk", "tree-nut", "wheat", "gluten", "egg"], ["desserts", "online"], { codes: ["D", "G", "N", "E"] }),
  item("Desserts", "Baklava", "Phyllo pastry, pistachio, lemon-honey syrup, and dine-in vanilla ice cream", ["milk", "tree-nut", "wheat", "gluten"], ["desserts", "online"], { aliases: ["Pistachio Baklava"], codes: ["D", "G", "N"], isConfigurable: true }),
  item("Desserts", "Chocolate Cake", "Almond flour, Greek yogurt, espresso, milk chocolate, and hazelnuts", ["milk", "tree-nut", "egg"], ["desserts", "online"], { codes: ["D", "N", "E"] }),
  item("Desserts", "Sorbet Duo", "Peach and raspberry sorbet", [], ["desserts"]),

  // Current May 11, 2026 brunch-only formulations after consolidating shared rows above.
  item("Brunch - Start", "Olivier Spread", "Peas, green beans, carrot, mayonnaise, potato, and mustard, served with bread or vegetables", ["wheat", "gluten", "egg", "sesame", "mustard"], ["unlimitedBrunch"], { codes: ["G*", "E", "S*"] }),
  item("Brunch - Start", "Marinated Olives", "Mixed olives, sesame seeds, garlic, fresno peppers, and red onions", ["sesame"], ["unlimitedBrunch"], { codes: ["S"] }),
  item("Brunch - Start", "Housemade Pickles", "Pickled cauliflower, onions, red pepper, carrot, and turmeric", [], ["unlimitedBrunch"]),
  item("Brunch - Eggs", "Salmon Benedict", "Smoked salmon, lemon, hollandaise, and poached egg", ["milk", "wheat", "gluten", "egg", "fish"], ["unlimitedBrunch"], { codes: ["D*", "G*", "E*"] }),
  item("Brunch - Eggs", "Pulled Pork Benedict", "Pulled pork, ajvar, hollandaise, and poached egg", ["milk", "wheat", "gluten", "egg"], ["unlimitedBrunch"], { codes: ["D*", "G*", "E*"] }),
  item("Brunch - Eggs", "Shakshuka", "Stewed tomatoes, peppers, onions, and poached egg", ["egg"], ["unlimitedBrunch"], { aliases: ["Shakshuka Scramble"], codes: ["E*"] }),
  item("Brunch - Eggs", "Mediterranean Omelette", "Egg whites, olives, tomatoes, zucchini, onions, peppers, and goat cheese", ["milk", "egg"], ["unlimitedBrunch"], { codes: ["D*", "E"] }),
  item("Brunch - Sliders", "Mini Burger", "Beef, bacon, cheese, lettuce, smoked mayonnaise, and a burger bun", ["milk", "wheat", "gluten", "egg", "sesame"], ["unlimitedBrunch"], { codes: ["D*", "G*", "E*", "S*"] }),
  item("Brunch - Sliders", "Crispy Cheese", "Breaded mozzarella with remoulade and pickles", ["milk", "wheat", "gluten", "egg"], ["unlimitedBrunch"], { codes: ["D", "G", "E"] }),
  item("Brunch - Sliders", "Balkano", "Pork tenderloin, mustard, and red cabbage slaw", ["milk", "wheat", "gluten", "egg", "mustard"], ["unlimitedBrunch"], { codes: ["D*", "G*", "E*"] }),
  item("Brunch - Proteins", "Shrimp & Grits", "Shrimp, buttered grits, cheese, and tomato-caper sauce", ["milk", "shellfish"], ["unlimitedBrunch"], { codes: ["D", "SF"] }),
  item("Brunch - Proteins", "Hanger Steak", "Mustard-marinated hanger steak with chimichurri", ["mustard"], ["unlimitedBrunch"], { aliases: ["4 oz Hanger Steak"] }),
  item("Brunch - Proteins", "Applewood Smoked Bacon", "Applewood-smoked bacon", [], ["unlimitedBrunch"]),
  item("Brunch - Sides", "Potato Hash", "Potatoes, caramelized onion, roasted peppers, and guajillo chile", [], ["unlimitedBrunch"]),
  item("Brunch - Sides", "Scrambled Eggs", "Pasteurized cage-free scrambled eggs", ["egg"], ["unlimitedBrunch"], { codes: ["E"] }),
  item("Brunch - Sides", "Creamy Grits", "Buttery cheese grits", ["milk"], ["unlimitedBrunch"], { codes: ["D"] }),
  item("Brunch - Sides", "Mac & Cheese", "Pasta, cheese sauce, bacon, and breadcrumbs", ["milk", "wheat", "gluten"], ["unlimitedBrunch"], { codes: ["D", "G"] }),
  item("Brunch - Sweets", "Fruit Granola", "Fruit, blueberry yogurt, and granola", ["milk", "tree-nut", "wheat", "gluten"], ["unlimitedBrunch"], { codes: ["D*", "G*", "N*"] }),
  item("Brunch - Sweets", "Caramel Apple Waffle", "Waffle with apple compote, caramel sauce, and whipped cream", ["milk", "wheat", "gluten", "egg"], ["unlimitedBrunch"], { codes: ["D", "G", "E"] }),
  item("Brunch - Sweets", "Strawberry Waffle", "Waffle with strawberry jam, Nutella, and whipped cream", ["milk", "tree-nut", "wheat", "gluten", "egg"], ["unlimitedBrunch"], { codes: ["D", "G", "E", "N*"] }),
  item("Brunch - Sweets", "S'mores Waffle", "Waffle with marshmallows, chocolate sauce, marshmallow creme, and graham crackers", ["milk", "wheat", "gluten", "egg"], ["unlimitedBrunch"], { codes: ["D", "G", "E"] }),
  item("Brunch - Sweets", "Balkan Donuts", "Powdered-sugar donuts with a choice of Nutella or jam", ["milk", "tree-nut", "wheat", "gluten"], ["unlimitedBrunch"], { aliases: ["Balkan Mini Donuts"], codes: ["D", "G", "N*"], isConfigurable: true }),

  // Current restaurant-linked ordering packages and extras.
  item("Ambar Experience at Home", "Meat From the Grill", "Configurable two-person grilled-meat package with pita bread, cornbread, pickles, and dessert", ["wheat", "gluten"], ["online"], { aliases: ["Grilled Mixed Meat Platter"], isConfigurable: true }),
  item("Ambar Experience at Home", "Seafood From the Grill", "Configurable two-person seafood package with pita bread, cornbread, pickles, and dessert", ["fish", "shellfish", "wheat", "gluten"], ["online"], { aliases: ["Grilled Seafood Platter"], isConfigurable: true }),
  item("Ambar Experience at Home", "Slow Cooked", "Configurable two-person slow-cooked-meat package with pita bread, cornbread, pickles, and dessert", ["wheat", "gluten"], ["online"], { aliases: ["Slow-Cooked Meats"], isConfigurable: true }),
  item("Ambar Experience at Home", "Roasted Lamb Experience", "Two-person roasted-lamb package with pita bread, cornbread, pickles, and dessert", ["wheat", "gluten"], ["online"], { isConfigurable: true }),
  item("Online Extras", "Extra Bread", "House-made pita bread and cornbread", ["wheat", "gluten"], ["online"]),

  // Current nonalcoholic rows. Alcohol-only wine, beer, rakija, and cocktail rows are excluded.
  ...beverages([
    ["Bottled & Fountain", "Acqua Panna - 1L"],
    ["Bottled & Fountain", "San Pellegrino - 1L"],
    ["Bottled & Fountain", "Mexican Coke", [], { aliases: ["Mexican Coke Bottle", "Mexican Coca Cola"] }],
    ["Bottled & Fountain", "Mexican Sprite", [], { aliases: ["Sprite (Can", "Sprite"] }],
    ["Bottled & Fountain", "Iced Tea"],
    ["Bottled & Fountain", "Lemonade"],
    ["Juices", "Orange Juice"],
    ["Bottled & Fountain", "Diet Coke", [], { aliases: ["Diet Coke (Can"] }],
    ["Coffee & Tea", "Drip Coffee"],
    ["Coffee & Tea", "Greek Coffee"],
    ["Coffee & Tea", "Espresso"],
    ["Coffee & Tea", "Macchiato", ["milk"]],
    ["Coffee & Tea", "Cappuccino", ["milk"]],
    ["Coffee & Tea", "Latte", ["milk"]],
    ["Coffee & Tea", "Americano"],
    ["Coffee & Tea", "Hot Tea"],
    ["Zero-Proof", "Carrot Ginger Spritz", [], { description: "Carrot juice, lemon, ginger, vanilla, and ginger beer" }],
    ["Zero-Proof", "Mango Mule", [], { description: "Mango puree, lime juice, ginger beer, and honey" }],
    ["Zero-Proof", "Grapefruit Garden Fizz", [], { description: "Grapefruit cordial, tonic, lime, and cucumber juice" }],
    ["Nonalcoholic Beer", "Heineken N/A", ["gluten"], { description: "Nonalcoholic lager brewed with malted barley", ingredientIntelligenceOnly: true, sourceKeys: ["drinks", "heinekenProduct"] }],
  ]),
]);

export function buildAmbarClarendonAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const seen = new Set();
  const items = currentFormulations.map((row, index) => {
    const normalizedName = normalize(row.name);
    if (seen.has(normalizedName)) throw new Error(`Duplicate AMBAR Clarendon formulation: ${row.name}`);
    seen.add(normalizedName);
    const sourceKeys = [...new Set(row.sourceKeys)];
    const sourceUrls = sourceKeys.map((key) => sourceUrlsAmbarClarendon[key]);
    if (sourceUrls.some((url) => !url)) throw new Error(`Unknown AMBAR Clarendon source key for ${row.name}.`);
    const reviewedAllergens = orderedAllergens(row.allergens);
    const allergens = row.ingredientIntelligenceOnly ? [] : reviewedAllergens;
    const codeAllergens = (row.codes ?? []).map((code) => sixCodeAllergens[code.replace("*", "")]).filter(Boolean);
    const allergenSourceType = row.codes?.length
      ? "official-allergen-menu"
      : allergens.length > 0
        ? "official-ingredients"
        : "unavailable";
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description || null,
      ingredientsText: row.description || null,
      imageUrl: null,
      isConfigurable: Boolean(row.isConfigurable),
      aliases: row.aliases ?? [],
      officialAllergenCodes: row.codes ?? [],
      presentations: sourceKeys.map((key) => ({ category: row.category, description: row.description || null, sourceName: row.name, sourceUrl: sourceUrlsAmbarClarendon[key] })),
      sourceUrls,
      sourceType: sourceKeys.includes("heinekenProduct")
        ? "restaurant-issued-menu-pdf+manufacturer-product-page"
        : sourceKeys.includes("online")
        ? sourceKeys.length === 1 ? "restaurant-linked-ordering-menu" : "restaurant-issued-pdf+restaurant-linked-ordering-menu"
        : "restaurant-issued-menu-pdf",
      allergens,
      mayContain: [],
      allergenSourceType,
      sourceSummary: row.ingredientIntelligenceOnly
        ? `The restaurant identifies the current product, while the manufacturer ingredient page supports an Ingredient Intelligence signal for ${reviewedAllergens.join(", ")}. Manufacturer evidence is not promoted to restaurant-issued allergen evidence.`
        : sourceSummary(row, allergens, codeAllergens),
      ...(row.ingredientIntelligenceOnly ? {
        extractedIngredientMentions: [{
          ingredientId: "barley_malt",
          label: "barley malt",
          sourceField: "manufacturerIngredients",
          text: "Barley Malt",
        }],
        inferredIngredients: ["barley_malt"],
        inferredAllergenSignals: [{
          id: "gluten",
          c: "high",
          e: ["manufacturer-product-ingredients:barley_malt"],
        }],
        inferenceQuestions: [],
        inferenceSummary: "The manufacturer ingredient disclosure identifies barley malt, which supports a gluten signal but not a wheat signal.",
        inferenceVersion: "manufacturer-product-review-2026-07-15",
      } : {}),
      evidence: [{
        sourceKind: row.ingredientIntelligenceOnly
          ? "manufacturer-product-ingredients"
          : row.codes?.length
            ? "restaurant-issued-item-allergen-label"
            : "restaurant-issued-menu-text",
        sourceUrl: row.ingredientIntelligenceOnly ? sourceUrlsAmbarClarendon.heinekenProduct : sourceUrls[0],
        text: row.ingredientIntelligenceOnly
          ? `${row.name}: manufacturer ingredients identify malted barley; this is Ingredient Intelligence, not restaurant-issued allergen evidence.`
          : `${row.name}: ${row.description || "No fixed ingredient description published."}${row.codes?.length ? ` Official labels: ${row.codes.join(", ")}.` : ""}`,
      }],
    };
  });

  const presentationCount = items.reduce((sum, entry) => sum + entry.presentations.length, 0);
  const categoryCount = new Set(items.map((entry) => entry.category)).size;
  const officialLabelCount = items.filter((entry) => entry.allergenSourceType === "official-allergen-menu").length;
  const ingredientSignalCount = items.filter((entry) => entry.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - officialLabelCount - ingredientSignalCount;
  const itemNameFingerprint = createHash("sha256").update(items.map((entry) => normalize(entry.name)).sort().join("\n")).digest("hex");

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmbarClarendon,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAmbarClarendon),
    itemCount: items.length,
    presentationCount,
    itemNameFingerprint,
    categoryCount,
    officialLabelCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "Clarendon's current May/June 2026 menu PDFs directly label D=dairy, G=gluten, N=nuts, SF=shellfish, E=eggs, and S=sesame; an asterisk means that labeled allergen can be modified, so it remains part of the default formulation. Fish, mustard, soy, peanuts, and sulfites are not represented by that legend and are added only when the item name or current description directly supports them. Wheat is added only where the current text identifies bread, phyllo, panko, breadcrumbs, pasta, or another wheat formulation; a bare G code remains gluten without an unsupported wheat claim. No may-contain signal is invented. The official page labeled Clarendon Allergy Brunch currently serves a January 2026-modified PDF titled Allergy Capitol and Clarendon - Lunch and Dinner, so it is treated only as a supplemental free-from/accommodation cross-check for still-current lunch/dinner rows, never as brunch evidence. The current main menu index does not link the older vegan/vegetarian guide; its unique legacy dishes are excluded, while matching current dishes may be corroborated.",
    items,
  };
}

function item(category, name, description, allergens, sourceKeys, options = {}) {
  return { category, name, description, allergens, sourceKeys, ...options };
}

function beverages(rows) {
  return rows.map(([category, name, allergens = [], options = {}]) => item(
    category,
    name,
    options.description ?? name,
    allergens,
    options.sourceKeys ?? ["drinks"],
    options,
  ));
}

function sourceSummary(row, allergens, codeAllergens) {
  if (allergens.length === 0) return "Current first-party wording and the six-code menu legend do not support a fixed positive allergen claim; the incomplete legend is not treated as a comprehensive negative assurance.";
  if (row.codes?.length) {
    const direct = [...new Set(codeAllergens)];
    const additions = allergens.filter((allergen) => !direct.includes(allergen));
    return `Current first-party item labels (${row.codes.join(", ")}) support ${direct.join(", ") || "the labeled allergen state"}.${additions.length ? ` Current item identity or ingredient wording additionally supports ${additions.join(", ")}.` : ""} Asterisks mean the allergen is modifiable, not absent from the default presentation.`;
  }
  return `Current first-party item identity or ingredient wording supports fixed contains ${allergens.join(", ")}.`;
}

const allergenOrder = ["milk", "peanut", "tree-nut", "egg", "fish", "shellfish", "wheat", "gluten", "soy", "sesame", "mustard", "sulfites"];
function orderedAllergens(values) {
  return [...new Set(values)].sort((left, right) => allergenOrder.indexOf(left) - allergenOrder.indexOf(right));
}
function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAmbarClarendon}/corrected-menu.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const snapshot = buildAmbarClarendonAuditSnapshot();
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount, presentationCount: snapshot.presentationCount }, null, 2));
}
