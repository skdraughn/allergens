import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAllSet = "all-set-restaurant-and-bar-silver-spring-md-dc-metro";
export const sourceUrlsAllSet = Object.freeze({
  online: "https://allsetrestaurant.com/menu",
  kids: "https://static-content.owner.com/document/0988decf-ed6e-4065-b2ae-969da8048275.pdf",
  dessert: "https://static-content.owner.com/document/170f0c4f-295a-4b4e-8fa9-7cc18bd38525.pdf",
  lunch: "https://static-content.owner.com/document/20a3b2db-a163-4ce3-ab30-f3ad7782e789.pdf",
  daily: "https://static-content.owner.com/document/30a37385-79fa-43f7-831b-9bce1de3a14f.pdf",
  happyHour: "https://static-content.owner.com/document/3defc0ba-5890-4b1e-b698-5c84021efb7e.pdf",
  brunch: "https://static-content.owner.com/document/460e05b2-6fc4-4dbe-9240-7e3dcf5c2303.pdf",
  weekly: "https://static-content.owner.com/document/887b6542-a191-4fc2-b5ea-6b0e83699509.pdf",
  beverage: "https://static-content.owner.com/document/b45d48bc-e4f4-43a0-9014-fec818bd27a9.pdf",
  wine: "https://static-content.owner.com/document/da160ccd-6b76-4490-8336-b27d5e6bbcdf.pdf",
});

const sourceSnapshotPath = fileURLToPath(new URL(
  "../../data/scraped/launch-coverage/final-1200-portfolio-01/s3-sync/restaurant-data/restaurants/all-set-restaurant-and-bar-silver-spring-md-dc-metro/latest.json",
  import.meta.url,
));

const excludedOnlineRows = new Set([
  "blue cheese ranch",
  "make it a platter with french fries",
]);

const canonicalNames = new Map([
  ["1 2 lb gulf shrimp", "½ LB Fried Shrimp"],
  ["fried oyster po boy", "Fried Oyster or Shrimp Po'Boy"],
  ["fried shrimp po boy", "Fried Oyster or Shrimp Po'Boy"],
  ["bbq mushroom sandwich v", "Wild Mushroom Sandwich"],
  ["tempura battered fried oreos v", "Fried Oreos"],
  ["maine lobster roll large", "Maine Lobster Roll"],
  ["maine lobster roll regular", "Maine Lobster Roll"],
  ["new england clam chowder cup", "New England Clam Chowder"],
  ["new england clam chowder regular", "New England Clam Chowder"],
  ["tomato basil soup cup", "Tomato Basil Soup"],
  ["tomato basil soup regular", "Tomato Basil Soup"],
  ["arugula salad large gf", "Arugula Salad"],
  ["arugula salad side gf", "Arugula Salad"],
  ["caesar salad large gf", "Caesar Salad"],
  ["caesar salad side gf", "Caesar Salad"],
  ["slow smoked chicken wings gf 7", "Slow Smoked Chicken Wings (7)"],
]);

const manualRows = [
  row("Daily — Appetizers", "Oysters on the 1/2 Shell", "Minimum of six; choice of mignonette, Tabasco, horseradish or cocktail sauce.", ["daily", "happyHour"], { allergens: ["shellfish"], isConfigurable: true }),
  row("Lunch — Salads", "Bleu Cheese House Salad", "Mixed greens, cherry tomatoes, corn, fried shallots, bleu cheese crumbles and dressing.", ["lunch"], { allergens: ["milk"] }),
  row("Desserts", "Ice Cream Sundae", "Chocolate chip cookies, vanilla gelato, chocolate sauce and whipped cream.", ["dessert"], { allergens: ["milk", "wheat", "gluten"] }),
  row("Desserts", "Gelato", "Vanilla or salted caramel.", ["dessert"], { allergens: ["milk"], isConfigurable: true }),
  row("Desserts", "Sorbet", "Ask the server for today's flavor; labeled vegan and gluten free.", ["dessert"], { allergens: [], isConfigurable: true }),
  row("Happy Hour — Galley Snacks", "Fried Calamari", "Hot cherry peppers and cocktail sauce.", ["happyHour"], { allergens: ["shellfish"] }),
  row("Happy Hour — Galley Snacks", "Jerk Salmon Skewers", "Jerk salmon, bell pepper and onion.", ["happyHour"], { allergens: ["fish"] }),
  row("Happy Hour — Galley Snacks", "Mini Burger", "All-beef patty, pickles and feta mayonnaise.", ["happyHour"], { allergens: ["milk", "egg"] }),
  row("Non-Alcoholic", "Perfect Hideout", "Lemon, lavender syrup, blackberry puree, foamer and pineapple.", ["happyHour", "beverage"], { allergens: [] }),
  row("Non-Alcoholic", "Bye Bish", "Hibiscus ginger beer, lemon and ginger syrup.", ["happyHour", "beverage"], { allergens: [] }),
  row("Non-Alcoholic", "Coastal Chic", "Passionfruit puree, habanero syrup and lemon.", ["happyHour", "beverage"], { allergens: [] }),
  row("Non-Alcoholic", "Clear Sky", "Lime, ginger syrup, pineapple and ginger beer.", ["happyHour", "beverage"], { allergens: [] }),
  row("Weekly Features — Tuesday", "Texas Brisket Taco", null, ["weekly"], { allergens: [] }),
  row("Weekly Features — Tuesday", "Pulled Pork Taco", null, ["weekly"], { allergens: [] }),
  row("Weekly Features — Tuesday", "Fried Fish Taco", null, ["weekly"], { allergens: ["fish"] }),
  row("Weekly Features — Tuesday", "Grilled Shrimp Taco", null, ["weekly"], { allergens: ["shellfish"] }),
  row("Weekly Features — Sunday", "Smokehouse Burger", null, ["weekly"], { allergens: [] }),
  row("Weekly Features — Sunday", "Surf & Turf Burger", null, ["weekly"], { allergens: [], isConfigurable: true }),
  row("Non-Alcoholic", "Athletic Brewing NA", null, ["beverage"], { allergens: [] }),
  row("Non-Alcoholic", "Soft Drinks", "Coca Cola, Diet Coke, Sprite, ginger beer, orange soda, iced tea, lemonade, juices, milk, hot tea, coffee or espresso.", ["beverage"], { allergens: [], isConfigurable: true }),
  row("Non-Alcoholic", "Coffee", null, ["dessert"], { allergens: [] }),
  row("Non-Alcoholic", "Espresso", null, ["dessert"], { allergens: [] }),
  row("Non-Alcoholic", "Hot Tea", "English Breakfast, chamomile, green ginger or tropical passion.", ["dessert"], { allergens: [], isConfigurable: true }),
];

const fixedOverrides = new Map([
  ["chickpea fries", []],
  ["avocado lime ranch", []],
  ["ranch", []],
  ["tartar sauce", []],
  ["second salad dressing", []],
  ["fried oyster or shrimp po boy", ["wheat", "gluten", "shellfish"]],
  ["wild mushroom sandwich", ["wheat", "gluten"]],
  ["blackened salmon blt", ["wheat", "gluten", "fish"]],
  ["crispy skin salmon gf", ["milk", "fish"]],
  ["smashburger", ["milk", "wheat", "gluten"]],
  ["french toast", ["milk", "egg", "wheat", "gluten"]],
  ["maine lobster roll", ["milk", "wheat", "gluten", "shellfish"]],
  ["fried oreos", ["wheat", "gluten"]],
  ["classic benedict", ["milk", "egg", "wheat", "gluten"]],
  ["coastal morning breakfast", ["egg", "wheat", "gluten"]],
  ["crab cake benedict", ["milk", "egg", "wheat", "gluten", "shellfish"]],
  ["crab cake", ["milk", "shellfish"]],
  ["crab mac cheese", ["milk", "wheat", "gluten", "shellfish"]],
  ["crispy skin salmon", ["milk", "fish"]],
  ["fried oreos", ["milk", "wheat", "gluten"]],
  ["kids mac cheese no crumbles", ["milk", "wheat", "gluten"]],
  ["mixed berry shortcake", ["milk", "wheat", "gluten"]],
  ["old bay chicken wings 7", []],
  ["pepperoni pizza", ["milk", "wheat", "gluten"]],
  ["seafood pizza", ["milk", "wheat", "gluten", "shellfish"]],
  ["slow smoked chicken wings 7", []],
  ["wild mushroom pizza", ["milk", "wheat", "gluten"]],
]);

export function buildAllSetAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const sourceSnapshot = JSON.parse(readFileSync(sourceSnapshotPath, "utf8"));
  const byName = new Map();

  for (const sourceItem of sourceSnapshot.items) {
    const sourceKey = normalize(sourceItem.name);
    if (/^extra\b/.test(sourceKey) || excludedOnlineRows.has(sourceKey)) continue;
    addPresentation(byName, {
      name: canonicalNames.get(sourceKey) ?? sourceItem.name.replace(/\s*\((?:V,?\s*)?GF\)\s*$/i, "").trim(),
      sourceName: sourceItem.name,
      category: sourceItem.category,
      description: cleanSyntheticDescription(sourceItem.description),
      sourceUrls: [sourceUrlsAllSet.online],
      sourceType: "restaurant-issued-online-menu",
      isConfigurable: false,
    });
  }

  for (const manual of manualRows) {
    addPresentation(byName, {
      ...manual,
      sourceName: manual.name,
      sourceUrls: manual.sourceKeys.map((key) => sourceUrlsAllSet[key]),
      sourceType: "restaurant-issued-pdf-menu",
    });
  }

  addPdfPresentations(byName);

  const items = [...byName.values()].map((item, index) => {
    const key = normalize(item.name);
    const manual = manualRows.find((candidate) => normalize(candidate.name) === key);
    const allergens = orderedAllergens(
      fixedOverrides.has(key) ? fixedOverrides.get(key)
        : manual?.allergens !== undefined ? manual.allergens
          : publishedSignalsAllSet(item),
    );
    return {
      auditItemKey: `${index + 1}:${slugify(item.name)}`,
      ...item,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });

  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  if (items.length !== 104 || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`All Set current manifest changed: ${items.length} formulations, ${presentationCount} presentations.`);
  }
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAllSet,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAllSet),
    presentationCount,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "All Set publishes current restaurant-issued online ordering text and nine current PDF menus, but no complete recipe-level allergen matrix or cross-contact disclosure. Positive signals use explicit fixed ingredients and unavoidable named formats; GF/V labels are preserved as source context but not converted into safety claims. Nested Extra modifiers and a truncated platter-upcharge fragment are excluded, optional choices are not promoted into fixed claims, and absent text remains unavailable.",
    items,
  };
}

export function publishedSignalsAllSet(item) {
  const text = normalize([item.name, ...item.presentations.flatMap((presentation) => [presentation.sourceName, presentation.description])].join(" "));
  const signals = [];
  if (/\b(?:milk|butter|buttermilk|whipped cream|cream sauce|creamy|cream|gelato|ice cream|cheddar|cheeses?|parmesan|gruyere|provolone|mozzarella|cotija|feta|bleu cheese|blue cheese|american)\b/.test(text)) signals.push("milk");
  if (/\b(?:eggs?|mayonnaise|aioli|hollandaise)\b/.test(text)) signals.push("egg");
  if (/\bpeanut\b/.test(text)) signals.push("peanut");
  if (/\b(?:almonds?|walnuts?|hazelnuts?|pistachios?)\b/.test(text)) signals.push("tree-nut");
  if (/\b(?:tempura|battered|brioche|biscuit|bread|roll|toast|ciabatta|pretzel|campanelle|crackers?|crumbs?|cookies?|cake|pizza|cornbread|english muffin|po boy)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:salmon|tuna|trout|cod|branzino|white fish|fish sticks?|fish tacos?)\b/.test(text)) signals.push("fish");
  if (/\b(?:lobster|crab|shrimp|oysters?|mussels|clam|calamari)\b/.test(text)) signals.push("shellfish");
  if (/\bmustard\b/.test(text)) signals.push("mustard");
  return orderedAllergens(signals);
}

function addPdfPresentations(byName) {
  const rows = [
    ["½ LB Fried Oysters", "Daily — Appetizers", "Battered and fried oysters, Old Bay, tartar sauce and lemon zest.", "daily"],
    ["½ LB Fried Shrimp", "Daily — Appetizers", "Tempura-battered fried shrimp, cocktail sauce and lemon.", "daily"],
    ["Chickpea Fries", "Daily — Appetizers", "Chickpeas, shredded zucchini, roasted garlic and avocado lime ranch; labeled vegan and gluten free.", "daily"],
    ["Roasted Cauliflower", "Daily — Appetizers", "Cotija cheese, scallions and chipotle aioli.", "daily"],
    ["Crab Cake", "Daily — Entrees", "Jumbo lump crab cake, crab beurre blanc, corn, bell peppers, fingerling potatoes, Old Bay and arugula.", "daily"],
    ["Crab Mac & Cheese", "Daily — Appetizers", "Crab, Gruyere, Vermont white cheddar, Parmesan, campanelle, Old Bay and herb crumb.", "daily"],
    ["Crispy Skin Salmon", "Daily — Entrees", "Pan-seared salmon, roasted cauliflower, oyster mushrooms and caper dill cream sauce; labeled gluten free.", "daily"],
    ["Fried Oreos", "Desserts", "Tempura battered, powdered sugar and chocolate ganache.", "dessert"],
    ["Mixed Berry Shortcake", "Desserts", "Macerated berries, buttermilk biscuit and whipped cream.", "dessert"],
    ["Maine Lobster Roll", "Daily — Entrees", "Maine lobster served hot with lemon butter, chives and a New England roll; choice of fries or mixed green salad.", "daily"],
    ["Fried Oyster or Shrimp Po'Boy", "Daily — Sandwiches", "Fried oysters or shrimp, chopped iceberg, tomatoes, Old Bay tartar sauce and sub roll.", "daily"],
    ["Wild Mushroom Sandwich", "Daily — Sandwiches", "BBQ wild mushrooms, pickles, chipotle coleslaw, fried shallots, North Carolina BBQ sauce and pretzel roll.", "daily"],
    ["Tempura Battered Fish Tacos (3)", "Daily — Appetizers", "Fried Atlantic cod, spicy coleslaw, avocado lime ranch and corn tortilla.", "daily"],
    ["Slow Smoked Chicken Wings (7)", "Daily — Appetizers", "Choice of BBQ dry rub, honey sriracha or buffalo; bleu cheese or ranch.", "daily"],
    ["Old Bay Chicken Wings (7)", "Daily — Appetizers", "Twice-fried Old Bay chicken wings; bleu cheese or ranch.", "daily"],
    ["Pepperoni Pizza", "Daily — Pizza", "Pepperoni, mozzarella, provolone, Parmesan and tomato sauce on a 12-inch hand-tossed pizza.", "daily"],
    ["Seafood Pizza", "Daily — Pizza", "Maine lobster, crab, shrimp, caramelized leeks, mozzarella, provolone, Parmesan, seafood Mornay and Old Bay on a 12-inch hand-tossed pizza.", "daily"],
    ["Wild Mushroom Pizza", "Daily — Pizza", "Cremini, shiitake and oyster mushrooms, arugula pesto, mozzarella, provolone, Parmesan and tomato sauce on a 12-inch hand-tossed pizza.", "daily"],
    ["Kids Grilled Cheese", "Kids Menu", "Vermont cheddar and brioche toast.", "kids"],
    ["Kids Fish Sticks", "Kids Menu", "Battered and fried white fish sticks.", "kids"],
  ];
  for (const [name, category, description, key] of rows) {
    const target = findItem(byName, name);
    if (!target) continue;
    target.presentations.push({ category, sourceName: name, description, sourceUrls: [sourceUrlsAllSet[key]] });
    target.sourceUrls = unique([...target.sourceUrls, sourceUrlsAllSet[key]]);
  }
}

function addPresentation(byName, published) {
  const key = normalize(published.name);
  let item = byName.get(key);
  if (!item) {
    item = {
      id: slugify(published.name),
      name: published.name,
      category: published.category,
      description: published.description || null,
      ingredientsText: published.description || null,
      imageUrl: null,
      isConfigurable: Boolean(published.isConfigurable || ["maine lobster roll", "fried oyster or shrimp po boy"].includes(key)),
      aliases: published.sourceName && normalize(published.sourceName) !== key ? [published.sourceName] : [],
      presentations: [],
      sourceUrls: [],
      sourceType: published.sourceType,
    };
    byName.set(key, item);
  } else {
    item.isConfigurable ||= Boolean(published.isConfigurable);
    if (published.sourceName && normalize(published.sourceName) !== key && !item.aliases.some((alias) => normalize(alias) === normalize(published.sourceName))) item.aliases.push(published.sourceName);
    if (!item.description && published.description) {
      item.description = published.description;
      item.ingredientsText = published.description;
    }
    if (item.sourceType !== published.sourceType) item.sourceType = "restaurant-issued-online-and-pdf-menu";
  }
  item.presentations.push({
    category: published.category,
    sourceName: published.sourceName,
    description: published.description || null,
    sourceUrls: published.sourceUrls,
  });
  item.sourceUrls = unique([...item.sourceUrls, ...published.sourceUrls]);
}

function findItem(byName, name) { return byName.get(normalize(name)); }
function row(category, name, description, sourceKeys, options = {}) { return { category, name, description, sourceKeys, ...options }; }
function cleanSyntheticDescription(value) { return /from the restaurant s current official menu or allergen source/i.test(normalize(value)) ? null : value || null; }
function normalize(value) { return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function slugify(value) { return normalize(value).replace(/\s+/g, "-"); }
function unique(values) { return [...new Set(values)]; }
const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) { const found = new Set(values); return allergenOrder.filter((allergen) => found.has(allergen)); }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAllSetAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAllSet}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ itemCount: snapshot.itemCount, presentationCount: snapshot.presentationCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
