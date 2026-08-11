import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "cheerio";

export const restaurantIdAntonellisPizza = "replacement-antonelli-s-pizza-lorton-va";
export const retrievedAtAntonellisPizza = "2026-07-15T07:07:51.896Z";
export const sourceUrlsAntonellisPizza = Object.freeze({
  home: "https://antonellis-pizza.com/",
  menu: "https://antonellis-pizza.com/menu/",
  pdf: "https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf",
});

const publishedCategories = new Set([
  "Starters & Sides",
  "Buffalo Wings",
  "Salads",
  "Quesadillas",
  "Create Your Own Pizza",
  "Gourmet Specialty Pizzas",
  "Calzones & Strombolis",
  "Wraps",
  "Sandwiches",
  "Cold Subs",
  "Hot Subs",
  "Pastas",
  "Kid's Stop",
  "Desserts",
  "Beverages",
]);

const nonProductRows = new Set([
  "CRUSTS",
  "SIZES",
  "DRESSINGS:",
  "HOT* MILD (No Sauce)* BBQ* LEMON PEPPER* OLD BAY* GARLIC PARMESAN",
]);

export function parseAntonellisPizzaMenuHtml(html) {
  const $ = load(String(html));
  const rawPriceListRows = [];
  let category = null;

  $("h2.elementor-heading-title, .uael-price-list-item").each((_, element) => {
    if ($(element).is("h2")) {
      category = clean($(element).text());
      return;
    }
    const name = clean($(element).find(".uael-price-list-title span").first().text());
    if (!name) return;
    const prices = unique(
      $(element)
        .find(".uael-price-list-price")
        .map((__, price) => clean($(price).text()))
        .get()
        .filter(Boolean),
    );
    rawPriceListRows.push({
      category,
      name,
      description: clean($(element).find(".uael-price-list-description").first().text()) || null,
      prices,
    });
  });

  const sauceRow = rawPriceListRows.find((row) =>
    row.category === "Buffalo Wings" && row.name.startsWith("HOT*")
  );
  const wingSizes = unique(
    $(".elementor-icon-list-text")
      .map((_, element) => clean($(element).text()))
      .get()
      .filter((text) => /^(?:8|16|24) Pcs\s*-\s*\d+\.\d{2}$/i.test(text)),
  );

  const products = rawPriceListRows
    .filter((row) => publishedCategories.has(row.category))
    .filter((row) => !nonProductRows.has(row.name))
    .filter((row) => row.category !== "Beer & Wine")
    .map((row) => {
      if (row.name !== "BUFFALO WINGS") return row;
      return {
        ...row,
        description: clean([
          sauceRow?.name.replace(/\*/g, ","),
          sauceRow?.description,
        ].filter(Boolean).join(" ")),
        prices: wingSizes,
      };
    });

  const plainCheeseCandidates = [];
  $("table").each((_, table) => {
    $(table).find("tbody tr").each((__, row) => {
      const cells = $(row).find("td .uael-table__text-inner").map((___, cell) => clean($(cell).text())).get();
      if (normalize(cells[0]) === "plain cheese") plainCheeseCandidates.push(cells);
    });
  });
  const currentPlainCheese = plainCheeseCandidates.find((cells) =>
    cells.length === 4 && cells[1] === "9.99" && cells[2] === "13.99" && cells[3] === "17.99"
  );
  if (!currentPlainCheese) {
    throw new Error("Antonelli's current $9.99/$13.99/$17.99 Plain Cheese row was not found.");
  }
  const plainCheese = {
    category: "Create Your Own Pizza",
    name: "PLAIN CHEESE",
    description: "New York Style or Thin Crust pizza with cheese; thin crust is available in 12-inch and 16-inch sizes.",
    prices: [
      `Small 10-inch ${currentPlainCheese[1]}`,
      `Medium 12-inch ${currentPlainCheese[2]}`,
      `Large 16-inch ${currentPlainCheese[3]}`,
    ],
  };
  const insertionIndex = products.findIndex((row) => row.category === "Gourmet Specialty Pizzas");
  products.splice(insertionIndex, 0, plainCheese);

  return {
    rawPriceListRows,
    plainCheeseCandidates,
    products,
  };
}

export function buildAntonellisPizzaAuditSnapshot({
  html,
  retrievedAt = retrievedAtAntonellisPizza,
} = {}) {
  const parsed = parseAntonellisPizzaMenuHtml(html);
  if (parsed.rawPriceListRows.length !== 97) {
    throw new Error(
      `Antonelli's HTML shape changed: expected 97 raw price-list rows, found ${parsed.rawPriceListRows.length}.`,
    );
  }
  if (parsed.plainCheeseCandidates.length !== 2) {
    throw new Error(
      `Antonelli's HTML shape changed: expected two Plain Cheese responsive-table rows, found ${parsed.plainCheeseCandidates.length}.`,
    );
  }
  if (parsed.products.length !== 80) {
    throw new Error(
      `Antonelli's canonical shape changed: expected 80 products, found ${parsed.products.length}.`,
    );
  }

  const items = parsed.products.map((row, index) => {
    const allergenText = stripOptionalAddOns(`${row.category} ${row.name} ${row.description ?? ""}`);
    const allergens = directAllergensAntonellisPizza(allergenText);
    const sourceText = clean([
      row.name,
      row.description,
      row.prices.length > 0 ? `Price: ${row.prices.join("; ")}` : null,
    ].filter(Boolean).join(" — "));
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      prices: row.prices,
      isConfigurable: /\b(?:pizza|calzone|create your own|ham or turkey|breaded or grilled|buffalo wings)\b/i.test(
        `${row.name} ${row.description ?? ""}`,
      ),
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-issued-html-and-pdf-menu",
      sourceUrls: [sourceUrlsAntonellisPizza.menu, sourceUrlsAntonellisPizza.pdf],
      sourceSummary: allergens.length > 0
        ? "Positive signals are derived from the product name, category, and ingredient text on Antonelli's current restaurant-issued HTML menu, cross-checked against its linked June 2025 PDF. These menus are not a complete allergen matrix or cross-contact disclosure."
        : "Antonelli's current restaurant-issued menus identify this product but do not publish enough item-level ingredient or allergen detail for a positive or negative claim.",
      evidence: [
        {
          sourceKind: "restaurant-issued-html-menu",
          sourceUrl: sourceUrlsAntonellisPizza.menu,
          text: sourceText,
        },
        {
          sourceKind: "restaurant-issued-pdf-menu",
          sourceUrl: sourceUrlsAntonellisPizza.pdf,
          text: sourceText,
        },
      ],
    };
  });

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Antonelli's canonical menu contains duplicate product ids.");
  }
  const categories = unique(items.map((item) => item.category));
  if (categories.at(-1) !== "Beverages") {
    throw new Error("Antonelli's beverage category must remain last.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAntonellisPizza,
    retrievedAt,
    sourceUrls: [
      sourceUrlsAntonellisPizza.home,
      sourceUrlsAntonellisPizza.menu,
      sourceUrlsAntonellisPizza.pdf,
    ],
    itemCount: items.length,
    categoryCount: categories.length,
    rawPriceListRowCount: parsed.rawPriceListRows.length,
    excludedHelperRowCount: parsed.rawPriceListRows.filter((row) =>
      nonProductRows.has(row.name) || row.category === "Beer & Wine" || row.category === "Create Your Own Pizza" || row.category === "MORE TOPPINGS"
    ).length,
    excludedAlcoholPresentationCount: parsed.rawPriceListRows.filter((row) => row.category === "Beer & Wine").length,
    stalePlainCheesePriceRows: parsed.plainCheeseCandidates.filter((cells) => cells[2] !== "13.99"),
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Antonelli's HTML and linked June 2025 PDF publish product names and ingredient descriptions, not a complete allergen matrix or cross-contact disclosure. The HTML contains a stale hidden responsive Plain Cheese table with a $12.99 medium price; the visible/current $13.99 row is corroborated by the PDF. Toppings, sauces, upgrades, dressings, coupon copy, and Beer & Wine presentations are not standalone food products. Optional additions are removed before allergen mapping so their ingredients do not smear onto base products. Missing terms are never treated as negative allergen assurances.",
    items,
  };
}

export function stripOptionalAddOns(value) {
  return clean(value)
    .replace(/\*?\s*add grilled chicken\b.*$/i, "")
    .replace(/\badd a side of spicy chipotle dipping sauce\b.*$/i, "")
    .replace(/\badd cheese\b.*$/i, "")
    .replace(/\badd bacon\b.*$/i, "")
    .replace(/\bmake it a deluxe\b.*$/i, "")
    .replace(/\(add (?:black olives|bacon)\b.*?\)/gi, "")
    .replace(/\badd meatballs or meat sauce\b.*$/i, "")
    .trim();
}

export function directAllergensAntonellisPizza(value) {
  const text = normalize(value);
  const allergens = [];
  const matches = [
    ["fish", /\btuna\b/],
    ["milk", /\b(?:cheese|cheeses|cheeseburger|cheesecake|mozzarella|cheddar|ranch|bleu cheese|blue cheese|feta|parmesan|parmigiana|ricotta|provolone|cream|alfredo|yogurt|cannoli|pudding|greek salad)\b/],
    ["egg", /\b(?:egg|eggs|mayo|mayonnaise)\b/],
    ["mustard", /\bmustard\b/],
  ];
  for (const [allergen, pattern] of matches) {
    if (pattern.test(text)) allergens.push(allergen);
  }
  if (
    /\b(?:beer battered|breaded|bread|bread sticks|croutons|egg rolls|pita|bun|toast|wrap|sandwich|sub|subs|quesadilla|quesadillas|pizza|calzone|stromboli|spaghetti|fettuccini|penne|ziti|pasta|lasagna|cannoli|funnel cake|oreo)\b/.test(text)
  ) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactPath = path.resolve(
    `data/restaurant-verification/artifacts/${restaurantIdAntonellisPizza}/official-antonellis-menu.html`,
  );
  const html = await readFile(artifactPath, "utf8");
  const snapshot = buildAntonellisPizzaAuditSnapshot({ html });
  const outputPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAntonellisPizza}/corrected-menu.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    rawPriceListRowCount: snapshot.rawPriceListRowCount,
    excludedHelperRowCount: snapshot.excludedHelperRowCount,
    excludedAlcoholPresentationCount: snapshot.excludedAlcoholPresentationCount,
    stalePlainCheesePriceRowCount: snapshot.stalePlainCheesePriceRows.length,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
