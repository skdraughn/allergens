import assert from "node:assert/strict";
import test from "node:test";

import {
  assessRecoveredDescription,
  normalizeRecoveredText,
} from "./description-recovery-quality.mjs";

test("accepts comma-separated menu copy from a structurally paired source", () => {
  const result = assessRecoveredDescription(
    "Shrimp, calamari, coconut milk, lime, red onion, cilantro",
    { name: "Bamba Ceviche", category: "Tacos" },
    { sourceType: "json-structured", itemNames: new Set() },
  );
  assert.equal(result.usable, true);
});

test("accepts exact official product-page copy even when it names sides or uses a comma list", () => {
  const itemNames = new Set([
    normalizeRecoveredText("BBQ Meatloaf"),
    normalizeRecoveredText("Mashed Potatoes"),
    normalizeRecoveredText("Glazed Carrots"),
  ]);
  const result = assessRecoveredDescription(
    "Grilled meatloaf made with beef, pork, smoked mozzarella, veggies and herbs, with a tangy BBQ gravy, mashed potatoes and glazed carrots, topped with crispy onion strings",
    { name: "BBQ Meatloaf", category: "Dining" },
    {
      enforceStrictFreshCandidate: true,
      exactIdMatch: true,
      itemNames,
      sourceType: "product-page",
    },
  );

  assert.equal(result.usable, true);
});

test("accepts exact object-paired structured copy that names another menu item", () => {
  const itemNames = new Set([
    normalizeRecoveredText("Pad Thai"),
    normalizeRecoveredText("Snow Peas"),
  ]);
  const result = assessRecoveredDescription(
    "Stir-fried rice noodles with onion, bean sprouts, carrot, snow pea, egg, peanut, chicken and shrimp",
    { name: "Pad Thai", category: "Noodles" },
    {
      enforceStrictFreshCandidate: true,
      exactIdMatch: true,
      itemNames,
      sourceType: "json-structured",
    },
  );

  assert.equal(result.usable, true);
});

test("removes inline Markdown emphasis leaked from a menu source", () => {
  const result = assessRecoveredDescription(
    "Peaches, cucumber, corn, **candied pecans**, goat cheese, vinaigrette",
    { name: "Summer Peach Salad" },
    { sourceType: "html-card", exactIdMatch: true, enforceStrictFreshCandidate: true },
  );
  assert.deepEqual(result, {
    usable: true,
    value: "Peaches, cucumber, corn, candied pecans, goat cheese, vinaigrette",
  });
});

test("does not mistake leading protein grams for a glued menu price", () => {
  const result = assessRecoveredDescription(
    "20g of protein with egg whites, spinach, feta cheese and tomato cream cheese.",
    { name: "Spinach Wrap" },
    { sourceType: "official-api", itemNames: new Set() },
  );
  assert.equal(result.usable, true);
});

test("repairs a menu price glued to an HTML-card description", () => {
  const result = assessRecoveredDescription(
    "24Aged Mozzarella, Provolone, Pepperoni, Vodka Sauce, Basil",
    { name: "Drunken Love" },
    { sourceType: "html-card", itemNames: new Set() },
  );
  assert.deepEqual(result, {
    usable: true,
    value: "Aged Mozzarella, Provolone, Pepperoni, Vodka Sauce, Basil",
  });
});

test("removes a structured nutrition suffix without dropping the menu description", () => {
  const result = assessRecoveredDescription(
    "Chicken, avocado, cabbage, rice, crispy onions Contains meat, wheat Calories 49G Protein 68G Carbs 41G Fat",
    { name: "Chicken Bowl" },
    { sourceType: "html-sequential-priced-menu", itemNames: new Set() },
  );
  assert.deepEqual(result, {
    usable: true,
    value: "Chicken, avocado, cabbage, rice, crispy onions",
    acceptedSourceType: "structured-nutrition-description",
  });
});

test("removes nutrition columns that begin with fat and rejects nutrition-only rows", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "Crispy egg roll with a delicious chicken filling. Calories 6g Fat 560mg Sodium 14g Protein 11g Carbs",
      { name: "Chicken Egg Roll" },
      { sourceType: "html-allergen-matrix", itemNames: new Set() },
    ),
    {
      usable: true,
      value: "Crispy egg roll with a delicious chicken filling.",
      acceptedSourceType: "structured-nutrition-description",
    },
  );
  assert.equal(
    assessRecoveredDescription(
      "Calories 2g Fat 1580mg Sodium 4g Protein 6g Carbs",
      { name: "Miso Soup" },
      { sourceType: "html-allergen-matrix", itemNames: new Set() },
    ).usable,
    false,
  );
});

test("rejects preparation-time metadata as a menu description", () => {
  const result = assessRecoveredDescription(
    "Please allow two hours prep time.",
    { name: "Whole Crepe Cake" },
    { sourceType: "next-flight-products", enforceStrictFreshCandidate: true },
  );
  assert.equal(result.usable, false);
  assert.equal(result.reason, "non_description_metadata");
});

test("rejects add-on-only customization copy as a fresh description", () => {
  const result = assessRecoveredDescription(
    "Add extra espresso shot for an additional charge.",
    { name: "Frappe" },
    { sourceType: "square-online-api", enforceStrictFreshCandidate: true },
  );
  assert.equal(result.usable, false);
  assert.equal(result.reason, "fresh_non_description_metadata");
});

test("retains descriptive count and size prefixes but rejects bare serving metadata", () => {
  assert.equal(
    assessRecoveredDescription(
      "1pc - Pork belly, fried lotus bun, daikon and sweet potato",
      { name: "Pork Bun" },
      { sourceType: "json-structured" },
    ).usable,
    true,
  );
  assert.equal(
    assessRecoveredDescription(
      "8oz Prime Angus beef, caramelized onion, Gruyere and fries",
      { name: "Burger" },
      { sourceType: "json-structured" },
    ).usable,
    true,
  );
  assert.equal(
    assessRecoveredDescription("2 Pieces", { name: "Dumplings" }, { sourceType: "html-card" }).usable,
    false,
  );
  assert.equal(
    assessRecoveredDescription("10 wings", { name: "Jerk Wings" }, { sourceType: "html-card" }).usable,
    false,
  );
  assert.equal(
    assessRecoveredDescription("12 ounces", { name: "Natural Juice" }, { sourceType: "html-card" }).usable,
    false,
  );
  assert.equal(
    assessRecoveredDescription("1 gallon", { name: "Aguas Frescas" }, { sourceType: "json-structured" }).usable,
    false,
  );
  assert.equal(
    assessRecoveredDescription("Per guest.", { name: "Beans" }, { sourceType: "json-structured" }).usable,
    false,
  );
  assert.equal(
    assessRecoveredDescription("16oz or 20oz", { name: "Hot Cocoa" }, { sourceType: "json-structured" }).usable,
    false,
  );
  assert.equal(
    assessRecoveredDescription("5.5oz Breaded Chicken", { name: "Breaded Chicken" }, { sourceType: "next-flight-products" }).usable,
    false,
  );
});

test("strips a trailing menu price from structured descriptions", () => {
  const result = assessRecoveredDescription(
    "Salmon, seaweed salad, ginger dressing, spicy salmon roll...21.99",
    { name: "Salmon Bento" },
    { sourceType: "json-structured" },
  );
  assert.deepEqual(result, {
    usable: true,
    value: "Salmon, seaweed salad, ginger dressing, spicy salmon roll",
  });
  assert.equal(
    assessRecoveredDescription(
      "thin crackers served with an array of chutneys 5.0",
      { name: "Khakhra Platter" },
      { sourceType: "html-sequential-priced-menu", enforceStrictFreshCandidate: true },
    ).value,
    "thin crackers served with an array of chutneys",
  );
  assert.equal(
    assessRecoveredDescription(
      "with roasted wild mushroom risotto I 32.95",
      { name: "Grilled Salmon" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ).value,
    "with roasted wild mushroom risotto",
  );
});

test("preserves an option price that is part of the sentence", () => {
  const result = assessRecoveredDescription(
    "Make it a combo with fries for an additional $3.50",
    { name: "Burger" },
    { sourceType: "json-structured" },
  );
  assert.equal(result.value, "Make it a combo with fries for an additional $3.50");
});

test("strips a trailing one-decimal menu price after sentence punctuation", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "Ham, peppers, scallions, toast. 16.5",
      { name: "Uptown Western Omelet" },
      { sourceType: "squarespace-menu-block", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "Ham, peppers, scallions, toast." },
  );
});

test("rejects visibly truncated descriptions", () => {
  const result = assessRecoveredDescription(
    "Buttermilk fried chicken nuggets served with di...",
    { name: "Nugz" },
    { sourceType: "html-sequential-priced-menu" },
  );
  assert.deepEqual(result, { usable: false, reason: "truncated_description" });
  assert.equal(
    assessRecoveredDescription(
      "A selection of premium fish such as tuna, salmon, yellowtail, etc...",
      { name: "Chirashi" },
      { sourceType: "legacy-verified-recovery" },
    ).usable,
    true,
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "Grilled or Teriyaki Salmon with 2",
      { name: "Baked Salmon with 2 Sides" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    { usable: false, reason: "truncated_description" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "Bananas, pineapple, spinach…",
      { name: "Vegan Pineapple Spinach" },
      { sourceType: "official-api" },
    ),
    { usable: false, reason: "truncated_description" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "American cheese and pickles. 860 cal BBQ Bacon Cheddar Burger 10...",
      { name: "BURGERS & HANDHELDS" },
      { sourceType: "pdf-menu", enforceFreshSectionHeading: true },
    ),
    { usable: false, reason: "menu_section_heading_record" },
  );
});

test("rejects PDF menu section headings masquerading as items", () => {
  for (const name of [
    "STARTERS A PERFECT KICKOFF TO A MEAL",
    "STARTERSA PERFECT KICKOFF TO A MEAL",
  ]) {
    assert.deepEqual(
      assessRecoveredDescription(
        "Mac and cheese bites followed by spinach artichoke dip.",
        { name },
        { sourceType: "pdf-menu", enforceFreshSectionHeading: true },
      ),
      { usable: false, reason: "menu_section_heading_record" },
    );
  }
});

test("accepts an uppercase exact structured item whose name contains a category word", () => {
  const result = assessRecoveredDescription(
    "8 oz beef patty with BBQ spread, bacon, cheese and onion rings, plus lettuce, tomato and mayo. Served with fries or a side salad.",
    { name: "BBQ BURGER" },
    {
      sourceType: "json-structured",
      exactIdMatch: true,
      enforceFreshSectionHeading: true,
      enforceStrictFreshCandidate: true,
    },
  );
  assert.equal(result.usable, true);
});

test("accepts ingredient-list copy from an explicitly paired simple item card", () => {
  const description =
    "CHICKEN, BROCCOLI, PEPPERS, CARROTS, ONIONS, MUSHROOMS, RICE, TERIYAKI SAUCE";
  assert.equal(
    assessRecoveredDescription(
      description,
      { name: "TERIYAKI BOWL" },
      {
        sourceType: "simple-item-card",
        exactIdMatch: true,
        itemNames: new Set([normalizeRecoveredText(description)]),
      },
    ).usable,
    true,
  );
});

test("rejects restaurant marketing calls to action appended to menu copy", () => {
  for (const value of [
    "Tempura shrimp, avocado, cucumber, and sauce. Order online for pickup or delivery.",
    "Tempura shrimp, avocado, cucumber, and sauce. A sushi restaurant classic—order online for pickup.",
    "A classic doughnut filled with custard. View nutrition, ingredients, and order online today.",
    "Silky-smooth coffee served hot or cold. Subscribers always get free shipping.",
  ]) {
    assert.deepEqual(
      assessRecoveredDescription(
        value,
        { name: "Shrimp Tempura Roll" },
        { sourceType: "html-allergen-matrix", exactIdMatch: true },
      ),
      { usable: false, reason: "promotional_call_to_action" },
    );
  }
});

test("rejects unavailable-item placeholders and customization instructions", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "This item is not currently available. Check out the rest of the menu and find something new to love.",
      { name: "Cantina Chicken Quesadilla" },
      { sourceType: "product-page" },
    ),
    { usable: false, reason: "unavailable_item_placeholder" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "Seasoned Beef swapped for Slow-Roasted Chicken, add Onions and Jalapeño Peppers",
      { name: "Grilled Cheese Burrito" },
      { sourceType: "product-page" },
    ),
    { usable: false, reason: "customization_instruction" },
  );
});

test("accepts an explicitly reviewed official ingredient-list description", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "pineapple, carrot, organic apple, ginger, turmeric, beet, lemon",
      { name: "Bright Eyes" },
      { sourceType: "pdf-menu", reviewedIngredientList: true },
    ),
    {
      usable: true,
      value: "pineapple, carrot, organic apple, ginger, turmeric, beet, lemon",
      acceptedSourceType: "reviewed-official-menu-description",
    },
  );
});

test("keeps manually reviewed descriptions that legitimately name side items", () => {
  const itemNames = new Set([
    "Bison Meatloaf",
    "Garlic Mashed Potatoes",
    "Buttered Carrots",
  ].map(normalizeRecoveredText));
  assert.deepEqual(
    assessRecoveredDescription(
      "Served with gravy, garlic mashed potatoes, and buttered carrots.",
      { name: "Bison Meatloaf" },
      {
        sourceType: "reviewed-official-menu-description",
        itemNames,
        enforceStrictFreshCandidate: true,
      },
    ),
    {
      usable: true,
      value: "Served with gravy, garlic mashed potatoes, and buttered carrots.",
    },
  );
});

test("manual review overrides false sibling-title and heading classifications", () => {
  const itemNames = new Set([
    "Salmon in Pacifico Sauce",
    "Topped with a creamy garlic-and-caper sauce.",
  ].map(normalizeRecoveredText));
  assert.equal(
    assessRecoveredDescription(
      "Topped with a creamy garlic-and-caper sauce.",
      { name: "Salmon in Pacifico Sauce", category: "Seafood" },
      {
        sourceType: "reviewed-official-menu-description",
        itemNames,
        enforceFreshSectionHeading: true,
        enforceStrictFreshCandidate: true,
      },
    ).usable,
    true,
  );
  assert.equal(
    assessRecoveredDescription(
      "Black Angus beef burger with lettuce, tomato, onion, house pickles, chophouse sauce, a brioche bun, and house-cut fries.",
      { name: "CHOPHOUSE BURGER", category: "Main Dishes" },
      {
        sourceType: "reviewed-official-menu-description",
        itemNames,
        enforceFreshSectionHeading: true,
        enforceStrictFreshCandidate: true,
      },
    ).usable,
    true,
  );
});

test("rejects a description made from two neighboring menu item names", () => {
  const itemNames = new Set([
    "Side Shrimp",
    "Grilled Salmon",
    "Grilled Steak",
  ].map(normalizeRecoveredText));
  const result = assessRecoveredDescription(
    "8oz Grilled Salmon 8oz Grilled Steak",
    { name: "Side Shrimp" },
    { sourceType: "html-card", itemNames },
  );
  assert.deepEqual(result, { usable: false, reason: "contains_multiple_item_names" });
});

test("rejects an adjacent menu item's title", () => {
  const itemNames = new Set(["tea", "specialty cocktails"].map(normalizeRecoveredText));
  const result = assessRecoveredDescription(
    "SPECIALTY COCKTAILS",
    { name: "Tea" },
    { sourceType: "html-card", itemNames },
  );
  assert.deepEqual(result, { usable: false, reason: "equals_another_item_name" });
});

test("accepts descriptive copy reused as a malformed title only for an exact structured ID", () => {
  const description = "Steamed shrimp dumplings.";
  const itemNames = new Set([description].map(normalizeRecoveredText));
  assert.equal(
    assessRecoveredDescription(
      description,
      { name: "Shrimp Shumai" },
      { sourceType: "spotapps-nuxt-menu", itemNames, exactIdMatch: true },
    ).usable,
    true,
  );
  assert.equal(
    assessRecoveredDescription(
      description,
      { name: "Shrimp Shumai" },
      { sourceType: "html-card", itemNames, exactIdMatch: true },
    ).usable,
    false,
  );
});

test("removes a calorie macro tail without requiring a Contains prefix", () => {
  const result = assessRecoveredDescription(
    "Chicken, rice, cucumbers, feta and garlic sauce Calories 35g Protein 62g Carbs 33g Fat",
    { name: "Chicken Bowl" },
    { sourceType: "html-card", itemNames: new Set() },
  );
  assert.deepEqual(result, {
    usable: true,
    value: "Chicken, rice, cucumbers, feta and garlic sauce",
    acceptedSourceType: "structured-nutrition-description",
  });
});

test("accepts explicit ingredient lists from ingredient PDFs", () => {
  const result = assessRecoveredDescription(
    "Flour, butter, chocolate chunks, sugar, eggs, milk, sea salt, baking soda",
    { name: "Chocolate Chip Cookie" },
    { sourceType: "pdf-ingredients", itemNames: new Set() },
  );
  assert.equal(result.usable, true);
});

test("permits ordinary pipe-delimited menu copy but rejects multi-row bleed", () => {
  assert.equal(
    assessRecoveredDescription(
      "prosciutto | peas | linguine",
      { name: "Lobster Carbonara" },
      { sourceType: "html-card", itemNames: new Set() },
    ).usable,
    true,
  );
  assert.equal(
    assessRecoveredDescription(
      "salmon, avocado THE EVE Vodka | Schnapps | Lillet |",
      { name: "Salmon Roll" },
      { sourceType: "html-card", itemNames: new Set() },
    ).usable,
    false,
  );
});

test("rejects dietary tags, serving tables, and size-price rows", () => {
  for (const value of [
    "| NF | V",
    "Serving 57 30 15 2 0 0 0 270 3 1 2 1 (TOMATOES, ONION, OIL)",
    "2oz 5 | 4oz 10",
  ]) {
    assert.equal(
      assessRecoveredDescription(
        value,
        { name: "Side" },
        { sourceType: "html-card", itemNames: new Set() },
      ).usable,
      false,
    );
  }
});

test("does not treat a sibling size variant title as descriptive copy", () => {
  const description = "Smokey Brisket Chili (Small)";
  const result = assessRecoveredDescription(
    description,
    { name: "Smokey Brisket Chili (Large)" },
    {
      sourceType: "json-structured",
      itemNames: new Set([normalizeRecoveredText(description)]),
      exactIdMatch: true,
    },
  );
  assert.deepEqual(result, { usable: false, reason: "equals_another_item_name" });
});

test("rejects extraction bleed and incomplete structured copy", () => {
  const result = assessRecoveredDescription(
    "salmon, avocado, tempura bits THE EVE Citron Vodka | Peach Schnapps |",
    { name: "Salmon Roll" },
    { sourceType: "html-card", itemNames: new Set() },
  );
  assert.deepEqual(result, { usable: false, reason: "adjacent_content_bleed" });
});

test("keeps unstructured PDF comma lists behind the conservative gate", () => {
  const result = assessRecoveredDescription(
    "eggs, bacon, cheese, cilantro, onions, hot sauce, hash browns",
    { name: "Breakfast Tacos" },
    { sourceType: "pdf-menu", itemNames: new Set() },
  );
  assert.deepEqual(result, { usable: false, reason: "comma_heavy_without_sentence" });
});

test("rejects calorie-only and count-only metadata", () => {
  assert.equal(
    assessRecoveredDescription("(110 cal)", { name: "Side" }, { sourceType: "html-card" }).usable,
    false,
  );
  assert.equal(
    assessRecoveredDescription("2 Pieces", { name: "Dumplings" }, { sourceType: "html-card" }).usable,
    false,
  );
});

test("rejects strict fresh metadata and extraction prices", () => {
  for (const value of [
    "90mg caffeine",
    "Under 100 Calories",
    "1/2 pan. Serves 12",
    "Kids Menu",
    "Catering Menu",
    "Side item.",
    "Half pan.",
    "160 oz bowl; serves 8–10.",
    "(gluten free, sesame)",
    "s, soy, coconut",
    "years old and under only.",
    "Food Starters",
    "DINNER Mediterranean Chicken, Cucumber Salad & Burrata Toast SPECIALS",
    "| Salta | Argentina",
    "Beverages 1 Gallon Sweet Tea 2 Liter Soda Assorted Sodas Coffee",
    "Topping Slice 2 Topping Slice 3 Topping Slice",
    "Chocolate Chip Cookies 3 Snicker Doodle Cookies 3 White Chocolate Macadamia Cookies",
    "portion of",
    "SAVE $3 - Half 1-Topping Pizza & 20 Wings",
    "Small Pack",
    "$4.99+ Brussels Sprouts",
    "Chicken cooked in a spicy tomato sauce$24",
  ]) {
    assert.equal(
      assessRecoveredDescription(
        value,
        { name: "Candidate" },
        { sourceType: "html-card", enforceStrictFreshCandidate: true },
      ).usable,
      false,
    );
  }
});

test("rejects short menu badges and fulfillment notes as descriptions", () => {
  for (const description of ["Vegetarian-friendly", "No sides", "No side."]) {
    assert.equal(
      assessRecoveredDescription(
        description,
        { name: "Menu Item" },
        { sourceType: "json-structured", enforceStrictFreshCandidate: true },
      ).usable,
      false,
    );
  }
});

test("rejects strict fresh truncation and sentence-like shifted menu rows", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "black beans, mushrooms, quinoa, avocado, red ...",
      { name: "Black Bean Burger" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    { usable: false, reason: "truncated_description" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "Gulf shrimp, sausage, roast pork, chicken, tomato sauce and penne pasta.",
      { name: "A sauteed chicken breast with a creole mustard cream sauce and smashed potatoes" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    { usable: false, reason: "sentence_like_item_name" },
  );
});

test("strips strict fresh protein metadata and rejects quantity-only variants", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "fresh mozzarella, tomato sauce, penne pasta 56G PROTEIN",
      { name: "Chicken Parmesan" },
      { sourceType: "json-structured", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "fresh mozzarella, tomato sauce, penne pasta" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "1/2 Dozen Mini Bagels",
      { name: "Mini Bagel" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    { usable: false, reason: "quantity_plus_item_name" },
  );
  assert.equal(
    assessRecoveredDescription(
      "house-made 360 CAL",
      { name: "Chocolate Chip Cookie" },
      { sourceType: "pdf-menu", enforceStrictFreshCandidate: true },
    ).usable,
    false,
  );
});

test("rejects adjacent item copy in strict fresh candidates", () => {
  const itemNames = new Set([
    "Personal Pizza",
    "Sicilian Pizza Whole",
    "House Chef Salad",
    "Crispy Chicken Caesar Salad",
    "Palak and Kale Chaat",
    "Chicken in Garlic Sauce",
  ].map(normalizeRecoveredText));
  for (const [name, description] of [
    ["Personal Pizza", "Sicilian Pizza Whole tomato sauce and mozzarella"],
    ["Crispy Chicken Caesar Salad", "House Chef Salad with turkey and ham"],
    ["Palak and Kale Chaat", "Yogurt and chutney Chicken in Garlic Sauce diced chicken"],
  ]) {
    assert.deepEqual(
      assessRecoveredDescription(
        description,
        { name },
        {
          sourceType: "html-card",
          itemNames,
          enforceStrictFreshCandidate: true,
        },
      ),
      { usable: false, reason: "contains_adjacent_item_copy" },
    );
  }
});

test("cleans harmless trailing menu actions from strict fresh descriptions", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "Fresh greens, tomatoes, cucumbers, and house dressing Order",
      { name: "House Salad" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "Fresh greens, tomatoes, cucumbers, and house dressing" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "Beyond patty, cheddar, lettuce and tomato. ★★★★★ “The burgers were amazing.”",
      { name: "Beyond Burger" },
      { sourceType: "json-structured", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "Beyond patty, cheddar, lettuce and tomato." },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "Spring mix, cabbage, peppers and oranges STARTERS",
      { name: "Citrus Salad" },
      { sourceType: "json-structured", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "Spring mix, cabbage, peppers and oranges" },
  );
});

test("cleans ordering actions, protein prompts, and glued section headings", () => {
  const cases = [
    ["Potato patties topped with chick peas. VG GF Added to cart", "Potato patties topped with chick peas."],
    ["Romaine, carrots, queso fresco, cilantro-lime vinaigrette add chicken", "Romaine, carrots, queso fresco, cilantro-lime vinaigrette"],
    ["Mozzarella, pepperoni, tomato sauce Food Starters, Salads & Such", "Mozzarella, pepperoni, tomato sauce"],
  ];
  for (const [value, expected] of cases) {
    assert.equal(
      assessRecoveredDescription(
        value,
        { name: "Menu Item" },
        { sourceType: "html-card", enforceStrictFreshCandidate: true },
      ).value,
      expected,
    );
  }
});

test("cleans strict fresh menu prefixes and trailing pipe separators", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "Avocado Melt $13.99 avocado, cucumber, red onion, swiss, green tomato aioli",
      { name: "Avocado Melt" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    {
      usable: true,
      value: "avocado, cucumber, red onion, swiss, green tomato aioli",
    },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "8 PCS: Eel | Salmon | Avocado | Cucumber |",
      { name: "Golden Dragon" },
      { sourceType: "pdf-menu", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "8 PCS: Eel | Salmon | Avocado | Cucumber" },
  );
});

test("rejects allergen-only notes only for new strict recoveries", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "**Contains Walnuts",
      { name: "Mini Carrot Bundt Cake" },
      { sourceType: "json-structured", enforceStrictFreshCandidate: true },
    ),
    { usable: false, reason: "allergen_only_note" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "Allergens: Gluten, Soy",
      { name: "Vegetable Tempura App" },
      { sourceType: "pdf-menu", enforceStrictFreshCandidate: true },
    ),
    { usable: false, reason: "allergen_only_note" },
  );
  assert.notEqual(
    assessRecoveredDescription(
      "Contains walnuts",
      { name: "Mini Carrot Bundt Cake" },
      { sourceType: "legacy-verified-recovery" },
    ).reason,
    "allergen_only_note",
  );
});

test("does not let stale item evidence rewrite a recovery candidate", () => {
  const description = "Grilled Chicken Chop Noodle Soup features tender grilled chicken served over noodles in a savory broth with scallions and vegetables.";
  assert.deepEqual(
    assessRecoveredDescription(
      description,
      {
        name: "Grilled Chicken Chop Noodle Soup",
        evidence: [
          { text: "Grilled Chicken Chop Noodle Soup" },
          { text: "Braised Beef Noodle Soup" },
        ],
      },
      {
        sourceType: "toast-reader-menu",
        exactIdMatch: true,
        enforceStrictFreshCandidate: true,
      },
    ),
    { usable: true, value: description },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      description,
      {
        name: "Grilled Chicken Chop Noodle Soup",
        evidence: [
          { text: "Grilled Chicken Chop Noodle Soup" },
          { text: "Braised Beef Noodle Soup" },
        ],
      },
      { sourceType: "legacy-verified-recovery" },
    ),
    { usable: true, value: description },
  );
});

test("strips neighboring section labels from strict fresh descriptions", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "grilled chicken, cilantro, onions, corn tortilla Specials",
      { name: "Pollo Al Carbon Taco" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "grilled chicken, cilantro, onions, corn tortilla" },
  );
  assert.deepEqual(
    assessRecoveredDescription(
      "chihuahua cheese, avocado, pickled jalapeño Quesadillas",
      { name: "Torta Tradicional" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ),
    { usable: true, value: "chihuahua cheese, avocado, pickled jalapeño" },
  );
});

test("strips adjacent soup and weekly-special labels from fresh descriptions", () => {
  assert.equal(
    assessRecoveredDescription(
      "Bibb, Roasted Jalapeño-Caesar Dressing, Croutons SOPA DEL DÍA Today's Soup",
      { name: "ENSALADA CÉSAR" },
      { sourceType: "pdf-menu", enforceStrictFreshCandidate: true },
    ).value,
    "Bibb, Roasted Jalapeño-Caesar Dressing, Croutons",
  );
  assert.equal(
    assessRecoveredDescription(
      "kashmiri chili new potatoes | spice glaze | (2 chops) WEEKLY CHEF’S SPECIAL. Ask your server for a full description.",
      { name: "GRILLED LAMB CHOPS" },
      { sourceType: "html-sequential-priced-menu", enforceStrictFreshCandidate: true },
    ).value,
    "kashmiri chili new potatoes | spice glaze | (2 chops)",
  );
});

test("strips catering prefixes and trailing menu-section labels", () => {
  assert.equal(
    assessRecoveredDescription(
      "Half Tray 8-10 Portions $65 | Full Tray 16-20 Portions $120 • Fresh mozzarella, tomato, basil",
      { name: "Caprese" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ).value,
    "Fresh mozzarella, tomato, basil",
  );
  assert.equal(
    assessRecoveredDescription(
      "Beef and lamb gyro, lettuce, tomato, onion Noosh Food Menu Bowls",
      { name: "Gyro Pita" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ).value,
    "Beef and lamb gyro, lettuce, tomato, onion",
  );
  assert.equal(
    assessRecoveredDescription(
      "HMozzarella cheese, Oaxaca cheese, cotija, pico de gallo",
      { name: "Queso Fundido" },
      { sourceType: "pdf-menu", enforceStrictFreshCandidate: true },
    ).value,
    "Mozzarella cheese, Oaxaca cheese, cotija, pico de gallo",
  );
});

test("rejects size prompts and calorie-column labels", () => {
  for (const value of [
    "Select your size",
    "Calories per piece",
    "House Favorites",
    "Follow our Facebook and Instagram pages for daily updates!",
    "4 oz, 8 oz, 16 oz",
    "Small 10″ Medium 13″",
  ]) {
    assert.equal(
      assessRecoveredDescription(
        value,
        { name: "Menu Item" },
        { sourceType: "html-card", enforceStrictFreshCandidate: true },
      ).usable,
      false,
    );
  }
});

test("rejects incomplete descriptions ending in a dangling preposition", () => {
  for (const value of [
    "Steakhouse rubbed bistro steak, grilled and sliced, over",
    "Chicken, feta, tomatoes and dressing wrapped in",
  ]) {
    const result = assessRecoveredDescription(value, { name: "Menu Item" }, {
      sourceType: "pdf-menu",
      enforceStrictFreshCandidate: true,
    });
    assert.equal(result.usable, false, value);
    assert.equal(result.reason, "fresh_non_description_metadata", value);
  }
});

test("rejects strict fresh placeholders, dietary-only copy, promotions, and truncated actions", () => {
  for (const [name, description] of [
    ["Full Rodizio", "view selection"],
    ["Bacon", "Gluten Free"],
    ["Chipotle Coleslaw", "Vegan & Gluten Free"],
    ["Cheese & Charcuterie", "Pick 6 hosting a private event, happy hour offerings, wine tastings, & more!"],
    ["Pizza Arugula", "Arugula, red peppers, eggplant, and mushrooms Add"],
    ["Hot Honey Salmon", "Pan seared salmon finished with hot honey sauce served with two"],
    ["Chocolate Chip Cookie", "No substitutions."],
    ["Dozen Vegan Biscuits", "Please give us"],
    ["Cookie + Brownie Duo", "feeds 10-12 people CHOOSE YOUR SIDE"],
  ]) {
    assert.equal(
      assessRecoveredDescription(
        description,
        { name },
        { sourceType: "json-structured", enforceStrictFreshCandidate: true },
      ).usable,
      false,
    );
  }
});

test("strips a trailing add-on prompt from fresh descriptions", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "guajillo chile, smoked gouda, poblano crema, black bean, corn, avocado Want to Add On?",
      { name: "Chicken Enchiladas" },
      { sourceType: "json-structured", enforceStrictFreshCandidate: true },
    ),
    {
      usable: true,
      value: "guajillo chile, smoked gouda, poblano crema, black bean, corn, avocado",
    },
  );
});

test("rejects provenance placeholders and count-price metadata from fresh menus", () => {
  for (const value of [
    "Official Founding Farmers DC dessert menu item.",
    "4 each for $10",
  ]) {
    const result = assessRecoveredDescription(value, { name: "Chicken Skewers" }, {
      enforceStrictFreshCandidate: true,
      sourceType: "pdf-menu",
    });
    assert.equal(result.usable, false, value);
  }
});

test("strips a trailing large-plates section label from fresh menu copy", () => {
  const result = assessRecoveredDescription(
    "Thick rice noodles, coconut milk, parmesan, cracked black pepper, truffle Large Plates",
    { name: "Black Pepper Bun" },
    { enforceStrictFreshCandidate: true, sourceType: "pdf-matrix" },
  );
  assert.equal(result.usable, true);
  assert.equal(
    result.value,
    "Thick rice noodles, coconut milk, parmesan, cracked black pepper, truffle",
  );
});

test("rejects damaged PDF text and size-only beverage metadata", () => {
  assert.deepEqual(
    assessRecoveredDescription(
      "Seafood stew, scallops, shrimp, \u0000sh, squid, mussels in sa\u0000fron sauce.",
      { name: "Zarzuela (Mariscada)" },
      { sourceType: "pdf-menu", enforceStrictFreshCandidate: true },
    ),
    { usable: false, reason: "control_character" },
  );
  assert.equal(
    assessRecoveredDescription(
      "22oz Fountain Dr. Pepper",
      { name: "Dr. Pepper" },
      { sourceType: "html-card", enforceStrictFreshCandidate: true },
    ).usable,
    false,
  );
});
