import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAhso = "replacement-ahso-restaurant-brambleton-va";
export const sourceUrlsAhso = Object.freeze({
  dinner: "https://www.ahsoresto.com/toeat",
  directOrder: "https://order.toasttab.com/online/ahso-restaurant",
  faq: "https://www.ahsoresto.com/faq",
});

const currentFormulations = Object.freeze([
  formulation("Dinner — Bar Snacks", "Charcuterie and Cheese Board", "American farmstead cheeses + artisan meats + house pickles + grilled bread", ["milk", "wheat", "gluten"], "dinner", {
    presentations: [
      { surface: "Official dinner menu", category: "Bar Snacks" },
      { surface: "Direct order", category: "1st Course — available after 4pm" },
    ],
    sourceKeys: ["dinner", "directOrder"],
  }),
  formulation("Dinner — Bar Snacks", "Fried Brussels Sprouts", "red boat caramel + crispy + delicious", [], "dinner"),
  formulation("Dinner — Bar Snacks", "Crispy Pork Ribs", "kimchi bbq + furikake", [], "dinner"),
  formulation("Dinner — Bar Snacks", "Mediterranean Tomato & Red Pepper Dip", "feta + olives + almond + grilled sourdough", ["milk", "tree-nut", "wheat", "gluten"], "dinner"),

  formulation("Dinner — 1st Course", "Whipped Chevre & Roasted Beets", "arugula + Calabrian honey macha vinaigrette + smoked pistachio + balsamic shallot", ["milk", "tree-nut"], "dinner"),
  formulation("Dinner — 1st Course", "Seoul-ful Pork Shoulder & Kimchi Wraps", "fried rice + kimchi + tamari dipping sauce", ["soy"], "dinner"),
  formulation("Dinner — 1st Course", "Steamed PEI Mussels", "tom kha broth + grilled sourdough", ["shellfish", "wheat", "gluten"], "dinner"),
  formulation("Dinner — 1st Course", "Grilled Spanish Octopus", "roasted spaghetti squash + charred lemon brodo + crispy potato", ["shellfish"], "dinner"),

  formulation("Dinner — Seafood", "Pan Seared Ocean Trout", "bacon-braised collard greens + Anson Mills grits", ["fish"], "dinner"),
  formulation("Dinner — Seafood", "Seared Sea Scallops", "saffron risotto + PEI mussels + chorizo-potato espuma + crispy gremolata", ["shellfish"], "dinner"),

  formulation("Dinner — Pasta", "Vegetable Fettuccini", "bacon-braised collard greens + Anson Mills grits; add braised short rib", ["wheat", "gluten"], "dinner", { isConfigurable: true }),
  formulation("Dinner — Pasta", "Tagliatelle Amatriciana", "pork belly + tomato + whipped ricotta", ["milk", "wheat", "gluten"], "dinner"),

  formulation("Dinner — Meat", "24hr Braised Beef Short Rib", "smoked root vegetables + roasted cippolini onion + red wine reduction", [], "dinner"),
  formulation("Dinner — Meat", "Smoked & Grilled Pork Chop", "Baker Farms, Mt. Jackson, VA; butternut squash + bacon brussels + balsamic glaze + mustard demi", ["mustard"], "dinner"),
  formulation("Dinner — Meat", "Pennsylvania Duck Breast", "beet & citrus salad + celeriac puree + blood orange reduction", [], "dinner"),

  formulation("Direct Order — 1st Course", "Crispy Brussels Sprouts", "honey sriracha glaze + crispy + delicious", [], "directOrder"),
  formulation("Direct Order — 1st Course", "Goat Cheese Dip", "stuffed w/ basil pesto and fried + spicy red pepper/tomato dip + grilled sourdough", ["milk", "wheat", "gluten"], "directOrder"),
  formulation("Direct Order — 1st Course", "Peach & Burrata", "beets + arugula + calabrian honey macha vinaigrette", ["milk"], "directOrder"),
  formulation("Direct Order — 1st Course", "Seared Scallops", "saffron celery root + snow peas + orange chili crisp", ["shellfish"], "directOrder"),
  formulation("Direct Order — 1st Course", "Fried Green Tomatoes", "pimento cheese + red pepper jam", ["milk"], "directOrder"),
  formulation("Direct Order — 1st Course", "Yellow Fin Tuna Tartare", "saffron aioli + house made kimchi + crispy tuile", ["fish", "egg"], "directOrder"),
  formulation("Direct Order — 1st Course", "Crispy Pork Ribs", "miso ginger glaze", ["soy"], "directOrder"),

  formulation("Direct Order — Main Course", "Ahso Burger", "white cheddar + bacon jam + dijon aioli + arugula + rustic fried potatoes + green salad", ["milk", "egg", "mustard", "wheat", "gluten"], "directOrder"),
  formulation("Direct Order — Main Course", "New England Sea Scallops", "anson mills grits + bacon-braised collard greens", ["shellfish"], "directOrder"),
  formulation("Direct Order — Main Course", "Seared Halibut", "herbed risotto + mushroom brodo + shaved asparagus", ["fish"], "directOrder"),
  formulation("Direct Order — Main Course", "Ricotta Gnocchi", "smoked labneh + rapini pesto + brown butter hazelnuts + chili crisp", ["milk", "tree-nut"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Main Course", "Pan Seared Duck Breast", "roasted mushroom & swiss chard + red cabbage jus", [], "directOrder"),
  formulation("Direct Order — Main Course", "Chateaubriand for One", "roasted beef tenderloin + grilled asparagus + potato-cheddar-sour-cream waffle + cabernet reduction", ["milk", "wheat", "gluten"], "directOrder", { isConfigurable: true }),

  formulation("Direct Order — Kids Menu", "Kids Pasta w/ Sauce", "Choice of 2 sides", ["wheat", "gluten"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Kids Menu", "Kids Pasta Butter n Parm", "Choice of 2 sides", ["milk", "wheat", "gluten"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Kids Menu", "Kids Mac n Cheese", "Choice of 2 sides", ["milk", "wheat", "gluten"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Kids Menu", "Kids Burger (No Cheese)", "Choice of 2 sides", ["wheat", "gluten"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Kids Menu", "Kids Cheeseburger", "Choice of 2 sides", ["milk", "wheat", "gluten"], "directOrder", { isConfigurable: true }),

  formulation("Direct Order — Dessert", "The King of Rock & Roll", "marshmallow fluff + brûlée banana + house peanut butter ice cream + chocolate cake crumble + chocolate sauce + candied bacon", ["milk", "egg", "peanut", "wheat", "gluten"], "directOrder"),
  formulation("Direct Order — Dessert", "Brioche Bread Pudding", "banana rum caramel + vanilla ice cream", ["milk", "egg", "wheat", "gluten"], "directOrder"),

  formulation("Direct Order — Ramen Night (Mondays)", "The O.G. Ramen", "Pork Broth | Braised Pork Shoulder | Smoked Pork Belly | Marinated Egg | Baby Bok Choy | Shoyu Tare | House Noodles", ["egg", "soy", "wheat", "gluten"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Ramen Night (Mondays)", "The Bad Hunter", "Vegetarian Broth | Tofu | Mushroom | Marinated Egg | Baby Bok Choy | Miso Tare", ["egg", "soy"], "directOrder"),
  formulation("Direct Order — Ramen Night (Mondays)", "Pork Broth - Build Your Own", "starts with PORK BROTH, noodles, bok choy & marinated soft poached egg; must click to add meat & extras", ["egg", "wheat", "gluten"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Ramen Night (Mondays)", "Veggie Broth - Build Your Own", "starts with broth, noodles, bok choy & marinated soft poached egg; must click to add extras", ["egg", "wheat", "gluten"], "directOrder", { isConfigurable: true }),
  formulation("Direct Order — Ramen Night (Mondays)", "Kids Ramen (Broth N Noodles)", "Broth and noodles", ["wheat", "gluten"], "directOrder"),
  formulation("Direct Order — Ramen Night (Mondays)", "Side Of Kimchi", "", [], "directOrder"),

  formulation("Direct Order — Burger Night (Wednesdays)", "Burger - Click to choose add ons!", "7oz Seven Hills Grass Fed Beef | potato bun | grain mustard aioli | cheddar", ["milk", "egg", "mustard", "wheat", "gluten"], "directOrder", { isConfigurable: true }),
]);

export function buildAhsoAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = currentFormulations.map((item, index) => {
    const id = `${slugify(item.category)}-${slugify(item.name)}`;
    const sourceKeys = item.sourceKeys ?? [item.sourceKey];
    return {
      auditItemKey: `${index + 1}:${id}`,
      id,
      name: item.name,
      category: item.category,
      variantGroup: item.category,
      description: item.description,
      ingredientsText: item.description,
      isConfigurable: Boolean(item.isConfigurable),
      presentations: item.presentations ?? [{ surface: sourceKeys[0] === "dinner" ? "Official dinner menu" : "Direct order", category: item.category.split(" — ").slice(1).join(" — ") }],
      sourceUrls: sourceKeys.map((key) => sourceUrlsAhso[key]),
      sourceType: sourceKeys.includes("dinner") ? "restaurant-issued-menu" : "restaurant-linked-ordering-menu",
      allergens: [...item.allergens],
      mayContain: [],
      allergenSourceType: item.allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  if (items.length !== 42 || new Set(items.map((item) => item.id)).size !== 42) {
    throw new Error("Ahso current formulation identities changed.");
  }
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAhso,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAhso),
    presentationCount: 43,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "Ahso Restaurant publishes fixed descriptions but no complete item-level allergen matrix or recipes. Its FAQ says dishes can be modified and most of the menu happens to be gluten-free; that general statement is not promoted to item-level absence claims. The restaurant-issued dinner page warns that it may lag the kitchen, so the directly linked operational ordering surface is preserved separately. Ahso Cellars at suite #105 is a distinct sister business and is excluded.",
    items,
  };
}

function formulation(category, name, description, allergens, sourceKey, options = {}) {
  return { category, name, description, allergens, sourceKey, ...options };
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAhsoAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAhso}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ itemCount: snapshot.itemCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
