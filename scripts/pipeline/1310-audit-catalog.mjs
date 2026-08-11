import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sources = Object.freeze({
  breakfast: "https://www.1310kitchendc.com/_files/ugd/255e9c_2265187508b941178729ea6dd47831c0.pdf",
  brunch: "https://www.1310kitchendc.com/_files/ugd/255e9c_f2954077ef454afba553c160a9d509c1.pdf",
  lunch: "https://www.1310kitchendc.com/_files/ugd/255e9c_71018416e5c049429b4629872bc91f11.pdf",
  dinner: "https://www.1310kitchendc.com/_files/ugd/255e9c_c5579572c8944227996b133cda1fbf28.pdf",
  barBites: "https://www.1310kitchendc.com/_files/ugd/255e9c_8d2c242d7dcc4d869ecd106d6163d1b8.pdf",
  lateNight: "https://www.1310kitchendc.com/_files/ugd/255e9c_746a54a1ee13446f95b00a0ef6686d04.pdf",
  toast: "https://order.toasttab.com/online/1310-kitchen-bar-1310-wisconsin-avenue-northwest",
});

function sourceRows(menu, section, sourceUrl, text) {
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const [name, description = ""] = line.split("\t");
      return {
        menu,
        section,
        sourceUrl,
        name: name.trim(),
        description: description.trim() || null,
      };
    });
}

const rows = [
  ...sourceRows("Breakfast", "Entrees", sources.breakfast, `
Bacon & Eggs\tTwo eggs prepared any style, bacon, home fries.
Challah French Toast Topped with Sliced Banana\tWhipped butter, maple syrup.
Shakshuka\tTomato, feta, cilantro, egg, side of toast.
Avocado Toast & Poached Egg\tSeeded bread, toasted almonds, pomegranate.
Buttermilk Pancakes\tWhipped butter, maple syrup.
C.Y.M Everything Bagel & Ivy City Smoked Salmon\tTomato, cucumber, red onion, capers, cream cheese.
Huevos Rancheros\tTortilla, refried beans, pico, jalapeno, queso fresco, avocado, sunny-side-up egg.
Egg White Omelette & Home Fries\tSpinach, goat cheese, pico de gallo, avocado.
Ham, Egg & Cheese Croissant Sandwich\tCheddar, scrambled egg.
Eggs Benedict & Home Fries\tHollandaise sauce, English muffin, poached egg; choice of ham or smoked salmon.
House Made Granola & Yogurt\tMaple Greek yogurt, fresh berries.
Steel Cut Oatmeal\tCoconut milk, blueberries, cinnamon, vanilla.
Pineapple Coconut Acai Bowl\tBanana, blueberries, strawberries, granola.
Fresh Seasonal Fruit\tStrawberries, blueberries, pineapple.
  `),
  ...sourceRows("Breakfast", "Sides", sources.breakfast, `
Fresh Fruit Side
Pico De Gallo
Sliced Avocado
Nueske Applewood Smoked Bacon (3 pieces)
MeatCrafters Turkey Sausage
Smoked Kielbasa Sausage
House Cut Home Fried Potatoes\tCaramelized onions.
C.Y.M Bagel & Cream Cheese\tPlain or everything.
Toast\tWhite, whole wheat, English muffin, or rye.
Rise Gluten Free Brioche
Nonna's Rum Cake
  `),
  ...sourceRows("Breakfast", "Hot Beverages", sources.breakfast, `
Regular & Decaf Coffee
Latte
Cappuccino
Espresso
Extra Shot
Assorted Julius Meinl Hot Tea
Hot Chocolate
Matcha Latte
  `),
  ...sourceRows("Breakfast", "Cold Beverages", sources.breakfast, `
Coke
Diet Coke
7 UP
Ginger Ale
Ginger Beer
Orange Juice
Grapefruit Juice
Apple Juice
Cranberry Juice
Pineapple Juice
Tomato Juice
Lemonade
Iced Tea
Milk\tWhole, oat, soy, or almond.
Strawberry & Banana Smoothie
Strawberry, Blueberry, Orange & Banana Smoothie
Saratoga Flat Water (28oz)
Saratoga Sparkling Water (28oz)
  `),
  ...sourceRows("Brunch", "Toast, Fruit & Classics", sources.brunch, `
Avocado Toast & Poached Egg\tMultigrain bread, toasted almonds, pomegranate.
Acai Bowl\tBanana, blueberries, strawberries, granola.
House Made Granola & Greek Yogurt\tMaple yogurt, fresh berries.
Fresh Seasonal Fruit\tStrawberries, blueberries, pineapple.
Deconstructed Call Your Mother Bagel & Ivy City Smoked Salmon\tTomato, cucumber, red onion, capers, cream cheese.
Buttermilk Pancakes\tButter, maple syrup on the side.
Challah French Toast Topped with Sliced Bananas\tButter, maple syrup on the side.
Steel Cut Oatmeal\tCoconut milk, blueberries, cinnamon, vanilla.
  `),
  ...sourceRows("Brunch", "Eggs", sources.brunch, `
Bacon & Eggs\tTwo eggs prepared any style, bacon, home fries.
Huevos Rancheros\tTortilla, refried beans, pico, jalapeno, queso fresco, avocado, sunny-side-up egg.
Shakshuka\tTomato, feta, cilantro, eggs, multigrain toast.
Chorizo Breakfast Tacos\tEgg, chorizo, pico, queso fresco, cilantro-jalapeno sauce.
Egg White Omelette\tSpinach, goat cheese, pico de gallo, avocado, home fries.
Smoked Beef Brisket Hash & Fried Egg\tPotato, Brussels sprouts, roasted carrots.
Ham Egg & Cheese Croissant\tCheddar, scrambled egg.
Steak & Eggs\t12oz prime NY strip, two eggs, home fries.
Eggs Benedict\tHollandaise, English muffin, poached egg, home fries; choice of ham or smoked salmon.
  `),
  ...sourceRows("Brunch", "Sandwiches & Salads", sources.brunch, `
Kale, Brussels Sprout & Quinoa Salad\tApples, almonds, pomegranate, lemon vinaigrette.
Greek Salad & Lentils\tTomato, red onion, feta, cucumber, olives, tzatziki.
Chopped Chinese Chicken Salad\tCabbage, red peppers, cilantro, carrot ginger dressing.
Tomato Bisque & Grilled Cheese\tMultigrain, cheddar, mixed greens.
Seared Tuna & Brown Rice Bowl\tCucumber, edamame, avocado, chili soy sauce.
Bibb, Avocado & Salmon Salad\tTomato, haricot vert, sunflower seeds, hard-boiled egg, croutons, cucumber dressing.
Grilled Shrimp Tacos\tCorn tortilla, chipotle slaw, corn, avocado.
Hot Turkey Cubano\tSwiss, mustard, cornichon; choice of French fries or mixed greens.
B.L.T. on Toasted Multigrain\tAvocado, mayonnaise; choice of French fries or mixed greens.
Fried Chicken Sandwich\tSpicy slaw, homemade pickles; choice of French fries or mixed greens.
1310 Cheeseburger\tChapel Hill Farm beef, cheddar, bacon tomato jam, maple aioli, pickled onions, arugula; choice of French fries or mixed greens.
Jenn's Chicken Pot Pie\tSpinach, peas, carrots, mushrooms.
  `),
  ...sourceRows("Brunch", "Smoothies", sources.brunch, `
Strawberry & Banana Smoothie\tOrange juice.
Everything Smoothie\tStrawberry, blueberry, orange juice, banana.
Matcha Mango Smoothie\tMatcha, mango, banana, spinach, almond milk, agave.
Pina Colada Smoothie\tPineapple, banana, coconut, ginger, turmeric, lime, hemp, agave.
Hoya Blue Smoothie\tAlmond butter, banana, protein powder, blue spirulina, hemp seeds, cinnamon, maple syrup, almond milk.
Chocolate Peanut Butter Smoothie\tCacao, almond milk, chocolate protein powder, banana, avocado, dates.
  `),
  ...sourceRows("Brunch", "Hot Beverages", sources.brunch, `
Regular & Decaf Coffee
Latte
Cappuccino
Espresso
Extra Shot
Assorted Julius Meinl Hot Tea
Hot Chocolate
Matcha Latte
  `),
  ...sourceRows("Brunch", "Cold Beverages", sources.brunch, `
Saratoga Flat Water (28oz)
Saratoga Sparkling Water (28oz)
Coke
Diet Coke
7 UP
Ginger Ale
Ginger Beer
Orange Soda
Orange Juice
Grapefruit Juice
Apple Juice
Cranberry Juice
Pineapple Juice
Tomato Juice
Lemonade
Iced Tea
Milk\tWhole or skim.
Almond Milk
Soy Milk
  `),
  ...sourceRows("Brunch", "Cocktails", sources.brunch, `
Mimosa\tChoice of orange, grapefruit, or pineapple juice.
Tequila Sunrise Mimosa\tMilagro tequila, orange juice, house grenadine, Cava.
Moscow Mule Mimosa\tTito's vodka, lime juice, ginger beer, Cava.
Bloody Mary
Bloody Maria\tIllegal mezcal, sriracha, house Bloody Mary mix, citrus-spiced salt.
Irish Coffee\tIrish whiskey, coffee, Baileys whipped cream.
Michelada\t1310 pilsner, house Bloody Mary mix, citrus-spiced salt.
  `),
  ...sourceRows("Lunch", "Starters", sources.lunch, `
Fried Artichoke Hearts\tLemon garlic aioli.
Burrata & Spring Pesto\tToasted garlic bread.
Parmesan Arancini\tGarlic aioli.
Grilled Calamari\tOlives, potato, lemon vinaigrette.
  `),
  ...sourceRows("Lunch", "Salads", sources.lunch, `
Bibb, Avocado & Salmon Salad\tHaricot vert, tomato, hard-boiled egg, croutons, sunflower seeds, basil green goddess dressing.
Chopped Chinese Chicken Salad\tCabbage, red pepper, cashews, scallion, cilantro, carrot ginger dressing.
Greek Salad & Beluga Lentils\tCucumber, tomato, feta, olives, red onion, tzatziki, pita.
Tuscan Kale & Quinoa Salad\tApples, almonds, pomegranate, lemon vinaigrette.
Caesar Salad\tRomaine, parmesan, croutons.
Cobb Salad\tAvocado, bacon, hard-boiled egg, tomato, blue cheese.
  `),
  ...sourceRows("Lunch", "Sandwiches", sources.lunch, `
B.L.T. on Multigrain Toast\tAvocado, mayonnaise, bacon, tomato; choice of French fries or mixed greens.
Fried Chicken Sandwich\tSpicy slaw, homemade pickles; choice of French fries or mixed greens.
1310 Cheeseburger\tChapel Hill Farm beef, cheddar, bacon tomato jam, maple aioli, pickled onions, arugula; choice of French fries or mixed greens.
Hot Turkey Cubano\tSwiss, mustard, cornichon; choice of French fries or mixed greens.
Grilled Cheese & Tomato Bisque\tMultigrain, cheddar, mixed greens.
House Made Veggie Burger\tLettuce, tomato, onion, pickles, cashew cheese sauce; choice of French fries or mixed greens.
  `),
  ...sourceRows("Lunch", "Entrees", sources.lunch, `
Grilled Shrimp Tacos\tCorn tortilla, chipotle slaw, grilled corn, avocado.
Sesame Seared Tuna\tBrown rice, edamame, avocado, cucumber.
Ratatouille Lasagna\tTofu cream, spinach.
Grilled Zucchini Rolls\tLemon ricotta, tomato sauce, parmesan.
Jenn's Chicken Pot Pie\tMushrooms, spinach, peas, carrots.
Grilled Branzino\tArugula, chimichurri, lemon.
Organic Half Roasted Chicken\tGarlic, rosemary, thyme.
Prime N.Y. Strip Steak\tChimichurri.
Chicken Pesto Flatbread\tChicken pesto, mozzarella, arugula.
Spinach Artichoke Flatbread\tSpinach artichoke dip, arugula.
Tomato Mozzarella Flatbread\tTomato, mozzarella, arugula.
  `),
  ...sourceRows("Lunch", "Sides", sources.lunch, `
Mac & Blue Cheese
Roasted Potatoes
Roasted Broccolini\tGarlic oil.
French Fries
  `),
  ...sourceRows("Dinner", "Appetizers", sources.dinner, `
Fried Artichoke Hearts\tLemon garlic aioli.
Burrata & Spring Pesto\tToasted garlic bread.
Beet Cured Salmon Carpaccio\tCapers, lemon zest, micro arugula, toast.
Tuna Tartare\tSesame ginger aioli, rice paper crisp.
Parmesan Arancini\tGarlic aioli.
Grilled Calamari\tOlives, potato, lemon vinaigrette.
Grilled Cauliflower\tRomesco, lemon quinoa.
Butter Board\tHouse made butter, sea salt, local honey, edible flowers, ciabatta; also available with avocado butter.
  `),
  ...sourceRows("Dinner", "Soup & Salad", sources.dinner, `
The Wedge\tRomaine, bacon, tomato, crouton, blue cheese dressing.
Caesar Salad\tRomaine, parmesan, croutons.
Tuscan Kale & Quinoa Salad\tApples, almonds, pomegranate, lemon vinaigrette.
Roasted Beet Salad\tGoat cheese.
Seasonal Soup
  `),
  ...sourceRows("Dinner", "Entrees", sources.dinner, `
Norwegian Salmon\tRoasted potatoes, haricot vert, saffron beurre blanc.
Ginger Coconut Curry\tCod, shrimp, vegetables, rice; vegan option with seasonal vegetables and rice.
Jenn's Chicken Pot Pie\tMushrooms, spinach, peas, carrots.
Grilled Prime NY Strip Steak\tChimichurri.
1310 Cheeseburger\tChapel Hill Farm beef, cheddar, bacon tomato jam, maple aioli, pickled onions, arugula; choice of French fries or mixed greens.
Grilled Branzino\tArugula, chimichurri, lemon.
Eggplant Shortrib\tMushroom bordelaise, mashed potatoes, spinach, fried shallots.
Organic Half Roasted Chicken\tGarlic, rosemary, thyme.
Porchetta\tFennel, lemon, rosemary, thyme.
House Made Veggie Burger\tLettuce, tomato, onion, pickles, cashew cheese sauce; choice of French fries or mixed greens.
  `),
  ...sourceRows("Dinner", "Pasta", sources.dinner, `
Garganelli\tTomato, basil, parmesan.
Zucchini Basil Spaghetti\tLemon, pecorino.
Short Rib Rigatoni\tParmesan.
Ratatouille Lasagna\tTofu cream, spinach.
  `),
  ...sourceRows("Dinner", "Sides", sources.dinner, `
Mac & Blue Cheese
Brussels Sprouts & Bacon
Roasted Potatoes
Roasted Broccolini\tGarlic oil.
French Fries
Sauteed Spinach
  `),
  ...sourceRows("Bar Bites", "Bites", sources.barBites, `
Fried Parmesan Risotto\tGarlic aioli.
Slaw Tostada\tRefried beans, cabbage, carrots, pickled onion, cucumber, jalapeno, avocado-cilantro sauce.
Bangin Broccoli\tSriracha sauce.
Tuna Tartare\tGinger, jalapeno, avocado, wonton.
Burrata & Caponata\tMicro arugula, grilled bread.
Nachos\tAvocado, pico, jalapeno, black beans, cheese sauce.
French Fries
  `),
  ...sourceRows("Bar Bites", "Bigger Bites", sources.barBites, `
Shrimp Tacos\tGrilled corn, cabbage, sriracha sour cream.
Chicken Enchiladas\tRanchero sauce, cheddar.
1310 Cheeseburger\tBacon tomato jam, maple aioli, pickled onions, arugula; choice of French fries or mixed greens.
Veggie Burger\tCashew cheese sauce, lettuce, tomato, onion, pickle; choice of French fries or mixed greens.
Chicken Pesto Flatbread\tChicken, pesto, mozzarella, arugula.
Tomato Mozzarella Flatbread\tMarinara, mozzarella, arugula.
  `),
  ...sourceRows("Late Night", "Starters & Salads", sources.lateNight, `
Parmesan Arancini\tGarlic aioli.
Fried Artichoke Hearts\tLemon garlic aioli.
Burrata & Spring Pesto\tGrilled garlic bread.
Kale Quinoa Salad\tApples, pomegranate, almonds, lemon vinaigrette.
Caesar Salad\tRomaine, parmesan, croutons.
  `),
  ...sourceRows("Late Night", "Entrees", sources.lateNight, `
Hot Turkey Cubano\tSwiss, mustard, cornichon.
Shrimp Tacos\tGrilled corn, cabbage, sriracha sour cream.
Grilled Branzino\tArugula, chimichurri.
Ratatouille Lasagna\tTofu ricotta, spinach.
Jenn's Chicken Pot Pie\tSpinach, peas, carrots, mushrooms.
1310 Cheeseburger\tCheddar, bacon tomato jam, maple aioli, pickled onions, arugula.
Veggie Burger\tLettuce, tomato, onion, pickles, cashew cheese.
Chicken Pesto Flatbread\tChicken pesto, mozzarella, arugula.
Tomato Mozzarella Flatbread\tTomato, mozzarella, arugula.
  `),
  ...sourceRows("Online Ordering", "Frozen Meals 23oz", sources.toast, `
Chicken Enchiladas, 23 oz\tRoasted chicken, flour tortilla, rice, black beans, peppers, onions, cheddar, ranchero sauce.
Chicken Pot Pie, 23 oz\tRoasted chicken, spinach, carrots, peas, celery, and a butter crust.
Egg Enchiladas, 16 oz\tFlour tortillas, eggs, peppers, onions, queso fresco, cheddar and ranchero sauce.
Eggplant Parmesan, 23 oz\tRoasted eggplant, tomato, mozzarella, parmesan; gluten free.
Mac & Blue Cheese, 16 oz\tCheddar, blue cheese, parmesan breadcrumbs.
Moussaka, 23 oz\tGround beef, lamb, eggplant, tomato, onions, cinnamon, parmesan cream sauce.
Penne with Lamb Ragu, 23 oz\tGround lamb, tomato, red wine, carrots, onion, celery, parmesan.
Shakshuka Starter, 23 oz\tTomato, red peppers, onion, cumin, coriander, spinach, heavy cream; gluten free.
Vegan Lasagna, 23 oz\tLayers of ratatouille, tofu ricotta, pasta and homemade tomato sauce.
Vegetable Pot Pie, 23 oz\tAsparagus, carrots, potatoes, mushrooms, peas, spinach and a butter crust.
Zucchini Lasagna, 23 oz\tGrilled zucchini, ricotta, lemon zest, mint, tomato, parmesan, eggs; gluten free.
  `),
  ...sourceRows("Online Ordering", "Frozen Meals 64oz", sources.toast, `
Chicken Pot Pie, 64 oz\tSpinach, mushrooms, carrots, celery, peas.
Chicken Enchiladas, 64 oz\tRoasted chicken, flour tortilla, rice, black beans, peppers, onions, cheddar, ranchero sauce.
Zucchini Lasagna, 64 oz\tGrilled zucchini, ricotta, lemon zest, mint, tomato, parmesan, eggs; gluten free.
Eggplant Parmesan, 64 oz\tRoasted eggplant, tomato, mozzarella, parmesan; gluten free.
Moussaka, 64 oz\tGround beef, lamb, eggplant, tomato, onions, cinnamon, parmesan cream sauce.
Vegetable Pot Pie, 64 oz\tAsparagus, carrots, potatoes, mushrooms, peas, spinach and a butter crust.
Penne with Lamb Ragu, 64 oz\tGround lamb, tomato, red wine, carrots, onion, celery, parmesan.
Shakshuka Starter, 64 oz\tTomato, red peppers, onion, cumin, coriander, spinach, heavy cream; gluten free.
Short Ribs - Frozen\tBraised beef, carrots, potatoes, mushrooms, red wine demi sauce.
  `),
  ...sourceRows("Online Ordering", "Comfort Food", sources.toast, `
Beef Chili 1qt
Chicken & Rice Soup 1qt
Tomato Bisque 1qt
  `),
  ...sourceRows("Online Ordering", "Breakfast", sources.toast, `
Acai Bowl\tBanana, blueberries, strawberries, granola.
Avocado Toast\tSeeded bread, toasted almonds, pomegranate.
Bacon & Eggs\tTwo eggs prepared any style, bacon, home fries.
Bagel & Smoked Salmon\tTomato, cucumber, red onion, capers, cream cheese.
Buttermilk Pancakes\tWhipped butter, maple syrup.
Custom Omelette\tHome fries.
Egg White Omelette\tSpinach, goat cheese, pico de gallo, avocado.
Eggs Benedict\tHollandaise sauce, English muffin, poached egg.
French Toast\tWhipped butter, maple syrup.
Fresh Fruit\tStrawberries, blueberries, pineapple.
Granola & Yogurt\tMaple Greek yogurt, fresh berries.
Ham & Cheese Sandwich\tCheddar, scrambled egg.
Shakshuka\tTomato, feta, cilantro, egg, side of toast.
Steel Cut Oatmeal\tCoconut milk, blueberries, cinnamon, vanilla.
Avocado Side
Bacon (3 pieces)
Bagel & Cream Cheese
Fresh Fruit Side
Home Fried Potatoes
Kielbasa Sausage
Nonna's Rum Cake
Pico De Gallo
Gluten Free Brioche
Toast
Turkey Sausage
One Egg
Two Eggs
  `),
  ...sourceRows("Online Ordering", "Beverages", sources.toast, `
Coffee
Latte
Cappuccino
Espresso
Extra Shot
Hot Tea
Hot Chocolate
Saratoga Flat Water (28oz)
Sparkling Water (16oz)
Sparkling Water (28oz)
Coke
Diet Coke
7 UP
Ginger Ale
Ginger Beer
Orange Juice
Grapefruit Juice
Apple Juice
Cranberry Juice
Pineapple Juice
Tomato Juice
Lemonade
Iced Tea
Milk
Non-Dairy Milk
  `),
];

export function build1310AuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const itemsByName = new Map();

  for (const row of rows) {
    const key = normalizedName(row.name);
    const existing = itemsByName.get(key);
    const candidate = {
      name: row.name,
      description: row.description,
      menus: [row.menu],
      categories: [`${row.menu} · ${row.section}`],
      sourceUrls: [row.sourceUrl],
    };

    if (!existing) {
      itemsByName.set(key, candidate);
      continue;
    }

    existing.menus = unique([...existing.menus, row.menu]);
    existing.categories = unique([...existing.categories, `${row.menu} · ${row.section}`]);
    existing.sourceUrls = unique([...existing.sourceUrls, row.sourceUrl]);
    if ((row.description?.length ?? 0) > (existing.description?.length ?? 0)) {
      existing.description = row.description;
    }
  }

  const items = [...itemsByName.values()].map((item, index) => {
    const evidenceText = `${item.name} ${item.description ?? ""}`;
    const allergens = directAllergens(evidenceText);
    return {
      auditItemKey: `${index + 1}:${slugify(item.name)}`,
      id: slugify(item.name),
      name: item.name,
      category: item.categories[0],
      menus: item.menus,
      categories: item.categories,
      description: item.description,
      ingredientsText: item.description,
      sourceUrls: item.sourceUrls,
      sourceType: item.sourceUrls.some((url) => url !== sources.toast)
        ? "official-pdf-menu"
        : "toast-menu",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: "replacement-1310-kitchen-and-bar-washington-dc",
    retrievedAt,
    sourceUrls: unique(Object.values(sources)),
    sourceRowCount: rows.length,
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "Official menus state that not all ingredients are listed. Empty allergen arrays are unavailable, not verified negative claims.",
    items,
  };
}

function directAllergens(value) {
  let text = ` ${String(value).toLowerCase()} `;
  const explicitlyGlutenFree = /\bgluten[- ]free\b|\(gf\)/i.test(text) && !/\(gfo\)/i.test(text);
  text = text
    .replace(/\balmond milk\b/g, " almond ")
    .replace(/\bsoy milk\b/g, " soy ")
    .replace(/\b(?:coconut|oat|non-dairy) milk\b/g, " ")
    .replace(/\b(almond|peanut|cashew|pecan|walnut|pistachio|hazelnut) butter\b/g, " $1 ")
    .replace(/\btofu (?:ricotta|cream)\b/g, " tofu ")
    .replace(/\bcashew cheese(?: sauce)?\b/g, " cashew ")
    .replace(/\bavocado butter\b/g, " avocado ");

  const matches = [
    ["shellfish", /\b(?:shrimp|calamari|crab|lobster|clam|oyster|scallop|mussel)s?\b/],
    ["milk", /\b(?:milk|butter|buttermilk|cheddar|cheese|feta|queso|yogurt|cream|mozzarella|parmesan|ricotta|pecorino|swiss|beurre blanc|blue cheese)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["tree-nut", /\b(?:almond|cashew|pecan|walnut|pistachio|hazelnut|macadamia)s?\b/],
    ["egg", /\b(?:egg|eggs|mayonnaise|aioli|hollandaise)\b/],
    ["fish", /\b(?:salmon|tuna|branzino|bronzino|cod|anchovy|trout|tilapia)s?\b/],
    ["soy", /\b(?:soy|tofu|edamame|miso|tamari)\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["mustard", /\b(?:mustard|dijon)\b/],
    ["sulfites", /\b(?:sulfite|sulfites|sulphite|sulphites)\b/],
  ];
  const allergens = matches.filter(([, pattern]) => pattern.test(text)).map(([allergen]) => allergen);
  const wheatPattern = /\b(?:wheat|flour tortillas?|bread|toast|challah|croissant|english muffin|pasta|breadcrumbs|croutons?|ciabatta|wonton|bagel|brioche|penne|lasagna|rigatoni|garganelli|spaghetti)\b/;
  if (!explicitlyGlutenFree && wheatPattern.test(text)) allergens.push("wheat", "gluten");
  return unique(allergens);
}

function normalizedName(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalizedName(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values)];
}

export { sources as sourceUrls1310 };

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ??
      "data/restaurant-verification/repairs/replacement-1310-kitchen-and-bar-washington-dc/corrected-menu.json",
  );
  const snapshot = build1310AuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
