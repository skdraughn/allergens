import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const arbysRestaurantId = "arbys";
export const arbysNutritionUrl = "https://assets.ctfassets.net/30q5w5l98nbx/3A0KfHgCWZv8al7gU36Jlg/d4e9d4f7c01a55ec87d630272a0bb072/Arbys_Nutritional_and_Allergen_AUG_2026.pdf";
export const arbysIngredientsUrl = "https://assets.ctfassets.net/30q5w5l98nbx/3dxHMGCbo5u1i2V3aL2B9j/5adafd4255924a934dd6e1aa2428b248/Arbys_Menu_Items_and_IngredientsAUG_2026.pdf";

export const arbysCategorySources = Object.freeze([
  ["meals", "Meals"],
  ["limited-time", "Limited Time"],
  ["slow-roasted-beef", "Slow Roasted Beef"],
  ["crispy-juicy-chicken", "Crispy Chicken"],
  ["crafted-sandwiches", "Crafted Sandwiches"],
  ["sides-snacks", "Sides & Snacks"],
  ["desserts", "Desserts"],
  ["beverages", "Beverages"],
  ["kids-menu", "Kids"],
  ["value-menu", "Value Menu"],
]);

const excludedConfigurableShells = new Set([
  "$6 3PC Tenders & 4PC Mozzarella Sticks",
  "Ham Slider Kids Meal",
  "Chicken Tenders 2PC Kids Meal",
  "Roast Beef Slider Kids Meal",
  "Chicken Slider Kids Meal",
]);

const currentGuideOnlyNames = Object.freeze([
  "Angus Cheesesteak",
  "Angus Half Pound Cheesesteak",
  "Sausage Biscuit",
  "Bacon Biscuit",
  "Ham Biscuit",
  "Chicken Biscuit",
  "Bacon, Egg & Cheese Sourdough",
  "Bacon, Egg & Cheese Croissant",
  "Bacon, Egg & Cheese Biscuit",
  "Bacon, Egg & Cheese Wrap",
  "Sausage, Egg & Cheese Sourdough",
  "Sausage, Egg & Cheese Croissant",
  "Sausage, Egg & Cheese Biscuit",
  "Sausage, Egg & Cheese Wrap",
  "Ham, Egg & Cheese Sourdough",
  "Ham, Egg & Cheese Croissant",
  "Ham, Egg & Cheese Biscuit",
  "Ham, Egg & Cheese Wrap",
  "Ham & Swiss Croissant",
  "Bacon & Cheese Croissant",
  "Sausage & Cheese Croissant",
  "French Toast Sticks",
  "Sausage Gravy Biscuit",
  "Sausage Gravy Biscuit-Double",
  "Super Roast Beef",
  "Arby’s Melt",
  "Ham & Swiss Sandwich",
  "Roast Beef Gyro",
]);

const publicNameAliases = new Map(Object.entries({
  "buffalo chicken sandwich": "buffalo chicken",
  "chicken bacon swiss sandwich": "chicken bacon swiss",
  "chicken tenders 2pc": "chicken tenders 2pc",
  "chicken tenders 3pc": "chicken tenders 3pc",
  "chicken tenders 5pc": "chicken tenders 5pc",
  "corned beef reuben": "reuben",
  "crispy chicken sandwich": "crispy chicken",
  "half pound cheesesteak": "angus half pound cheesesteak",
  "honest kids organic apple juice drink": "honest kids apple juice drink",
  "low fat chocolate milk": "lowfat chocolate milk",
  "low fat milk": "lowfat white milk",
  "peach cobbler roll 2pc": "peach cobbler roll",
  "roast turkey ranch bacon sandwich": "turkey ranch bacon sandwich",
  "roast turkey ranch & bacon sandwich": "turkey ranch bacon sandwich",
  "turkey ranch & bacon sandwich": "turkey ranch bacon sandwich",
  "small classic lemonade": "classic lemonade",
  "small strawberry lemonade": "strawberry lemonade",
  "sweet tea": "brewed sweet iced tea",
  "unsweet tea": "brewed unsweet iced tea",
  "bottled water": "nestle pure life bottled water",
  "shamrock farms lowfat white milk": "lowfat white milk",
  "1% lowfat milk": "lowfat white milk",
  "shamrock farms lowfat chocolate milk": "lowfat chocolate milk",
  "1% lowfat chocolate milk": "lowfat chocolate milk",
}));

const noMarkedAllergenKeys = new Set([
  "soft drink",
  "classic lemonade",
  "strawberry lemonade",
  "brewed sweet iced tea",
  "brewed unsweet iced tea",
  "nestle pure life bottled water",
  "tree top applesauce",
  "honest kids apple juice drink",
  "coffee",
  "simply orange juice",
]);

export function parseArbysCategoryPage(html, expectedSlug) {
  const match = String(html).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`Arby's ${expectedSlug} page is missing __NEXT_DATA__.`);
  const pageProps = JSON.parse(match[1])?.props?.pageProps;
  if (pageProps?.selectedCategorySlug !== expectedSlug) {
    throw new Error(`Arby's category mismatch: expected ${expectedSlug}, found ${pageProps?.selectedCategorySlug}.`);
  }
  if (!Array.isArray(pageProps.prerenderItemNames) || !Array.isArray(pageProps.schemaMenuItems)) {
    throw new Error(`Arby's ${expectedSlug} page is missing its pre-rendered catalog.`);
  }
  return {
    names: pageProps.prerenderItemNames,
    caloriesByName: new Map(pageProps.schemaMenuItems.map((item) => [item.name, item.calories])),
  };
}

export function parseArbysNutritionGuide(text) {
  const rows = new Map();
  let category = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = clean(rawLine);
    if (!line) continue;
    if (guideCategory(line)) {
      category = guideCategory(line);
      continue;
    }
    if (!category || !looksLikeProductRow(line)) continue;
    const parsed = parseGuideRow(line, category);
    if (!parsed || /\bAdds\b/i.test(parsed.name)) continue;
    const key = canonicalArbysNameKey(parsed.name);
    const existing = rows.get(key);
    if (!existing) rows.set(key, parsed);
    else {
      existing.allergens = unique([...existing.allergens, ...parsed.allergens]);
      existing.mayContain = unique([...existing.mayContain, ...parsed.mayContain]);
      existing.evidenceText = `${existing.evidenceText} | ${parsed.evidenceText}`;
    }
  }
  return rows;
}

export function parseArbysMenuIngredients(text) {
  // In the official three-column PDF, pdftotext emits the page-three component
  // glossary before it emits the page footer. Stop at the first glossary row,
  // not at the visually later "Page 3" token.
  const menuPages = String(text).split(/\f1% Lowfat Milk:/)[0];
  const rows = new Map();
  let pending = null;
  const flush = () => {
    if (!pending) return;
    const description = clean(pending.description.join(" "));
    if (description) rows.set(canonicalArbysNameKey(pending.name), description);
    pending = null;
  };
  for (const rawLine of menuPages.split(/\r?\n/)) {
    const line = clean(rawLine.replace(/\f/g, ""));
    if (!line) continue;
    const colon = line.indexOf(":");
    const looksLikeEntry = colon > 1 && colon < 82 && !/^Page \d|^Arby’s|^Menu Items/i.test(line);
    if (looksLikeEntry) {
      flush();
      pending = { name: line.slice(0, colon), description: [line.slice(colon + 1)] };
      continue;
    }
    const boundary = /^[A-Z][A-Z’& /-]{3,}$/.test(line) ||
      /^Page \d|^Arby’s|^Menu Items/i.test(line) ||
      (!/[,.]$/.test(line) && !line.includes(",") && /^[A-Z0-9*]/.test(line));
    if (boundary) {
      flush();
      continue;
    }
    if (pending) pending.description.push(line);
  }
  flush();
  return rows;
}

export function buildArbysCatalog(
  { categoryHtmlBySlug, nutritionText, ingredientsText },
  { retrievedAt = new Date().toISOString() } = {},
) {
  const guideRows = parseArbysNutritionGuide(nutritionText);
  const ingredientRows = parseArbysMenuIngredients(ingredientsText);
  const publicRows = [];
  const publishedShells = [];
  for (const [slug, category] of arbysCategorySources) {
    const parsed = parseArbysCategoryPage(categoryHtmlBySlug[slug], slug);
    for (const name of parsed.names) {
      if (category === "Meals" || excludedConfigurableShells.has(name)) {
        publishedShells.push({ name, category, reason: "configurable-bundle" });
        continue;
      }
      publicRows.push({ name, category, calories: parsed.caloriesByName.get(name) ?? null });
    }
  }

  const products = new Map();
  for (const row of publicRows) addProduct(products, row, guideRows, ingredientRows);
  for (const name of currentGuideOnlyNames) {
    const category = guideRows.get(canonicalArbysNameKey(name))?.category;
    if (!category) throw new Error(`Current Arby's guide-only product did not parse: ${name}.`);
    addProduct(products, { name, category, calories: null }, guideRows, ingredientRows);
  }
  for (const name of ["Coffee", "Simply Orange® Juice"]) {
    addProduct(products, { name, category: "Breakfast", calories: null }, guideRows, ingredientRows);
  }

  const items = [...products.values()].map((item, index) => ({
    auditItemKey: `${index + 1}:${item.id}`,
    ...item,
  }));
  return {
    schemaVersion: 1,
    restaurantId: arbysRestaurantId,
    retrievedAt,
    sourceUrls: [
      "https://www.arbys.com/menu/",
      "https://www.arbys.com/nutrition/",
      ...arbysCategorySources.map(([slug]) => `https://www.arbys.com/menu/categories/${slug}/`),
      arbysNutritionUrl,
      arbysIngredientsUrl,
    ],
    publishedCategoryPageCount: arbysCategorySources.length,
    publishedPresentationCount: publicRows.length + publishedShells.length,
    publishedShellCount: publishedShells.length,
    publishedShells,
    guideProductCount: guideRows.size,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialAllergenCount: items.filter((item) => item.allergenSourceType === "official-allergen-menu").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    commonFryerSignalCount: items.filter((item) => item.mayContain.length > 0).length,
    excludedComponentGlossary: true,
    items,
  };
}

function addProduct(products, row, guideRows, ingredientRows) {
  const key = canonicalArbysNameKey(row.name);
  if (products.has(key)) {
    const existing = products.get(key);
    existing.sourceCategories = unique([...existing.sourceCategories, row.category]);
    return;
  }
  const guide = guideRows.get(key);
  const hasReviewedNegativeRow = noMarkedAllergenKeys.has(key);
  const official = Boolean(guide || hasReviewedNegativeRow);
  const ingredientsText = ingredientRows.get(key) ?? null;
  products.set(key, {
    id: slug(row.name),
    name: row.name,
    category: row.category,
    sourceCategories: [row.category],
    description: ingredientsText,
    imageUrl: null,
    ingredientsText,
    nutritionFacts: row.calories == null ? undefined : { Calories: String(row.calories) },
    isConfigurable: false,
    allergens: guide?.allergens ?? [],
    mayContain: guide?.mayContain ?? [],
    allergenSourceType: official ? "official-allergen-menu" : "unavailable",
    sourceType: official ? "restaurant-issued-pdf-matrix" : "restaurant-issued-web-menu",
    sourceUrls: official
      ? [arbysNutritionUrl, ...(ingredientsText ? [arbysIngredientsUrl] : [])]
      : [`https://www.arbys.com/menu/categories/${slugForCategory(row.category)}/`],
    variantGroup: null,
    evidence: [{
      sourceKind: official ? "restaurant-issued-pdf-matrix" : "restaurant-issued-web-menu",
      sourceUrl: official ? arbysNutritionUrl : `https://www.arbys.com/menu/categories/${slugForCategory(row.category)}/`,
      text: guide?.evidenceText ?? `${row.name} is published on Arby's current menu; the current allergen PDF does not provide a matching formulation row.`,
    }],
    sourceSummary: guide
      ? "Fixed major allergens and separately marked common-fryer/facility contact come from Arby's July 2026 U.S. nutrition and allergen guide."
      : hasReviewedNegativeRow
        ? "Arby's current guide publishes this product without a fixed major-allergen or common-contact marker; formulations and locations may vary."
        : "Arby's current website publishes this product, but its July 2026 allergen guide does not provide a matching formulation row.",
  });
}

export function canonicalArbysNameKey(value) {
  let key = normalize(value)
    .replace(/\b(?:small|medium|large|xl)\b/g, "")
    .replace(/\bu\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  key = key.replace(/^chicken tenders ([235])$/, "chicken tenders $1pc");
  if (/^mo+zarella sticks(?: [246])?$/.test(key)) key = "mozzarella sticks";
  if (/^jalapeno bites(?: [58])?$/.test(key)) key = "jalapeno bites";
  if (/^potato cakes(?: [2345])?$/.test(key)) key = "potato cakes";
  if (/^peach cobbler roll(?: [12])?$/.test(key)) key = "peach cobbler roll";
  if (key === "pecan chicken salad") key = "pecan chicken salad sandwich";
  if (key === "classic french dip & swiss au jus") key = "classic french dip & swiss";
  if (key === "chicken bacon swiss" || key === "chicken bacon & swiss") key = "chicken bacon swiss";
  return publicNameAliases.get(key) ?? key;
}

function parseGuideRow(line, category) {
  const markerIndex = firstMarkerIndex(line);
  if (markerIndex < 0) return null;
  const name = clean(line.slice(0, markerIndex).replace(/^[*•]+\s*/, ""));
  if (!name || /^(Serving|Calories|Major food|Menu item|Manufactured)/i.test(name)) return null;
  const fixed = matchAllergens(line.match(/Contains:\s*([^†;\d]+?)(?=\s*(?:;?\s*May [Cc]ontain|†|\d))/)?.[1]);
  const explicitMay = matchAllergens(line.match(/May [Cc]ontain\s*:?[\s/]*([^†\d]+?)(?=\s*(?:†|\d))/)?.[1]);
  const fryer = matchAllergens(line.match(/†\s*([^\d]+?)(?=\s+\d)/)?.[1]);
  const facility = /^\*/.test(line) ? ["peanut", "tree-nut"] : [];
  return {
    name,
    category,
    allergens: fixed,
    mayContain: unique([...explicitMay, ...fryer, ...facility]),
    evidenceText: line.replace(/\s+\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){5,}.*$/, ""),
  };
}

function firstMarkerIndex(line) {
  const indexes = [line.indexOf(" Contains:"), line.indexOf(" †")].filter((index) => index >= 0);
  if (indexes.length > 0) return Math.min(...indexes);
  return -1;
}

function looksLikeProductRow(line) {
  return / Contains:| †/.test(line) && !/Major food|Menu item is cooked|same oil|possible contact/i.test(line);
}

function matchAllergens(value) {
  const ids = [];
  for (const token of String(value ?? "").split(/,|\//)) {
    const normalized = normalize(token).replace(/where available|pecans|may contain|contains/g, "").trim();
    const id = {
      egg: "egg",
      eggs: "egg",
      fish: "fish",
      milk: "milk",
      peanut: "peanut",
      peanuts: "peanut",
      sesame: "sesame",
      soy: "soy",
      soybeans: "soy",
      wheat: "wheat",
      "tree nuts": "tree-nut",
    }[normalized];
    if (id) ids.push(id);
  }
  return unique(ids);
}

function guideCategory(line) {
  return {
    "LIMITED TIME OFFERS": "Limited Time",
    "SLOW ROASTED BEEF": "Slow Roasted Beef",
    "ARBY’S CHEESESTEAKS": "Cheesesteaks",
    "CRISPY CHICKEN": "Crispy Chicken",
    "CRAFTED SANDWICHES": "Crafted Sandwiches",
    "SIGNATURE SIDES": "Sides & Snacks",
    SHAKES: "Desserts",
    "VALUE MENU": "Value Menu",
    "KIDS MENU": "Kids",
    BREAKFAST: "Breakfast",
    "OPTIONAL/REGIONAL": "Optional & Regional",
  }[line] ?? null;
}

function slugForCategory(category) {
  return arbysCategorySources.find(([, label]) => label === category)?.[0] ?? "limited-time";
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/&/g, " & ")
    .replace(/®|™|°|\$/g, "")
    .replace(/[^a-zA-Z0-9%&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function slug(value) {
  return normalize(value).replace(/['%]/g, "").replace(/&/g, "and").replace(/\s+/g, "-");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactDirectory = path.resolve("data/restaurant-verification/artifacts/arbys");
  const categoryHtmlBySlug = Object.fromEntries(await Promise.all(
    arbysCategorySources.map(async ([slug]) => [
      slug,
      await readFile(path.join(artifactDirectory, `official-arbys-menu-${slug}.html`), "utf8"),
    ]),
  ));
  const [nutritionText, ingredientsText] = await Promise.all([
    readFile(path.join(artifactDirectory, "official-arbys-nutrition-allergen-aug-2026.txt"), "utf8"),
    readFile(path.join(artifactDirectory, "official-arbys-ingredients-aug-2026.txt"), "utf8"),
  ]);
  const snapshot = buildArbysCatalog(
    { categoryHtmlBySlug, nutritionText, ingredientsText },
    { retrievedAt: "2026-07-15T09:00:04.402Z" },
  );
  const destination = path.resolve("data/restaurant-verification/repairs/arbys/corrected-menu.json");
  await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    publishedPresentationCount: snapshot.publishedPresentationCount,
    publishedShellCount: snapshot.publishedShellCount,
    guideProductCount: snapshot.guideProductCount,
    officialAllergenCount: snapshot.officialAllergenCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    commonFryerSignalCount: snapshot.commonFryerSignalCount,
  }, null, 2));
}
