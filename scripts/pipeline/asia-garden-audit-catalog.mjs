import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAsiaGarden = "osm-asia-garden-11366360044";

export const sourceUrlsAsiaGarden = Object.freeze({
  home: "https://www.asiagardenalexandria.com/",
  lunch: "https://www.asiagardenalexandria.com/jfrrd7sj/asia-garden-alexandria-22310/order-online?menu=Lunch+Menu",
  allDay: "https://www.asiagardenalexandria.com/jfrrd7sj/asia-garden-alexandria-22310/order-online?menu=All+Day+Menu",
});

const sourceContracts = Object.freeze({
  home: {
    artifactPath: "data/restaurant-verification/artifacts/osm-asia-garden-11366360044/official-home.html",
    sha256: "330d96d6f38b75eba08e7a3253816201acca2298be67890b3bc81e37beb21e7a",
  },
  lunch: {
    artifactPath: "data/restaurant-verification/artifacts/osm-asia-garden-11366360044/official-lunch-menu.html",
    sha256: "9d3d6b6ac319951db391b3cb291b233423a70e4f81d9e6ed80d41eadffb6e161",
  },
  allDay: {
    artifactPath: "data/restaurant-verification/artifacts/osm-asia-garden-11366360044/official-all-day-menu.html",
    sha256: "c6eafa4e3e423e952c1a5d648e0f0b32657eaa6cddf74682174d7f99846de4f9",
  },
});

const expectedGroups = Object.freeze({
  "Lunch Menu": [["Lunch Special", 36]],
  "All Day Menu": [
    ["Beverages", 7],
    ["Appetizers", 14],
    ["Soup", 9],
    ["Fried Rice & Lo Mein", 8],
    ["Flat Noodle & Rice Noodle", 7],
    ["Egg Foo Young", 3],
    ["Pork", 9],
    ["Pad Thai", 7],
    ["Poultry", 15],
    ["Beef", 12],
    ["Seafood", 12],
    ["Vegetable", 12],
    ["Dinner Combo Special", 32],
    ["Chef's Specialties", 22],
    ["Health Food Section", 9],
    ["Chicken Wings", 6],
    ["Fried Seafood", 3],
    ["Side Order", 3],
    ["Soda", 6],
    ["Party Tray", 10],
  ],
});

export async function buildAsiaGardenAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const artifacts = {};
  const sourceStats = [];
  for (const [key, contract] of Object.entries(sourceContracts)) {
    const buffer = await readFile(path.resolve(contract.artifactPath));
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== contract.sha256) {
      throw new Error(`Asia Garden ${key} artifact hash changed: expected ${contract.sha256}, got ${actualSha256}.`);
    }
    artifacts[key] = buffer.toString("utf8");
    sourceStats.push({ key, ...contract, actualSha256, byteLength: buffer.length });
  }

  assertHomeIdentity(artifacts.home);
  const lunchPayload = extractAsiaGardenMenuPayload(artifacts.lunch);
  const allDayPayload = extractAsiaGardenMenuPayload(artifacts.allDay);
  if (JSON.stringify(lunchPayload.rawMenus) !== JSON.stringify(allDayPayload.rawMenus)) {
    throw new Error("Asia Garden lunch and all-day surfaces expose different raw menu boundaries.");
  }
  if (JSON.stringify(lunchPayload.aiDescriptions) !== JSON.stringify(allDayPayload.aiDescriptions)) {
    throw new Error("Asia Garden lunch and all-day surfaces expose different cached AI-description maps.");
  }

  const parsed = parseAsiaGardenRawMenus(lunchPayload.rawMenus, lunchPayload.aiDescriptions);
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAsiaGarden,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAsiaGarden),
    sourceStats,
    sourcePresentationCount: parsed.items.length,
    lunchPresentationCount: parsed.items.filter((item) => item.menuSurface === "Lunch Menu").length,
    allDayPresentationCount: parsed.items.filter((item) => item.menuSurface === "All Day Menu").length,
    categoryCount: parsed.categories.length,
    categories: parsed.categories,
    itemCount: parsed.items.length,
    officialItemCount: 0,
    unavailableAllergenCount: parsed.items.length,
    rawDescriptionCount: parsed.rawDescriptionCount,
    ignoredCachedAIDescriptionCount: parsed.ignoredCachedAIDescriptionCount,
    configurableItemCount: parsed.items.filter((item) => item.isConfigurable).length,
    items: parsed.items,
  };
}

export function extractAsiaGardenMenuPayload(html) {
  const $ = cheerio.load(html);
  const pushPrefix = "self.__next_f.push(";
  for (const element of $("script").toArray()) {
    const script = $(element).text();
    if (!script.startsWith(pushPrefix) || !script.endsWith(")")) continue;
    let pushArguments;
    try {
      pushArguments = JSON.parse(script.slice(pushPrefix.length, -1));
    } catch {
      continue;
    }
    const segment = pushArguments?.[1];
    if (typeof segment !== "string" || !segment.includes('"rawMenus":')) continue;
    return {
      rawMenus: extractJsonObjectAfter(segment, '"rawMenus":'),
      aiDescriptions: extractJsonObjectAfter(segment, '"cachedAIMenuItemDesc":'),
    };
  }
  throw new Error("Could not find Asia Garden raw menu data in the owner ordering page.");
}

export function parseAsiaGardenRawMenus(rawMenus, aiDescriptions) {
  if (!Array.isArray(rawMenus?.menuCategories) || !Array.isArray(rawMenus?.modifierBuilderTemplates)) {
    throw new Error("Asia Garden raw menu payload shape changed.");
  }
  if (rawMenus.menuCategories.length !== 2) {
    throw new Error(`Expected two Asia Garden menu surfaces, got ${rawMenus.menuCategories.length}.`);
  }
  const templatesById = new Map(rawMenus.modifierBuilderTemplates.map((template) => [
    template.modifierBuilderTemplateId,
    template,
  ]));
  const rows = [];
  const categories = [];
  let sourceGroupOrdinal = 0;
  for (const menu of rawMenus.menuCategories) {
    const expected = expectedGroups[menu.menuCatName];
    const actual = menu.menuGroups.map((group) => [group.menuGroupName, group.menuItems.length]);
    if (!expected || JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Asia Garden ${menu.menuCatName} group boundary changed: ${JSON.stringify(actual)}.`);
    }
    for (const group of menu.menuGroups) {
      const beverageSection = /^(?:beverages|soda)$/i.test(group.menuGroupName);
      categories.push({
        name: group.menuGroupName,
        sourceGroupOrdinal,
        sortOrdinal: beverageSection ? 10_000 + sourceGroupOrdinal : sourceGroupOrdinal,
      });
      group.menuItems.forEach((item, itemOrdinal) => {
        for (const size of item.menuItemSizes ?? []) {
          if (size.modifierBuilderTemplateId > 0 && !templatesById.has(size.modifierBuilderTemplateId)) {
            throw new Error(`Missing modifier template ${size.modifierBuilderTemplateId} for ${item.menuItemName}.`);
          }
        }
        rows.push({ menu, group, item, itemOrdinal, sourceGroupOrdinal });
      });
      sourceGroupOrdinal += 1;
    }
  }
  if (rows.length !== 242 || new Set(rows.map((row) => row.item.menuItemId)).size !== 242) {
    throw new Error(`Asia Garden product boundary changed: expected 242 unique source presentations, got ${rows.length}.`);
  }

  const baseIds = rows.map((row) => slugify(row.item.menuItemName));
  const duplicateBaseIds = new Set(baseIds.filter((id, index) => baseIds.indexOf(id) !== index));
  const categoryOrder = new Map(categories.map((category) => [category.name, category.sortOrdinal]));
  const items = rows.map((row) => {
    const baseId = slugify(row.item.menuItemName);
    const id = duplicateBaseIds.has(baseId)
      ? `${baseId}-${slugify(row.group.menuGroupName)}`
      : baseId;
    const description = cleanSpace(row.item.menuItemDesc) || null;
    const sourceUrl = row.menu.menuCatName === "Lunch Menu"
      ? sourceUrlsAsiaGarden.lunch
      : sourceUrlsAsiaGarden.allDay;
    return {
      id,
      name: cleanSpace(row.item.menuItemName),
      category: cleanSpace(row.group.menuGroupName),
      description,
      ingredientsText: description,
      imageUrl: row.item.menuItemImageUrl ?? null,
      isConfigurable: (row.item.menuItemSizes ?? []).length > 1 ||
        (row.item.menuItemSizes ?? []).some((size) =>
          size.modifierBuilderTemplateId > 0 && templatesById.has(size.modifierBuilderTemplateId)
        ),
      allergenSourceType: "unavailable",
      allergens: [],
      mayContain: [],
      sourceType: "restaurant-linked-owner-ordering-menu",
      sourceUrls: [sourceUrl],
      sourceSummary: "The current menu title and any raw restaurant-linked ordering description establish this published offering, but the source is not a restaurant-issued allergen guide or complete ingredient disclosure. Fixed allergens and cross-contact remain unavailable; cached vendor AI descriptions are excluded, and menu wording is used only as labeled Ingredient Intelligence context.",
      evidence: [{
        sourceKind: "restaurant-linked-menu-text",
        sourceUrl,
        text: [row.item.menuAliasNumber, row.item.menuItemName, description].filter(Boolean).join(" — "),
      }],
      variantGroup: cleanSpace(row.group.menuGroupName),
      menuSurface: row.menu.menuCatName,
      sourceMenuItemId: row.item.menuItemId,
      sourceAliasNumber: row.item.menuAliasNumber || null,
      sourceGroupOrdinal: row.sourceGroupOrdinal,
      sourceItemOrdinal: row.itemOrdinal,
    };
  }).sort((a, b) =>
    categoryOrder.get(a.category) - categoryOrder.get(b.category) ||
    a.sourceItemOrdinal - b.sourceItemOrdinal
  );

  if (new Set(items.map((item) => item.id)).size !== 242) {
    throw new Error("Asia Garden canonical IDs are not unique after category disambiguation.");
  }
  const rawDescriptionCount = items.filter((item) => item.description).length;
  const ignoredCachedAIDescriptionCount = Object.keys(aiDescriptions ?? {}).length;
  if (rawDescriptionCount !== 46 || ignoredCachedAIDescriptionCount !== 154) {
    throw new Error(`Asia Garden description boundary changed: ${rawDescriptionCount} raw / ${ignoredCachedAIDescriptionCount} cached AI.`);
  }
  return {
    categories: [...categories].sort((a, b) => a.sortOrdinal - b.sortOrdinal).map((category) => category.name),
    items,
    rawDescriptionCount,
    ignoredCachedAIDescriptionCount,
  };
}

function extractJsonObjectAfter(segment, marker) {
  const markerIndex = segment.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${marker} in Asia Garden owner menu payload.`);
  const start = segment.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error(`Missing JSON object after ${marker}.`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < segment.length; index += 1) {
    const character = segment[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return JSON.parse(segment.slice(start, index + 1));
  }
  throw new Error(`Unterminated JSON object after ${marker}.`);
}

function assertHomeIdentity(html) {
  const text = cleanSpace(cheerio.load(html)("body").text());
  if (
    !text.includes("Asia Garden") ||
    !text.includes("6935 Telegraph Rd, Alexandria, VA 22310") ||
    !text.includes("7039226666")
  ) throw new Error("Asia Garden owner homepage identity changed.");
}

function cleanSpace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAsiaGarden}/corrected-menu.json`);
  const snapshot = await buildAsiaGardenAuditSnapshot({ retrievedAt: "2026-07-15T12:57:00.000Z" });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    rawDescriptionCount: snapshot.rawDescriptionCount,
    ignoredCachedAIDescriptionCount: snapshot.ignoredCachedAIDescriptionCount,
  }, null, 2));
}
