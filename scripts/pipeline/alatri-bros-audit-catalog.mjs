import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAlatriBros = "alatri-bros-bethesda-md";
export const sourceUrlsAlatriBros = Object.freeze({
  officialMenu: "https://www.alatribros.com/menu",
  toast: "https://www.toasttab.com/local/order/alatri-bros",
});

const both = ["Dinner", "Dinner (3PD)"];
const toastRows = [
  row("SPECIALS", "Blackened trout", "Served with roasted Brussels sprouts, sundried tomatoes aglio e olio and roasted potatoes", both),
  row("SPECIALS", "Carmellina Sandwich", "Housemade focaccia layered with basil aioli, pan-seared chicken, melted gruyere, roasted red pepper, balsamic-dressed spinach and caramelized onion mustard", both),
  row("SPECIALS", "Chicken Parmesan Rose Sandwich", "Crispy chicken, spicy rose sauce, melted mozzarella and ciabatta", both),
  row("SPECIALS", "Strawberry Gelato", "", ["Dinner"]),
  row("SPECIALS", "Blueberry Cheesecake", "", both),
  row("Small Plates", "Truffle Arancini", "Panko, mozzarella, Arborio rice and rose sauce", both),
  row("Small Plates", "Brussel Sprouts", "Flash fried with housemade hot sauce and blue cheese dressing", both),
  row("Small Plates", "Mussels", "PEI mussels in a lemon-white wine sauce or housemade marinara", both, { isConfigurable: true }),
  row("Small Plates", "Sautéed Broccolini", "EVOO, garlic and red pepper flakes", both),
  row("Small Plates", "Mushroom Crostini", "Mushroom, shallots, goat cheese and chives", both),
  row("Small Plates", "Proscuitto Crostini", "Prosciutto, ricotta, arugula and honey", both),
  row("Small Plates", "Tomato Crostini", "Tomato, mozzarella and basil", both),
  row("Small Plates", "Bread Sticks", "", both),
  row("Small Plates", "Feta Bread", "", both),
  row("Small Plates", "Garlic Focaccia Bread", "", both),
  row("Small Plates", "Olives", "", both),
  row("Small Plates", "Crab Cake App", "One five-ounce crab cake served with creamy tomato risotto", both),
  row("Small Plates", "Bunless Meatballs", "", ["Dinner (3PD)"]),
  row("Small Plates", "Cauliflower Fritti", "Battered cauliflower with feta-red pepper dipping sauce", ["Dinner (3PD)"]),
  row("Small Plates", "Deviled Eggs", "Pepper flakes and chives", ["Dinner (3PD)"]),
  row("Small Plates", "Hand-Cut Fries", "Ketchup", ["Dinner (3PD)"]),
  row("Small Plates", "Limoncello Pepperoni Wings", "Pepperoni-limoncello sauce, cooked in the wood-fire oven", ["Dinner (3PD)"]),
  row("Small Plates", "Meatball Sliders", "Three beef sliders on brioche buns", ["Dinner (3PD)"]),
  row("Small Plates", "Roasted Edamame", "EVOO and sea salt", ["Dinner (3PD)"]),
  row("Small Plates", "Roasted Veggies", "Brussels sprouts, cauliflower, onion, mushrooms and broccolini", ["Dinner (3PD)"]),
  row("Small Plates", "Whipped Feta", "Honey, cracked black pepper and whipped feta cheese", ["Dinner (3PD)"], { allergens: ["milk", "wheat", "gluten"] }),
  row("Salads/Soups", "Arugula & Pear Salad", "Gorgonzola cheese, candied pecans and sherry vinaigrette", both),
  row("Salads/Soups", "Avocado & Healthy Grains", "Quinoa, tomato, parsley, onion, lemon and arugula", both),
  row("Salads/Soups", "Caesar Salad", "Romaine, focaccia crisps and white anchovy", both),
  row("Salads/Soups", "House Salad", "Mixed greens, grape tomatoes, focaccia crisps and balsamic vinaigrette", both),
  row("Salads/Soups", "Spinach Salad", "Apples, craisins, goat cheese, red onion, candied pecans and cranberry-apple cider dressing", both),
  row("Salads/Soups", "Half Caesar", "Half portion of Caesar Salad", ["Dinner"], { allergens: ["wheat", "gluten", "fish"] }),
  row("Salads/Soups", "Half House Salad", "Half portion of House Salad", ["Dinner"], { allergens: ["wheat", "gluten"] }),
  row("Salads/Soups", "Chicken Rigatoni Soup", "", both),
  row("Salads/Soups", "Minnestrone Soup", "", both),
  row("Boards", "Burrata", "Lioni burrata, baby arugula, roasted tomato, focaccia toast, balsamic and EVOO", both),
  row("Boards", "Veggies", "Cauliflower fritti, roasted beets, whipped feta and broccolini", both, { aliases: ["Eat Your Veggies"] }),
  row("Boards", "Meat & Cheese", "Prosciutto, soppressata, fresh mozzarella, parmesan and toasted focaccia", both),
  row("Boards", "Picnic Platter", "Deviled eggs, olives, parmesan, soppressata, arugula-tomato salad, bread sticks and garlic aioli", both),
  row("Pizzas", "Alsace", "Pancetta, gruyere, parmesan, caramelized onions and thyme", both),
  row("Pizzas", "Birria Calzon", "Red onion, Chihuahua cheese, cilantro and birria; optional meatball or sausage", both, { isConfigurable: true }),
  row("Pizzas", "Breakfast Pizza", "Fresh mozzarella, baked potato, sausage, Brussels sprouts and Fresno peppers", both),
  row("Pizzas", "Crazy Calabrese", "Tomato sauce, nduja, ricotta, caramelized onion, Fresno peppers, arugula and honey", both),
  row("Pizzas", "Cheese Calzone", "Ricotta, mozzarella, parmesan and marinara; optional meatballs", both, { isConfigurable: true }),
  row("Pizzas", "Exotic Mushroom", "Cremini, shiitake, trumpet, fontina and mushroom duxelles sauce", both),
  row("Pizzas", "Formaggio", "Mozzarella, fontina, gorgonzola, parmesan, garlic and parsley", both),
  row("Pizzas", "Jorges Inferno", "Basil pesto, pepperoni, Fresno peppers, olives, garlic, mozzarella and tomato sauce", both),
  row("Pizzas", "Margherita", "Fresh mozzarella, basil and tomato sauce", both),
  row("Pizzas", "Meatball Pie", "Chicken or beef meatballs, mozzarella, tomato sauce and parsley", both, { isConfigurable: true }),
  row("Pizzas", "Multi Carne", "Pepperoni, sausage, pancetta, bell pepper, mozzarella and tomato sauce", both, { aliases: ["Multi Carni"] }),
  row("Pizzas", "Prosciutto", "Mushrooms, caramelized onion, arugula, balsamic reduction and goat cheese", both),
  row("Pizzas", "Salsiccia", "Sausage, pepperoni, portobello, pepper flakes, parmesan, oregano, mozzarella and tomato sauce", both),
  row("Pizzas", "The Artichoke", "Artichoke hearts, spinach, cream, mozzarella and parmesan", both),
  row("Pizzas", "The Eggplant", "Grilled eggplant, roasted tomatoes, ricotta, mozzarella and basil pesto", both),
  row("Pizzas", "Tomato & Mozzarella Pie", "Fresh mozzarella, oregano and tomato sauce", both),
  row("Pizzas", "TMP - Pepperoni", "", ["Dinner"]),
  row("Pizzas", "Verdura", "Zucchini, eggplant, portobello, red pepper, onion, olives, fresh mozzarella and tomato sauce", both),
  row("Pizzas", "Burrata Pizza", "Burrata, tomato sauce and pesto drizzle", both, { aliases: ["Burrata"] }),
  row("Mains", "Shrimp Parmesan", "Shrimp Parmesan over fresh-made fettuccine", both),
  row("Mains", "Pasta Meatballs", "Chicken or beef meatballs, tomato sauce and spaghetti", both, { isConfigurable: true }),
  row("Mains", "Eggplant Parmesan", "Lightly breaded eggplant layered with mozzarella and marinara, served with a side house salad", both),
  row("Mains", "Tortellini Rose", "Cheese tortellini, chicken Milanese, wild mushrooms and rose sauce", both),
  row("Mains", "Chicken Piccata", "Chicken breast, lemon-caper sauce and spaghetti", both),
  row("Mains", "Short Rib Fettuccine", "Slow-cooked short ribs in a red wine-tomato sauce over housemade fettuccine", both),
  row("Mains", "Roasted Salmon", "Wood-roasted salmon, caper beurre-blanc sauce and roasted broccolini", both),
  row("Mains", "Cacio e Pepe", "Spaghetti, ground black pepper and fresh parmesan", both),
  row("Kids Menu", "Mini Tomato & Mozzarella Pie", "", both, { allergens: ["milk", "wheat", "gluten"] }),
  row("Kids Menu", "Mini Pepperoni Pie", "", both, { allergens: ["wheat", "gluten"] }),
  row("Kids Menu", "Little Mac & Cheese", "", both, { allergens: ["milk", "wheat", "gluten"] }),
  row("Kids Menu", "Mini Roasted Vegetables", "", both),
  row("Kids Menu", "Buttered Noodles", "", both),
  row("Kids Menu", "Little Pasta Tomato", "", both),
  row("Kids Menu", "Little Pasta Meatballs", "", both),
  row("Kids Menu", "Mini Fruit Plate", "", both),
  row("SANDWICHES", "Cold Cut Sandwich", "Mortadella, soppressata, prosciutto, tomato, fresh mozzarella and lettuce", both),
  row("SANDWICHES", "Chicken Cutlet Sandwich", "Sundried tomato pesto, prosciutto and fresh mozzarella", both),
  row("SANDWICHES", "Burrata Mortadella Sandwich", "Burrata, mortadella, red bell peppers and pesto", both),
  row("SANDWICHES", "Meatball Sandwich", "Chicken or beef meatballs, tomato sauce and mozzarella", both, { isConfigurable: true }),
  row("SANDWICHES", "Eggplant Parm Sandwich", "Lightly breaded eggplant, tomato sauce and mozzarella", both),
  row("SANDWICHES", "Short Rib Sandwich", "Slow-roasted short ribs, melted mozzarella and arugula", both),
  row("Desserts", "3 Scoops Gelato", "", ["Dinner (3PD)"], { isConfigurable: true }),
  row("Desserts", "Brownie & Gelato", "", ["Dinner (3PD)"], { allergens: ["milk", "egg", "wheat", "gluten"] }),
  row("Desserts", "Cannoli", "Housemade sweet ricotta and chocolate chips", ["Dinner (3PD)"]),
  row("Desserts", "Nutella Pizza", "Individual wood-fired pizza with Nutella and fresh strawberries", ["Dinner (3PD)"], { allergens: ["milk", "tree-nut", "wheat", "gluten"] }),
];

const officialRows = new Map([
  ...official("Small Plates to Share", [
    ["Deviled Eggs"], ["Whipped Feta"], ["Truffle Arancini"], ["Hand-Cut Fries"], ["Roasted Edamame"],
    ["Crab Cake App", "Crab Cake"], ["Cauliflower Fritti"], ["Roasted Veggies", "Roasted Vegetables"],
    ["Sautéed Broccolini"], ["Meatball Sliders"], ["Limoncello Pepperoni Wings", "Limoncello-Pepperoni Wings"],
    ["Brussel Sprouts", "Buffalo-Style Brussel Sprouts"], ["Mussels"],
  ]),
  ...official("Crostini", [["Tomato Crostini", "Tomato"], ["Mushroom Crostini", "Mushroom"], ["Proscuitto Crostini", "Prosciutto"]]),
  ...official("Boards", [["Picnic Platter"], ["Meat & Cheese"], ["Veggies"], ["Burrata"]]),
  ...official("Salads + Soups", [
    ["House Salad"], ["Arugula & Pear Salad", "Arugula and Pear"], ["Caesar Salad", "Caesar"], ["Spinach Salad"],
    ["Avocado & Healthy Grains", "Avocado Quinoa"], ["Chicken Rigatoni Soup"], ["Minnestrone Soup"],
  ]),
  ...official("Mains", [["Pasta Meatballs"], ["Tortellini Rose"], ["Eggplant Parmesan"], ["Shrimp Parmesan"], ["Roasted Salmon"], ["Short Rib Fettuccine"], ["Chicken Piccata"], ["Cacio e Pepe"]]),
  ...official("Wood Fired Pizzas", [
    ["Tomato & Mozzarella Pie"], ["Margherita"], ["Crazy Calabrese"], ["Multi Carne", "Multi Carni"], ["Jorges Inferno", "Jorge’s Inferno"],
    ["Salsiccia"], ["Meatball Pie"], ["Formaggio"], ["Alsace"], ["Verdura"], ["The Eggplant"], ["Exotic Mushroom"],
    ["The Artichoke"], ["Prosciutto"], ["Burrata Pizza", "Burrata"], ["Cheese Calzone"],
  ]),
]);

export function buildAlatriBrosAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = toastRows.map((sourceRow, index) => {
    const officialRow = officialRows.get(sourceRow.name);
    const aliases = unique([...(sourceRow.aliases ?? []), ...(officialRow?.sourceName && officialRow.sourceName !== sourceRow.name ? [officialRow.sourceName] : [])]);
    const presentations = sourceRow.channels.map((channel) => ({
      category: `${channel} — ${sourceRow.category}`,
      sourceName: sourceRow.name,
      sourceUrl: sourceUrlsAlatriBros.toast,
    }));
    if (officialRow) {
      presentations.push({
        category: `Official Website — ${officialRow.category}`,
        sourceName: officialRow.sourceName,
        sourceUrl: sourceUrlsAlatriBros.officialMenu,
      });
    }
    const allergens = sourceRow.allergens ?? publishedSignalsAlatriBros(sourceRow);
    const mayContain = ["peanut", "tree-nut", "gluten"];
    return {
      auditItemKey: `${index + 1}:${slugify(sourceRow.name)}`,
      id: slugify(sourceRow.name),
      name: sourceRow.name,
      category: presentations[0].category,
      description: sourceRow.description || null,
      ingredientsText: sourceRow.description || null,
      imageUrl: null,
      isConfigurable: Boolean(sourceRow.isConfigurable),
      aliases,
      presentations,
      sourceUrls: unique(presentations.map((presentation) => presentation.sourceUrl)),
      sourceType: officialRow ? "restaurant-issued-and-linked-menu" : "restaurant-linked-ordering-menu",
      allergens,
      mayContain,
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "official-global-cross-contact-note",
    };
  });
  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.flatMap((item) => item.presentations.map((presentation) => presentation.category))).size;
  if (items.length !== 84 || presentationCount !== 202 || categoryCount !== 23 || new Set(items.map((item) => item.id)).size !== 84 || officialRows.size !== 51) {
    throw new Error(`Alatri Bros. current manifest changed: ${items.length} items, ${presentationCount} presentations, ${categoryCount} categories, ${officialRows.size} official rows.`);
  }
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const crossContactOnlyCount = items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length;
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAlatriBros,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAlatriBros),
    presentationCount,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount,
    unavailableAllergenCount: 0,
    sourceWarning: "Alatri Bros.' restaurant-issued current menu and restaurant-linked Toast catalog publish selected fixed ingredients but no complete item-level allergen matrix or recipes. Positive contains claims use fixed text and mandatory named formats only; configurable add-ons and salad proteins are excluded. The official menu separately says the restaurant cannot guarantee food completely gluten- or nut-free. That global statement is represented as may-contain peanut, tree nut, and gluten for every food formulation, not as a fixed ingredient or negative safety claim.",
    items,
  };
}

export function publishedSignalsAlatriBros(item) {
  const text = normalizeText(`${item.name} ${item.description}`);
  const signals = [];
  if (/\b(?:gruyere|parmesan|mozzarella|gorgonzola|goat cheese|ricotta|burrata|feta|blue cheese|fontina|chihuahua cheese|cream|beurre blanc|gelato|cheesecake|cheese|butter)\b/.test(text)) signals.push("milk");
  if (/\b(?:deviled eggs?|eggs?|aioli|brownie)\b/.test(text)) signals.push("egg");
  if (/\b(?:pecans?|nutella)\b/.test(text)) signals.push("tree-nut");
  if (item.category === "Pizzas" || item.category === "SANDWICHES" || /\b(?:panko|fettuccine|spaghetti|tortellini|rigatoni|focaccia|bread|brioche|buns?|ciabatta|breaded|battered|crostini|noodles?|pasta|cannoli|brownie)\b/.test(text)) signals.push("wheat", "gluten");
  if (/\b(?:trout|salmon|anchovy)\b/.test(text)) signals.push("fish");
  if (/\b(?:crab|mussels?|shrimp)\b/.test(text)) signals.push("shellfish");
  if (/\bedamame\b/.test(text)) signals.push("soy");
  if (/\bmustard\b/.test(text)) signals.push("mustard");
  return orderedAllergens(signals);
}

function row(category, name, description, channels, options = {}) {
  return { category, name, description, channels, ...options };
}

function official(category, rows) {
  return rows.map(([canonicalName, sourceName = canonicalName]) => [canonicalName, { category, sourceName }]);
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAlatriBrosAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAlatriBros}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    crossContactOnlyCount: snapshot.crossContactOnlyCount,
  }, null, 2));
}
