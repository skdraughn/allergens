import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAmbarCapitolHill = "ambar-restaurant-capitol-hill-washington-dc-dc-metro";

export const sourceUrlsAmbarCapitolHill = Object.freeze({
  location: "https://ambarrestaurant.com/ambarcapitolhill",
  menuIndex: "https://ambarrestaurant.com/page/capitol-hill-menus",
  online: "https://ambarrestaurant.com/menu/ambarcapitolhill",
  aLaCarte: "https://static-content.owner.com/document/ce4e23cb-7561-4ca6-a7bb-00ffb7f3cb7a.pdf",
  unlimitedBrunch: "https://static-content.owner.com/document/5c7e4860-be01-4688-9511-ad8cff325558.pdf",
  unlimitedLunch: "https://static-content.owner.com/document/35f00e6e-bc6b-464a-8516-46d2a2301d7b.pdf",
  unlimitedDinner: "https://static-content.owner.com/document/f310d68a-0d69-4eed-8972-b11fda7109c3.pdf",
  desserts: "https://static-content.owner.com/document/7c7a73db-04b9-4365-a96a-34e97fe1172e.pdf",
  drinks: "https://static-content.owner.com/document/51b50115-3222-4b21-a2c9-5a5265c32df9.pdf",
  happyHour: "https://static-content.owner.com/document/d08f7b55-de97-49f8-9b28-6ad12294df23.pdf",
  allergyLunchDinner: "https://static-content.owner.com/document/0d384863-02d6-40ad-80dd-21e51c6e19c4.pdf",
  allergyBrunch: "https://static-content.owner.com/document/a1627292-ab58-4e39-bce7-9f8f3af765cb.pdf",
});

const sharedLunchDinnerSources = ["aLaCarte", "unlimitedLunch", "unlimitedDinner"];

const currentFormulations = Object.freeze([
  // Current May 2026 lunch, dinner, and a-la-carte documents.
  item("Lunch & Dinner - Spreads", "Kajmak", "Rich, creamy traditional Balkan skimmed-milk spread", ["milk"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Spreads", "Ajvar", "Traditional roasted pepper, garlic, and eggplant spread", [], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Spreads", "Urnebes", "Feta cheese mixed with chili flakes and roasted pepper jam", ["milk"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Spreads", "White Bean Hummus", "Cannellini beans garnished with pickled jalapeno", [], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Spreads", "House Marinated Olives & Pickles", "Pickled vegetables, mixed marinated olives, sesame seeds, and fresno peppers", ["sesame"], sharedLunchDinnerSources),
  item("Lunch & Dinner - Spreads", "Beet Tzatziki", "Refreshing beet yogurt dip with garlic and dill", ["milk"], sharedLunchDinnerSources, { aliases: ["Beets Tzatziki"], allergyGuide: "lunchDinner" }),

  item("Lunch & Dinner - Premium", "Tuna Tartare", "Fresh tuna, pear salsa, arugula salad, squid-ink butter, crushed almonds, and crostini", ["milk", "tree-nut", "fish", "wheat", "gluten"], sharedLunchDinnerSources),
  item("Lunch & Dinner - Premium", "Scallops", "Seared scallops over butternut squash puree, finished with toasted pumpkin seeds", ["shellfish"], sharedLunchDinnerSources),
  item("Lunch & Dinner - Premium", "Grilled Branzino", "Fresh branzino with ladolemono sauce and citrus fennel salad", ["fish"], sharedLunchDinnerSources, { aliases: ["Branzino"] }),
  item("Lunch & Dinner - Premium", "NY Strip Steak", "NY strip steak, parmesan puree, and herbaceous chimichurri", ["milk"], sharedLunchDinnerSources, { aliases: ["Steak Frites"] }),
  item("Lunch & Dinner - Premium", "Lamb Chops", "Smoky lamb chops, charred onion labneh, dill, and extra virgin olive oil", ["milk"], sharedLunchDinnerSources),

  item("Lunch & Dinner - Soups & Salads", "Balkan Salad", "Pepper, onion, cucumber, cherry tomatoes, sherry vinegar, and feta cheese", ["milk"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online", "happyHour"], { allergyGuide: "both" }),
  item("Lunch & Dinner - Soups & Salads", "Beet Salad", "Roasted beets, pomegranate-beet reduction, arugula, candied pecans, and goat cheese", ["milk", "tree-nut"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Soups & Salads", "Vitamin Salad", "Cucumbers, beets, apples, carrots, sunflower seeds, and honey-lemon dressing", [], [...sharedLunchDinnerSources, "online"], { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Soups & Salads", "Ambar Caesar", "Baby romaine hearts, Hungarian dressing, croutons, and shaved parmigiano", ["milk", "wheat", "gluten"], [...sharedLunchDinnerSources, "unlimitedBrunch"]),
  item("Lunch & Dinner - Soups & Salads", "Tomato Soup", "Roasted tomatoes, red bell peppers, basil, and house-made pesto", ["milk", "tree-nut"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online"], { allergyGuide: "both", guideDerived: ["milk", "tree-nut"] }),
  item("Lunch & Dinner - Soups & Salads", "Veal Soup", "Veal, root vegetables, and creme fraiche", ["milk"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online", "happyHour"], { allergyGuide: "both" }),

  item("Lunch & Dinner - Chef Signatures", "Pepper & Cheese Croquettes", "Cheese-stuffed piquillo peppers with an herb and panko crust and cranberry chutney", ["milk", "tree-nut", "wheat", "gluten"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner", guideDerived: ["tree-nut"] }),
  item("Lunch & Dinner - Chef Signatures", "Fried Chicken", "Buttermilk-marinated chicken breast with breadcrumb and almond crust and apple-wasabi slaw", ["milk", "tree-nut", "wheat", "gluten"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online", "happyHour"], { aliases: ["Fried Chicken Sliders"], allergyGuide: "both" }),
  item("Lunch & Dinner - Chef Signatures", "Halloumi", "Pan-seared goat cheese with a sesame-seed crust and honey", ["milk", "sesame"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Chef Signatures", "Lamb Lasagna", "Lamb ragu, eggplant, bechamel, cheese, tomato sauce, and lasagna dough", ["milk", "wheat", "gluten"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),

  item("Lunch & Dinner - Vegetables", "Asparagus", "Grilled asparagus with gorgonzola sauce and balsamic reduction", ["milk"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Vegetables", "Eggplant Moussaka", "Eggplant, zucchini, potatoes, tomato sauce, feta, and Parmesan", ["milk"], [...sharedLunchDinnerSources, "online"], { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Vegetables", "Cauliflower", "Flash-fried cauliflower, spinach tahini, and pine-nut crumble", ["tree-nut", "sesame"], [...sharedLunchDinnerSources, "online", "happyHour"], { aliases: ["Roasted Cauliflower"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Vegetables", "Roasted Carrots", "Passion fruit-aji amarillo glaze, tofu-cashew cream, and pepita pistu", ["tree-nut", "soy"], sharedLunchDinnerSources, { aliases: ["Roasted Baby Carrots"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Vegetables", "Handcut Fries", "House spice blend and house-made smoked aioli", [], [...sharedLunchDinnerSources, "happyHour", "online"], { aliases: ["Hand-Cut Fries", "Ambar Fries"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Vegetables", "Brussels Sprouts", "Crispy Brussels sprouts with bacon and lemon-garlic yogurt", ["milk"], [...sharedLunchDinnerSources, "online"], { aliases: ["Brussel Sprouts"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Vegetables", "Crispy Corn Ribs", "Corn with chimichurri over whipped feta", ["milk"], sharedLunchDinnerSources),
  item("Lunch & Dinner - Vegetables", "Mushroom Pilaf", "Arborio rice, vegetable stock, and mushroom ragu", [], [...sharedLunchDinnerSources, "unlimitedBrunch", "online"], { aliases: ["Mushroom Pilav"], allergyGuide: "both" }),

  item("Lunch & Dinner - Meat & Poultry", "Balkan Kebab", "House-ground beef kebabs served on spicy feta", ["milk"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online", "happyHour"], { aliases: ["Balkan Kebabs", "Cevapi 'Balkan Kebab'"], allergyGuide: "both" }),
  item("Lunch & Dinner - Meat & Poultry", "Chicken Skewers", "Bell-pepper-marinated chicken with pickled onions and fresnos; the online presentation includes Balkan salad", ["milk"], [...sharedLunchDinnerSources, "online"], { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Meat & Poultry", "Smoked Sausage", "House-ground smoked pork sausage with house-made mustard and red cabbage slaw", ["mustard"], [...sharedLunchDinnerSources, "online"], { aliases: ["Grilled Pork Sausage"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Meat & Poultry", "Lamb Medallions", "Ground lamb, lemon-garlic yogurt, pomegranate molasses, and cucumber-mint salad", ["milk"], [...sharedLunchDinnerSources, "online"], { aliases: ["Lamb Kefta", "Lamb Kebab"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Meat & Poultry", "Beef Goulash", "Braised beef in red-wine reduction with orzo pasta", ["wheat", "gluten"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online"], { aliases: ["Short Rib Goulash"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Meat & Poultry", "Pork Belly Stuffed Cabbage", "Cabbage stuffed with pork belly, rice, and root vegetables; the online presentation includes yogurt", ["milk"], [...sharedLunchDinnerSources, "online"], { aliases: ["Stuffed Cabbage", "Pork Belly Stuffed Sour Cabbage"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Meat & Poultry", "Roasted Lamb", "Slow-roasted lamb shoulder; the online presentation includes lemon-garlic yogurt", ["milk"], [...sharedLunchDinnerSources, "online"], { aliases: ["Slow Roasted Lamb"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Meat & Poultry", "Slow Cooked Pork", "Slow-cooked pork shoulder with mashed potatoes and cabbage slaw", [], [...sharedLunchDinnerSources, "unlimitedBrunch"], { aliases: ["Slow Cooked Pork Shoulder"] }),

  item("Lunch & Dinner - Seafood", "Sesame Crusted Salmon", "Salmon with black and white sesame-seed crust; the allergy guide marks the standard presentation as dairy-modifiable", ["milk", "fish", "sesame"], [...sharedLunchDinnerSources, "online"], { allergyGuide: "lunchDinner", guideDerived: ["milk"] }),
  item("Lunch & Dinner - Seafood", "Pan-Seared Trout", "Trout over lentil stew with gremolata", ["fish"], [...sharedLunchDinnerSources, "online"], { aliases: ["Grilled Trout"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Seafood", "Drunken Mussels", "Rakija-flambeed mussels in garlic cream sauce", ["milk", "shellfish"], [...sharedLunchDinnerSources, "happyHour"], { allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Seafood", "Grilled Shrimp", "Spiced shrimp over corn puree with feta", ["milk", "shellfish"], sharedLunchDinnerSources, { allergyGuide: "lunchDinner" }),

  item("Lunch & Dinner - Baked", "Cheese Pie", "Layered cheese and phyllo dough with ajvar emulsion and yogurt", ["milk", "wheat", "gluten"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online"], { allergyGuide: "both" }),
  item("Lunch & Dinner - Baked", "Meat Pie", "Seasoned beef and leeks in layered phyllo dough over lemon-garlic yogurt", ["milk", "wheat", "gluten"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online"], { allergyGuide: "both" }),
  item("Lunch & Dinner - Baked", "White Flatbread", "Feta and mozzarella with arugula, truffle oil, and olive oil", ["milk", "wheat", "gluten"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online", "happyHour"], { aliases: ["White Pizza"], allergyGuide: "lunchDinner" }),
  item("Lunch & Dinner - Baked", "Mushroom Flatbread", "Mushrooms, leeks, caramelized onion, arugula, goat cheese, and house-made bread", ["milk", "wheat", "gluten"], [...sharedLunchDinnerSources, "online"], { aliases: ["Mushroom Pizza"], allergyGuide: "both" }),
  item("Lunch & Dinner - Baked", "Sujuk Flatbread", "Sujuk beef sausage, mozzarella, tomato sauce, oregano, and house-made bread", ["milk", "wheat", "gluten"], [...sharedLunchDinnerSources, "unlimitedBrunch", "online"], { aliases: ["Sujuk Pizza"], allergyGuide: "both" }),

  // Current May 2026 dessert document.
  item("Desserts", "Raspberry Cake", "Almond flour, whipped cream cheese, raspberry jelly, and chocolate glaze", ["milk", "tree-nut"], ["desserts", "online"]),
  item("Desserts", "Baklava", "Phyllo pastry, pistachio, lemon-honey syrup, and dine-in vanilla ice cream", ["milk", "tree-nut", "wheat", "gluten"], ["desserts", "online"], { aliases: ["Pistachio Baklava"], isConfigurable: true }),
  item("Desserts", "Chocolate Cake", "Almond flour, Greek yogurt, espresso coffee, milk chocolate, and toasted hazelnuts", ["milk", "tree-nut"], ["desserts", "online"]),
  item("Desserts", "Berries & Cream", "Fresh mixed berries with house-made whipped cream", ["milk"], ["desserts"]),

  // Current June 2026 brunch-only formulations after consolidating shared rows above.
  item("Brunch - Start", "Olivier Spread", "Peas, green beans, carrot, mayonnaise, potato, and mustard", ["egg", "mustard"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Start", "Marinated Olives", "Mixed olives, sesame seeds, garlic, fresno peppers, and red onions", ["sesame"], ["unlimitedBrunch"]),
  item("Brunch - Start", "House Made Pickles", "Pickled cauliflower, onions, red pepper, carrot, and turmeric", [], ["unlimitedBrunch"]),
  item("Brunch - Eggs", "Salmon Benedict", "Smoked salmon, lemon, arbol hollandaise, and poached egg", ["milk", "egg", "fish"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Eggs", "Pulled Pork Benedict", "Slow-cooked pork, ajvar, hollandaise, and poached egg", ["milk", "egg"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Eggs", "Shakshuka Scramble", "Stewed tomatoes, peppers, onions, scrambled egg, and whipped feta", ["milk", "egg"], ["unlimitedBrunch"], { aliases: ["Shakshuka"], allergyGuide: "brunch" }),
  item("Brunch - Eggs", "Mediterranean Omelette", "Egg, peppers, onions, mushrooms, spinach, tomatoes, olives, and whipped feta", ["milk", "egg"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sliders", "Mini Burger", "Beef, bacon, cheese, lettuce, smoked mayonnaise, and a burger bun", ["milk", "egg", "wheat", "gluten"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sliders", "Crispy Cheese", "Crispy breaded mozzarella with remoulade and pickles", ["milk", "wheat", "gluten"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sliders", "Breakfast Sausage", "Pork sausage, Ambar mustard, red cabbage slaw, and cheese", ["milk", "mustard"], ["unlimitedBrunch"]),
  item("Brunch - Proteins", "Hanger Steak", "Mustard-marinated hanger steak with chimichurri", ["mustard"], ["unlimitedBrunch"], { aliases: ["4 oz Hanger Steak"], allergyGuide: "brunch" }),
  item("Brunch - Proteins", "Shrimp & Grits", "Shrimp, buttery grits, cheddar-mozzarella blend, and tomato-caper sauce", ["milk", "shellfish"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Proteins", "Applewood Smoked Bacon", "Applewood-smoked bacon", [], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sides", "Potato Hash", "Potatoes, caramelized onion, roasted pepper, and guajillo chile", [], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sides", "Scrambled Eggs", "Pasteurized cage-free scrambled eggs", ["egg"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sides", "Creamy Grits", "Rich, buttery, cheesy grits", ["milk"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sides", "Mac & Cheese", "Elbow pasta, cheese sauce, bacon, and breadcrumbs", ["milk", "wheat", "gluten"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sweets", "Fruit Granola", "Seasonal fruit, blueberry yogurt, and granola; the allergy guide marks gluten-free and nut-free modifications", ["milk", "tree-nut", "wheat", "gluten"], ["unlimitedBrunch"], { allergyGuide: "brunch", guideDerived: ["tree-nut", "wheat", "gluten"] }),
  item("Brunch - Sweets", "Caramel Apple Waffle", "Waffle with apple compote, caramel sauce, and whipped cream", ["milk", "wheat", "gluten"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sweets", "Strawberry Waffle", "Waffle with strawberries, Nutella, and whipped cream", ["milk", "tree-nut", "wheat", "gluten"], ["unlimitedBrunch"], { allergyGuide: "brunch" }),
  item("Brunch - Sweets", "Baklava Waffle", "Waffle with pistachio, pecans, honey syrup, and mascarpone", ["milk", "tree-nut", "wheat", "gluten"], ["unlimitedBrunch"]),
  item("Brunch - Sweets", "Balkan Donuts", "Powdered-sugar donuts with a choice of Nutella or jam", ["milk", "tree-nut", "wheat", "gluten"], ["unlimitedBrunch"], { aliases: ["Balkan Mini Donuts"], allergyGuide: "brunch", isConfigurable: true }),

  // Current restaurant-linked ordering formulations not represented as standalone dine-in rows.
  item("Ambar Experience at Home", "Meat From the Grill", "Two-person configurable grilled-meat package with pita bread, cornbread, pickles, and dessert", ["wheat", "gluten"], ["online"], { aliases: ["Grilled Mixed Meat Platter"], isConfigurable: true }),
  item("Ambar Experience at Home", "Seafood From the Grill", "Two-person configurable seafood package with pita bread, cornbread, pickles, and dessert", ["fish", "shellfish", "wheat", "gluten"], ["online"], { aliases: ["Grilled Seafood Platter"], isConfigurable: true }),
  item("Ambar Experience at Home", "Slow Cooked", "Two-person configurable slow-cooked-meat package with pita bread, cornbread, pickles, and dessert", ["wheat", "gluten"], ["online"], { aliases: ["Slow-Cooked Meats"], isConfigurable: true }),
  item("Ambar Experience at Home", "Roasted Lamb Experience", "Two-person roasted-lamb package with pita bread, cornbread, pickles, and dessert", ["wheat", "gluten"], ["online"], { isConfigurable: true }),
  item("Online Extras", "Extra Bread", "House-made pita bread and cornbread", ["wheat", "gluten"], ["online"]),
  item("Online Extras", "Shrimp Pilaf", "Shrimp marinated with house-made rub over mushroom pilaf", ["shellfish"], ["online"]),

  // Current nonalcoholic rows. Alcohol-only wine, beer, rakija, and cocktail rows are excluded.
  ...beverages([
    ["Bottled & Fountain", "Acqua Panna - 1L"],
    ["Bottled & Fountain", "San Pellegrino - 1L"],
    ["Bottled & Fountain", "Mexican Coke", [], { aliases: ["Mexican Coke Bottle"] }],
    ["Bottled & Fountain", "Mexican Sprite", [], { aliases: ["Sprite (Can"] }],
    ["Bottled & Fountain", "Iced Tea"],
    ["Bottled & Fountain", "Lemonade"],
    ["Bottled & Fountain", "Ginger Beer"],
    ["Bottled & Fountain", "Tonic"],
    ["Juices", "Orange Juice"],
    ["Juices", "Apple Juice"],
    ["Juices", "Pineapple Juice"],
    ["Juices", "Cranberry Juice"],
    ["Coffee & Tea", "Drip Coffee"],
    ["Coffee & Tea", "Turkish Coffee"],
    ["Coffee & Tea", "Espresso"],
    ["Coffee & Tea", "Macchiato", ["milk"]],
    ["Coffee & Tea", "Cappuccino", ["milk"]],
    ["Coffee & Tea", "Latte", ["milk"]],
    ["Coffee & Tea", "Americano"],
    ["Coffee & Tea", "Hot Tea"],
    ["Zero-Proof", "Carrot Ginger Spritz", [], { description: "Carrot juice, lemon, ginger, vanilla, and ginger beer" }],
    ["Zero-Proof", "Mango Mule", [], { description: "Mango puree, lime juice, ginger beer, honey, mint, and cucumber juice" }],
    ["Zero-Proof", "Grapefruit Garden Fizz", [], { description: "Grapefruit cordial, tonic water, lime, cucumber juice, and basil" }],
    ["Online N/A Beverages", "Coke (Can 12oz)", [], { aliases: ["Coke (Can"] }],
    ["Online N/A Beverages", "Diet Coke (Can 12oz)", [], { aliases: ["Diet Coke (Can"] }],
    ["Online N/A Beverages", "Ginger Ale (Can 12oz)"],
  ]),
]);

export function buildAmbarCapitolHillAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const seen = new Set();
  const items = currentFormulations.map((row, index) => {
    const normalizedName = normalize(row.name);
    if (seen.has(normalizedName)) throw new Error(`Duplicate AMBAR formulation: ${row.name}`);
    seen.add(normalizedName);
    const sourceKeys = [...new Set(row.sourceKeys)];
    const sourceUrls = sourceKeys.map((key) => sourceUrlsAmbarCapitolHill[key]);
    if (sourceUrls.some((url) => !url)) throw new Error(`Unknown AMBAR source key for ${row.name}.`);
    const allergens = orderedAllergens(row.allergens);
    const sourceType = sourceKeys.includes("online")
      ? sourceKeys.length === 1 ? "restaurant-linked-ordering-menu" : "restaurant-issued-pdf+restaurant-linked-ordering-menu"
      : "restaurant-issued-menu-pdf";
    const guideKeys = row.allergyGuide === "both"
      ? ["allergyLunchDinner", "allergyBrunch"]
      : row.allergyGuide === "lunchDinner"
        ? ["allergyLunchDinner"]
        : row.allergyGuide === "brunch"
          ? ["allergyBrunch"]
          : [];
    const allSourceUrls = [...new Set([...sourceUrls, ...guideKeys.map((key) => sourceUrlsAmbarCapitolHill[key])])];
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
      presentations: sourceKeys.map((key) => ({
        category: row.category,
        description: row.description || null,
        sourceName: row.name,
        sourceUrl: sourceUrlsAmbarCapitolHill[key],
      })),
      sourceUrls: allSourceUrls,
      sourceType,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceSummary: sourceSummary(row, allergens),
      evidence: [
        {
          sourceKind: "restaurant-issued-menu-text",
          sourceUrl: sourceUrls[0],
          text: `${row.name}: ${row.description || "No fixed ingredient description published."}`,
        },
        ...guideKeys.map((key) => ({
          sourceKind: "restaurant-issued-allergy-guide",
          sourceUrl: sourceUrlsAmbarCapitolHill[key],
          text: `${row.name}: visually reconciled against AMBAR's free-from legend; underlining means the labeled state requires modification.`,
        })),
      ],
    };
  });

  const presentationCount = items.reduce((sum, entry) => sum + entry.presentations.length, 0);
  const categoryCount = new Set(items.map((entry) => entry.category)).size;
  const ingredientSignalCount = items.filter((entry) => entry.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((entry) => normalize(entry.name)).sort().join("\n"))
    .digest("hex");

  if (items.length !== 104 || new Set(items.map((entry) => entry.id)).size !== 104) {
    throw new Error(`AMBAR current manifest changed: ${items.length} formulations.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmbarCapitolHill,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAmbarCapitolHill),
    itemCount: items.length,
    presentationCount,
    itemNameFingerprint,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "AMBAR's current first-party allergy PDFs are free-from/accommodation guides, not contains matrices: GF, DF, NF, and SF mean gluten-, dairy-, nut-, and sesame-free, and underlining means that labeled state requires modification. Missing free-from icons are not inverted into positive contains claims. Fixed allergens come from current restaurant-issued descriptions, explicit item identities, and only a small number of underlined modification markers that directly identify the default formulation. The guides do not cover egg, fish, shellfish, soy, mustard, sulfites, or cross-contact comprehensively. No global may-contain claim is invented. Same-name formulations that differ by service surface are conservatively consolidated, and configurable at-home packages retain only fixed published components.",
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
    category === "Online N/A Beverages" ? ["online"] : ["aLaCarte", "drinks"],
    options,
  ));
}

function sourceSummary(row, allergens) {
  if (allergens.length === 0) {
    return "Current first-party menu wording does not support a fixed positive allergen claim; free-from icons are not treated as complete negative assurances.";
  }
  const guideDerived = row.guideDerived?.length
    ? ` The default formulation's ${row.guideDerived.join(", ")} signal is also supported by an underlined free-from modification marker in the current first-party allergy guide.`
    : "";
  return `Current first-party menu wording supports fixed contains ${allergens.join(", ")}.${guideDerived}`;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard", "sulfites"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAmbarCapitolHillAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAmbarCapitolHill}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
