import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

export const restaurantIdAshburnBiryaniGrill = "ashburn-biryani-grill-ashburn-va-dc-metro";

export const sourceUrlsAshburnBiryaniGrill = Object.freeze({
  brandMenu: "https://biryanigrill.com/",
  location: "https://biryanigrill.com/ashburn/",
  cashProfile: "https://cash.app/$biryanigrill/",
  locationsApi: "https://cash.app/cash-app/local/profiles/CALB_CAESDU1MUlc4SzBQRlpaMU0/locations?page_size=100",
  catalogApi: "https://cash.app/cash-app/local/profiles/CALB_CAESDU1MUlc4SzBQRlpaMU0/catalog?page_size=100&location_token=CALL_CAESDUxGTVowVkJXOTk4Vkc",
});

const sourceContracts = Object.freeze({
  brandMenu: {
    artifactPath: "data/restaurant-verification/artifacts/ashburn-biryani-grill-ashburn-va-dc-metro/official-brand-site.html",
    sha256: "e3d14165cb625fc85c2e886439694c67ee78d1fac42187b9443d79fcf6472b2f",
  },
  location: {
    artifactPath: "data/restaurant-verification/artifacts/ashburn-biryani-grill-ashburn-va-dc-metro/official-site.html",
    sha256: "f07ca4c9a648ba5a29a3c6740114a83f120e2b2579c74f717d33272e1401f109",
  },
  cashProfile: {
    artifactPath: "data/restaurant-verification/artifacts/ashburn-biryani-grill-ashburn-va-dc-metro/linked-cash-app-profile.html",
    sha256: "abb291e074c7a6ac43228cc65fba1a70646d658ec502d41ce918816be6152979",
  },
  locationsJson: {
    artifactPath: "data/restaurant-verification/artifacts/ashburn-biryani-grill-ashburn-va-dc-metro/linked-square-locations.json",
    sha256: "2f81db44aa4044ce7086baeda611fb10b31b15ecd8dcb871c323cf750e68d8db",
  },
  catalogJson: {
    artifactPath: "data/restaurant-verification/artifacts/ashburn-biryani-grill-ashburn-va-dc-metro/linked-square-ashburn-catalog.json",
    sha256: "3f12b439b7fbcce9fa5eff862530df9e521694e051463da6bb11308a64725bed",
  },
});

const ashburnLocationToken = "CALL_CAESDUxGTVowVkJXOTk4Vkc";
const expectedOfficialDescriptions = new Map([
  ["Mutton Biryani (Goat)", "Goat pieces marinated with spices cooked with basmati rice on low heat."],
  ["Chicken Dum Biryani", "Bone-in chicken marinated with spices cooked with basmati rice on low heat."],
  ["Paneer Biryani", "Cottage cheese (paneer) cubes marinated with spices, cooked with basmati rice on low heat."],
  ["Paneer Tikka", "Indian cottage cheese cubes grilled with onions and bell peppers."],
  ["Fish Tikka", "Fish lightly marinated and grilled to your order."],
  ["Hariyali Chicken", "Grilled chicken marinated in a green paste of fresh cilantro, mint, hot green chillies, yogurt and cashew."],
  ["Lababdar Paneer", "Soft paneer in indulgent gravy of tomato, onion, chili & spices."],
  ["Chicken Tikka Masala", "Boneless chicken tikka cooked in a creamy tomato curry."],
  ["Goat Curry", "Chunky pieces of goat simmered in an aromatic blend of spices and onions until thick and creamy."],
]);

const officialPositiveAllergens = new Map([
  ["Paneer Biryani", ["milk"]],
  ["Paneer Tikka", ["milk"]],
  ["Fish Tikka", ["fish"]],
  ["Hariyali Chicken", ["milk", "tree-nut"]],
  ["Lababdar Paneer", ["milk"]],
]);

export async function buildAshburnBiryaniGrillAuditSnapshot({
  retrievedAt = new Date().toISOString(),
} = {}) {
  const artifacts = {};
  const sourceStats = [];
  for (const [key, contract] of Object.entries(sourceContracts)) {
    const buffer = await readFile(path.resolve(contract.artifactPath));
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== contract.sha256) {
      throw new Error(`Ashburn Biryani Grill ${key} artifact hash changed: expected ${contract.sha256}, got ${actualSha256}.`);
    }
    artifacts[key] = buffer;
    sourceStats.push({ key, ...contract, actualSha256, byteLength: buffer.length });
  }

  assertLocationIdentity(
    JSON.parse(artifacts.locationsJson.toString("utf8")),
    artifacts.location.toString("utf8"),
  );
  const officialRows = parseOfficialBrandMenu(artifacts.brandMenu.toString("utf8"));
  const catalog = JSON.parse(artifacts.catalogJson.toString("utf8"));
  const parsed = parseLocationCatalog(catalog, officialRows);

  if (parsed.items.length !== 155 || parsed.categories.length !== 14) {
    throw new Error(`Ashburn catalog boundary changed: expected 155 items / 14 categories, got ${parsed.items.length} / ${parsed.categories.length}.`);
  }
  if (new Set(parsed.items.map((item) => item.id)).size !== 155) {
    throw new Error("Ashburn catalog contains duplicate canonical item IDs.");
  }
  if (parsed.items.some((item) => item.mayContain.length > 0)) {
    throw new Error("Ashburn catalog unexpectedly produced product-scoped cross-contact data.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAshburnBiryaniGrill,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAshburnBiryaniGrill),
    sourceStats,
    categoryCount: parsed.categories.length,
    categories: parsed.categories,
    itemCount: parsed.items.length,
    officialBrandMenuItemCount: officialRows.size,
    officialIngredientCount: parsed.items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: parsed.items.filter((item) => item.allergenSourceType === "unavailable").length,
    soldOutItemCount: parsed.items.filter((item) => item.currentlyOutOfStock).length,
    configurableItemCount: parsed.items.filter((item) => item.isConfigurable).length,
    linkedCatalogIngredientArrayCount: parsed.linkedCatalogIngredientArrayCount,
    linkedCatalogDietaryPreferenceCount: parsed.linkedCatalogDietaryPreferenceCount,
    items: parsed.items,
  };
}

export function parseOfficialBrandMenu(html) {
  const $ = cheerio.load(html);
  const rows = new Map();
  $("h4").each((_index, element) => {
    const name = cleanSpace($(element).text());
    if (!expectedOfficialDescriptions.has(name)) return;
    const description = cleanSpace($(element).parent().parent().find("p").first().text());
    rows.set(name, description);
  });
  if (rows.size !== expectedOfficialDescriptions.size) {
    throw new Error(`Owner brand-menu boundary changed: expected ${expectedOfficialDescriptions.size} featured products, got ${rows.size}.`);
  }
  for (const [name, description] of expectedOfficialDescriptions) {
    if (rows.get(name) !== description) {
      throw new Error(`Owner description changed for ${name}: ${JSON.stringify(rows.get(name))}.`);
    }
  }
  return rows;
}

export function parseLocationCatalog(payload, officialRows) {
  if (payload?.catalog?.page_info?.has_more !== false) {
    throw new Error("Ashburn linked catalog is paginated or has an unknown completion boundary.");
  }
  const entries = Object.entries(payload?.catalog?.entries ?? {});
  const categories = entries
    .filter(([, entry]) => entry.profile_category)
    .map(([key, entry]) => ({
      key,
      token: entry.profile_category.token,
      name: cleanSpace(entry.profile_category.name),
      sourceOrdinal: entry.ordinal,
      sortOrdinal: entry.profile_category.name === "Beverages" ? Number.MAX_SAFE_INTEGER : entry.ordinal,
    }))
    .sort((a, b) => a.sortOrdinal - b.sortOrdinal);
  const categoryByToken = new Map(categories.map((category) => [category.token, category]));
  let linkedCatalogIngredientArrayCount = 0;
  let linkedCatalogDietaryPreferenceCount = 0;
  const items = entries
    .filter(([, entry]) => entry.food_item)
    .map(([key, entry]) => {
      const item = entry.food_item;
      const categoryToken = key.split("/")[0];
      const category = categoryByToken.get(categoryToken);
      if (!category) throw new Error(`Missing category for linked item ${key}.`);
      linkedCatalogIngredientArrayCount += item.ingredients?.length ?? 0;
      linkedCatalogDietaryPreferenceCount += item.dietary_preferences?.length ?? 0;
      const name = cleanSpace(item.detail?.name);
      const linkedDescription = cleanSpace(item.detail?.description) || null;
      const officialDescription = officialRows.get(name) ?? null;
      const allergens = [...(officialPositiveAllergens.get(name) ?? [])];
      const hasOfficialPositive = allergens.length > 0;
      const sourceUrls = hasOfficialPositive
        ? [sourceUrlsAshburnBiryaniGrill.brandMenu, sourceUrlsAshburnBiryaniGrill.catalogApi]
        : [sourceUrlsAshburnBiryaniGrill.catalogApi];
      const sourceSummary = hasOfficialPositive
        ? "The current restaurant-issued brand menu directly names the ingredient terms supporting these positive signals, and the location-specific linked Square catalog confirms the product is currently published at Ashburn. Neither source is a complete allergen matrix, and no cross-contact statement was found."
        : officialDescription
          ? "The current restaurant-issued brand menu and location-specific linked Square catalog confirm this product, but the owner text does not explicitly establish a fixed major-allergen ingredient. The linked-vendor description is not promoted to official allergen evidence, and no cross-contact statement was found."
          : "The current location-specific linked Square catalog confirms this product but publishes empty ingredient and dietary-preference arrays. Linked-vendor menu wording is retained for context and Ingredient Intelligence only; allergen data remains unavailable and no cross-contact statement was found.";
      return {
        id: slugify(name),
        name,
        category: category.name,
        description: linkedDescription ?? officialDescription,
        ingredientsText: officialDescription ?? linkedDescription,
        imageUrl: item.detail?.images?.[0]?.light_url ?? null,
        isConfigurable: (item.modifier_list_configs?.length ?? 0) > 0 || (item.variations?.length ?? 0) > 1,
        allergenSourceType: hasOfficialPositive ? "official-ingredients" : "unavailable",
        allergens,
        mayContain: [],
        sourceType: hasOfficialPositive
          ? "restaurant-linked-square-catalog-and-official-brand-menu"
          : "restaurant-linked-square-catalog",
        sourceUrls,
        sourceSummary,
        evidence: [
          {
            sourceKind: "restaurant-linked-menu-text",
            sourceUrl: sourceUrlsAshburnBiryaniGrill.catalogApi,
            text: linkedDescription ? `${name}: ${linkedDescription}` : name,
          },
          ...(officialDescription ? [{
            sourceKind: "restaurant-issued-menu-text",
            sourceUrl: sourceUrlsAshburnBiryaniGrill.brandMenu,
            text: `${name}: ${officialDescription}`,
          }] : []),
        ],
        variantGroup: category.name,
        currentlyOutOfStock: item.availability === "LOCAL_CATALOG_AVAILABILITY_SOLD_OUT",
        sourceToken: item.token,
        sourceOrdinal: entry.ordinal,
        categorySourceOrdinal: category.sourceOrdinal,
      };
    })
    .sort((a, b) => {
      const categoryA = categoryByToken.get(entries.find(([key, entry]) => entry.food_item?.token === a.sourceToken)?.[0].split("/")[0]);
      const categoryB = categoryByToken.get(entries.find(([key, entry]) => entry.food_item?.token === b.sourceToken)?.[0].split("/")[0]);
      return categoryA.sortOrdinal - categoryB.sortOrdinal || a.sourceOrdinal - b.sourceOrdinal;
    });

  if (linkedCatalogIngredientArrayCount !== 0 || linkedCatalogDietaryPreferenceCount !== 0) {
    throw new Error("The linked catalog now contains ingredient or dietary-preference data and requires a fresh authority review.");
  }
  for (const name of officialRows.keys()) {
    if (!items.some((item) => item.name === name)) {
      throw new Error(`Owner-featured product ${name} is absent from the Ashburn location catalog.`);
    }
  }
  return {
    categories: categories.map((category) => category.name),
    items,
    linkedCatalogIngredientArrayCount,
    linkedCatalogDietaryPreferenceCount,
  };
}

function assertLocationIdentity(payload, locationHtml) {
  if (payload?.nearby_locations?.page_info?.has_more !== false) {
    throw new Error("Linked location response is incomplete.");
  }
  const location = payload.nearby_locations.local_locations?.find((entry) => entry.token === ashburnLocationToken);
  if (
    location?.name !== "Ashburn Biryani Grill" ||
    location?.address?.address_single_line?.toLowerCase() !== "43530 yukon dr" ||
    location?.address?.locality !== "Ashburn" ||
    location?.address?.state !== "VA" ||
    location?.phone?.formatted !== "(703) 480-0788"
  ) throw new Error("Linked Square catalog location identity changed.");
  const text = cleanSpace(cheerio.load(locationHtml)("body").text());
  if (!text.includes("43530 Yukon Dr") || !text.includes("(703) 480-0788")) {
    throw new Error("Owner location page no longer corroborates the linked Square location.");
  }
}

function cleanSpace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAshburnBiryaniGrill}/corrected-menu.json`);
  const snapshot = await buildAshburnBiryaniGrillAuditSnapshot({ retrievedAt: "2026-07-15T12:42:27.788Z" });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    soldOutItemCount: snapshot.soldOutItemCount,
  }, null, 2));
}
