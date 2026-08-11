import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAllPurposeShaw = "all-purpose-shaw-dc";
export const sourceUrlsAllPurposeShaw = Object.freeze({
  site: "https://allpurposedc.com/",
  brunch: "https://allpurposedc.com/wp-content/uploads/2026/04/BrunchAP4.29.pdf",
  dinner: "https://allpurposedc.com/wp-content/uploads/2026/04/DinnerAP4.29.pdf",
  drinks: "https://allpurposedc.com/wp-content/uploads/2026/04/DrinksAP4.29.pdf",
  happyHour: "https://allpurposedc.com/wp-content/uploads/2026/02/AP_SHAW_HappyHourMenu-2.20.26Recovered.pdf",
  toast: "https://order.toasttab.com/online/all-purpose",
});

const rows = [
  row("Antipasti", "House-Made Giardiniera", "Pickled cauliflower, red peppers, celery, carrots, chili flake and basil.", [], "dinner", { aliases: ["Giardiniera"] }),
  row("Antipasti", "Crispy Fried Mozzarella", "Whole-milk mozzarella, panko breading, marinara, basil, pecorino and olive oil.", ["milk", "wheat", "gluten"], "dinner", { aliases: ["Crispy-Fried Mozzarella"] }),
  row("Antipasti", "Calamari 'Fritto'", "Polenta-crusted Rhode Island squid, dill and lemon-basil aioli.", ["egg", "shellfish"], "dinner"),
  row("Antipasti", "Focaccia Garlic Breadsticks", "Roasted garlic butter, lemon, parmigiano, black truffle fonduta and parsley.", ["milk", "wheat", "gluten"], "dinner", { aliases: ["Focaccia Breadsticks"] }),
  row("Antipasti", "Arancini 'Donatello'", "Crispy risotto fritters, spring peas, salami, roasted garlic, parmigiano and green garlic aioli.", ["milk", "egg"], "dinner"),
  row("Salads", "Burrata", "Roasted peppers, capers, red-wine vinaigrette, fresh oregano, balsamico and focaccia.", ["milk", "wheat", "gluten"], "dinner"),
  row("Salads", "House Chopped Salad", "Iceberg, radicchio, mozzarella, green olives, red onion, salami, pickled peppers, Italian vinaigrette and pecorino Romano.", ["milk"], "dinner"),
  row("Salads", "AP Caesar Salad", "Little gem lettuces, parmigiano, lemon, olive-oil breadcrumbs and anchovy dressing.", ["milk", "wheat", "gluten", "fish"], "dinner", { aliases: ["Brunch Caesar"] }),
  row("Large Plates", "Chicken Parmesan", "Sesame-breaded cutlet, marinara, mozzarella and fresh basil.", ["milk", "wheat", "gluten", "sesame"], "dinner"),
  row("Large Plates", "Rigatoni Pomodoro", "Rigatoni, house-made tomato sauce, cherry tomatoes, stracciatella, basil and extra-virgin olive oil.", ["milk", "wheat", "gluten"], "dinner"),
  row("Large Plates", "Eggplant Parm 'Jersey-Style'", "Baked Italian eggplant layered with mozzarella, parmesan, tomato, garlic and olive-oil breadcrumbs.", ["milk", "wheat", "gluten"], "dinner", { aliases: ["Eggplant Parm"] }),
  row("Large Plates", "Nonna's Old School Meatballs", "Tomato-braised meatballs, hand-dipped ricotta, grilled focaccia and fresh parsley.", ["milk", "wheat", "gluten"], "dinner", { aliases: ["Nonna's Meatballs"] }),
  pizza("Buona", "Tomato, mozzarella, pepperoni, grana, Calabrian chili honey and fresh basil."),
  pizza("Sedgewick", "Whipped ricotta, mozzarella, taleggio, parm, black truffle honey and chives."),
  pizza("The Standard", "Bianco di Napoli tomatoes, mozzarella, Sicilian oregano and grana Padano.", { aliases: ["Standard", "Standard Pizza"] }),
  pizza("Rubirosa", "Tomato fonduta, mozzarella, fontina, cup 'n char pepperoni, parm and basil swirl."),
  pizza("Supremo", "Tomato, mozzarella, Italian sausage, pepperoni, sweet onion, black olives, green peppers and pecorino Romano."),
  pizza("Godfather", "Tomato, mozzarella, Italian sausage, spicy chilies, pickled peppers, red onion, pecorino Romano and parsley."),
  pizza("Tripper", "Tomato, beef meatballs, ricotta, mozzarella, fresh oregano and spicy neonata sauce; the restaurant states the meatballs contain gluten and dairy."),
  pizza("Primavera", "Whipped ricotta, mozzarella, asparagus, spring peas, preserved lemon and pea shoots."),
  pizza("Duke #7", "Tomato, mozzarella, 'nduja sausage, pickled red peppers, basil and giardiniera."),
  pizza("Funghi", "Whipped ricotta, mozzarella, portobello and cremini mushrooms, onion, rosemary, parsley and black truffle sauce."),
  row("Dippies", "Parm Fonduta Dippie", "Parm fonduta dipping sauce.", ["milk"], "dinner"),
  row("Dippies", "Feta Ranch Dippie", "House-made feta ranch dipping sauce.", ["milk", "egg"], "dinner"),
  row("Dippies", "Volcano Ranch Dippie", "Feta ranch topped with Calabrian chilies.", ["milk", "egg"], "dinner"),
  row("Dippies", "Marinara Dippie", "House-made old-school Jersey red sauce.", [], "dinner"),
  row("Dippies", "Spicy Neonata Dippie", "Sicilian hot sauce dipping sauce.", ["fish"], "dinner", { aliases: ["Neonata Dippie"] }),
  row("Dippies", "Calabrian Chilies Dippie", "Calabrian chilies.", [], "dinner", { aliases: ["Calabrian Chili Dippie"] }),
  row("Sweet Treats", "Italian Rainbow Cake", "Almond cake, mascarpone, apricot preserves and dark chocolate.", ["milk", "egg", "tree-nut", "wheat", "gluten"], "dinner", { aliases: ["Rainbow Cake"] }),
  row("Sweet Treats", "Chocolate Chip Cookie", "Baked to order with whipped Nutella and caramelized hazelnut crumble.", ["milk", "egg", "tree-nut", "wheat", "gluten"], "dinner", { aliases: ["Baked Cookie"] }),
  row("Brunch Specialties", "Tuscan Olive Oil Cake", "Citrus zest, marinated strawberries and sweet ricotta.", ["milk", "egg", "wheat", "gluten"], "brunch"),
  row("Brunch Specialties", "House-Cut Fries", "Kennebec potatoes, sea salt, black pepper and Sicilian oregano.", [], "brunch"),
  row("Brunch Specialties", "Italian Hash Browns", "Roasted potatoes, sour cream, onion and lemon with a choice of prosciutto or smoked salmon.", ["milk"], "brunch", { isConfigurable: true }),
  row("Brunch Specialties", "Baked Eggs 'Funghi'", "Italian farm egg souffle, sweet onion, black truffle sauce, chives, house-made focaccia and grana Padano.", ["milk", "egg", "wheat", "gluten"], "brunch"),
  row("Brunch Specialties", "The Breakfast Sandwich", "Farm egg omelette, tomato, Italian sausage, mozzarella, garlic aioli and sesame bun.", ["milk", "egg", "wheat", "gluten", "sesame"], "brunch", { aliases: ["Breakfast Sandwich"] }),
  row("Antipasti", "Side Focaccia", null, ["wheat", "gluten"], "toast", { aliases: ["Side Foccacia"] }),
  pizza("The Gurney Street", "Whipped ricotta, mozzarella, heirloom tomatoes, garlic, spinach, fresh chevre and pecorino.", { source: "toast" }),
  pizza("The Rigo", "Tomato sauce, provolone, caciocavallo, blistered corn, roasted cubanelle chiles, 'nduja, grana and fresh oregano.", { source: "toast" }),
  pizza("The Marinara", "Bianco di Napoli tomatoes, fresh garlic, pecorino Romano, Sicilian oregano and olive oil; no mozzarella.", { source: "toast" }),
  row("Pizza", "AP Pizza Kit", "One AP dough ball, mozzarella, Bianco di Napoli sauce, basil and grana Padano.", ["milk", "wheat", "gluten"], "toast", { isConfigurable: true }),
  row("Pizza", "Dough Ball", "Eleven ounces of fresh pizza dough.", ["wheat", "gluten"], "toast"),
  row("Dippies", "Caesar Dressing Dippie", null, ["fish"], "toast"),
  row("Sweet Treats", "Blueberry Ricotta Cheesecake", "Graham-cracker crust, ricotta filling, blueberry sauce, lemon, white-chocolate crisps and fresh blueberries.", ["milk", "egg", "wheat", "gluten"], "toast"),
  drink("Run Wild", "Non-alcoholic IPA by Athletic Brewing.", "Non-Alcoholic"),
  drink("Upside Dawn", "Non-alcoholic golden ale by Athletic Brewing.", "Non-Alcoholic"),
  drink("Classico Sparkling Wine", "Non-alcoholic sparkling wine by Lyre's.", "Non-Alcoholic"),
  drink("Amalfi Spritz", "Non-alcoholic spritz by Lyre's.", "Non-Alcoholic"),
  drink("Phony Negroni", "Non-alcoholic drink by St. Agrestis; two servings.", "Non-Alcoholic"),
  drink("Mexican Coke", null),
  drink("Mexican Sprite", null),
  drink("Diet Coke", null),
  drink("Boylan's Root Beer", null),
  drink("Boylan's Ginger Ale", null),
  drink("Boylan's Black Cherry", null),
  drink("San Pellegrino Aranciata", null),
  drink("San Pellegrino Limonata", null),
  row("Soft Drinks", "San Pellegrino Rossa Aranciata", null, [], "toast"),
];

const repeatedBrunch = [
  "Focaccia Garlic Breadsticks", "Arancini 'Donatello'", "Burrata", "House Chopped Salad", "AP Caesar Salad",
  "Chicken Parmesan", "Rigatoni Pomodoro", "Eggplant Parm 'Jersey-Style'", "Nonna's Old School Meatballs",
  "Buona", "Sedgewick", "Rubirosa", "Funghi", "Supremo", "Godfather", "The Standard",
  "Parm Fonduta Dippie", "Feta Ranch Dippie", "Volcano Ranch Dippie", "Marinara Dippie", "Spicy Neonata Dippie", "Calabrian Chilies Dippie",
  "Italian Rainbow Cake", "Chocolate Chip Cookie",
];

export function buildAllPurposeShawAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = rows.map((source, index) => ({
    auditItemKey: `${index + 1}:${slugify(source.name)}`,
    id: slugify(source.name),
    name: source.name,
    category: source.category,
    description: source.description,
    ingredientsText: source.description,
    imageUrl: null,
    isConfigurable: Boolean(source.isConfigurable),
    aliases: source.aliases ?? [],
    presentations: [presentation(source.category, source.name, source.description, source.source)],
    sourceUrls: [sourceUrlsAllPurposeShaw[source.source]],
    sourceType: source.source === "toast" ? "restaurant-linked-ordering-menu" : "restaurant-issued-pdf-menu",
    allergens: orderedAllergens(source.allergens),
    mayContain: [],
    allergenSourceType: source.allergens.length > 0 ? "official-ingredients" : "unavailable",
  }));

  for (const name of repeatedBrunch) addPresentation(items, name, "brunch");
  addPresentation(items, "The Standard", "happyHour", "Happy Hour — Pizza");

  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  if (items.length !== 57 || presentationCount !== 82 || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`All-Purpose Shaw current manifest changed: ${items.length} formulations, ${presentationCount} presentations.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAllPurposeShaw,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAllPurposeShaw),
    presentationCount,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "All-Purpose Shaw publishes current restaurant-issued brunch, dinner, drinks, and happy-hour PDFs plus a live restaurant-linked Toast menu, but no complete recipe-level allergen matrix or cross-contact disclosure. Positive signals use fixed published ingredients and unavoidable named formats. Optional toppings, selectable proteins, allergy-request controls, and the FAQ's accommodation language are not converted into fixed or negative safety claims; unsupported items remain unavailable.",
    items,
  };
}

function row(category, name, description, allergens, source, options = {}) {
  return { category, name, description, allergens, source, ...options };
}

function pizza(name, description, options = {}) {
  return row("Pizza", name, description, ["milk", "wheat", "gluten"], options.source ?? "dinner", options);
}

function drink(name, description, category = "Soft Drinks") {
  return row(category, name, description, [], "drinks");
}

function addPresentation(items, name, source, category) {
  const item = items.find((candidate) => candidate.name === name);
  if (!item) throw new Error(`Missing repeated All-Purpose item: ${name}`);
  item.presentations.push(presentation(category ?? item.category, name, item.description, source));
  item.sourceUrls = [...new Set([...item.sourceUrls, sourceUrlsAllPurposeShaw[source]])];
  if (item.sourceType !== "restaurant-issued-pdf-menu") item.sourceType = "restaurant-issued-pdf-and-linked-ordering-menu";
}

function presentation(category, sourceName, description, source) {
  return { category, sourceName, description, sourceUrls: [sourceUrlsAllPurposeShaw[source]] };
}

function slugify(value) { return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) { const found = new Set(values); return allergenOrder.filter((allergen) => found.has(allergen)); }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAllPurposeShawAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAllPurposeShaw}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ itemCount: snapshot.itemCount, presentationCount: snapshot.presentationCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
