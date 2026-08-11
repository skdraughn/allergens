import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sourceUrls90Second = Object.freeze({
  home: "https://www.90secondpizza.com/",
  faq: "https://www.90secondpizza.com/faq",
  georgetownToast: "https://order.toasttab.com/online/90-second-pizza-1077-wisconsin-avenue-nw",
});

export const auditRetrievedAt90Second = "2026-07-14T18:29:56.421Z";

const categories = Object.freeze(["Pizza", "Vegan Pizza", "Drinks", "Dessert"]);
const expectedNames = Object.freeze({
  Pizza: [
    "Margherita",
    "Marinara (No Cheese)",
    "Arrabbiata (Spicy)",
    "Capricciosa",
    "Sausage and Peppers",
    "Campania",
    "Pepperoni",
    "Pizza Bianca (White)",
    "Meat Lovers",
    "Vegetariana Rossa",
    "90 Second Pizza",
    "Al Pollo",
    "California (White)",
    "Half and Half",
  ],
  "Vegan Pizza": [
    "Vegan",
    "Ortolana (Vegan)",
    "Boscaiola (Vegan)",
    "Campagnola (Vegan)",
    "Contadina (Vegan)",
    "Vegan Meatball",
    "Half and Half (Vegan)",
  ],
  Drinks: [
    "Water Bottle",
    "Pepsi",
    "Diet Pepsi",
    "Starry",
    "Brisk Ice Tea",
    "Ginger Ale",
    "Dole Lemonade",
    "San Pellegrino Aranciata",
    "San Pellegrino Melograno e Arancia",
  ],
  Dessert: [
    "Tiramisu Pastry Cup",
    "Double Chocolate Mousse Pastry Cup",
    "Authentic Bindi Tiramisu",
    "Cannoli Chips & Dip",
  ],
});

// The current Georgetown Toast page exposes Pizza Dough in its visible Misc.
// section, but Toast's text renderer omits that final section. Keep the direct
// menu observation explicit rather than attributing it to the rendered proxy.
const directToastRows90Second = Object.freeze([
  {
    category: "Miscellaneous",
    name: "Pizza Dough",
    description: null,
    sourceUrl: sourceUrls90Second.georgetownToast,
  },
]);

const categoryOrder = new Map([
  ["Pizza", 10],
  ["Vegan Pizza", 20],
  ["Desserts", 30],
  ["Miscellaneous", 40],
  ["Drinks", 50],
]);

export function parse90SecondToastReader(markdown) {
  const source = String(markdown ?? "");
  const mainStart = source.indexOf("### Pizza");
  if (mainStart < 0) throw new Error("90 Second Pizza Toast menu heading was not found.");
  const main = source.slice(mainStart);
  const rows = [];

  for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
    const category = categories[categoryIndex];
    const startToken = `### ${category}\n`;
    const start = main.indexOf(startToken);
    if (start < 0) throw new Error(`90 Second Pizza category was not found: ${category}.`);
    const nextCategory = categories[categoryIndex + 1];
    const next = nextCategory ? main.indexOf(`### ${nextCategory}\n`, start + startToken.length) : -1;
    const block = main.slice(start + startToken.length, next >= 0 ? next : undefined);
    const namesByToastSlug = new Map(expectedNames[category].map((name) => [toastSlug(name), name]));
    const menuLinks = block.split(/\r?\n/).filter((line) => /\/item-[a-z0-9-]+_/i.test(line));

    for (const line of menuLinks) {
      const match = line.match(/\]\((https?:\/\/[^)\s]+\/item-([a-z0-9-]+)_[^)]+)\)\s*$/i);
      if (!match) throw new Error(`Could not parse 90 Second Pizza item link in ${category}.`);
      const name = namesByToastSlug.get(match[2]);
      if (!name) throw new Error(`Unrecognized 90 Second Pizza item slug in ${category}: ${match[2]}.`);
      const linkText = line.slice(0, line.lastIndexOf("]("))
        .replace(/^\*\s*\[/, "")
        .replace(/^!\[[^\]]*\]\([^)]*\)/, "");
      const description = normalizeWhitespace(linkText)
        .replace(/(?:\s+OUT OF STOCK)?\s+\$\d+(?:\.\d{2})?$/, "")
        .trim();
      rows.push({
        category: category === "Dessert" ? "Desserts" : category === "Misc." ? "Miscellaneous" : category,
        name,
        description: description || null,
        sourceUrl: match[1].replace(/^http:/, "https:"),
      });
    }

    if (menuLinks.length !== expectedNames[category].length) {
      throw new Error(
        `90 Second Pizza ${category} expected ${expectedNames[category].length} items but parsed ${menuLinks.length}.`,
      );
    }
  }

  return [...rows, ...directToastRows90Second];
}

export function build90SecondPizzaAuditSnapshot({ toastMarkdown, retrievedAt = new Date().toISOString() } = {}) {
  const items = parse90SecondToastReader(toastMarkdown).map((row, index) => {
    const signal = allergenSignal(row);
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      isConfigurable: /half and half/i.test(row.name),
      sourceUrls: signal.usesFaq
        ? [sourceUrls90Second.georgetownToast, sourceUrls90Second.faq]
        : [sourceUrls90Second.georgetownToast],
      sourceType: signal.usesFaq
        ? "restaurant-linked-toast-plus-official-faq"
        : "restaurant-linked-toast-menu",
      allergens: signal.allergens,
      mayContain: signal.mayContain,
      allergenSourceType: signal.allergens.length > 0
        ? "official-ingredients"
        : signal.mayContain.length > 0
          ? "official-global-cross-contact-note"
          : "unavailable",
    };
  }).sort((left, right) => {
    const categoryDifference =
      (categoryOrder.get(left.category) ?? 999) - (categoryOrder.get(right.category) ?? 999);
    return categoryDifference || left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return {
    schemaVersion: 1,
    restaurantId: "ninety-second-pizza-georgetown-dc",
    retrievedAt,
    sourceUrls: Object.values(sourceUrls90Second),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    globalCrossContactCount: items.filter(
      (item) => item.allergenSourceType === "official-global-cross-contact-note",
    ).length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "90 Second Pizza does not publish a complete item-level allergen matrix. Current menu ingredient terms support fixed dairy, fish, and pastry signals; the restaurant FAQ separately says it makes no gluten-free pizza in its single oven and cannot guarantee nut-free products because supplier facilities process nuts. Those global cautions are represented as cross-contact, not as invented fixed ingredients or negative safety claims.",
    items,
  };
}

function allergenSignal(row) {
  const text = `${row.name} ${row.description ?? ""}`;
  const allergens = [];
  if (/\b(?:mozzarella|parmesan)\b/i.test(text)) allergens.push("milk");
  if (/\banchov(?:y|ies)\b/i.test(text)) allergens.push("fish");
  if (/\bpastry cup\b/i.test(text)) allergens.push("wheat", "gluten");

  const isDrink = row.category === "Drinks";
  const isPizza = row.category === "Pizza" || row.category === "Vegan Pizza";
  const isPizzaDough = row.name === "Pizza Dough";
  const mayContain = [];
  if (!isDrink) mayContain.push("peanut", "tree-nut");
  if (isPizza || isPizzaDough) mayContain.push("gluten");
  if (row.name === "Half and Half") mayContain.push("milk", "fish");

  return {
    allergens: unique(allergens),
    mayContain: unique(mayContain),
    usesFaq: mayContain.length > 0,
  };
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toastSlug(value) {
  return String(value).replace(/&/g, " ")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "").toLowerCase();
}

function slugify(value) {
  return String(value).replace(/&/g, " and ")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/artifacts/ninety-second-pizza-georgetown-dc/third-party-toast-render-proxy.txt",
  );
  const outputPath = path.resolve(
    process.argv[3] ?? "data/restaurant-verification/repairs/ninety-second-pizza-georgetown-dc/corrected-menu.json",
  );
  const snapshot = build90SecondPizzaAuditSnapshot({
    toastMarkdown: await readFile(artifactPath, "utf8"),
    retrievedAt: auditRetrievedAt90Second,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
