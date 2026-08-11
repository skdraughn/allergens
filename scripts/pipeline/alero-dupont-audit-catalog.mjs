import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAleroDupont = "alero-dupont-dc";
export const sourceUrlsAleroDupont = Object.freeze({
  toast: "https://www.toasttab.com/local/order/alero-dupont-circle-1629-connecticut-ave-nw",
  appetizers: "https://alerorestaurant.com/menu-appetizers-dupont/",
  soups: "https://alerorestaurant.com/menu-soup-and-salads/",
  seafood: "https://alerorestaurant.com/menu-seafood/",
  entrees: "https://alerorestaurant.com/menu-mexican-entrees/",
  meat: "https://alerorestaurant.com/menu-meat-poultry/",
  sides: "https://alerorestaurant.com/menu-sides/",
});

const rows = [
  row("Birria Tacos", "Three Birria Tacos", "Three corn tortillas with flavorful beef and dipping consommé.", [], { official: "entrees", officialSourceName: "Tacos Birria", aliases: ["Tacos Birria"], isConfigurable: true }),

  row("Appetizers", "Quesadilla", "Flour tortillas stuffed with jack cheese; side of guacamole, sour cream and pico de gallo.", ["milk", "wheat", "gluten"], { official: "appetizers", officialSourceName: "Quesadillas", aliases: ["Quesadillas"], isConfigurable: true }),
  row("Appetizers", "Mexican Platter", "Empanadas, chicken and beef taquitos Veracruz, chicken and steak quesadillas; choice of blue cheese or ranch and Alero, buffalo or barbecue sauce.", ["milk", "wheat", "gluten"], { official: "appetizers", isConfigurable: true }),
  row("Appetizers", "Ceviche Mixto", "Fresh flounder fish and shrimp marinated in cilantro, onions and lemon juice, served with avocado.", ["fish", "shellfish"], { official: "appetizers" }),
  row("Appetizers", "Ceviche De Pescado", "Fresh flounder fish marinated in cilantro, onions, ginger, celery, lemon juice and leche de tigre sauce; avocado slices.", ["fish"], { official: "appetizers" }),
  row("Appetizers", "Taquito Veracruz - Chicken", null, []),
  row("Appetizers", "Taquito Veracruz - Beef", null, []),
  row("Appetizers", "Tamal Campesino", "Sweet corn cake with a side of sour cream.", ["milk"], { official: "appetizers" }),
  row("Appetizers", "Chilaquiles Rancheros", "Spicy crispy corn tortilla topped with eggs any style, green sauce, white cheese, onions and cilantro.", ["milk", "egg"], { official: "appetizers" }),
  row("Appetizers", "Nacho Platter", null, ["milk"], { isConfigurable: true }),
  row("Appetizers", "Table Guacamole", "Fresh avocados, tomatoes, onions, cilantro, salt, pepper and lime; optional jalapeño; served with corn chips.", [], { official: "appetizers", aliases: ["Fresh tableside Guacamole (10oz)", "Just Fresh Guacamole"], isConfigurable: true }),
  row("Appetizers", "Guacamole Dip", "Fresh homemade guacamole served with crispy flour tortilla chips.", ["wheat", "gluten"], { official: "appetizers", aliases: ["Guacamole Dip 8oz"] }),
  row("Appetizers", "Platanos Fritos", "Sweet fried plantains with a side of sour cream.", ["milk"], { official: "appetizers" }),
  row("Appetizers", "Chorizo Mexicano", "Spicy pork sausage topped with melted cheese with a side of flour tortilla.", ["milk", "wheat", "gluten"], { official: "appetizers" }),
  row("Appetizers", "Camarones Mexicanos", "Sautéed shrimp, Spanish garlic butter sauce, white wine, parsley and a side of bread.", ["milk", "wheat", "gluten", "shellfish"], { official: "appetizers" }),
  row("Appetizers", "Grilled Portobello Mushrooms", null, [], { official: "appetizers", aliases: ["Grilled Portobello"] }),
  row("Appetizers", "Mejilones a la Diabla", null, ["shellfish"], { official: "appetizers" }),
  row("Appetizers", "Queso Ground Beef", null, ["milk"]),
  row("Appetizers", "Queso Dip With", null, ["milk"], { isConfigurable: true }),
  row("Appetizers", "Tostones", null, [], { official: "appetizers", isConfigurable: true }),
  row("Appetizers", "Empanadas", "Fried pastry stuffed with beef.", ["wheat", "gluten"], { official: "appetizers" }),
  row("Appetizers", "Fried Calamari", "Served with sauce on the side.", ["shellfish"], { official: "appetizers", onlyOfficial: true }),
  row("Appetizers", "Esquites", null, []),

  row("Soups and Salads", "Alero Salad", "Romaine lettuce, avocado, green peppers, red onions, cucumbers and tomatoes with ranch dressing on the side.", ["milk", "egg"], { official: "soups", additionalOfficialSourceNames: ["Rapido Salad"], aliases: ["Rapido Salad"] }),
  row("Soups and Salads", "Apple Almond Salad", "Romaine lettuce, apple slices, almonds and tomatoes with ranch dressing on the side.", ["milk", "egg", "tree-nut"], { official: "soups" }),
  row("Soups and Salads", "Caesar Salad", "Romaine lettuce, chili-dusted croutons, Parmesan cheese and Caesar dressing.", ["milk", "wheat", "gluten"], { official: "soups", aliases: ["Ceasar salad"] }),
  row("Soups and Salads", "Seafood Salad", "Shrimp, calamari and scallops over romaine lettuce, green peppers, red onions, tomatoes and celery with homemade dressing.", ["shellfish"], { official: "soups" }),
  row("Soups and Salads", "Seafood Soup", "Scallops, shrimp and mussels with zesty broth and cilantro garnish.", ["shellfish"], { official: "soups" }),
  row("Soups and Salads", "Chicken Soup bowl", "Chicken and vegetables with cilantro garnish.", [], { official: "soups", aliases: ["chicken soup"] }),
  row("Soups and Salads", "Lentil Soup bowl", "Chicken-broth-based lentil soup with vegetables and cilantro.", [], { official: "soups", aliases: ["lentil soup"] }),
  row("Soups and Salads", "Tortilla Soup bowl", "Chicken broth with corn tortilla and vegetables, with cilantro garnish.", [], { official: "soups", aliases: ["tortilla soup"] }),
  row("Soups and Salads", "Lentil Soup Veggie", null, []),

  row("Seafood", "Salmon Mexicano", "Salmon fillet topped with shrimp, scallops and creamy sauce with white rice, black beans and vegetables.", ["milk", "fish", "shellfish"], { official: "seafood" }),
  row("Seafood", "Mariscos Saltados", "Jumbo shrimp and scallops mixed with French fries, sautéed vegetables and jalapeños; white rice and black beans.", ["shellfish"], { official: "seafood" }),
  row("Seafood", "Camarones al Mojo de Ajo", "Sautéed jumbo shrimp, garlic tequila sauce, vegetables and white rice.", ["shellfish"], { official: "seafood" }),
  row("Seafood", "Mariscada Veracruz", "Soup of shrimp, scallops, squid, clams, salmon and sautéed vegetables with white rice and salsa Veracruz.", ["fish", "shellfish"], { official: "seafood" }),
  row("Seafood", "Mexican Seafood Paella", "Paella with grilled chicken, clams, shrimp, scallops, calamari and jalapeño.", ["shellfish"], { official: "seafood", aliases: ["Mexican Sea Paella"] }),
  row("Seafood", "Fish Tacos", "Two flour tortillas filled with tilapia, Mexican rice, refried beans, lettuce, pico de gallo, guacamole, cilantro, onions, coleslaw and sour cream.", ["milk", "wheat", "gluten", "fish"], { official: "seafood" }),
  row("Seafood", "Chaufa Mexicano", "Fried rice with shrimp, chicken, chorizo Mexicano, vegetables, green onions, eggs, soy sauce oil and jalapeño.", ["egg", "shellfish", "soy"], { official: "seafood", aliases: ["Chaufa Mexicana"] }),

  row("Mexican Entrees", "Guadalajara Fajita Platter", null, [], { isConfigurable: true }),
  row("Mexican Entrees", "Fajitas", "Sizzling vegetables, Mexican rice, refried beans, guacamole, sour cream, pico de gallo, shredded cheese and flour tortillas; configurable protein.", ["milk", "wheat", "gluten"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Carnitas Fajitas", "Pork with sizzling vegetables, Mexican rice, flour tortillas, refried beans, guacamole, sour cream, pico de gallo and cheese.", ["milk", "wheat", "gluten"], { official: "entrees" }),
  row("Mexican Entrees", "Chef Fajita", "Grilled chicken breast and jumbo shrimp over vegetables with Mexican rice, flour tortillas, refried beans, guacamole, sour cream, pico de gallo and cheese.", ["milk", "wheat", "gluten", "shellfish"], { official: "entrees" }),
  row("Mexican Entrees", "Tacos Juarez", "Three crispy corn tacos with lettuce, pico de gallo and cheese; Mexican rice, refried beans, guacamole, pico de gallo and sour cream; configurable filling.", ["milk"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Burritos", "Flour tortilla, jack cheese, Mexican rice, refried beans, guacamole, sour cream and pico de gallo, topped with tomatillo sauce; configurable filling.", ["milk", "wheat", "gluten"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Enchiladas", "Soft corn tortillas, Mexican rice, refried beans, guacamole, sour cream and pico de gallo; configurable filling.", ["milk"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Taco \"Salad\"", "Crispy flour tortilla with Mexican rice, refried beans, configurable meat, romaine lettuce, shredded cheese and house dressing; guacamole, sour cream and pico de gallo.", ["milk", "wheat", "gluten"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Hawaiian Fajita", "Pineapple with configurable protein and vegetables, Mexican rice, flour tortillas, refried beans, guacamole, sour cream, pico de gallo and cheese.", ["milk", "wheat", "gluten"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Tacos Durango", "Three soft corn tacos, onion, cilantro, green sauce and cotija cheese with configurable filling.", ["milk"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Tacos de Cocinita Pibil", "Three corn tortillas with braised pork, orange achiote sauce, onions, cilantro, pineapple and chipotle sauce; cucumber, radish and lime.", [], { official: "entrees", aliases: ["Tacos de Cochinita Pibil"] }),
  row("Mexican Entrees", "Chimichangas", "Fried flour tortilla, Mexican rice, refried beans, guacamole, sour cream and pico de gallo, topped with cotija cheese; configurable filling.", ["milk", "wheat", "gluten"], { official: "entrees", isConfigurable: true }),
  row("Mexican Entrees", "Chicken Tamales", "Soft corn tamales stuffed with chicken, green tomatillo sauce and melted cheese, with Mexican rice, refried beans, lettuce, guacamole, sour cream and pico de gallo.", ["milk"], { official: "entrees" }),
  row("Mexican Entrees", "Enchiladas con Mole Poblano", "Two yellow corn tortillas, shredded chicken, mole Poblano sauce, Mexican rice, refried beans, sour cream and guacamole.", ["milk"], { official: "entrees" }),
  row("Mexican Entrees", "Tacos al Pastor", "Three corn tortillas with pork, onions, cilantro, pineapple and Alero sauce; cucumber, radish and lime.", [], { official: "entrees" }),
  row("Mexican Entrees", "Chilles Rellenos Poblanos", null, ["milk", "egg"]),

  row("Meat and Poultry", "Lomo Saltado", "Sirloin steak strips with French fries, vegetables and jalapeños; white rice and black beans.", [], { official: "meat" }),
  row("Meat and Poultry", "Carne al Paso", "Center-cut sirloin, al Paso garlic sauce, white rice, fried yucca and house salad.", [], { official: "meat" }),
  row("Meat and Poultry", "Alero Pork Ribs", "Half rack of pork ribs, poblano-beer sauce, chiles, spices, French fries and coleslaw.", ["gluten"], { official: "meat" }),
  row("Meat and Poultry", "Pollo Saltado", "Chicken strips with French fries, vegetables and jalapeños; white rice and black beans.", [], { official: "meat" }),
  row("Meat and Poultry", "Carne Asada \"Alero Style\"", "Sirloin steak, sautéed red onions, cilantro and Mexican spices; white rice, black beans, rapido salad and two flour tortillas.", ["wheat", "gluten"], { official: "meat" }),
  row("Meat and Poultry", "Chipotle Currasco", "12-ounce NY strip with rosemary butter, chorizo, homemade potatoes, pineapple, shrimp and jalapeño.", ["milk", "shellfish"], { official: "meat", aliases: ["Chipotle Churrasco"] }),
  row("Meat and Poultry", "Pollo Primavera", "Mesquite chicken breast, vegetables, white rice, black beans and rapido salad.", [], { official: "meat" }),
  row("Meat and Poultry", "Pollo a la Plancha", "Marinated chicken breast, lime juice, cilantro, vegetables and white rice.", [], { official: "meat" }),
  row("Meat and Poultry", "Pollo Acapulco", "Mesquite chicken breast, shrimp, salsa verde, vegetables, white rice and black beans.", ["shellfish"], { official: "meat" }),
  row("Meat and Poultry", "Brocheta", null, []),

  row("Desserts", "Tres Leches", null, ["milk", "egg", "wheat", "gluten"]),
  row("Desserts", "Flan", null, ["milk", "egg"]),
  row("Desserts", "Cheesecake Chimichanga", null, ["milk", "egg", "wheat", "gluten"]),
  row("Desserts", "Flautas De Manzana", null, ["wheat", "gluten"]),
  row("Desserts", "Fried Ice Cream", null, ["milk"]),
  row("Desserts", "Sopapillas", null, ["wheat", "gluten"]),
  row("Desserts", "Churros", null, ["wheat", "gluten"]),
  row("Desserts", "Hot Chocolate", null, []),
  row("Desserts", "Hot Tea", null, []),
  row("Desserts", "Coffee/Decaf", null, []),
  row("Desserts", "Panque de Elote", null, []),

  row("Sides", "Birria Sauce", null, []),
  row("Sides", "Side Guac (8oz)", null, [], { official: "sides", aliases: ["Guacamole (8 oz)"] }),
  row("Sides", "Side Queso Dip", null, ["milk"], { official: "sides", aliases: ["Queso Dip"] }),
  row("Sides", "Side Chips and Salsa", null, [], { official: "sides", aliases: ["Chips and Salsa"] }),
  row("Sides", "Side Grilled Chicken", null, [], { official: "sides", aliases: ["Grilled Chicken"] }),
  row("Sides", "Side Grilled Steak", null, [], { official: "sides", aliases: ["Grilled Steak"] }),
  row("Sides", "Side Grilled Shrimp", null, ["shellfish"], { official: "sides", aliases: ["Grilled Shrimp"] }),
  row("Sides", "Side Salmon", null, ["fish"]),
  row("Sides", "Side French Fries", null, [], { official: "sides", aliases: ["French Fries"] }),
  row("Sides", "Side House Salad", "lettuce, tomato and avocado", [], { official: "sides", aliases: ["House Salad"] }),
  row("Sides", "Side White Rice", null, [], { official: "sides", aliases: ["Rice — White"] }),
  row("Sides", "Side Mexican Rice", null, [], { official: "sides", aliases: ["Rice — Mexican"] }),
  row("Sides", "Side Steamed Vegetable", null, []),
  row("Sides", "Side Black Beans", null, [], { official: "sides", aliases: ["Beans — Black"] }),
  row("Sides", "Side Refried Beans", null, [], { official: "sides", aliases: ["Beans — Refried"] }),
  row("Sides", "Side Taco", null, [], { isConfigurable: true }),
  row("Sides", "Side Enchilada", null, [], { isConfigurable: true }),
  row("Sides", "Side Quesadilla", null, ["milk", "wheat", "gluten"], { isConfigurable: true }),
  row("Sides", "Side Fajita", null, [], { isConfigurable: true }),
  row("Sides", "Lettuce", null, []), row("Sides", "Onions", null, []), row("Sides", "Green Peppers", null, []),
  row("Sides", "Red Peppers", null, []), row("Sides", "Mushrooms", null, []), row("Sides", "Celery", null, []),
  row("Sides", "Carrots", null, []), row("Sides", "Broccoli", null, []), row("Sides", "Cucumber", null, []),
  row("Sides", "Spinach", null, []), row("Sides", "Jalapenos", null, []), row("Sides", "Seafood Sauce", null, []),
  row("Sides", "Refill Pico", null, []), row("Sides", "Refill Guac", null, []),
  row("Sides", "Refill Sour Cream", null, ["milk"]), row("Sides", "Blue Cheese", null, ["milk"]),
  row("Sides", "Ranch", null, ["milk", "egg"]), row("Sides", "Alero Sauce", null, []),
  row("Sides", "Barbecue Sauce", null, []), row("Sides", "Buffalo Sauce", null, []),
  row("Sides", "Side Tortilla", null, [], { isConfigurable: true }),
  row("Sides", "Refill Shredded Cheese", null, ["milk"]), row("Sides", "spicy Green Sauce", null, []),
  row("Sides", "Refill cotija", null, ["milk"]), row("Sides", "Corn chips", null, []),
  row("Sides", "Flour Chips", null, ["wheat", "gluten"]), row("Sides", "Refill Salsa", null, []),
  row("Sides", "Side Chorizo", null, []), row("Sides", "Side fresh avocado", null, []),
  row("Sides", "habanero sour", null, ["milk"]), row("Sides", "Refill Rosemary Butter", null, ["milk"]),
];

export function buildAleroDupontAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = rows.map((sourceRow, index) => {
    const officialUrl = sourceRow.official ? sourceUrlsAleroDupont[sourceRow.official] : null;
    const presentations = [];
    if (!sourceRow.onlyOfficial) {
      presentations.push({ category: sourceRow.category, sourceName: sourceRow.name, sourceUrl: sourceUrlsAleroDupont.toast });
    }
    if (officialUrl) {
      for (const sourceName of [sourceRow.officialSourceName ?? sourceRow.name, ...(sourceRow.additionalOfficialSourceNames ?? [])]) {
        presentations.push({ category: `Official Website — ${sourceRow.category}`, sourceName, sourceUrl: officialUrl });
      }
    }
    const sourceUrls = [...new Set(presentations.map((presentation) => presentation.sourceUrl))];
    return {
      auditItemKey: `${index + 1}:${slugify(sourceRow.name)}`,
      id: slugify(sourceRow.name),
      name: sourceRow.name,
      category: sourceRow.category,
      description: sourceRow.description,
      ingredientsText: sourceRow.description,
      imageUrl: null,
      isConfigurable: Boolean(sourceRow.isConfigurable),
      aliases: sourceRow.aliases ?? [],
      presentations,
      sourceUrls,
      sourceType: sourceRow.onlyOfficial
        ? "restaurant-issued-menu"
        : officialUrl ? "restaurant-issued-and-linked-menu" : "restaurant-linked-ordering-menu",
      allergens: orderedAllergens(sourceRow.allergens),
      mayContain: [],
      allergenSourceType: sourceRow.allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const unavailableAllergenCount = items.length - ingredientSignalCount;
  const presentationCount = items.reduce((sum, item) => sum + item.presentations.length, 0);
  if (items.length !== 126 || presentationCount !== 193 || categoryCount !== 8 || new Set(items.map((item) => item.id)).size !== 126) {
    throw new Error(`Alero Dupont current manifest changed: ${items.length} items, ${categoryCount} categories, ${new Set(items.map((item) => item.id)).size} unique ids.`);
  }
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAleroDupont,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAleroDupont),
    presentationCount,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount: 0,
    unavailableAllergenCount,
    sourceWarning: "Alero publishes selected fixed descriptions on six restaurant-issued Dupont food pages and a broader live restaurant-linked Toast catalog, but no complete ingredient recipes, item-level allergen matrix, or cross-contact disclosure. Positive claims use only direct published components and unavoidable named food formats. Configurable proteins and fillings are not promoted into fixed claims, and name-only products without a mandatory allergen remain unavailable.",
    items,
  };
}

function row(category, name, description, allergens, options = {}) { return { category, name, description, allergens, ...options }; }
function slugify(value) { return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) { const found = new Set(values); return allergenOrder.filter((allergen) => found.has(allergen)); }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAleroDupontAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAleroDupont}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ itemCount: snapshot.itemCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
