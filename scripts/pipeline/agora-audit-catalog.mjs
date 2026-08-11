import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAgora = "agora-dc";
export const sourceUrlsAgora = Object.freeze({
  dinner: "https://www.agorarestaurants.net/wp-content/uploads/2026/06/MASTER-DC-DINNER-MENU-JUNE-21.pdf",
  lunch: "https://www.agorarestaurants.net/wp-content/uploads/2026/07/MASTER-DC-LUNCH-MENU-JULY-8.pdf",
  brunch: "https://www.agorarestaurants.net/wp-content/uploads/2025/11/MASTER-DC-Bottomless-Brunch-1121-Print.pdf",
});

const rows = [
  // Current dinner. The visual section association is authoritative; PDF text order is column-interleaved.
  ["Dinner — Spreads", "HTIPITI", "Roasted red peppers blended with feta, thyme, and olive oil"],
  ["Dinner — Spreads", "BABA GHANOUJ", "Smoked eggplant blended with tahini and olive oil"],
  ["Dinner — Spreads", "HUMMUS", "Pureed chickpeas blended with tahini and olive oil"],
  ["Dinner — Spreads", "LABNEH", "Strained yogurt with garlic confit, za'atar, and olive oil"],
  ["Dinner — Spreads", "CACIK", "Strained yogurt with cucumber, mint, and olive oil"],
  ["Dinner — Spreads", "TARAMOSALATA", "Whipped cod roe mousse with fresh lemon juice and olive oil"],
  ["Dinner — Spreads", "SAMPLER", "Selection of house-made signature spreads"],
  ["Dinner — Soup & Salads", "LENTIL SOUP", "Slow-simmered lentils blended with onion, carrot, potato, and lemon"],
  ["Dinner — Soup & Salads", "GAVURDAGI SALAD", "Chopped cucumbers, tomatoes, peppers, onion, and walnuts dressed with pomegranate molasses and olive oil"],
  ["Dinner — Soup & Salads", "QUINOA TABBOULEH", "Quinoa tabbouleh mixed with parsley, tomatoes, pomegranate seeds, lemon, and olive oil"],
  ["Dinner — Soup & Salads", "ROASTED BEETROOT SALAD", "Roasted beets served over arugula with rose water yogurt, orange, and lemon olive oil"],
  ["Dinner — Cold Mezzes", "WATERMELON, FETA CHEESE", "Fresh watermelon and feta cheese served with watercress, hazelnuts, olive oil, and lemon-honey orange balsamic dressing"],
  ["Dinner — Cold Mezzes", "DOLMADES", "Grape leaves stuffed with rice, onion, tomato, and parsley"],
  ["Dinner — Cheese", "SAGANAKI", "Kefalotyri cheese flambéed tableside with brandy"],
  ["Dinner — Cheese", "HALLOUMI CHEESE", "Pan-seared halloumi cheese with fresh figs, honey, pistachios, mint, and fig balsamic dressing"],
  ["Dinner — Flat Breads", "MIXED CHEESE PIDE", "Baked flatbread topped with goat cheese, mozzarella, tomatoes, and dates"],
  ["Dinner — Flat Breads", "SUCUKLU PIDE", "Baked flatbread topped with spicy Turkish beef sausage, mozzarella, and pesto"],
  ["Dinner — Flat Breads", "LAHMACUN", "Thin flatbread topped with ground lamb, New York strip, tomatoes, peppers, and parsley"],
  ["Dinner — Hot Mezzes", "BRUKSEL LAHANA", "Crispy deep-fried Brussels sprouts served over lemon yogurt and topped with blueberries"],
  ["Dinner — Hot Mezzes", "MIXED MUSHROOMS", "Mixed mushrooms sautéed with shallots, garlic, lemon juice, goat cheese, and truffle oil"],
  ["Dinner — Hot Mezzes", "KEŞKEK", "Slow-cooked lamb shoulder served over traditional Turkish wheat, topped with brown butter and fried shallots"],
  ["Dinner — Hot Mezzes", "BÖREK", "Deep-fried crispy phyllo pastry filled with spinach, dill, and feta, served with tomato marmalade and seasonal greens"],
  ["Dinner — Hot Mezzes", "OTTOMAN RICE", "Traditional rice cooked with black currants, apricots, chicken broth, almonds, pine nuts, and fried shallots"],
  ["Dinner — Hot Mezzes", "KİBBEH", "Fried bulgur dumpling filled with New York strip, almonds, and pine nuts, served over yogurt"],
  ["Dinner — Hot Mezzes", "CAULIFLOWER", "Fried cauliflower served over tahini sauce, topped with fresh fig and sorrel"],
  ["Dinner — Hot Mezzes", "MÜCVER", "Pan-fried zucchini fritter made with Manchego cheese, mint, dill, and scallions, served over lemon zest yogurt"],
  ["Dinner — Hot Mezzes", "FALAFEL", "Crispy chickpea falafel served over tahini sauce, topped with tomatoes, radishes, and seasonal greens"],
  ["Dinner — Hot Mezzes", "İMAM BAYILDI", "Baby eggplant stuffed with onions, peppers, and tomatoes"],
  ["Dinner — Seafood Selection", "GRILLED OCTOPUS", "Grilled octopus served over a black-eyed pea salad with dill, red onion, dried oregano, Maraş pepper, and pomegranate seeds, finished with sumac molasses and olive oil"],
  ["Dinner — Seafood Selection", "GRILLED PRAWNS", "Grilled prawns served over chopped roasted bell peppers with charred scallions, roasted garlic, fresh thyme, lemon juice, orange balsamic vinegar, and olive oil"],
  ["Dinner — Seafood Selection", "KARIDES GUVEC", "Sautéed shrimp with garlic, spicy dried peppers, cherry tomatoes, parsley, and butter"],
  ["Dinner — Seafood Selection", "SCALLOPS", "Pan-seared scallops served with mushrooms and wild greens over saffron yogurt"],
  ["Dinner — Seafood Selection", "BRANZINO", "Grilled Mediterranean sea bass served with Mediterranean roasted potatoes and lemon"],
  ["Dinner — Meat & Chicken", "KÖFTE", "Grilled minced lamb and New York strip patties served with sumac onions, tomatoes, and cacik"],
  ["Dinner — Meat & Chicken", "LAMB CHOPS", "Grilled lamb chops seasoned with salt and pepper, served with grilled broccolini, slow-roasted garlic, grilled tomatoes, and sweet grilled peppers"],
  ["Dinner — Meat & Chicken", "GRILLED CHICKEN", "Grilled chicken seasoned with za'atar and sumac, served with grilled tomato, pepper, toum, and pita"],
  ["Dinner — Meat & Chicken", "ŞİŞ KEBAP", "Grilled beef tenderloin served with slow-roasted garlic, sweet grilled peppers, grilled onion, grilled tomato, and harissa"],
  ["Dinner — Meat & Chicken", "ADANA KEBAP", "Grilled minced lamb and New York strip kebab served with grilled tomato, sumac onions, and lavash"],
  ["Dinner — Meat & Chicken", "ALİ NAZİK KEBAP", "Sautéed beef tenderloin served over smoked eggplant yogurt with garlic butter and onions, topped with Urfa pepper"],
  ["Dinner — Meat & Chicken", "ŞİŞ TAVUK", "Grilled chicken thighs marinated with garlic, yogurt, pepper paste, oregano, paprika, and olive oil, served with lavash"],
  ["Dinner — Meat & Chicken", "MANTI", "Mini beef dumplings served with garlic yogurt, tomato sauce, and mint"],
  ["Dinner — Side Sauces", "TOUM", "Creamy garlic sauce made with lemon and olive oil, topped with Maraş pepper"],
  ["Dinner — Side Sauces", "TAHINI", "Creamy sesame purée"],
  ["Dinner — Side Sauces", "HARISSA", "Spicy red pepper sauce made with cumin, walnut, garlic, and olive oil"],
  ["Dinner — Side Sauces", "TAPENADE", "Crushed olive tapenade made with shallots, basil, thyme, and olive oil"],
  ["Dinner — Experience to Share", "GRILLED WHOLE FISH", "Deboned whole fish served with grilled vegetables"],
  ["Dinner — Experience to Share", "RACK OF LAMB", "Grilled rack of lamb coated with a Turkish spice dry rub, served with Ottoman rice and harissa"],
  ["Dinner — Experience to Share", "LAMB SHOULDER", "Three-hour slow-cooked lamb shoulder served with Ottoman rice, harissa, toum, and cacik"],
  ["Dinner — Desserts", "PISTACHIO SOUFFLÉ", "Warm pistachio soufflé made with white chocolate and Antep pistachios, dusted with powdered sugar, and served with Maraş ice cream"],
  ["Dinner — Desserts", "PORTAKALLI SÜTLAÇ", "Orange rice pudding topped with hazelnuts"],
  ["Dinner — Desserts", "KÜNEFE", "Layers of crispy shredded phyllo filled with sweet cheese, soaked in syrup, and served with Turkish rose ice cream and pistachios"],
  ["Dinner — Desserts", "CHOCOLATE BAVAROISE", "Chocolate bavaroise made with 60% dark chocolate, served with blackberry sauce and hazelnut dacquoise"],
  ["Dinner — Desserts", "KAZANDİBİ", "Traditional Turkish caramelized milk pudding made with mastic and rice paste, topped with cinnamon and served with vanilla ice cream"],
  ["Dinner — Desserts", "TURKISH BAKLAVA", "Layered filo pastry filled with pistachios and honey syrup, served with vanilla ice cream"],
  ["Dinner — Desserts", "ICE CREAM & SORBET SELECTION", "Ice creams: Antep pistachio, Isparta rose, vanilla, dark chocolate. Sorbet flavor changes daily"],

  // Current lunch products not already represented by the same dinner formulation.
  ["Lunch — Salads", "MIXED GREEN SALAD", "Mixed greens with tomatoes, avocado, fresh fig, and lemon olive oil"],
  ["Lunch — Salads", "GREEK SALAD", "Chopped tomatoes, cucumbers, peppers, and olives with feta cheese, parsley, and lemon olive oil"],
  ["Lunch — Sandwiches & Wraps", "AGORA CHEESEBURGER", "Grilled minced lamb and New York strip patties, remoulade sauce, caramelized onions, tomato, pickled cucumber, and lettuce"],
  ["Lunch — Sandwiches & Wraps", "FALAFEL WRAP", "Crispy chickpea falafel wrapped in lavash with tahini, tomatoes, radishes, and seasonal greens"],
  ["Lunch — Sandwiches & Wraps", "ADANA WRAP", "Adana kebab wrapped in lavash with harissa, sumac onions, tomatoes, and parsley"],
  ["Lunch — Sandwiches & Wraps", "CHICKEN WRAP", "Grilled chicken thighs wrapped in lavash with pickled turnip, toum, lettuce, tomatoes, and sumac onions"],
  ["Lunch — Sandwiches & Wraps", "FETA CHEESE SANDWICH", "Brioche bun filled with feta cheese, lettuce, tomatoes, and fresh cucumbers"],

  // Brunch-only products and same-name formulations that differ from dinner/lunch.
  ["Brunch — Starters", "ACUKA", "Red pepper paste, walnut, olive oil"],
  ["Brunch — Starters", "TRUFFLED EGGS", "Deviled eggs, black truffle, olive oil"],
  ["Brunch — Starters", "MIXED GREEN SALAD", "Cucumbers, carrot, avocado, feta cheese, olive oil, and fig balsamic dressing"],
  ["Brunch — Starters", "CHARCUTERIE PLATE", "Pastrami, smoked turkey breast, smoked salmon, olives"],
  ["Brunch — Starters", "MIXED CHEESE PLATE", "Kasseri, feta, Manchego cheese, fig, and apricot"],
  ["Brunch — Starters", "CHERRY JAM & GOAT CHEESE", "Cherry jam and goat cheese"],
  ["Brunch — Flatbreads", "GOZLEME", "Stuffed flatbread with spring onion, dill, parsley, feta cheese, olive oil, and Maraş pepper"],
  ["Brunch — Eggs & Proteins", "SALMON EGGS BENEDICT", "Smoked salmon, guacamole, hollandaise, ciabatta muffin, and Agora fries"],
  ["Brunch — Eggs & Proteins", "CLASSIC EGGS BENEDICT", "Ciabatta muffin, beef bacon, hollandaise, and Agora fries"],
  ["Brunch — Eggs & Proteins", "KIYMALI EGGS BENEDICT", "Ground lamb and New York strip, poached egg, garlic yogurt, ciabatta muffin, and Agora fries"],
  ["Brunch — Eggs & Proteins", "VEGETABLE OMELETTE", "Mushrooms, asparagus, red and green peppers, tomatoes, onions, and Agora fries"],
  ["Brunch — Eggs & Proteins", "LAMB SHOULDER & WHEAT RICE", "Wheat rice, shallots, brown butter"],
  ["Brunch — Eggs & Proteins", "ŞİŞ TAVUK", "Chicken thighs, yogurt sauce"],
  ["Brunch — Sides", "AGORA FRIES", "Mustard, olive oil, green onions"],
  ["Brunch — Sides", "VEGGIE SAUTE", "Oyster mushrooms, asparagus, red and green peppers, onions"],
  ["Brunch — Sides", "MARINATED SHRIMP", "Olive oil, lemon juice, orange and lemon zest, salt, peppers"],
  ["Brunch — Sides", "BEEF BACON", null],
  ["Brunch — Sides", "TURKISH SUCUK", null],
  ["Brunch — Sweets", "LOKMA", "Traditional fried dough balls, chocolate sauce, pistachios"],
  ["Brunch — Sweets", "GREEK YOGURT PARFAIT", "Mixed berries, granola, honey"],
  ["Brunch — Sweets", "FRUIT PLATE", "Seasonal fruit"],
];

export function buildAgoraAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const ids = new Set();
  const items = rows.map(([category, name, description], index) => {
    const id = `${slugify(category)}-${slugify(name)}`;
    if (ids.has(id)) throw new Error(`Duplicate Agora presentation id: ${id}`);
    ids.add(id);
    const allergens = publishedSignalsAgora({ name, description });
    const sourceUrl = category.startsWith("Dinner")
      ? sourceUrlsAgora.dinner
      : category.startsWith("Lunch") ? sourceUrlsAgora.lunch : sourceUrlsAgora.brunch;
    return {
      auditItemKey: `${index + 1}:${id}`,
      id,
      name,
      category,
      description,
      ingredientsText: description,
      isConfigurable: false,
      sourceUrls: [sourceUrl],
      sourceType: "restaurant-issued-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  if (items.length !== 83) throw new Error(`Agora catalog changed: expected 83 products; found ${items.length}.`);
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAgora,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAgora),
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "Agora publishes current meal-period menus, item descriptions, and GF/DF/NF dietary labels, but no complete allergen matrix, complete recipes, or cross-contact policy. Positive fields are limited to fixed published ingredients and mandatory named formats. Negative dietary labels are retained as source context rather than converted into comprehensive allergen-free claims.",
    items,
  };
}

export function publishedSignalsAgora({ name, description }) {
  let text = `${name} ${description ?? ""}`.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  text = text.replace(/\beggplant\b/g, "aubergine").replace(/\boyster mushrooms?\b/g, "mushrooms");
  const allergens = [];
  if (/\b(?:cheese|feta|mozzarella|yogurt|butter|cream|milk|white chocolate|hollandaise|rice pudding|cacik|cheeseburger)\b/.test(text)) allergens.push("milk");
  if (/\b(?:eggs?|omelette|hollandaise|souffle|dacquoise)\b/.test(text)) allergens.push("egg");
  if (/\b(?:flatbread|phyllo|filo|wheat|lavash|pita|brioche|ciabatta|dumplings?|fried dough|pide|lahmacun|borek|manti|gozleme|baklava|kunefe|cheeseburger)\b/.test(text)) allergens.push("wheat", "gluten");
  if (/\b(?:tahini|sesame)\b/.test(text)) allergens.push("sesame");
  if (/\b(?:walnuts?|almonds?|pine nuts?|pistachios?|hazelnuts?)\b/.test(text)) allergens.push("tree-nut");
  if (/\b(?:cod roe|salmon|branzino|sea bass|whole fish)\b/.test(text)) allergens.push("fish");
  if (/\b(?:shrimp|prawns?|scallops?|octopus)\b/.test(text)) allergens.push("shellfish");
  if (/\bmustard\b/.test(text)) allergens.push("mustard");
  return [...new Set(allergens)];
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAgoraAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAgora}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
