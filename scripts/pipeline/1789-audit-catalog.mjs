import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const sourceUrls1789 = Object.freeze({
  menu: "https://www.1789restaurant.com/menu/",
  dinnerPdf: "https://media-cdn.getbento.com/accounts/4a403041414e2d401888cf8725bfdf28/media/zVg52ampRCOyN0IZWxZA_1789_Dinner_05.07.pdf",
  dessertPdf: "https://media-cdn.getbento.com/accounts/4a403041414e2d401888cf8725bfdf28/media/RTLCaQKQuOs9hhpJ774s_1789_Dessert_06.18.pdf",
  delRioImage: "https://media-cdn.getbento.com/accounts/4a403041414e2d401888cf8725bfdf28/media/AAYlT1muQrHa8X3eCaFq_1789_DelRioWD_MENU.jpg",
});

const includedSections = Object.freeze({
  Dinner: null,
  Dessert: new Set(["Dessert"]),
  "Wines of Del Rio": null,
});

export async function build1789AuditSnapshot({
  htmlPath = "data/restaurant-verification/artifacts/restaurant-1789-dc/official-menu-page.html",
  retrievedAt = new Date().toISOString(),
} = {}) {
  const html = await readFile(htmlPath, "utf8");
  const $ = cheerio.load(html);
  const itemsByName = new Map();
  const menus = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    let menu;
    try {
      menu = JSON.parse($(element).text());
    } catch {
      return;
    }
    if (menu?.["@type"] !== "Menu" || !(menu.name in includedSections)) return;
    menus.push(menu.name);

    for (const section of menu.hasMenuSection ?? []) {
      const allowedSections = includedSections[menu.name];
      if (allowedSections && !allowedSections.has(section.name)) continue;
      const sourceItems = Array.isArray(section.hasMenuItem)
        ? section.hasMenuItem
        : [section.hasMenuItem].filter(Boolean);

      for (const sourceItem of sourceItems) {
        if (!isFoodRow(menu.name, sourceItem.name)) continue;
        const name = cleanName(sourceItem.name);
        const key = normalizedName(name);
        const description = sourceItem.description === "None"
          ? null
          : cleanName(sourceItem.description);
        const sourceUrls = [sourceUrls1789.menu, menu.associatedMedia?.contentUrl].filter(Boolean);
        const candidate = {
          name,
          description,
          menu: menu.name,
          section: section.name,
          sourceUrls,
        };
        const existing = itemsByName.get(key);
        if (!existing || (description?.length ?? 0) > (existing.description?.length ?? 0)) {
          itemsByName.set(key, candidate);
        }
      }
    }
  });

  const items = [...itemsByName.values()].map((item, index) => {
    const allergens = directAllergens(`${item.name} ${item.description ?? ""}`);
    return {
      auditItemKey: `${index + 1}:${slugify(item.name)}`,
      id: slugify(item.name),
      name: item.name,
      category: `${item.menu} · ${item.section}`,
      description: item.description,
      ingredientsText: item.description,
      sourceUrls: unique(item.sourceUrls),
      sourceType: item.menu === "Dinner" || item.menu === "Dessert"
        ? "official-menu-and-pdf"
        : "official-menu-and-image",
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });

  return {
    schemaVersion: 1,
    restaurantId: "restaurant-1789-dc",
    retrievedAt,
    sourceUrls: unique(Object.values(sourceUrls1789)),
    menus: unique(menus),
    itemCount: items.length,
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "The restaurant publishes menu descriptions, not a complete allergen matrix. Only directly supported signals are asserted; silence remains unavailable.",
    items,
  };
}

function isFoodRow(menuName, name) {
  if (menuName !== "Wines of Del Rio") return true;
  return !/^(?:NV|20\d{2})\b/i.test(cleanName(name));
}

function directAllergens(value) {
  let text = ` ${String(value).toLowerCase()} `
    .replace(/\bcoconut milk\b/g, " ")
    .replace(/\bcocoa butter\b/g, " ")
    .replace(/\bmilk[- ]fed\b/g, " ");
  const matches = [
    ["shellfish", /\b(?:lobster|scallop|crab|octopus|squid)s?\b/],
    ["milk", /\b(?:milk|butter|buttermilk|cream|cheese|burrata|ricotta|parmesan|fromage|cr[eè]me fra[iî]che|beurre blanc|ice cream)\b/],
    ["peanut", /\bpeanuts?\b/],
    ["tree-nut", /\b(?:pecan|walnut|almond|cashew|pistachio|hazelnut|macadamia)s?\b/],
    ["egg", /\b(?:egg|eggs|aioli|sabayon|meringue)\b/],
    ["fish", /\b(?:caviar|trout|hamachi|halibut|sole)\b/],
    ["soy", /\b(?:soy|miso|tofu|edamame|tamari)\b/],
    ["sesame", /\b(?:sesame|tahini)\b/],
    ["mustard", /\bmustard\b/],
  ];
  const allergens = matches.filter(([, pattern]) => pattern.test(text)).map(([allergen]) => allergen);
  if (/\b(?:fettucc?ine|raviolo|brioche|farro|cous cous|couscous|lavash)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function cleanName(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\*+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedName(value) {
  return cleanName(value)
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

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/repairs/restaurant-1789-dc/corrected-menu.json",
  );
  const snapshot = await build1789AuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount }, null, 2));
}
