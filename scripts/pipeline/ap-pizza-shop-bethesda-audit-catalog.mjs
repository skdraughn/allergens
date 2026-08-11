import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdApPizzaShopBethesda = "ap-pizza-shop-bethesda-dc-metro";
export const retrievedAtApPizzaShopBethesda = "2026-07-15T07:26:50.728Z";
export const sourceUrlsApPizzaShopBethesda = Object.freeze({
  home: "https://allpurposedc.com/",
  menu: "https://order.toasttab.com/online/ap-pizza-shop-bethesda",
  transport: "https://r.jina.ai/http://order.toasttab.com/online/ap-pizza-shop-bethesda",
});

const nameOverrides = new Map(Object.entries({
  "18-allpurpose-pie": "18\" All-Purpose Pie",
  "18-buona-pie": "18\" Buona Pie",
  "18-calabrese": "18\" Calabrese",
  "18-cheese-pie": "18\" Cheese Pie",
  "18-funghi-pie": "18\" Funghi Pie",
  "18-salsiccia-pie": "18\" Salsiccia Pie",
  "18-sedgewick-pie": "18\" Sedgewick Pie",
  "agricola": "Agricola",
  "ap-caesar": "AP Caesar",
  "buona": "Buona",
  "buona-slice": "Buona Slice",
  "calabrese": "Calabrese",
  "calabrese-slice": "Calabrese Slice",
  "caprese": "Caprese",
  "cheese-pie": "Cheese Pie",
  "chicken-parm": "Chicken Parm",
  "circolo": "Circolo",
  "daniele": "Daniele",
  "double-chocolate-chip-cookies": "Double Chocolate Chip Cookies",
  "feta-ranch-dippie": "Feta Ranch Dippie",
  "funghi": "Funghi",
  "funghi-slice": "Funghi Slice",
  "garlic-knots": "Garlic 'Knots'",
  "house-chopped": "House Chopped",
  "housemade-giardiniera": "House-made Giardiniera",
  "italiano": "Italiano",
  "jersey-marinara": "Jersey Marinara",
  "mortazza": "Mortazza",
  "parm-fonduta-dippie": "Parm Fonduta Dippie",
  "roasted-corn-arancini": "Roasted Corn Arancini",
  "rubirosa": "Rubirosa",
  "salsiccia": "Salsiccia",
  "salsiccia-slice": "Salsiccia Slice",
  "sedgewick": "Sedgewick",
  "sedgewick-slice": "Sedgewick Slice",
  "special-the-tripper": "The Tripper",
  "standard-slice": "Standard Slice",
  "student-special": "Student Special",
  "tantos-cacio-e-pepe-chips": "Tantos Cacio e Pepe Chips",
  "tantos-classic-chips": "Tantos Classic Chips",
  "tantos-marinara-chips": "Tantos Marinara Chips",
  "tantos-pesto-chips": "Tantos Pesto Chips",
  "tartufo": "Tartufo",
  "toasted-almond-cream-cake": "Toasted Almond Cream Cake",
  "tomato-marinara-dippie": "Tomato Marinara Dippie",
  "volcano-ranch-dippie": "Volcano Ranch Dippie",
}));

const dinnerOnlyProducts = Object.freeze([
  {
    category: "Pizza",
    name: "Duke #7",
    description: "Bianco di Napoli tomato sauce, mozz, spicy 'nduja sausage, pickled peppers, Italian pickled vegetables",
    price: 19,
    itemUrl: "https://order.toasttab.com/online/ap-pizza-shop-bethesda/item-duke-7_55bfc5b3-f9b8-42c5-98b7-540932657cae",
  },
  {
    category: "Pizza",
    name: "Pizza Kit",
    description: null,
    price: 19,
    itemUrl: "https://order.toasttab.com/online/ap-pizza-shop-bethesda/item-pizza-kit_c110ff1d-749d-49c0-9aff-d6c9e0b7c1f3",
  },
  {
    category: "Pizza",
    name: "Pizza Dough",
    description: null,
    price: 6,
    itemUrl: "https://order.toasttab.com/online/ap-pizza-shop-bethesda/item-pizza-dough_b1e41024-7d0f-4a2f-89a5-d7c32c5311eb",
  },
]);

export function parseApPizzaShopLunchMarkdown(markdown) {
  const products = [];
  let sourceCategory = null;

  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.startsWith("### ")) {
      sourceCategory = clean(line.slice(4));
      continue;
    }
    if (!sourceCategory || !line.startsWith("*")) continue;
    const match = line.match(
      /^\*\s+\[(.*)\]\((https:\/\/order\.toasttab\.com\/online\/ap-pizza-shop-bethesda\/item-[^)]+)\)\s*$/,
    );
    if (!match) continue;
    const itemUrl = match[2];
    const itemSlug = itemUrl.match(/\/item-([^_/?#]+)_/)?.[1];
    const name = nameOverrides.get(itemSlug);
    if (!name) throw new Error(`AP Pizza Shop has an unmapped Toast item slug: ${itemSlug ?? itemUrl}`);
    const label = clean(
      match[1]
        .replace(/!\[Image \d+\]\([^)]*\)/g, "")
        .replace(/OUT OF STOCK/gi, ""),
    );
    const priceMatch = label.match(/\$(\d+(?:\.\d{2})?)\s*$/);
    if (!priceMatch) throw new Error(`AP Pizza Shop item has no terminal price: ${itemUrl}`);
    const category = sourceCategory === "Lunch Pies"
      ? name.startsWith("18\"") ? "18-inch Lunch Pies" : "Pizza"
      : sourceCategory;
    products.push({
      category,
      sourceCategory,
      name,
      description: clean(label.slice(0, priceMatch.index)) || null,
      price: Number(priceMatch[1]),
      itemUrl,
    });
  }

  return products;
}

export function buildApPizzaShopBethesdaAuditSnapshot({
  markdown,
  retrievedAt = retrievedAtApPizzaShopBethesda,
} = {}) {
  const lunchProducts = parseApPizzaShopLunchMarkdown(markdown);
  if (lunchProducts.length !== 46) {
    throw new Error(
      `AP Pizza Shop lunch shape changed: expected 46 products, found ${lunchProducts.length}.`,
    );
  }
  const firstEighteenInchIndex = lunchProducts.findIndex((row) => row.category === "18-inch Lunch Pies");
  const products = [...lunchProducts];
  products.splice(firstEighteenInchIndex, 0, ...dinnerOnlyProducts);
  if (products.length !== 49) {
    throw new Error(`AP Pizza Shop union changed: expected 49 products, found ${products.length}.`);
  }
  const regularCalabrese = products.find((row) => row.name === "Calabrese");
  const eighteenInchCalabrese = products.find((row) => row.name === "18\" Calabrese");
  if (!regularCalabrese?.description || !eighteenInchCalabrese) {
    throw new Error("AP Pizza Shop Calabrese variant evidence is incomplete.");
  }
  eighteenInchCalabrese.description = regularCalabrese.description;
  eighteenInchCalabrese.supportingItemUrls = [regularCalabrese.itemUrl];

  const items = products.map((row, index) => {
    const allergens = directAllergensApPizzaShopBethesda(
      `${row.category} ${row.name} ${row.description ?? ""}`,
    );
    const sourceText = clean([row.name, row.description, `$${row.price.toFixed(2)}`].filter(Boolean).join(" — "));
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      price: row.price,
      isConfigurable: row.name === "18\" All-Purpose Pie" || row.name === "Pizza Kit",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-linked-toast-menu",
      sourceUrls: [sourceUrlsApPizzaShopBethesda.menu, row.itemUrl, ...(row.supportingItemUrls ?? [])],
      sourceSummary: allergens.length > 0
        ? "Positive signals are derived from the current AP Pizza Shop product name, menu category, and ingredient description on the restaurant-linked Toast menu. The menu is not a complete allergen matrix or cross-contact disclosure."
        : "The current restaurant-linked Toast menu identifies this product but does not publish enough item-level ingredient or allergen detail for a positive or negative claim.",
      evidence: [row.itemUrl, ...(row.supportingItemUrls ?? [])].map((sourceUrl) => ({
        sourceKind: "restaurant-linked-toast-item-text",
        sourceUrl,
        text: sourceText,
      })),
      mealPeriods: row.sourceCategory === "Lunch Pies" || row.sourceCategory === "Deck-Oven Slices"
        ? ["lunch"]
        : dinnerOnlyProducts.some((product) => product.name === row.name)
          ? ["dinner"]
          : ["lunch", "dinner"],
    };
  });

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("AP Pizza Shop current union contains duplicate product ids.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdApPizzaShopBethesda,
    retrievedAt,
    sourceUrls: [sourceUrlsApPizzaShopBethesda.home, sourceUrlsApPizzaShopBethesda.menu],
    transportUrl: sourceUrlsApPizzaShopBethesda.transport,
    lunchItemCount: lunchProducts.length,
    dinnerItemCount: 35,
    dinnerOnlyItemCount: dinnerOnlyProducts.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "AP Pizza Shop's restaurant-linked Toast catalog is meal-period dependent. The current lunch surface publishes 46 products and the current dinner surface publishes 35, yielding 49 unique products after adding dinner-only Duke #7, Pizza Kit, and Pizza Dough. Direct archival user-agents receive HTTP 403; retained Jina Reader snapshots remain third-party transport corroboration and are never relabeled as restaurant-linked evidence. The Toast menu is not a complete allergen matrix or cross-contact disclosure. Missing terms are not negative assurances.",
    items,
  };
}

export function directAllergensApPizzaShopBethesda(value) {
  const text = normalize(value);
  const allergens = [];
  const matches = [
    ["fish", /\b(?:anchovy|neonata)\b/],
    ["tree-nut", /\b(?:pistachio|almond|almonds)\b/],
    ["sesame", /\bsesame\b/],
    ["milk", /\b(?:milk|mozz|mozzarella|parmesan|parm|parmigiano|fonduta|fontina|provolone|caciocavallo|ricotta|taleggio|grana|pecorino|stracciatella|cream|ranch|cheese|cheesey|butter)\b/],
    ["egg", /\b(?:aioli|merengue|meringue|egg|eggs)\b/],
  ];
  for (const [allergen, pattern] of matches) {
    if (pattern.test(text)) allergens.push(allergen);
  }
  if (
    /\b(?:pizza|pie|pies|slice|dough|focaccia|focacceria|sandwich|breadcrumbs|breadsticks|knots|pasta|tantos|cookies|cake|cutlet)\b/.test(text)
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
    `data/restaurant-verification/artifacts/${restaurantIdApPizzaShopBethesda}/third-party-jina-toast-transport.txt`,
  );
  const markdown = await readFile(artifactPath, "utf8");
  const snapshot = buildApPizzaShopBethesdaAuditSnapshot({ markdown });
  const outputPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdApPizzaShopBethesda}/corrected-menu.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    lunchItemCount: snapshot.lunchItemCount,
    dinnerItemCount: snapshot.dinnerItemCount,
    dinnerOnlyItemCount: snapshot.dinnerOnlyItemCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
