import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAnthonysFallsChurch = "osm-anthony-s-7464874523";
export const retrievedAtAnthonysFallsChurch = "2026-07-15T06:48:00.000Z";
export const sourceUrlsAnthonysFallsChurch = Object.freeze({
  home: "https://anthonysrestaurantva.com/",
  menu: "https://anthonysrestaurantva.com/menu",
  mirror: "https://r.jina.ai/http://anthonysrestaurantva.com/menu",
});

const duplicatePreferences = new Map([
  ["garidomakaronada", "PASTA"],
  ["greek fries", "APPETIZERS"],
  ["meatball", "SIDES"],
]);

export function parseAnthonysFallsChurchMenuMarkdown(markdown) {
  const presentations = [];
  let category = null;

  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      category = clean(line.slice(3));
      continue;
    }
    if (
      !category ||
      category === "Most ordered" ||
      !line.startsWith("[") ||
      !line.includes("](https://anthonysrestaurantva.com/menu?item=")
    ) {
      continue;
    }

    const match = line.match(
      /^\[(.*)\]\((https:\/\/anthonysrestaurantva\.com\/menu\?item=[^)]+)\)\s*$/,
    );
    if (!match) continue;
    const label = clean(match[1].replace(/ !\[Image .*$/, ""));
    const product = label.match(/^(.*?)\s+\$(\d+(?:\.\d{2})?)(\+)?(?:\s+(.*))?$/);
    if (!product) continue;
    presentations.push({
      category,
      name: clean(product[1]),
      price: Number(product[2]),
      variablePrice: Boolean(product[3]),
      description: clean(product[4]) || null,
      itemUrl: match[2],
    });
  }

  return presentations;
}

export function canonicalizeAnthonysFallsChurchPresentations(presentations) {
  const groups = new Map();
  for (const row of presentations) {
    const key = canonicalNameKey(row.name);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, group]) => {
    const preferredCategory = duplicatePreferences.get(key);
    const primary = group.find((row) => row.category === preferredCategory) ?? group[0];
    const descriptions = unique(group.map((row) => row.description));
    return {
      ...primary,
      name: key === "meatball" ? "MEATBALL" : primary.name,
      description: descriptions.length > 0 ? descriptions.join(" ") : null,
      itemUrls: unique(group.map((row) => row.itemUrl)),
      categories: unique(group.map((row) => row.category)),
      presentationCount: group.length,
    };
  });
}

export function buildAnthonysFallsChurchAuditSnapshot({
  markdown,
  retrievedAt = retrievedAtAnthonysFallsChurch,
} = {}) {
  const presentations = parseAnthonysFallsChurchMenuMarkdown(markdown);
  if (presentations.length !== 178) {
    throw new Error(
      `Anthony's source shape changed: expected 178 category presentations, found ${presentations.length}.`,
    );
  }
  const canonicalRows = canonicalizeAnthonysFallsChurchPresentations(presentations);
  if (canonicalRows.length !== 175) {
    throw new Error(
      `Anthony's canonical shape changed: expected 175 products, found ${canonicalRows.length}.`,
    );
  }

  const items = canonicalRows.map((row, index) => {
    const allergens = directAllergensAnthonysFallsChurch(`${row.name} ${row.description ?? ""}`);
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      price: row.price,
      isConfigurable: row.variablePrice || /Selections Required/i.test(row.name),
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-issued-owner-menu",
      sourceUrls: unique([sourceUrlsAnthonysFallsChurch.menu, ...row.itemUrls]),
      sourceSummary: allergens.length > 0
        ? "Positive signals come from the product name and ingredient text on Anthony's current restaurant-issued Owner menu. This is not a complete allergen matrix or cross-contact disclosure."
        : "Anthony's current restaurant-issued Owner menu identifies this product but does not publish enough item-level ingredient or allergen detail for a positive or negative claim.",
      evidence: row.itemUrls.map((sourceUrl) => ({
        sourceKind: "restaurant-issued-menu-item-text",
        sourceUrl,
        text: clean([row.name, row.description].filter(Boolean).join(" — ")),
      })),
      sourceCategories: row.categories,
      sourcePresentationCount: row.presentationCount,
    };
  });

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Anthony's canonical menu contains duplicate product ids.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAnthonysFallsChurch,
    retrievedAt,
    sourceUrls: [sourceUrlsAnthonysFallsChurch.home, sourceUrlsAnthonysFallsChurch.menu],
    transportUrl: sourceUrlsAnthonysFallsChurch.mirror,
    presentationCount: presentations.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    duplicatePresentationCount: presentations.length - items.length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning:
      "Anthony's live official menu is publicly readable but rejects the ledger and curl archival user-agents with HTTP 403. The official page was independently read through the public web reader, and a complete Jina Reader transport snapshot is retained as third-party corroboration rather than relabeled as official. Product and ingredient claims remain anchored to the official Anthony's menu and stable item URLs. The menu publishes no allergen matrix or cross-contact disclosure; its raw-food warning is not allergen evidence.",
    items,
  };
}

export function directAllergensAnthonysFallsChurch(value) {
  const text = normalize(value)
    .replace(/\bthese items may be cooked to order\b.*$/, "")
    .replace(/\bconsuming raw\b.*$/, "")
    .trim();
  const allergens = [];
  const matches = [
    ["shellfish", /\b(?:shrimp|crab|calamari)\b/],
    ["fish", /\b(?:tilapia|salmon|fish|tuna)\b/],
    ["tree-nut", /\b(?:pine nuts?|walnuts?|almandine|almondine)\b/],
    ["milk", /\b(?:milk|cheese|cheesecake|american cheese|provolone|swiss|feta|parmesan|parmigiana|ricotta|mozzarella|blue cheese|cream|creamy|bechamel|butter|yogurt|tzatziki|ranch|alfredo|white pizza|margarita pizza)\b/],
    ["egg", /\b(?:egg|eggs|mayonnaise|mayo|tartar|caesar dressing|flan)\b/],
    ["mustard", /\bmustard\b/],
  ];
  for (const [allergen, pattern] of matches) {
    if (pattern.test(text)) allergens.push(allergen);
  }
  if (
    /\b(?:pasta|spaghetti|ziti|fetuccine|fettuccini|penne|manicotti|lasagna|ravioli|stuffed shells|breaded|phyllo|pita|bread|brioche|bun|hoagie|sub|sandwich|roll|rye|croutons|cannoli|cake|cheesecake|napoleon|tiramisu|bugatsa|baklava|pizza)\b/.test(text) &&
    !/\bcauliflower pizza\b/.test(text)
  ) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function canonicalNameKey(value) {
  const key = normalize(value);
  return key === "meat ball" ? "meatball" : key;
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
    "data/restaurant-verification/artifacts/osm-anthony-s-7464874523/jina-anthonys-menu.md",
  );
  const markdown = await readFile(artifactPath, "utf8");
  const snapshot = buildAnthonysFallsChurchAuditSnapshot({ markdown });
  const outputPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAnthonysFallsChurch}/corrected-menu.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    presentationCount: snapshot.presentationCount,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    duplicatePresentationCount: snapshot.duplicatePresentationCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
