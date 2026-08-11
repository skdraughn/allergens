import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAkeno = "osm-akeno-sushi-thai-11475736769";
export const sourceUrlsAkeno = Object.freeze({
  home: "https://akenosushibar.com/",
  menu: "https://akenosushibar.com/menu",
});

const repository = JSON.parse(readFileSync(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"));
const frozenItems = repository.restaurants.find((restaurant) => restaurant.id === restaurantIdAkeno)?.items ?? [];

const removedNames = new Set([
  "Salmon Onigiri",
  "Extra Mushroom",
  "Ramune Strawberry",
  "Rice Outside",
  "Sweet Chili",
  "Ponzu",
  "Sweet & Sour",
]);

const currentNameByFrozenName = new Map([
  ["Smoked Salmon Foie Gras", "Smoked Salmon Foe Gras"],
  ["Shrimp & Vegetable Tempura", "Shrimp & Veggetable Tempura"],
  ["Sashimi Tasting", "Sashimi Testing"],
  ["Shiitake Roll", "Shitake Roll"],
  ["Liquid Death Sparkling", "Liquid Death Sparking"],
  ["Steamed Bean Sprouts", "Steamed Bean Sprout"],
  ["Steamed Carrots", "Steamed Carrot"],
  ["Salmon Teriyaki Bento", "SalmonTeriyaki Bento"],
]);

const categoryOverrides = new Map([
  ["Chili Oil", "Sauce"],
  ["Eel Sauce", "Sauce"],
  ["Spicy Mayo", "Sauce"],
  ["Sriracha", "Sauce"],
  ["Teriyaki Sauce", "Sauce"],
]);

const descriptionOverrides = new Map([
  ["Nigiri Plate", "7 pieces of nigiri assortment / 6 pieces of classic roll served with miso soup."],
  ["Premium Nigiri Plate", "12 pieces of nigiri assortment / 6 pieces of classic roll served with miso soup."],
  ["Premium Sashimi Plate", "21 pieces of premium chef's selection sashimi served with miso soup"],
  ["Premium Nigiri and Sashimi Plate", "11 pieces nigiri / 21 pieces sashimi / 6 pieces of classic roll served with miso soup."],
  ["Niku-Udon", "Sliced beef brisket Udon noodle soup with fish cake and scallion in light soy broth sauce"],
  ["Gyu-Don", "Thinly sliced fatty beef and onion in lightly sweet mirin soy sauce topped with egg"],
  ["Gyu-Don (L)", "Slice tender beef sweet dashi sauce onion, scallion, egg and sesame seed served with miso soup"],
]);

const additions = Object.freeze([
  add("Daily Special", "Crispy Rice Crab Tartare", "Crispy rice topped with crab meat salad-tobiko-scallion and eel sauce - spicy mayo"),
  add("Daily Special", "Wasa-Sake", "Seared Salmon Toro / Salmon Roe / wasabi salsa / daikon / nigiri-truffle sauce"),
  add("Nigiri or Sashimi (2 pcs/order)", "Sake", "Salmon."),
  add("Nigiri or Sashimi (2 pcs/order)", "Sake Toro", "Salmon Belly"),
  add("Hosomaki (Seaweed Outside)", "Sake Roll", "Fresh salmon / seaweed outside."),
  add("Non-Alcoholic", "Coca-Cola", "Coca-Cola Original Taste — the crisp, refreshing taste you know and love"),
  add("Non-Alcoholic", "Sprite", "Classic, cool, crisp lemon-lime flavored taste that's caffeine free"),
  add("Non-Alcoholic", "Diet Coke", "Take a Diet Coke break with this refreshing, no-calorie soft drink"),
  add("Non-Alcoholic", "Lemonade", "", { presentations: [{ category: "Non-Alcoholic" }, { category: "Juices" }] }),
  add("Non-Alcoholic", "Ginger Ale", ""),
  add("Non-Alcoholic", "Iced Tea", ""),
  add("Non-Alcoholic", "Tonic Water", ""),
  add("Non-Alcoholic", "Ginger Beer", ""),
  add("Juices", "Orange Juice", ""),
  add("Juices", "Cranberry Juice", ""),
  add("Juices", "Pineapple Juice", ""),
  add("Juices", "Apple Juice", ""),
]);

const configurableNames = new Set([
  "Crunchy Spicy Roll",
  "Curry-Don",
  "PadThai Noodle",
  "Drunken Noodle",
  "Pad See Eew Noodle",
  "Fried Rice",
  "Kaprow",
  "Panang Curry",
  "Green Curry",
  "Crunchy Spicy Bento Box",
]);

export function buildAkenoAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const seeded = frozenItems
    .filter((item) => !removedNames.has(item.name))
    .map((item) => {
      const name = currentNameByFrozenName.get(item.name) ?? item.name;
      return currentItem({
        ...item,
        name,
        category: categoryOverrides.get(item.name) ?? item.category,
        description: descriptionOverrides.get(item.name) ?? item.description ?? "",
      });
    });
  const items = [...seeded, ...additions.map(currentItem)]
    .sort(compareCurrentItems)
    .map((item, index) => {
      const id = `${slugify(item.category)}-${slugify(item.name)}`;
      const allergens = publishedSignalsAkeno(item);
      return {
        auditItemKey: `${index + 1}:${id}`,
        id,
        name: item.name,
        category: item.category,
        variantGroup: item.category,
        description: item.description,
        ingredientsText: fixedIngredientText(item),
        imageUrl: item.imageUrl ?? null,
        isConfigurable: Boolean(item.isConfigurable || configurableNames.has(item.name)),
        presentations: item.presentations ?? [{ category: item.category }],
        sourceUrls: [sourceUrlsAkeno.menu],
        sourceType: "restaurant-linked-ordering-menu",
        allergens,
        mayContain: [],
        allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      };
    });
  if (items.length !== 234 || items.reduce((sum, item) => sum + item.presentations.length, 0) !== 235 || new Set(items.map((item) => item.id)).size !== 234) {
    throw new Error("Akeno current formulation manifest changed.");
  }
  const categories = new Set(items.flatMap((item) => item.presentations.map((presentation) => presentation.category)));
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAkeno,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAkeno),
    presentationCount: 235,
    itemCount: items.length,
    categoryCount: categories.size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "Akeno's restaurant-controlled Annandale ordering page publishes current names and descriptions but no complete allergen matrix, recipes, or cross-contact policy. Positive signals use explicit fixed ingredients or unavoidable named formats only. Optional protein choices are masked, imitation crab is treated as fish rather than shellfish, coconut is not treated as milk or tree-nut, and absent text is not an allergen-free claim.",
    items,
  };
}

export function publishedSignalsAkeno(item) {
  if (item.category === "Sauce") {
    if (item.name === "Spicy Mayo") return ["egg"];
    if (item.name === "Peanut sauce") return ["peanut"];
    return [];
  }
  const description = fixedIngredientText(item);
  let text = normalizeText(`${item.name} ${description}`);
  if (/imitation crab/i.test(description)) {
    text = text.replace(/crab rangoon/g, "surimi rangoon");
  }
  text = text.replace(/imitation crab|crab sticks?|kanikama/g, "surimi fish");
  const milkText = text.replace(/coconut (?:milk|cream)/g, "coconut");
  const signals = [];
  if (/\b(?:butter|cream cheese|cheese|cheesecake|ice cream|cream|parmesan)\b/.test(milkText)) signals.push("milk");
  if (/\b(?:eggs?|omelets?|tamago|mayo|mayonnaise|cheesecake)\b/.test(text)) signals.push("egg");
  if (/\bpeanuts?\b/.test(text)) signals.push("peanut");
  if (/\b(?:wheat|panko|wontons?|roti|rangoon|ramen|udon|yakisoba|angle hair|gyoza|dumplings?|shumai|spring roll|takoyaki|tempura|cheesecake)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:fish|tuna|salmon|yellowtail|hamachi|bonito|mackerel|saba|eel|unagi|halibut|flounder|branzino|brozini|snapper|madai|escolar|walu|kanpachi|amber jack|striped jack|maguro|sawara|masago|tobiko|ikura|roe|surimi)\b/.test(text)) signals.push("fish");
  if (/\b(?:shrimp|crab|scallops?|mussels?|squid|octopus|lobster|ebi|hotate|ika|tako)\b/.test(text)) signals.push("shellfish");
  if (/\b(?:soy|soybeans?|tofu|edamame|miso|shoyu)\b/.test(text)) signals.push("soy");
  if (/\bsesame\b/.test(text)) signals.push("sesame");
  if (/\bmustard\b/.test(text)) signals.push("mustard");
  return orderedUnique(signals);
}

function currentItem(item) {
  return {
    name: item.name,
    category: item.category,
    description: item.description ?? "",
    imageUrl: item.imageUrl ?? null,
    isConfigurable: item.isConfigurable ?? false,
    presentations: item.presentations,
  };
}

function add(category, name, description, options = {}) {
  return { category, name, description, ...options };
}

function fixedIngredientText(item) {
  let text = String(item.description ?? "");
  text = text.replace(/choice of tuna\**,?\s*salmon\**,?\s*yellowtail\**\s*or shrimp/ig, "choice of protein");
  text = text.replace(/pick 2 choices of \([^)]*(?:tuna|salmon|yellowtail|shrimp)[^)]*\)/ig, "pick 2 protein choices");
  text = text.replace(/\|\s*Add\s+[^|]+/ig, "");
  return text.trim();
}

function normalizeText(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedUnique(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const categoryOrder = [
  "Daily Special", "Hot Kitchen Appetizer", "Sushi Bar Appetizer", "Soup", "Salad", "Yakitori (Grilled)", "Donburi (Rice Bowl)", "Hosomaki (Seaweed Outside)", "Uramaki Roll (Rice Outside)", "Special Roll", "Nigiri or Sashimi (2 pcs/order)", "Akeno Special Plate", "Ramen Noodle", "Noodle and Fried Rice", "Entrée", "Dessert", "Sauce", "Rice", "Veggie", "Steamed Noodle", "Non-Alcoholic", "Ramune Soda", "Juices", "Appetizer Lunch", "Bento Box", "Sushi Set Lunch", "Lunch Entree", "Donburi Bowl Lunch",
];
function compareCurrentItems(a, b) {
  const categoryDifference = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  return categoryDifference || a.name.localeCompare(b.name);
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAkenoAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAkeno}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ itemCount: snapshot.itemCount, presentationCount: snapshot.presentationCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
