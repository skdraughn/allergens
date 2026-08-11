import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAlaraGeorgetown = "alara-georgetown-dc";
export const sourceUrlsAlaraGeorgetown = Object.freeze({
  menus: "https://www.alarageorgetown.com/menus/",
  brunchPage: "https://www.alarageorgetown.com/menu/brunch/",
  dinner: "https://media-cdn.getbento.com/accounts/259c8fb718201d069dc4afbae7950b2e/media/av8317RTmBv3sZGPVxTw_Xqh1psQNSCSsaOnURYRw_07-10-25%2520Alara%2520Dinner.pdf",
  lunch: "https://media-cdn.getbento.com/accounts/259c8fb718201d069dc4afbae7950b2e/media/TvgEZVfRE2Q0EnKId3Y4_6%206%20%2025%20%20%20%20AlaraLunchMenuV2%20%28003%29%20%281%29.pdf",
  brunch: "https://media-cdn.getbento.com/accounts/259c8fb718201d069dc4afbae7950b2e/media/Sq3CCeKYRUGI70yTEoxg_6%20%2023%2025%20AlaraBrunchMenuV2%20%28002%29%20%281%29%20%281%29.pdf",
  dessert: "https://media-cdn.getbento.com/accounts/259c8fb718201d069dc4afbae7950b2e/media/dVD3IzPdTE6psVlOMR6K_1%2024%2025%20AlaraDessertMenu.pdf",
  catering: "https://media-cdn.getbento.com/accounts/259c8fb718201d069dc4afbae7950b2e/media/BHfCF4j1RiquyvOKUwWX_CATERING%20MENU.pdf",
  cocktail: "https://media-cdn.getbento.com/accounts/259c8fb718201d069dc4afbae7950b2e/media/WO5o0bjQHOSZ1pNtRprx_6%2023%2025%20%20COCKTAIL%20LIST_%20%28002%29%20%28002%29%20%281%29.pdf",
});

const dinnerRows = [
  row("Spreads", "Classic Humus", "Chickpeas spread with tahini, yogurt, lemon salt, olive oil", { canonicalName: "Classic Hummus" }),
  row("Spreads", "Spiced Ground Beef Humus", "Chickpeas spread with tahini, yogurt, lemon salt, olive oil and spiced ground beef", { canonicalName: "Spiced Ground Beef Hummus" }),
  row("Spreads", "Soujouk Humus", "Chickpeas spread with tahini, yogurt, lemon salt, olive oil and spicy soujouk sausage", { canonicalName: "Soujouk Hummus" }),
  row("Spreads", "Roasted Mushroom Humus", "Chickpeas spread with tahini, yogurt, lemon salt, olive oil and roasted mushroom", { canonicalName: "Roasted Mushroom Hummus" }),
  row("Spreads", "Muhammara", "Marinated roasted red pepper with walnuts and olive oil"),
  row("Spreads", "Tzatziki Dip", "Fresh labneh yogurt flavored with garlic, dill, olive oil and cucumber"),
  row("Spreads", "Spicy Labneh Dip", "Garlic-yogurt, celery, sun-dried chili and tomato"),
  row("Spreads", "Moutabal", "Charred eggplant, yogurt, tahini, garlic and olive oil"),
  row("Spreads", "Beet Labneh Dip", "Beets, labneh yogurt, garlic and olive oil"),
  row("Spreads", "Spicy Bulgur Bites", "Spicy bulgur-wheat kofte with tomato paste, red peppers and Turkish spices"),
  row("Kebabs", "Adana Kebab", "Grilled ground beef kebab seasoned with red peppers and herbs, served with white rice"),
  row("Kebabs", "Lavash Wrapped Adana Kebab (Beyti Kebab)", "Grilled spicy ground beef kebab wrapped in lavash bread with eggplant puree, tomato sauce and yogurt"),
  row("Kebabs", "Kofte with Iskender Sauce", "Kofte served over garlic yogurt with tomato Iskender sauce"),
  row("Kebabs", "Chicken Shish Kebab", "Grilled chicken cubes seasoned with herbs and served with white rice"),
  row("Kebabs", "Chicken Adana Kebab", "Grilled ground chicken kebab seasoned with red peppers and herbs, served with white rice"),
  row("Kebabs", "Lamb (Lule) Kebab", "Grilled ground lamb kebab seasoned with black pepper and onion, served with white rice"),
  row("Hot Mezze", "Falafel", "Chickpea-vegetable fritters with hummus", { allergens: ["milk", "sesame"] }),
  row("Hot Mezze", "Ground Beef Stuffed Eggplant", "Roasted eggplant stuffed with spicy ground beef"),
  row("Hot Mezze", "Vegetarian Stuffed Eggplant", "Roasted eggplant stuffed with tomatoes, onions, pine nuts and olive oil, served at room temperature"),
  row("Hot Mezze", "Sigara Boregi", "Feta cheese and parsley wrapped in homemade dough"),
  row("Hot Mezze", "Dolmades", "Grape leaves stuffed with rice, pine nuts and raisins, with yogurt sauce"),
  row("Hot Mezze", "Grilled Halloumi Cheese", "Halloumi served with grilled tomatoes and fresh mint"),
  row("Hot Mezze", "Butter Shrimp", "Butter shrimp with sundried chili and Mediterranean spices"),
  row("Hot Mezze", "Roasted Cauliflower", "Served with yogurt-garlic sauce, lemon and olive oil"),
  row("Hot Mezze", "Moussaka", "Eggplant, potato, ground beef, bechamel sauce and cheese"),
  row("Hot Mezze", "Vegetarian Moussaka", "Eggplant, zucchini, potato, tomato sauce, basil, bechamel sauce and cheese"),
  row("Hot Mezze", "Kibbeh", "Bulgur wheat stuffed with ground lamb and beef, onion, walnuts and parsley"),
  row("Flatbread", "Soujouk Pide", "Mediterranean flatbread with spicy soujouk sausage and mozzarella cheese"),
  row("Flatbread", "Beef Pide", "Mediterranean flatbread with seasoned ground beef"),
  row("Flatbread", "Chicken Pide", "Mediterranean flatbread with spicy chicken and mozzarella cheese"),
  row("Flatbread", "Cheese Pide", "Mediterranean flatbread with mozzarella cheese and Greek oregano"),
  row("Soup & Salads", "Red Lentil Soup", "Red lentils, onions, carrots and potato"),
  row("Soup & Salads", "Greek Salad", "Romaine hearts, beets, red onion, olives, tomatoes, cucumber, feta cheese and lemon dressing"),
  row("Soup & Salads", "Fattoush Salad", "Lettuce, mint, tomatoes, cucumber, spring onions, croutons and pomegranate dressing"),
  row("Soup & Salads", "Shepherd Salad", "Chopped tomatoes, cucumbers, onions, green peppers, walnuts, parsley, pomegranate, radish and lemon dressing"),
  row("Large Plates", "Lamb Shank", "Slowly cooked braised lamb shank over Ottoman rice"),
  row("Large Plates", "Grilled Lamb Chops", "Thyme and pepper marinated lamb chops served with sauteed vegetables and smoked eggplant puree"),
  row("Large Plates", "Branzino", "Pan-seared whole branzino with Anatolian-style potato salad and asparagus"),
  row("Large Plates", "Salmon", "Salmon served with mashed potatoes and asparagus"),
  row("To Share", "Mezze Trio", "Hummus, tzatziki and muhammara", { allergens: ["milk", "tree-nut", "sesame"] }),
  row("To Share", "Mezze Platter", "Hummus, muhammara, spicy labneh dip, moutabal, beet labneh dip and tzatziki", { allergens: ["milk", "tree-nut", "sesame"] }),
  row("To Share", "Chef's Mix Grill", "Lamb chops, Adana kebab, chicken shish kebab, kofte kebab, Beyti kebab, chicken Adana kebab and lamb kebab", { allergens: ["milk", "wheat", "gluten"] }),
  row("Sides", "Ottoman Rice", ""),
  row("Sides", "Bulgur Pilav", ""),
  row("Sides", "White Rice Pilav", ""),
  row("Sides", "Asparagus", ""),
  row("Sides", "Fries", ""),
  row("Sides", "Celery and Carrot Sticks", ""),
  row("Taste of Alara", "Taste of Alara for the Entire Party", "A four-course prix-fixe menu whose fixed first course is Mezze Trio; later courses are guest choices", {
    allergens: ["milk", "tree-nut", "sesame"], isConfigurable: true,
  }),
];

const daytimeSharedRows = [
  row("Spreads", "Classic Hummus", "Chickpeas spread with tahini, yogurt, lemon salt and olive oil"),
  row("Spreads", "Spiced Ground Beef Hummus", "Chickpeas spread with tahini, yogurt, lemon salt, olive oil and spiced ground beef"),
  row("Spreads", "Soujouk Hummus", "Chickpeas spread with tahini, yogurt, lemon salt, olive oil and spicy soujouk sausage"),
  row("Spreads", "Roasted Mushroom Hummus", "Chickpeas spread with tahini, yogurt, lemon salt, olive oil and roasted mushroom"),
  row("Spreads", "Tzatziki", "Fresh labneh yogurt, cucumber, garlic and dill"),
  row("Spreads", "Moutabal", "Charred eggplant, yogurt, tahini, garlic and olive oil"),
  row("Spreads", "Muhammara", "Marinated roasted red pepper with walnuts and olive oil"),
  row("Soup & Salads", "Red Lentil Soup", "Red lentils, onions, carrots and potato"),
  row("Soup & Salads", "Greek Salad", "Romaine hearts, beets, red onion, olives, tomatoes, cucumber, feta cheese and lemon dressing"),
  row("Soup & Salads", "Fattoush Salad", "Lettuce, mint, tomatoes, cucumber, croutons, spring onions and pomegranate dressing"),
  row("Soup & Salads", "Shepherd Salad", "Chopped tomatoes, cucumbers, onions, green peppers, walnuts, parsley, radish, pomegranate and lemon dressing"),
  row("Hot Mezze", "Sigara Boregi", "Feta cheese and parsley wrapped in homemade dough"),
  row("Hot Mezze", "Kibbeh", "Bulgur wheat stuffed with ground lamb and beef, onion, walnuts and parsley"),
  row("Hot Mezze", "Dolmades", "Grape leaves stuffed with rice, pine nuts and raisins, with yogurt sauce"),
  row("Hot Mezze", "Vegetarian Stuffed Eggplant", "Roasted eggplant stuffed with tomatoes, onions and olive oil, served at room temperature"),
  row("Hot Mezze", "Roasted Cauliflower", "Served with yogurt-garlic sauce, lemon and olive oil"),
  row("Hot Mezze", "Moussaka", "Eggplant, potato, ground beef, bechamel sauce and cheese"),
  row("Hot Mezze", "Vegetarian Moussaka", "Eggplant, zucchini, potato, basil, tomato sauce, bechamel sauce and cheese"),
  row("Hot Mezze", "Falafel", "Chickpea-vegetable fritters with hummus", { allergens: ["milk", "sesame"] }),
  row("Kebabs", "Adana Kebab", "Grilled ground beef kebab seasoned with red peppers and herbs, served with white rice"),
  row("Kebabs", "Chicken Shish Kebab", "Grilled chicken cubes seasoned with herbs and served with white rice"),
  row("Kebabs", "Chicken Adana Kebab", "Grilled ground chicken kebab seasoned with red peppers and herbs, served with white rice"),
  row("Kebabs", "Kofte with Iskender Sauce", "Grilled Mediterranean meatballs served with garlic yogurt and Iskender sauce"),
  row("Kebabs", "Lamb (Lule) Kebab", "Grilled ground lamb kebab seasoned with black pepper and onion, served with white rice"),
  row("Flatbread", "Soujouk Pide", "Mediterranean flatbread with spicy soujouk and mozzarella cheese"),
  row("Flatbread", "Ground Beef Pide", "Mediterranean flatbread with seasoned ground beef"),
  row("Flatbread", "Chicken Pide", "Mediterranean flatbread with spicy chicken and mozzarella cheese"),
  row("Flatbread", "Cheese Pide", "Mediterranean flatbread with mozzarella cheese and Greek oregano"),
];

const lunchOnlyRows = [
  row("Sandwiches & Wraps", "Adana Wrap", "Grilled spicy ground beef kebab with tomato and lettuce wrapped in Mediterranean tortilla bread, served with French fries"),
  row("Sandwiches & Wraps", "Chicken Adana Wrap", "Grilled spicy ground chicken kebab with tomato and lettuce wrapped in Mediterranean tortilla bread, served with French fries"),
  row("Sandwiches & Wraps", "Mediterranean Kofte Sandwich", "Pita bread stuffed with kofte, tomato, lettuce and Iskender sauce, served with French fries"),
  row("Sandwiches & Wraps", "Grilled Chicken Shish Sandwich", "Pita bread stuffed with seasoned grilled chicken cubes, carrot-red cabbage slaw and Iskender sauce, served with French fries"),
  row("Sandwiches & Wraps", "Falafel Wrap", "Falafel with red cabbage, tomato, lettuce, dill pickles and cornichon aioli wrapped in a Mediterranean tortilla, served with French fries"),
  row("Sandwiches & Wraps", "Falafel Burger", "Falafel patty with American cheese, dill pickles and red cabbage on a bun with spiced cornichon aioli and French fries"),
  row("Sandwiches & Wraps", "Alara Burger", "Double patty, caramelized onion jam, cheddar cheese, spiced cornichon aioli and olive oil bun, served with French fries"),
];

const brunchOnlyRows = [
  row("Specials", "Shakshuka", "Eggs poached in a spiced tomato and bell pepper sauce with onions"),
  row("Specials", "Egg White Frittata", "Kashkaval cheese, spinach, mushrooms and sumac, served with toast"),
  row("Specials", "Soujouk Omelet", "Thinly sliced soujouk and kashkaval cheese, served with toast"),
  row("Specials", "Sautéed Spicy Soujouk with Sunny Side Eggs", "Spicy soujouk with sunny-side-up eggs, home fries and toast", { sourceName: "Sautéed Spicy Soujouk with Sunny Side Up Eggs" }),
  row("Specials", "Sunny Side Up Eggs and Turkey Bacon", "Fried sunny-side-up eggs, turkey bacon, home fries and toast"),
  row("Specials", "Sunny Side Up Eggs", "Fried eggs with home fries and toast"),
  row("Specials", "Avocado Toast with Grilled Halloumi and Honey", "Sourdough bread, avocado, halloumi cheese, honey, frisee, poached eggs and home fries"),
  row("Specials", "Soujouk Eggs Benedict", "Soujouk, poached eggs, hollandaise, English muffin, home fries and petite salad"),
  row("Specials", "Lox Benedict", "Smoked salmon, arugula, poached eggs, hollandaise, English muffin, home fries and petite salad"),
  row("Specials", "Alara Burger", "Double patty, caramelized onion jam, cheddar cheese, spiced cornichon aioli and olive oil bun, served with French fries"),
  row("Specials", "Falafel Burger", "Falafel patty with American cheese, dill pickles and red cabbage on a bun with spiced cornichon aioli and French fries"),
  row("Specials", "Beef Pie (Borek)", "Crispy phyllo pastry rolled with sauteed ground beef, onions and spices"),
  row("Specials", "Cheese Pie (Borek)", "Crispy phyllo pastry rolled with feta and mozzarella cheese, onions and spices"),
  row("Specials", "Potato Pie (Borek)", "Crispy phyllo pastry rolled with mashed potato, onions and spices"),
];

const dessertRows = [
  row("Desserts", "Turkish Coffee Tiramisu", "Turkish coffee, Kahlua, mascarpone cream and layers of Turkish coffee-soaked ladyfingers"),
  row("Desserts", "Tahini Crème Brûlée", "Vanilla custard with a freshly caramelized crust and tahini"),
  row("Desserts", "Kunefe", "Homemade crispy kadayif pastry with cheese and pistachios, steeped in syrup"),
  row("Desserts", "Baklava", "Finely layered pastry filled with nuts and steeped in syrup"),
  row("Desserts", "Sutlac", "Rice pudding"),
  row("Desserts", "Ice Cream", "Daily selection", { isConfigurable: true }),
  row("Coffee & Tea", "Tea", ""),
  row("Coffee & Tea", "Coffee", ""),
  row("Coffee & Tea", "American Coffee", ""),
  row("Coffee & Tea", "Single Espresso", ""),
  row("Coffee & Tea", "Double Espresso", ""),
  row("Coffee & Tea", "Cappuccino / Latte", ""),
];

const cateringRows = [
  row("Dinner Trays", "Tray of Adana Kebaps", "Grilled spicy ground beef kebab seasoned with red peppers and spices, served with rice", { aliases: ["Tray of Adana Kebabs"] }),
  row("Dinner Trays", "Tray of Tavuk Sis", "Grilled chicken cubes marinated with Turkish spices and served with rice"),
  row("Dinner Trays", "Tray of Greek Salad", "Romaine hearts, beets, red onion, olives, tomatoes, cucumber, feta cheese and lemon dressing"),
  row("Dinner Trays", "Tray of Shepherd Salad", "Chopped tomatoes, cucumbers, onions, green peppers, walnuts, parsley and lemon dressing"),
  row("Dinner Trays", "Tray of Baklava (15 pieces)", "Finely layered pastries filled with pistachios and steeped in syrup", { aliases: ["Tray of Baklava"] }),
  row("Dinner Trays", "Tray of Cold Mezze", "Select one cold mezze to enjoy as a tray; serves four to six guests", { allergens: [], isConfigurable: true }),
  row("Dinner Trays", "Tray of Falafel (30 pieces)", "Thirty pieces of falafel served with rice and hummus", { aliases: ["Tray of Falafel"], allergens: ["milk", "sesame"] }),
  row("Dinner Trays", "Tray of Kibbeh (20 pieces)", "Bulgur wheat stuffed with ground lamb and beef, onion, garlic, walnuts and parsley", { aliases: ["Tray of Kibbeh"] }),
  row("Dinner Trays", "Tray of Lamb Lule Kebap", "Grilled ground beef and lamb kofta seasoned with Turkish spices"),
  row("Dinner Trays", "Tray of Tavuk Adana", "Grilled ground chicken kebab seasoned with red peppers and spices, served with rice"),
  row("Dinner Trays", "Tray of Kasap Kofte", "Grilled kofte served over toasted pita bread with rice and carrot-cabbage slaw"),
  row("Dinner Trays", "Tray of Lamb Chops (20 pieces)", "Twenty lamb chops", { aliases: ["Tray of Lamb Chops"] }),
];

const nonalcoholicRows = [
  row("Non-Alcoholic", "NOgroni", "Seedlip Garden 108, Giffard bitter and verjus"),
  row("Non-Alcoholic", "Matmazel", "Seedlip, strawberry syrup, basil, lime and ginger beer"),
  row("Non-Alcoholic", "Alara Blush", "Passionfruit, pineapple, lime juice, strawberry and club soda"),
  row("Non-Alcoholic", "Ayran", "Traditional probiotic yogurt drink"),
  row("Non-Alcoholic", "Juices", "", { isConfigurable: true }),
  row("Non-Alcoholic", "Stella Artois 0.0 Non-Alcoholic", ""),
];

const publishedRows = [
  ...surfaceRows("Dinner", "dinner", dinnerRows),
  ...surfaceRows("Lunch", "lunch", [...lunchOnlyRows, ...daytimeSharedRows]),
  ...surfaceRows("Brunch", ["brunch", "brunchPage"], [...brunchOnlyRows, ...daytimeSharedRows]),
  ...surfaceRows("Dessert", "dessert", dessertRows),
  ...surfaceRows("Catering", "catering", cateringRows),
  ...surfaceRows("Cocktail", "cocktail", nonalcoholicRows),
];

export function buildAlaraGeorgetownAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const byName = new Map();
  for (const published of publishedRows) {
    const key = normalizeText(published.canonicalName ?? published.name);
    let item = byName.get(key);
    if (!item) {
      item = {
        id: slugify(published.canonicalName ?? published.name),
        name: published.canonicalName ?? published.name,
        category: published.category,
        description: published.description || null,
        ingredientsText: published.description || null,
        imageUrl: null,
        isConfigurable: Boolean(published.isConfigurable),
        aliases: orderedUniqueText([...(published.aliases ?? []), published.name]).filter((value) => normalizeText(value) !== key),
        presentations: [],
        sourceUrls: [],
        sourceType: "restaurant-issued-menu",
        allergens: null,
        mayContain: [],
        allergenSourceType: null,
        fixedAllergens: published.allergens,
      };
      byName.set(key, item);
    } else {
      item.isConfigurable ||= Boolean(published.isConfigurable);
      item.aliases = orderedUniqueText([...item.aliases, ...(published.aliases ?? []), published.name])
        .filter((value) => normalizeText(value) !== key);
      if (published.allergens !== undefined) {
        if (item.fixedAllergens !== undefined && signature(item.fixedAllergens) !== signature(published.allergens)) {
          throw new Error(`Conflicting fixed allergen semantics for ${item.name}.`);
        }
        item.fixedAllergens = published.allergens;
      }
    }
    const urls = published.sourceKeys.map((sourceKey) => sourceUrlsAlaraGeorgetown[sourceKey]);
    item.presentations.push({
      category: published.category,
      sourceName: published.sourceName ?? published.name,
      description: published.description || null,
      sourceUrls: urls,
    });
    item.sourceUrls = orderedUniqueText([...item.sourceUrls, ...urls]);
  }

  const items = [...byName.values()].map((item, index) => {
    const allergens = item.fixedAllergens ?? publishedSignalsAlaraGeorgetown(item);
    const { fixedAllergens: _fixedAllergens, ...publicItem } = item;
    return {
      auditItemKey: `${index + 1}:${slugify(item.name)}`,
      ...publicItem,
      allergens,
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.flatMap((item) => item.presentations.map((presentation) => presentation.category))).size;
  if (items.length !== 100 || presentationCount !== 156 || categoryCount !== 25 || new Set(items.map((item) => item.id)).size !== 100) {
    throw new Error(`Alara current manifest changed: ${items.length} items, ${presentationCount} presentations, ${categoryCount} categories.`);
  }
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAlaraGeorgetown,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAlaraGeorgetown),
    presentationCount,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    unavailableAllergenCount: items.length - ingredientSignalCount,
    sourceWarning: "Alara's restaurant-issued current menu index links the reviewed dinner, lunch, brunch, dessert, catering, and cocktail PDFs; the rendered brunch route corroborates its PDF. The menus publish names and selected fixed ingredients but no complete allergen matrix, recipes, or cross-contact policy. Positive claims use explicit fixed ingredients, unavoidable named formats, and Alara's own published component recipes only. Vegetarian, vegan, dairy-free, and gluten-free labels are not converted into negative claims. Alcohol-only entries are outside the represented food/nonalcoholic catalog.",
    items,
  };
}

export function publishedSignalsAlaraGeorgetown(item) {
  const text = normalizeText([
    item.name,
    item.description,
    ...item.presentations.flatMap((presentation) => [presentation.sourceName, presentation.description]),
  ].join(" "));
  const signals = [];
  if (/\b(?:yogurt|labneh|feta|halloumi|mozzarella|kashkaval|cheddar|american cheese|cheese|bechamel|mascarpone|custard|ice cream|rice pudding|cappuccino|latte|ayran|butter)\b/.test(text)) signals.push("milk");
  if (/\b(?:eggs?|aioli|hollandaise|ladyfingers?|omelet|frittata|custard|creme brulee)\b/.test(text)) signals.push("egg");
  if (/\b(?:walnuts?|pine nuts?|pistachios?|nuts?)\b/.test(text)) signals.push("tree-nut");
  if (/\b(?:bulgur|wheat|dough|lavash|pita|flatbread|pide|phyllo|borek|toast|bun|english muffin|croutons?|tortilla|ladyfingers?|pastry|baklava|kadayif|bechamel)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:salmon|branzino|lox)\b/.test(text)) signals.push("fish");
  if (/\bshrimp\b/.test(text)) signals.push("shellfish");
  if (/\b(?:tahini|sesame)\b/.test(text)) signals.push("sesame");
  return orderedAllergens(signals);
}

function row(category, name, description, options = {}) {
  return { category, name, description, ...options };
}

function surfaceRows(surface, sourceKeys, rows) {
  const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
  return rows.map((published) => ({
    ...published,
    category: `${surface} — ${published.category}`,
    sourceKeys: keys,
  }));
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function signature(values) {
  return [...values].sort().join("|");
}

function orderedUniqueText(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAlaraGeorgetownAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAlaraGeorgetown}`);
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
