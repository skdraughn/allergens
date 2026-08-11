import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const bSideRestaurantId = "b-side-mosaic-fairfax-va";
export const bSideSourceUrls = Object.freeze({
  home: "https://www.bsidecuts.com/",
  dinner: "https://dfef6bc4-dc09-4504-9828-e216a68da2c8.filesusr.com/ugd/6ace1f_cd888eef59024d1aa7dc49da0d5df425.pdf",
  brunch: "https://www.bsidecuts.com/_files/ugd/5d717b_e5db96761a614d97a634404bb38a7f4d.pdf",
  kids: "https://www.bsidecuts.com/_files/ugd/5d717b_daff303633f44d759b504a068297ff4f.pdf",
  happyHour: "https://www.bsidecuts.com/_files/ugd/5d717b_276bb7bc0e444aa89002445444fcf069.pdf",
  order: "https://order.online/store/red-apron-b-side-mosaic-fairfax-210444",
});

const ownerSources = Object.freeze({
  dinner: Object.freeze({
    url: bSideSourceUrls.dinner,
    artifact: `data/restaurant-verification/artifacts/${bSideRestaurantId}/official-dinner-menu-current.pdf`,
    sha256: "692d3e86c8b041cda3c28e067c45e4e3495957f3deecacc9b28c7bb32dda3480",
  }),
  brunch: Object.freeze({
    url: bSideSourceUrls.brunch,
    artifact: `data/restaurant-verification/artifacts/${bSideRestaurantId}/official-brunch-menu-current.pdf`,
    sha256: "6b755847fcb8ebaa53420a826bcb9560b3c87e1f6e31b4e14d44e054c6ed2565",
  }),
  kids: Object.freeze({
    url: bSideSourceUrls.kids,
    artifact: `data/restaurant-verification/artifacts/${bSideRestaurantId}/official-kids-menu-current.pdf`,
    sha256: "917199301107e6ccc11fbc7ab8610825bf60bde1761c5477fcdb4ca48921ab15",
  }),
  happyHour: Object.freeze({
    url: bSideSourceUrls.happyHour,
    artifact: `data/restaurant-verification/artifacts/${bSideRestaurantId}/official-happy-hour-current.pdf`,
    sha256: "369c23a1a910ccb157523b0ae277c8a37afaaccc9a496d65e54e70ab0c791f5f",
  }),
});

export const bSideDinnerSha256 = ownerSources.dinner.sha256;
export const bSideBrunchSha256 = ownerSources.brunch.sha256;
export const bSideKidsSha256 = ownerSources.kids.sha256;
export const bSideHappyHourSha256 = ownerSources.happyHour.sha256;

const definitions = Object.freeze([
  d("smoked-pimento-cheese", "Smoked Pimento Cheese", "Small Plates", "Ritz crackers", ["milk"], {
    presentations: [p("dinner", "Small Plates", "Ritz crackers"), p("brunch", "Weekend Brunch", "Ritz crackers")],
  }),
  d("pickled-deviled-eggs", "Pickled Deviled Eggs", "Small Plates", "Chicken cracklin", ["egg"]),
  d("48-hour-fermented-focaccia", "48 Hour Fermented Focaccia", "Small Plates", "Charred scallion butter", ["milk"]),
  d("brussels-sprouts", "Brussels Sprouts", "Small Plates", "Lime aioli, salted Thai chile, sesame", ["sesame"], {
    presentations: [
      p("dinner", "Small Plates", "Lime aioli, salted Thai chile, sesame"),
      p("brunch", "Weekend Brunch", "Lime aioli, salted Thai chile, toasted sesame"),
    ],
  }),
  d("caesar-salad", "Caesar Salad", "Small Plates", "Baby gem, garlic breadcrumbs, parmesan", ["milk", "fish"], {
    allergenSourceType: "restaurant-linked-menu-ingredients",
    presentations: [
      p("dinner", "Small Plates", "Baby gem, garlic breadcrumbs, parmesan"),
      p("brunch", "Weekend Brunch", "Baby gem, garlic breadcrumbs, parmesan"),
    ],
    linkedEvidence: [{
      sourceKind: "restaurant-linked-menu-ingredients",
      text: "Caesar Salad: baby gem romaine, roasted garlic Caesar dressing, garlic breadcrumbs, Parmesan cheese (contains anchovy).",
    }],
  }),
  d("heirloom-tomato-salad", "Heirloom Tomato Salad", "Small Plates", "Stracciatella, basil, aged balsamic", ["milk"], {
    presentations: [
      p("dinner", "Small Plates", "Stracciatella, basil, aged balsamic"),
      p("brunch", "Weekend Brunch", "Stracciatella, basil, aged balsamic"),
    ],
  }),
  d("charred-asparagus", "Charred Asparagus", "Small Plates", "Whipped ricotta, sesame, vin cotto", ["milk", "sesame"]),
  d("grilled-artichokes", "Grilled Artichokes", "Small Plates", "Chimichurri, roasted garlic aioli, charred lemon", []),
  d("sicilian-anchovies", "Sicilian Anchovies", "Small Plates", "Sourdough, stracciatella, salsa verde", ["milk", "fish"]),
  d("grilled-shishitos", "Grilled Shishitos", "Small Plates", "Yuzu aioli", []),
  d("swedish-meatballs", "Swedish Meatballs", "Small Plates", "Duck and bacon meatballs, whipped potatoes, crispy onions", []),
  d("bbqd-carrots", "BBQ'd Carrots", "Small Plates", "Labneh, kimchi, pickled fresnos, toum, crispy seeds", ["milk"]),
  d("smoked-wings", "Smoked Wings", "Small Plates", "Vadouvan curry butter, ginger scallion mayo, pickled Thai chile relish", ["milk"]),
  d("crispy-chesapeake-oysters", "Crispy Chesapeake Oysters", "Small Plates", "Pickled ramp tartar sauce, lemon", ["shellfish"]),
  d("spam", "Spam!", "Small Plates", "Glazed housemade Spam, crispy rice, pineapple mostarda", []),
  d("lettuce-wraps", "Lettuce Wraps", "Small Plates", "Porchetta skewers, shaved fennel, artichoke aioli", []),
  d("ahi-tuna-poke", "Ahi Tuna Poke", "Small Plates", "Pickled pineapple, whipped avocado", ["fish"]),
  d("smoked-olives", "Smoked Olives", "Snacks", null, []),
  d("sour-cream-and-onion-chicharrones", "Sour Cream & Onion Chicharrones", "Snacks", null, ["milk"], {
    allergenSourceType: "restaurant-linked-product-allergen-section",
    mayContain: ["milk", "gluten"],
    linkedEvidence: [{
      sourceKind: "restaurant-linked-product-allergen-section",
      text: "Chicharonnes: contains Dairy, cross-contaminated with Gluten & Dairy.",
    }],
  }),
  d("chili-spiced-nuts", "Chili Spiced Nuts", "Snacks", null, ["tree-nut"]),
  d("trio-of-the-above-3-snacks", "Trio of the Above 3 Snacks", "Snacks", null, ["milk", "tree-nut"]),
  d("beef-fat-fries", "Beef Fat Fries", "Snacks", "Ranch mayonnaise and ketchup", [], {
    presentations: [
      p("dinner", "Snacks", "Ranch mayonnaise and ketchup"),
      p("brunch", "Weekend Brunch", "Ranch mayo, ketchup"),
      p("happyHour", "Happy Hour Bites", "Ranch mayo, ketchup"),
    ],
  }),
  d("b-side-smashburger", "B Side Smashburger", "Big Plates", "2 smash patties, special sauce, lettuce, B&B pickles", ["milk"], {
    allergenSourceType: "restaurant-linked-menu-ingredients",
    presentations: [
      p("dinner", "Big Plates", "2 smash patties, special sauce, lettuce, B&B pickles"),
      p("brunch", "Weekend Brunch", "American cheese, iceberg, pickles, onion, Thousand Island, beef fat fries"),
    ],
    linkedEvidence: [{
      sourceKind: "restaurant-linked-menu-ingredients",
      text: "B-Side Smashburger: buttered challah bun and American cheese.",
    }],
  }),
  d("rambos-spice-bag", "Rambo's Spice Bag", "Big Plates", "Japanese fried chicken, shishito pepper, pearl onion, chili crisp, fries, curry sauce", ["milk", "gluten", "soy", "sesame"], {
    allergenSourceType: "restaurant-linked-product-allergen-section",
    linkedEvidence: [{
      sourceKind: "restaurant-linked-product-allergen-section",
      text: "Rambo's Spice Bag: Contains Dairy, Gluten, Soy, Sesame.",
    }],
  }),
  d("steak-frites", "Steak Frites", "Big Plates", "10 ounce bavette, au poivre, beef fat fries", []),
  d("hickory-smoked-brisket", "Hickory Smoked Brisket", "Big Plates", "Ginger-lemongrass congee, cilantro, pickled Thai chile relish", []),
  d("mixtape", "Mixtape", "Mixtape", "Chef-built shared menu for groups of 6 or more, $65 per person", [], { configurable: true }),
  d("samples", "Samples", "Samples", "Choose any 3 Small Plates for $35 or any 5 for $58", [], { configurable: true }),
  d("flourless-brownie", "Flourless Brownie", "Sweets", "Creme anglaise", []),
  d("choco-flan", "Choco Flan", "Sweets", "Dulce de leche", []),
  d("lemon-ricotta-donuts", "Lemon Ricotta Donuts", "Sweets", "Cream cheese glaze", ["milk"]),

  d("wedge-salad", "Wedge Salad", "Weekend Brunch", "Bacon, blue cheese, tomato, onion, ranch", ["milk"], { source: "brunch" }),
  d("smoked-salmon-eggs-benedict", "Smoked Salmon Eggs Benedict", "Weekend Brunch", "Hollandaise, English muffins", ["egg", "fish"], { source: "brunch" }),
  d("buttermilk-pancakes", "Buttermilk Pancakes", "Weekend Brunch", "Strawberries, whipped butter, maple", ["milk"], { source: "brunch" }),
  d("breakfast-poutine", "Breakfast Poutine", "Weekend Brunch", "Tater tots, sausage gravy, pickled peppers, fried egg", ["egg"], {
    presentations: [
      p("brunch", "Weekend Brunch", "Tater tots, sausage gravy, pickled peppers, fried egg", { layoutOccurrence: 1 }),
      p("brunch", "Weekend Brunch", "Tater tots, sausage gravy, pickled peppers, fried egg", { layoutOccurrence: 2 }),
    ],
  }),
  d("pancake-burger", "Pancake Burger", "Weekend Brunch", "Beef patty, American cheese, bacon, fried egg, home fries", ["milk", "egg"], { source: "brunch" }),
  d("fried-chicken-sandwich", "Fried Chicken Sandwich", "Weekend Brunch", "Smoked jalapeno jam, Alabama sauce, iceberg, pickles, beef fat fries", [], { source: "brunch" }),
  d("egg-and-cheese-sandwich", "Egg and Cheese Sandwich", "Weekend Brunch", "Breakfast sausage, cheese omelet, home fries", ["milk", "egg"], { source: "brunch" }),
  d("breakfast-burrito", "Breakfast Burrito", "Weekend Brunch", "Chorizo, pico, eggs, potato, 3 blend cheese, black beans", ["milk", "egg"], { source: "brunch" }),
  d("chicken-and-waffle", "Chicken and Waffle", "Weekend Brunch", "Honey hot sauce, yeasted waffle, maple butter", ["milk"], { source: "brunch" }),
  d("home-fries", "Home Fries", "Brunch Sides", null, [], { source: "brunch" }),
  d("two-eggs", "Two Eggs", "Brunch Sides", null, ["egg"], { source: "brunch" }),
  d("bacon", "Bacon", "Brunch Sides", null, [], { source: "brunch" }),
  d("sourdough-toast", "Sourdough Toast", "Brunch Sides", null, [], { source: "brunch" }),
  d("breakfast-sausage-slice", "Breakfast Sausage Slice", "Brunch Sides", null, [], { source: "brunch" }),

  d("kids-quesadilla", "Kids Quesadilla", "Kids", "Just the cheese", ["milk"], { source: "kids" }),
  d("mac-and-cheese", "Mac & Cheese", "Kids", null, ["milk"], { source: "kids" }),
  d("grilled-cheese", "Grilled Cheese", "Kids", "American cheese", ["milk"], { source: "kids" }),
  d("kids-taco", "Kids Taco", "Kids", "Taco beef or grilled chicken, queso", ["milk"], { source: "kids", configurable: true }),
  d("hi-fries", "Hi/Fries", "Kids", "Queso dip", ["milk"], { source: "kids" }),
  d("pig-wings", "Pig Wings", "Happy Hour Bites", "Gochujang BBQ, sesame", ["sesame"], { source: "happyHour" }),

  d("french-press-coffee", "French Press Coffee", "Nonalcoholic Beverages", null, [], { source: "brunch" }),
  d("hot-tea", "Hot Tea", "Nonalcoholic Beverages", null, [], { source: "brunch" }),
  d("martinellis-apple-juice", "Martinelli's Apple Juice", "Nonalcoholic Beverages", null, [], { source: "brunch" }),
  d("topo-chico-mineral-12-oz", "Topo Chico Mineral 12 Oz.", "Nonalcoholic Beverages", null, [], { source: "brunch" }),
  d("canned-soda", "Canned Soda", "Nonalcoholic Beverages", "Coke, Diet Coke, Coke Zero, Sprite, Ginger Ale, or Dr Pepper", [], { source: "brunch", configurable: true }),
  d("orange-juice", "Orange Juice", "Nonalcoholic Beverages", null, [], { source: "kids" }),
  d("whole-milk", "Whole Milk", "Nonalcoholic Beverages", null, ["milk"], { source: "kids" }),
]);

export async function buildBSideAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  for (const [sourceKey, source] of Object.entries(ownerSources)) {
    const bytes = await readFile(source.artifact);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== source.sha256) {
      throw new Error(`B Side ${sourceKey} PDF changed: ${sha256}.`);
    }
  }

  const items = definitions.map((definition, index) => finalize(definition, index));
  const officialIngredientCount = countSourceType(items, "official-ingredients");
  const linkedIngredientCount = countSourceType(items, "restaurant-linked-menu-ingredients");
  const linkedProductCount = countSourceType(items, "restaurant-linked-product-allergen-section");
  const linkedPositiveCount = linkedIngredientCount + linkedProductCount;
  const unavailableAllergenCount = countSourceType(items, "unavailable");
  const rawPresentationCount = items.reduce((count, item) => count + item.presentations.length, 0);
  if (
    items.length !== 58 ||
    new Set(items.map((item) => item.id)).size !== 58 ||
    officialIngredientCount !== 30 ||
    linkedIngredientCount !== 2 ||
    linkedProductCount !== 2 ||
    unavailableAllergenCount !== 24 ||
    rawPresentationCount !== 66 ||
    items.filter((item) => item.mayContain.length > 0).length !== 1
  ) {
    throw new Error(
      `B Side catalog changed: ${items.length} items, ${rawPresentationCount} presentations, ` +
        `${officialIngredientCount} official, ${linkedIngredientCount} linked ingredients, ` +
        `${linkedProductCount} linked product labels, ${unavailableAllergenCount} unavailable.`,
    );
  }

  return {
    schemaVersion: 1,
    restaurantId: bSideRestaurantId,
    retrievedAt,
    sourceUrls: Object.values(bSideSourceUrls),
    itemCount: items.length,
    rawPresentationCount,
    collapsedPresentationCount: rawPresentationCount - items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount,
    linkedIngredientCount,
    linkedProductCount,
    linkedPositiveCount,
    unavailableAllergenCount,
    sourceWarning: "B Side's current restaurant-issued dinner, brunch, kids, and happy-hour PDFs publish 66 food and nonalcoholic presentations that consolidate to 58 products; alcohol-only rows are excluded and beverages remain last. The PDFs provide partial ingredient descriptions, not complete recipes or an allergen matrix. Narrow official positives use direct major-allergen words and unavoidable named animal identities only. The restaurant-linked ordering page adds one ingredient-derived fish signal, two affirmative product disclosures, and an item-specific Chicharrones cross-contact statement without becoming restaurant-issued evidence or establishing negatives elsewhere.",
    items,
  };
}

function d(id, name, category, description, allergens, options = {}) {
  const source = options.source ?? "dinner";
  return {
    id,
    name,
    category,
    description,
    allergens,
    configurable: Boolean(options.configurable),
    mayContain: options.mayContain ?? [],
    allergenSourceType: options.allergenSourceType,
    linkedEvidence: options.linkedEvidence ?? [],
    presentations: options.presentations ?? [p(source, category, description)],
  };
}

function p(source, category, description, extra = {}) {
  return { source, category, description, ...extra };
}

function finalize(definition, index) {
  const allergens = orderedAllergens(definition.allergens);
  const mayContain = orderedAllergens(definition.mayContain);
  const allergenSourceType = definition.allergenSourceType ??
    (allergens.length > 0 ? "official-ingredients" : "unavailable");
  const ownerPresentations = definition.presentations.map((presentation) => ({
    ...presentation,
    name: definition.name,
    sourceUrl: ownerSources[presentation.source].url,
  }));
  const ownerUrls = ownerPresentations.map((presentation) => presentation.sourceUrl);
  const sourceUrls = unique([
    ...ownerUrls,
    ...(definition.linkedEvidence.length > 0 ? [bSideSourceUrls.order] : []),
  ]);
  const linked = definition.linkedEvidence.length > 0;
  return {
    auditItemKey: `${index + 1}:${definition.id}`,
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    ingredientsText: definition.description,
    imageUrl: null,
    isConfigurable: definition.configurable,
    allergens,
    mayContain,
    allergenSourceType,
    sourceType: linked
      ? "restaurant-issued-and-linked-menu"
      : sourceUrls.length > 1
        ? "restaurant-issued-multi-pdf-menu"
        : "restaurant-issued-pdf-menu",
    sourceUrls,
    sourceSummary: sourceSummary(allergenSourceType),
    evidence: [
      ...uniqueEvidence(ownerPresentations).map((presentation) => ({
        sourceKind: "restaurant-issued-menu-text",
        sourceUrl: presentation.sourceUrl,
        text: `${definition.name}${presentation.description ? `: ${presentation.description}` : ""}`,
      })),
      ...definition.linkedEvidence.map((evidence) => ({
        ...evidence,
        sourceUrl: bSideSourceUrls.order,
      })),
    ],
    presentations: ownerPresentations,
    variantGroup: definition.category,
  };
}

function sourceSummary(allergenSourceType) {
  if (allergenSourceType === "restaurant-linked-product-allergen-section") {
    return "A current restaurant-linked ordering product publishes an affirmative allergen or cross-contact statement. It remains linked-vendor evidence, not a complete restaurant-issued matrix, and silence is not negative evidence.";
  }
  if (allergenSourceType === "restaurant-linked-menu-ingredients") {
    return "The restaurant-issued menus and a current restaurant-linked ordering description jointly support narrow positive ingredient identities. Linked-vendor text is not promoted to restaurant-issued authority.";
  }
  if (allergenSourceType === "official-ingredients") {
    return "Direct major-allergen words or unavoidable named animal identities from the current restaurant-issued menu text are retained as partial positive evidence only.";
  }
  return "The current restaurant-issued menu text does not provide enough direct item-level allergen detail; direct and cross-contact status remain unavailable.";
}

function countSourceType(items, sourceType) {
  return items.filter((item) => item.allergenSourceType === sourceType).length;
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueEvidence(presentations) {
  const seen = new Set();
  return presentations.filter((presentation) => {
    const key = `${presentation.sourceUrl}\u0000${presentation.description ?? ""}`;
    if (seen.has(key)) return false;
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
  const snapshot = await buildBSideAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${bSideRestaurantId}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    rawPresentationCount: snapshot.rawPresentationCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    linkedIngredientCount: snapshot.linkedIngredientCount,
    linkedProductCount: snapshot.linkedProductCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
