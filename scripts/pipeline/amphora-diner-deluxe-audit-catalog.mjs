import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PDFParse } from "pdf-parse";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";

export const restaurantIdAmphora = "osm-amphora-diner-deluxe-152763392";

export const sourceUrlsAmphora = Object.freeze({
  home: "https://amphoragroup.com/amphoras-diner-deluxe/",
  currentPdf: "https://amphoragroup.com/wp-content/uploads/2025/11/DINER-DX-MENU-2025.pdf",
  linkedOrderingMenu: "https://www.fastordernow.com/order/menu/amphoradeluxe",
  hidden2023Pdf: "https://amphoragroup.com/wp-content/uploads/2023/01/FULLMENU-12-23.pdf",
  legacy2021Pdf: "https://amphoragroup.com/wp-content/uploads/2021/03/Amphora-Restaurant-To-Go-Menu-mar2021_online-1.pdf",
});

const artifactPaths = Object.freeze({
  currentPdf: `data/restaurant-verification/artifacts/${restaurantIdAmphora}/official-current-menu-pdf.pdf`,
  linkedOrderingMenu: `data/restaurant-verification/artifacts/${restaurantIdAmphora}/fast-order-current-menu.html`,
});

const categoryNames = new Map([
  ["CHEF'S DAILY SPECIALS", "Chef's Daily Specials"],
  ["AMPHORA BAKERY CAKES AND PIES", "Amphora Bakery Cakes and Pies"],
  ["AMPHORA BAKERY SWEETS", "Amphora Bakery Sweets"],
  ["BREAKFAST FAVORITES", "Breakfast Favorites"],
  ["BREAKFAST MENU ~ EGGS AND OMELETS", "Eggs and Omelets"],
  ["BREAKFAST MENU ~ HEAVENLY HOLLANDAISE", "Heavenly Hollandaise"],
  ["BREAKFAST MENU ~ SOUTH OF THE BORDER", "South of the Border"],
  ["BREAKFAST SANDWICHES", "Breakfast Sandwiches"],
  ["BURGERS AND HOT DOGS", "Burgers and Hot Dogs"],
  ["CREATE YOU OWN DELI CLASSIC", "Create Your Own Deli Classic"],
  ["FROM THE GRIDDLE ~ BELGAIN WAFFLES", "Belgian Waffles"],
  ["FROM THE GRIDDLE ~ FRENCH TOAST", "French Toast"],
  ["FROM THE GRIDDLE ~ PANCAKES", "Pancakes"],
  ["GRAND PLATES - AMPHORA CLASSICS", "Amphora Classics"],
  ["GRAND PLATES - FROM THE BROILER", "From the Broiler"],
  ["GRAND PLATES - MEDITERRANEAN", "Mediterranean"],
  ["GRAND PLATES - SEAFOOD", "Seafood"],
  ["ON THE LIGHTER SIDE", "On the Lighter Side"],
  ["SALADS", "Salads"],
  ["SANDWICHES, WRAPS AND MORE", "Sandwiches, Wraps and More"],
  ["SIDES", "Sides"],
  ["SOUPS & COMBOS", "Soups and Combos"],
  ["STARTERS", "Starters"],
  ["ULTIMATE GRILLED CHEESE", "Ultimate Grilled Cheese"],
  ["YOGURT, CEREAL AND FRESH FRUIT", "Yogurt, Cereal and Fresh Fruit"],
  ["COFFEE, TEA AND BREAKFAST BEVERAGES", "Coffee, Tea and Breakfast Beverages"],
  ["BEVERAGES", "Beverages"],
]);

const categoryOrder = [
  "Chef's Daily Specials",
  "Breakfast Favorites",
  "Eggs and Omelets",
  "Heavenly Hollandaise",
  "South of the Border",
  "Breakfast Sandwiches",
  "Belgian Waffles",
  "French Toast",
  "Pancakes",
  "Yogurt, Cereal and Fresh Fruit",
  "Starters",
  "Soups and Combos",
  "Salads",
  "Sandwiches, Wraps and More",
  "Create Your Own Deli Classic",
  "Ultimate Grilled Cheese",
  "Burgers and Hot Dogs",
  "On the Lighter Side",
  "Amphora Classics",
  "From the Broiler",
  "Mediterranean",
  "Seafood",
  "Sides",
  "Amphora Bakery Cakes and Pies",
  "Amphora Bakery Sweets",
  "Shakes and Sundaes",
  "Breakfast Beverages",
  "Coffee, Tea and Breakfast Beverages",
  "Beverages",
];

const officialOnlyItems = new Map(Object.entries({
  "Amphora’s Pick 2": {
    name: "Amphora’s Pick 2",
    category: "Soups and Combos",
    description: "Half triple-decker sandwich with a cup of soup or a side garden salad.",
    options: [
      {
        id: "official-pdf-pick-2-side",
        name: "Soup or Salad Choice",
        inputType: "one_of",
        required: true,
        maximumSelections: 1,
        choices: [
          { id: "cup-of-soup", name: "Cup of Soup", price: 0, outOfStock: false },
          { id: "side-garden-salad", name: "Side Garden Salad", price: 0, outOfStock: false },
          { id: "chili", name: "Substitute Chili", price: 1.5, outOfStock: false },
          { id: "caesar-salad", name: "Substitute Caesar Salad", price: 2.95, outOfStock: false },
          { id: "greek-salad", name: "Substitute Greek Salad", price: 2.95, outOfStock: false },
        ],
      },
      {
        id: "official-pdf-pick-2-add-on",
        name: "Optional Add-on",
        inputType: "any",
        required: false,
        maximumSelections: 3,
        choices: [
          { id: "sour-cream", name: "Sour Cream", price: 2.25, outOfStock: false },
          { id: "cheddar-cheese", name: "Cheddar Cheese", price: 2.25, outOfStock: false },
          { id: "onions", name: "Onions", price: 2.25, outOfStock: false },
        ],
      },
    ],
  },
  "Spiced Chai Latte": { name: "Spiced Chai Latte", category: "Beverages" },
  "Classic Mimosa or Bellini": { name: "Classic Mimosa or Bellini", category: "Breakfast Beverages" },
  "Irish Coffee": { name: "Irish Coffee", category: "Breakfast Beverages" },
  "Amphora Bloody Mary": { name: "Amphora Bloody Mary", category: "Breakfast Beverages" },
  "Baklava Pancakes": { name: "Baklava Pancakes", category: "Pancakes" },
  "Goat Cheese and Sun Dried Tomato Omelet": { name: "Goat Cheese and Sun Dried Tomato Omelet", category: "Eggs and Omelets" },
  "Breakfast Panini": { name: "Breakfast Panini", category: "Breakfast Sandwiches" },
  "Amphora's Greek Nacho Platter": { name: "Amphora's Greek Nacho Platter", category: "Starters" },
  "New York Strip Sandwich Platter": { name: "New York Strip Sandwich Platter", category: "Sandwiches, Wraps and More" },
  "Coconut Cream Pie": { name: "Coconut Cream Pie", category: "Amphora Bakery Cakes and Pies" },
  "Carrot Cake": { name: "Carrot Cake", category: "Amphora Bakery Cakes and Pies" },
  "Classic Vanilla Shake": { name: "Classic Vanilla Shake", category: "Shakes and Sundaes" },
  "Classic Chocolate Shake": { name: "Classic Chocolate Shake", category: "Shakes and Sundaes" },
  "Strawberry Milk Shake": { name: "Strawberry Milk Shake", category: "Shakes and Sundaes" },
  "Turtle Fudge Shake with Caramel and Chocolate": { name: "Turtle Fudge Shake with Caramel and Chocolate", category: "Shakes and Sundaes" },
  "Peanut Butter Cup Shake": { name: "Peanut Butter Cup Shake", category: "Shakes and Sundaes" },
  "Chocolate Peanut Butter Shake": { name: "Chocolate Peanut Butter Shake", category: "Shakes and Sundaes" },
  "Tripe Chip Shake": { name: "Tripe Chip Shake", category: "Shakes and Sundaes" },
  "Classic Banana Split": { name: "Classic Banana Split", category: "Shakes and Sundaes" },
  "Hot Fudge Sundae": { name: "Hot Fudge Sundae", category: "Shakes and Sundaes" },
  "Triple Chocolate Split": { name: "Triple Chocolate Split", category: "Shakes and Sundaes" },
  "Candy Sundae": { name: "Candy Sundae", category: "Shakes and Sundaes" },
  "S'mores Sundae": { name: "S'mores Sundae", category: "Shakes and Sundaes" },
}).map(([sourceName, item]) => [normalize(sourceName), item]));

const canonicalNames = new Map([
  [normalize("Cappucino"), "Cappuccino"],
  [normalize("Create Your Own Omelete"), "Create Your Own Omelet"],
  [normalize("Omelete Lorraine"), "Omelet Lorraine"],
  [normalize("Heuvos Rancheros"), "Huevos Rancheros"],
  [normalize("Mexican Cheeseteak Sub"), "Mexican Cheesesteak Sub"],
  [normalize("Chicken Piccatta Pasta"), "Chicken Piccata Pasta"],
  [normalize("Chocolate Waffle  Deluxe"), "Chocolate Waffle Deluxe"],
  [normalize("Lavazza Coffee (Regular & Decaf)"), "Lavazza Coffee"],
  [normalize("CAFE TORTUGA WITH CARAMEL AND CHOCOLATE"), "Cafe Tortuga with Caramel and Chocolate"],
  [normalize("CRISPY SOUTHERN FRIED CHICKEN AND WAFFLE"), "Crispy Southern Fried Chicken and Waffles"],
  [normalize("Fried Chicken and Waffles"), "Crispy Southern Fried Chicken and Waffles"],
]);

const officialAliases = new Map(Object.entries({
  "Blueberry Cheesecake": "Blueberry or Cherry Cheesecake",
  "Cherry Cheesecake": "Blueberry or Cherry Cheesecake",
  "Bread Pudding": "Warm Traditional Bread Pudding",
  "Cranberry Juice": "Juice",
  "Florida Orange Juice": "Juice",
  "Pineapple Juice": "Juice",
  "Tomato Juice": "Juice",
  "Grapefruit Juice": "Juice",
  "Apple Juice": "Juice",
  "Ice Tea": "Ice Tea (Unsweetened)",
  "Cafe Tortuga with Caramel and Chocolate": "Cafe Tortuga (Caramel and Chocolate)",
  "Assorted Hot Teas": "Assorted Hot Tea",
  "Lavazza Coffee (Regular & Decaf)": "Lavazza Coffee",
  "Country Sausage Frittata": "Country Sausage Fritatta",
  "Country Style Biscuits with Sausage Gravy": "Flaky Biscuits with Sausage Gravy",
  "Hamburger Steak & Eggs": "Hamburger or Garden Burger Steak And Eggs",
  "Vegetable Hash and Eggs": "Mediterranean Vegetable Hash and Eggs",
  "Two Eggs, with Ham, Bacon or Sausage": "Two Eggs, Any Style",
  "Meat lover's Omelet": "Meatlovers Omelet",
  "Huevos Rancheros": "Classic Huevos Rancheros",
  "Crispy Southern Fried Chicken and Waffles": "Crispy Southern Fried Chicken and Waffles",
  "Our Homemade Brioche French Toast": "Brioche French Toast",
  "Roast Turkey": "Roast Turkey Dinner",
  "Broiled New York Sirloin Steak 10 oz": "New York Sirloin Steak 10 oz",
  "Chicken Piccata Pasta": "Chicken Piccata Pasta",
  "Pan Seared Salmon Filet with an Artichoke Cream Sauce": "Pan Seared Salmon Filet",
  "Jumbo Shrimp Broiled": "Jumbo Shrimp Served Broiled Or Fried",
  "Jumbo Shrimp Fried": "Jumbo Shrimp Served Broiled Or Fried",
  "Grecian Style Salmon": "Pan Seared Salmon Filet",
  "Chicken Fajita Salad": "Chicken or Beef Fajita Salad",
  "Beef Fajita Salad": "Chicken or Beef Fajita Salad",
  "Spartan Salad": "Spartan Chopped Salad",
  "Hot Open Face Turkey": "Freshly Roasted Sliced Turkey Breast",
  "Classic Albacore Tuna Salad Sandwich": "Classic Albacore Tuna Or Chicken Salad Sandwich",
  "Chicken Salad Sandwich": "Classic Albacore Tuna Or Chicken Salad Sandwich",
  "Chicken Salad and Bacon Club": "Chicken Salad or Tuna Salad and Bacon",
  "Tuna Salad and Bacon Club": "Chicken Salad or Tuna Salad and Bacon",
  "Ham, Roast Turkey and Swiss Club": "Virginia Ham, Roast Turkey & Swiss",
  "Hot Open Face Roast Beef": "Freshly Roasted Sliced Roast Beef",
  "Amphora’s Beef Chili (Cup)": "Amphora’s Beef Chili",
  "Hot Spinach Artichoke Dip": "Hot Spinach & Artichoke Dip",
  "Chicken or Beef Quesadilla": "Chicken Fajita Quesadilla",
  "Tex Mex Egg Rolls": "Tex Mex Chicken Egg Rolls",
  "Chili Cheese Fries": "Chili or Bacon Cheese Fries",
  "Chicken Wings (10)": "Buffalo or BBQ Chicken Wings (10)",
  "Appetizer Classic Sampler": "Appetizer Classics Sampler",
}).map(([current, official]) => [normalize(current), official]));

const manualOfficialMatches = new Map([
  [normalize("Amphora’s Pick 2"), { pageNumber: 14, start: "Half Triple Decker Sandwich", end: "Entree Salads" }],
  [normalize("Create Your Own Omelet"), { pageNumber: 8, start: "Create Your Own Omelet", end: "*These Items May be Cooked to Order" }],
  [normalize("One Meat"), { pageNumber: 19, start: "Choose Your Cheese", end: "Wraps and more" }],
  [normalize("Two Meats"), { pageNumber: 19, start: "Choose Your Cheese", end: "Wraps and more" }],
  [normalize("Three Meats"), { pageNumber: 19, start: "Choose Your Cheese", end: "Wraps and more" }],
]);

const allergenOrder = [
  "milk",
  "peanut",
  "tree-nut",
  "egg",
  "fish",
  "shellfish",
  "wheat",
  "gluten",
  "soy",
  "sesame",
  "mustard",
  "sulfites",
];

export async function buildAmphoraAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  orderingHtml,
  pdfData,
} = {}) {
  const [resolvedOrderingHtml, resolvedPdfData, manifest] = await Promise.all([
    orderingHtml ?? readFile(artifactPaths.linkedOrderingMenu, "utf8"),
    pdfData ?? readFile(artifactPaths.currentPdf),
    getDefaultIngredientIntelligenceManifest(),
  ]);
  const ordering = extractFastOrderMenu(resolvedOrderingHtml);
  const officialPdf = await extractOfficialPdfEvidence(resolvedPdfData);

  const grouped = new Map();
  for (const presentation of ordering.presentations) {
    const name = canonicalizeName(presentation.name);
    const key = normalize(name);
    const current = grouped.get(key) ?? { name, presentations: [] };
    current.presentations.push({ ...presentation, name });
    grouped.set(key, current);
  }
  for (const candidate of officialPdf.candidates) {
    const specification = officialOnlyItems.get(candidate.normalizedName);
    if (!specification) continue;
    const key = normalize(specification.name);
    const current = grouped.get(key) ?? { name: specification.name, presentations: [] };
    current.presentations.push({
      presentationId: `official-pdf-${candidate.pageNumber}-${slugify(specification.name)}`,
      name: specification.name,
      category: specification.category,
      description: specification.description ?? candidate.description,
      price: candidate.price ?? null,
      outOfStock: false,
      imageUrl: null,
      options: specification.options ?? [],
      sourceKind: "restaurant-issued-current-pdf-menu",
      sourceUrl: sourceUrlsAmphora.currentPdf,
    });
    grouped.set(key, current);
  }

  const items = [...grouped.values()].map((group) => {
    const presentations = [...group.presentations].sort(comparePresentations);
    const preferred = presentations.find((entry) => entry.description) ?? presentations[0];
    const orderingPresentations = presentations.filter((entry) =>
      entry.sourceKind !== "restaurant-issued-current-pdf-menu"
    );
    const hasOrderingPresentation = orderingPresentations.length > 0;
    const officialMatch = matchOfficialEvidence(group.name, officialPdf);
    const officialAllergens = officialMatch
      ? directOfficialAllergensForItem(group.name, officialMatch.text)
      : [];
    const hasOfficialSignals = officialAllergens.length > 0;
    const description = preferred.description ?? officialMatch?.description ?? null;
    const ingredientsText = preferred.description ?? officialMatch?.description ?? null;
    const base = {
      auditItemKey: "",
      id: slugify(group.name),
      name: group.name,
      category: preferred.category,
      description,
      ingredientsText,
      price: preferred.price,
      imageUrl: null,
      isConfigurable: presentations.some((entry) => entry.options.length > 0),
      allergenSourceType: hasOfficialSignals ? "official-ingredients" : "unavailable",
      allergens: officialAllergens,
      mayContain: [],
      sourceType: officialMatch && hasOrderingPresentation
        ? "reviewed-current-official-pdf-and-linked-ordering-menu"
        : officialMatch
          ? "reviewed-current-official-pdf-menu"
        : "reviewed-restaurant-linked-ordering-menu",
      sourceUrls: officialMatch
        ? [sourceUrlsAmphora.home, sourceUrlsAmphora.currentPdf, ...(hasOrderingPresentation ? [sourceUrlsAmphora.linkedOrderingMenu] : [])]
        : [sourceUrlsAmphora.home, sourceUrlsAmphora.linkedOrderingMenu],
      sourceSummary: hasOfficialSignals
        ? "Direct positive ingredient or unambiguous formulation terms in Amphora's current restaurant-issued menu support these allergen signals. The document is not an allergen matrix, does not establish absence of other allergens, and its repeated raw-food advisory is not item-level allergen or cross-contact evidence. Configurable choices can change the formulation."
        : officialMatch
          ? "Amphora's current restaurant-issued menu supports this formulation but supplies no direct positive allergen term that can be safely represented as an item-level claim. It is not an allergen matrix; official allergen and cross-contact data remain unavailable, while menu clues stay separately labeled as Ingredient Intelligence."
          : "Amphora's current exact-address linked ordering catalog supports this formulation, but linked-vendor descriptions are not promoted to restaurant-issued allergen claims. Official allergen and cross-contact data remain unavailable, while menu clues stay separately labeled as Ingredient Intelligence.",
      presentationCount: presentations.length,
      presentations: presentations.map((entry) => ({
        presentationId: entry.presentationId,
        category: entry.category,
        price: entry.price,
        outOfStock: entry.outOfStock,
        options: entry.options,
        sourceKind: entry.sourceKind ?? "restaurant-linked-ordering-menu",
        sourceUrl: entry.sourceUrl ?? sourceUrlsAmphora.linkedOrderingMenu,
      })),
      evidence: [
        ...(officialMatch ? [{
          sourceKind: "reviewed-current-official-pdf-menu-text",
          sourceUrl: sourceUrlsAmphora.currentPdf,
          pageNumber: officialMatch.pageNumber,
          text: officialMatch.text,
        }] : []),
        ...orderingPresentations.map((entry) => ({
          sourceKind: "restaurant-linked-ordering-menu-text",
          sourceUrl: sourceUrlsAmphora.linkedOrderingMenu,
          text: `${entry.name}${entry.description ? `: ${entry.description}` : ""}${entry.outOfStock ? " [sold out]" : ""}`,
          vendorItemId: entry.presentationId,
        })),
      ],
    };
    return annotateMenuItemWithIngredientIntelligence(base, { manifest });
  }).sort((left, right) =>
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
    left.name.localeCompare(right.name),
  );

  items.forEach((item, index) => {
    item.auditItemKey = `${index + 1}:${item.id}`;
  });

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmphora,
    retrievedAt,
    sourceUrls: [sourceUrlsAmphora.home, sourceUrlsAmphora.currentPdf, sourceUrlsAmphora.linkedOrderingMenu],
    currentStore: ordering.store,
    sourceCategoryCount: ordering.categoryCount,
    currentOrderingPresentationCount: ordering.presentations.length,
    currentOfficialOnlyPresentationCount: [...grouped.values()].reduce(
      (sum, group) => sum + group.presentations.filter((entry) =>
        entry.sourceKind === "restaurant-issued-current-pdf-menu"
      ).length,
      0,
    ),
    currentPresentationCount: items.reduce((sum, item) => sum + item.presentationCount, 0),
    currentSoldOutPresentationCount: ordering.presentations.filter((item) => item.outOfStock).length,
    configurablePresentationCount: ordering.presentations.filter((item) => item.options.length > 0).length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    duplicatePresentationCount: items.reduce((sum, item) => sum + item.presentationCount, 0) - items.length,
    officialPdfPageCount: officialPdf.pageCount,
    officialPdfMetadata: {
      creationDate: officialPdf.metadata?.CreationDate ?? null,
      modificationDate: officialPdf.metadata?.ModDate ?? null,
      creator: officialPdf.metadata?.Creator ?? null,
    },
    officialPdfMatchedItemCount: items.filter((item) => item.sourceType.includes("official-pdf")).length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    itemNameFingerprint: createHash("sha256")
      .update(items.map((item) => normalize(item.name)).sort().join("\n"))
      .digest("hex"),
    sourceWarning: "The current restaurant page prominently links a 33-page full menu and the exact-address FastOrder catalog. The PDF is a dish-description menu, not an allergen matrix. Its raw-food advisory is repeated across food pages and is never promoted to item allergens or may-contain data. The current ordering catalog is used for complete operational coverage; linked-vendor-only descriptions remain non-official. A hidden 2023 PDF and the separately linked 2021 takeout PDF are retained only as source history and do not override the current menu. All live presentations are preserved, duplicate formulations are consolidated, and beverage categories are placed last.",
    items,
  };
}

export function extractFastOrderMenu(html) {
  const vendor = parseWindowAssignment(html, "vendorData");
  if (vendor.code !== "amphoradeluxe") throw new Error(`Unexpected FastOrder vendor code: ${vendor.code}`);
  if (normalize(vendor.address) !== normalize("1151 Elden Street, Herndon, VA")) {
    throw new Error(`Unexpected FastOrder address: ${vendor.address}`);
  }
  const presentations = vendor.menu_categories.flatMap((category) => {
    const rawCategory = cleanText(category.name);
    const mappedCategory = categoryNames.get(rawCategory);
    if (!mappedCategory) throw new Error(`Unmapped Amphora category: ${rawCategory}`);
    return category.items.map((item) => ({
      presentationId: String(item.id),
      name: cleanText(item.name),
      category: mappedCategory,
      description: cleanText(item.description) || null,
      price: Number.isFinite(item.price) ? item.price : null,
      outOfStock: Boolean(item.is_sold_out),
      imageUrl: cleanText(item.image_url) || null,
      options: (item.options ?? []).map((option) => ({
        id: String(option.id),
        name: cleanText(option.name),
        inputType: option.input_type,
        required: Boolean(option.is_required),
        maximumSelections: option.max_allowed_selection,
        choices: (option.option_labels ?? []).filter((choice) => !choice.is_informational).map((choice) => ({
          id: String(choice.id),
          name: cleanText(choice.name),
          price: Number.isFinite(choice.price) ? choice.price : null,
          outOfStock: Boolean(choice.is_sold_out),
        })),
      })),
    }));
  });
  return {
    store: {
      vendorCode: vendor.code,
      name: vendor.name,
      address: vendor.address,
      phone: cleanText(vendor.phone),
      currentDateTime: vendor.currentDateTime,
    },
    categoryCount: vendor.menu_categories.length,
    presentations,
  };
}

export async function extractOfficialPdfEvidence(data) {
  const parser = new PDFParse({ data });
  try {
    const text = await parser.getText();
    const info = await parser.getInfo();
    const candidates = [];
    for (const page of text.pages) candidates.push(...extractPageCandidates(page));
    return {
      pageCount: text.pages.length,
      pages: text.pages,
      candidates,
      metadata: info.info,
    };
  } finally {
    await parser.destroy();
  }
}

function extractPageCandidates(page) {
  const lines = page.text.split(/\r?\n/).map(cleanText).filter(Boolean);
  const candidates = [];
  let current = null;
  for (const line of lines) {
    const parsed = parseMenuPriceLine(line);
    if (parsed) {
      if (current) candidates.push(finishCandidate(current));
      current = { pageNumber: page.num, name: parsed.name, price: parsed.price ?? null, line, descriptionLines: [] };
      continue;
    }
    if (!current) continue;
    if (/^\*?These Items May be Cooked to Order/i.test(line)) {
      candidates.push(finishCandidate(current));
      current = null;
      continue;
    }
    if (isSharedBoundaryLine(line)) {
      candidates.push(finishCandidate(current));
      current = null;
      continue;
    }
    if (normalize(current.name) === normalize("Magic Bar") && /^with Vanilla Bean Custard/i.test(line)) {
      continue;
    }
    if (/^(customer favorite|AUG(?:UST)?[- ]?2025|APR(?:IL)? 2024)/i.test(line)) continue;
    if (current.descriptionLines.length < 4 && !looksLikeHeading(line)) current.descriptionLines.push(line);
  }
  if (current) candidates.push(finishCandidate(current));
  return candidates;
}

function finishCandidate(candidate) {
  const description = cleanText(candidate.descriptionLines.join(" ")) || null;
  return {
    pageNumber: candidate.pageNumber,
    name: candidate.name,
    price: candidate.price,
    normalizedName: normalize(candidate.name),
    description,
    text: cleanText(`${candidate.line}${description ? ` ${description}` : ""}`),
  };
}

function parseMenuPriceLine(line) {
  const amphoraPick = line.match(/^(Amphora[’']s Pick 2)\s+\$15\.25$/i);
  if (amphoraPick) return { name: amphoraPick[1], price: 15.25 };
  if (!/(?:\.{2,}|…)/.test(line) || !/\d/.test(line)) return null;
  const name = cleanText(line.split(/\.{2,}|…/)[0]).replace(/\*+$/, "").trim();
  if (!name || name.length < 3 || /^(Add |Substitute )/i.test(name)) return null;
  return { name };
}

function matchOfficialEvidence(currentName, officialPdf) {
  const key = normalize(currentName);
  const manual = manualOfficialMatches.get(key);
  if (manual) {
    const page = officialPdf.pages.find((entry) => entry.num === manual.pageNumber);
    if (!page) throw new Error(`Missing official PDF page ${manual.pageNumber} for ${currentName}`);
    const lines = page.text.split(/\r?\n/).map(cleanText).filter(Boolean);
    const start = lines.findIndex((line) => normalize(line).includes(normalize(manual.start)));
    const end = lines.findIndex((line, index) => index > start && normalize(line).includes(normalize(manual.end)));
    if (start < 0) throw new Error(`Missing manual PDF start '${manual.start}' for ${currentName}`);
    const text = cleanText(`${currentName}. ${lines.slice(start, end > start ? end : start + 30).join(" ")}`);
    return { pageNumber: page.num, name: currentName, description: text, text };
  }
  const officialName = officialAliases.get(key) ?? currentName;
  const matches = officialPdf.candidates.filter((candidate) =>
    candidate.normalizedName === normalize(officialName),
  );
  if (!matches.length) return null;
  if (currentName === "Grecian Style Salmon") return matches[1] ?? matches[0];
  return matches[0];
}

function directOfficialAllergens(text) {
  const value = normalize(text);
  const allergens = [];
  const add = (allergen, pattern) => {
    if (pattern.test(value)) allergens.push(allergen);
  };
  const milkText = value.replace(/\b(?:peanut|almond|cashew|sunflower) butter\b/g, "nut spread");
  if (/\b(?:milk|buttermilk|butter|buttery|buttered|buttercream|cheese|cheeses|cheesecake|cheddar|swiss|provolone|mozzarella|feta|monterey jack|monterrey jack|pepper jack|goat cheese|blue cheese|cream|creamy|sour cream|whipped cream|cream cheese|cottage cheese|mascarpone|yogurt|tzatziki|custard|ice cream|alfredo|bechamel)\b/.test(milkText)) allergens.push("milk");
  add("peanut", /\b(?:peanut|peanuts)\b/);
  add("tree-nut", /\b(?:walnut|walnuts|pecan|pecans)\b/);
  add("egg", /\b(?:egg|eggs|omelet|omelets|frittata|fritatta)\b/);
  add("fish", /\b(?:fish|salmon|cod|tuna|anchovy|anchovies|lox)\b/);
  add("shellfish", /\b(?:shrimp|calamari)\b/);
  add("wheat", /\bwheat\b/);
  if (allergens.includes("wheat")) allergens.push("gluten");
  add("soy", /\bsoy\b/);
  add("sesame", /\bsesame\b/);
  add("mustard", /\bmustard\b/);
  add("sulfites", /\bsulfites?\b/);
  return orderedAllergens(allergens);
}

function directOfficialAllergensForItem(name, text) {
  const combinedText = `${name}. ${text}`;
  const sanitizedText = name === "Tex Mex Egg Rolls"
    ? combinedText.replace(/egg rolls?/gi, "rolls")
    : combinedText;
  const allergens = directOfficialAllergens(sanitizedText);
  if (name === "Amphora’s Pick 2") return [];
  if (name === "Create Your Own Omelet") return ["egg"];
  if (["One Meat", "Two Meats", "Three Meats"].includes(name)) return [];
  if (["Chicken Salad Sandwich", "Chicken Salad and Bacon Club"].includes(name)) {
    return allergens.filter((allergen) => allergen !== "fish");
  }
  return allergens;
}

function parseWindowAssignment(html, variableName) {
  const marker = `window.${variableName} = `;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const valueStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = valueStart; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return JSON.parse(html.slice(valueStart, index + 1));
  }
  throw new Error(`Unterminated ${marker}`);
}

function comparePresentations(left, right) {
  const leftSpecial = left.category === "Chef's Daily Specials" ? 1 : 0;
  const rightSpecial = right.category === "Chef's Daily Specials" ? 1 : 0;
  const leftBeverage = left.category === "Beverages" ? 0 : 1;
  const rightBeverage = right.category === "Beverages" ? 0 : 1;
  return leftSpecial - rightSpecial || leftBeverage - rightBeverage ||
    Number(!left.description) - Number(!right.description) || Number(left.presentationId) - Number(right.presentationId);
}

function canonicalizeName(value) {
  const cleaned = cleanText(value);
  const corrected = canonicalNames.get(normalize(cleaned));
  if (corrected) return corrected;
  return cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned) ? titleCase(cleaned) : cleaned;
}

function titleCase(value) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function looksLikeHeading(value) {
  const compact = value.replace(/[^A-Za-z]/g, "");
  return compact.length > 3 && compact === compact.toUpperCase() && !/[,.]/.test(value);
}

function isSharedBoundaryLine(value) {
  return /^(?:Add |Substitute |Perk Up|Fluffy, Golden and Made from Scratch|Eggs & Omelets|Sandwiches & Favorites|Tempting Just for Starters|\*\*?Add ons only apply|F a m o u s|Wraps and more|Choose Your Accompaniment|Fresh Catch|Cakes from|Pastries, Cookies & Bars|Served with Coleslaw and a Pickle and your choice)/i.test(value);
}

function orderedAllergens(values) {
  return [...new Set(values)].sort(
    (left, right) => allergenOrder.indexOf(left) - allergenOrder.indexOf(right),
  );
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmphora}/corrected-menu.json`,
  );
  const snapshot = await buildAmphoraAuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    itemCount: snapshot.itemCount,
    currentPresentationCount: snapshot.currentPresentationCount,
    categoryCount: snapshot.categoryCount,
    officialPdfMatchedItemCount: snapshot.officialPdfMatchedItemCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
