import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAsiaNine = "osm-asia-nine-1236156059";
export const wixRestaurantMenusAppDefinitionId = "b278a256-2757-4f19-9313-c05c783bec92";

export const sourceUrlsAsiaNine = Object.freeze({
  home: "https://www.asianinemd.com/",
  thai: "https://www.asianinemd.com/menus?location=Crown+Park+Avenue&menu=thai-food",
  sushi: "https://www.asianinemd.com/menus?location=Crown+Park+Avenue&menu=sushi",
  accessTokens: "https://www.asianinemd.com/_api/v1/access-tokens",
  menusApi: "https://www.asianinemd.com/_api/restaurants-menus-menu/v1/menus",
  sectionsApi: "https://www.asianinemd.com/_api/restaurants-menus-section/v1/sections",
  itemsApi: "https://www.asianinemd.com/_api/restaurants-menus-item/v1/items",
  toast: "https://order.toasttab.com/online/asia-nine-gaithersburg-254-crown-park-ave",
});

const sourceContracts = Object.freeze({
  home: {
    artifactPath: `data/restaurant-verification/artifacts/${restaurantIdAsiaNine}/official-home.html`,
    sha256: "55bf83583dcf38031d55c43545dd382ac49e9c2f976013e81701fc7ff0f19b26",
  },
  thai: {
    artifactPath: `data/restaurant-verification/artifacts/${restaurantIdAsiaNine}/official-thai-menu.html`,
    sha256: "b01d0adebef4e9b6dd0923074da4c75e299f80ec250224caf9a1f1b389f44721",
  },
  sushi: {
    artifactPath: `data/restaurant-verification/artifacts/${restaurantIdAsiaNine}/official-sushi-menu.html`,
    sha256: "fecf7612d6e356f1d31273db4b9414483ac414f05b4a440f400c3444dfdd1fad",
  },
});

const expectedSections = Object.freeze({
  "Thai Food": [
    ["Signature Dishes", 13],
    ["Appetizer", 11],
    ["Soup / Salad", 15],
    ["Rice Curry", 3],
    ["Rice Entrees", 11],
    ["Noodle Soup Entrees", 3],
    ["Noodle Entrees", 4],
    ["Sides", 11],
    ["Desserts", 3],
    ["Beverages", 7],
  ],
  Sushi: [
    ["Nigiri Sushi (2 pcs)", 27],
    ["Chef's Special Roll (8pcs)", 11],
    ["Maki Sushi / Regular Rolls", 23],
    ["Tempura Rolls - Flash Fry", 4],
    ["Vegetarian Rolls (6pcs)", 8],
    ["Sushi Maki Modification (2 Items Max)", 7],
  ],
});

const allergenOrder = Object.freeze([
  "milk",
  "egg",
  "peanut",
  "tree-nut",
  "wheat",
  "gluten",
  "fish",
  "shellfish",
  "soy",
  "sesame",
  "mustard",
]);

export async function fetchAsiaNineWixCatalog({ fetchImpl = fetch } = {}) {
  const tokenResponse = await fetchImpl(sourceUrlsAsiaNine.accessTokens, {
    headers: { Accept: "application/json", Referer: sourceUrlsAsiaNine.thai },
  });
  if (!tokenResponse.ok) throw new Error(`Asia Nine Wix access-token request failed with HTTP ${tokenResponse.status}.`);
  const tokens = await tokenResponse.json();
  const app = tokens?.apps?.[wixRestaurantMenusAppDefinitionId];
  const authorization = clean(app?.instance) ?? clean(app?.accessToken);
  if (!authorization) throw new Error("Asia Nine Wix restaurant-menu authorization token is missing.");
  const headers = {
    Accept: "application/json",
    authorization,
    Referer: sourceUrlsAsiaNine.thai,
    "x-wix-client-artifact-id": "restaurant-menus-showcase-ooi",
  };
  const responses = await Promise.all([
    fetchImpl(sourceUrlsAsiaNine.menusApi, { headers }),
    fetchImpl(sourceUrlsAsiaNine.sectionsApi, { headers }),
    fetchImpl(sourceUrlsAsiaNine.itemsApi, { headers }),
  ]);
  for (const [label, response] of [["menus", responses[0]], ["sections", responses[1]], ["items", responses[2]]]) {
    if (!response.ok) throw new Error(`Asia Nine Wix ${label} request failed with HTTP ${response.status}.`);
  }
  return {
    menus: await responses[0].json(),
    sections: await responses[1].json(),
    items: await responses[2].json(),
  };
}

export function auditAsiaNineWixApiBoundary({ menus, sections, items }) {
  if (!Array.isArray(menus?.menus) || !Array.isArray(sections?.sections) || !Array.isArray(items?.items)) {
    throw new Error("Asia Nine Wix API catalog shape changed.");
  }
  const sectionById = new Map(sections.sections.map((section) => [section.id, section]));
  const publishedIds = new Set();
  for (const menu of menus.menus.filter(visible)) {
    for (const sectionId of menu.sectionIds ?? []) {
      const section = sectionById.get(sectionId);
      if (!section || section.visible === false) continue;
      for (const itemId of section.itemIds ?? []) publishedIds.add(itemId);
    }
  }
  const visibleItems = items.items.filter(visible);
  const demoItems = visibleItems.filter((item) => !publishedIds.has(item.id));
  if (menus.menus.length !== 2 || sections.sections.length !== 16 || publishedIds.size !== 161 || visibleItems.length !== 182 || demoItems.length !== 21) {
    throw new Error(`Asia Nine Wix API boundary changed: ${menus.menus.length} menus, ${sections.sections.length} sections, ${publishedIds.size} published IDs, ${visibleItems.length} visible items, ${demoItems.length} demo items.`);
  }
  return {
    menuCount: menus.menus.length,
    sectionCount: sections.sections.length,
    publishedItemCount: publishedIds.size,
    rawVisibleItemCount: visibleItems.length,
    demoItemCount: demoItems.length,
    demoItemNames: demoItems.map((item) => clean(item.name)),
  };
}

export async function buildAsiaNineAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const sourceStats = [];
  const artifacts = {};
  for (const [key, contract] of Object.entries(sourceContracts)) {
    const buffer = await readFile(path.resolve(contract.artifactPath));
    const actualSha256 = sha256(buffer);
    if (actualSha256 !== contract.sha256) {
      throw new Error(`Asia Nine ${key} artifact hash changed: expected ${contract.sha256}, got ${actualSha256}.`);
    }
    artifacts[key] = buffer.toString("utf8");
    sourceStats.push({ key, ...contract, actualSha256, byteLength: buffer.length });
  }

  assertIdentity(artifacts.home);
  const thaiPayload = extractAsiaNinePopulatedMenus(artifacts.thai);
  const sushiPayload = extractAsiaNinePopulatedMenus(artifacts.sushi);
  if (JSON.stringify(thaiPayload) !== JSON.stringify(sushiPayload)) {
    throw new Error("Asia Nine Thai and sushi pages expose different populated-menu catalog boundaries.");
  }
  return buildAsiaNineCatalog(thaiPayload, { retrievedAt, sourceStats });
}

export function extractAsiaNinePopulatedMenus(html) {
  const $ = cheerio.load(html);
  const rawWarmup = $("#wix-warmup-data").html();
  if (!rawWarmup) throw new Error("Asia Nine Wix warmup data is missing.");
  const warmup = JSON.parse(rawWarmup);
  const menus = warmup?.appsWarmupData?.[wixRestaurantMenusAppDefinitionId]
    ?.populatedMenus?.data?.data;
  if (!Array.isArray(menus)) throw new Error("Asia Nine populated-menu array is missing.");
  return menus;
}

export function buildAsiaNineCatalog(menus, { retrievedAt, sourceStats = [] } = {}) {
  if (!Array.isArray(menus) || menus.length !== 2) {
    throw new Error(`Expected two Asia Nine menus, got ${Array.isArray(menus) ? menus.length : "none"}.`);
  }
  const actualMenuNames = menus.map((menu) => clean(menu.name));
  if (JSON.stringify(actualMenuNames) !== JSON.stringify(["Thai Food", "Sushi"])) {
    throw new Error(`Asia Nine menu names changed: ${JSON.stringify(actualMenuNames)}.`);
  }

  const presentations = [];
  let sourceSectionOrdinal = 0;
  for (const menu of menus) {
    if (menu.visible === false) throw new Error(`Asia Nine menu is hidden: ${menu.name}.`);
    const actualSections = menu.sections.map((section) => [clean(section.name), section.items.filter(visible).length]);
    if (JSON.stringify(actualSections) !== JSON.stringify(expectedSections[clean(menu.name)])) {
      throw new Error(`Asia Nine ${menu.name} section boundary changed: ${JSON.stringify(actualSections)}.`);
    }
    for (const section of menu.sections) {
      const category = clean(section.name);
      section.items.filter(visible).forEach((item, sourceItemOrdinal) => {
        presentations.push({ menu, section, category, item, sourceSectionOrdinal, sourceItemOrdinal });
      });
      sourceSectionOrdinal += 1;
    }
  }

  if (presentations.length !== 161 || new Set(presentations.map(({ item }) => item.id)).size !== 161) {
    throw new Error(`Asia Nine product boundary changed: expected 161 unique visible products, got ${presentations.length}.`);
  }

  const items = presentations.map(({ menu, category, item, sourceSectionOrdinal, sourceItemOrdinal }) => {
    const name = clean(item.name);
    const description = clean(item.description);
    const evidenceText = clean(`${name} ${description ?? ""}`);
    const allergens = directAllergensAsiaNine(name, description);
    const inferred = inferredRisksAsiaNine(name, description, allergens);
    const sourceUrl = clean(menu.name) === "Sushi" ? sourceUrlsAsiaNine.sushi : sourceUrlsAsiaNine.thai;
    return {
      id: slugify(name),
      name,
      category,
      description,
      ingredientsText: description,
      imageUrl: clean(item.image?.url) ?? clean(item.imageUrl),
      isConfigurable: (item.modifierGroups ?? []).length > 0 ||
        (item.priceVariants?.variants ?? []).length > 1,
      variantGroup: category,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-issued-wix-menu",
      sourceUrls: [sourceUrl],
      sourceSummary: allergens.length > 0
        ? "Asia Nine's current restaurant-issued menu explicitly names the positive ingredient or food identity represented here. The menu is not a complete allergen matrix or cross-contact guide; absent terms are not negative assurances."
        : "Asia Nine publishes this current item but no supported fixed allergen, allergen-free assurance, or item-level cross-contact disclosure for it.",
      evidence: [{
        sourceKind: "restaurant-issued-wix-menu-text",
        sourceUrl,
        text: description ? `${name}: ${description}` : name,
      }],
      inferredIngredients: inferred.ingredients,
      inferredAllergenSignals: inferred.signals,
      inferenceQuestions: [],
      inferenceSummary: inferred.summary,
      inferenceVersion: "asia-nine-reviewed-formulations-2026-07-15",
      sourceMenuName: clean(menu.name),
      sourceItemId: item.id,
      sourceSectionOrdinal,
      sourceItemOrdinal,
      sourceEvidenceText: evidenceText,
    };
  });

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Asia Nine canonical item IDs are not unique.");
  }
  items.sort((left, right) => {
    const leftBeverage = left.category === "Beverages";
    const rightBeverage = right.category === "Beverages";
    if (leftBeverage !== rightBeverage) return leftBeverage ? 1 : -1;
    return left.sourceSectionOrdinal - right.sourceSectionOrdinal ||
      left.sourceItemOrdinal - right.sourceItemOrdinal;
  });

  const officialIngredientCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const inferredRiskCount = items.filter((item) => item.inferredAllergenSignals.length > 0).length;
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAsiaNine,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAsiaNine),
    sourceStats,
    sourceMenuCount: menus.length,
    sourceSectionCount: presentations.reduce((set, row) => set.add(row.category), new Set()).size,
    sourcePresentationCount: presentations.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    thaiItemCount: items.filter((item) => item.sourceMenuName === "Thai Food").length,
    sushiItemCount: items.filter((item) => item.sourceMenuName === "Sushi").length,
    configurableItemCount: items.filter((item) => item.isConfigurable).length,
    officialIngredientCount,
    unavailableAllergenCount: items.length - officialIngredientCount,
    inferredRiskCount,
    globalCrossContactCount: 0,
    items,
  };
}

export function directAllergensAsiaNine(name, description) {
  const text = ` ${clean(`${name ?? ""} ${description ?? ""}`)?.toLowerCase() ?? ""} `
    .replace(/eggplant/g, " ")
    .replace(/choice of chicken, shrimp, or veggie/g, " selectable-protein ")
    .replace(/coconut (?:milk|ice cream)/g, " coconut ")
    .replace(/crab sticks?|\bkani\b/g, " surimi ")
    .replace(/eel sauce/g, " sauce ")
    .replace(/spicy m[ae]yo|\bm[ae]yo\b|mayonnaise/g, " mayonnaise ")
    .replace(/miso/g, " fermented-paste ");
  const found = new Set();
  const add = (...ids) => ids.forEach((id) => found.add(id));
  if (/\b(?:milk|butter|ghee|cream cheese|goat cheese|parmesan|cheese)\b/.test(text)) add("milk");
  if (/\b(?:egg|eggs|omelet|omelets|omellet|omellets|tamago|quail egg|quail eggs)\b/.test(text)) add("egg");
  if (/\bpeanuts?\b/.test(text)) add("peanut");
  if (/\b(?:cashew|cashews|almond|almonds|hazelnut|hazelnuts|macadamia|pecan|pecans|pistachio|pistachios|walnut|walnuts)\b/.test(text)) add("tree-nut");
  if (/\bwheat\b/.test(text)) add("wheat", "gluten");
  if (/\b(?:fish|tuna|maguro|salmon|sake|yellowtail|hamachi|tilapia|snapper|madai|bonito|anchovy|anchovies|eel|unagi|mackerel|saba|roe|ikura|masago|tobiko|fish cake)\b/.test(text)) add("fish");
  if (/\b(?:shrimp|ebi|amaiebi|crab|crab meat|crabmeat|real crab|soft shell crab|soft-shell crab|lobster|calamari|squid|ika|clam|hokkigai|scallop|scallops|hotate|octopus|tako)\b/.test(text)) add("shellfish");
  if (/\b(?:soy|soybean|tofu|edamame|bean curd|bean curds)\b/.test(text)) add("soy");
  if (/\bsesame\b/.test(text)) add("sesame");
  if (/\bmustard\b/.test(text) && !/\bmustard greens?\b/.test(text)) add("mustard");
  return allergenOrder.filter((id) => found.has(id));
}

export function inferredRisksAsiaNine(name, description, officialAllergens = []) {
  const text = clean(`${name ?? ""} ${description ?? ""}`)?.toLowerCase() ?? "";
  const ingredients = [];
  const signals = [];
  const add = (id, confidence, evidence, ingredient) => {
    if (officialAllergens.includes(id) || signals.some((entry) => entry.id === id)) return;
    signals.push({ id, c: confidence, e: [evidence] });
    if (ingredient) ingredients.push(ingredient);
  };
  if (/\b(?:mayo|meyo|mayonnaise)\b/.test(text)) {
    add("egg", "medium", "formulation:mayonnaise", "mayonnaise");
  }
  if (/\b(?:tempura|wonton|wontons|wonton skin|gyoza|dumpling|dumplings|spring roll|spring rolls|lo mein|lomein|udon|donut|batter|battered)\b/.test(text)) {
    add("wheat", "medium", "formulation:wheat-based-wrapper-noodle-or-batter", "wheat_based_formulation");
    add("gluten", "medium", "formulation:wheat-based-wrapper-noodle-or-batter", "wheat_based_formulation");
  }
  if (/\b(?:kani|crab stick|crab sticks)\b/.test(text)) {
    add("fish", "medium", "formulation:surimi-crab-stick", "surimi");
  }
  if (/\bmiso\b/.test(text)) {
    add("soy", "medium", "formulation:miso", "miso");
  }
  return {
    ingredients: [...new Set(ingredients)],
    signals,
    summary: signals.length > 0
      ? "Ingredient Intelligence keeps common wrapper, noodle, batter, mayonnaise, surimi, and miso formulation risks separate from Asia Nine's restaurant-issued fixed ingredient signals."
      : null,
  };
}

function assertIdentity(html) {
  const text = cheerio.load(html)("body").text().replace(/\s+/g, " ");
  if (!/ASIA NINE/i.test(text) || !/Gaithersburg, MD/i.test(text) || !/254 Crown Park Ave/i.test(text) || !/301[.\s-]*330[.\s-]*9997/.test(text)) {
    throw new Error("Asia Nine owner-site identity contract changed.");
  }
}

function visible(item) {
  return item?.visible !== false;
}

function clean(value) {
  if (typeof value !== "string") return null;
  return value.normalize("NFKC").replace(/\s+/g, " ").trim() || null;
}

function slugify(value) {
  return clean(value)
    ?.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeSnapshot() {
  const snapshot = await buildAsiaNineAuditSnapshot({ retrievedAt: "2026-07-15T13:11:42.908Z" });
  const outputDirectory = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAsiaNine}`);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "corrected-menu.json");
  const buffer = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(outputPath, buffer);
  return {
    outputPath: path.relative(process.cwd(), outputPath),
    sha256: sha256(buffer),
    itemCount: snapshot.itemCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    inferredRiskCount: snapshot.inferredRiskCount,
  };
}

async function captureCurrentApis() {
  const raw = await fetchAsiaNineWixCatalog();
  const boundary = auditAsiaNineWixApiBoundary(raw);
  const outputDirectory = path.resolve(`data/restaurant-verification/artifacts/${restaurantIdAsiaNine}`);
  await mkdir(outputDirectory, { recursive: true });
  const artifacts = [
    ["official-wix-menus.json", raw.menus],
    ["official-wix-sections.json", raw.sections],
    ["official-wix-items.json", raw.items],
  ];
  const hashes = {};
  for (const [filename, value] of artifacts) {
    const buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    await writeFile(path.join(outputDirectory, filename), buffer);
    hashes[filename] = sha256(buffer);
  }
  return { boundary, hashes };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  console.log(JSON.stringify(
    process.argv.includes("--capture-api") ? await captureCurrentApis() : await writeSnapshot(),
    null,
    2,
  ));
}
