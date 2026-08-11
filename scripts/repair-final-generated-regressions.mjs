import fs from "node:fs/promises";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "./ingredient-intelligence.mjs";
import { classifyMenuItemRow } from "./menu-item-quality.mjs";

const repositoryPath =
  process.env.RESTAURANT_REPOSITORY_PATH ?? "src/data/generated/restaurants.generated.json";
const repository = JSON.parse(await fs.readFile(repositoryPath, "utf8"));
const manifest = await getDefaultIngredientIntelligenceManifest();
const repairOnlyRestaurantId = process.env.RESTAURANT_REPAIR_ONLY_ID ?? null;

function restaurant(id) {
  if (repairOnlyRestaurantId && id !== repairOnlyRestaurantId) {
    return undefined;
  }
  return repository.restaurants?.find((entry) => entry.id === id);
}

function repairEntries() {
  return (repository.restaurants ?? []).filter(
    (entry) => !repairOnlyRestaurantId || entry.id === repairOnlyRestaurantId,
  );
}

function item(restaurantId, itemId) {
  return restaurant(restaurantId)?.items?.find((entry) => entry.id === itemId);
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function reviewedMenuItem({ name, category, description, sourceUrl, sourceType = "reviewed-menu", sourceKind = "reviewed-menu" }) {
  const base = {
    id: slugify(name),
    name,
    category,
    description,
    ingredientsText: description || null,
    imageUrl: null,
    isConfigurable: false,
    allergenSourceType: "unavailable",
    allergens: [],
    mayContain: [],
    sourceType,
    sourceUrls: [sourceUrl].filter(Boolean),
    evidence: [
      {
        sourceKind,
        sourceUrl,
        text: description ? `${name}: ${description}` : name,
      },
    ],
  };

  return annotateMenuItemWithIngredientIntelligence(base, { manifest });
}

function replaceReviewedMenu(restaurantId, items, note) {
  const entry = restaurant(restaurantId);
  if (!entry) {
    return;
  }

  entry.items = items;
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    extractedFoodItemCount: items.length,
    officialItemCount: 0,
    officialEvidenceBucket: "not-found",
    reviewedMenuQualityRepairs: [
      ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
      { replacedRows: items.length, note },
    ],
  };
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount: 0,
    officialEvidence: {
      officialFullMatrixOrApi: 0,
      officialIngredientDisclosure: 0,
      officialProductSection: 0,
      globalCrossContactNote: 0,
      unavailable: items.length,
      suspiciousOfficialParserFragments: 0,
      officialTotal: 0,
      totalItemCount: items.length,
      officialCoverageRatio: 0,
      bucket: "not-found",
    },
    officialTotal: 0,
    totalItemCount: items.length,
    officialCoverageRatio: 0,
    bucket: "not-found",
  };
}

function replaceReviewedOfficialIngredientMenu(restaurantId, rows, note) {
  const entry = restaurant(restaurantId);
  if (!entry) {
    return;
  }

  entry.items = rows.map(({ id, name, category, description, allergens, sourceUrl }) =>
    annotateMenuItemWithIngredientIntelligence(
      {
        id: id ?? slugify(name),
        name,
        category,
        description,
        ingredientsText: description || null,
        imageUrl: null,
        isConfigurable: false,
        allergenSourceType: "official-ingredients",
        allergens: [...(allergens ?? [])].sort(),
        mayContain: [],
        sourceType: "reviewed-official-menu-repair",
        sourceUrls: [sourceUrl].filter(Boolean),
        sourceSummary:
          "Reviewed official menu ingredient evidence: direct ingredient terms from public menu text were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
        evidence: [
          {
            sourceKind: "menu-ingredient-review",
            sourceUrl,
            text: `Reviewed official menu text: ${name}${description ? ` - ${description}` : ""}`,
          },
        ],
      },
      { manifest },
    ),
  );

  const officialItemCount = entry.items.length;
  entry.officialAllergenStatus = "extracted";
  entry.officialAllergenRemediationBucket = "official-disclosure-only";
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    extractedFoodItemCount: entry.items.length,
    officialItemCount,
    officialEvidenceBucket: "official-disclosure-only",
    reviewedMenuQualityRepairs: [
      ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
      { replacedRows: entry.items.length, note },
    ],
  };
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount,
    officialEvidence: {
      officialFullMatrixOrApi: 0,
      officialIngredientDisclosure: officialItemCount,
      officialProductSection: 0,
      globalCrossContactNote: 0,
      unavailable: 0,
      suspiciousOfficialParserFragments: 0,
      officialTotal: officialItemCount,
      totalItemCount: entry.items.length,
      officialCoverageRatio: 1,
      bucket: "official-disclosure-only",
    },
    officialTotal: officialItemCount,
    totalItemCount: entry.items.length,
    officialCoverageRatio: 1,
    bucket: "official-disclosure-only",
  };
}

function replaceVerifiedSquareIngredientMenu(restaurantId, snapshot, note) {
  const entry = restaurant(restaurantId);
  if (!entry) {
    return;
  }

  entry.items = (snapshot.items ?? []).map((row) => {
    const annotatedItem = annotateMenuItemWithIngredientIntelligence(
      {
        id: slugify(row.name),
        name: row.name,
        category: row.category,
        description: row.description,
        ingredientsText: row.ingredientsText,
        imageUrl: null,
        isConfigurable: Boolean(row.isConfigurable),
        allergenSourceType: row.allergenSourceType,
        allergens: [...(row.allergens ?? [])].sort(),
        mayContain: [...(row.mayContain ?? [])].sort(),
        sourceType: "square-online-api",
        sourceUrls: [row.sourceUrl, snapshot.apiUrl].filter(Boolean),
        sourceSummary:
          row.allergenSourceType === "official-ingredients"
            ? "Restaurant-linked Square product ingredient text was reviewed for direct allergen ingredients. This is not an allergen matrix and does not establish cross-contact safety."
            : "The restaurant-linked Square product did not provide a complete item-level ingredient or allergen disclosure; detailed allergen data remains unavailable.",
        evidence: [
          {
            sourceKind:
              row.allergenSourceType === "official-ingredients"
                ? "restaurant-linked-product-ingredients"
                : "restaurant-linked-product-description",
            sourceUrl: row.sourceUrl ?? snapshot.sourceUrl,
            text: row.ingredientsText ?? row.description ?? row.name,
          },
        ],
      },
      { manifest },
    );
    const explicitInference = {};
    for (const field of [
      "extractedIngredientMentions",
      "inferredIngredients",
      "inferredAllergenSignals",
      "inferenceQuestions",
      "inferenceSummary",
      "inferenceVersion",
    ]) {
      if (Object.hasOwn(row, field)) {
        explicitInference[field] = row[field];
      }
    }
    return { ...annotatedItem, ...explicitInference };
  });

  const officialItemCount = entry.items.filter(
    (menuItem) => menuItem.allergenSourceType === "official-ingredients",
  ).length;
  const unavailableItemCount = entry.items.length - officialItemCount;
  const officialCoverageRatio = entry.items.length > 0
    ? officialItemCount / entry.items.length
    : 0;

  entry.officialAllergenStatus = officialItemCount > 0 ? "extracted" : "not-found";
  entry.officialAllergenRemediationBucket = officialItemCount > 0
    ? "official-disclosure-only"
    : "not-found";
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    extractedFoodItemCount: entry.items.length,
    officialItemCount,
    officialEvidenceBucket: officialItemCount > 0 ? "official-disclosure-only" : "not-found",
    reviewedMenuQualityRepairs: [
      ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
      { replacedRows: entry.items.length, note },
    ],
  };
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount,
    officialEvidence: {
      officialFullMatrixOrApi: 0,
      officialIngredientDisclosure: officialItemCount,
      officialProductSection: 0,
      globalCrossContactNote: 0,
      unavailable: unavailableItemCount,
      suspiciousOfficialParserFragments: 0,
      officialTotal: officialItemCount,
      totalItemCount: entry.items.length,
      officialCoverageRatio,
      bucket: officialItemCount > 0 ? "official-disclosure-only" : "not-found",
    },
    officialTotal: officialItemCount,
    totalItemCount: entry.items.length,
    officialCoverageRatio,
    bucket: officialItemCount > 0 ? "official-disclosure-only" : "not-found",
  };
}

function replaceVerifiedMixedMenuSnapshot(restaurantId, snapshot, note) {
  const entry = restaurant(restaurantId);
  if (!entry) {
    return;
  }

  entry.items = (snapshot.items ?? []).map((row) => {
    const allergenSourceType = row.allergenSourceType ??
      ((row.allergens ?? []).length > 0 ? "official-ingredients" : "unavailable");
    const annotatedItem = annotateMenuItemWithIngredientIntelligence(
      {
        id: row.id ?? slugify(row.name),
        name: row.name,
        category: row.category,
        description: row.description,
        ingredientsText: row.ingredientsText ?? row.description ?? null,
        imageUrl: null,
        isConfigurable: Boolean(row.isConfigurable),
        allergenSourceType,
        allergens: [...(row.allergens ?? [])].sort(),
        mayContain: [...(row.mayContain ?? [])].sort(),
        sourceType: row.sourceType ?? snapshot.sourceType,
        sourceUrls: [...(row.sourceUrls ?? snapshot.sourceUrls ?? [])],
        sourceSummary:
          row.sourceSummary ?? (/official-faq/i.test(row.sourceType ?? "")
            ? "The restaurant's current FAQ and menu were reconciled for this item. Fixed ingredients remain separate from the FAQ's gluten and supplier nut cross-contact cautions; this does not establish safety from other allergens."
            : (row.mayContain ?? []).length > 0
              ? "The restaurant's current menu text explicitly identifies a may-contain allergen for this item. This does not establish safety from any other allergen or cross-contact source."
            : /official-allergy-guide/i.test(row.sourceType ?? "")
              ? "The restaurant-issued allergy guide and current restaurant-linked menu were reconciled for this item. The guide is not a complete allergen matrix, and its general kitchen cross-contact warning remains applicable."
            : allergenSourceType === "official-ingredients"
            ? "Direct ingredient terms from the restaurant's current menu text were reviewed for allergen signals. Menu descriptions are not a complete allergen matrix or cross-contact claim."
            : allergenSourceType === "official-global-cross-contact-note"
              ? "The restaurant's current menu explicitly warns that items labeled gluten-free may contact gluten in its shared kitchen; this is represented as may-contain gluten, not a negative claim."
              : "The current menu does not provide enough item-level ingredient or allergen detail for this item; allergen data remains unavailable."),
        evidence: row.evidence ?? (row.sourceUrls ?? snapshot.sourceUrls ?? []).map((sourceUrl) => ({
          sourceKind: /\/faq(?:[?#/]|$)/i.test(sourceUrl)
            ? "restaurant-issued-global-cross-contact-note"
            : /(?:placejoys\.com|restaurantji\.com)/i.test(sourceUrl)
              ? "third-party-menu-photo"
            : /allerg/i.test(sourceUrl)
              ? "restaurant-issued-allergy-guide"
            : /(?:toasttab\.com|square\.site|foodbooking\.com)/i.test(sourceUrl)
              ? "restaurant-linked-menu-text"
              : "restaurant-issued-menu-text",
          sourceUrl,
          text: row.ingredientsText ?? row.description ?? row.name,
        })),
        variantGroup: row.variantGroup ?? null,
      },
      { manifest },
    );
    const explicitInference = {};
    for (const field of [
      "extractedIngredientMentions",
      "inferredIngredients",
      "inferredAllergenSignals",
      "inferenceQuestions",
      "inferenceSummary",
      "inferenceVersion",
    ]) {
      if (Object.hasOwn(row, field)) {
        explicitInference[field] = row[field];
      }
    }
    return { ...annotatedItem, ...explicitInference };
  });

  const officialAllergenMenuCount = entry.items.filter(
    (menuItem) => menuItem.allergenSourceType === "official-allergen-menu",
  ).length;
  const officialIngredientCount = entry.items.filter(
    (menuItem) => menuItem.allergenSourceType === "official-ingredients",
  ).length;
  const officialProductSectionCount = entry.items.filter(
    (menuItem) => menuItem.allergenSourceType === "official-product-allergen-section",
  ).length;
  const globalCrossContactCount = entry.items.filter(
    (menuItem) => menuItem.allergenSourceType === "official-global-cross-contact-note",
  ).length;
  const restaurantLinkedIngredientCount = entry.items.filter(
    (menuItem) => menuItem.allergenSourceType === "restaurant-linked-menu-ingredients",
  ).length;
  const restaurantLinkedProductCount = entry.items.filter(
    (menuItem) =>
      menuItem.allergenSourceType === "restaurant-linked-product-allergen-section",
  ).length;
  const officialItemCount = officialAllergenMenuCount + officialIngredientCount +
    officialProductSectionCount + globalCrossContactCount;
  const restaurantLinkedItemCount = restaurantLinkedIngredientCount +
    restaurantLinkedProductCount;
  const unavailableItemCount = entry.items.length - officialItemCount -
    restaurantLinkedItemCount;
  const officialCoverageRatio = entry.items.length > 0
    ? officialItemCount / entry.items.length
    : 0;
  const evidenceBucket = officialItemCount > 0 ? "official-disclosure-only" : "not-found";

  entry.officialAllergenStatus = officialItemCount > 0 ? "extracted" : "not-found";
  entry.officialAllergenRemediationBucket = evidenceBucket;
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    extractedFoodItemCount: entry.items.length,
    officialItemCount,
    ...(restaurantLinkedItemCount > 0
      ? {
          restaurantLinkedItemCount,
          restaurantLinkedIngredientCount,
          restaurantLinkedProductCount,
        }
      : {}),
    officialEvidenceBucket: evidenceBucket,
    reviewedMenuQualityRepairs: [
      ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
      { replacedRows: entry.items.length, note },
    ],
  };
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount,
    officialEvidence: {
      officialFullMatrixOrApi: officialAllergenMenuCount,
      officialIngredientDisclosure: officialIngredientCount,
      officialProductSection: officialProductSectionCount,
      globalCrossContactNote: globalCrossContactCount,
      ...(restaurantLinkedItemCount > 0
        ? {
            restaurantLinkedIngredientDisclosure: restaurantLinkedIngredientCount,
            restaurantLinkedProductSection: restaurantLinkedProductCount,
            restaurantLinkedTotal: restaurantLinkedItemCount,
          }
        : {}),
      unavailable: unavailableItemCount,
      suspiciousOfficialParserFragments: 0,
      officialTotal: officialItemCount,
      totalItemCount: entry.items.length,
      officialCoverageRatio,
      bucket: evidenceBucket,
    },
    officialTotal: officialItemCount,
    totalItemCount: entry.items.length,
    officialCoverageRatio,
    bucket: evidenceBucket,
  };
}

function setOfficialCount(entry) {
  const officialItemCount = (entry.items ?? []).filter((menuItem) =>
    /official/i.test(String(menuItem.allergenSourceType ?? "")),
  ).length;
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount,
    officialTotal: officialItemCount,
    totalItemCount: entry.items?.length ?? 0,
  };
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    officialItemCount,
  };
}

function reconcileRestaurantCounts(entry) {
  const totalItemCount = entry.items?.length ?? 0;
  const officialItemCount = (entry.items ?? []).filter((menuItem) =>
    /official/i.test(String(menuItem.allergenSourceType ?? "")),
  ).length;
  const officialCoverageRatio = totalItemCount > 0 ? Number((officialItemCount / totalItemCount).toFixed(3)) : 0;

  entry.itemCount = totalItemCount;
  entry.menuItemCount = totalItemCount;
  entry.totalItemCount = totalItemCount;
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount,
    officialTotal: officialItemCount,
    totalItemCount,
    officialCoverageRatio,
    officialEvidence: {
      ...(entry.allergenDataStatus?.officialEvidence ?? {}),
      officialTotal: officialItemCount,
      totalItemCount,
      officialCoverageRatio,
    },
  };
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    extractedFoodItemCount: totalItemCount,
    officialItemCount,
  };
}

function repairBaanMaeLinkedMenuAllergens() {
  const entry = restaurant("baan-mae-dc");
  if (!entry) {
    return;
  }

  const verifiedContainsByItemId = new Map([
    ["gaeng-dang-catfish", ["fish"]],
    ["gaeng-dang-crab-puu", ["shellfish"]],
    ["goong", ["shellfish"]],
    ["green-crab", ["shellfish"]],
    ["hua-pii-salad", ["egg", "peanut"]],
    ["laab-catfish", ["fish"]],
    ["laab-goong-dang", ["fish", "shellfish"]],
    ["mee-sua", ["milk"]],
    ["pad", ["egg", "soy"]],
    ["pun-yaw", ["peanut", "shellfish"]],
    ["sakoo", ["peanut"]],
    ["salmon-belly", ["fish"]],
    ["thom-khem", ["fish"]],
    ["thom-khem-sam-chanh", ["egg", "fish"]],
    ["thom-khem-tofu", ["soy"]],
    ["turmeric-catfish", ["fish"]],
  ]);
  const sourceSummary =
    "Restaurant-linked Toast menu text explicitly names these ingredients or an unavoidable allergen identity. This is partial positive evidence only; it does not establish allergen absence, completeness, or cross-contact status.";
  const linkedReviewSourceKind = "restaurant-linked-menu-ingredient-review";
  let linkedVendorIngredientItemCount = 0;

  for (const menuItem of entry.items ?? []) {
    const contains = verifiedContainsByItemId.get(menuItem.id) ?? [];
    menuItem.allergens = [...contains];
    menuItem.mayContain = [];
    delete menuItem.officialSource;
    menuItem.evidence = (menuItem.evidence ?? []).filter(
      (evidence) => evidence.sourceKind !== linkedReviewSourceKind,
    );

    if (contains.length === 0) {
      menuItem.allergenSourceType = "unavailable";
      delete menuItem.sourceSummary;
      continue;
    }

    linkedVendorIngredientItemCount += 1;
    const sourceUrl =
      (menuItem.sourceUrls ?? []).find((url) => /toasttab\.com/i.test(String(url))) ??
      "https://www.toasttab.com/local/order/baanmaedc";
    menuItem.allergenSourceType = "restaurant-linked-menu-ingredients";
    menuItem.sourceSummary = sourceSummary;
    menuItem.evidence.push({
      sourceKind: linkedReviewSourceKind,
      sourceUrl,
      text: `${menuItem.name}${menuItem.description ? `: ${menuItem.description}` : ""}`,
    });
  }

  entry.officialAllergenStatus = "not-found";
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    officialItemCount: 0,
    officialEvidenceBucket: "not-found",
    linkedVendorIngredientItemCount,
    baanMaeVerifiedAllergenRepair: {
      reviewedItemCount: entry.items?.length ?? 0,
      linkedVendorIngredientItemCount,
      unavailableItemCount: (entry.items?.length ?? 0) - linkedVendorIngredientItemCount,
      note: sourceSummary,
    },
  };
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount: 0,
    officialTotal: 0,
    totalItemCount: entry.items?.length ?? 0,
    officialCoverageRatio: 0,
    bucket: "not-found",
    linkedVendorIngredientItemCount,
    officialEvidence: {
      officialFullMatrixOrApi: 0,
      officialIngredientDisclosure: 0,
      officialProductSection: 0,
      globalCrossContactNote: 0,
      unavailable: entry.items?.length ?? 0,
      suspiciousOfficialParserFragments: 0,
      officialTotal: 0,
      totalItemCount: entry.items?.length ?? 0,
      officialCoverageRatio: 0,
      bucket: "not-found",
    },
  };
}

function clearOfficialAllergens(entry, note) {
  for (const menuItem of entry.items ?? []) {
    menuItem.allergenSourceType = "unavailable";
    menuItem.allergens = [];
    menuItem.mayContain = [];
    menuItem.sourceSummary = note;
  }
  entry.officialAllergenStatus = "not-found";
  entry.officialAllergenRemediationBucket = "not-found";
  entry.allergenDataStatus = {
    ...(entry.allergenDataStatus ?? {}),
    officialItemCount: 0,
    officialTotal: 0,
    totalItemCount: entry.items?.length ?? 0,
  };
  entry.sourceStatus = {
    ...(entry.sourceStatus ?? {}),
    officialItemCount: 0,
    officialAllergenRemediationBucket: "not-found",
    reviewedMenuQualityRepairs: [
      ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
      { note },
    ],
  };
}

function normalizeOfficialAllergenMatchKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\bw\/\b/gi, " with ")
    .replace(/\bno\b/gi, "without")
    .replace(/\bcafe\b/gi, "")
    .replace(/\bentree\b/gi, "")
    .replace(/\bside\b/gi, "")
    .replace(/\bregular\b/gi, "")
    .replace(/\bmini\b/gi, "")
    .replace(/\b(?:cup|bowl|slice|stack|ea|oz)\b/gi, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\*+/, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function officialAllergenMatchCandidates(value) {
  const normalized = normalizeOfficialAllergenMatchKey(value);
  return [
    normalized,
    normalized.replace(/\bpanini\b/g, "").trim(),
    normalized.replace(/\bon harvest bread\b/g, "on harvest").trim(),
    normalized.replace(/\bon harvest\b/g, "").trim(),
    normalized.replace(/\bon white bread\b/g, "on white").trim(),
    normalized.replace(/\bon white\b/g, "").trim(),
    normalized.replace(/\bwith tomato soup dipper\b/g, "with tomato dipper").trim(),
    normalized.replace(/\bgrilled cheese bacon and tomato\b/g, "grilled cheese bacon tomato").trim(),
  ].filter(Boolean);
}

function indexOfficialAllergenRows(rows) {
  const index = new Map();
  for (const row of rows ?? []) {
    for (const key of officialAllergenMatchCandidates(row.name)) {
      if (!index.has(key)) {
        index.set(key, row);
      }
    }
  }
  return index;
}

function findOfficialAllergenRow(index, menuItem) {
  const candidates = officialAllergenMatchCandidates(menuItem?.name);
  for (const key of candidates) {
    const exact = index.get(key);
    if (exact) {
      return exact;
    }
  }

  for (const key of candidates) {
    if (key.length < 8) {
      continue;
    }
    for (const [rowKey, row] of index.entries()) {
      if (rowKey.length < 8) {
        continue;
      }
      if (key.includes(rowKey) || rowKey.includes(key)) {
        return row;
      }
    }
  }

  return null;
}

{
  const smoothieKing = restaurant("smoothie-king");
  if (smoothieKing) {
    smoothieKing.officialAllergenStatus = "extracted";
    smoothieKing.officialAllergenRemediationBucket = "official-full";
    const angelFood = item("smoothie-king", "angel-food-20-ounce");
    if (angelFood) {
      angelFood.allergenSourceType = "official-allergen-menu";
      angelFood.allergens = ["milk"];
      angelFood.mayContain = [];
      angelFood.evidence = [
        ...(angelFood.evidence ?? []).filter((entry) => !/Smoothie King allergen disclosure/i.test(String(entry?.text ?? ""))),
        {
          sourceKind: "official-allergen-disclosure",
          sourceUrl: "https://www.smoothieking.com/menu/smoothies/angel-food/",
          text: "Official Smoothie King allergen disclosure: Milk.",
        },
      ];
    }
    const cocoaHazeBowl = item("smoothie-king", "acai-cocoa-haze-bowl");
    if (cocoaHazeBowl) {
      cocoaHazeBowl.allergenSourceType = "official-allergen-menu";
      cocoaHazeBowl.allergens = ["tree-nut"];
      cocoaHazeBowl.mayContain = [];
    }
    const officialItems = (smoothieKing.items ?? []).filter(
      (menuItem) => menuItem.allergenSourceType === "official-allergen-menu",
    );
    smoothieKing.allergenDataStatus = {
      ...(smoothieKing.allergenDataStatus ?? {}),
      officialItemCount: officialItems.length,
      officialTotal: officialItems.length,
      totalItemCount: smoothieKing.items?.length ?? 0,
    };
    smoothieKing.sourceStatus = {
      ...(smoothieKing.sourceStatus ?? {}),
      officialItemCount: smoothieKing.allergenDataStatus.officialItemCount,
      officialAllergenRemediationBucket: "official-full",
    };
  }
}

{
  const elephant = restaurant("elephant-and-castle-washington-dc-dc-metro");
  if (elephant) {
    clearOfficialAllergens(
      elephant,
      "Final generated repair: Canada-only nutrition/allergen source is not applicable to the DC restaurant.",
    );
    elephant.officialAllergenStatus = "not-applicable";
    elephant.officialAllergenRemediationBucket = "official-source-not-applicable-to-location";
    elephant.sourceStatus.officialAllergenRemediationBucket = "official-source-not-applicable-to-location";
    elephant.items = (elephant.items ?? []).filter((menuItem) =>
      menuItem.id !== "sausage" &&
      !/Serving Size|Cholesterol|Canadian locations only/i.test(String(menuItem.ingredientsText ?? "")),
    );
  }
}

{
  const crumbl = restaurant("crumbl");
  if (crumbl) {
    for (const menuItem of crumbl.items ?? []) {
      if (!/^https:\/\/crumblcookies\.com\/profiles\//i.test(String(menuItem.sourceUrls?.[0] ?? ""))) {
        menuItem.allergenSourceType = "unavailable";
        menuItem.allergens = [];
        menuItem.mayContain = [];
      }
    }
    crumbl.officialAllergenStatus = "extracted";
    setOfficialCount(crumbl);
  }
}

{
  const sushiTaro = restaurant("sushi-taro-dc");
  if (sushiTaro) {
    sushiTaro.officialAllergenStatus = "extracted";
    sushiTaro.officialAllergenRemediationBucket = "official-partial";
    setOfficialCount(sushiTaro);
  }
}

{
  const silverAndSons = restaurant("silver-and-sons-bbq-bethesda-md");
  if (silverAndSons) {
    clearOfficialAllergens(
      silverAndSons,
      "Final generated repair: gluten-free legend markers are menu flags, not contains-gluten official allergen rows.",
    );
  }
}

{
  const silverDiner = restaurant("silver-diner-dc");
  if (silverDiner) {
    clearOfficialAllergens(
      silverDiner,
      "Final generated repair: removed global legend/template allergen smear from generated rows.",
    );
  }
}

const directFixes = [
  ["mi-vida-washington-dc-dc-metro", "zanahorias", ["milk", "peanut"], []],
  ["replacement-redrocks-pizza-washington-dc", "ny-steak-and-cheese", ["milk"], []],
  ["la-casita-pupusas-dc", "bowl-fresh-shrimp", ["shellfish"], []],
  ["la-casita-pupusas-dc", "lc-taco-bowl-shrimp", ["shellfish"], []],
  ["la-casita-gaithersburg-dc-metro", "mixto-leche", ["tree-nut", "milk", "gluten"], []],
  ["sticky-fingers-bakery-dc", "almond-croissant-tray", ["gluten", "soy", "tree-nut", "wheat"], []],
  ["bandit-taco-dc", "tres-leches", ["egg", "gluten", "milk", "wheat"], []],
];

for (const [restaurantId, itemId, allergens, mayContain] of directFixes) {
  const menuItem = item(restaurantId, itemId);
  if (menuItem) {
    menuItem.allergens = allergens;
    menuItem.mayContain = mayContain;
    menuItem.allergenSourceType = allergens.length ? "official-ingredients" : "unavailable";
  }
}

{
  const baanCoconutSoup = item("baan-siam-dc", "coconut-soup-with-chicken");
  if (baanCoconutSoup) {
    baanCoconutSoup.allergenSourceType = "unavailable";
    baanCoconutSoup.allergens = [];
    baanCoconutSoup.mayContain = [];
  }
}

{
  const masalaFries = item("mama-tigre-oakton-va", "masala-fries");
  if (masalaFries) {
    const annotated = annotateMenuItemWithIngredientIntelligence(
      {
        ...masalaFries,
        ingredientsText:
          masalaFries.ingredientsText || "Crispy fries, tikka sauce, masala queso, crema, cilantro, and chile de arbol.",
      },
      { manifest },
    );
    Object.assign(masalaFries, annotated);
    if (!masalaFries.inferredAllergenSignals?.some((signal) => signal.id === "milk")) {
      masalaFries.inferredAllergenSignals = [
        ...(masalaFries.inferredAllergenSignals ?? []),
        { id: "milk", c: "high", e: ["ingredient:masala queso", "ingredient:crema"] },
      ];
    }
  }
}

{
  const villaYaraSalad = item("replacement-villa-yara-washington-dc", "lebanese-farmers-salad-and");
  if (villaYaraSalad) {
    villaYaraSalad.id = "lebanese-farmers-salad-with-lemon-potato-panzanella";
    villaYaraSalad.name = "Lebanese Farmer's Salad with Lemon Potato Panzanella";
    villaYaraSalad.sourceSummary =
      "Reviewed Villa Yara official lunch PDF row: repaired a line-break title split and preserved wheat/gluten evidence from crisp pita.";
    villaYaraSalad.evidence = [
      ...(villaYaraSalad.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Villa Yara lunch PDF row; the parsed title ended with a dangling conjunction, but the row describes a Lebanese farmer's salad with lemon potato panzanella, tomato, cucumber, herbs, sumac, and crisp pita.",
      },
    ];
  }
}

replaceReviewedMenu(
  "osm-jack-s-place-11761082628",
  [
    reviewedMenuItem({
      name: "Rise and Shine Combo",
      category: "Breakfast",
      description: "Breakfast combo from the current Jack's Place delivery menu.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "French Toast Combo",
      category: "Breakfast",
      description: "French toast breakfast combo.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "House Omelette",
      category: "Breakfast",
      description: "Omelette from the current Jack's Place delivery menu.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Breakfast Panini",
      category: "Breakfast",
      description: "Breakfast panini.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Croissant Sandwich",
      category: "Breakfast",
      description: "Breakfast sandwich served on a croissant.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "BLT Sandwich",
      category: "Sandwiches",
      description: "BLT sandwich.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Club Sandwich",
      category: "Sandwiches",
      description: "Club sandwich.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Steak & Cheese Sub",
      category: "Sandwiches",
      description: "Steak and cheese sub.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Spicy Chicken Sub",
      category: "Sandwiches",
      description: "Spicy chicken sub.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Cheeseburger with Fries",
      category: "Burgers",
      description: "Cheeseburger served with fries.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Bacon Cheeseburger with Fries",
      category: "Burgers",
      description: "Bacon cheeseburger served with fries.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Veggie Burger with Fries",
      category: "Burgers",
      description: "Veggie burger served with fries.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "New England Clam Chowder",
      category: "Soups",
      description: "New England clam chowder.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Chicken Noodle Soup",
      category: "Soups",
      description: "Chicken noodle soup.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Avo Chicken Salad",
      category: "Salads",
      description: "Avocado chicken salad.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
    reviewedMenuItem({
      name: "Mongolian Beef Bowl",
      category: "Bowls",
      description: "Mongolian beef bowl.",
      sourceUrl: "https://order.online/store/jack%27s-place-alexandria-25696057",
      sourceType: "reviewed-third-party-menu",
      sourceKind: "reviewed-delivery-menu",
    }),
  ],
  "Reviewed Jack's Place delivery menu after configured source produced only cuisine/contact cards; added current menu rows as non-official reviewed menu evidence.",
);

replaceReviewedMenu(
  "osm-la-brasita-10119939334",
  [
    reviewedMenuItem({
      name: "Chips + Guac",
      category: "Starters",
      description: "Fresh guacamole with tortilla chips.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Fish Ceviche",
      category: "Starters",
      description: "Mahi mahi, lime, onion, cilantro, camote, and tortilla chips.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Yuca Con Chicharron",
      category: "Starters",
      description: "Fried yuca topped with pan fried pork, curtido, and salsa.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Platanos Con Crema",
      category: "Starters",
      description: "Fried plantains, sour cream, and refried beans.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Taquitos",
      category: "Antojitos",
      description: "Crispy rolled chicken taquitos with lettuce, pico de gallo, tomato salsa, and parmesan cheese.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Maryland Pupusa",
      category: "Pupusas",
      description: "Pupusa filled with crab, cheese, and Old Bay seasoning.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Fajita Salmon Y Camaron",
      category: "Fajitas",
      description:
        "Grilled salmon and shrimp served on vegetables with yellow rice, red beans, sour cream, pico de gallo, guacamole, and flour tortillas.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Carne Asada Taco",
      category: "Tacos",
      description: "Carne asada taco.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
    reviewedMenuItem({
      name: "Salmon Taco",
      category: "Tacos",
      description: "Salmon taco.",
      sourceUrl: "https://www.labrasita.com/menu",
      sourceType: "official-menu-page",
      sourceKind: "official-menu-page",
    }),
  ],
  "Reviewed La Brasita official menu page after previous scrape captured website widget template text; added concise source-backed menu rows as non-allergen official menu evidence.",
);

{
  const greenAlmond = restaurant("green-almond-pantry-dc");
  if (greenAlmond && (greenAlmond.items ?? []).length === 0) {
    greenAlmond.sourceFamily = "manual-review";
    greenAlmond.parserProfile = "no-current-menu-shell";
    greenAlmond.sourceProfile = "manual-review:no-current-menu";
    greenAlmond.officialAllergenStatus = "not-applicable";
    greenAlmond.officialAllergenRemediationBucket = "no-current-menu-found";
    greenAlmond.sourceStatus = {
      ...(greenAlmond.sourceStatus ?? {}),
      accommodationOnly: true,
      officialItemCount: 0,
      officialAllergenRemediationBucket: "no-current-menu-found",
      reviewedMenuQualityRepairs: [
        ...(greenAlmond.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          replacedRows: 0,
          note:
            "Reviewed Green Almond Pantry current official/public sources: no reliable current itemized menu is published; public listings describe a rotating menu and active-status ambiguity, so the restaurant is retained as a no-current-menu shell rather than publishing directory/template rows.",
        },
      ],
    };
    greenAlmond.allergenDataStatus = {
      ...(greenAlmond.allergenDataStatus ?? {}),
      officialItemCount: 0,
      officialEvidence: {
        officialFullMatrixOrApi: 0,
        officialIngredientDisclosure: 0,
        officialProductSection: 0,
        globalCrossContactNote: 0,
        unavailable: 0,
        suspiciousOfficialParserFragments: 0,
        officialTotal: 0,
        totalItemCount: 0,
        officialCoverageRatio: 0,
        bucket: "no-current-menu-shell",
      },
      officialTotal: 0,
      totalItemCount: 0,
      officialCoverageRatio: 0,
      bucket: "no-current-menu-shell",
    };
  }
}

for (const id of [
  "smoothie-king",
  "crumbl",
  "sushi-taro-dc",
  "mi-vida-washington-dc-dc-metro",
  "replacement-redrocks-pizza-washington-dc",
  "la-casita-pupusas-dc",
  "sticky-fingers-bakery-dc",
  "baan-siam-dc",
]) {
  const entry = restaurant(id);
  if (entry) {
    setOfficialCount(entry);
  }
}

{
  const smoothieKing = restaurant("smoothie-king");
  if (smoothieKing) {
    for (const menuItem of smoothieKing.items ?? []) {
      const hasOfficialProductEvidence =
        menuItem.sourceType === "official-api" &&
        (menuItem.sourceUrls ?? []).some((url) => /smoothieking\.com\/menu\//i.test(String(url))) &&
        (menuItem.evidence ?? []).some((entry) => /Official Smoothie King/i.test(String(entry?.text ?? "")));

      if (hasOfficialProductEvidence) {
        menuItem.allergenSourceType = "official-allergen-menu";
        menuItem.allergenSource = "Official Smoothie King product allergen disclosure.";
        menuItem.mayContain = menuItem.mayContain ?? [];
      }
    }

    const officialProductItemCount = (smoothieKing.items ?? []).filter((menuItem) =>
      menuItem.allergenSourceType === "official-allergen-menu" &&
      (menuItem.sourceUrls ?? []).some((url) => /smoothieking\.com\/menu\//i.test(String(url))),
    ).length;
    smoothieKing.allergenDataStatus = {
      ...(smoothieKing.allergenDataStatus ?? {}),
      officialItemCount: officialProductItemCount,
      officialTotal: officialProductItemCount,
      totalItemCount: smoothieKing.items?.length ?? 0,
    };
    smoothieKing.sourceStatus = {
      ...(smoothieKing.sourceStatus ?? {}),
      officialItemCount: smoothieKing.allergenDataStatus.officialItemCount,
    };
  }
}

{
  const cookieDoughBits = item("crumbl", "cookie-dough-bits");
  if (cookieDoughBits) {
    cookieDoughBits.allergenSourceType = "unavailable";
    cookieDoughBits.allergens = [];
    cookieDoughBits.mayContain = [];
  }
  const crumbl = restaurant("crumbl");
  if (crumbl) {
    const almondCookie = crumbl.items?.find((menuItem) => menuItem.name === "Almond Coconut Fudge Cookie");
    if (almondCookie) {
      almondCookie.allergens = ["wheat", "milk", "egg", "soy", "tree-nut"];
    }
    setOfficialCount(crumbl);
  }
}

{
  const changExtra = item("chang-chang-dc", "beef-and-broccoli");
  if (changExtra) {
    changExtra.allergenSourceType = "unavailable";
    changExtra.allergens = [];
    changExtra.mayContain = [];
  }
  const changChang = restaurant("chang-chang-dc");
  if (changChang) {
    setOfficialCount(changChang);
  }
}

{
  const stickyFingers = restaurant("sticky-fingers-bakery-dc");
  if (stickyFingers) {
    for (const menuItem of stickyFingers.items ?? []) {
      if (!/official/i.test(String(menuItem.allergenSourceType ?? ""))) {
        continue;
      }
      menuItem.allergens = (menuItem.allergens ?? []).filter(
        (allergen) => allergen !== "milk" && allergen !== "egg",
      );
      menuItem.mayContain = (menuItem.mayContain ?? []).filter(
        (allergen) => allergen !== "milk" && allergen !== "egg",
      );
    }
    setOfficialCount(stickyFingers);
  }
}

{
  const peterChangExtra = item("peter-chang-mclean-va", "family-combo");
  if (peterChangExtra) {
    peterChangExtra.allergenSourceType = "unavailable";
    peterChangExtra.allergens = [];
    peterChangExtra.mayContain = [];
  }
  const peterChang = restaurant("peter-chang-mclean-va");
  if (peterChang) {
    setOfficialCount(peterChang);
  }
}

{
  const gaithersburgCeviche = item("la-casita-gaithersburg-dc-metro", "ceviche-americas");
  if (gaithersburgCeviche) {
    gaithersburgCeviche.allergens = ["fish", "shellfish"];
    gaithersburgCeviche.mayContain = [];
    gaithersburgCeviche.allergenSourceType = "official-ingredients";
  }
  const gaithersburg = restaurant("la-casita-gaithersburg-dc-metro");
  if (gaithersburg) {
    setOfficialCount(gaithersburg);
  }
}

{
  const banditVeggieTaco = item("bandit-taco-dc", "veggie-taco");
  if (banditVeggieTaco) {
    banditVeggieTaco.allergens = ["milk"];
    banditVeggieTaco.mayContain = [];
    banditVeggieTaco.allergenSourceType = "official-ingredients";
  }
  const bandit = restaurant("bandit-taco-dc");
  if (bandit) {
    setOfficialCount(bandit);
  }
}

{
  const rakuyaMushroomAsparagus = item("rakuya-dc", "mushroom-asparagus");
  if (rakuyaMushroomAsparagus) {
    rakuyaMushroomAsparagus.allergenSourceType = "unavailable";
    rakuyaMushroomAsparagus.allergens = [];
    rakuyaMushroomAsparagus.mayContain = [];
    rakuyaMushroomAsparagus.sourceSummary =
      "Final generated repair: removed neighboring bento/sashimi text bleed from this menu row; no item-specific official allergen claim is published.";
    rakuyaMushroomAsparagus.evidence = (rakuyaMushroomAsparagus.evidence ?? []).filter(
      (entry) => !/DELUXE BENTO BOX|Sashimi/i.test(String(entry?.text ?? "")),
    );
  }
  const rakuya = restaurant("rakuya-dc");
  if (rakuya) {
    setOfficialCount(rakuya);
  }
}

{
  const northsideFalseOfficialRows = [
    "cinco-de-junio",
    "concepcion-huista",
    "finca-la-hermosa",
    "london-fog",
    "medium-roast",
    "overnight-oats",
    "sunboy",
  ];
  for (const itemId of northsideFalseOfficialRows) {
    const menuItem = item("northside-social-va", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergenSourceType = "unavailable";
    menuItem.allergens = [];
    menuItem.mayContain = [];
    menuItem.sourceSummary =
      "Final generated repair: removed weak tasting-note, beverage, or incomplete-row allergen promotion; no item-specific official allergen claim is published.";
  }
  const northside = restaurant("northside-social-va");
  if (northside) {
    setOfficialCount(northside);
  }
}

{
  const osteriaMozzarella = item("osteria-mozza-dc", "mozzarella");
  if (osteriaMozzarella) {
    osteriaMozzarella.allergenSourceType = "unavailable";
    osteriaMozzarella.allergens = [];
    osteriaMozzarella.mayContain = [];
    osteriaMozzarella.sourceSummary =
      "Final generated repair: standalone mozzarella-bar header/selection row is not treated as an official allergen item.";
  }
  const osteriaMozza = restaurant("osteria-mozza-dc");
  if (osteriaMozza) {
    osteriaMozza.officialAllergenStatus = "not-found";
    osteriaMozza.officialAllergenRemediationBucket = "not-found";
    setOfficialCount(osteriaMozza);
  }
}

{
  const northsideFalseTastingNoteIds = [
    "cinco-de-junio",
    "concepcion-huista",
    "finca-la-hermosa",
    "medium-roast",
    "london-fog",
    "sunboy",
    "steel-cut-oatmeal",
    "overnight-oats",
  ];
  for (const itemId of northsideFalseTastingNoteIds) {
    const menuItem = item("northside-social-va", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergenSourceType = "unavailable";
    menuItem.allergens = [];
    menuItem.mayContain = [];
    menuItem.sourceSummary =
      "Final generated repair: tasting notes, coconut flavor text, or optional milk-context text are not item-level official allergen claims.";
  }
  const northsideSocial = restaurant("northside-social-va");
  const londonFog = item("northside-social-va", "london-fog");
  if (londonFog) {
    londonFog.allergenSourceType = "official-ingredients";
    londonFog.allergens = ["tree-nut"];
    londonFog.mayContain = [];
    londonFog.sourceSummary =
      "Final generated repair: restored menu-row allergen evidence for London Fog while keeping coffee tasting-note rows suppressed.";
  }
  if (northsideSocial) {
    setOfficialCount(northsideSocial);
  }
}

{
  const rocklandsPlainRibs = item("rocklands-bbq-dc", "baby-back-ribs-half-rack");
  if (rocklandsPlainRibs) {
    rocklandsPlainRibs.allergenSourceType = "unavailable";
    rocklandsPlainRibs.allergens = [];
    rocklandsPlainRibs.mayContain = [];
    rocklandsPlainRibs.sourceSummary =
      "Final generated repair: plain rib row has no item-specific official allergen evidence; sauce/side assumptions are not published as official allergens.";
  }
  const rocklands = restaurant("rocklands-bbq-dc");
  if (rocklands) {
    setOfficialCount(rocklands);
  }
}

{
  for (const itemId of ["chiko-pop", "chiko-pops-1pc"]) {
    const menuItem = item("chiko-dc", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergens = ["peanut", "sesame", "tree-nut"];
    menuItem.mayContain = [];
    menuItem.allergenSourceType = "official-ingredients";
    menuItem.sourceSummary =
      "Final generated repair: CHIKO official Toast row says chocolate-coated peanut butter pop with coconut, sesame, and sea salt; no wheat/gluten or milk term is item-specific.";
  }
  const chiko = restaurant("chiko-dc");
  if (chiko) {
    setOfficialCount(chiko);
  }
}

{
  for (const itemId of ["chiko-pop", "chiko-pops-1pc"]) {
    const menuItem = item("chiko-dc", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergenSourceType = "official-ingredients";
    menuItem.allergens = ["peanut", "sesame", "tree-nut"];
    menuItem.mayContain = [];
    menuItem.sourceSummary =
      "Final generated repair: item-specific official menu text names peanut butter, coconut, sesame, and sea salt; weak chocolate/baked-good assumptions are not published as official allergens.";
  }
  const chikoFullMonty = item("chiko-dc", "full-monty");
  if (chikoFullMonty) {
    chikoFullMonty.allergenSourceType = "official-ingredients";
    chikoFullMonty.allergens = ["egg", "fish", "milk"];
    chikoFullMonty.mayContain = [];
    chikoFullMonty.sourceSummary =
      "Final generated repair: item-specific official menu text names umami egg, smoked trout roe, and furikake butter; weak rice/seasoning wheat assumptions are not published as official allergens.";
  }
  const chiko = restaurant("chiko-dc");
  if (chiko) {
    setOfficialCount(chiko);
  }
}

{
  const fullMonty = item("chiko-dc", "full-monty");
  if (fullMonty) {
    fullMonty.allergens = ["egg", "fish", "milk"];
    fullMonty.mayContain = [];
    fullMonty.allergenSourceType = "official-ingredients";
    fullMonty.sourceSummary =
      "Final generated repair: CHIKO official Toast row supports egg, fish, and milk from umami egg, trout roe, and furikake butter; no wheat/gluten term is item-specific.";
  }
  const chiko = restaurant("chiko-dc");
  if (chiko) {
    setOfficialCount(chiko);
  }
}

{
  const rocklandsPlainRows = ["baby-back-ribs-half-rack"];
  for (const itemId of rocklandsPlainRows) {
    const menuItem = item("rocklands-bbq-dc", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergenSourceType = "unavailable";
    menuItem.allergens = [];
    menuItem.mayContain = [];
    menuItem.sourceSummary =
      "Final generated repair: plain rib row has no item-specific official wheat/gluten ingredient evidence.";
  }
  const rocklands = restaurant("rocklands-bbq-dc");
  if (rocklands) {
    setOfficialCount(rocklands);
  }
}

{
  for (const itemId of [
    "curry-and-stew",
    "roasted-duck-slow-cooked-in-herbal-soup-broth",
    "stir-fried-beef-tenderloin-cubes-with-white-rice-and-fries",
  ]) {
    const menuItem = item("hu-tieu-mi-lacay-cho-lon-falls-church-va", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergenSourceType = "unavailable";
    menuItem.allergens = [];
    menuItem.mayContain = [];
    menuItem.sourceSummary =
      "Final generated repair: category/header or no-concern menu row is not published as an official allergen item.";
  }
  const huTieu = restaurant("hu-tieu-mi-lacay-cho-lon-falls-church-va");
  if (huTieu) {
    setOfficialCount(huTieu);
  }
}

{
  const northsideLondonFog = item("northside-social-va", "london-fog");
  if (northsideLondonFog) {
    northsideLondonFog.allergenSourceType = "official-allergen-menu";
    northsideLondonFog.allergens = ["milk"];
    northsideLondonFog.mayContain = [];
    northsideLondonFog.sourceSummary =
      "Final generated repair: London Fog is retained as a milk-steamed tea beverage; weak tree-nut promotion is removed.";
  }
  const northside = restaurant("northside-social-va");
  if (northside) {
    setOfficialCount(northside);
  }
}

{
  const teddyIceCream = item("teddy-and-the-bully-bar-washington-dc-dc-metro", "ice-cream-sorbet");
  if (teddyIceCream) {
    teddyIceCream.inferredIngredients = ["ice_cream"];
    teddyIceCream.inferredAllergenSignals = [{ id: "milk", c: "high", e: ["ingredient:ice cream"] }];
    teddyIceCream.inferenceSummary = "Common ingredients may include ice cream.";
  }
}

{
  const societyCatfishSandwich = item("society-seafood-house-silver-spring-md-dc-metro", "catfish-sandwich");
  if (societyCatfishSandwich) {
    societyCatfishSandwich.inferredIngredients = ["catfish", "brioche", "aioli", "fried_batter", "cheese"];
    societyCatfishSandwich.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:aioli", "ingredient:fried batter"] },
      { id: "fish", c: "high", e: ["ingredient:catfish"] },
      { id: "gluten", c: "high", e: ["ingredient:brioche"] },
      { id: "milk", c: "medium", e: ["ingredient:brioche"] },
      { id: "wheat", c: "high", e: ["ingredient:brioche"] },
    ];
    societyCatfishSandwich.inferenceSummary =
      "Common ingredients may include catfish, brioche, fried batter, and aioli.";
  }
  const societyFriedShrimp = item("society-seafood-house-silver-spring-md-dc-metro", "fried-shrimp-and-fries");
  if (societyFriedShrimp) {
    societyFriedShrimp.inferredIngredients = ["shrimp", "fried_batter"];
    societyFriedShrimp.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:fried batter"] },
      { id: "gluten", c: "medium", e: ["ingredient:fried batter"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
      { id: "wheat", c: "medium", e: ["ingredient:fried batter"] },
    ];
    societyFriedShrimp.inferenceSummary = "Common ingredients may include shrimp and fried batter.";
  }
  const societyBisque = item("society-seafood-house-silver-spring-md-dc-metro", "seafood-bisque");
  if (societyBisque) {
    societyBisque.inferredIngredients = ["seafood", "cream"];
    societyBisque.inferredAllergenSignals = [
      { id: "fish", c: "medium", e: ["dish:seafood bisque"] },
      { id: "milk", c: "high", e: ["ingredient:cream", "menu:creamy seafood bisque"] },
      { id: "shellfish", c: "high", e: ["ingredient:shellfish"] },
    ];
    societyBisque.inferenceSummary = "Common ingredients may include seafood, shellfish, and cream.";
  }
}

{
  const ililiIceCream = item("ilili-dc", "ice-cream");
  if (ililiIceCream) {
    ililiIceCream.inferredIngredients = ["ice_cream", "black_sesame", "arabian_milk"];
    ililiIceCream.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:ice cream", "ingredient:Arabian milk"] },
      { id: "sesame", c: "high", e: ["ingredient:black sesame"] },
    ];
    ililiIceCream.inferenceSummary = "Common ingredients may include ice cream, Arabian milk, and black sesame.";
  }
}

{
  const sunflowerMockEel = item("replacement-sunflower-vegetarian-restaurant-vienna-va", "teriyaki-mock-sesame-eel-4");
  if (sunflowerMockEel) {
    sunflowerMockEel.inferredIngredients = ["sesame"];
    sunflowerMockEel.inferredAllergenSignals = [{ id: "sesame", c: "high", e: ["ingredient:sesame seeds"] }];
    sunflowerMockEel.inferenceSummary = "Common ingredients may include sesame seeds.";
  }
}

{
  for (const restaurantId of [
    "founding-farmers-dc",
    "founding-farmers-reston-station-va",
    "founding-farmers-tysons-va",
    "farmers-and-distillers-dc",
  ]) {
    const bananaCreamPie = item(restaurantId, "banana-cream-pie");
    if (!bananaCreamPie) {
      continue;
    }
    bananaCreamPie.inferredIngredients = ["banana_custard", "cream", "egg", "pie_crust"];
    bananaCreamPie.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:cream pie custard"] },
      { id: "gluten", c: "high", e: ["dish:pie crust"] },
      { id: "milk", c: "high", e: ["ingredient:cream", "dish:banana cream pie"] },
      { id: "wheat", c: "high", e: ["dish:pie crust"] },
    ];
    bananaCreamPie.inferenceSummary = "Common ingredients may include cream custard, egg, and pie crust.";
  }
}

{
  const maggieBurgerSliders = item("maggie-mcfly-s-springfield-springfield-va-dc-metro", "bacon-cheeseburger-sliders");
  if (maggieBurgerSliders) {
    maggieBurgerSliders.inferredIngredients = ["slider_bun", "cheese", "sesame_bun"];
    maggieBurgerSliders.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["shape:slider bun"] },
      { id: "milk", c: "high", e: ["ingredient:cheese"] },
      { id: "sesame", c: "medium", e: ["shape:burger/slider bun"] },
      { id: "wheat", c: "high", e: ["shape:slider bun"] },
    ];
    maggieBurgerSliders.inferenceSummary = "Common ingredients may include slider buns, cheese, and sesame buns.";
  }
  const maggieAhiTaco = item("maggie-mcfly-s-springfield-springfield-va-dc-metro", "ahi-tuna-taco");
  if (maggieAhiTaco) {
    maggieAhiTaco.inferredIngredients = ["ahi_tuna"];
    maggieAhiTaco.inferredAllergenSignals = [{ id: "fish", c: "high", e: ["ingredient:ahi tuna"] }];
    maggieAhiTaco.inferenceSummary = "Common ingredients may include ahi tuna.";
  }
}

{
  const takumiTeriyaki = item("takumi-navy-yard-dc", "japanese-teriyaki");
  if (takumiTeriyaki) {
    takumiTeriyaki.allergenSourceType = "official-ingredients";
    takumiTeriyaki.allergens = ["gluten", "soy", "wheat"];
    takumiTeriyaki.mayContain = [];
    takumiTeriyaki.sourceSummary =
      "Final generated repair: item-specific official menu row names teriyaki sauce and non-gluten-free preparation; soy, wheat, and gluten are retained as official ingredient evidence.";
  }
  const takumiDcRoll = item("takumi-navy-yard-dc", "dc-roll");
  if (takumiDcRoll) {
    takumiDcRoll.allergenSourceType = "official-ingredients";
    takumiDcRoll.allergens = ["egg", "fish", "gluten", "milk", "shellfish", "wheat"];
    takumiDcRoll.mayContain = [];
    takumiDcRoll.sourceSummary =
      "Final generated repair: DC Roll row names shrimp tempura, cheese, snow crab, tobiko, and spicy mayo; egg is retained for mayo/roe context alongside fish, shellfish, dairy, wheat, and gluten.";
  }
  const takumi = restaurant("takumi-navy-yard-dc");
  if (takumi) {
    setOfficialCount(takumi);
  }
}

{
  const dailyChickenSausageEgg = item("daily-provisions-dupont-dc", "chicken-sausage-egg-and-cheese");
  if (dailyChickenSausageEgg) {
    dailyChickenSausageEgg.allergenSourceType = "official-ingredients";
    dailyChickenSausageEgg.allergens = ["egg", "gluten", "milk"];
    dailyChickenSausageEgg.mayContain = [];
    dailyChickenSausageEgg.sourceSummary =
      "Final generated repair: official row contains statement lists gluten, dairy, and eggs; wheat is not separately published without row-level evidence.";
  }
  const dailyCaesar = item("daily-provisions-dupont-dc", "kale-caesar-salad");
  if (dailyCaesar) {
    dailyCaesar.allergenSourceType = "official-ingredients";
    dailyCaesar.allergens = ["egg", "fish", "milk"];
    dailyCaesar.mayContain = [];
    dailyCaesar.sourceSummary =
      "Final generated repair: official row names egg, parmesan, and anchovy Caesar dressing; wheat/gluten are not published without item-specific row evidence.";
  }
  const dailyProvisions = restaurant("daily-provisions-dupont-dc");
  if (dailyProvisions) {
    setOfficialCount(dailyProvisions);
  }
}

{
  const rareBirdDuplicatePastryBox = item("rare-bird-coffee-roasters-falls-church-va", "assorted-pastry-box-15-pieces");
  if (rareBirdDuplicatePastryBox) {
    rareBirdDuplicatePastryBox.allergenSourceType = "unavailable";
    rareBirdDuplicatePastryBox.allergens = [];
    rareBirdDuplicatePastryBox.mayContain = [];
    rareBirdDuplicatePastryBox.sourceSummary =
      "Final generated repair: duplicate/weak pastry-box row is not counted as an item-specific official allergen record.";
  }
  const rareBird = restaurant("rare-bird-coffee-roasters-falls-church-va");
  if (rareBird) {
    setOfficialCount(rareBird);
  }
}

{
  const takumiUdon = item("takumi-navy-yard-dc", "spicy-seafood-udon-noodle");
  if (takumiUdon) {
    takumiUdon.allergenSourceType = "official-ingredients";
    takumiUdon.allergens = ["gluten", "shellfish", "wheat"];
    takumiUdon.mayContain = [];
    takumiUdon.sourceSummary =
      "Final generated repair: item-specific row supports shellfish and wheat/gluten from seafood udon/tempura terms; coconut milk is not published as tree-nut here.";
  }
  const takumi = restaurant("takumi-navy-yard-dc");
  if (takumi) {
    setOfficialCount(takumi);
  }
}

{
  const twoFiftyChimichurri = item("two-fifty-bbq-dc", "chimichurri-sauce");
  if (twoFiftyChimichurri) {
    twoFiftyChimichurri.allergenSourceType = "official-ingredients";
    twoFiftyChimichurri.allergens = ["milk", "mustard", "tree-nut"];
    twoFiftyChimichurri.mayContain = [];
    twoFiftyChimichurri.sourceSummary =
      "Final generated repair: official row supports parmesan, mustard seed, and nut/herb sauce context; wheat/gluten are not published without row-level evidence.";
  }
  const twoFifty = restaurant("two-fifty-bbq-dc");
  if (twoFifty) {
    setOfficialCount(twoFifty);
  }
}

{
  const xiquet = restaurant("xiquet-dc");
  if (xiquet) {
    xiquet.officialAllergenStatus = "extracted";
    xiquet.officialAllergenRemediationBucket = "official-partial";
    const colomi = item("xiquet-dc", "colomi");
    if (colomi) {
      colomi.allergenSourceType = "unavailable";
      colomi.allergens = [];
      colomi.mayContain = [];
      colomi.sourceSummary =
        "Final generated repair: removed weak menu-ingredient promotion for this row; no item-specific official allergen claim is published.";
    }
    setOfficialCount(xiquet);
  }
}

{
  const taporiCrabIdli = item("tapori-dc", "rice-entrees-maryland-blue-crab-idli");
  if (taporiCrabIdli) {
    taporiCrabIdli.allergenSourceType = "official-ingredients";
    taporiCrabIdli.allergens = ["shellfish", "tree-nut"];
    taporiCrabIdli.mayContain = [];
    taporiCrabIdli.sourceSummary =
      "Final generated repair: official row supports crab and coconut/cashew-style sauce context; egg and wheat/gluten are not published without row-level evidence.";
  }
  const tapori = restaurant("tapori-dc");
  if (tapori) {
    setOfficialCount(tapori);
  }
}

{
  const kWingsTteokbokki = item("k-wings-centreville-dc-metro", "tteokbokki");
  if (kWingsTteokbokki) {
    kWingsTteokbokki.allergenSourceType = "official-ingredients";
    kWingsTteokbokki.allergens = ["fish", "gluten", "sesame", "wheat"];
    kWingsTteokbokki.mayContain = [];
    kWingsTteokbokki.sourceSummary =
      "Final generated repair: official row supports fish cake, wheat/rice cake context, and sesame; egg is not published without row-level evidence.";
  }
  const kWings = restaurant("k-wings-centreville-dc-metro");
  if (kWings) {
    setOfficialCount(kWings);
  }
}

{
  const dailyDishCrabCake = item("replacement-the-daily-dish-silver-spring-md", "crab-cake");
  if (dailyDishCrabCake) {
    dailyDishCrabCake.allergenSourceType = "official-ingredients";
    dailyDishCrabCake.allergens = ["shellfish"];
    dailyDishCrabCake.mayContain = [];
    dailyDishCrabCake.sourceSummary =
      "Final generated repair: official row names jumbo lump crab; wheat/gluten are not published for this crab-cake entree without item-specific breadcrumb/bun evidence.";
  }
  const dailyDish = restaurant("replacement-the-daily-dish-silver-spring-md");
  if (dailyDish) {
    setOfficialCount(dailyDish);
  }
}

{
  const amaRiceBowl = item("ama-dc", "rice-bowl");
  if (amaRiceBowl) {
    amaRiceBowl.allergenSourceType = "official-ingredients";
    amaRiceBowl.allergens = ["fish"];
    amaRiceBowl.mayContain = [];
    amaRiceBowl.sourceSummary =
      "Final generated repair: official row supports salmon/fish; wheat/gluten are not published without item-specific row evidence.";
  }
  const ama = restaurant("ama-dc");
  if (ama) {
    setOfficialCount(ama);
  }
}

{
  const boardCheesecake = item("the-board-and-brew-college-park-dc-metro", "bnb-peanut-butter-white-chocolate-cheesecake");
  if (boardCheesecake) {
    boardCheesecake.allergenSourceType = "official-ingredients";
    boardCheesecake.allergens = ["gluten", "milk", "peanut", "wheat"];
    boardCheesecake.mayContain = [];
    boardCheesecake.sourceSummary =
      "Final generated repair: official row supports peanut butter, white chocolate cheesecake, and ginger snap crust; egg is not published without row-level evidence.";
  }
  const board = restaurant("the-board-and-brew-college-park-dc-metro");
  if (board) {
    setOfficialCount(board);
  }
}

{
  const zinniaSpicedCauliflower = item("zinnia-silver-spring-dc-metro", "spiced-cauliflower");
  if (zinniaSpicedCauliflower) {
    zinniaSpicedCauliflower.allergenSourceType = "official-ingredients";
    zinniaSpicedCauliflower.allergens = ["milk"];
    zinniaSpicedCauliflower.mayContain = [];
    zinniaSpicedCauliflower.sourceSummary =
      "Final generated repair: official row supports dairy/parmesan; gluten-free item does not publish gluten cross-contact in this row.";
  }
  const zinnia = restaurant("zinnia-silver-spring-dc-metro");
  if (zinnia) {
    setOfficialCount(zinnia);
  }
}

{
  const boardChickenQuinoa = item("the-board-and-brew-college-park-dc-metro", "chicken-and-quinoa-bowl");
  if (boardChickenQuinoa) {
    boardChickenQuinoa.allergenSourceType = "official-ingredients";
    boardChickenQuinoa.allergens = ["mustard", "soy", "sulfites"];
    boardChickenQuinoa.mayContain = [];
    boardChickenQuinoa.sourceSummary =
      "Final generated repair: official row supports spicy mustard-soy vinaigrette and sulfite/vinegar context; wheat/gluten are not published without row-level evidence.";
  }
  const board = restaurant("the-board-and-brew-college-park-dc-metro");
  if (board) {
    setOfficialCount(board);
  }
}

{
  const redstoneRiceNoodles = item("redstone-american-grill-washington-dc-dc-metro", "spicy-thai-noodles");
  if (redstoneRiceNoodles) {
    redstoneRiceNoodles.allergenSourceType = "unavailable";
    redstoneRiceNoodles.allergens = [];
    redstoneRiceNoodles.mayContain = [];
    redstoneRiceNoodles.sourceSummary =
      "Final generated repair: rice noodle row has no item-specific official wheat/gluten evidence.";
  }
  const redstone = restaurant("redstone-american-grill-washington-dc-dc-metro");
  if (redstone) {
    setOfficialCount(redstone);
  }
}

{
  const hisAndHersAvocadoToast = item("replacement-his-and-hers-washington-dc", "avocado-toast");
  if (hisAndHersAvocadoToast) {
    hisAndHersAvocadoToast.inferredIngredients = ["baguette", "butter"];
    hisAndHersAvocadoToast.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:baguette"] },
      { id: "milk", c: "medium", e: ["ingredient:buttery toasted baguette"] },
      { id: "wheat", c: "high", e: ["ingredient:baguette"] },
    ];
    hisAndHersAvocadoToast.inferenceSummary = "Common ingredients may include baguette and butter.";
  }
  const hisAndHersFriedRice = item("replacement-his-and-hers-washington-dc", "fried-rice");
  if (hisAndHersFriedRice) {
    hisAndHersFriedRice.inferredIngredients = ["egg", "sesame_oil", "soy_sauce"];
    hisAndHersFriedRice.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:eggs"] },
      { id: "gluten", c: "medium", e: ["ingredient:soy sauce"] },
      { id: "sesame", c: "high", e: ["ingredient:sesame oil"] },
      { id: "soy", c: "high", e: ["ingredient:soy sauce"] },
      { id: "wheat", c: "medium", e: ["ingredient:soy sauce"] },
    ];
    hisAndHersFriedRice.inferenceSummary = "Common ingredients may include egg, sesame oil, and soy sauce.";
  }
}

{
  const harbourSouthwestEggRolls = item("the-harbour-grille-woodbridge-va-dc-metro", "southwest-egg-rolls");
  if (harbourSouthwestEggRolls) {
    harbourSouthwestEggRolls.inferredIngredients = ["egg_roll_wrapper", "mixed_cheese", "sour_cream"];
    harbourSouthwestEggRolls.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:egg roll wrapper"] },
      { id: "gluten", c: "high", e: ["ingredient:wonton"] },
      { id: "milk", c: "high", e: ["ingredient:mixed cheeses", "ingredient:sour cream"] },
      { id: "wheat", c: "high", e: ["ingredient:wonton"] },
    ];
    harbourSouthwestEggRolls.inferenceSummary =
      "Common ingredients may include egg roll wrapper, cheese, and sour cream.";
  }
  const harbourCrabCakeSandwich = item("the-harbour-grille-woodbridge-va-dc-metro", "crab-cake-sandwich");
  if (harbourCrabCakeSandwich) {
    harbourCrabCakeSandwich.inferredIngredients = ["crab", "crab_cake", "sandwich_bread", "remoulade"];
    harbourCrabCakeSandwich.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:remoulade", "dish:crab_cake"] },
      { id: "gluten", c: "high", e: ["shape:sandwich_like", "ingredient:crab cake"] },
      { id: "milk", c: "medium", e: ["dish:crab_cake"] },
      { id: "shellfish", c: "high", e: ["ingredient:crab"] },
      { id: "wheat", c: "high", e: ["shape:sandwich_like", "ingredient:crab cake"] },
    ];
    harbourCrabCakeSandwich.inferenceSummary =
      "Common ingredients may include crab, sandwich bread, crab cake binder, and remoulade.";
  }
  const harbourSeafoodCarbonara = item("the-harbour-grille-woodbridge-va-dc-metro", "seafood-carbonara");
  if (harbourSeafoodCarbonara) {
    harbourSeafoodCarbonara.inferredIngredients = ["seafood", "cream_sauce", "parmesan"];
    harbourSeafoodCarbonara.inferredAllergenSignals = [
      { id: "fish", c: "medium", e: ["menu:seafood carbonara"] },
      { id: "milk", c: "high", e: ["ingredient:cream sauce", "ingredient:parmesan"] },
      { id: "shellfish", c: "high", e: ["ingredient:lobster", "ingredient:shrimp", "ingredient:scallops"] },
    ];
    harbourSeafoodCarbonara.inferenceSummary =
      "Common ingredients may include seafood, shellfish, cream sauce, and parmesan.";
  }
}

{
  const hunchoAhiTuna = item("replacement-huncho-house-hyattsville-md", "yellowtail-ahi-tuna");
  if (hunchoAhiTuna) {
    hunchoAhiTuna.inferredIngredients = ["ahi_tuna", "yellowtail", "crab"];
    hunchoAhiTuna.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:ahi tuna", "ingredient:yellowtail"] },
      { id: "shellfish", c: "high", e: ["ingredient:crab"] },
    ];
    hunchoAhiTuna.inferenceSummary = "Common ingredients may include ahi tuna, yellowtail, and crab.";
  }
  const hunchoSeafoodGravy = item("replacement-huncho-house-hyattsville-md", "african-seafood-gravy-with-mussels-and-shrimp");
  if (hunchoSeafoodGravy) {
    hunchoSeafoodGravy.inferredIngredients = ["seafood", "mussels", "shrimp"];
    hunchoSeafoodGravy.inferredAllergenSignals = [
      { id: "fish", c: "medium", e: ["menu:seafood gravy"] },
      { id: "shellfish", c: "high", e: ["ingredient:mussels", "ingredient:shrimp"] },
    ];
    hunchoSeafoodGravy.inferenceSummary = "Common ingredients may include seafood, mussels, and shrimp.";
  }
  const hunchoChickenParm = item("replacement-huncho-house-hyattsville-md", "bucatini-chicken-parmesan");
  if (hunchoChickenParm) {
    hunchoChickenParm.inferredIngredients = ["breaded_chicken_cutlet", "bucatini", "mozzarella", "provolone"];
    hunchoChickenParm.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:chicken_parmesan", "ingredient:breaded chicken cutlet"] },
      { id: "gluten", c: "high", e: ["ingredient:bucatini", "ingredient:breaded chicken cutlet"] },
      { id: "milk", c: "high", e: ["ingredient:mozzarella", "ingredient:provolone"] },
      { id: "wheat", c: "high", e: ["ingredient:bucatini", "ingredient:breaded chicken cutlet"] },
    ];
    hunchoChickenParm.inferenceSummary =
      "Common ingredients may include breaded chicken cutlet, bucatini, mozzarella, and provolone.";
  }
}

{
  const provostShrimpPasta = item("replacement-provost-restaurant-washington-dc", "cajun-chicken-and-shrimp-pasta");
  if (provostShrimpPasta) {
    provostShrimpPasta.inferredIngredients = ["pasta", "shrimp", "cream_sauce"];
    provostShrimpPasta.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:pasta"] },
      { id: "milk", c: "high", e: ["ingredient:cream sauce"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp", "ingredient:jumbo prawns"] },
      { id: "wheat", c: "high", e: ["ingredient:pasta"] },
    ];
    provostShrimpPasta.inferenceSummary = "Common ingredients may include pasta, shrimp, and cream sauce.";
  }
  const provostCrabCake = item("replacement-provost-restaurant-washington-dc", "crab-cake");
  if (provostCrabCake) {
    provostCrabCake.inferredIngredients = ["crab", "crab_cake", "aioli"];
    provostCrabCake.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:aioli", "dish:crab_cake"] },
      { id: "gluten", c: "medium", e: ["dish:crab_cake"] },
      { id: "milk", c: "medium", e: ["ingredient:creamy aioli"] },
      { id: "shellfish", c: "high", e: ["ingredient:crab"] },
      { id: "wheat", c: "medium", e: ["dish:crab_cake"] },
    ];
    provostCrabCake.inferenceSummary = "Common ingredients may include crab, crab cake binder, and creamy aioli.";
  }
}

{
  const incaAcevichado = item("inca-social-vienna-va-dc-metro", "acevichado-roll");
  if (incaAcevichado) {
    incaAcevichado.inferredIngredients = ["fried_shrimp", "cream_cheese", "fish", "acevichado_sauce"];
    incaAcevichado.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:fried shrimp batter", "ingredient:acevichado sauce"] },
      { id: "fish", c: "high", e: ["ingredient:fish"] },
      { id: "gluten", c: "medium", e: ["ingredient:fried shrimp batter"] },
      { id: "milk", c: "high", e: ["ingredient:cream cheese"] },
      { id: "shellfish", c: "high", e: ["ingredient:fried shrimp"] },
      { id: "wheat", c: "medium", e: ["ingredient:fried shrimp batter"] },
    ];
    incaAcevichado.inferenceSummary =
      "Common ingredients may include fried shrimp batter, cream cheese, fish, and acevichado sauce.";
  }
  const incaPescado = item("inca-social-vienna-va-dc-metro", "pescado-a-lo-macho");
  if (incaPescado) {
    incaPescado.inferredIngredients = ["fish", "calamari", "shrimp", "mussels", "octopus", "heavy_cream"];
    incaPescado.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:fish of the day"] },
      { id: "milk", c: "high", e: ["ingredient:heavy cream"] },
      { id: "shellfish", c: "high", e: ["ingredient:calamari", "ingredient:shrimp", "ingredient:mussels", "ingredient:octopus"] },
    ];
    incaPescado.inferenceSummary =
      "Common ingredients may include fish, calamari, shrimp, mussels, octopus, and heavy cream.";
  }
  const incaPanCon = item("inca-social-vienna-va-dc-metro", "pan-con-chicharron");
  if (incaPanCon) {
    incaPanCon.inferredIngredients = ["bread_roll"];
    incaPanCon.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:bread roll"] },
      { id: "wheat", c: "high", e: ["ingredient:bread roll"] },
    ];
    incaPanCon.inferenceSummary = "Common ingredients may include a bread roll.";
  }
}

{
  const delhiSamosas = item("replacement-delhi-spice-bethesda-md", "samosas");
  if (delhiSamosas) {
    delhiSamosas.inferredIngredients = ["pastry"];
    delhiSamosas.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:crispy pastry"] },
      { id: "wheat", c: "high", e: ["ingredient:crispy pastry"] },
    ];
    delhiSamosas.inferenceSummary = "Common ingredients may include wheat pastry.";
  }
  const delhiSamosaChaat = item("replacement-delhi-spice-bethesda-md", "vegetable-samosa-chaat");
  if (delhiSamosaChaat) {
    delhiSamosaChaat.inferredIngredients = ["pastry", "yogurt"];
    delhiSamosaChaat.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:crispy pastry"] },
      { id: "milk", c: "high", e: ["ingredient:yogurt"] },
      { id: "wheat", c: "high", e: ["ingredient:crispy pastry"] },
    ];
    delhiSamosaChaat.inferenceSummary = "Common ingredients may include wheat pastry and yogurt.";
  }
  const delhiButterNaan = item("replacement-delhi-spice-bethesda-md", "butter-naan");
  if (delhiButterNaan) {
    delhiButterNaan.inferredIngredients = ["naan", "butter"];
    delhiButterNaan.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:white flour", "dish:naan"] },
      { id: "milk", c: "high", e: ["ingredient:butter"] },
      { id: "wheat", c: "high", e: ["ingredient:white flour", "dish:naan"] },
    ];
    delhiButterNaan.inferenceSummary = "Common ingredients may include white flour naan and butter.";
  }
}

{
  const plakaAvgolemeno = item("plaka-grill-vienna-va-dc-metro", "avgolemeno");
  if (plakaAvgolemeno) {
    plakaAvgolemeno.inferredIngredients = ["egg", "orzo", "pita"];
    plakaAvgolemeno.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:egg"] },
      { id: "gluten", c: "high", e: ["ingredient:orzo", "ingredient:pita"] },
      { id: "wheat", c: "high", e: ["ingredient:orzo", "ingredient:pita"] },
    ];
    plakaAvgolemeno.inferenceSummary = "Common ingredients may include egg, orzo, and pita.";
  }
  const plakaCalamari = item("plaka-grill-vienna-va-dc-metro", "calamari");
  if (plakaCalamari) {
    plakaCalamari.inferredIngredients = ["calamari", "aioli"];
    plakaCalamari.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:aioli"] },
      { id: "shellfish", c: "high", e: ["ingredient:calamari"] },
    ];
    plakaCalamari.inferenceSummary = "Common ingredients may include calamari and garlic aioli.";
  }
}

{
  const oohhsFriedCroaker = item("oohh-s-and-aahh-s-washington-dc-dc-metro", "fried-croaker");
  if (oohhsFriedCroaker) {
    oohhsFriedCroaker.inferredIngredients = ["croaker", "fish_flour", "fried_batter"];
    oohhsFriedCroaker.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["shape:fried_or_battered"] },
      { id: "fish", c: "high", e: ["ingredient:croaker"] },
      { id: "gluten", c: "high", e: ["ingredient:fish flour", "shape:fried_or_battered"] },
      { id: "wheat", c: "high", e: ["ingredient:fish flour", "shape:fried_or_battered"] },
    ];
    oohhsFriedCroaker.inferenceSummary = "Common ingredients may include croaker and seasoned fry flour.";
  }
  const oohhsCatfishTaco = item("oohh-s-and-aahh-s-washington-dc-dc-metro", "catfish-taco");
  if (oohhsCatfishTaco) {
    oohhsCatfishTaco.inferredIngredients = ["catfish", "fried_catfish", "flour_tortilla", "cheese"];
    oohhsCatfishTaco.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["shape:fried_or_battered"] },
      { id: "fish", c: "high", e: ["ingredient:catfish"] },
      { id: "gluten", c: "high", e: ["ingredient:flour tortilla"] },
      { id: "milk", c: "high", e: ["ingredient:mixed cheese"] },
      { id: "wheat", c: "high", e: ["ingredient:flour tortilla"] },
    ];
    oohhsCatfishTaco.inferenceSummary =
      "Common ingredients may include catfish, fried batter, flour tortillas, and mixed cheese.";
  }
  const oohhsCaesar = item("oohh-s-and-aahh-s-washington-dc-dc-metro", "caesar-salad");
  if (oohhsCaesar) {
    oohhsCaesar.inferredIngredients = ["parmesan", "croutons", "caesar_dressing"];
    oohhsCaesar.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:caesar_salad"] },
      { id: "fish", c: "medium", e: ["dish:caesar_salad"] },
      { id: "gluten", c: "high", e: ["ingredient:croutons"] },
      { id: "milk", c: "high", e: ["ingredient:parmesan"] },
      { id: "wheat", c: "high", e: ["ingredient:croutons"] },
    ];
    oohhsCaesar.inferenceSummary = "Common ingredients may include parmesan, croutons, and Caesar dressing.";
  }
}

{
  const teddyIceCream = item("teddy-and-the-bully-bar-washington-dc-dc-metro", "ice-cream-sorbet");
  if (teddyIceCream) {
    teddyIceCream.inferredIngredients = ["ice_cream"];
    teddyIceCream.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:ice cream"] },
    ];
    teddyIceCream.inferenceSummary = "Common ingredients may include dairy ice cream.";
  }
  const teddyGrilledCheese = item("teddy-and-the-bully-bar-washington-dc-dc-metro", "grilled-cheese-sandwich");
  if (teddyGrilledCheese) {
    teddyGrilledCheese.inferredIngredients = ["sandwich_bread", "cheese"];
    teddyGrilledCheese.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["shape:sandwich_like", "dish:grilled_cheese"] },
      { id: "milk", c: "high", e: ["dish:grilled_cheese"] },
      { id: "wheat", c: "high", e: ["shape:sandwich_like", "dish:grilled_cheese"] },
    ];
    teddyGrilledCheese.inferenceSummary = "Common ingredients may include sandwich bread and cheese.";
  }
}

{
  const joonCucumberSalad = item("joon-dc", "cucumber-salad");
  if (joonCucumberSalad) {
    joonCucumberSalad.inferredIngredients = ["feta", "pistachio"];
    joonCucumberSalad.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:feta"] },
      { id: "tree-nut", c: "high", e: ["ingredient:pistachio"] },
    ];
    joonCucumberSalad.inferenceSummary = "Common ingredients may include feta and pistachio.";
  }
  const joonGilaniKabob = item("joon-dc", "gilani-kabob-platter");
  if (joonGilaniKabob) {
    joonGilaniKabob.inferredIngredients = ["prawns", "swordfish"];
    joonGilaniKabob.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:swordfish"] },
      { id: "shellfish", c: "high", e: ["ingredient:prawns"] },
    ];
    joonGilaniKabob.inferenceSummary = "Common ingredients may include prawns and swordfish.";
  }
}

{
  const societyCatfishSandwich = item("society-seafood-house-silver-spring-md-dc-metro", "catfish-sandwich");
  if (societyCatfishSandwich) {
    societyCatfishSandwich.inferredIngredients = ["catfish", "brioche", "aioli", "fried_batter"];
    societyCatfishSandwich.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:aioli", "shape:fried_or_battered"] },
      { id: "fish", c: "high", e: ["ingredient:catfish"] },
      { id: "gluten", c: "high", e: ["ingredient:brioche", "shape:sandwich_like"] },
      { id: "milk", c: "medium", e: ["ingredient:brioche"] },
      { id: "wheat", c: "high", e: ["ingredient:brioche", "shape:sandwich_like"] },
    ];
    societyCatfishSandwich.inferenceSummary =
      "Common ingredients may include catfish, toasted brioche, aioli, and fried batter.";
  }
  const societyFriedShrimp = item("society-seafood-house-silver-spring-md-dc-metro", "fried-shrimp-and-fries");
  if (societyFriedShrimp) {
    societyFriedShrimp.inferredIngredients = ["fried_shrimp", "fried_batter"];
    societyFriedShrimp.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["shape:fried_or_battered"] },
      { id: "gluten", c: "high", e: ["shape:fried_or_battered"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
      { id: "wheat", c: "high", e: ["shape:fried_or_battered"] },
    ];
    societyFriedShrimp.inferenceSummary = "Common ingredients may include shrimp and fried batter.";
  }
  const societyBisque = item("society-seafood-house-silver-spring-md-dc-metro", "seafood-bisque");
  if (societyBisque) {
    societyBisque.inferredIngredients = ["seafood", "cream", "shellfish"];
    societyBisque.inferredAllergenSignals = [
      { id: "fish", c: "medium", e: ["ingredient:seafood"] },
      { id: "milk", c: "high", e: ["ingredient:creamy bisque"] },
      { id: "shellfish", c: "high", e: ["ingredient:shellfish"] },
    ];
    societyBisque.inferenceSummary = "Common ingredients may include seafood, shellfish, and cream.";
  }
}

{
  const ililiIceCream = item("ilili-dc", "ice-cream");
  if (ililiIceCream) {
    ililiIceCream.inferredIngredients = ["black_sesame", "arabian_milk", "ice_cream"];
    ililiIceCream.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:Arabian milk", "ingredient:ice cream"] },
      { id: "sesame", c: "high", e: ["ingredient:black sesame"] },
    ];
    ililiIceCream.inferenceSummary = "Common ingredients may include black sesame and milk ice cream.";
  }
}

{
  const sunflowerMockEel = item("replacement-sunflower-vegetarian-restaurant-vienna-va", "teriyaki-mock-sesame-eel-4");
  if (sunflowerMockEel) {
    sunflowerMockEel.inferredIngredients = ["mock_eel", "sesame"];
    sunflowerMockEel.inferredAllergenSignals = [
      { id: "sesame", c: "high", e: ["ingredient:sesame seeds", "menu:mock sesame eel"] },
    ];
    sunflowerMockEel.inferenceSuppressions = [
      ...(sunflowerMockEel.inferenceSuppressions ?? []).filter((suppression) => !["fish", "shellfish"].includes(suppression.id)),
      { id: "fish", reason: "mock vegetarian seafood wording" },
      { id: "shellfish", reason: "mock vegetarian seafood wording" },
    ];
    sunflowerMockEel.inferenceSummary = "Common ingredients may include sesame; mock seafood wording suppresses fish and shellfish assumptions.";
  }
  const sunflowerGfCheesecake = item("replacement-sunflower-vegetarian-restaurant-vienna-va", "gluten-free-key-lime-cheesecake");
  if (sunflowerGfCheesecake) {
    sunflowerGfCheesecake.inferredIngredients = ["cheesecake"];
    sunflowerGfCheesecake.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["dish:cheesecake"] },
    ];
    sunflowerGfCheesecake.inferenceSummary =
      "Common ingredients may include dairy cheesecake; gluten-free wording suppresses wheat/gluten assumptions.";
  }
  const sunflowerChocolateMousse = item("replacement-sunflower-vegetarian-restaurant-vienna-va", "vt-chocolate-mousse");
  if (sunflowerChocolateMousse) {
    sunflowerChocolateMousse.inferredIngredients = ["unbleached_flour", "soy_margarine", "dairy_free_chocolate_chips"];
    sunflowerChocolateMousse.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:unbleached flour"] },
      { id: "soy", c: "high", e: ["ingredient:soy margarine"] },
      { id: "wheat", c: "high", e: ["ingredient:unbleached flour"] },
    ];
    sunflowerChocolateMousse.inferenceSummary =
      "Common ingredients may include unbleached flour and soy margarine; vegan substitutes suppress egg and milk assumptions.";
  }
}

{
  for (const farmers of repairEntries()) {
    if (!/founding-farmers|farmers-and-distillers/i.test(farmers.id)) {
      continue;
    }
    const bananaCreamPie = farmers.items?.find((menuItem) => menuItem.id === "banana-cream-pie");
    if (!bananaCreamPie) {
      continue;
    }
    bananaCreamPie.description = undefined;
    bananaCreamPie.inferredIngredients = ["banana_cream_pie", "pie_crust", "custard"];
    bananaCreamPie.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:cream_pie", "ingredient:custard"] },
      { id: "gluten", c: "high", e: ["ingredient:pie crust"] },
      { id: "milk", c: "high", e: ["dish:banana cream pie", "ingredient:custard"] },
      { id: "wheat", c: "high", e: ["ingredient:pie crust"] },
    ];
    bananaCreamPie.inferenceSummary = "Common ingredients may include pie crust, custard, and dairy cream.";
  }
}

{
  const maggieBurgerSliders = item("maggie-mcfly-s-springfield-springfield-va-dc-metro", "bacon-cheeseburger-sliders");
  if (maggieBurgerSliders) {
    maggieBurgerSliders.inferredIngredients = ["slider_buns", "cheese", "sesame_bun"];
    maggieBurgerSliders.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["shape:sandwich_like", "dish:burger_sliders"] },
      { id: "milk", c: "high", e: ["dish:cheeseburger"] },
      { id: "sesame", c: "medium", e: ["dish:burger bun"] },
      { id: "wheat", c: "high", e: ["shape:sandwich_like", "dish:burger_sliders"] },
    ];
    maggieBurgerSliders.inferenceSummary = "Common ingredients may include slider buns, cheese, and sesame bun topping.";
  }
  const maggieAhiTaco = item("maggie-mcfly-s-springfield-springfield-va-dc-metro", "ahi-tuna-taco");
  if (maggieAhiTaco) {
    maggieAhiTaco.inferredIngredients = ["ahi_tuna"];
    maggieAhiTaco.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:ahi tuna"] },
    ];
    maggieAhiTaco.inferenceSummary = "Common ingredients may include ahi tuna.";
  }
}

{
  for (const [restaurantId, burgerIds] of [
    ["replacement-afghania-washington-dc", ["afghania-burger", "bistro-burger"]],
    ["osm-aracosia-3584164912", ["bistro-burger"]],
  ]) {
    for (const burgerId of burgerIds) {
      const burger = item(restaurantId, burgerId);
      if (!burger) {
        continue;
      }
      burger.inferredIngredients = ["brioche_bun", "burger_patty", "egg_wash", "sesame_bun", "cheese_or_yogurt_sauce"];
      burger.inferredAllergenSignals = [
        { id: "egg", c: "medium", e: ["ingredient:brioche bun"] },
        { id: "gluten", c: "high", e: ["ingredient:brioche bun"] },
        { id: "milk", c: "medium", e: ["ingredient:brioche bun"] },
        { id: "sesame", c: "medium", e: ["dish:burger bun"] },
        { id: "wheat", c: "high", e: ["ingredient:brioche bun"] },
      ];
      burger.inferenceSummary = "Common ingredients may include a brioche burger bun with egg, dairy, wheat, and sesame risk.";
    }
  }
  const afghaniaSalmon = item("replacement-afghania-washington-dc", "salmon");
  if (afghaniaSalmon) {
    afghaniaSalmon.inferredIngredients = ["salmon"];
    afghaniaSalmon.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:salmon"] },
    ];
    afghaniaSalmon.inferenceSummary = "Common ingredients may include salmon.";
  }
  const aracosiaAushak = item("osm-aracosia-3584164912", "leek-and-scallion-dumplings-aushak-entree");
  if (aracosiaAushak) {
    aracosiaAushak.inferredIngredients = ["dumpling_wrapper", "garlic_yogurt"];
    aracosiaAushak.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["dish:dumpling wrapper"] },
      { id: "milk", c: "high", e: ["ingredient:garlic yogurt"] },
      { id: "wheat", c: "high", e: ["dish:dumpling wrapper"] },
    ];
    aracosiaAushak.inferenceSummary = "Common ingredients may include wheat dumpling wrappers and garlic yogurt.";
  }
  const aracosiaSalmonWrap = item("osm-aracosia-3584164912", "salmon-wrap");
  if (aracosiaSalmonWrap) {
    aracosiaSalmonWrap.inferredIngredients = ["salmon", "lavash_wrap", "avocado_yogurt"];
    aracosiaSalmonWrap.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:salmon"] },
      { id: "gluten", c: "high", e: ["ingredient:lavash wrap"] },
      { id: "milk", c: "high", e: ["ingredient:avocado yogurt"] },
      { id: "wheat", c: "high", e: ["ingredient:lavash wrap"] },
    ];
    aracosiaSalmonWrap.inferenceSummary = "Common ingredients may include salmon, lavash wrap, and avocado yogurt.";
  }
}

{
  const uzuAsparagusTempura = item("uzu-revolving-sushi-rockville-md-dc-metro", "asparagus-tempura");
  if (uzuAsparagusTempura) {
    uzuAsparagusTempura.inferredIngredients = ["tempura_batter", "spicy_mayo", "eel_sauce"];
    uzuAsparagusTempura.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:spicy mayo", "shape:tempura"] },
      { id: "fish", c: "medium", e: ["ingredient:eel sauce"] },
      { id: "gluten", c: "high", e: ["shape:tempura", "ingredient:eel sauce"] },
      { id: "wheat", c: "high", e: ["shape:tempura", "ingredient:eel sauce"] },
    ];
    uzuAsparagusTempura.inferenceSummary = "Common ingredients may include tempura batter, spicy mayo, and eel sauce.";
  }
  const uzuHawaiianTruffle = item("uzu-revolving-sushi-rockville-md-dc-metro", "hawaiian-truffle-roll");
  if (uzuHawaiianTruffle) {
    uzuHawaiianTruffle.inferredIngredients = ["shrimp_tempura", "lobster_salad", "uni", "tuna", "spicy_mayo"];
    uzuHawaiianTruffle.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:spicy mayo", "ingredient:lobster salad"] },
      { id: "fish", c: "high", e: ["ingredient:uni", "ingredient:tuna"] },
      { id: "gluten", c: "high", e: ["ingredient:shrimp tempura"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp tempura", "ingredient:lobster salad"] },
      { id: "wheat", c: "high", e: ["ingredient:shrimp tempura"] },
    ];
    uzuHawaiianTruffle.inferenceSummary =
      "Common ingredients may include shrimp tempura, lobster salad, uni, tuna, and spicy mayo.";
  }
  const uzuOysterPonzu = item("uzu-revolving-sushi-rockville-md-dc-metro", "oyster-w-ikura-and-ponzu");
  if (uzuOysterPonzu) {
    uzuOysterPonzu.inferredIngredients = ["oyster", "ikura", "ponzu"];
    uzuOysterPonzu.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:ikura"] },
      { id: "gluten", c: "medium", e: ["ingredient:ponzu"] },
      { id: "shellfish", c: "high", e: ["ingredient:oyster"] },
      { id: "soy", c: "medium", e: ["ingredient:ponzu"] },
      { id: "wheat", c: "medium", e: ["ingredient:ponzu"] },
    ];
    uzuOysterPonzu.inferenceSummary = "Common ingredients may include oyster, ikura, and ponzu.";
  }
  const uzuMochi = item("uzu-revolving-sushi-rockville-md-dc-metro", "mochi-ice-cream");
  if (uzuMochi) {
    uzuMochi.inferredIngredients = ["ice_cream"];
    uzuMochi.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:ice cream"] },
    ];
    uzuMochi.inferenceSummary = "Common ingredients may include dairy ice cream.";
  }
}

{
  const secretGardenBahnMi = item("the-secret-garden-cafe-washington-dc-dc-metro", "bahn-mi");
  if (secretGardenBahnMi) {
    secretGardenBahnMi.inferredIngredients = ["baguette", "basil_aioli", "mozzarella", "soy_glaze"];
    secretGardenBahnMi.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:basil aioli"] },
      { id: "gluten", c: "high", e: ["ingredient:baguette"] },
      { id: "milk", c: "high", e: ["ingredient:mozzarella"] },
      { id: "soy", c: "high", e: ["ingredient:soy glazed pork"] },
      { id: "wheat", c: "high", e: ["ingredient:baguette"] },
    ];
    secretGardenBahnMi.inferenceSummary = "Common ingredients may include baguette, basil aioli, mozzarella, and soy glaze.";
  }
  const secretGardenCrabCake = item("the-secret-garden-cafe-washington-dc-dc-metro", "lump-crab-cake-sandwich");
  if (secretGardenCrabCake) {
    secretGardenCrabCake.inferredIngredients = ["crab_cake", "tartar_sauce", "brioche_bun", "sesame_bun"];
    secretGardenCrabCake.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:tartar sauce", "dish:crab_cake"] },
      { id: "gluten", c: "high", e: ["ingredient:brioche bun", "dish:crab_cake"] },
      { id: "milk", c: "medium", e: ["ingredient:brioche bun"] },
      { id: "sesame", c: "medium", e: ["dish:sandwich bun"] },
      { id: "shellfish", c: "high", e: ["ingredient:crab cake"] },
      { id: "wheat", c: "high", e: ["ingredient:brioche bun", "dish:crab_cake"] },
    ];
    secretGardenCrabCake.inferenceSummary =
      "Common ingredients may include crab cake, tartar sauce, brioche bun, and sesame bun topping.";
  }
  const secretGardenSalmon = item("the-secret-garden-cafe-washington-dc-dc-metro", "fresh-atlantic-salmon");
  if (secretGardenSalmon) {
    secretGardenSalmon.inferredIngredients = ["salmon", "tahini"];
    secretGardenSalmon.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:salmon"] },
      { id: "sesame", c: "high", e: ["ingredient:tahini sauce"] },
    ];
    secretGardenSalmon.inferenceSummary = "Common ingredients may include salmon and tahini sauce.";
  }
  const secretGardenFrenchToast = item("the-secret-garden-cafe-washington-dc-dc-metro", "traditional-french-toast");
  if (secretGardenFrenchToast) {
    secretGardenFrenchToast.inferredIngredients = ["challah_bread", "egg_batter", "butter"];
    secretGardenFrenchToast.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["dish:french_toast"] },
      { id: "gluten", c: "high", e: ["ingredient:challah bread"] },
      { id: "milk", c: "high", e: ["ingredient:butter"] },
      { id: "wheat", c: "high", e: ["ingredient:challah bread"] },
    ];
    secretGardenFrenchToast.inferenceSummary = "Common ingredients may include challah bread, egg batter, and butter.";
  }
}

{
  const jukeBoxFishChips = item("osm-juke-box-diner-3925447512", "fish-and-chips");
  if (jukeBoxFishChips) {
    jukeBoxFishChips.inferredIngredients = ["fish", "fried_batter"];
    jukeBoxFishChips.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["shape:fried_or_battered"] },
      { id: "fish", c: "high", e: ["ingredient:fish"] },
      { id: "gluten", c: "high", e: ["shape:fried_or_battered"] },
      { id: "wheat", c: "high", e: ["shape:fried_or_battered"] },
    ];
    jukeBoxFishChips.inferenceSummary = "Common ingredients may include fish and fried batter.";
  }
}

{
  const barrelWings = item("replacement-barrel-washington-dc", "wings");
  if (barrelWings) {
    barrelWings.inferredIngredients = ["fried_wings"];
    barrelWings.inferredAllergenSignals = [
      { id: "gluten", c: "low", e: ["reviewed:menu-text-fried-wings"] },
      { id: "wheat", c: "low", e: ["reviewed:menu-text-fried-wings"] },
    ];
    barrelWings.inferenceSummary = "Common preparation for fried wings may include wheat-based coating.";
  }

  const awakeningWings = item("replacement-awakening-bar-and-grill-washington-dc", "wings");
  if (awakeningWings) {
    awakeningWings.inferredIngredients = ["fried_wings"];
    awakeningWings.inferredAllergenSignals = [
      { id: "gluten", c: "low", e: ["reviewed:menu-text-golden-fried-crispy-wings"] },
      { id: "wheat", c: "low", e: ["reviewed:menu-text-golden-fried-crispy-wings"] },
    ];
    awakeningWings.inferenceSummary = "Common preparation for golden-fried crispy wings may include wheat-based coating.";
  }

  const tristateWings = item("replacement-tristate-indian-cuisine-herndon-va", "tristate-spl-chicken-wings");
  if (tristateWings) {
    tristateWings.inferredIngredients = ["fried_coated_wings"];
    tristateWings.inferredAllergenSignals = [
      { id: "gluten", c: "medium", e: ["reviewed:menu-text-crispy-coated-fried-wings"] },
      { id: "wheat", c: "medium", e: ["reviewed:menu-text-crispy-coated-fried-wings"] },
    ];
    tristateWings.inferenceSummary = "Common preparation for crispy coated fried wings may include wheat-based coating.";
  }
}

{
  const redHotBlueWingsTray = item("osm-red-hot-blue-1448579525", "40-wings-tray");
  if (redHotBlueWingsTray) {
    redHotBlueWingsTray.inferredIngredients = ["blue_cheese_dressing", "ranch_dressing"];
    redHotBlueWingsTray.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:ranch dressing", "ingredient:blue cheese dressing"] },
      { id: "milk", c: "high", e: ["ingredient:blue cheese dressing", "ingredient:ranch dressing"] },
    ];
    redHotBlueWingsTray.inferenceSummary = "Common ingredients may include blue cheese or ranch dressing.";
  }
  const redHotBlueNachos = item("osm-red-hot-blue-1448579525", "bbq-nachos");
  if (redHotBlueNachos) {
    redHotBlueNachos.inferredIngredients = ["cheddar", "jack_cheese", "sour_cream"];
    redHotBlueNachos.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:cheddar", "ingredient:jack cheeses", "ingredient:sour cream"] },
    ];
    redHotBlueNachos.inferenceSummary = "Common ingredients may include cheddar, jack cheese, and sour cream.";
  }
  const redHotBlueClassicBurger = item("osm-red-hot-blue-1448579525", "the-classic-burger");
  if (redHotBlueClassicBurger) {
    redHotBlueClassicBurger.description = "Lettuce, tomato, pickles and onions. Served with Crispy Fries";
    redHotBlueClassicBurger.inferredIngredients = ["burger_bun", "sesame_bun"];
    redHotBlueClassicBurger.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["shape:burger"] },
      { id: "sesame", c: "medium", e: ["dish:burger bun"] },
      { id: "wheat", c: "high", e: ["shape:burger"] },
    ];
    redHotBlueClassicBurger.inferenceSummary = "Common ingredients may include a wheat burger bun with sesame risk.";
  }
  const redHotBlueHickoryBurger = item("osm-red-hot-blue-1448579525", "hickory-bacon-burger");
  if (redHotBlueHickoryBurger) {
    redHotBlueHickoryBurger.inferredIngredients = ["burger_bun", "cheddar", "sesame_bun"];
    redHotBlueHickoryBurger.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["shape:burger"] },
      { id: "milk", c: "high", e: ["ingredient:cheddar cheese"] },
      { id: "sesame", c: "medium", e: ["dish:burger bun"] },
      { id: "wheat", c: "high", e: ["shape:burger"] },
    ];
    redHotBlueHickoryBurger.inferenceSummary = "Common ingredients may include a burger bun, cheddar cheese, and sesame bun risk.";
  }
}

{
  const novaEuropaSeafoodPot = item("replacement-nova-europa-restaurant-silver-spring-md", "caldeirda-nova-europa");
  if (novaEuropaSeafoodPot) {
    novaEuropaSeafoodPot.inferredIngredients = ["shrimp", "scallops", "clams", "mussels", "fish", "calamari", "linguine"];
    novaEuropaSeafoodPot.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:fresh fish"] },
      { id: "gluten", c: "high", e: ["ingredient:linguine"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp", "ingredient:scallops", "ingredient:clams", "ingredient:mussels", "ingredient:calamari"] },
      { id: "wheat", c: "high", e: ["ingredient:linguine"] },
    ];
    novaEuropaSeafoodPot.inferenceSummary = "Common ingredients may include seafood, shellfish, fish, and linguine.";
  }
  const novaEuropaChickenParm = item("replacement-nova-europa-restaurant-silver-spring-md", "chicken-parmigiana");
  if (novaEuropaChickenParm) {
    novaEuropaChickenParm.inferredIngredients = ["breaded_chicken_cutlet", "cheese", "linguine"];
    novaEuropaChickenParm.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:chicken_parmigiana", "ingredient:cutlet"] },
      { id: "gluten", c: "high", e: ["dish:chicken_parmigiana", "ingredient:linguine"] },
      { id: "milk", c: "high", e: ["ingredient:cheese"] },
      { id: "wheat", c: "high", e: ["dish:chicken_parmigiana", "ingredient:linguine"] },
    ];
    novaEuropaChickenParm.inferenceSummary = "Common ingredients may include breaded chicken cutlet, cheese, and linguine.";
  }
  const novaEuropaSteakPortuguese = item(
    "replacement-nova-europa-restaurant-silver-spring-md",
    "steak-portuguese-topped-with-egg-and-ham-in-wine-sauce",
  );
  if (novaEuropaSteakPortuguese) {
    novaEuropaSteakPortuguese.inferredIngredients = ["egg", "wine_sauce"];
    novaEuropaSteakPortuguese.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:egg"] },
      { id: "sulfites", c: "medium", e: ["ingredient:wine sauce"] },
    ];
    novaEuropaSteakPortuguese.inferenceSummary = "Common ingredients may include egg and wine sauce.";
  }
  const novaEuropaCheesecake = item("replacement-nova-europa-restaurant-silver-spring-md", "cheese-cake");
  if (novaEuropaCheesecake) {
    novaEuropaCheesecake.inferredIngredients = ["cheesecake", "crust"];
    novaEuropaCheesecake.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:cheesecake"] },
      { id: "gluten", c: "high", e: ["dish:cheesecake crust"] },
      { id: "milk", c: "high", e: ["dish:cheesecake"] },
      { id: "wheat", c: "high", e: ["dish:cheesecake crust"] },
    ];
    novaEuropaCheesecake.inferenceSummary = "Common ingredients may include cheesecake filling and crust.";
  }
  const novaEuropaBrie = item("replacement-nova-europa-restaurant-silver-spring-md", "baked-brie-cheese");
  if (novaEuropaBrie) {
    novaEuropaBrie.inferredIngredients = ["brie_cheese"];
    novaEuropaBrie.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:brie cheese"] },
    ];
    novaEuropaBrie.inferenceSummary = "Common ingredients may include brie cheese.";
  }
}

{
  const cuatesAztecaSalad = item("osm-cuates-12207964801", "azteca-salad");
  if (cuatesAztecaSalad) {
    cuatesAztecaSalad.description = "Romaine lettuce, red onions, avocado, tomatoes, boiled egg and tortilla chips. Served with house dressing on the side.";
    cuatesAztecaSalad.inferredIngredients = ["boiled_egg"];
    cuatesAztecaSalad.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:boiled egg"] },
    ];
    cuatesAztecaSalad.inferenceSummary = "Common ingredients may include boiled egg.";
  }
  const cuatesSeafoodSoup = item("osm-cuates-12207964801", "casuela-de-mariscos");
  if (cuatesSeafoodSoup) {
    cuatesSeafoodSoup.inferredIngredients = ["salmon", "shrimp", "scallops", "squid", "mussels", "clams"];
    cuatesSeafoodSoup.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:salmon"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp", "ingredient:scallops", "ingredient:squid", "ingredient:mussels", "ingredient:clams"] },
    ];
    cuatesSeafoodSoup.inferenceSummary = "Common ingredients may include salmon, shrimp, scallops, squid, mussels, and clams.";
  }
  const cuatesCheesecakeChimichanga = item("osm-cuates-12207964801", "cheesecake-chimichanga");
  if (cuatesCheesecakeChimichanga) {
    cuatesCheesecakeChimichanga.inferredIngredients = ["flour_tortilla", "cheesecake"];
    cuatesCheesecakeChimichanga.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:cheesecake"] },
      { id: "gluten", c: "high", e: ["ingredient:flour tortilla"] },
      { id: "milk", c: "high", e: ["ingredient:cheesecake"] },
      { id: "wheat", c: "high", e: ["ingredient:flour tortilla"] },
    ];
    cuatesCheesecakeChimichanga.inferenceSummary = "Common ingredients may include flour tortilla and cheesecake.";
  }
  const cuatesTacoSalad = item("osm-cuates-12207964801", "lunch-taco-salad");
  if (cuatesTacoSalad) {
    cuatesTacoSalad.inferredIngredients = ["flour_tortilla_shell", "cheese", "sour_cream"];
    cuatesTacoSalad.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:flour crispy tortilla shell"] },
      { id: "milk", c: "high", e: ["ingredient:cheese", "ingredient:sour cream"] },
      { id: "wheat", c: "high", e: ["ingredient:flour crispy tortilla shell"] },
    ];
    cuatesTacoSalad.inferenceSummary = "Common ingredients may include flour tortilla shell, cheese, and sour cream.";
  }
  const cuatesParillada = item("osm-cuates-12207964801", "parillada-cuates-grill");
  if (cuatesParillada) {
    cuatesParillada.inferredIngredients = ["grilled_shrimp", "sour_cream", "flour_tortillas"];
    cuatesParillada.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:fresh flour tortillas"] },
      { id: "milk", c: "high", e: ["ingredient:sour cream"] },
      { id: "shellfish", c: "high", e: ["ingredient:grilled shrimp"] },
      { id: "wheat", c: "high", e: ["ingredient:fresh flour tortillas"] },
    ];
    cuatesParillada.inferenceSummary = "Common ingredients may include grilled shrimp, sour cream, and flour tortillas.";
  }
  const cuatesTacosCarbon = item("osm-cuates-12207964801", "tacos-al-carbon");
  if (cuatesTacosCarbon) {
    cuatesTacosCarbon.inferredIngredients = ["flour_tortillas", "sour_cream", "mexican_butter"];
    cuatesTacosCarbon.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:fresh flour tortillas"] },
      { id: "milk", c: "high", e: ["ingredient:sour cream", "ingredient:Mexican butter"] },
      { id: "wheat", c: "high", e: ["ingredient:fresh flour tortillas"] },
    ];
    cuatesTacosCarbon.inferenceSummary = "Common ingredients may include flour tortillas, sour cream, and Mexican butter.";
  }
}

{
  const cuatesAztecaSalad = item("osm-cuates-12207964801", "azteca-salad");
  if (cuatesAztecaSalad) {
    cuatesAztecaSalad.inferredIngredients = ["boiled_egg"];
    cuatesAztecaSalad.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:boiled egg"] },
    ];
    cuatesAztecaSalad.inferenceSummary = "Common ingredients may include boiled egg.";
  }
  const cuatesSeafoodSoup = item("osm-cuates-12207964801", "casuela-de-mariscos");
  if (cuatesSeafoodSoup) {
    cuatesSeafoodSoup.inferredIngredients = ["shrimp", "scallops", "salmon", "squid", "mussels", "clams"];
    cuatesSeafoodSoup.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:salmon"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp", "ingredient:scallops", "ingredient:squid", "ingredient:mussels", "ingredient:clams"] },
    ];
    cuatesSeafoodSoup.inferenceSummary = "Common ingredients may include seafood broth with fish and shellfish.";
  }
  const cuatesCheesecakeChimichanga = item("osm-cuates-12207964801", "cheesecake-chimichanga");
  if (cuatesCheesecakeChimichanga) {
    cuatesCheesecakeChimichanga.inferredIngredients = ["cheesecake", "flour_tortilla"];
    cuatesCheesecakeChimichanga.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:cheesecake"] },
      { id: "gluten", c: "high", e: ["ingredient:flour tortilla"] },
      { id: "milk", c: "high", e: ["dish:cheesecake"] },
      { id: "wheat", c: "high", e: ["ingredient:flour tortilla"] },
    ];
    cuatesCheesecakeChimichanga.inferenceSummary = "Common ingredients may include cheesecake and a fried flour tortilla.";
  }
  const cuatesTacoSalad = item("osm-cuates-12207964801", "lunch-taco-salad");
  if (cuatesTacoSalad) {
    cuatesTacoSalad.inferredIngredients = ["flour_tortilla_shell", "cheese", "sour_cream"];
    cuatesTacoSalad.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:flour crispy tortilla shell"] },
      { id: "milk", c: "high", e: ["ingredient:cheese", "ingredient:sour cream"] },
      { id: "wheat", c: "high", e: ["ingredient:flour crispy tortilla shell"] },
    ];
    cuatesTacoSalad.inferenceSummary = "Common ingredients may include a flour tortilla shell, cheese, and sour cream.";
  }
  const cuatesParillada = item("osm-cuates-12207964801", "parillada-cuates-grill");
  if (cuatesParillada) {
    cuatesParillada.inferredIngredients = ["shrimp", "sour_cream", "flour_tortillas"];
    cuatesParillada.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:fresh flour tortillas"] },
      { id: "milk", c: "high", e: ["ingredient:sour cream"] },
      { id: "shellfish", c: "high", e: ["ingredient:grilled shrimp"] },
      { id: "wheat", c: "high", e: ["ingredient:fresh flour tortillas"] },
    ];
    cuatesParillada.inferenceSummary = "Common ingredients may include grilled shrimp, sour cream, and flour tortillas.";
  }
  const cuatesTacosCarbon = item("osm-cuates-12207964801", "tacos-al-carbon");
  if (cuatesTacosCarbon) {
    cuatesTacosCarbon.inferredIngredients = ["flour_tortillas", "sour_cream", "mexican_butter"];
    cuatesTacosCarbon.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:fresh flour tortillas"] },
      { id: "milk", c: "high", e: ["ingredient:sour cream", "ingredient:mexican butter"] },
      { id: "wheat", c: "high", e: ["ingredient:fresh flour tortillas"] },
    ];
    cuatesTacosCarbon.inferenceSummary = "Common ingredients may include flour tortillas, sour cream, and Mexican butter.";
  }
}

{
  const urbanoSoftTacos = item("osm-urbano-9821308296", "2-crispy-or-soft-tacos");
  if (urbanoSoftTacos) {
    urbanoSoftTacos.inferredIngredients = ["fried_chicken", "crispy_fish", "grilled_shrimp", "octopus", "soft_tortilla"];
    urbanoSoftTacos.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:fried chicken", "ingredient:crispy fish"] },
      { id: "fish", c: "high", e: ["ingredient:crispy fish"] },
      { id: "gluten", c: "high", e: ["ingredient:soft shell", "ingredient:crispy fish"] },
      { id: "shellfish", c: "high", e: ["ingredient:grilled shrimp", "ingredient:octopus"] },
      { id: "wheat", c: "high", e: ["ingredient:soft shell", "ingredient:crispy fish"] },
    ];
    urbanoSoftTacos.inferenceSummary =
      "Common ingredients may include soft tortillas, fried chicken, crispy fish, grilled shrimp, or octopus depending on choice.";
  }
  const urbanoPorkBelly = item("osm-urbano-9821308296", "ancho-grilled-pork-belly");
  if (urbanoPorkBelly) {
    urbanoPorkBelly.description = "Cauliflower puree, salsa macha, cebollitas, cashews";
    urbanoPorkBelly.inferredIngredients = ["cashews"];
    urbanoPorkBelly.inferredAllergenSignals = [
      { id: "tree-nut", c: "high", e: ["ingredient:cashews"] },
    ];
    urbanoPorkBelly.inferenceSummary = "Common ingredients may include cashews.";
  }
  const urbanoFajitaFiesta = item("osm-urbano-9821308296", "fajita-fiesta-4-guests");
  if (urbanoFajitaFiesta) {
    urbanoFajitaFiesta.description = "Served with rice, refried beans, pico de gallo, shredded lettuce, guacamole, cheese and sour cream";
    urbanoFajitaFiesta.inferredIngredients = ["cheese", "sour_cream"];
    urbanoFajitaFiesta.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:cheese", "ingredient:sour cream"] },
    ];
    urbanoFajitaFiesta.inferenceSummary = "Common ingredients may include cheese and sour cream.";
  }
  const urbanoHalibut = item("osm-urbano-9821308296", "grilled-halibut-al-pastor");
  if (urbanoHalibut) {
    urbanoHalibut.inferredIngredients = ["halibut", "flour_tortilla"];
    urbanoHalibut.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:halibut"] },
      { id: "gluten", c: "high", e: ["ingredient:homemade flour tortilla"] },
      { id: "wheat", c: "high", e: ["ingredient:homemade flour tortilla"] },
    ];
    urbanoHalibut.inferenceSummary = "Common ingredients may include halibut and flour tortilla.";
  }
  const urbanoShrimp = item("osm-urbano-9821308296", "grilled-shrimp");
  if (urbanoShrimp) {
    urbanoShrimp.inferredIngredients = ["shrimp"];
    urbanoShrimp.inferredAllergenSignals = [
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
    ];
    urbanoShrimp.inferenceSummary = "Common ingredients may include shrimp.";
  }
  const urbanoTresLeches = item("osm-urbano-9821308296", "tres-leches");
  if (urbanoTresLeches) {
    urbanoTresLeches.inferredIngredients = ["butter_cake", "milk", "whipped_cream"];
    urbanoTresLeches.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:butter cake"] },
      { id: "gluten", c: "high", e: ["ingredient:butter cake"] },
      { id: "milk", c: "high", e: ["ingredient:three types of milk", "ingredient:whipped cream"] },
      { id: "wheat", c: "high", e: ["ingredient:butter cake"] },
    ];
    urbanoTresLeches.inferenceSummary = "Common ingredients may include butter cake, milk, and whipped cream.";
  }
}

{
  const eugeniaKantaifi = item("osm-our-mom-eugenia-2578773395", "ekmek-kantaifi");
  if (eugeniaKantaifi) {
    eugeniaKantaifi.inferredIngredients = ["kantaifi_phyllo", "custard", "whipped_cream", "pistachios"];
    eugeniaKantaifi.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:custard"] },
      { id: "gluten", c: "high", e: ["ingredient:kantaifi phyllo"] },
      { id: "milk", c: "high", e: ["ingredient:custard", "ingredient:whipped cream"] },
      { id: "tree-nut", c: "high", e: ["ingredient:pistachios"] },
      { id: "wheat", c: "high", e: ["ingredient:kantaifi phyllo"] },
    ];
    eugeniaKantaifi.inferenceSummary = "Common ingredients may include phyllo, custard, whipped cream, and pistachios.";
  }
  const eugeniaLavraki = item("osm-our-mom-eugenia-2578773395", "lavraki-gemisto");
  if (eugeniaLavraki) {
    eugeniaLavraki.inferredIngredients = ["branzino", "shrimp"];
    eugeniaLavraki.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:branzino"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
    ];
    eugeniaLavraki.inferenceSummary = "Common ingredients may include branzino and shrimp.";
  }
  const eugeniaAvgolemono = item("osm-our-mom-eugenia-2578773395", "avgolemono");
  if (eugeniaAvgolemono) {
    eugeniaAvgolemono.inferredIngredients = ["egg"];
    eugeniaAvgolemono.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:egg"] },
    ];
    eugeniaAvgolemono.inferenceSummary = "Common ingredients may include egg.";
  }
  const eugeniaFeta = item("osm-our-mom-eugenia-2578773395", "feta-psiti");
  if (eugeniaFeta) {
    eugeniaFeta.inferredIngredients = ["feta", "puff_pastry", "sesame"];
    eugeniaFeta.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:puff pastry"] },
      { id: "milk", c: "high", e: ["ingredient:feta"] },
      { id: "sesame", c: "high", e: ["ingredient:sesame"] },
      { id: "wheat", c: "high", e: ["ingredient:puff pastry"] },
    ];
    eugeniaFeta.inferenceSummary = "Common ingredients may include feta, puff pastry, and sesame.";
  }
  const eugeniaGreekSalad = item("osm-our-mom-eugenia-2578773395", "greek-salad");
  if (eugeniaGreekSalad) {
    eugeniaGreekSalad.inferredIngredients = ["feta"];
    eugeniaGreekSalad.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:feta"] },
    ];
    eugeniaGreekSalad.inferenceSummary = "Common ingredients may include feta.";
  }
  const eugeniaLamburger = item("osm-our-mom-eugenia-2578773395", "lamburger");
  if (eugeniaLamburger) {
    eugeniaLamburger.inferredIngredients = ["sesame_bun", "feta"];
    eugeniaLamburger.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:sesame bun"] },
      { id: "milk", c: "high", e: ["ingredient:feta"] },
      { id: "sesame", c: "high", e: ["ingredient:sesame bun"] },
      { id: "wheat", c: "high", e: ["ingredient:sesame bun"] },
    ];
    eugeniaLamburger.inferenceSummary = "Common ingredients may include feta and a sesame bun.";
  }
  const eugeniaSpanakopita = item("osm-our-mom-eugenia-2578773395", "spanakopita");
  if (eugeniaSpanakopita) {
    eugeniaSpanakopita.inferredIngredients = ["phyllo", "feta"];
    eugeniaSpanakopita.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:spanakopita"] },
      { id: "gluten", c: "high", e: ["ingredient:phyllo pastry"] },
      { id: "milk", c: "high", e: ["ingredient:feta"] },
      { id: "wheat", c: "high", e: ["ingredient:phyllo pastry"] },
    ];
    eugeniaSpanakopita.inferenceSummary = "Common ingredients may include phyllo pastry and feta.";
  }
}

{
  const eugeniaKantaifi = item("osm-our-mom-eugenia-2578773395", "ekmek-kantaifi");
  if (eugeniaKantaifi) {
    eugeniaKantaifi.inferredIngredients = ["kantaifi_phyllo", "custard", "whipped_cream", "pistachios"];
    eugeniaKantaifi.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:creamy custard"] },
      { id: "gluten", c: "high", e: ["ingredient:kantaifi phyllo"] },
      { id: "milk", c: "high", e: ["ingredient:creamy custard", "ingredient:whipped cream"] },
      { id: "tree-nut", c: "high", e: ["ingredient:pistachios"] },
      { id: "wheat", c: "high", e: ["ingredient:kantaifi phyllo"] },
    ];
    eugeniaKantaifi.inferenceSummary = "Common ingredients may include phyllo, custard, whipped cream, and pistachios.";
  }
  const eugeniaLavraki = item("osm-our-mom-eugenia-2578773395", "lavraki-gemisto");
  if (eugeniaLavraki) {
    eugeniaLavraki.inferredIngredients = ["branzino", "shrimp"];
    eugeniaLavraki.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:branzino"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
    ];
    eugeniaLavraki.inferenceSummary = "Common ingredients may include branzino and shrimp.";
  }
  const eugeniaAvgolemono = item("osm-our-mom-eugenia-2578773395", "avgolemono");
  if (eugeniaAvgolemono) {
    eugeniaAvgolemono.inferredIngredients = ["egg"];
    eugeniaAvgolemono.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:egg"] },
    ];
    eugeniaAvgolemono.inferenceSummary = "Common ingredients may include egg.";
  }
  const eugeniaFetaPsiti = item("osm-our-mom-eugenia-2578773395", "feta-psiti");
  if (eugeniaFetaPsiti) {
    eugeniaFetaPsiti.inferredIngredients = ["feta", "puff_pastry", "sesame"];
    eugeniaFetaPsiti.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:puff pastry"] },
      { id: "milk", c: "high", e: ["ingredient:feta"] },
      { id: "sesame", c: "high", e: ["ingredient:sesame"] },
      { id: "wheat", c: "high", e: ["ingredient:puff pastry"] },
    ];
    eugeniaFetaPsiti.inferenceSummary = "Common ingredients may include feta, puff pastry, and sesame.";
  }
  const eugeniaGreekSalad = item("osm-our-mom-eugenia-2578773395", "greek-salad");
  if (eugeniaGreekSalad) {
    eugeniaGreekSalad.inferredIngredients = ["feta"];
    eugeniaGreekSalad.inferredAllergenSignals = [
      { id: "milk", c: "high", e: ["ingredient:feta"] },
    ];
    eugeniaGreekSalad.inferenceSummary = "Common ingredients may include feta.";
  }
  const eugeniaLamburger = item("osm-our-mom-eugenia-2578773395", "lamburger");
  if (eugeniaLamburger) {
    eugeniaLamburger.inferredIngredients = ["feta", "sesame_bun"];
    eugeniaLamburger.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:sesame bun"] },
      { id: "milk", c: "high", e: ["ingredient:feta"] },
      { id: "sesame", c: "high", e: ["ingredient:sesame bun"] },
      { id: "wheat", c: "high", e: ["ingredient:sesame bun"] },
    ];
    eugeniaLamburger.inferenceSummary = "Common ingredients may include feta and a sesame bun.";
  }
  const eugeniaSpanakopita = item("osm-our-mom-eugenia-2578773395", "spanakopita");
  if (eugeniaSpanakopita) {
    eugeniaSpanakopita.inferredIngredients = ["phyllo_pastry", "feta", "egg"];
    eugeniaSpanakopita.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["dish:spanakopita"] },
      { id: "gluten", c: "high", e: ["ingredient:phyllo pastry"] },
      { id: "milk", c: "high", e: ["ingredient:feta"] },
      { id: "wheat", c: "high", e: ["ingredient:phyllo pastry"] },
    ];
    eugeniaSpanakopita.inferenceSummary = "Common ingredients may include phyllo pastry, feta, and egg.";
  }
}

{
  const elPatioChivito = item("el-patio-randolph-rockville-md-dc-metro", "chivito");
  if (elPatioChivito) {
    elPatioChivito.inferredIngredients = ["sandwich_bread", "mozzarella", "mayo"];
    elPatioChivito.inferredAllergenSignals = [
      { id: "egg", c: "medium", e: ["ingredient:mayo"] },
      { id: "gluten", c: "high", e: ["shape:sandwich_like"] },
      { id: "milk", c: "high", e: ["ingredient:mozzarella"] },
      { id: "wheat", c: "high", e: ["shape:sandwich_like"] },
    ];
    elPatioChivito.inferenceSummary = "Common ingredients may include sandwich bread, mozzarella, and mayo.";
  }
  const elPatioChivitoAlPlato = item("el-patio-randolph-rockville-md-dc-metro", "chivito-al-plato-top-seller");
  if (elPatioChivitoAlPlato) {
    elPatioChivitoAlPlato.inferredIngredients = ["fried_eggs", "provolone"];
    elPatioChivitoAlPlato.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:fried eggs"] },
      { id: "milk", c: "high", e: ["ingredient:provolone"] },
    ];
    elPatioChivitoAlPlato.inferenceSummary = "Common ingredients may include fried eggs and provolone.";
  }
}

{
  const openCityClub = item("open-city-dc", "calvert-club-sandwich");
  if (openCityClub) {
    openCityClub.allergens = ["milk", "gluten", "wheat"];
    openCityClub.mayContain = [];
    openCityClub.allergenSourceType = "official-ingredients";
    openCityClub.sourceSummary = "Official item text says: Contains Gluten and Dairy.";
  }
  const openCitySalmon = item("open-city-dc", "blackened-salmon");
  if (openCitySalmon) {
    openCitySalmon.inferredIngredients = ["salmon"];
    openCitySalmon.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:salmon"] },
    ];
    openCitySalmon.inferenceSummary = "Common ingredients may include salmon.";
  }
  const openCityShrimpSide = item("open-city-dc", "side-shrimp");
  if (openCityShrimpSide) {
    openCityShrimpSide.inferredIngredients = ["shrimp"];
    openCityShrimpSide.inferredAllergenSignals = [
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
    ];
    openCityShrimpSide.inferenceSummary = "Common ingredients may include shrimp.";
  }
}

{
  const organicSalmon = item("replacement-the-organic-butcher-mclean-va", "organic-salmon");
  if (organicSalmon) {
    organicSalmon.inferredIngredients = ["salmon"];
    organicSalmon.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:salmon"] },
    ];
    organicSalmon.inferenceSummary = "Common ingredients may include salmon.";
  }
  const organicBlackCod = item("replacement-the-organic-butcher-mclean-va", "black-cod-fillet");
  if (organicBlackCod) {
    organicBlackCod.inferredIngredients = ["black_cod", "sablefish"];
    organicBlackCod.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:black cod", "ingredient:sablefish"] },
    ];
    organicBlackCod.inferenceSummary = "Common ingredients may include black cod.";
  }
  const organicSmokedSalmonDip = item("replacement-the-organic-butcher-mclean-va", "house-made-smoked-salmon-dip");
  if (organicSmokedSalmonDip) {
    organicSmokedSalmonDip.inferredIngredients = ["smoked_salmon", "cream_cheese", "mayonnaise", "sour_cream"];
    organicSmokedSalmonDip.inferredAllergenSignals = [
      { id: "egg", c: "high", e: ["ingredient:mayonnaise"] },
      { id: "fish", c: "high", e: ["ingredient:smoked salmon"] },
      { id: "milk", c: "high", e: ["ingredient:cream cheese", "ingredient:sour cream"] },
    ];
    organicSmokedSalmonDip.inferenceSummary =
      "Common ingredients may include smoked salmon, cream cheese, mayonnaise, and sour cream.";
  }
  const organicHummus = item("replacement-the-organic-butcher-mclean-va", "little-sesame-smooth-classic-hummus-large");
  if (organicHummus) {
    organicHummus.inferredIngredients = ["hummus", "tahini"];
    organicHummus.inferredAllergenSignals = [
      { id: "sesame", c: "high", e: ["ingredient:hummus", "brand:Little Sesame"] },
    ];
    organicHummus.inferenceSummary = "Common ingredients may include sesame tahini.";
  }
  const organicMalaySauce = item("replacement-the-organic-butcher-mclean-va", "spicy-malay-grilling-sauce");
  if (organicMalaySauce) {
    organicMalaySauce.inferredIngredients = ["fish_sauce"];
    organicMalaySauce.inferredAllergenSignals = [
      { id: "fish", c: "high", e: ["ingredient:fish sauce"] },
    ];
    organicMalaySauce.inferenceSummary = "Common ingredients may include fish sauce.";
  }
}

{
  const pleromaShrimpRoll = item("pleroma-cuisine-laurel-md-dc-metro", "african-shrimp-roll");
  if (pleromaShrimpRoll) {
    pleromaShrimpRoll.inferredIngredients = ["shrimp", "pastry"];
    pleromaShrimpRoll.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:pastry"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
      { id: "wheat", c: "high", e: ["ingredient:pastry"] },
    ];
    pleromaShrimpRoll.inferenceSummary = "Common ingredients may include shrimp wrapped in pastry.";
  }
}

{
  const pleromaShrimpRoll = item("pleroma-cuisine-laurel-md-dc-metro", "african-shrimp-roll");
  if (pleromaShrimpRoll) {
    pleromaShrimpRoll.inferredIngredients = ["shrimp", "pastry_wrapper"];
    pleromaShrimpRoll.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:pastry wrapper"] },
      { id: "shellfish", c: "high", e: ["ingredient:shrimp"] },
      { id: "wheat", c: "high", e: ["ingredient:pastry wrapper"] },
    ];
    pleromaShrimpRoll.inferenceSummary = "Common ingredients may include shrimp and a wheat pastry wrapper.";
  }
}

{
  const spacebarAndromeda = item("spacebar-falls-church-va-dc-metro", "andromeda-melt");
  if (spacebarAndromeda) {
    spacebarAndromeda.inferredIngredients = ["sourdough", "feta", "mozzarella"];
    spacebarAndromeda.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:sourdough"] },
      { id: "milk", c: "high", e: ["ingredient:feta", "ingredient:mozzarella"] },
      { id: "wheat", c: "high", e: ["ingredient:sourdough"] },
    ];
    spacebarAndromeda.inferenceSummary = "Common ingredients may include sourdough, feta, and mozzarella.";
  }
  const spacebarVeganGrilledCheese = item("spacebar-falls-church-va-dc-metro", "vegan-grilled-cheese");
  if (spacebarVeganGrilledCheese) {
    spacebarVeganGrilledCheese.inferredIngredients = ["sourdough", "cashew_cheese"];
    spacebarVeganGrilledCheese.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:sourdough"] },
      { id: "tree-nut", c: "high", e: ["ingredient:cashew cheese"] },
      { id: "wheat", c: "high", e: ["ingredient:sourdough"] },
    ];
    spacebarVeganGrilledCheese.inferenceSuppressions = [
      ...(spacebarVeganGrilledCheese.inferenceSuppressions ?? []).filter((suppression) => !["egg", "milk"].includes(suppression.id)),
      { id: "egg", reason: "vegan item context" },
      { id: "milk", reason: "vegan cheese context" },
    ];
    spacebarVeganGrilledCheese.inferenceSummary =
      "Common ingredients may include sourdough and cashew cheese; vegan wording suppresses egg and milk assumptions.";
  }
  const spacebarSpacebarBq = item("spacebar-falls-church-va-dc-metro", "spacebar-b-q");
  if (spacebarSpacebarBq) {
    spacebarSpacebarBq.inferredIngredients = ["sourdough", "crispy_onions", "bbq_sauce", "cheddar", "vegan_cheese"];
    spacebarSpacebarBq.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:sourdough", "ingredient:crispy onions"] },
      { id: "milk", c: "medium", e: ["ingredient:cheddar"] },
      { id: "sesame", c: "medium", e: ["shape:sandwich_like"] },
      { id: "soy", c: "medium", e: ["ingredient:vegan chicken", "ingredient:impossible burger"] },
      { id: "wheat", c: "high", e: ["ingredient:sourdough", "ingredient:crispy onions"] },
    ];
    spacebarSpacebarBq.inferenceSummary =
      "Common ingredients may include sourdough, crispy onions, barbecue sauce, cheddar, or vegan protein.";
  }
}

{
  const spacebarAndromeda = item("spacebar-falls-church-va-dc-metro", "andromeda-melt");
  if (spacebarAndromeda) {
    spacebarAndromeda.inferredIngredients = ["sourdough", "feta", "mozzarella"];
    spacebarAndromeda.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:sourdough"] },
      { id: "milk", c: "high", e: ["ingredient:feta", "ingredient:mozzarella"] },
      { id: "wheat", c: "high", e: ["ingredient:sourdough"] },
    ];
    spacebarAndromeda.inferenceSummary = "Common ingredients may include sourdough, feta, and mozzarella.";
  }
  const spacebarVeganGrilledCheese = item("spacebar-falls-church-va-dc-metro", "vegan-grilled-cheese");
  if (spacebarVeganGrilledCheese) {
    spacebarVeganGrilledCheese.inferredIngredients = ["sourdough", "cashew_cheese"];
    spacebarVeganGrilledCheese.inferredAllergenSignals = [
      { id: "gluten", c: "high", e: ["ingredient:sourdough"] },
      { id: "tree-nut", c: "high", e: ["ingredient:cashew cheese"] },
      { id: "wheat", c: "high", e: ["ingredient:sourdough"] },
    ];
    spacebarVeganGrilledCheese.inferenceSummary = "Common ingredients may include sourdough and vegan cashew cheese.";
  }
}

{
  for (const itemId of ["vegetable-roll-trio", "sauce-in-6-pieces"]) {
    const menuItem = item("kizuna-sushi-ramen-tysons-va", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergenSourceType = "unavailable";
    menuItem.allergens = [];
    menuItem.mayContain = [];
    menuItem.sourceSummary =
      "Final generated repair: Kizuna row-boundary/menu-choice text is not treated as item-specific official allergen evidence.";
    if (itemId === "vegetable-roll-trio") {
      menuItem.description = null;
    }
  }
  const kizuna = restaurant("kizuna-sushi-ramen-tysons-va");
  if (kizuna) {
    setOfficialCount(kizuna);
  }
}

{
  const takumiTeriyaki = item("takumi-navy-yard-dc", "japanese-teriyaki");
  if (takumiTeriyaki) {
    takumiTeriyaki.allergens = ["gluten", "soy", "wheat"];
    takumiTeriyaki.mayContain = [];
    takumiTeriyaki.allergenSourceType = "official-ingredients";
    takumiTeriyaki.sourceSummary =
      "Final generated repair: official Takumi row includes teriyaki sauce and a not-gluten-free statement, supporting soy plus gluten/wheat.";
  }
  const takumi = restaurant("takumi-navy-yard-dc");
  if (takumi) {
    setOfficialCount(takumi);
  }
}

{
  const dailyChickenSausageEgg = item("daily-provisions-dupont-dc", "chicken-sausage-egg-and-cheese");
  if (dailyChickenSausageEgg) {
    dailyChickenSausageEgg.allergens = ["egg", "gluten", "milk"];
    dailyChickenSausageEgg.mayContain = [];
    dailyChickenSausageEgg.allergenSourceType = "official-ingredients";
    dailyChickenSausageEgg.sourceSummary =
      "Final generated repair: official row contains statement lists gluten, dairy, and eggs; wheat is not separately published without row-level evidence.";
  }
  const dailyProvisions = restaurant("daily-provisions-dupont-dc");
  if (dailyProvisions) {
    setOfficialCount(dailyProvisions);
  }
}

{
  const rareBirdPastryBox = item("rare-bird-coffee-roasters-falls-church-va", "assorted-pastry-box-15-pieces");
  if (rareBirdPastryBox) {
    rareBirdPastryBox.allergenSourceType = "unavailable";
    rareBirdPastryBox.allergens = [];
    rareBirdPastryBox.mayContain = [];
    rareBirdPastryBox.sourceSummary =
      "Final generated repair: boxed assorted pastry product name is not item-specific official allergen evidence.";
  }
  const rareBird = restaurant("rare-bird-coffee-roasters-falls-church-va");
  if (rareBird) {
    setOfficialCount(rareBird);
  }
}

{
  const takumiSpicyUdon = item("takumi-navy-yard-dc", "spicy-seafood-udon-noodle");
  if (takumiSpicyUdon) {
    takumiSpicyUdon.allergens = ["shellfish", "gluten", "wheat"];
    takumiSpicyUdon.mayContain = [];
    takumiSpicyUdon.allergenSourceType = "official-ingredients";
    takumiSpicyUdon.sourceSummary =
      "Final generated repair: official row supports shellfish plus wheat/gluten from udon/tempura flake; coconut milk is not published as tree nut.";
  }
  const takumi = restaurant("takumi-navy-yard-dc");
  if (takumi) {
    setOfficialCount(takumi);
  }
}

{
  const chimichurri = item("two-fifty-bbq-dc", "chimichurri-sauce");
  if (chimichurri) {
    chimichurri.allergens = ["milk", "mustard", "tree-nut"];
    chimichurri.mayContain = [];
    chimichurri.allergenSourceType = "official-ingredients";
    chimichurri.sourceSummary =
      "Final generated repair: official row lists walnuts, parmesan cheese, and mustard seeds; no wheat/gluten term is item-specific.";
  }
  const twoFifty = restaurant("two-fifty-bbq-dc");
  if (twoFifty) {
    setOfficialCount(twoFifty);
  }
}

{
  const amaRiceBowl = item("ama-dc", "rice-bowl");
  if (amaRiceBowl) {
    amaRiceBowl.allergens = ["fish"];
    amaRiceBowl.mayContain = [];
    amaRiceBowl.allergenSourceType = "official-ingredients";
    amaRiceBowl.sourceSummary =
      "Final generated repair: official Ama row supports fish from salmon; rice bowl text does not support wheat/gluten.";
  }
  const ama = restaurant("ama-dc");
  if (ama) {
    setOfficialCount(ama);
  }
}

{
  const boardCheesecake = item(
    "the-board-and-brew-college-park-dc-metro",
    "bnb-peanut-butter-white-chocolate-cheesecake",
  );
  if (boardCheesecake) {
    boardCheesecake.allergens = ["milk", "gluten", "wheat", "peanut"];
    boardCheesecake.mayContain = [];
    boardCheesecake.allergenSourceType = "official-ingredients";
    boardCheesecake.sourceSummary =
      "Final generated repair: official Board and Brew row supports peanut, milk, and wheat/gluten from cheesecake and ginger snap crust; egg is not published without row-level evidence.";
  }
  const boardKanzu = item("the-board-and-brew-college-park-dc-metro", "kanzu");
  if (boardKanzu) {
    boardKanzu.allergenSourceType = "unavailable";
    boardKanzu.allergens = [];
    boardKanzu.mayContain = [];
    boardKanzu.sourceSummary =
      "Final generated repair: coffee tasting notes such as milk chocolate are not item-level allergen claims.";
  }
  const boardAndBrew = restaurant("the-board-and-brew-college-park-dc-metro");
  if (boardAndBrew) {
    setOfficialCount(boardAndBrew);
  }
}

{
  for (const itemId of ["spicy-thai-noodles", "thai-spicy-noodles-tray"]) {
    const menuItem = item("redstone-american-grill-washington-dc-dc-metro", itemId);
    if (!menuItem) {
      continue;
    }
    menuItem.allergenSourceType = "unavailable";
    menuItem.allergens = [];
    menuItem.mayContain = [];
    menuItem.sourceSummary =
      "Final generated repair: rice noodle row does not support wheat/gluten without item-specific wheat ingredient evidence.";
  }
  const redstone = restaurant("redstone-american-grill-washington-dc-dc-metro");
  if (redstone) {
    setOfficialCount(redstone);
  }
}

{
  function removeItems(restaurantId, itemIds, note) {
    const entry = restaurant(restaurantId);
    if (!entry?.items) {
      return;
    }
    const blocked = new Set(itemIds);
    const before = entry.items.length;
    entry.items = entry.items.filter((menuItem) => !blocked.has(menuItem.id));
    if (entry.items.length !== before) {
      entry.sourceStatus = {
        ...(entry.sourceStatus ?? {}),
        reviewedMenuQualityRepairs: [
          ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
          { note },
        ],
      };
    }
  }

  function filterItems(restaurantId, keepItem, note) {
    const entry = restaurant(restaurantId);
    if (!entry?.items) {
      return;
    }
    const before = entry.items.length;
    entry.items = entry.items.filter(keepItem);
    if (entry.items.length !== before) {
      entry.sourceStatus = {
        ...(entry.sourceStatus ?? {}),
        reviewedMenuQualityRepairs: [
          ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
          { removedItemCount: before - entry.items.length, note },
        ],
      };
      entry.allergenDataStatus = {
        ...(entry.allergenDataStatus ?? {}),
        totalItemCount: entry.items.length,
      };
      setOfficialCount(entry);
    }
  }

  function category(menuItem) {
    return String(menuItem?.category ?? "").trim();
  }

  function name(menuItem) {
    return String(menuItem?.name ?? "").trim();
  }

  filterItems(
    "potbelly-dc",
    (menuItem) =>
      !/\b(?:Cincinnati|Dallas|Houston)\b/i.test(`${menuItem.name ?? ""} ${menuItem.category ?? ""}`) &&
      !/\bINM only\b/i.test(String(menuItem.category ?? "")),
    "Final generated repair: removed non-DC regional and internal-only Potbelly Nutritionix catalog variants from the DC chain menu.",
  );

  filterItems(
    "quiznos",
    (menuItem) =>
      !/^(?:Condiments, Toppings, & Veggies|Dressings & Sauces|Proteins|Breads|Cheese|Fountain Drinks)$/i.test(
        category(menuItem),
      ),
    "Final generated repair: removed Quiznos ingredient/modifier catalog rows so the published menu contains orderable menu items rather than toppings, sauces, proteins, breads, cheeses, and fountain-drink components.",
  );

  filterItems(
    "silver-diner-dc",
    (menuItem) =>
      (menuItem.sourceUrls ?? []).some((url) =>
        /silverdiner\.com\/(?:menu-|kids-menu|flexitarian-menu)/i.test(String(url)) &&
        !/menu-cocktails/i.test(String(url)),
      ),
    "Final generated repair: removed Silver Diner rows backed only by allergen/nutrition PDFs, BWI-specific PDFs, or OCR/image fragments; kept rows backed by Silver Diner menu pages, kids menu, and flexitarian menu pages.",
  );

  filterItems(
    "corner-bakery-cafe",
    (menuItem) => !/\b(?:Coffee|Beverages?)\b/i.test(category(menuItem)),
    "Final generated repair: removed Corner Bakery beverage and coffee catalog rows so the restaurant menu focuses on food items with allergy relevance.",
  );

  {
    const cornerBakery = restaurant("corner-bakery-cafe");
    if (cornerBakery) {
      const cornerBakerySource =
        "https://cornerbakerycafe.com/wp-content/uploads/2025/06/CB_Nutrition_Allergen_Info.pdf";
      const officialGuide = JSON.parse(
        await fs.readFile("data/source-profiles/corner-bakery-official-allergen-map.json", "utf8"),
      );
      const officialRowIndex = indexOfficialAllergenRows(officialGuide.rows);
      let officialMatchCount = 0;

      for (const menuItem of cornerBakery.items ?? []) {
        if ((menuItem.sourceUrls ?? []).length === 0) {
          menuItem.sourceUrls = [cornerBakerySource];
        }
        const officialRow = findOfficialAllergenRow(officialRowIndex, menuItem);
        if (!officialRow) {
          continue;
        }
        officialMatchCount += 1;
        menuItem.allergenSourceType = "official-allergen-menu";
        menuItem.allergens = officialRow.allergens ?? [];
        menuItem.mayContain = [];
        menuItem.sourceSummary = "Reviewed official row-level allergen matrix evidence.";
        menuItem.sourceUrls = Array.from(new Set([...(menuItem.sourceUrls ?? []), cornerBakerySource]));
        menuItem.evidence = [
          ...(menuItem.evidence ?? []).filter(
            (entry) => !/Corner Bakery Cafe menu item from allergen matrix/i.test(String(entry?.text ?? "")),
          ),
          {
            sourceKind: "official-allergen-matrix",
            sourceUrl: cornerBakerySource,
            text: `Official Corner Bakery Cafe allergen row: ${officialRow.name}.`,
          },
        ];
      }

      cornerBakery.officialAllergenStatus = "extracted";
      cornerBakery.officialAllergenRemediationBucket = "official-full";
      cornerBakery.allergenDataStatus = {
        ...(cornerBakery.allergenDataStatus ?? {}),
        officialItemCount: officialMatchCount,
        officialTotal: officialMatchCount,
        totalItemCount: cornerBakery.items?.length ?? 0,
        officialCoverageRatio: officialMatchCount / Math.max(1, cornerBakery.items?.length ?? 0),
        bucket: officialMatchCount >= 90 ? "official-full" : "official-partial",
      };
      cornerBakery.sourceStatus = {
        ...(cornerBakery.sourceStatus ?? {}),
        officialItemCount: officialMatchCount,
        officialAllergenRemediationBucket: cornerBakery.allergenDataStatus.bucket,
        reviewedMenuQualityRepairs: [
          ...(cornerBakery.sourceStatus?.reviewedMenuQualityRepairs ?? []),
          {
            note: "Applied reviewed official Corner Bakery PDF allergen rows by normalized item-name matching.",
            officialMatchCount,
          },
        ],
      };
    }
  }

  filterItems(
    "ruby-tuesday",
    (menuItem) =>
      !/^(?:Beverages|Promotions|Utensils|Family Bundle Meals)$/i.test(category(menuItem)),
    "Final generated repair: removed Ruby Tuesday beverages, utensils, promo specials, and family-bundle combo rows so the published menu contains item-level food rows.",
  );

  filterItems(
    "burger-king",
    (menuItem) =>
      !/^(?:Drinks & Coffee|Condiments)$/i.test(category(menuItem)) &&
      !/\b(?:Iced Coffee|Frozen Coke|Soft Drink|Sweet Tea|Unsweet Tea|Bottled Water|Honest Kids|Pure Life|Capri Sun|Sauce|Condiment)\b/i.test(
        name(menuItem),
      ),
    "Final generated repair: removed Burger King drink, coffee, sauce, and condiment catalog rows from the food-focused published menu.",
  );

  filterItems(
    "popeyes",
    (menuItem) => !/^(?:Beverages|Family)$/i.test(category(menuItem)),
    "Final generated repair: removed Popeyes beverages and family bundle rows so the published menu focuses on item-level food rows.",
  );

  filterItems(
    "dairy-queen",
    (menuItem) =>
      !/^(?:Mobile Add Ons|Dressing, Sauces, and Dips|Misty® Slush|MooLatté® Frozen Beverages)$/i.test(category(menuItem)) &&
      !/^AO\d/i.test(name(menuItem)) &&
      !/\b(?:Dipping Sauce|Topping|Sprinkles|Icing|Quins|Streamers)\b/i.test(name(menuItem)),
    "Final generated repair: removed Dairy Queen mobile add-ons, sauce/topping rows, frozen beverage rows, and cake-decoration catalog artifacts.",
  );

  if (
    restaurant("applebees")?.sourceProfile !==
      "verified-applebees:restaurant-linked-matrix-plus-official-global-note"
  ) {
    filterItems(
      "applebees",
      (menuItem) =>
        !/\bINM Only\b/i.test(category(menuItem)) &&
        !/^(?:Beverages|Build Your Appetizer Sampler \(Choose 3\))$/i.test(category(menuItem)) &&
        !/\b(?:Dipping Sauce|Flavor -|no flavor or dipping sauce)\b/i.test(name(menuItem)),
      "Final generated repair: removed Applebee's internal-only, beverage, sampler-option, wing-flavor, and dipping-sauce catalog rows.",
    );
  }

  filterItems(
    "firebirds-wood-fired-grill-gaithersburg-md-dc-metro",
    (menuItem) =>
      !/^(?:Add To Any Classic Salad|Enhance Your Steak|Group Dining|Family Meals)$/i.test(category(menuItem)) &&
      !/\b(?:Add To Any|Enhance Your Steak)\b/i.test(name(menuItem)),
    "Final generated repair: removed Firebirds add-on, enhancement, group-dining, and family-meal option rows.",
  );

  filterItems(
    "silver-bethesda-md-dc-metro",
    (menuItem) => !/^(?:Beverages)$/i.test(category(menuItem)),
    "Final generated repair: removed Silver beverage rows from the food-focused published menu.",
  );

  filterItems(
    "el-patio-randolph-rockville-md-dc-metro",
    (menuItem) => !/^(?:Beverages|Catering & Party Trays)$/i.test(category(menuItem)),
    "Final generated repair: removed El Patio beverage and catering tray rows from the item-level published menu.",
  );

  filterItems(
    "teddy-and-the-bully-bar-washington-dc-dc-metro",
    (menuItem) =>
      !/^(?:Passed Menu|Stations Menu|Menu I{1,2} - \$\d+ Per Person|Passed Desserts Menu|Hot Foods? Platters|Cold Food Platters|Cold Platters|Dessert Platters|Reception Platters Menu|Salad Platters)$/i.test(
        category(menuItem),
      ),
    "Final generated repair: removed Teddy & The Bully Bar event, catering package, and platter rows from the ordinary menu.",
  );

  filterItems(
    "osm-armetta-s-italian-pizzeria-3935138350",
    (menuItem) =>
      !/^(?:To Go Drinks|Dressings)$/i.test(category(menuItem)) &&
      !/^(?:1st|2nd) Half\b/i.test(name(menuItem)),
    "Final generated repair: removed Armetta's drink, dressing, and pizza half-topping modifier rows.",
  );

  filterItems(
    "flemings-prime-steakhouse-tysons-va",
    (menuItem) =>
      !/^Catering\b/i.test(category(menuItem)) &&
      !/After Dinner Drinks/i.test(category(menuItem)),
    "Final generated repair: removed Fleming's catering package and after-dinner drink rows from the ordinary food menu.",
  );

  filterItems(
    "mirch-dhamaka-indian-fine-dine-cafe-and-bar-herndon-va-dc-metro",
    (menuItem) => !/^Large Group Dining & Private Gatherings$/i.test(name(menuItem)),
    "Final generated repair: removed Mirch Dhamaka private-event marketing row from the published menu.",
  );
  const mirchDhamaka = restaurant("mirch-dhamaka-indian-fine-dine-cafe-and-bar-herndon-va-dc-metro");
  if (mirchDhamaka) {
    mirchDhamaka.expectedLargeMenu = true;
    mirchDhamaka.sourceStatus = {
      ...(mirchDhamaka.sourceStatus ?? {}),
      reviewedMenuQualityRepairs: [
        ...(mirchDhamaka.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          note:
            "Reviewed oversized queue: Mirch Dhamaka is a large source-backed Indian menu after removing the private-event marketing row; no broad catalog artifact filter was applied.",
        },
      ],
    };
  }

  filterItems(
    "astro-doughnuts-dc",
    (menuItem) => !new Set(["chocolate-smores", "peach-melba", "strawberry-shortcake"]).has(menuItem.id),
    "Restaurant verification repair: removed three stale rotating monthly doughnuts absent from the current official Washington, D.C. menu.",
  );
  const astroDoughnuts = restaurant("astro-doughnuts-dc");
  if (astroDoughnuts) {
    const officialMenuUrl = "https://www.astrodoughnuts.com/washington-menus/";
    const currentMonthlySpecials = [
      ["Peach Cobbler", "Light Round Doughnut Filled with Ginger Peach Compote, Peach Raspberry Glaze, Cinnamon Shortbread Crumble"],
      ["Chocolate Birthday Cake", "Rich Chocolate Cake Doughnut with Vanilla Glaze, Vanilla Buttercream, Sprinkles"],
      ["Cherry Pie", "Tart Cherry Compote Filling, Red Cherry Glaze, Shortbread Cookie Crumble"],
      ["Classic Cruller", "Fried Pate a Choux (Cream Puff) Dough Tossed in Cinnamon Sugar, Vanilla Glaze Drizzle"],
    ];
    for (const [itemName, description] of currentMonthlySpecials) {
      if (!astroDoughnuts.items?.some((menuItem) => menuItem.id === slugify(itemName))) {
        astroDoughnuts.items.push(
          reviewedMenuItem({
            name: itemName,
            category: "Astro Monthly Specials",
            description,
            sourceUrl: officialMenuUrl,
            sourceType: "reviewed-official-menu",
            sourceKind: "official-menu-html",
          }),
        );
      }
    }

    const correctedSignals = new Map([
      ["the-asteroid", []],
      ["apollo-smashburger", ["milk"]],
      ["breakfast-quesadilla", ["milk", "egg"]],
      ["byo-chicken-sandwich", []],
      ["cake-batter-funfetti", []],
      ["chocolate-peanut-butter", ["peanut"]],
      ["creme-brulee", ["milk"]],
      ["double-chocolate-chip", ["milk"]],
      ["honey-bun", []],
      ["old-bay-all-day", []],
      ["pbandj", ["peanut"]],
      ["smores", []],
      ["snickerdoodle-cookie", []],
    ]);
    for (const [itemId, allergens] of correctedSignals) {
      const menuItem = astroDoughnuts.items?.find((item) => item.id === itemId);
      if (!menuItem) continue;
      menuItem.allergens = allergens;
      menuItem.mayContain = [];
      menuItem.allergenSourceType = allergens.length > 0 ? "official-ingredients" : "unavailable";
      delete menuItem.sourceSummary;
    }
    astroDoughnuts.sourceStatus = {
      ...(astroDoughnuts.sourceStatus ?? {}),
      reviewedMenuQualityRepairs: [
        ...(astroDoughnuts.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          note:
            "Restaurant verification repair: reconciled the current DC monthly-special lineup and retained only allergen signals directly stated in official menu text.",
        },
      ],
    };
  }

  const atlacatl = restaurant("osm-atlacatl-pupuseria-372658150");
  if (
    atlacatl &&
    (
      atlacatl.items?.length !== 85 ||
      atlacatl.items?.some((menuItem) => [
        "chicken-entrees",
        "comes-with-spicy-red-dipping-sauce",
        "grilled-salmon-with-cream-sauce",
        "latest-atlacatl-news",
        "like-this",
        "market-price",
        "pork-entrees",
        "steak-entrees",
        "steak-or-grilled-chicken-taco",
      ].includes(menuItem.id)) ||
      !atlacatl.items?.some((menuItem) => menuItem.id === "taquitos-de-lengua")
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-atlacatl-pupuseria-372658150/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-atlacatl-pupuseria-372658150",
      verifiedSnapshot,
      "Restaurant verification repair: rebuilt Atlacatl's current 85-item restaurant-issued menu, removed extraction artifacts and description-title substitutions, and retained only direct positive ingredient signals from official menu prose.",
    );
    atlacatl.guideUrl = verifiedSnapshot.sourceUrls[0];
    atlacatl.guideLabel = "Current official menu";
    atlacatl.sourceUrls = [...verifiedSnapshot.sourceUrls];
    atlacatl.sourceFamily = "verified-owner-menu";
    atlacatl.parserProfile = "verified-wordpress-menu";
    atlacatl.sourceProfile = "verified-atlacatl:restaurant-issued-current-menu";
    atlacatl.updated = "2026-07";
    atlacatl.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    atlacatl.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    atlacatl.coverageStatus = "complete";
    atlacatl.launchQualityStatus = "published";
    atlacatl.launchRemediationBucket = "none";
    atlacatl.regionalScope = "local-menu-with-intelligence-fallback";
    atlacatl.sourceStatus = {
      ...(atlacatl.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
        ],
        configuredUrlWarnings: [
          "official-menu-is-not-a-complete-allergen-matrix-or-complete-recipe-disclosure",
          "positive-official-signals-require-a-fixed-ingredient-or-unambiguous-food-identity",
          "configuration-dependent-flour-or-corn-tortilla-choices-remain-unavailable",
          "no-product-scoped-or-global-allergen-cross-contact-statement-was-found",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 8,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: new Set(verifiedSnapshot.items.map((menuItem) => menuItem.category)).size,
      frozenUniqueProductCount: 25,
      restoredCurrentProductCount: 60,
      frozenArtifactCount: 8,
      frozenVariantMatchCount: 13,
    };
  }

  const atlasAndAndys = restaurant("atlas-and-andys-pizza-navy-yard-dc");
  if (atlasAndAndys) {
    const operationalOrNonFoodIds = new Set([
      "thu-the-garden-pie-vegan",
      "underberg-bitters",
      "wings-buffalo",
      "wings-old-bay",
    ]);
    atlasAndAndys.items = (atlasAndAndys.items ?? []).filter(
      (menuItem) => !operationalOrNonFoodIds.has(menuItem.id),
    );

    const friedCauliflower = atlasAndAndys.items.find(
      (menuItem) => menuItem.id === "buffalo-fried-cauliflower" || menuItem.id === "fried-cauliflower",
    );
    if (friedCauliflower) {
      friedCauliflower.id = "fried-cauliflower";
      friedCauliflower.name = "Fried Cauliflower";
      friedCauliflower.description = "With a Buffalo sauce drizzle.";
      friedCauliflower.allergens = [];
      friedCauliflower.mayContain = [];
      friedCauliflower.allergenSourceType = "unavailable";
    } else {
      const restoredFriedCauliflower = reviewedMenuItem({
        name: "Fried Cauliflower",
        category: "Starters + Salads",
        description: "With a Buffalo sauce drizzle.",
        sourceUrl: "https://www.eatandyspizza.com/menu/atlas-navy-yard/",
        sourceType: "restaurant-issued-current-menu",
        sourceKind: "restaurant-issued-menu-text",
      });
      restoredFriedCauliflower.variantGroup = "Starters + Salads";
      atlasAndAndys.items.push(restoredFriedCauliflower);
    }
    const oldBayFries = atlasAndAndys.items.find((menuItem) => menuItem.id === "old-bay-fries");
    if (oldBayFries) {
      oldBayFries.name = "Old Bay Fries";
    } else {
      const restoredOldBayFries = reviewedMenuItem({
        name: "Old Bay Fries",
        category: "Starters + Salads",
        description: "Shoestring-cut fries, fried golden and tossed in Old Bay.",
        sourceUrl: "https://www.eatandyspizza.com/menu/atlas-navy-yard/",
        sourceType: "restaurant-issued-current-menu",
        sourceKind: "restaurant-issued-menu-text",
      });
      restoredOldBayFries.variantGroup = "Starters + Salads";
      atlasAndAndys.items.push(restoredOldBayFries);
    }

    const appetizerIds = new Set([
      "brussels-sprouts",
      "caesar-salad",
      "charred-brocolini",
      "chicken-tenders",
      "chicken-tenders-and-ff",
      "chorizo-fries",
      "fried-cauliflower",
      "french-fries",
      "kale-salad",
      "old-bay-fries",
      "wings",
    ]);
    const extraSauceIds = new Set([
      "side-of-bees-knees-hot-honey",
      "side-of-blue-cheese",
      "side-of-ranch",
    ]);
    const specialtyPizzaIds = new Set([
      "slice-pepperoni-special",
      "whole-pepperoni-special",
      "slice-buffalo-chicken",
      "whole-buffalo-crispy-chicken-pizza",
      "slice-burrata-margherita",
      "whole-burrata-margherita",
      "whole-diavolo",
      "slice-carnivore",
      "whole-carnivore",
      "dairy-free-margherita",
    ]);
    for (const menuItem of atlasAndAndys.items) {
      menuItem.category = appetizerIds.has(menuItem.id)
        ? "Starters + Salads"
        : extraSauceIds.has(menuItem.id)
          ? "Extra Sauce"
          : specialtyPizzaIds.has(menuItem.id)
            ? "Specialty Pies"
            : "Standard Pies & Slices";
      menuItem.variantGroup = menuItem.category;
    }

    if (!atlasAndAndys.items.some((menuItem) => menuItem.id === "side-of-ranch")) {
      const sideOfRanch = reviewedMenuItem({
        name: "Side of Ranch",
        category: "Extra Sauce",
        description: null,
        sourceUrl: "https://order.toasttab.com/online/atlas-brew-works-navy-yard-1201-half-street-se-suite-120",
        sourceType: "reviewed-restaurant-linked-menu",
        sourceKind: "restaurant-linked-menu-text",
      });
      sideOfRanch.variantGroup = "Extra Sauce";
      atlasAndAndys.items.push(sideOfRanch);
    }

    if (!atlasAndAndys.items.some((menuItem) => menuItem.id === "dairy-free-margherita")) {
      const dairyFreeMargherita = reviewedMenuItem({
        name: "Dairy Free Margherita",
        category: "Specialty Pies",
        description: "Cashew-based dairy-free cheese, basil, and olive oil. Whole pie only.",
        sourceUrl: "https://www.eatandyspizza.com/menu/atlas-navy-yard/",
        sourceType: "restaurant-issued-current-menu",
        sourceKind: "restaurant-issued-menu-text",
      });
      dairyFreeMargherita.allergens = ["gluten", "tree-nut", "wheat"];
      dairyFreeMargherita.allergenSourceType = "official-ingredients";
      dairyFreeMargherita.variantGroup = "Specialty Pies";
      atlasAndAndys.items.push(dairyFreeMargherita);
    }
    if (!atlasAndAndys.items.some((menuItem) => menuItem.id === "8-makes-a-pie")) {
      const eightMakesAPie = reviewedMenuItem({
        name: "8 Makes a Pie",
        category: "Standard Pies & Slices",
        description: "Mix and match any eight standard slices to assemble your own pizza.",
        sourceUrl: "https://www.eatandyspizza.com/menu/atlas-navy-yard/",
        sourceType: "restaurant-issued-current-menu",
        sourceKind: "restaurant-issued-menu-text",
      });
      eightMakesAPie.allergens = ["gluten", "milk", "wheat"];
      eightMakesAPie.allergenSourceType = "official-ingredients";
      eightMakesAPie.isConfigurable = true;
      eightMakesAPie.variantGroup = "Standard Pies & Slices";
      atlasAndAndys.items.push(eightMakesAPie);
    }

    const pizzaCategories = new Set(["Specialty Pies", "Standard Pies & Slices"]);
    for (const menuItem of atlasAndAndys.items) {
      if (!pizzaCategories.has(menuItem.category)) continue;
      menuItem.allergens = [...new Set([...(menuItem.allergens ?? []), "wheat", "gluten"])].sort();
      menuItem.mayContain = [];
      menuItem.allergenSourceType = "official-ingredients";
      menuItem.sourceUrls = [...new Set([
        ...(menuItem.sourceUrls ?? []),
        "https://www.eatandyspizza.com/menu/atlas-navy-yard/",
      ])];
      menuItem.sourceSummary =
        "The exact-location restaurant-issued menu applies its 72-hour sourdough crust description to current pizza rows; direct item text supplies any additional positive signals. This is not a complete allergen matrix or cross-contact claim.";
    }

    atlasAndAndys.items.sort((left, right) => {
      const categoryOrder = new Map([
        ["Starters + Salads", 0],
        ["Specialty Pies", 1],
        ["Standard Pies & Slices", 2],
        ["Extra Sauce", 3],
      ]);
      return (categoryOrder.get(left.category) ?? 99) - (categoryOrder.get(right.category) ?? 99);
    });
    atlasAndAndys.guideUrl = "https://www.eatandyspizza.com/menu/atlas-navy-yard/";
    atlasAndAndys.guideLabel = "Current Andy's and Navy Yard menus";
    atlasAndAndys.sourceUrls = [
      "https://atlasbrewworks.com/pages/navy-yard",
      "https://www.eatandyspizza.com/menu/atlas-navy-yard/",
      "https://www.eatandyspizza.com/menus/",
      "https://order.toasttab.com/online/atlas-brew-works-navy-yard-1201-half-street-se-suite-120",
    ];
    atlasAndAndys.updated = "2026-07";
    const atlasRepairNote =
      "Restaurant verification repair: reconciled the 38-row exact-location Navy Yard food boundary across the restaurant-issued menu and linked Toast surface; restored four menu sections; normalized Fried Cauliflower and Old Bay Fries; removed operational duplicates and the beverage row; restored Dairy Free Margherita, 8 Makes a Pie, and Side of Ranch; and applied the universal sourdough crust wheat/gluten disclosure to every pizza row.";
    atlasAndAndys.sourceStatus = {
      ...(atlasAndAndys.sourceStatus ?? {}),
      canonicalProductCount: 38,
      consumerCategoryCount: 4,
      operationalDuplicateCount: 3,
      nonFoodRowCount: 1,
      reviewedMenuQualityRepairs: [
        ...(atlasAndAndys.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => repair.note !== atlasRepairNote,
        ),
        {note: atlasRepairNote},
      ],
    };
    atlasAndAndys.allergenDataStatus = {
      ...(atlasAndAndys.allergenDataStatus ?? {}),
      officialEvidence: {
        ...(atlasAndAndys.allergenDataStatus?.officialEvidence ?? {}),
        officialIngredientDisclosure: 32,
        unavailable: 6,
        suspiciousOfficialParserFragments: 0,
      },
    };
  }

  const verifiedAugiesAlexandria = restaurant(
    "augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro",
  );
  const augiesRemovedIds = new Set([
    "smoked-salmon-and-spinach-2-steak-and-asparagus",
    "smoked-salmon-and-spinach-2-steak-and-asparagus-5-crab-cake",
    "croutons-red-onion-herb-vinaigrette",
    "horseradish-provolone-crispy-onions",
    "single-or-double",
    "upgrades",
    "augies-burger",
    "jumbo-lump-maryland-crab-cake-sandwich",
    "maryland-crab-dip",
    "maryland-crab-soup",
    "mason-fried-chicken",
    "potato-skins",
    "shrimp-po-boy",
    "pancake-shot",
    "sober-rockfish-fishbowl",
  ]);
  if (
    verifiedAugiesAlexandria &&
    (
      (verifiedAugiesAlexandria.items ?? []).length !== 122 ||
      new Set((verifiedAugiesAlexandria.items ?? []).map((menuItem) => menuItem.id)).size !== 122 ||
      new Set((verifiedAugiesAlexandria.items ?? []).map((menuItem) => menuItem.category)).size !== 12 ||
      (verifiedAugiesAlexandria.items ?? []).some((menuItem) => augiesRemovedIds.has(menuItem.id)) ||
      (verifiedAugiesAlexandria.items ?? []).some((menuItem) =>
        menuItem.mayContain?.length !== 1 || menuItem.mayContain[0] !== "gluten"
      ) ||
      (verifiedAugiesAlexandria.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "official-ingredients"
      ).length !== 68 ||
      (verifiedAugiesAlexandria.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "restaurant-linked-menu-ingredients"
      ).length !== 5 ||
      (verifiedAugiesAlexandria.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "restaurant-linked-product-allergen-section"
      ).length !== 7 ||
      (verifiedAugiesAlexandria.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "official-global-cross-contact-note"
      ).length !== 14 ||
      (verifiedAugiesAlexandria.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "unavailable"
      ).length !== 28
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the partial mixed-location 69-row extraction with 122 current Alexandria food and nonalcoholic products across 12 real sections; removed six parser fragments and nine Annapolis-only rows; consolidated repeated owner, Toast, brunch, and late-night presentations; restored 71 omitted formulations; preserved seven restaurant-linked Toast positive allergen labels without relabeling them as official; applied the restaurant-issued kitchen-wide gluten cross-contact warning to every current row; and kept optional choices, generic allergy modifiers, absent labels, and the raw-food advisory out of fixed allergen claims.",
    );
    verifiedAugiesAlexandria.guideUrl =
      "https://www.eataugies.com/augies-alexandria-menu";
    verifiedAugiesAlexandria.guideLabel = "Current Alexandria menu and linked ordering source";
    verifiedAugiesAlexandria.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAugiesAlexandria.sourceFamily = "verified-mixed-menu";
    verifiedAugiesAlexandria.parserProfile = "verified-augies-alexandria";
    verifiedAugiesAlexandria.sourceProfile =
      "verified-augies-alexandria:owner-menu+restaurant-linked-toast";
    verifiedAugiesAlexandria.updated = "2026-07";
    verifiedAugiesAlexandria.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAugiesAlexandria.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAugiesAlexandria.coverageStatus = "complete";
    verifiedAugiesAlexandria.launchQualityStatus = "published";
    verifiedAugiesAlexandria.launchRemediationBucket = "none";
    verifiedAugiesAlexandria.sourceStatus = {
      ...(verifiedAugiesAlexandria.sourceStatus ?? {}),
      canonicalProductCount: 122,
      consumerCategoryCount: 12,
      frozenArtifactCount: 6,
      frozenLocationMismatchCount: 9,
      restoredCurrentProductCount: 71,
      sourceManifestFingerprint: verifiedSnapshot.itemNameFingerprint,
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:primary-menu:https://www.eataugies.com/augies-alexandria-menu",
          "menu:restaurant-linked-ordering:https://www.toasttab.com/local/order/augies-mussel-house-patio",
        ],
        configuredUrlWarnings: [],
        nonFoodDocumentSuspected: false,
      },
    };
  }

  filterItems(
    "osm-asian-2393478597",
    (menuItem) =>
      !/^(?:Coke Can|Diet Coke Can|Sprite Can|Duck Sauce package\s*\(?.*|Mustard Sauce package\s*\(?.*|Soy Sauce package\s*\(?.*|Dumpling sauce|Hoisin Sauce|Hot Sauce|Mumbo sauce|Sweet & Sour Sauce)$/i.test(
        name(menuItem),
      ) && !/^Extra .+ Sauce$/i.test(name(menuItem)),
    "Final generated repair: removed Asian Grill drink, sauce-packet, and extra-sauce modifier rows from the published food menu.",
  );
  const asianGrill = restaurant("osm-asian-2393478597");
  if (asianGrill) {
    asianGrill.sourceFamily = "toast";
    asianGrill.parserProfile = "toast-menu";
    asianGrill.sourceProfile = "toast-menu";
    asianGrill.expectedLargeMenu = true;
    asianGrill.sourceStatus = {
      ...(asianGrill.sourceStatus ?? {}),
      reviewedMenuQualityRepairs: [
        ...(asianGrill.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          note:
            "Reviewed oversized queue: Asian Grill is a large Toast-backed orderable menu after removing drink and sauce modifier rows.",
        },
      ],
    };

    const unsupportedCulinaryInferenceItemIds = new Set([
      "cheese-cake-1-slice",
      "chocolate-mousse-cake-1-slice",
      "home-style-wonton-soup-for-2",
      "mango-mousse-cake-1-slice",
      "wonton-soup",
      "wonton-soup-large",
    ]);
    for (const menuItem of asianGrill.items ?? []) {
      if (unsupportedCulinaryInferenceItemIds.has(menuItem.id)) {
        menuItem.allergens = [];
        menuItem.mayContain = [];
        menuItem.allergenSourceType = "unavailable";
        delete menuItem.sourceSummary;
      }
    }

    const crabCake = asianGrill.items?.find((menuItem) => menuItem.id === "crab-cake");
    if (crabCake) {
      crabCake.allergens = ["shellfish"];
      crabCake.mayContain = [];
      crabCake.allergenSourceType = "official-ingredients";
    }
    asianGrill.sourceStatus.reviewedMenuQualityRepairs.push({
      note:
        "Restaurant verification repair: retained only allergens directly supported by Asian Grill's restaurant-authored Toast names or descriptions; removed unsupported cake and wonton culinary-name inferences while preserving explicit shellfish on Crab Cake.",
    });
  }

  const succotashSalad = item("succotash-dc", "seasonal-house-salad-dollar18-00");
  if (succotashSalad) {
    succotashSalad.description = "Seasonal house salad. Add fried chicken thigh, grilled shrimp, or skirt steak.";
  }

  const grillMediterranean = item("the-grill-washington-dc-dc-metro", "mediterranean-chopped");
  if (grillMediterranean) {
    grillMediterranean.description =
      "Grilled artichoke, feta, crispy chickpeas, olives, tomatoes, and red wine vinaigrette. Add Ora King salmon, skirt steak, or chicken breast.";
  }
  const grillSteakEggs = item("the-grill-washington-dc-dc-metro", "steak-and-eggs");
  if (grillSteakEggs) {
    grillSteakEggs.description = "Skirt steak, eggs your way, and roasted potatoes.";
  }

  const pleromaLunchBox = item("pleroma-cuisine-laurel-md-dc-metro", "corporate-lunch-box-premium-finger-foods-box");
  if (pleromaLunchBox) {
    pleromaLunchBox.description =
      "Includes chicken samosa, spring roll, coconut shrimp, puff puff, seasoned chicken, juice, fruit cup, and customizable protein or rice options.";
  }

  for (const itemId of ["media-charola-half-tray-6-tacos", "taco-individual"]) {
    const menuItem = item("osm-tacos-don-perez-8504662317", itemId);
    if (!menuItem) {
      continue;
    }
    if (itemId === "media-charola-half-tray-6-tacos") {
      menuItem.description =
        "Half tray of 6 tacos with one protein choice; birria includes consome on the side.";
    } else {
      menuItem.description =
        "Individual taco with choice of protein; single birria tacos do not include consome unless added on the side.";
    }
  }

  const rakuSashimi = item("raku-bethesda-md", "tuna-salmon-white-fish-sashimi");
  if (rakuSashimi) {
    rakuSashimi.description = "Tuna, salmon, and white fish sashimi.";
  }

  const grilledOysterCombo = item(
    "replacement-the-grilled-oyster-company-gaithersburg-md",
    "maine-lobster-pasta-and-jumbo-lump-crab-cakes",
  );
  if (grilledOysterCombo) {
    grilledOysterCombo.description =
      "Creamy tomato Maine lobster pasta and two 5-ounce jumbo lump crab cakes with roasted corn, cucumber succotash, and Dijon fennel mustard.";
  }

  removeItems(
    "miss-toya-s-creole-house-silver-spring-md-dc-metro",
    ["chicken-dollar8"],
    "Final generated repair: catering add-on price row removed from published menu items.",
  );
  removeItems(
    "dolce-vita-italian-restaurant-and-wine-bar-fairfax-va-dc-metro",
    ["step-3-pick-your-protein"],
    "Final generated repair: ordering step/add-on row removed from published menu items.",
  );
  removeItems(
    "the-park-at-14th-washington-dc-dc-metro",
    ["pastas"],
    "Final generated repair: collapsed pasta section text removed from published menu items.",
  );
  removeItems(
    "guerra-steakhouse-arlington-va",
    ["soupsandsalads"],
    "Final generated repair: collapsed soup/salad section row removed from published menu items.",
  );
  removeItems(
    "mitsitam-native-foods-cafe-dc",
    ["more-photos"],
    "Final generated repair: gallery/navigation row removed from published menu items.",
  );
  removeItems(
    "replacement-han-palace-woodley-park-washington-dc",
    ["barracks-row-store"],
    "Final generated repair: location/review text row removed from published menu items.",
  );
  removeItems(
    "replacement-donsak-thai-restaurant-washington-dc",
    ["shrimp-served-with-bok-choi-greens"],
    "Final generated repair: row-boundary fragment removed from published menu items.",
  );
  removeItems(
    "replacement-kapow-buddy-bethesda-md",
    ["proteins"],
    "Final generated repair: protein option group removed from published menu items.",
  );
}

for (const entry of repairEntries()) {
  if (!entry?.items?.length) {
    continue;
  }
  const removed = [];
  entry.items = entry.items.filter((menuItem) => {
    if (
      entry.id === "augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro" &&
      menuItem.category === "Mocktails"
    ) {
      return true;
    }
    const classification = classifyMenuItemRow(menuItem);
    if (classification.kind === "menu-item") {
      return true;
    }
    removed.push({
      id: menuItem.id,
      name: menuItem.name,
      kind: classification.kind,
      reasons: classification.reasons,
    });
    return false;
  });
  if (removed.length > 0) {
    entry.sourceStatus = {
      ...(entry.sourceStatus ?? {}),
      reviewedMenuQualityRepairs: [
        ...(entry.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          removedItemCount: removed.length,
          note: "Final generated repair: removed rows rejected by the shared menu-item classifier.",
          examples: removed.slice(0, 12),
        },
      ],
    };
    entry.allergenDataStatus = {
      ...(entry.allergenDataStatus ?? {}),
      totalItemCount: entry.items.length,
    };
    setOfficialCount(entry);
  }
}

{
  const lostDog = restaurant("lost-dog-cafe-dunn-loring-fairfax-va-dc-metro");
  if (lostDog && !lostDog.items?.some((menuItem) => menuItem.id === "37-holy-cow-less")) {
    lostDog.items = [
      ...(lostDog.items ?? []),
      {
        id: "37-holy-cow-less",
        name: "#37 HOLY COW-LESS",
        category: "Sandwiches",
        description:
          "Vegan meatball crumbles with garlic butter, marinara, melted mozzarella and parmesan cheese, served on a toasted sub roll. Contains soy and wheat.",
        ingredientsText:
          "Vegan meatball crumbles, garlic butter, marinara, mozzarella, parmesan cheese, toasted sub roll.",
        imageUrl: null,
        isConfigurable: false,
        allergenSourceType: "official-ingredients",
        allergens: ["gluten", "milk", "soy", "wheat"],
        mayContain: [],
        sourceType: "html-card",
        sourceUrls: ["https://order.lostdogcafe.com/order/lost-dog-cafe-dunn-loring?diningOption=delivery"],
        variantGroup: "Sandwiches",
        evidence: [
          {
            sourceKind: "html-card",
            sourceUrl: "https://order.lostdogcafe.com/order/lost-dog-cafe-dunn-loring?diningOption=delivery",
            text:
              "Vegan Meatball crumbles with garlic butter, marinara, melted mozzarella and parmesan cheese, served on a toasted sub roll. (CONTAINS: SOY & WHEAT)",
          },
          {
            sourceKind: "manual-quality-review",
            sourceUrl: "",
            text:
              "Reviewed official menu ingredient review: explicit item text and source contains disclosure were mapped to direct allergen concerns.",
          },
        ],
      },
    ];
    lostDog.sourceStatus = {
      ...(lostDog.sourceStatus ?? {}),
      reviewedMenuQualityRepairs: [
        ...(lostDog.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          restoredItemCount: 1,
          note:
            "Final generated repair: restored Lost Dog #37 HOLY COW-LESS from source-backed prior scrape after classifier cleanup removed surrounding artifacts.",
        },
      ],
    };
    setOfficialCount(lostDog);
  }
}

{
  const kyoMatcha = restaurant("osm-kyo-matcha-11399205396");
  if (kyoMatcha && (kyoMatcha.items?.length ?? 0) === 0) {
    const sourceUrl = "https://order.online/store/kyo-matcha-falls-church-va-25064618";
    replaceReviewedMenu(
      "osm-kyo-matcha-11399205396",
      [
        ["Tiramisu Crepe Layer Cake", "Crepe Layer Cake Series"],
        ["Matcha Crepe Layer Cake", "Crepe Layer Cake Series"],
        ["Chocolate Crepe Layer Cake", "Crepe Layer Cake Series"],
        ["Passion Fruit Crepe Cake", "Crepe Layer Cake Series"],
        ["Mango Crepe Layer Cake", "Crepe Layer Cake Series"],
        ["Matcha Red Bean Towel Cake", "Cake Series"],
        ["Ube Towel Cake", "Cake Series"],
        ["Hokkaido Milk Salty Roll Cake", "Cake Series"],
        ["Matcha Roll Cake", "Cake Series"],
        ["Matcha Cheese Mousse Cake", "Cheese Mousse Cake"],
        ["Black Sesame Mousse Cake", "Cheese Mousse Cake"],
        ["Brown Sugar Boba Milk Cap Cake", "Milk Cap Cake Series"],
        ["Rose Strawberry Milk Cap Cake", "Milk Cap Cake Series"],
        ["Mochi Soymilk Milk Cap Cake", "Milk Cap Cake Series"],
        ["Matcha Milk Cap Cake", "Milk Cap Cake Series"],
        ["Custard Puff", "Sweet Treats"],
        ["Matcha Puff", "Sweet Treats"],
        ["Dream of Sakura", "Sweet Treats"],
        ["Matcha Latte", "Drink Series"],
        ["Strawberry Matcha Latte", "Drink Series"],
        ["Brown Sugar Boba Milk", "Drink Series"],
        ["Hojicha Latte", "Drink Series"],
        ["Japanese Banana Milk", "Drink Series"],
        ["Strawberry Milk", "Drink Series"],
        ["Jasmine Matcha Latte", "Drink Series"],
      ].map(([name, category]) => reviewedMenuItem({ name, category, sourceUrl, sourceKind: "reviewed-third-party-menu" })),
      "Final generated repair: recovered Kyo Matcha Falls Church reviewed menu rows from DoorDash/order.online after the official Wix page only exposed widget shell text.",
    );
  }

  const ahso = restaurant("replacement-ahso-restaurant-brambleton-va");
  if (ahso && (ahso.items?.length ?? 0) === 0) {
    const sourceUrl = "https://www.toasttab.com/local/order/ahso-cellars-22855-brambleton-plz-105";
    replaceReviewedMenu(
      "replacement-ahso-restaurant-brambleton-va",
      [
        ["Bread Board", "Resto Brunch"],
        ["Fruit, Yogurt, & Granola", "Resto Brunch"],
        ["Pork Ribs", "Resto Brunch"],
        ["Short Rib & Kimchi Wraps", "Resto Brunch"],
        ["Brunch Toast", "Resto Brunch"],
        ["French Toast", "Resto Brunch"],
        ["Shrimp & Grits", "Resto Brunch"],
        ["Shakshuka", "Resto Brunch"],
        ["Breakfast Hash", "Resto Brunch"],
        ["Benedict", "Resto Brunch"],
        ["Steak & Eggs", "Resto Brunch"],
        ["Brunch Burger", "Resto Brunch"],
        ["Mediterranean Dip", "Resto Lunch"],
        ["Mussels", "Resto Lunch"],
        ["Local Beets & Whipped Chevre", "Resto Lunch"],
        ["Grilled Vegetable Sandwich", "Resto Lunch"],
        ["Grilled Cheese", "Resto Lunch"],
        ["Ahso Burger", "Resto Lunch"],
        ["Steak Salad", "Resto Lunch"],
        ["Steak Frites", "Resto Lunch"],
        ["Pork Chop", "Resto Lunch"],
        ["Branzino", "Resto Lunch"],
      ].map(([name, category]) => reviewedMenuItem({ name, category, sourceUrl, sourceKind: "reviewed-third-party-menu" })),
      "Final generated repair: recovered Ahso reviewed menu rows from Toast/OpenTable-visible menu evidence after the official Wix page only exposed widget shell text.",
    );
  }
}

{
  const reviewedMenuRows = (rows, sourceUrl, sourceKind = "reviewed-menu") =>
    rows.map(([name, category, description]) =>
      reviewedMenuItem({ name, category, description, sourceUrl, sourceKind }),
    );

  for (const restaurantId of ["dolan-uyghur-dc", "osm-dolan-4198051508"]) {
    const dolan = restaurant(restaurantId);
    if (dolan && (dolan.items?.length ?? 0) < 10) {
      const sourceUrl = "https://www.dolanuyghur.com/menu";
      replaceReviewedMenu(
        restaurantId,
        reviewedMenuRows(
          [
            [
              "Big Plate Chicken",
              "Chef's Specialties",
              "Marinated bone-in chicken with vegetables on hand-pulled flat noodles.",
            ],
            ["Arlash Korma", "Chef's Specialties", "Stir-fried lamb with onions, mushrooms, cucumbers, oyster-flavored sauce, tomatoes, and house spices."],
            ["Dry Pot", "Chef's Specialties", "Beef, shrimp, fishball, shrimp ball, fish tofu, squid, gluten, bok choy, spicy garlic sauce, and white rice."],
            ["Uyghur Pilaf with Beef", "Chef's Specialties", "Steamed rice with carrots and onions, served with beef and side salad."],
            ["Uyghur Pilaf with Lamb Shank", "Chef's Specialties", "Steamed rice with carrots and onions, served with lamb shank and side salad."],
            ["Goshnan", "Chef's Specialties", "Uyghur-style meat pie stuffed with beef, lamb, onions, and spices."],
            ["Kawa Goshnan", "Chef's Specialties", "Fried bread stuffed with butternut squash, onions, bell peppers, and spices."],
            ["Samsa", "Appetizers", "Oven-baked bun with minced beef, lamb, onions, black pepper, red pepper, and sesame oil."],
            ["Chuchura", "Appetizers", "Mini dumpling soup with minced beef, lamb, onions, and black pepper."],
            ["Lentil Soup", "Appetizers", "Lentil soup with wheat flour, onions, potatoes, red chili sauce, tomato sauce, and mint."],
            ["Cold Skin Noodle", "Appetizers", "Wheat-flour noodles with cucumber, cilantro, bean sprouts, gluten, and spicy sauce."],
            ["Cold Egg Noodle", "Appetizers", "Flour and egg noodles with spicy sesame, peanut, sesame sauce, and chili oil."],
            ["Cucumber Salad", "Appetizers", "Diced cucumbers with sesame oil and garlic sauce."],
            ["Spicy Chicken Salad", "Appetizers", "Spiced chicken, onion, scallion, and pepper with chili sauce."],
            ["Kung Pao Chicken", "Entrees", "Chicken, onion, carrot, and peanut served with white rice."],
            ["Red Chili Chicken", "Entrees", "Diced chicken with chili pepper served with white rice."],
            ["Spicy Tofu", "Entrees", "Tofu with spicy sauce."],
            ["Uyghur Yogurt", "Desserts", "Yogurt served with walnut, raisin, and honey."],
            ["Dolan Cake", "Desserts", "Cake with white flour, eggs, honey, walnuts, sour cream, buttery cream, and lemon."],
            ["Chocolate Cake", "Desserts", "Chocolate cake."],
          ],
          sourceUrl,
        ),
        "Final generated repair: recovered Dolan Uyghur reviewed menu rows from the public Dolan menu/OpenTable-visible menu after the scraper underextracted the source.",
      );
    }
  }

  const rosa = restaurant("rosa-mexicano-washington-dc-dc-metro");
  if (rosa && (rosa.items?.length ?? 0) < 10) {
    const sourceUrl = "https://www.rosamexicano.com/wp-content/uploads/2023/05/RM.DinnerMenu.042623_T3.web_.pdf";
    replaceReviewedMenu(
      "rosa-mexicano-washington-dc-dc-metro",
      reviewedMenuRows(
        [
          ["Tableside Guacamole", "Starters", "Signature guacamole prepared tableside."],
          ["Black Bean and Cheese Empanadas", "Starters", "Empanadas with black beans and cheese."],
          ["Chicken Flautas", "Starters", "Crisp flautas with chicken."],
          ["Quesadillas", "Starters", "Quesadillas with cheese."],
          ["Ceviche", "Starters", "Seafood ceviche."],
          ["Tacos Steak", "Tacos", "Steak tacos."],
          ["Tacos Red Chile Shrimp", "Tacos", "Shrimp tacos with red chile."],
          ["Tacos Red Chile Chicken", "Tacos", "Chicken tacos with red chile."],
          ["Tacos Pork Carnitas", "Tacos", "Pork carnitas tacos."],
          ["Tacos Crispy Shrimp Tempura", "Tacos", "Crispy shrimp tempura tacos."],
          ["Chile Rellenos", "Main Course", "Stuffed chile rellenos."],
          ["Camarones al Mojo de Ajo", "Main Course", "Shrimp with garlic sauce."],
          ["Pork Carnitas de Cazuela", "Main Course", "Pork carnitas cazuela."],
          ["Roasted Chicken", "Main Course", "Roasted chicken."],
          ["Ribeye", "Main Course", "Ribeye steak."],
          ["Pork Shank", "Main Course", "Pork shank."],
          ["Parrilladas", "Main Course", "Mexican-style grill served on a sizzling platter."],
          ["Churros", "Desserts", "Churros."],
          ["Margarita Lime Tart", "Desserts", "Lime tart."],
          ["Tres Leches", "Desserts", "Tres leches cake."],
        ],
        sourceUrl,
      ),
      "Final generated repair: recovered Rosa Mexicano reviewed menu rows from the public Rosa Mexicano menu/PDF-visible evidence after the scraper underextracted the source.",
    );
  }

  const shamshiry = restaurant("shamshiry-vienna-va-dc-metro");
  if (shamshiry && (shamshiry.items?.length ?? 0) < 10) {
    const sourceUrl = "https://www.shamshiry.com/";
    replaceReviewedMenu(
      "shamshiry-vienna-va-dc-metro",
      reviewedMenuRows(
        [
          ["Chelo Kabob Kubideh", "Meat", "Ground beef kabob with rice."],
          ["Chelo Kabob Barg", "Meat", "Filet mignon kabob with rice."],
          ["Chelo Kabob Shamshiry", "Meat", "Combination kabob with rice."],
          ["Chicken Soltani", "Meat", "Chicken soltani kabob with rice."],
          ["Lamb Sultani", "Meat", "Lamb sultani kabob with rice."],
          ["Joojeh Kabob", "Chicken", "Chicken kabob."],
          ["Chicken Kabob Sandwich", "Sandwiches", "Chicken kabob sandwich."],
          ["Kubideh Sandwich", "Sandwiches", "Kubideh kabob sandwich."],
          ["Shirin Polo", "Rice", "Sweet rice with sugared orange peel, pistachios, and almonds."],
          ["Mast-o Khiar", "Sides", "Yogurt and cucumber side."],
          ["Mast-o Mousir", "Sides", "Yogurt and shallot side."],
          ["Salad Shirazi", "Salads", "Persian cucumber, tomato, and onion salad."],
        ],
        sourceUrl,
      ),
      "Final generated repair: recovered Shamshiry reviewed menu rows from its public menu-visible evidence after the scraper underextracted the source.",
    );
  }

  const azteca = restaurant("azteca-restaurant-college-park-md-dc-metro");
  if (azteca && ((azteca.items?.length ?? 0) < 10 || azteca.officialAllergenStatus === "extracted")) {
    const sourceUrl = "https://www.aztecarestaurantandcantina.com/menu";
    replaceReviewedOfficialIngredientMenu(
      "azteca-restaurant-college-park-md-dc-metro",
      [
        {
          id: "ceviche-mixto-peruano",
          name: "Ceviche Mixto Peruano",
          category: "Mexican",
          description:
            "Fresh shrimp, and white fish marinated in lemon juice, spices, bermuda onions, and cilantro. Served with mussels, sweet potatoes, calamari, corn elote peruano, and rocoto peppers.",
          allergens: ["fish", "shellfish"],
          sourceUrl,
        },
        {
          id: "grilled-quesadilla",
          name: "Grilled Quesadilla",
          category: "Mexican",
          description:
            "Choice of grilled chicken, beef or mixed. Flour tortilla, filled with melted cheese, served with pico de gallo, guacamole and sour cream.",
          allergens: ["gluten", "milk", "wheat"],
          sourceUrl,
        },
        {
          id: "nachos-azteca",
          name: "Nachos Azteca",
          category: "Mexican",
          description: "Corn chips covered with refried beans, cheese and charbroiled chicken or beef.",
          allergens: ["milk"],
          sourceUrl,
        },
      ],
      "Final generated repair: preserved Azteca's source-backed official ingredient evidence instead of replacing it with a broader unofficial tiny-menu recovery.",
    );
  }

  const catahoula = restaurant("catahoula-dc");
  if (catahoula && (catahoula.items?.length ?? 0) < 20) {
    const sourceUrl = "https://catahouladc.com/menu/";
    replaceReviewedMenu(
      "catahoula-dc",
      reviewedMenuRows(
        [
          ["Cheddar Biscuits", "Food", "Cheddar biscuits."],
          ["Cinnamon Rolls", "Food", "Cinnamon rolls."],
          ["Iceberg Wedge", "Food", "Iceberg wedge salad."],
          ["Branzino", "Mains", "Branzino."],
          ["Dirty Rice", "Sides", "Dirty rice."],
          ["Gnocchi", "Mains", "Gnocchi."],
          ["Mumbai Masala Toast", "Small Plates", "Mumbai masala toast."],
          ["Oyster", "Raw Bar", "Oyster."],
          ["Pumpkin Soup", "Soups", "Pumpkin soup."],
          ["Cabbage", "Sides", "Cabbage."],
          ["Carrots", "Sides", "Carrots."],
          ["Cheeseburger Poor Boy", "Poor Boys", "Cheeseburger poor boy sandwich."],
          ["Hot Creole Poor Boy", "Poor Boys", "Hot Creole poor boy sandwich."],
          ["Shrimp Poor Boy", "Poor Boys", "Shrimp poor boy sandwich."],
          ["Catfish Poor Boy", "Poor Boys", "Catfish poor boy sandwich."],
          ["French Fry Poor Boy", "Poor Boys", "French fry poor boy sandwich."],
          ["Oyster Poor Boy", "Poor Boys", "Oyster poor boy sandwich."],
          ["Surf N Turf Poor Boy", "Poor Boys", "Surf and turf poor boy sandwich."],
          ["Debris", "Poor Boys", "Debris poor boy."],
          ["Maitake Poor Boy", "Poor Boys", "Maitake mushroom poor boy sandwich."],
          ["Pommes Frites", "Other", "Pommes frites."],
          ["Thrice Baked Potato", "Other", "Thrice baked potato."],
          ["Crispy Okra", "Other", "Crispy okra."],
          ["Corn Guppies", "Other", "Corn guppies."],
          ["Boil", "Other", "Seafood boil."],
          ["Etouffee Special", "Other", "Etouffee special."],
          ["Maque Choux", "Other", "Maque choux."],
          ["Shrimp Basket", "Other", "Shrimp basket."],
          ["Oyster Basket", "Other", "Oyster basket."],
          ["Shrimp & Oyster Basket", "Other", "Shrimp and oyster basket."],
          ["Muffuletta", "Other", "Muffuletta sandwich."],
          ["Beignet", "Dessert", "Beignet."],
          ["Gateau aux Carottes", "Dessert", "Carrot cake."],
          ["Chicory Creme Brulee", "Dessert", "Chicory creme brulee."],
          ["Chocolate Mousse", "Dessert", "Chocolate mousse."],
        ],
        sourceUrl,
        "reviewed-official-menu",
      ),
      "Final generated repair: recovered Catahoula menu rows from official menu image/OCR and Toast-visible menu evidence after the shared image-menu gate removed both real dishes and image artifacts.",
    );
  }

  const noosh = restaurant("replacement-noosh-grill-fairfax-va");
  if (noosh && (noosh.items?.length ?? 0) < 10) {
    const sourceUrl = "https://www.eatnoosh.com/";
    replaceReviewedMenu(
      "replacement-noosh-grill-fairfax-va",
      reviewedMenuRows(
        [
          ["Protein & Salad Bowl", "Bowls", "Choice of protein with rice, chopped salad, and choice of sauce."],
          ["Chicken Schnitzel Bowl", "Bowls", "German-style hand-battered chicken, hummus, rice, chopped salad, and sauce."],
          ["Chapli Bowl", "Bowls", "Spiced beef with herbs served over rice and salad."],
          ["Classic Smashburger", "Smashburgers", "Beef patty with cheese, pickles, and burger sauce."],
          ["Jalapeno Smashburger", "Smashburgers", "Beef patty with cheese, jalapeno, and burger sauce."],
          ["Chicken Schnitzel", "Subs", "Hand-battered chicken with lettuce, onion, tomato, pickles, and garlic aioli."],
          ["Chapli Chopped Cheese", "Subs", "Spiced beef with herbs, cheese, toppings, and sauce."],
          ["Original Chopped Cheese", "Subs", "Beef chopped cheese sub."],
          ["Buffalo Chicken Cheesesteak", "Subs", "Chicken cheesesteak with buffalo sauce."],
          ["Masala Chicken and Cheese", "Subs", "Masala chicken and cheese sub."],
        ],
        sourceUrl,
        "reviewed-official-menu",
      ),
      "Final generated repair: recovered Noosh menu rows from official page image/OCR evidence after collapsed builder rows and review cards were removed.",
    );
  }

  const rosemarino = restaurant("replacement-rosemarino-d-italia-i-dupont-circle-washington-dc");
  if (
    rosemarino &&
    ((rosemarino.items?.length ?? 0) < 20 || rosemarino.items?.some((menuItem) => menuItem.id === "caesar"))
  ) {
    const sourceUrl = "https://www.rosemarinoditalia.com/menu";
    replaceReviewedMenu(
      "replacement-rosemarino-d-italia-i-dupont-circle-washington-dc",
      reviewedMenuRows(
        [
          ["Italian Wedding Soup", "Antipasti", "Italian wedding soup."],
          ["Zuppe Minestrone", "Antipasti", "Mixed vegetables and white beans."],
          ["Arancini", "Antipasti", "Fried risotto with mozzarella and chef's aioli."],
          ["Bruschetta", "Antipasti", "Toasted baguettes, tomato, sun-dried tomato, basil, garlic, parmesan, and Italian herbs."],
          ["Calamari Fritti", "Antipasti", "Fried calamari with spicy marinara."],
          ["Mozzarella Fritta", "Antipasti", "Fried mozzarella with marinara."],
          ["Garlic Bread", "Antipasti", "Garlic bread with parmesan, Italian herbs, and olive oil."],
          ["Cozze e Vongole", "Antipasti", "Steamed mussels and clams in garlic white wine sauce."],
          ["Romana", "Insalata", "Romaine lettuce, cucumber, carrots, red onion, tomato, sundried tomatoes, shaved parmesan, and garlic olive oil dressing."],
          ["Caesar Salad", "Insalata", "Romaine lettuce, croutons, shaved parmesan, and caesar dressing."],
          ["Scampi Di Gamberi", "Entrees", "Shrimp with sweet peppers, spring onions, spinach, basil, garlic white wine butter sauce, and linguine."],
          ["Seared Rainbow Trout", "Entrees", "Rainbow trout with spaghetti aglio e olio and sauteed spinach."],
          ["Salmone e Pomodoro", "Entrees", "Grilled salmon with tomatoes, garlic, onion, basil, olive oil, and fresh linguine pasta."],
          ["Mixed Seafoods", "Entrees", "Shrimp, mussels, clams, calamari, fresh linguine pasta, garlic white wine or marinara."],
          ["Rosemarino", "Entrees", "Clams, shrimp, scallops, bell peppers, basil, spinach, lobster cream, and fresh linguine pasta."],
          ["Ravioli", "Entrees", "Beef, spinach, and ricotta ravioli with parmesan, fresh mozzarella, and vodka sauce."],
          ["Spicy Sausage & Leeks", "Entrees", "Spicy Italian sausage, leeks, creamy parmesan sauce, and fresh rigatoni pasta."],
          ["Lasagne di Carne", "Entrees", "Ground beef and veal with bechamel, parmesan, mozzarella, marinara, and layered pasta."],
          ["Bolognese", "Entrees", "Ground beef and veal meat sauce with fresh fusilli pasta or gnocchi."],
          ["Pesto", "Entrees", "Basil pesto, garlic, fresh basil, and fresh rigatoni pasta."],
          ["Nostra Carbonara", "Entrees", "Pancetta, onions, egg yolk, parmesan, basil pesto, and fresh spaghetti pasta."],
          ["Primavera", "Entrees", "Seasonal vegetables, garlic, olive oil, and fresh fusilli pasta."],
          ["Alfredo", "Entrees", "Cream, butter, parmesan, nutmeg, and fresh fettuccine pasta."],
          ["Parmigiana", "Signatures", "Choice of chicken or veal, breaded and deep fried with mozzarella, marinara, and fresh rigatoni pasta."],
          ["Shrimp & Scallops", "Risotto", "Creamy saffron arborio rice with pan-seared scallops and shrimp."],
          ["Scallops e Funghi", "Risotto", "Creamy lobster arborio rice with pan-seared scallops and mushrooms."],
          ["Profiteroles", "Dessert", "Puffs filled with vanilla creme."],
          ["Cannoli", "Dessert", "Shells stuffed with lemon zest ricotta filling."],
          ["Spumoni", "Dessert", "Chocolate, strawberry, and pistachio ice cream."],
          ["Tiramisu", "Dessert", "Ladyfingers dipped in espresso with mascarpone cream and cocoa powder."],
        ],
        sourceUrl,
        "reviewed-official-menu",
      ),
      "Final generated repair: recovered Rosemarino menu rows from official menu image/OCR evidence after hash-prefixed image rows were removed.",
    );
  }

  const oneHundredBowls = restaurant("osm-100-bowls-soup-stock-13738956373");
  if (
    oneHundredBowls &&
    (
      (oneHundredBowls.items?.length ?? 0) === 0 ||
      oneHundredBowls.items?.some((menuItem) =>
        ["seasonal-vegan-soup", "meat-soup", "chili", "thai-sweet-potato"].includes(menuItem.id),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-100-bowls-soup-stock-13738956373/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedSquareIngredientMenu(
      "osm-100-bowls-soup-stock-13738956373",
      verifiedSnapshot,
      "Verified repair: replaced the stale nine-row fallback with the current restaurant-linked Square soup and broth catalog, preserving direct ingredient evidence and accurately unavailable rows.",
    );
  }

  const thirteenTen = restaurant("replacement-1310-kitchen-and-bar-washington-dc");
  if (
    thirteenTen &&
    (
      (thirteenTen.items?.length ?? 0) !== 182 ||
      thirteenTen.items?.some((menuItem) =>
        ["bottled-water", "coffee-tea-and-hot-beverages", "grilled-salad-additions-gf", "hemp-agave"].includes(
          menuItem.id,
        ),
      ) ||
      new Set((thirteenTen.items ?? []).map((menuItem) => menuItem.category)).size <= 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/replacement-1310-kitchen-and-bar-washington-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "replacement-1310-kitchen-and-bar-washington-dc",
      verifiedSnapshot,
      "Verified repair: replaced the collapsed 87-row PDF/ordering scrape with the current multi-menu catalog, removed headings, duplicates, stale ordering items, and OCR fragments, and preserved only directly supported ingredient signals.",
    );
  }

  const seventeenEightyNine = restaurant("restaurant-1789-dc");
  if (
    seventeenEightyNine &&
    (
      (seventeenEightyNine.items?.length ?? 0) !== 31 ||
      seventeenEightyNine.items?.some((menuItem) =>
        ["lobster-fettucini-nero", "half-bottles-375ml", "loose-leaf-tea", "moo-and-blue"].includes(
          menuItem.id,
        ),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/restaurant-1789-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "restaurant-1789-dc",
      verifiedSnapshot,
      "Verified repair: replaced the mixed current/stale 1789 output with the current official dinner, dessert, and active special-event food catalog; removed section headings, a nested cheese option, a duplicate PDF spelling, and expired event items; and retained only directly supported allergen signals.",
    );
  }

  const seventeenNinetyNinePrime = restaurant("osm-1799-prime-204629784");
  if (
    seventeenNinetyNinePrime &&
    seventeenNinetyNinePrime.items?.some((menuItem) =>
      [
        "promotions-and-events",
        "dress-code",
        "added-to-force-private-dining-to-the-right-of-the-logo",
        "crab-cake-23-chilled-lump-crab-15-seared-scallops",
      ].includes(menuItem.id),
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-1799-prime-204629784/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-1799-prime-204629784",
      verifiedSnapshot,
      "Verified repair: replaced the stale 53-row 1799 Prime extraction with the current July 2026 food and nonalcoholic beverage catalog; removed navigation, dress-code text, modifier composites, old dishes, and collapsed side rows; and preserved the menu's explicit gluten cross-contact warning for GF items.",
    );
  }

  const seventeenNinetyNinePrimeBroader = restaurant(
    "1799-prime-steak-and-seafood-alexandria-va-dc-metro",
  );
  if (
    seventeenNinetyNinePrimeBroader &&
    (
      (seventeenNinetyNinePrimeBroader.items?.length ?? 0) !== 98 ||
      seventeenNinetyNinePrimeBroader.items?.some((menuItem) =>
        [
          "promotions-and-events",
          "dress-code",
          "added-to-force-private-dining-to-the-right-of-the-logo",
          "crab-cake-23-chilled-lump-crab-15-seared-scallops",
        ].includes(menuItem.id),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/1799-prime-steak-and-seafood-alexandria-va-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "1799-prime-steak-and-seafood-alexandria-va-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the stale 53-row broader 1799 Prime record with the current July 2026 food, nonalcoholic beverage, and June 2026 cocktail catalog; removed navigation, dress-code text, modifier composites, old dishes, and collapsed side rows; and preserved explicit GF gluten cross-contact semantics.",
    );
  }

  const twoAmys = restaurant("2-amys-washington-dc-dc-metro");
  if (
    twoAmys &&
    (
      (twoAmys.items?.length ?? 0) !== 64 ||
      new Set((twoAmys.items ?? []).map((menuItem) => menuItem.category)).size <= 1 ||
      twoAmys.items?.some((menuItem) =>
        ["38oz-ribeye", "your-custom-text-here", "albino-rocco-ovello-barbaresco"].includes(
          menuItem.id,
        ),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/2-amys-washington-dc-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "2-amys-washington-dc-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the stale page-one-only 2 Amys catalog with the current restaurant-linked Square storefront categories across all six product pages; removed old unassigned products and homepage merchandise/template artifacts, restored current food and beverage items, and retained only explicit item-text allergen signals.",
    );
  }

  const twentyNineFortyOne = restaurant("2941-restaurant-falls-church-va-dc-metro");
  if (
    twentyNineFortyOne &&
    (
      (twentyNineFortyOne.items?.length ?? 0) !== 51 ||
      (twentyNineFortyOne.items ?? []).every(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ) ||
      twentyNineFortyOne.items?.some((menuItem) =>
        ["appalachian-meadow-creek-virginia", "kaviari-ossetra-caviar"].includes(menuItem.id),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/2941-restaurant-falls-church-va-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "2941-restaurant-falls-church-va-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the stale, allergen-empty 2941 seasonal snapshot with the current official July à-la-carte, prix-fixe, tasting, cocktail, and zero-proof menus; removed the stale cheese, reconciled renamed items, restored missing current rows, and retained only directly supported item-text allergen signals.",
    );
  }

  const verifiedTwoFifty = restaurant("two-fifty-bbq-dc");
  if (
    verifiedTwoFifty &&
    (
      (verifiedTwoFifty.items ?? []).length !== 74 ||
      new Set((verifiedTwoFifty.items ?? []).map((menuItem) => menuItem.category)).size <= 1 ||
      verifiedTwoFifty.items?.find((menuItem) => menuItem.id === "beef-rub")?.allergens?.includes("wheat") ||
      verifiedTwoFifty.items?.find((menuItem) => menuItem.id === "rice-and-beans")?.allergens?.includes("tree-nut")
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/two-fifty-bbq-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "two-fifty-bbq-dc",
      verifiedSnapshot,
      "Verified repair: replaced the stale single-category 2Fifty DC catalog with the current restaurant-linked Toast menu and restaurant-issued allergy guide; removed merchandise and stale items, restored current food and beverage sections, removed the broad wheat/gluten smear, kept gluten distinct from wheat, and stopped treating coconut as tree nut.",
    );
  }

  const verifiedNinetySecondPizza = restaurant("ninety-second-pizza-georgetown-dc");
  if (
    verifiedNinetySecondPizza &&
    (
      (verifiedNinetySecondPizza.items ?? []).length !== 35 ||
      new Set((verifiedNinetySecondPizza.items ?? []).map((menuItem) => menuItem.category)).size <= 1 ||
      !(verifiedNinetySecondPizza.items ?? []).some((menuItem) =>
        menuItem.id === "boscaiola-vegan" && menuItem.mayContain?.includes("gluten")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/ninety-second-pizza-georgetown-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "ninety-second-pizza-georgetown-dc",
      verifiedSnapshot,
      "Verified repair: replaced the incomplete single-category Georgetown catalog with the current 35-item restaurant-linked Toast menu, added current vegan, dessert, and beverage rows, restored real sections, and represented the restaurant-issued FAQ's gluten and supplier nut cautions as cross-contact rather than fixed invented ingredients.",
    );
  }

  const verified9292 = restaurant("replacement-9292-korean-bbq-annandale-va");
  if (
    verified9292 &&
    (
      (verified9292.items ?? []).length !== 100 ||
      (verified9292.items ?? []).some((menuItem) =>
        ["own-this-place", "chicken", "seafood"].includes(menuItem.id) ||
        /\bPer person US$/i.test(menuItem.name)
      ) ||
      (verified9292.items ?? []).some((menuItem) => menuItem.allergenSourceType !== "unavailable")
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/replacement-9292-korean-bbq-annandale-va/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "replacement-9292-korean-bbq-annandale-va",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted third-party listing scrape with the photographed Annandale menu boards; removed navigation, section-heading, duplicate-US-suffix, and unlimited-package-component artifacts, restored the actual menu sections, and removed falsely official allergen coverage because no restaurant-issued allergen disclosure was found.",
    );
  }

  const verifiedAModoMio = restaurant("osm-a-modo-mio-207944730");
  if (
    verifiedAModoMio &&
    (
      (verifiedAModoMio.items ?? []).length !== 185 ||
      (verifiedAModoMio.items ?? []).some((menuItem) =>
        [
          "Call us at (703)-532-0990 or book a table through Resy:",
          "Yelp",
          "Pizze Bianche (no tomato sauce)",
          "Pizze Rosse (tomato sauce)",
          "Salad and Soup",
          "Braised Beef Ravioli - for 1",
          "Butternut ravioli",
          "Pizza Maradona",
        ].includes(menuItem.name)
      ) ||
      !(verifiedAModoMio.items ?? []).some((menuItem) =>
        menuItem.name === "Ischitana" &&
        menuItem.allergens?.includes("fish") &&
        menuItem.allergens?.includes("wheat") &&
        !menuItem.allergens?.includes("milk")
      ) ||
      !(verifiedAModoMio.items ?? []).some((menuItem) =>
        menuItem.name === "Caprese Cake" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens[0] === "tree-nut"
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-a-modo-mio-207944730/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-a-modo-mio-207944730",
      verifiedSnapshot,
      "Verified repair: replaced the duplicated and incomplete mixed-site extraction with the current restaurant-issued lunch, dinner, dessert, and catering menus plus distinct available products from the restaurant-linked Toast catalog; removed navigation/category artifacts and unavailable Toast-only specials, retained real online size and portion variants, placed beverages last, and limited official allergen signals to positive published ingredient evidence while respecting explicit GF/DF labels.",
    );
  }

  const verifiedALitteri = restaurant("a-litteri-dc");
  if (
    verifiedALitteri &&
    (
      (verifiedALitteri.items ?? []).length !== 42 ||
      new Set((verifiedALitteri.items ?? []).map((menuItem) => menuItem.category)).size !== 6 ||
      (verifiedALitteri.items ?? []).some((menuItem) =>
        ["Cheese (limit 2)", "Meats (limit 2)", "Condiments", "7\" Personal Pizza"].includes(menuItem.name)
      ) ||
      !(verifiedALitteri.items ?? []).some((menuItem) =>
        menuItem.name === "TUNA SALAD" &&
        menuItem.category === "Cold Sandwiches" &&
        ["fish", "gluten", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedALitteri.items ?? []).some((menuItem) =>
        menuItem.name === "Cookie Platter" && menuItem.allergenSourceType === "unavailable"
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/a-litteri-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "a-litteri-dc",
      verifiedSnapshot,
      "Verified repair: replaced the stale flattened SinglePlatform extraction with the 21 current products from the ordering menu linked by A. Litteri and the 21 products on its current official catering images; restored real menu categories, removed modifier-group artifacts and stale products, and limited allergen signals to fixed ingredients or formats directly supported by restaurant-published text.",
    );
  }

  const verifiedAandJ = restaurant("osm-aandj-9382941658");
  if (
    verifiedAandJ &&
    (
      (verifiedAandJ.items ?? []).length !== 79 ||
      new Set((verifiedAandJ.items ?? []).map((menuItem) => menuItem.category)).size !== 9 ||
      (verifiedAandJ.items ?? []).some((menuItem) =>
        [
          "Buns, Dumplings and Breads",
          "Noodles",
          "Rice",
          "Washington Post…best dim-sum dumplings in Washington",
        ].includes(menuItem.name)
      ) ||
      !(verifiedAandJ.items ?? []).some((menuItem) =>
        menuItem.name === "擔擔麵 Dan Dan Mian" &&
        ["gluten", "peanut", "sesame", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAandJ.items ?? []).some((menuItem) =>
        menuItem.name === "珍珠飲料 Bubble Tea" &&
        menuItem.isConfigurable &&
        menuItem.allergenSourceType === "unavailable"
      ) ||
      (verifiedAandJ.items ?? []).some((menuItem, index, items) =>
        menuItem.category === "DRINKS" && items.slice(index).some((item) => item.category !== "DRINKS")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-aandj-9382941658/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-aandj-9382941658",
      verifiedSnapshot,
      "Verified repair: replaced the duplicated 217-row mixed-source extraction with 67 current restaurant-issued menu products plus 12 distinct current restaurant-linked Toast additions; restored all official descriptions and Chinese-titled drinks, removed GrubHub price-copy duplicates, category/press artifacts, out-of-stock ordering rows, and redundant Bubble Tea flavor SKUs, kept beverages last, and limited allergen fields to fixed published signals.",
    );
  }

  const verifiedAandJRockville = restaurant("osm-aandj-s-northern-chinese-dim-sum-633639009");
  if (
    verifiedAandJRockville &&
    (
      (verifiedAandJRockville.items ?? []).length !== 78 ||
      new Set((verifiedAandJRockville.items ?? []).map((menuItem) => menuItem.category)).size !== 9 ||
      (verifiedAandJRockville.items ?? []).some((menuItem) =>
        menuItem.name === "Washington Post…best dim-sum dumplings in Washington"
      ) ||
      !(verifiedAandJRockville.items ?? []).some((menuItem) =>
        menuItem.name === "擔擔麵 Dan Dan Mian" &&
        ["gluten", "peanut", "sesame", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAandJRockville.items ?? []).some((menuItem) =>
        menuItem.name === "珍珠飲料 Bubble Tea" &&
        menuItem.isConfigurable &&
        menuItem.allergenSourceType === "unavailable"
      ) ||
      (verifiedAandJRockville.items ?? []).some((menuItem) => menuItem.name === "可樂 Diet Coke") ||
      (verifiedAandJRockville.items ?? []).some((menuItem, index, items) =>
        menuItem.category === "DRINKS" && items.slice(index).some((item) => item.category !== "DRINKS")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-aandj-s-northern-chinese-dim-sum-633639009/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-aandj-s-northern-chinese-dim-sum-633639009",
      verifiedSnapshot,
      "Verified repair: replaced the incomplete, allergen-empty Rockville extraction with 67 current restaurant-issued menu products plus 11 distinct current Rockville Toast additions; removed the press artifact, duplicate ordering placement, out-of-stock products, and redundant Bubble Tea flavor SKUs; restored full descriptions and Chinese-titled drinks; kept beverages last; and limited allergen fields to fixed published signals.",
    );
  }

  const verifiedAcquaBistecca = restaurant("acqua-bistecca-washington-dc-dc-metro");
  if (
    verifiedAcquaBistecca &&
    (
      (verifiedAcquaBistecca.items ?? []).length !== 76 ||
      new Set((verifiedAcquaBistecca.items ?? []).map((menuItem) => menuItem.category)).size !== 18 ||
      (verifiedAcquaBistecca.items ?? []).some((menuItem) => menuItem.name === "Green Salad") ||
      !(verifiedAcquaBistecca.items ?? []).some((menuItem) =>
        menuItem.name === "Sweet Corn Agnolotti" &&
        ["gluten", "shellfish", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAcquaBistecca.items ?? []).some((menuItem) =>
        menuItem.name === "House-Made Focaccia" &&
        menuItem.isConfigurable &&
        menuItem.allergens?.length === 2 &&
        menuItem.allergens.includes("gluten") &&
        menuItem.allergens.includes("wheat")
      ) ||
      !(verifiedAcquaBistecca.items ?? []).some((menuItem) =>
        menuItem.name === "High-Performance Living™" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens[0] === "tree-nut"
      ) ||
      (verifiedAcquaBistecca.items ?? []).some((menuItem) =>
        /(?:Milano Mulo|Cabernet Sauvignon|Negroni 22)/i.test(menuItem.name)
      ) ||
      (verifiedAcquaBistecca.items ?? []).some((menuItem, index, items) =>
        menuItem.category.startsWith("Beverages ·") &&
        items.slice(index).some((item) => !item.category.startsWith("Beverages ·"))
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/acqua-bistecca-washington-dc-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "acqua-bistecca-washington-dc-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the stale 25-row pickup snapshot with the current Washington dinner, brunch-only, happy-hour-only food, dessert, and nonalcoholic beverage catalog; removed Green Salad and modifier-only steak accompaniments, restored current seasonal products and real sections, consolidated duplicate meal presentations, kept beverages last, excluded alcohol-only lists, and limited allergen fields to fixed published ingredients or mandatory formats.",
    );
  }

  const verifiedAdasRiver = restaurant("ada-s-on-the-river-alexandria-va-dc-metro");
  if (
    verifiedAdasRiver &&
    (
      (verifiedAdasRiver.items ?? []).length !== 99 ||
      new Set((verifiedAdasRiver.items ?? []).map((menuItem) => menuItem.category)).size !== 18 ||
      (verifiedAdasRiver.items ?? []).some((menuItem) =>
        menuItem.name === "House Steak Sauce" || /^Kids /i.test(menuItem.name)
      ) ||
      !(verifiedAdasRiver.items ?? []).some((menuItem) =>
        menuItem.name === "Coal-Roasted Asparagus" &&
        menuItem.allergens?.length === 2 &&
        menuItem.allergens.includes("egg") &&
        menuItem.allergens.includes("milk")
      ) ||
      !(verifiedAdasRiver.items ?? []).some((menuItem) =>
        menuItem.name === "Peanut Butter S'mores Cake" &&
        ["gluten", "milk", "peanut", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("egg")
      ) ||
      !(verifiedAdasRiver.items ?? []).some((menuItem) =>
        menuItem.name === "Thick Cut Bacon" && menuItem.allergenSourceType === "unavailable"
      ) ||
      (verifiedAdasRiver.items ?? []).some((menuItem, index, items) =>
        menuItem.category.startsWith("Beverages ·") &&
        items.slice(index).some((item) => !item.category.startsWith("Beverages ·"))
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/ada-s-on-the-river-alexandria-va-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "ada-s-on-the-river-alexandria-va-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the stale flattened 49-row pickup subset with 99 distinct current products from Ada's restaurant-issued structured dinner, seafood-bar, lunch, brunch, dessert, social-hour, and nonalcoholic beverage menus; restored 18 real categories; consolidated duplicate meal presentations; removed three stale kids products and the optional House Steak Sauce modifier; kept beverages last; and limited allergen fields to fixed positive published signals without treating V or G legends as positive allergen claims.",
    );
  }

  const verifiedAdyar = restaurant("osm-adyar-ananda-bhavan-638589103");
  if (
    verifiedAdyar &&
    (
      (verifiedAdyar.items ?? []).length !== 158 ||
      new Set((verifiedAdyar.items ?? []).map((menuItem) => menuItem.category)).size !== 18 ||
      (verifiedAdyar.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 75 ||
      (verifiedAdyar.items ?? []).some((menuItem) =>
        menuItem.name === "BADHUSHA" ||
        menuItem.name === "ACCOMPANIMENTS" ||
        menuItem.name === "Big fluffy deep fried Indian bread served with Punjabi style spicy chick peas masala"
      ) ||
      !(verifiedAdyar.items ?? []).some((menuItem) =>
        menuItem.name === "ADHIRASAM" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens.includes("milk") &&
        ["gluten", "peanut", "soy", "tree-nut", "wheat"].every(
          (allergen) => menuItem.mayContain?.includes(allergen),
        )
      ) ||
      !(verifiedAdyar.items ?? []).some((menuItem) =>
        menuItem.name === "SEEDAI" &&
        menuItem.allergens?.includes("milk") &&
        menuItem.allergens?.includes("sesame") &&
        !menuItem.allergens?.includes("tree-nut")
      ) ||
      !(verifiedAdyar.items ?? []).some((menuItem) =>
        menuItem.name === "ALOO BONDA (Dinner Only)" &&
        menuItem.allergenSourceType === "unavailable"
      ) ||
      !(verifiedAdyar.items ?? []).some((menuItem) =>
        menuItem.name === "PANEER VEG MOMO (8 PIECES)" &&
        menuItem.allergenSourceType === "unavailable"
      ) ||
      !(verifiedAdyar.items ?? []).some((menuItem) =>
        menuItem.name === "CREAM OF TOMATO SOUP" &&
        ["gluten", "milk", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      (verifiedAdyar.items ?? []).some((menuItem, index, items) =>
        menuItem.category === "BEVERAGES" &&
        items.slice(index).some((item) => item.category !== "BEVERAGES")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-adyar-ananda-bhavan-638589103/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-adyar-ananda-bhavan-638589103",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted 167-row generic website merge with 158 distinct current Herndon products from Adyar Ananda Bhavan's restaurant-issued menu and restaurant-linked Toast catalog; restored 18 real categories; removed 23 category/description artifacts and stale Badhusha; consolidated duplicate and configurable presentations; kept beverages last; separated seven package contains statements from facility-handling cautions; and limited fixed allergen fields to published ingredient evidence without treating coconut as tree nut, besan/rice/lentil/corn flour as wheat, or eggplant as egg.",
    );
  }

  const verifiedAfghanBistro = restaurant("afghan-bistro-springfield-va-dc-metro");
  if (
    verifiedAfghanBistro &&
    (
      (verifiedAfghanBistro.items ?? []).length !== 117 ||
      new Set((verifiedAfghanBistro.items ?? []).map((menuItem) => menuItem.category)).size !== 11 ||
      (verifiedAfghanBistro.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 71 ||
      (verifiedAfghanBistro.items ?? []).some((menuItem) =>
        ["Items", "Menu 1", "Mediterranean"].includes(menuItem.category) ||
        ["CHOPS AND KABOBS", "SOUPS & SALADS"].includes(menuItem.name)
      ) ||
      !["Nakhoud & Mushroom Sabzi Lawaan", "Firni", "Raw Shoulder Chops-1lb"].every(
        (name) => (verifiedAfghanBistro.items ?? []).some((menuItem) => menuItem.name === name),
      ) ||
      !(verifiedAfghanBistro.items ?? []).some((menuItem) =>
        menuItem.name === "Bistro Salad" &&
        ["gluten", "milk", "tree-nut", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        ) &&
        !menuItem.allergens?.includes("fish")
      ) ||
      !(verifiedAfghanBistro.items ?? []).some((menuItem) =>
        menuItem.name === "Avocado, Cilantro, and Yogurt Chutney [16oz]" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens.includes("milk")
      ) ||
      !(verifiedAfghanBistro.items ?? []).some((menuItem) =>
        menuItem.name === "Cake" &&
        ["egg", "gluten", "milk", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        ) &&
        !menuItem.allergens?.includes("tree-nut")
      ) ||
      !(verifiedAfghanBistro.items ?? []).some((menuItem) =>
        menuItem.name === "Raw Salmon-1lb" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens.includes("fish")
      ) ||
      (verifiedAfghanBistro.items ?? []).at(-1)?.category !== "RAW MARINATED MEATS"
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/afghan-bistro-springfield-va-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "afghan-bistro-springfield-va-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the flattened 116-row generic/API merge with 117 distinct current products consolidated from 202 restaurant-issued lunch, dinner, chutney, and raw-marinated-meat presentations; restored 11 real categories; removed two section-heading artifacts; added three current omitted products; kept exact named menu identities while consolidating repeated meal-period presentations; excluded optional salad proteins and vegan substitutions from fixed allergen fields; and restored 26 missing published or mandatory-format allergen signals without contradicting item-specific gluten-free labels.",
    );
  }

  const verifiedAfghanKabob = restaurant("osm-afghan-kabob-3359956639");
  if (
    verifiedAfghanKabob &&
    (
      (verifiedAfghanKabob.items ?? []).length !== 58 ||
      new Set((verifiedAfghanKabob.items ?? []).map((menuItem) => menuItem.category)).size !== 9 ||
      (verifiedAfghanKabob.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 24 ||
      (verifiedAfghanKabob.items ?? []).some((menuItem) =>
        menuItem.name === "Our office" ||
        menuItem.name === "Fried eggplant served with yogurt and Afghan tandoori bread" ||
        /^C0dd6eca /i.test(menuItem.category) ||
        ["afghan"].includes(menuItem.category)
      ) ||
      !(verifiedAfghanKabob.items ?? []).some((menuItem) =>
        menuItem.name === "AUSHAK (6 PIECES)" &&
        ["gluten", "milk", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("egg")
      ) ||
      !(verifiedAfghanKabob.items ?? []).some((menuItem) =>
        menuItem.name === "BORANI BANJAN" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens.includes("milk")
      ) ||
      !(verifiedAfghanKabob.items ?? []).some((menuItem) =>
        menuItem.name === "HUMMUS" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens.includes("sesame")
      ) ||
      !(verifiedAfghanKabob.items ?? []).some((menuItem) =>
        menuItem.name === "FLAME KABOB" &&
        menuItem.allergenSourceType === "unavailable"
      ) ||
      !(verifiedAfghanKabob.items ?? []).some((menuItem) =>
        menuItem.name === "TILAPIA FISH KABOB" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens.includes("fish")
      ) ||
      (verifiedAfghanKabob.items ?? []).some((menuItem, index, items) =>
        menuItem.category === "BEVERAGES" &&
        items.slice(index).some((item) => item.category !== "BEVERAGES")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-afghan-kabob-3359956639/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-afghan-kabob-3359956639",
      verifiedSnapshot,
      "Verified repair: replaced the corrupt 12-row website/card extraction with all 58 current products from the restaurant-linked RepasO catalog identity-verified to Afghan Kabob Restaurant at the same Springfield address; restored nine real categories; removed four catering/shifted-description artifacts; restored the omitted menu; kept beverages last; corrected four frozen allergen rows; excluded optional bread-or-rice choices; and limited fixed signals to linked description evidence or mandatory named formats without treating Afghan ravioli as proof of egg.",
    );
  }

  const verifiedAfghania = restaurant("replacement-afghania-washington-dc");
  if (
    verifiedAfghania &&
    (
      (verifiedAfghania.items ?? []).length !== 103 ||
      new Set((verifiedAfghania.items ?? []).map((menuItem) => menuItem.category)).size !== 12 ||
      new Set((verifiedAfghania.items ?? []).map((menuItem) => menuItem.id)).size !== 103 ||
      (verifiedAfghania.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 44 ||
      (verifiedAfghania.items ?? []).some((menuItem) =>
        menuItem.name === "Bistro Burger" ||
        menuItem.name === "Bistro Signature Kabob" ||
        menuItem.name === "Cake" ||
        menuItem.category === "Vegetarian Entrees"
      ) ||
      (verifiedAfghania.items ?? []).filter(
        (menuItem) => menuItem.category === "RAW MARINATED MEATS",
      ).length !== 9 ||
      (verifiedAfghania.items ?? []).some((menuItem, index, items) =>
        menuItem.category === "RAW MARINATED MEATS" &&
        items.slice(index).some((item) => item.category !== "RAW MARINATED MEATS")
      ) ||
      !(verifiedAfghania.items ?? []).some((menuItem) =>
        menuItem.name === "AFGHANIA SALAD" &&
        ["gluten", "tree-nut", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedAfghania.items ?? []).some((menuItem) =>
        menuItem.category === "DUMPLINGS" &&
        menuItem.name === "PUMPKIN DUMPLINGS" &&
        !menuItem.allergens?.includes("milk") &&
        ["gluten", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAfghania.items ?? []).some((menuItem) =>
        menuItem.category === "VEGETARIAN & VEGAN" &&
        menuItem.name === "PUMPKIN DUMPLINGS" &&
        ["gluten", "milk", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedAfghania.items ?? []).some((menuItem) =>
        menuItem.name === "Dinner for Two with Wine" &&
        ["gluten", "milk", "tree-nut", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      (verifiedAfghania.items ?? []).some((menuItem) =>
        menuItem.allergens?.includes("egg") || menuItem.allergens?.includes("mustard")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/replacement-afghania-washington-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "replacement-afghania-washington-dc",
      verifiedSnapshot,
      "Verified repair: replaced the contaminated 152-row flattened API merge with 103 current section-level Afghania presentations across 12 restaurant-issued dinner and raw-marinated-meat sections; removed 73 Afghan Bistro sister-location rows and six stale Afghania products; restored nine omitted raw meats; preserved separately formulated regular and vegan presentations; and corrected 24 frozen allergen results using only fixed published ingredients and mandatory named formats without interpreting non-dairy yogurt as milk, mustard greens as mustard, or eggplant as egg.",
    );
  }

  const verifiedAgora = restaurant("agora-dc");
  if (
    verifiedAgora &&
    (
      (verifiedAgora.items ?? []).length !== 83 ||
      new Set((verifiedAgora.items ?? []).map((menuItem) => menuItem.category)).size !== 18 ||
      (verifiedAgora.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 68 ||
      (verifiedAgora.items ?? []).some((menuItem) => ["For the table", "G F", "HOT MEZZES", "COLD MEZZES", "Pideler"].includes(menuItem.name)) ||
      !(verifiedAgora.items ?? []).some((menuItem) => menuItem.name === "AGORA FRIES" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("mustard")) ||
      !(verifiedAgora.items ?? []).some((menuItem) => menuItem.name === "FALAFEL" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("sesame")) ||
      !(verifiedAgora.items ?? []).some((menuItem) => menuItem.name === "BRANZINO" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("fish")) ||
      !(verifiedAgora.items ?? []).some((menuItem) => menuItem.name === "VEGGIE SAUTE" && menuItem.allergenSourceType === "unavailable") ||
      (verifiedAgora.items ?? []).filter((menuItem) => menuItem.name === "MIXED GREEN SALAD").length !== 2 ||
      (verifiedAgora.items ?? []).filter((menuItem) => menuItem.name === "ŞİŞ TAVUK").length !== 2
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/agora-dc/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "agora-dc",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted 63-row column-interleaved PDF extraction with 83 current visually verified products/formulations across the official DC dinner, lunch, and brunch menus; removed ten headings and shifted description/add-on artifacts plus five stale products; restored omitted current products and 18 real meal-period sections; preserved same-name meal-period formulations when ingredients differ; and corrected 21 frozen allergen results without treating oyster mushrooms as shellfish, eggplant as egg, or general raw-food warnings as item allergens.",
    );
  }

  const verifiedAgoraTysons = restaurant("agora-tysons-va");
  if (
    verifiedAgoraTysons &&
    (
      (verifiedAgoraTysons.items ?? []).length !== 83 ||
      new Set((verifiedAgoraTysons.items ?? []).map((menuItem) => menuItem.category)).size !== 18 ||
      (verifiedAgoraTysons.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 68 ||
      (verifiedAgoraTysons.items ?? []).some((menuItem) => ["COLD MEZZES", "HOT MEZZES", "Goat Cheese, Mozzarella, Diced Tomatoes", "SISTAVUK|GF|NF Chicken Thighs, Yogurt Sauce"].includes(menuItem.name)) ||
      !(verifiedAgoraTysons.items ?? []).some((menuItem) => menuItem.name === "AGORA FRIES" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("mustard")) ||
      !(verifiedAgoraTysons.items ?? []).some((menuItem) => menuItem.name === "VEGGIE SAUTE" && menuItem.allergenSourceType === "unavailable") ||
      !(verifiedAgoraTysons.items ?? []).some((menuItem) => menuItem.category === "Brunch — Eggs & Proteins" && menuItem.name === "LAMB SHOULDER" && menuItem.allergens?.includes("wheat")) ||
      !(verifiedAgoraTysons.items ?? []).some((menuItem) => menuItem.category === "Brunch — Eggs & Proteins" && menuItem.name === "SIS TAVUK" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("milk"))
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/agora-tysons-va/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "agora-tysons-va",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted 54-row column-interleaved PDF extraction with 83 current visually verified Agora Tysons products/formulations across 18 dinner, lunch, and brunch sections; removed seven heading and shifted-description artifacts; restored omitted current products; preserved the location-specific Lamb Shoulder and Sis Tavuk brunch identities; and corrected 18 frozen allergen results without treating oyster mushrooms as shellfish, eggplant as egg, or the general raw-food warning as item evidence.",
    );
  }

  const verifiedAgua301 = restaurant("agua-301-restaurant-washington-dc-dc-metro");
  if (
    verifiedAgua301 &&
    (
      (verifiedAgua301.items ?? []).length !== 301 ||
      new Set((verifiedAgua301.items ?? []).map((menuItem) => menuItem.category)).size !== 51 ||
      (verifiedAgua301.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 197 ||
      (verifiedAgua301.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 104 ||
      (verifiedAgua301.items ?? []).some((menuItem) => [
        "2 Dozen minimum per item required",
        "Inquiry send inquiry to restaurant",
        "NO CHANGES OR SUBSTITUTIONS. ENTREE PURCHASE NECESSARY",
        "Platos Principales",
        "Taco Platter",
        "Tecate Can",
      ].includes(menuItem.name)) ||
      !(verifiedAgua301.items ?? []).some((menuItem) => menuItem.name === "Family Taco Meal (pick up & delivery only)" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("milk")) ||
      !(verifiedAgua301.items ?? []).some((menuItem) => menuItem.name === "Fajitas for 2 (pick up or delivery only)" && ["milk", "wheat", "gluten", "shellfish"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAgua301.items ?? []).some((menuItem) => menuItem.category === "Lunch — Entree Salads" && menuItem.name === "Grilled Caesar Salad" && ["milk", "wheat", "gluten", "fish"].every((allergen) => menuItem.allergens?.includes(allergen)) && !menuItem.allergens?.includes("shellfish")) ||
      !(verifiedAgua301.items ?? []).some((menuItem) => menuItem.category === "Lunch — Entree Salads" && menuItem.name === "Chilango Salad" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("milk")) ||
      !(verifiedAgua301.items ?? []).some((menuItem) => menuItem.category === "Lunch — Empanadas" && menuItem.name === "Empanada de Calabaza" && menuItem.allergenSourceType === "unavailable") ||
      !(verifiedAgua301.items ?? []).some((menuItem) => menuItem.category === "Receptions Menu — Display Dips, Platters, Bocaditos" && menuItem.name === "Coconut Shrimp" && menuItem.allergens?.includes("shellfish") && !menuItem.allergens?.includes("tree-nut")) ||
      !["Agua Fresca", "Jarritos Soft Drinks", "Mexican Coca Cola"].every((name, index) => verifiedAgua301.items?.at(index - 3)?.name === name)
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/agua-301-restaurant-washington-dc-dc-metro/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "agua-301-restaurant-washington-dc-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the contaminated 195-row flattened multi-surface merge with 301 current formulations across 51 restaurant-issued food, catering, banquet, breakfast, and non-alcoholic beverage sections; removed ten headings, instructions, package labels, and alcohol plus three stale products; preserved distinct same-name formulations when fixed ingredients differ; and corrected 45 frozen allergen results using only mandatory published ingredients without promoting optional proteins, optional flour requests, eggplant, or coconut into allergen signals.",
    );
  }

  const verifiedAhso = restaurant("replacement-ahso-restaurant-brambleton-va");
  if (
    verifiedAhso &&
    (
      (verifiedAhso.items ?? []).length !== 42 ||
      new Set((verifiedAhso.items ?? []).map((menuItem) => menuItem.category)).size !== 11 ||
      (verifiedAhso.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 35 ||
      (verifiedAhso.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 7 ||
      (verifiedAhso.items ?? []).some((menuItem) => (menuItem.sourceUrls ?? []).some((url) => /ahso-cellars|brambleton-plz-105/i.test(url))) ||
      (verifiedAhso.items ?? []).some((menuItem) => ["Bread Board", "Fruit, Yogurt, & Granola", "Brunch Toast", "Steak Frites"].includes(menuItem.name)) ||
      (verifiedAhso.items ?? []).filter((menuItem) => menuItem.name === "Crispy Pork Ribs").length !== 2 ||
      !(verifiedAhso.items ?? []).some((menuItem) => menuItem.name === "Mediterranean Tomato & Red Pepper Dip" && ["milk", "tree-nut", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAhso.items ?? []).some((menuItem) => menuItem.name === "Yellow Fin Tuna Tartare" && menuItem.allergens?.includes("fish") && menuItem.allergens?.includes("egg")) ||
      !(verifiedAhso.items ?? []).some((menuItem) => menuItem.name === "The O.G. Ramen" && ["egg", "soy", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAhso.items ?? []).some((menuItem) => menuItem.name === "Burger - Click to choose add ons!" && menuItem.isConfigurable) ||
      (verifiedAhso.items ?? []).some((menuItem) => /^Add (?:Shrimp|Braised Short Rib)/i.test(menuItem.name))
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/replacement-ahso-restaurant-brambleton-va/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "replacement-ahso-restaurant-brambleton-va",
      verifiedSnapshot,
      "Verified repair: removed all 22 Ahso Cellars sister-business rows that were incorrectly assigned to Ahso Restaurant and rebuilt 42 current Ahso Restaurant formulations across 11 restaurant-issued dinner, directly linked ordering, and recurring scheduled-food sections; preserved differing dine-in and direct-order formulations; excluded standalone add-ons, alcohol, and variable weekly specials; and assigned only 35 fixed published allergen signals while leaving seven rows unavailable rather than promoting Ahso's general dietary-accommodation statement to item evidence.",
    );
  }

  const verifiedAirRestaurant = restaurant("air-restaurant-washington-dc-dc-metro");
  if (
    verifiedAirRestaurant &&
    (
      (verifiedAirRestaurant.items ?? []).length !== 40 ||
      new Set((verifiedAirRestaurant.items ?? []).map((menuItem) => menuItem.category)).size !== 11 ||
      (verifiedAirRestaurant.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 18 ||
      (verifiedAirRestaurant.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 22 ||
      (verifiedAirRestaurant.items ?? []).some((menuItem) => ["A Low Country Classic", "Angus burger (8oz) served with fries", "Choice of Jerk or Fried", "Honey Mustard", "Mimosa Carafe", "Served w/ Mashed Potato & Todays Vegetable"].includes(menuItem.name)) ||
      !(verifiedAirRestaurant.items ?? []).some((menuItem) => menuItem.name === "Crab Cake" && menuItem.allergens?.includes("milk") && menuItem.allergens?.includes("shellfish")) ||
      !(verifiedAirRestaurant.items ?? []).some((menuItem) => menuItem.name === "Bowtie Pasta" && ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) && !menuItem.allergens?.includes("fish") && !menuItem.allergens?.includes("shellfish")) ||
      !(verifiedAirRestaurant.items ?? []).some((menuItem) => menuItem.name === "Blackened Salmon" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("fish")) ||
      !(verifiedAirRestaurant.items ?? []).some((menuItem) => menuItem.name === "Chopped Salad" && ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      (verifiedAirRestaurant.items ?? []).filter((menuItem) => menuItem.name === "AIR Angus Burger").length !== 2 ||
      (verifiedAirRestaurant.items ?? []).filter((menuItem) => menuItem.name === "Fried Shrimp").length !== 2
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/air-restaurant-washington-dc-dc-metro/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "air-restaurant-washington-dc-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted 30-row sequential page extraction with 40 current food formulations and 45 presentations across 11 restaurant-issued happy-hour, prefix, dinner, late-night, and party-platter categories; removed five promoted descriptions or sauces, alcohol, and one stale product; preserved same-name formulations when current descriptions differ; and corrected ten frozen allergen results without promoting optional Bowtie Pasta add-ons or the page-wide raw-food warning to item evidence.",
    );
  }

  const verifiedAkeno = restaurant("osm-akeno-sushi-thai-11475736769");
  if (
    verifiedAkeno &&
    (
      (verifiedAkeno.items ?? []).length !== 234 ||
      new Set((verifiedAkeno.items ?? []).map((menuItem) => menuItem.category)).size !== 28 ||
      (verifiedAkeno.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 164 ||
      (verifiedAkeno.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 70 ||
      (verifiedAkeno.items ?? []).some((menuItem) => ["Salmon Onigiri", "Extra Mushroom", "Ramune Strawberry", "Rice Outside", "Sweet Chili", "Ponzu", "Sweet & Sour"].includes(menuItem.name)) ||
      (verifiedAkeno.items ?? []).filter((menuItem) => menuItem.category === "Sauce").length !== 11 ||
      (verifiedAkeno.items ?? []).filter((menuItem) => menuItem.category === "Hosomaki (Seaweed Outside)").length !== 11 ||
      (verifiedAkeno.items ?? []).filter((menuItem) => menuItem.category === "Non-Alcoholic").length !== 14 ||
      (verifiedAkeno.items ?? []).filter((menuItem) => menuItem.name === "Lemonade").length !== 1 ||
      !(verifiedAkeno.items ?? []).some((menuItem) => menuItem.name === "Ika Karaage" && menuItem.allergens?.length === 2 && menuItem.allergens.includes("egg") && menuItem.allergens.includes("shellfish")) ||
      !(verifiedAkeno.items ?? []).some((menuItem) => menuItem.name === "Grilled Saba" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("fish")) ||
      !(verifiedAkeno.items ?? []).some((menuItem) => menuItem.name === "Niku-Udon" && ["wheat", "gluten", "fish", "soy"].every((allergen) => menuItem.allergens?.includes(allergen)) && !menuItem.allergens?.includes("egg")) ||
      !(verifiedAkeno.items ?? []).some((menuItem) => menuItem.name === "Crab Rangoon" && ["milk", "wheat", "gluten", "fish"].every((allergen) => menuItem.allergens?.includes(allergen)) && !menuItem.allergens?.includes("shellfish")) ||
      !(verifiedAkeno.items ?? []).some((menuItem) => menuItem.name === "Panang Curry" && menuItem.allergenSourceType === "unavailable" && !menuItem.allergens?.includes("tree-nut")) ||
      !(verifiedAkeno.items ?? []).some((menuItem) => menuItem.name === "Eel Sauce" && menuItem.allergenSourceType === "unavailable" && !menuItem.allergens?.includes("fish"))
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/osm-akeno-sushi-thai-11475736769/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "osm-akeno-sushi-thai-11475736769",
      verifiedSnapshot,
      "Verified repair: rebuilt the current Annandale Akeno catalog as 234 formulations and 235 presentations across 28 restaurant-linked menu categories; removed four promoted modifiers or duplicate sauces and three stale products; restored 17 current products; corrected five sauce rows filed under Hosomaki; preserved the duplicate Lemonade presentation; and corrected 98 frozen allergen results from fixed published ingredients without promoting optional protein choices, coconut, imitation crab, or sauce names into unsupported allergen claims.",
    );
  }

  const verifiedAkiraRamen = restaurant("akira-ramen-and-izakaya-rockville-md-dc-metro");
  if (
    verifiedAkiraRamen &&
    (
      (verifiedAkiraRamen.items ?? []).length !== 80 ||
      new Set((verifiedAkiraRamen.items ?? []).map((menuItem) => menuItem.category)).size !== 10 ||
      (verifiedAkiraRamen.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 66 ||
      (verifiedAkiraRamen.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 14 ||
      (verifiedAkiraRamen.items ?? []).some((menuItem) => ["Extra Mayo Sauce", "Extra Wasabi Sauce", "Throbbing Soul Roll", "Sushi Kaiseki", "Sashimi Kaiseki"].includes(menuItem.name)) ||
      (verifiedAkiraRamen.items ?? []).filter((menuItem) => menuItem.name === "Tuna Ikura").length !== 1 ||
      (verifiedAkiraRamen.items ?? []).filter((menuItem) => /^King dragon Roll$/i.test(menuItem.name)).length !== 2 ||
      !["Coke", "Diet Coke", "Sprite", "Ginger Ale", "Lunch Special", "Tuesday Combo"].every((name) => (verifiedAkiraRamen.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAkiraRamen.items ?? []).some((menuItem) => menuItem.name === "Okonomiyaki" && ["egg", "wheat", "gluten", "fish", "shellfish"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAkiraRamen.items ?? []).some((menuItem) => menuItem.name === "Akira Roll" && ["wheat", "gluten", "fish", "shellfish", "soy", "sesame"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAkiraRamen.items ?? []).some((menuItem) => menuItem.name === "Rainbow Roll" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("fish")) ||
      !(verifiedAkiraRamen.items ?? []).some((menuItem) => menuItem.name === "Tonkotsu Miso Ramen" && ["egg", "wheat", "gluten", "fish", "soy"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAkiraRamen.items ?? []).some((menuItem) => menuItem.name === "Gyu Don" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("soy")) ||
      !(verifiedAkiraRamen.items ?? []).some((menuItem) => menuItem.name === "Lunch Special" && menuItem.isConfigurable && menuItem.allergenSourceType === "unavailable")
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/akira-ramen-and-izakaya-rockville-md-dc-metro/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "akira-ramen-and-izakaya-rockville-md-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the frozen 73-row name-only extraction with 80 current canonical products across ten restaurant-linked MealKeyway categories; excluded two sauce add-ons and hidden/internal rows, collapsed one same-category Tuna Ikura duplicate, retained two separately described King Dragon formulations, restored current soft drinks and configurable lunch/event packages, and corrected 65 frozen allergen results from fixed descriptions and unavoidable named formats without promoting absent text, configurable choices, or crabstick into unsupported claims.",
    );
  }

  const verifiedAlTiramisu = restaurant("replacement-al-tiramisu-washington-dc");
  if (
    verifiedAlTiramisu &&
    (
      (verifiedAlTiramisu.items ?? []).length !== 25 ||
      new Set((verifiedAlTiramisu.items ?? []).map((menuItem) => menuItem.category)).size !== 4 ||
      (verifiedAlTiramisu.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 20 ||
      (verifiedAlTiramisu.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 5 ||
      (verifiedAlTiramisu.items ?? []).some((menuItem) => ["Dolci", "INSALATE, ANTIPASTI e ZUPPE", "LE PASTE", "Menu Advisory", "SECONDI"].includes(menuItem.name)) ||
      !(verifiedAlTiramisu.items ?? []).some((menuItem) => menuItem.name === "Burrata" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("milk")) ||
      !(verifiedAlTiramisu.items ?? []).some((menuItem) => menuItem.name === "Spiedini" && ["wheat", "gluten", "shellfish"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlTiramisu.items ?? []).some((menuItem) => menuItem.name === "Ravioli" && ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) && !menuItem.allergens?.includes("egg")) ||
      !(verifiedAlTiramisu.items ?? []).some((menuItem) => menuItem.name === "Vongole" && ["wheat", "gluten", "shellfish"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlTiramisu.items ?? []).some((menuItem) => menuItem.name === "Tiramisu classico" && ["milk", "egg", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlTiramisu.items ?? []).some((menuItem) => menuItem.name === "Torta Caprese" && menuItem.allergens?.length === 1 && menuItem.allergens.includes("tree-nut")) ||
      !(verifiedAlTiramisu.items ?? []).some((menuItem) => menuItem.name === "Gelato artigianale" && menuItem.isConfigurable && menuItem.allergens?.length === 1 && menuItem.allergens.includes("milk") && !menuItem.allergens?.includes("tree-nut"))
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/replacement-al-tiramisu-washington-dc/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "replacement-al-tiramisu-washington-dc",
      verifiedSnapshot,
      "Verified repair: replaced the contaminated 30-row flattened output with all 25 current products across four restaurant-issued savory and dessert sections; removed five section-heading and advisory artifacts; restored real current descriptions and categories; and corrected 11 frozen allergen results using fixed published ingredients without assigning egg to unspecified pasta, wheat/gluten to the explicitly flourless Torta Caprese, or optional pistachio flavor to every gelato choice.",
    );
  }

  const verifiedAlaBethesda = restaurant("ala-bethesda-dc-metro");
  if (
    verifiedAlaBethesda &&
    (
      (verifiedAlaBethesda.items ?? []).length !== 35 ||
      new Set((verifiedAlaBethesda.items ?? []).map((menuItem) => menuItem.category)).size !== 4 ||
      (verifiedAlaBethesda.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 27 ||
      (verifiedAlaBethesda.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 8 ||
      (verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.category === "Mediterranean") ||
      !(verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.name === "LAYALI LUBNAN" && ["tree-nut", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) && !menuItem.allergens?.includes("milk")) ||
      !(verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.name === "TUNA TARTARE DOLMADES" && ["milk", "fish", "mustard"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.name === "SALMON KIBBEH NAYAH" && ["wheat", "gluten", "fish"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.name === "MANTI" && ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.name === "ADANA KEBAB" && ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.name === "ANTEP BAKLAVA" && ["milk", "tree-nut", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))) ||
      !(verifiedAlaBethesda.items ?? []).some((menuItem) => menuItem.name === "HUMMUS" && menuItem.allergenSourceType === "unavailable")
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/ala-bethesda-dc-metro/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "ala-bethesda-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the 34-row generic flattened Toast output with 35 current products across the four live Cold Mezze, Hot Mezze, Large Plates, and Sweets sections; restored the newly published Layali Lubnan and all fixed descriptions; removed corrupted adjacency-based variant groups and the generic Mediterranean category; and corrected 15 frozen allergen results without converting vegan/gluten-free labels or absent hummus and falafel recipes into unsupported claims.",
    );
  }

  const verifiedAlaraGeorgetown = restaurant("alara-georgetown-dc");
  if (
    verifiedAlaraGeorgetown &&
    (
      (verifiedAlaraGeorgetown.items ?? []).length !== 100 ||
      new Set((verifiedAlaraGeorgetown.items ?? []).map((menuItem) => menuItem.category)).size !== 17 ||
      (verifiedAlaraGeorgetown.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 71 ||
      (verifiedAlaraGeorgetown.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 29 ||
      (verifiedAlaraGeorgetown.items ?? []).some((menuItem) => [
        "(Humus, Tzatziki, Muhammara)",
        "First Course",
        "Second Course",
        "Third Course",
        "Fourth Course",
        "Homemade Ice Cream Kunafa",
        "Lentil Soup",
        "MiMi en Provence (France)",
        "Plomari",
        "Razzouk",
      ].includes(menuItem.name)) ||
      !["Fries", "Coffee", "Matmazel", "Alara Blush", "Stella Artois 0.0 Non-Alcoholic"].every((name) =>
        (verifiedAlaraGeorgetown.items ?? []).some((menuItem) => menuItem.name === name)
      ) ||
      !(verifiedAlaraGeorgetown.items ?? []).some((menuItem) =>
        menuItem.name === "Taste of Alara for the Entire Party" &&
        menuItem.isConfigurable &&
        ["milk", "tree-nut", "sesame"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAlaraGeorgetown.items ?? []).some((menuItem) =>
        menuItem.name === "Moussaka" &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAlaraGeorgetown.items ?? []).some((menuItem) =>
        menuItem.name === "Soujouk Omelet" &&
        ["milk", "egg", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAlaraGeorgetown.items ?? []).some((menuItem) =>
        menuItem.name === "Tahini Crème Brûlée" &&
        ["milk", "egg", "sesame"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAlaraGeorgetown.items ?? []).some((menuItem) =>
        menuItem.name === "Stella Artois 0.0 Non-Alcoholic" &&
        menuItem.allergenSourceType === "unavailable" &&
        menuItem.allergens?.length === 0
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/alara-georgetown-dc/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "alara-georgetown-dc",
      verifiedSnapshot,
      "Verified repair: replaced the flattened 104-row generic website output with 100 current food and nonalcoholic formulations representing 156 visually reviewed presentations across the restaurant-issued dinner, lunch, brunch, dessert, catering, and cocktail menus; removed seven course-heading or fused-choice artifacts and three isolated alcohol rows; restored six omitted current formulations; retained distinct meal-period names such as Tzatziki/Tzatziki Dip and Beef Pide/Ground Beef Pide; and corrected 28 frozen allergen results using fixed published ingredients, mandatory named formats, and Alara's own component recipes without converting dietary labels or general raw-food warnings into item claims.",
    );
  }

  const verifiedAlatriBros = restaurant("alatri-bros-bethesda-md");
  if (
    verifiedAlatriBros &&
    (
      (verifiedAlatriBros.items ?? []).length !== 84 ||
      new Set((verifiedAlatriBros.items ?? []).map((menuItem) => menuItem.category)).size !== 10 ||
      (verifiedAlatriBros.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 74 ||
      (verifiedAlatriBros.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-global-cross-contact-note").length !== 10 ||
      (verifiedAlatriBros.items ?? []).some((menuItem) => [
        "Good, we’re here to serve you",
        "Hungry?",
        "crostini on our housemade foccacia",
        "Shrimp Parmesan over Fresh Made Fettuccine",
      ].includes(menuItem.name)) ||
      !["Whipped Feta", "Deviled Eggs", "Hand-Cut Fries", "Chicken Parmesan Rose Sandwich", "Strawberry Gelato", "3 Scoops Gelato", "Nutella Pizza"].every((name) =>
        (verifiedAlatriBros.items ?? []).some((menuItem) => menuItem.name === name)
      ) ||
      (verifiedAlatriBros.items ?? []).some((menuItem) =>
        !["gluten", "peanut", "tree-nut"].every((allergen) => menuItem.mayContain?.includes(allergen))
      ) ||
      !(verifiedAlatriBros.items ?? []).some((menuItem) =>
        menuItem.name === "Carmellina Sandwich" &&
        ["milk", "egg", "wheat", "gluten", "mustard"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAlatriBros.items ?? []).some((menuItem) =>
        menuItem.name === "Roasted Edamame" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens.includes("soy")
      ) ||
      !(verifiedAlatriBros.items ?? []).some((menuItem) =>
        menuItem.name === "Mini Fruit Plate" &&
        menuItem.allergenSourceType === "official-global-cross-contact-note" &&
        menuItem.allergens?.length === 0
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/alatri-bros-bethesda-md/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "alatri-bros-bethesda-md",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted 66-row flattened site/Toast merge with 84 current formulations and 202 source presentations across the restaurant-issued dine-in menu and both live linked Toast channels; restored 22 omitted current formulations; removed two promotional-copy rows, one section heading, and one promoted Shrimp Parmesan description; removed every adjacency-derived variant group; corrected all 62 real frozen rows; and preserved the restaurant's global no-guarantee statement as may-contain peanut, tree nut, and gluten rather than a fixed ingredient or negative safety claim.",
    );
  }

  const verifiedAlbi = restaurant("albi-dc");
  if (
    verifiedAlbi &&
    (
      (verifiedAlbi.items ?? []).length !== 41 ||
      new Set((verifiedAlbi.items ?? []).map((menuItem) => menuItem.category)).size !== 11 ||
      (verifiedAlbi.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 31 ||
      (verifiedAlbi.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-global-cross-contact-note").length !== 10 ||
      (verifiedAlbi.items ?? []).some((menuItem) => [
        "KHUBZ +",
        "GRILLED BONE-IN STRIP",
        "CUCUMBER & GREEN STRAWBERRY",
        "MAHALABIYA ▶ $&",
      ].includes(menuItem.name)) ||
      !["SOFRA", "SMOKED PEA", "LABNE TABAT", "SLOW COOKED LONG RIB", "KNAFEH", "Baklawa", "‘TRADITIONAL’ SERVICE", "ARABIC PRESS"].every((name) =>
        (verifiedAlbi.items ?? []).some((menuItem) => menuItem.name === name)
      ) ||
      (verifiedAlbi.items ?? []).some((menuItem) => !menuItem.mayContain?.includes("sesame")) ||
      !(verifiedAlbi.items ?? []).some((menuItem) =>
        menuItem.name === "OYSTER" &&
        ["milk", "fish", "shellfish"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAlbi.items ?? []).some((menuItem) =>
        menuItem.name === "STRAWBERRY" &&
        menuItem.allergenSourceType === "official-global-cross-contact-note" &&
        menuItem.allergens?.length === 0
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/albi-dc/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "albi-dc",
      verifiedSnapshot,
      "Verified repair: replaced the stale flattened 29-row PDF output with 41 current food and nonalcoholic formulations across all 11 visually reviewed sections of Albi's restaurant-issued dinner and sweets PDFs; removed two stale dishes and two parser artifacts; restored 16 omitted current formulations; corrected all 25 current frozen rows; and represented the restaurant FAQ's inability to accommodate sesame sensitivity as global may-contain sesame without inventing fixed ingredients or expanding the broader no-guarantee statement to every allergen.",
    );
  }

  const verifiedAleroDupont = restaurant("alero-dupont-dc");
  if (
    verifiedAleroDupont &&
    (
      (verifiedAleroDupont.items ?? []).length !== 126 ||
      new Set((verifiedAleroDupont.items ?? []).map((menuItem) => menuItem.category)).size !== 8 ||
      (verifiedAleroDupont.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 64 ||
      (verifiedAleroDupont.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 62 ||
      (verifiedAleroDupont.items ?? []).some((menuItem) => ["Bag Fee", "------Appetizer------", "Mexican Coffe", "Irish Coffe"].includes(menuItem.name)) ||
      (verifiedAleroDupont.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      !["Three Birria Tacos", "Quesadilla", "Mexican Platter", "Fried Calamari", "Chaufa Mexicano", "Guadalajara Fajita Platter", "Tres Leches", "Refill Rosemary Butter"].every((name) =>
        (verifiedAleroDupont.items ?? []).some((menuItem) => menuItem.name === name)
      ) ||
      !(verifiedAleroDupont.items ?? []).some((menuItem) =>
        menuItem.name === "Fish Tacos" &&
        ["milk", "wheat", "gluten", "fish"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAleroDupont.items ?? []).some((menuItem) =>
        menuItem.name === "Fajitas" &&
        menuItem.isConfigurable &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAleroDupont.items ?? []).some((menuItem) =>
        menuItem.name === "Guadalajara Fajita Platter" &&
        menuItem.isConfigurable &&
        menuItem.allergenSourceType === "unavailable" &&
        menuItem.allergens?.length === 0
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile("data/restaurant-verification/repairs/alero-dupont-dc/corrected-menu.json", "utf8"));
    replaceVerifiedMixedMenuSnapshot(
      "alero-dupont-dc",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted 42-row partial Toast extraction with 126 current food and nonalcoholic formulations and 193 source presentations across all eight live Dupont categories and six restaurant-issued food pages; removed the bag fee, divider row, two alcohol-only coffees, and featured duplicates; restored 84 omitted formulations including the official-site-only Fried Calamari; consolidated the identical Rapido Salad presentation with Alero Salad; removed every adjacency-derived variant group; corrected ten frozen allergen results using restaurant-issued descriptions and mandatory named formats; and kept configurable proteins, fillings, incomplete descriptions, and unsupported cross-contact claims out of fixed allergen data.",
    );
  }

  const verifiedAlhambra = restaurant("replacement-alhambra-washington-dc");
  if (
    verifiedAlhambra &&
    (
      (verifiedAlhambra.items ?? []).length !== 107 ||
      new Set((verifiedAlhambra.items ?? []).map((menuItem) => menuItem.category)).size !== 24 ||
      (verifiedAlhambra.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 75 ||
      (verifiedAlhambra.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 32 ||
      (verifiedAlhambra.items ?? []).some((menuItem) => [
        "BOTTOMLESS MIMOSA",
        "BOTTOMLESS BLOODY MARY",
        "THE RED SNAPPER",
        "THE CAPITOL MARY",
        "CONTINENTAL Copy Copy Copy Copy",
        "Choice of entree:",
        "ADD ONS:",
      ].includes(menuItem.name)) ||
      (verifiedAlhambra.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      ![
        "Freshly Baked Pastry (One Piece)",
        "Belgian Waffle",
        "Avocado & Shrimp Salad",
        "Executive Lunch — Three Courses",
        "Blackened Octopus",
        "12 Ounce Prime Ribeye",
        "Shrimp Al Ajillo",
      ].every((name) => (verifiedAlhambra.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAlhambra.items ?? []).some((menuItem) =>
        menuItem.name === "Alhambra Platter" &&
        menuItem.isConfigurable &&
        menuItem.allergenSourceType === "unavailable" &&
        menuItem.allergens?.length === 0
      ) ||
      !(verifiedAlhambra.items ?? []).some((menuItem) =>
        menuItem.name === "Organic Quinoa Salad" &&
        ["milk", "tree-nut"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("fish") &&
        !menuItem.allergens?.includes("shellfish")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/replacement-alhambra-washington-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "replacement-alhambra-washington-dc",
      verifiedSnapshot,
      "Verified repair: replaced the partial, structurally corrupted 113-row generic website extraction with 107 current food and nonalcoholic formulations and 130 source presentations across Alhambra's restaurant-issued Breakfast, Brunch, Lunch, Dinner, and Veranda menus; removed five frozen CMS/alcohol artifacts and four additional alcohol-only or CMS-only source rows; consolidated 23 duplicate meal-period or spelling presentations; restored every omitted current formulation; corrected 46 frozen allergen results; and kept optional add-ons, selectable proteins or entrees, absent descriptions, and unsupported cross-contact claims out of fixed allergen data.",
    );
  }

  const verifiedAllAboutBurgerGloverPark = restaurant("all-about-burger-glover-park-dc");
  if (verifiedAllAboutBurgerGloverPark && (verifiedAllAboutBurgerGloverPark.items ?? []).length > 0) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/all-about-burger-glover-park-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "all-about-burger-glover-park-dc",
      verifiedSnapshot,
      "Verified repair: removed all 59 rows from the historical All About Burger Glover Park Toast catalog because the audited location closed, the chain's current restaurant-issued site no longer lists Glover Park, and Joia Burger's current official site identifies the exact 2414 Wisconsin Avenue address as its active Glover Park location; no historical menu or allergen claim is current for this closed-and-replaced restaurant entry.",
    );
  }

  const verifiedAllGoRhythms = restaurant("osm-allgorhythms-12234974276");
  if (
    verifiedAllGoRhythms &&
    (
      (verifiedAllGoRhythms.items ?? []).length !== 76 ||
      new Set((verifiedAllGoRhythms.items ?? []).map((menuItem) => menuItem.category)).size !== 9 ||
      (verifiedAllGoRhythms.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 45 ||
      (verifiedAllGoRhythms.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 31 ||
      (verifiedAllGoRhythms.items ?? []).some((menuItem) =>
        [
          "🔥 Main Plates & Entrees",
          "$14.00/Veg",
          "$16.00/Chicken",
          "INSPIRED COCKTAILS",
          "make some memories",
          "Lamb Chops or Grilled Sea Bass Fish",
          "Dynamite Dragon Shrimp — crispy shrimp tossed in sweet chili or hot sauce",
          "Personal Pizza or Quesadilla/Taco Twist — fun fusion takes on familiar favorites",
        ].includes(menuItem.name)
      ) ||
      (verifiedAllGoRhythms.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      ![
        "Crispy Spice 65",
        "Quesadilla",
        "Fries",
        "Gulab Groove",
        "Signature Kabob Sizzler",
      ].every((name) => (verifiedAllGoRhythms.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAllGoRhythms.items ?? []).some((menuItem) =>
        menuItem.name === "Baklava" &&
        ["milk", "tree-nut", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAllGoRhythms.items ?? []).some((menuItem) =>
        menuItem.name === "Bold Chilli Bites" &&
        (menuItem.allergens ?? []).length === 0
      ) ||
      !(verifiedAllGoRhythms.items ?? []).some((menuItem) =>
        menuItem.name === "Pasta Prelude" &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/osm-allgorhythms-12234974276/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "osm-allgorhythms-12234974276",
      verifiedSnapshot,
      "Verified repair: replaced the structurally polluted 82-row extraction with 76 current food formulations and 171 source presentations from AllGoRhythms' restaurant-issued main/event menu and linked SpotApps catalog; removed eight homepage, price, promotional, and alcohol-heading artifacts; consolidated one duplicated service-menu formulation; restored Quesadilla, Fries, and Gulab Groove; canonicalized Crispy Spice 65; corrected 26 frozen allergen results; and kept selectable proteins, sauces, optional dairy, general accommodation language, and unsupported cross-contact claims out of fixed allergen data.",
    );
  }

  const verifiedAllPurposeShaw = restaurant("all-purpose-shaw-dc");
  if (
    verifiedAllPurposeShaw &&
    (
      (verifiedAllPurposeShaw.items ?? []).length !== 57 ||
      new Set((verifiedAllPurposeShaw.items ?? []).map((menuItem) => menuItem.category)).size !== 9 ||
      (verifiedAllPurposeShaw.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 39 ||
      (verifiedAllPurposeShaw.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 18 ||
      (verifiedAllPurposeShaw.items ?? []).some((menuItem) => menuItem.name === "Roasted Garlic Knots" || menuItem.variantGroup) ||
      ![
        "Burrata",
        "House-Cut Fries",
        "The Gurney Street",
        "AP Pizza Kit",
        "Blueberry Ricotta Cheesecake",
        "Run Wild",
        "San Pellegrino Rossa Aranciata",
      ].every((name) => (verifiedAllPurposeShaw.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAllPurposeShaw.items ?? []).some((menuItem) =>
        menuItem.name === "Italian Hash Browns" &&
        menuItem.allergens?.includes("milk") &&
        !menuItem.allergens?.includes("fish")
      ) ||
      !(verifiedAllPurposeShaw.items ?? []).some((menuItem) =>
        menuItem.name === "The Breakfast Sandwich" &&
        ["milk", "egg", "wheat", "gluten", "sesame"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("fish")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/all-purpose-shaw-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "all-purpose-shaw-dc",
      verifiedSnapshot,
      "Verified repair: replaced the partial 39-row frozen catalog with 57 current food and nonalcoholic formulations and 82 source presentations from All-Purpose Shaw's Spring 2026 brunch, dinner, drinks, and happy-hour PDFs plus its live linked Toast menu; removed the stale Roasted Garlic Knots formulation; consolidated three duplicated service-period or display-name formulations; restored 22 current formulations; corrected three frozen allergen overreports; and kept optional proteins, allergy-request controls, FAQ accommodation language, and unsupported cross-contact claims out of fixed allergen data.",
    );
  }

  const verifiedAllSet = restaurant("all-set-restaurant-and-bar-silver-spring-md-dc-metro");
  if (
    verifiedAllSet &&
    (
      (verifiedAllSet.items ?? []).length !== 104 ||
      new Set((verifiedAllSet.items ?? []).map((menuItem) => menuItem.category)).size !== 17 ||
      (verifiedAllSet.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 66 ||
      (verifiedAllSet.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 38 ||
      (verifiedAllSet.items ?? []).some((menuItem) =>
        /^Extra\b/.test(menuItem.name) ||
        ["Blue Cheese & Ranch", "Make it a platter with French Fries &"].includes(menuItem.name)
      ) ||
      (verifiedAllSet.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      ![
        "Oysters on the 1/2 Shell",
        "Bleu Cheese House Salad",
        "Ice Cream Sundae",
        "Fried Calamari",
        "Perfect Hideout",
        "Grilled Shrimp Taco",
        "Athletic Brewing NA",
      ].every((name) => (verifiedAllSet.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAllSet.items ?? []).some((menuItem) =>
        menuItem.name === "Wild Mushroom Pizza" &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAllSet.items ?? []).some((menuItem) =>
        menuItem.name === "Smashburger" &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("tree-nut")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/all-set-restaurant-and-bar-silver-spring-md-dc-metro/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "all-set-restaurant-and-bar-silver-spring-md-dc-metro",
      verifiedSnapshot,
      "Verified repair: replaced the structurally polluted 101-row frozen extraction with 104 current food and nonalcoholic formulations and 131 source presentations from All Set's restaurant-issued online menu and nine current PDF menus; removed 13 nested modifier or truncated-fragment rows; consolidated seven size or service-period duplicate formulations; restored 23 PDF-only current formulations; corrected 37 frozen allergen results; removed lexical false positives caused by oyster mushrooms and pecan-smoked bacon; and kept optional choices, unexplained names, and unsupported cross-contact claims out of fixed allergen data.",
    );
  }

  const verifiedAllSpice = restaurant("osm-allspice-catering-3397462219");
  if (
    verifiedAllSpice &&
    (
      (verifiedAllSpice.items ?? []).length !== 209 ||
      new Set((verifiedAllSpice.items ?? []).map((menuItem) => menuItem.category)).size !== 24 ||
      (verifiedAllSpice.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 165 ||
      (verifiedAllSpice.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 44 ||
      (verifiedAllSpice.items ?? []).some((menuItem) =>
        [
          "Featured Menus",
          "Hot Entrees",
          "Ham & Cheese",
          "Mac-N-Cheese",
          "2 sides of fries",
          "Food tags",
          "Planning an Event?",
          "Set of Disposable Utensils Per Guest",
          "Crab Mallet",
          "Gift Certificate",
        ].includes(menuItem.name)
      ) ||
      (verifiedAllSpice.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      ![
        "Bagel Tray",
        "Maryland Crab Boil",
        "Sushi",
        "Rosemary-Merlot Flank Steak",
        "Caprese Skewers with Pesto Drizzle",
        "Spanakopita Spinach Triangles",
      ].every((name) => (verifiedAllSpice.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAllSpice.items ?? []).some((menuItem) =>
        menuItem.name === "Mini Crab Cakes with Remoulade" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAllSpice.items ?? []).some((menuItem) =>
        menuItem.name === "Seven Layer Mexican Dip & Tortilla Chips" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0
      ) ||
      !(verifiedAllSpice.items ?? []).some((menuItem) =>
        menuItem.name === "Prime Rib of Beef Dinner" &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("egg") &&
        !menuItem.allergens?.includes("tree-nut")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/osm-allspice-catering-3397462219/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "osm-allspice-catering-3397462219",
      verifiedSnapshot,
      "Verified repair: replaced the structurally polluted, partial 108-row crawl with 209 current food and nonalcoholic formulations and 396 source presentations from AllSpice's complete restaurant-issued WordPress menu and WooCommerce product APIs; removed 57 navigation, category, nested component, and bundled-menu fragment rows plus three non-food commerce products; consolidated duplicated API surfaces and three pack-size aliases; restored 158 omitted current formulations; corrected 36 retained-row allergen results; removed unsupported egg, wheat, and dairy assumptions for variable sauces or preparation formats; and kept optional selections, absent recipes, and unsupported cross-contact claims out of fixed allergen data.",
    );
  }

  const verifiedAltaStradaFairfax = restaurant("replacement-alta-strada-fairfax-va-fairfax-va");
  if (
    verifiedAltaStradaFairfax &&
    (
      (verifiedAltaStradaFairfax.items ?? []).length !== 37 ||
      new Set((verifiedAltaStradaFairfax.items ?? []).map((menuItem) => menuItem.category)).size !== 5 ||
      (verifiedAltaStradaFairfax.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 33 ||
      (verifiedAltaStradaFairfax.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 4 ||
      (verifiedAltaStradaFairfax.items ?? []).some((menuItem) =>
        [
          "Grilled Filet Branzino",
          "Mussels Fra Diavlo",
          "Veal Piccata",
          "Prime Filet Mignon* (8oz)",
          "37Grilled Filet Branzino",
          "61Prime Flat Iron Steak* (8 oz)",
        ].includes(menuItem.name)
      ) ||
      (verifiedAltaStradaFairfax.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      ![
        "Whipped Ricotta",
        "Alta Strada Smashburger",
        "Potato Gnocchi",
        "Crab Cake Benedict",
        "Cacio e Pepe",
      ].every((name) => (verifiedAltaStradaFairfax.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAltaStradaFairfax.items ?? []).some((menuItem) =>
        menuItem.name === "Chicken Milanese or Parmigiano" &&
        menuItem.isConfigurable &&
        ["wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("milk") &&
        !menuItem.allergens?.includes("tree-nut")
      ) ||
      !(verifiedAltaStradaFairfax.items ?? []).some((menuItem) =>
        menuItem.name === "Fried Calamari" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAltaStradaFairfax.items ?? []).some((menuItem) =>
        menuItem.name === "Grilled NY Strip" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/replacement-alta-strada-fairfax-va-fairfax-va/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "replacement-alta-strada-fairfax-va-fairfax-va",
      verifiedSnapshot,
      "Verified repair: replaced the cross-location 29-row crawl with 37 current Mosaic/Fairfax food formulations and 62 source presentations from Alta Strada's restaurant-issued lunch, dinner, brunch, and happy-hour menus; removed 22 genuine Wellesley or Foxwoods formulations and two Wellesley price-concatenation artifacts; consolidated five surviving frozen rows into four current Fairfax formulations; restored 33 omitted Fairfax formulations; corrected three retained-row allergen results; and kept optional Parmigiano preparation, add-on proteins, variable sauces, culinary assumptions, and unsupported cross-contact claims out of fixed allergen data.",
    );
  }

  const verifiedAma = restaurant("ama-dc");
  if (
    verifiedAma &&
    (
      verifiedAma.brandKey !== "amarestaurant" ||
      verifiedAma.domain !== "amarestaurant.bar" ||
      verifiedAma.locationId !== "navy-yard-dc" ||
      verifiedAma.displayAddress !== "885 New Jersey Ave SE, Washington, DC 20003" ||
      verifiedAma.guideUrl !== "https://www.amarestaurant.bar/lunchanddinner" ||
      (verifiedAma.items ?? []).length !== 84 ||
      new Set((verifiedAma.items ?? []).map((menuItem) => menuItem.category)).size !== 18 ||
      (verifiedAma.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 57 ||
      (verifiedAma.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 27 ||
      (verifiedAma.items ?? []).some((menuItem) =>
        ["Pesto", "Rice Bowl", "Caffè Corretto", "Protein Add on", "Can Also be served on", "ZP Libations"].includes(menuItem.name)
      ) ||
      (verifiedAma.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      ![
        "Ama's Signature Bone Broth",
        "Fügassa",
        "Paccheri con Sugo di Mare",
        "Rösti (Lunch & Dinner)",
        "Rösti (Brunch)",
        "Tiramisu",
      ].every((name) => (verifiedAma.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAma.items ?? []).some((menuItem) =>
        menuItem.name === "Fügassa" &&
        menuItem.isConfigurable &&
        menuItem.allergens?.length === 2 &&
        ["wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("milk")
      ) ||
      !(verifiedAma.items ?? []).some((menuItem) =>
        menuItem.name === "Mondeghili Polpette" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens?.includes("tree-nut")
      ) ||
      !(verifiedAma.items ?? []).some((menuItem) =>
        menuItem.name === "Vitello alla Milanese" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/ama-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "ama-dc",
      verifiedSnapshot,
      "Verified repair: corrected the frozen Chevy Chase identity to Ama Navy Yard at 885 New Jersey Ave SE; replaced the partial 36-row Toast-era catalog with 84 current food and nonalcoholic formulations and 100 source presentations from Ama's restaurant-issued Caffè, Lunch & Dinner, and Brunch pages; removed two stale standalone rows and three alcohol/modifier rows; consolidated repeated service-period and configurable Fügassa presentations; restored 55 omitted current formulations; corrected 17 frozen allergen results; and kept optional choices, dietary-label implications, contradictory breaded GF/DF wording, culinary assumptions, and unsupported cross-contact claims out of fixed allergen data.",
    );

    verifiedAma.brandKey = "amarestaurant";
    verifiedAma.domain = "amarestaurant.bar";
    verifiedAma.locationId = "navy-yard-dc";
    verifiedAma.displayAddress = "885 New Jersey Ave SE, Washington, DC 20003";
    verifiedAma.guideUrl = "https://www.amarestaurant.bar/lunchanddinner";
    verifiedAma.guideLabel = "Official menu source";
    verifiedAma.logoUrl = "https://www.google.com/s2/favicons?domain=amarestaurant.bar&sz=256";
    verifiedAma.sourceFamily = "generic-website";
    verifiedAma.parserProfile = "generic-website";
    verifiedAma.sourceProfile = "generic-website:generic-website";
    verifiedAma.sourceUrls = [
      "https://www.amarestaurant.bar/caffe-menu",
      "https://www.amarestaurant.bar/lunchanddinner",
      "https://www.amarestaurant.bar/ama-brunch",
      "https://order.toasttab.com/online/ama-dc",
    ];
    verifiedAma.updated = "2026-07";
    verifiedAma.lastKnownGoodAt = "2026-07-15T00:35:40.204Z";
    verifiedAma.sourceUpdatedAt = "2026-07-15T00:35:40.204Z";
    verifiedAma.sourceStatus = {
      ...(verifiedAma.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:primary-menu:https://www.amarestaurant.bar/lunchanddinner",
          "menu:secondary-menu:https://www.amarestaurant.bar/caffe-menu",
          "menu:secondary-menu:https://www.amarestaurant.bar/ama-brunch",
          "ordering:ordering-vendor:https://order.toasttab.com/online/ama-dc",
        ],
        configuredUrlWarnings: [],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 3,
      ok: 3,
      failed: 1,
      total: 4,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "caffe-corretto", kind: "source-note", name: "Caffè Corretto", reasons: ["alcoholic-menu-row"] },
        { id: "protein-add-on", kind: "modifier", name: "Protein Add on", reasons: ["modifier-row"] },
        { id: "can-also-be-served-on", kind: "modifier", name: "Can Also be served on", reasons: ["modifier-row"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 16,
    };
  }

  const verifiedAmazonia = restaurant("amazonia-dc");
  if (
    verifiedAmazonia &&
    (
      (verifiedAmazonia.items ?? []).length !== 34 ||
      new Set((verifiedAmazonia.items ?? []).map((menuItem) => menuItem.category)).size !== 10 ||
      (verifiedAmazonia.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 24 ||
      (verifiedAmazonia.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 10 ||
      (verifiedAmazonia.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      ![
        "Corazón de Res",
        "Filet Mignon",
        "Daily Chef's Choice of 5 Anticuchos",
        "Josper Wagyu Burger",
        "Ungurahui Açaí",
        "Chocolucuma",
        "Chicha Morada",
        "Prima Pavé Brut Rosé",
        "Espresso",
      ].every((name) => (verifiedAmazonia.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmazonia.items ?? []).some((menuItem) =>
        menuItem.name === "Salmon Belly" &&
        ["fish", "soy"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !["Pulpo al Josper", "Pulpo al Olivo"].every((name) =>
        (verifiedAmazonia.items ?? []).some((menuItem) =>
          menuItem.name === name && menuItem.allergens?.length === 1 && menuItem.allergens?.includes("shellfish")
        )
      ) ||
      !(verifiedAmazonia.items ?? []).some((menuItem) =>
        menuItem.name === "Ensalada de Chonta" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/amazonia-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "amazonia-dc",
      verifiedSnapshot,
      "Verified repair: replaced the dinner-only 20-row catalog with 34 current food and nonalcoholic formulations and 43 source presentations from Amazonia's restaurant-issued Dinner, Sour Hour, Dessert, and Drinks pages; restored three omitted dinner formulations plus Sour Hour food, desserts, coffee, and zero-proof beverages; corrected seven frozen allergen underreports, including the Anticuchería section's shared soy-sauce marinade and explicit octopus; consolidated nine cross-menu presentations; and kept c/d/e/g/s dietary absence or accommodation codes, parenthesized modifications, and unsupported cross-contact implications out of positive allergen claims.",
    );
    verifiedAmazonia.sourceUrls = [
      "https://www.causadc.com/menus/amazonia-dinner",
      "https://www.causadc.com/menus/amazonia-sour-hour",
      "https://www.causadc.com/menus/amazonia-dessert",
      "https://www.causadc.com/menus/amazonia-drinks",
    ];
    verifiedAmazonia.updated = "2026-07";
    verifiedAmazonia.lastKnownGoodAt = "2026-07-15T00:51:00.405Z";
    verifiedAmazonia.sourceUpdatedAt = "2026-07-15T00:51:00.405Z";
    verifiedAmazonia.sourceStatus = {
      ...(verifiedAmazonia.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:primary-menu:https://www.causadc.com/menus/amazonia-dinner",
          "menu:special-food-menu:https://www.causadc.com/menus/amazonia-sour-hour",
          "menu:dessert-menu:https://www.causadc.com/menus/amazonia-dessert",
          "menu:beverage-menu:https://www.causadc.com/menus/amazonia-drinks",
        ],
        configuredUrlWarnings: [],
        nonFoodDocumentSuspected: false,
      },
      ok: 4,
      failed: 0,
      total: 4,
      nonFoodDocumentSuspected: false,
      reviewedMenuQualityRepairDuplicatesRemoved: 9,
    };
  }

  const verifiedAmbarCapitolHill = restaurant("ambar-restaurant-capitol-hill-washington-dc-dc-metro");
  if (
    verifiedAmbarCapitolHill &&
    (
      verifiedAmbarCapitolHill.displayAddress !== "523 8th St SE, Washington, DC 20003" ||
      verifiedAmbarCapitolHill.guideUrl !== "https://ambarrestaurant.com/page/capitol-hill-menus" ||
      (verifiedAmbarCapitolHill.items ?? []).length !== 104 ||
      new Set((verifiedAmbarCapitolHill.items ?? []).map((menuItem) => menuItem.category)).size !== 22 ||
      (verifiedAmbarCapitolHill.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 72 ||
      (verifiedAmbarCapitolHill.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 32 ||
      (verifiedAmbarCapitolHill.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      (verifiedAmbarCapitolHill.items ?? []).some((menuItem) =>
        ["Mixed Meat", "Krempita", "Balkan Style Rice", "Lamb Pizza"].includes(menuItem.name)
      ) ||
      ![
        "Meat From the Grill",
        "Seafood From the Grill",
        "Olivier Spread",
        "Tuna Tartare",
        "Kajmak",
        "Baklava Waffle",
        "Shrimp Pilaf",
        "Coke (Can 12oz)",
      ].every((name) => (verifiedAmbarCapitolHill.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmbarCapitolHill.items ?? []).some((menuItem) =>
        menuItem.name === "Mushroom Flatbread" &&
        menuItem.allergens?.length === 3 &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAmbarCapitolHill.items ?? []).some((menuItem) =>
        menuItem.name === "Cauliflower" &&
        menuItem.allergens?.length === 2 &&
        ["tree-nut", "sesame"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAmbarCapitolHill.items ?? []).some((menuItem) =>
        menuItem.name === "Ajvar" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0 &&
        (menuItem.mayContain ?? []).length === 0
      )
    )
  ) {
    const ambarCapitolHillRepairNote =
      "Verified repair: replaced the polluted 39-row cross-surface generic crawl with 104 current Capitol Hill food and nonalcoholic formulations and 267 source presentations from AMBAR's restaurant-issued May/June 2026 menus, current allergy guides, and restaurant-linked ordering menu; removed one descriptionless parser artifact and three stale formulations; restored 69 omitted current formulations; corrected 15 frozen allergen results, including the oyster-mushroom shellfish false positive, missing dairy in Kajmak, missing phyllo and flatbread wheat/gluten, and missing pine-nut, mustard, and dairy signals; and preserved the allergy guides' GF/DF/NF/SF free-from and underlined-modification semantics without inventing contains or cross-contact claims from absent icons.";
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/ambar-restaurant-capitol-hill-washington-dc-dc-metro/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "ambar-restaurant-capitol-hill-washington-dc-dc-metro",
      verifiedSnapshot,
      ambarCapitolHillRepairNote,
    );
    verifiedAmbarCapitolHill.brandKey = "ambarrestaurant";
    verifiedAmbarCapitolHill.domain = "ambarrestaurant.com";
    verifiedAmbarCapitolHill.locationId = "washington-dc";
    verifiedAmbarCapitolHill.displayAddress = "523 8th St SE, Washington, DC 20003";
    verifiedAmbarCapitolHill.guideUrl = "https://ambarrestaurant.com/page/capitol-hill-menus";
    verifiedAmbarCapitolHill.guideLabel = "Official Capitol Hill menus";
    verifiedAmbarCapitolHill.sourceFamily = "generic-website";
    verifiedAmbarCapitolHill.parserProfile = "generic-website";
    verifiedAmbarCapitolHill.sourceProfile = "generic-website:generic-website";
    verifiedAmbarCapitolHill.sourceUrls = [
      "https://ambarrestaurant.com/page/capitol-hill-menus",
      "https://ambarrestaurant.com/page/capitol-hill-allergy-lunch--dinner-menu",
      "https://ambarrestaurant.com/page/capitol-hill-allergy-brunch-menu",
      "https://ambarrestaurant.com/menu/ambarcapitolhill",
    ];
    verifiedAmbarCapitolHill.updated = "2026-07";
    verifiedAmbarCapitolHill.lastKnownGoodAt = "2026-07-15T01:12:00.000Z";
    verifiedAmbarCapitolHill.sourceUpdatedAt = "2026-07-15T01:12:00.000Z";
    verifiedAmbarCapitolHill.sourceStatus = {
      ...(verifiedAmbarCapitolHill.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:primary-menu:https://ambarrestaurant.com/page/capitol-hill-menus",
          "allergen:official-allergy-guide:https://ambarrestaurant.com/page/capitol-hill-allergy-lunch--dinner-menu",
          "allergen:official-allergy-guide:https://ambarrestaurant.com/page/capitol-hill-allergy-brunch-menu",
          "ordering:ordering-vendor:https://ambarrestaurant.com/menu/ambarcapitolhill",
        ],
        configuredUrlWarnings: [],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 4,
      ok: 4,
      failed: 0,
      total: 4,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "mixed-meat", kind: "parser-artifact", name: "Mixed Meat", reasons: ["descriptionless-child-row"] },
        { id: "krempita", kind: "stale-menu-item", name: "Krempita", reasons: ["absent-from-current-dessert-menu"] },
        { id: "balkan-style-rice", kind: "stale-menu-item", name: "Balkan Style Rice", reasons: ["absent-from-current-menus"] },
        { id: "lamb-pizza", kind: "stale-menu-item", name: "Lamb Pizza", reasons: ["absent-from-current-menus"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 163,
      reviewedMenuQualityRepairs: [
        ...((verifiedAmbarCapitolHill.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Final generated repair: removed rows rejected by the shared menu-item classifier\.|Verified repair: replaced the polluted 39-row cross-surface generic crawl/.test(String(repair.note ?? ""))
        )),
        { replacedRows: 104, note: ambarCapitolHillRepairNote },
      ],
    };
  }

  const verifiedAmbarClarendon = restaurant("ambar-restaurant-clarendon-arlington-va-dc-metro");
  if (
    verifiedAmbarClarendon &&
    (
      verifiedAmbarClarendon.displayAddress !== "2901 Wilson Blvd, Arlington, VA 22201" ||
      verifiedAmbarClarendon.guideUrl !== "https://ambarrestaurant.com/page/clarendon-menus" ||
      (verifiedAmbarClarendon.items ?? []).length !== 98 ||
      new Set((verifiedAmbarClarendon.items ?? []).map((menuItem) => menuItem.category)).size !== 22 ||
      (verifiedAmbarClarendon.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-allergen-menu").length !== 64 ||
      (verifiedAmbarClarendon.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 10 ||
      (verifiedAmbarClarendon.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 24 ||
      (verifiedAmbarClarendon.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      (verifiedAmbarClarendon.items ?? []).some((menuItem) =>
        ["Mixed Meat", "Krempita", "Slow Cooked Pork Shoulder", "Coke (Can", "Balkan Style Rice", "Lamb Pizza"].includes(menuItem.name)
      ) ||
      ![
        "Meat From the Grill",
        "Seafood From the Grill",
        "Olivier Spread",
        "Fried Chicken",
        "Mushroom Flatbread",
        "Baklava",
        "Mexican Coke",
        "Heineken N/A",
      ].every((name) => (verifiedAmbarClarendon.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmbarClarendon.items ?? []).some((menuItem) =>
        menuItem.name === "Mushroom Flatbread" &&
        menuItem.allergens?.length === 3 &&
        ["milk", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAmbarClarendon.items ?? []).some((menuItem) =>
        menuItem.name === "Chicken Skewers" &&
        menuItem.allergens?.length === 3 &&
        ["wheat", "gluten", "sesame"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("milk")
      ) ||
      !(verifiedAmbarClarendon.items ?? []).some((menuItem) =>
        menuItem.name === "Heineken N/A" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0 &&
        menuItem.inferredAllergenSignals?.length === 1 &&
        menuItem.inferredAllergenSignals[0].id === "gluten" &&
        !menuItem.inferredAllergenSignals?.some((signal) => signal.id === "wheat")
      )
    )
  ) {
    const ambarClarendonRepairNote =
      "Verified repair: replaced the polluted 39-row cross-surface generic crawl with 98 current Clarendon food and nonalcoholic formulations and 238 source presentations from AMBAR's restaurant-issued May/June 2026 menus and location-specific ordering surface; removed one descriptionless parser artifact and five stale formulations; restored 65 omitted current formulations; corrected 23 frozen allergen results, including the oyster-mushroom shellfish false positive, default modifiable spread allergens, phyllo and flatbread wheat/gluten, dairy, nuts, sesame, and mustard signals; preserved the current D/G/N/SF/E/S direct-label and asterisk-modification semantics without treating missing codes as comprehensive negative assurances; and retained Heineken manufacturer ingredients only as Ingredient Intelligence rather than restaurant-issued evidence.";
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/ambar-restaurant-clarendon-arlington-va-dc-metro/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "ambar-restaurant-clarendon-arlington-va-dc-metro",
      verifiedSnapshot,
      ambarClarendonRepairNote,
    );
    verifiedAmbarClarendon.brandKey = "ambarrestaurant";
    verifiedAmbarClarendon.domain = "ambarrestaurant.com";
    verifiedAmbarClarendon.locationId = "arlington-va";
    verifiedAmbarClarendon.displayAddress = "2901 Wilson Blvd, Arlington, VA 22201";
    verifiedAmbarClarendon.guideUrl = "https://ambarrestaurant.com/page/clarendon-menus";
    verifiedAmbarClarendon.guideLabel = "Official Clarendon menus";
    verifiedAmbarClarendon.sourceFamily = "generic-website";
    verifiedAmbarClarendon.parserProfile = "generic-website";
    verifiedAmbarClarendon.sourceProfile = "generic-website:generic-website";
    verifiedAmbarClarendon.sourceUrls = [
      "https://ambarrestaurant.com/page/clarendon-menus",
      "https://ambarrestaurant.com/page/clarendon-allergy-brunch-menu",
      "https://ambarrestaurant.com/menu/ambarclarendon",
      "https://www.heineken.com/us/en/our-beers/heineken-0-0",
    ];
    verifiedAmbarClarendon.updated = "2026-07";
    verifiedAmbarClarendon.lastKnownGoodAt = "2026-07-15T01:45:06.197Z";
    verifiedAmbarClarendon.sourceUpdatedAt = "2026-07-15T01:45:06.197Z";
    verifiedAmbarClarendon.sourceStatus = {
      ...(verifiedAmbarClarendon.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:primary-menu:https://ambarrestaurant.com/page/clarendon-menus",
          "allergen:supplemental-official-guide:https://ambarrestaurant.com/page/clarendon-allergy-brunch-menu",
          "ordering:ordering-vendor:https://ambarrestaurant.com/menu/ambarclarendon",
          "ingredient-intelligence:manufacturer-product-page:https://www.heineken.com/us/en/our-beers/heineken-0-0",
        ],
        configuredUrlWarnings: [
          "clarendon-allergy-brunch-wrapper-links-lunch-dinner-guide",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 6,
      ok: 4,
      failed: 0,
      total: 4,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "mixed-meat", kind: "parser-artifact", name: "Mixed Meat", reasons: ["descriptionless-child-row"] },
        { id: "krempita", kind: "stale-menu-item", name: "Krempita", reasons: ["absent-from-current-dessert-menu"] },
        { id: "slow-cooked-pork-shoulder", kind: "stale-menu-item", name: "Slow Cooked Pork Shoulder", reasons: ["standalone-formulation-absent-from-current-menus"] },
        { id: "coke-can", kind: "stale-menu-item", name: "Coke (Can", reasons: ["absent-from-current-drinks-and-ordering-menus"] },
        { id: "balkan-style-rice", kind: "stale-menu-item", name: "Balkan Style Rice", reasons: ["absent-from-current-menus"] },
        { id: "lamb-pizza", kind: "stale-menu-item", name: "Lamb Pizza", reasons: ["absent-from-current-menus"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 140,
      reviewedMenuQualityRepairs: [
        ...((verifiedAmbarClarendon.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Final generated repair: removed rows rejected by the shared menu-item classifier\.|Verified repair: replaced the polluted 39-row cross-surface generic crawl/.test(String(repair.note ?? ""))
        )),
        { replacedRows: 98, note: ambarClarendonRepairNote },
      ],
    };
  }

  const verifiedAmbassador = restaurant("replacement-ambassador-restaurant-washington-dc");
  if (
    verifiedAmbassador &&
    (
      verifiedAmbassador.displayAddress !== "1907 9th St NW, Washington, DC 20001" ||
      verifiedAmbassador.guideUrl !== "https://ambassadorwashington.com/menu/" ||
      (verifiedAmbassador.items ?? []).length !== 26 ||
      new Set((verifiedAmbassador.items ?? []).map((menuItem) => menuItem.category)).size !== 5 ||
      (verifiedAmbassador.items ?? []).some((menuItem) => menuItem.allergenSourceType !== "unavailable") ||
      (verifiedAmbassador.items ?? []).some((menuItem) =>
        [
          "Start with shareable choices",
          "Use ordering as a fallback",
          "Call Us Now",
          "Current listed hours",
          "Restaurant",
          "Check current availability",
          "Plan around service options",
          "Start with menu highlights",
          "4.8 star",
          "Find us on 9th Street NW",
          "Options",
          "Plan dishes that travel well",
        ].includes(menuItem.name)
      ) ||
      ![
        "Jambo Fatta",
        "Kitcha Fitfit",
        "Egg Frittata",
        "Veggie Combo",
        "Special Tibsi",
        "Ambassador Tibsi",
        "Chicken Tibsi",
        "Spaghetti with Tibsi",
        "Fish",
        "Chicken",
        "Espresso",
        "Ethiopian Stew",
        "Beets",
      ].every((name) => (verifiedAmbassador.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmbassador.items ?? []).some((menuItem) =>
        menuItem.name === "Kitcha Fitfit" &&
        menuItem.inferredAllergenSignals?.length === 2 &&
        ["milk", "gluten"].every((allergen) =>
          menuItem.inferredAllergenSignals?.some((signal) => signal.id === allergen)
        ) &&
        !menuItem.inferredAllergenSignals?.some((signal) => signal.id === "wheat")
      ) ||
      !(verifiedAmbassador.items ?? []).some((menuItem) =>
        menuItem.name === "Chicken Tibsi" &&
        (menuItem.inferredAllergenSignals ?? []).length === 0
      )
    )
  ) {
    const ambassadorRepairNote =
      "Verified repair: replaced the 19-row generic crawl with 26 current Ambassador formulations and 27 source presentations from the current seven-row first-party guest-favorites page plus a restaurant-identity-matched 20-row delivery catalog preserved in May 2026 Restaurantji menu images and corroborated by the restaurant-linked and longer third-party catalogs; removed 12 navigation, hours, rating, location, and marketing artifacts; restored 19 omitted current formulations; retained all restaurant allergen status as unavailable because no restaurant-issued allergen disclosure was located; and kept explicit menu-wording cues only as non-official Ingredient Intelligence, including gluten-but-not-wheat for barley bread and no inference from the internally corrupted Chicken Tibsi description.";
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/replacement-ambassador-restaurant-washington-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "replacement-ambassador-restaurant-washington-dc",
      verifiedSnapshot,
      ambassadorRepairNote,
    );
    verifiedAmbassador.brandKey = "ambassadorwashington";
    verifiedAmbassador.domain = "ambassadorwashington.com";
    verifiedAmbassador.locationId = "washington-dc";
    verifiedAmbassador.displayAddress = "1907 9th St NW, Washington, DC 20001";
    verifiedAmbassador.guideUrl = "https://ambassadorwashington.com/menu/";
    verifiedAmbassador.guideLabel = "Current menu and reviewed menu sources";
    verifiedAmbassador.sourceFamily = "generic-website";
    verifiedAmbassador.parserProfile = "generic-website";
    verifiedAmbassador.sourceProfile = "generic-website:generic-website";
    verifiedAmbassador.sourceUrls = [
      "https://ambassadorwashington.com/",
      "https://ambassadorwashington.com/menu/",
      "https://www.ubereats.com/store/ambassador-eritrean-%26-ethiopian-restaurant/CBbWOUs_SZOy4_p_DciOwg",
      "https://www.doordash.com/store/29173059?pickup=true&src=yp",
      "https://www.restaurantji.com/dc/washington/ambassador-restaurant-/",
      "https://www.allmenus.com/dc/washington/352924-ambassador-restaurant-bar/menu/",
    ];
    verifiedAmbassador.updated = "2026-07";
    verifiedAmbassador.lastKnownGoodAt = "2026-07-15T02:00:55.103Z";
    verifiedAmbassador.sourceUpdatedAt = "2026-07-15T02:00:55.103Z";
    verifiedAmbassador.sourceStatus = {
      ...(verifiedAmbassador.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:primary-menu:https://ambassadorwashington.com/menu/",
          "ordering:restaurant-linked-delivery-catalog:https://www.ubereats.com/store/ambassador-eritrean-%26-ethiopian-restaurant/CBbWOUs_SZOy4_p_DciOwg",
          "ordering:current-store-shell:https://www.doordash.com/store/29173059?pickup=true&src=yp",
          "menu:reviewed-current-menu-images:https://www.restaurantji.com/dc/washington/ambassador-restaurant-/",
          "menu:corroborative-third-party-catalog:https://www.allmenus.com/dc/washington/352924-ambassador-restaurant-bar/menu/",
        ],
        configuredUrlWarnings: [
          "official-menu-is-seven-row-guest-favorites-surface",
          "restaurant-linked-uber-channel-closed-2026-05-05",
          "doordash-store-shell-does-not-expose-item-menu",
          "no-restaurant-issued-allergen-disclosure",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 12,
      ok: 5,
      failed: 2,
      total: 7,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "start-with-shareable-choices", kind: "marketing-copy", name: "Start with shareable choices", reasons: ["planning-copy-not-menu-item"] },
        { id: "use-ordering-as-a-fallback", kind: "navigation", name: "Use ordering as a fallback", reasons: ["ordering-guidance-not-menu-item"] },
        { id: "call-us-now", kind: "navigation", name: "Call Us Now", reasons: ["call-to-action"] },
        { id: "current-listed-hours", kind: "location-metadata", name: "Current listed hours", reasons: ["hours-row"] },
        { id: "restaurant", kind: "source-note", name: "Restaurant", reasons: ["generic-entity-label"] },
        { id: "check-current-availability", kind: "marketing-copy", name: "Check current availability", reasons: ["availability-guidance"] },
        { id: "plan-around-service-options", kind: "marketing-copy", name: "Plan around service options", reasons: ["service-guidance"] },
        { id: "start-with-menu-highlights", kind: "marketing-copy", name: "Start with menu highlights", reasons: ["summary-card-not-formulation"] },
        { id: "48-star", kind: "review-metadata", name: "4.8 star", reasons: ["rating-row"] },
        { id: "find-us-on-9th-street-nw", kind: "location-metadata", name: "Find us on 9th Street NW", reasons: ["address-row"] },
        { id: "options", kind: "source-note", name: "Options", reasons: ["service-options-label"] },
        { id: "plan-dishes-that-travel-well", kind: "marketing-copy", name: "Plan dishes that travel well", reasons: ["takeout-guidance"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 0,
      reviewedMenuQualityRepairs: [
        ...((verifiedAmbassador.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Final generated repair: removed rows rejected by the shared menu-item classifier\.|Verified repair: replaced the 19-row generic crawl/.test(String(repair.note ?? ""))
        )),
        { replacedRows: 26, note: ambassadorRepairNote },
      ],
    };
  }

  const verifiedAmelieDc = restaurant("replacement-amelie-dc-bistro-and-wine-bar-washington-dc");
  if (
    verifiedAmelieDc &&
    (
      verifiedAmelieDc.displayAddress !== "1315 14th St NW, Washington, DC 20005" ||
      verifiedAmelieDc.guideUrl !== "https://www.ameliedc.com/" ||
      (verifiedAmelieDc.items ?? []).length !== 43 ||
      new Set((verifiedAmelieDc.items ?? []).map((menuItem) => menuItem.category)).size !== 7 ||
      (verifiedAmelieDc.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 35 ||
      (verifiedAmelieDc.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 8 ||
      (verifiedAmelieDc.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      (verifiedAmelieDc.items ?? []).some((menuItem) => (menuItem.mayContain ?? []).length > 0) ||
      (verifiedAmelieDc.items ?? []).some((menuItem) =>
        ["Crispy Octopus", "Maryland Rockfish", "Local Roasted Chicken"].includes(menuItem.name)
      ) ||
      ![
        "Plateau Apéro",
        "Maryland Seared Monkfish",
        "Roasted Lemon Chicken",
        "Extra Breadbasket",
        "Banana Crème Brûlée",
        "Vanilla Crème Brûlée",
      ].every((name) => (verifiedAmelieDc.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmelieDc.items ?? []).some((menuItem) =>
        menuItem.name === "Amélie Burger" &&
        menuItem.allergens?.length === 4 &&
        ["milk", "egg", "wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAmelieDc.items ?? []).some((menuItem) =>
        menuItem.name === "Grilled Octopus" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens[0] === "shellfish"
      ) ||
      !(verifiedAmelieDc.items ?? []).some((menuItem) =>
        menuItem.name === "Maryland Seared Monkfish" &&
        menuItem.allergens?.length === 1 &&
        menuItem.allergens[0] === "fish"
      ) ||
      !(verifiedAmelieDc.items ?? []).some((menuItem) =>
        menuItem.name === "Soup du Jour" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0 &&
        (menuItem.inferredAllergenSignals ?? []).length === 0
      )
    )
  ) {
    const amelieDcRepairNote =
      "Verified repair: reconciled all 48 frozen Amélie rows against 99 current food presentations across the restaurant-issued lunch, dinner, brunch, and happy-hour menus; consolidated them into 43 current formulations and seven stable categories; removed the stale Crispy Octopus and Maryland Rockfish rows; restored six omitted current formulations; replaced Local Roasted Chicken with the current Roasted Lemon Chicken; corrected 21 frozen allergen results, comprising 20 underreported formulations and the unsupported dairy signal on Grilled Octopus; retained 35 direct restaurant-menu ingredient or unambiguous formulation signals and eight unavailable rows; and did not convert the restaurant's server-alert instruction into item-level cross-contact or may-contain claims.";
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/replacement-amelie-dc-bistro-and-wine-bar-washington-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "replacement-amelie-dc-bistro-and-wine-bar-washington-dc",
      verifiedSnapshot,
      amelieDcRepairNote,
    );
    verifiedAmelieDc.brandKey = "ameliedc";
    verifiedAmelieDc.domain = "ameliedc.com";
    verifiedAmelieDc.locationId = "washington-dc";
    verifiedAmelieDc.displayAddress = "1315 14th St NW, Washington, DC 20005";
    verifiedAmelieDc.guideUrl = "https://www.ameliedc.com/";
    verifiedAmelieDc.guideLabel = "Current restaurant-issued menus";
    verifiedAmelieDc.sourceFamily = "generic-website";
    verifiedAmelieDc.parserProfile = "generic-website";
    verifiedAmelieDc.sourceProfile = "generic-website:generic-website";
    verifiedAmelieDc.sourceUrls = [
      "https://www.ameliedc.com/",
      "https://www.ameliedc.com/lunch",
      "https://www.ameliedc.com/dinner",
      "https://www.ameliedc.com/brunch",
      "https://www.ameliedc.com/happy-hour",
    ];
    verifiedAmelieDc.updated = "2026-07";
    verifiedAmelieDc.lastKnownGoodAt = "2026-07-15T02:08:13.033Z";
    verifiedAmelieDc.sourceUpdatedAt = "2026-07-15T02:08:13.033Z";
    verifiedAmelieDc.sourceStatus = {
      ...(verifiedAmelieDc.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-home:https://www.ameliedc.com/",
          "menu:official-lunch:https://www.ameliedc.com/lunch",
          "menu:official-dinner:https://www.ameliedc.com/dinner",
          "menu:official-brunch:https://www.ameliedc.com/brunch",
          "menu:official-happy-hour:https://www.ameliedc.com/happy-hour",
        ],
        configuredUrlWarnings: [
          "server-allergy-alert-is-not-item-level-disclosure",
          "menu-descriptions-are-not-a-complete-allergen-matrix",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 2,
      ok: 5,
      failed: 0,
      total: 5,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "crispy-octopus", kind: "stale-menu-item", name: "Crispy Octopus", reasons: ["absent-from-current-menus"] },
        { id: "maryland-rockfish", kind: "stale-menu-item", name: "Maryland Rockfish", reasons: ["replaced-by-maryland-seared-monkfish"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 56,
      reviewedMenuQualityRepairs: [
        ...((verifiedAmelieDc.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Final generated repair: removed rows rejected by the shared menu-item classifier\.|Verified repair: reconciled all 48 frozen Amélie rows/.test(String(repair.note ?? ""))
        )),
        { replacedRows: 43, note: amelieDcRepairNote },
      ],
    };
  }

  const verifiedAmoos = restaurant("amoo-s-restaurant-mclean-va-dc-metro");
  if (
    verifiedAmoos &&
    (
      verifiedAmoos.displayAddress !== "6271 Old Dominion Dr, McLean, VA 22101" ||
      verifiedAmoos.guideUrl !== "https://amoosrestaurant.com/" ||
      (verifiedAmoos.items ?? []).length !== 71 ||
      new Set((verifiedAmoos.items ?? []).map((menuItem) => menuItem.category)).size !== 13 ||
      [...new Set((verifiedAmoos.items ?? []).map((menuItem) => menuItem.category))].at(-1) !== "Beverages" ||
      (verifiedAmoos.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 2 ||
      (verifiedAmoos.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 69 ||
      (verifiedAmoos.items ?? []).some((menuItem) => menuItem.variantGroup) ||
      (verifiedAmoos.items ?? []).some((menuItem) => (menuItem.mayContain ?? []).length > 0) ||
      (verifiedAmoos.items ?? []).some((menuItem) =>
        [
          "Bacon Cheese Fries",
          "Cheese Fries",
          "Hand-Cut Fries",
          "Steak Fries",
          "The Bronx Chop",
          "The Brooklyn Chop",
          "The Coney Island Chop",
          "The Downtown Chop",
          "The New York Chop",
          "The NoHo Chop",
          "The Queens Chop",
          "The SoHo Chop",
          "The Steak Chop",
          "The Tribeca Chop",
          "The Uptown Chop",
          "Waffle Fries",
        ].includes(menuItem.name)
      ) ||
      ![
        "Family Platter for 2",
        "Persian Saffron Ice Cream",
        "Fesenjan",
        "Pesto Chicken Kabob",
        "Branzino Fish",
        "Vegan Koobideh",
        "Doogh Yogurt Drink",
      ].every((name) => (verifiedAmoos.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmoos.items ?? []).some((menuItem) =>
        menuItem.name === "Family Platter for 2" &&
        menuItem.allergenSourceType === "official-ingredients" &&
        menuItem.allergens?.length === 2 &&
        ["wheat", "gluten"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAmoos.items ?? []).some((menuItem) =>
        menuItem.name === "Persian Saffron Ice Cream" &&
        menuItem.allergenSourceType === "official-ingredients" &&
        menuItem.allergens?.length === 2 &&
        ["milk", "tree-nut"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAmoos.items ?? []).some((menuItem) =>
        menuItem.name === "Pesto Chicken Kabob" &&
        menuItem.allergenSourceType === "unavailable" &&
        ["milk", "tree-nut"].every((allergen) =>
          menuItem.inferredAllergenSignals?.some((signal) => signal.id === allergen)
        )
      ) ||
      !(verifiedAmoos.items ?? []).some((menuItem) =>
        menuItem.name === "Extra Chimichurri Sauce" &&
        (menuItem.inferredAllergenSignals ?? []).length === 0
      ) ||
      !(verifiedAmoos.items ?? []).some((menuItem) =>
        menuItem.name === "Soupe Jo Kurdi" &&
        menuItem.inferredAllergenSignals?.length === 2 &&
        menuItem.inferredAllergenSignals.some((signal) => signal.id === "gluten" && signal.c === "high") &&
        menuItem.inferredAllergenSignals.some((signal) => signal.id === "wheat" && signal.c === "medium")
      )
    )
  ) {
    const amoosRepairNote =
      "Verified repair: removed 16 Chopped NYC Ann Arbor rows that entered Amoo's through an unrelated order.online link on the restaurant's current homepage; retained the three real frozen Amoo's formulations; restored 68 omitted current formulations from the current exact-address delivery catalog; produced 71 current formulations across 13 categories with beverages last; corroborated six formulations against the restaurant-issued homepage; limited official positive allergen evidence to the current first-party Family Platter bread and Persian Saffron Ice Cream cream/pistachio wording; left 69 formulations officially unavailable; kept third-party description clues only as Ingredient Intelligence; corrected the chimichurri suggested-bread and either-or vinegar inference and the barley-not-wheat semantics for Soupe Jo Kurdi; and invented no item-level cross-contact claims.";
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/amoo-s-restaurant-mclean-va-dc-metro/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "amoo-s-restaurant-mclean-va-dc-metro",
      verifiedSnapshot,
      amoosRepairNote,
    );
    verifiedAmoos.brandKey = "amoosrestaurant";
    verifiedAmoos.domain = "amoosrestaurant.com";
    verifiedAmoos.locationId = "mclean-va";
    verifiedAmoos.displayAddress = "6271 Old Dominion Dr, McLean, VA 22101";
    verifiedAmoos.guideUrl = "https://amoosrestaurant.com/";
    verifiedAmoos.guideLabel = "Current official features and reviewed exact-address menu";
    verifiedAmoos.sourceFamily = "generic-website";
    verifiedAmoos.parserProfile = "generic-website";
    verifiedAmoos.sourceProfile = "generic-website:generic-website";
    verifiedAmoos.sourceUrls = [
      "https://amoosrestaurant.com/",
      "https://www.orderspoon.com/delivery/virginia/mclean/amoo-s-restaurant?source=mealme",
      "https://www.ubereats.com/store/amoos-restaurant/57pS1OArXBKuwUyqRl9Seg",
      "https://www.restaurantji.com/va/mclean/amoos-restaurant-/",
      "https://amoosrestaurant.weebly.com/uploads/1/2/3/2/123203214/dine_in_menu_for_website-2_2.pdf",
      "https://amoosrestaurant.weebly.com/uploads/1/2/3/2/123203214/take_out_menu.pdf",
    ];
    verifiedAmoos.updated = "2026-07";
    verifiedAmoos.lastKnownGoodAt = "2026-07-15T02:27:23.170Z";
    verifiedAmoos.sourceUpdatedAt = "2026-07-15T02:27:23.170Z";
    verifiedAmoos.sourceStatus = {
      ...(verifiedAmoos.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity-and-featured-menu:restaurant-home:https://amoosrestaurant.com/",
          "menu:reviewed-current-exact-address-catalog:https://www.orderspoon.com/delivery/virginia/mclean/amoo-s-restaurant?source=mealme",
          "menu:current-exact-address-corroboration:https://www.ubereats.com/store/amoos-restaurant/57pS1OArXBKuwUyqRl9Seg",
          "menu:current-identity-and-menu-images:https://www.restaurantji.com/va/mclean/amoos-restaurant-/",
          "history:legacy-restaurant-issued-dine-in-menu:https://amoosrestaurant.weebly.com/uploads/1/2/3/2/123203214/dine_in_menu_for_website-2_2.pdf",
          "history:legacy-restaurant-issued-takeout-menu:https://amoosrestaurant.weebly.com/uploads/1/2/3/2/123203214/take_out_menu.pdf",
        ],
        configuredUrlWarnings: [
          "official-full-menu-download-buttons-have-no-links",
          "official-order-link-points-to-unrelated-chopped-nyc-ann-arbor-store",
          "complete-current-catalog-is-third-party-and-not-official-allergen-evidence",
          "legacy-restaurant-issued-pdfs-are-not-treated-as-current",
          "no-current-restaurant-issued-allergen-matrix-or-cross-contact-disclosure",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 16,
      ok: 7,
      failed: 8,
      total: 15,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "bacon-cheese-fries", kind: "location-mismatch", name: "Bacon Cheese Fries", reasons: ["chopped-nyc-ann-arbor-source"] },
        { id: "cheese-fries", kind: "location-mismatch", name: "Cheese Fries", reasons: ["chopped-nyc-ann-arbor-source"] },
        { id: "hand-cut-fries", kind: "location-mismatch", name: "Hand-Cut Fries", reasons: ["chopped-nyc-ann-arbor-source"] },
        { id: "the-bronx-chop", kind: "location-mismatch", name: "The Bronx Chop", reasons: ["chopped-nyc-ann-arbor-source"] },
        { id: "the-new-york-chop", kind: "location-mismatch", name: "The New York Chop", reasons: ["chopped-nyc-ann-arbor-source"] },
        { id: "the-uptown-chop", kind: "location-mismatch", name: "The Uptown Chop", reasons: ["chopped-nyc-ann-arbor-source"] },
        { id: "waffle-fries", kind: "location-mismatch", name: "Waffle Fries", reasons: ["chopped-nyc-ann-arbor-source"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 0,
      reviewedMenuQualityRepairs: [
        ...((verifiedAmoos.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Final generated repair: removed rows rejected by the shared menu-item classifier\.|Verified repair: removed 16 Chopped NYC Ann Arbor rows/.test(String(repair.note ?? ""))
        )),
        { replacedRows: 71, note: amoosRepairNote },
      ],
    };
  }

  const verifiedAmparo = restaurant("amparo-fondita-dc");
  if (
    verifiedAmparo &&
    (
      verifiedAmparo.displayAddress !== "2002 P St NW, Washington, DC 20036" ||
      verifiedAmparo.guideUrl !== "https://amparofondita.com/" ||
      verifiedAmparo.sourceStatus?.ok !== 18 ||
      verifiedAmparo.sourceStatus?.failed !== 2 ||
      verifiedAmparo.sourceStatus?.total !== 20 ||
      (verifiedAmparo.items ?? []).length !== 88 ||
      new Set((verifiedAmparo.items ?? []).map((menuItem) => menuItem.category)).size !== 13 ||
      JSON.stringify([...new Set((verifiedAmparo.items ?? []).map((menuItem) => menuItem.category))].slice(-3)) !==
        JSON.stringify(["Bebidas", "Sake", "Cocktails"]) ||
      (verifiedAmparo.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 6 ||
      (verifiedAmparo.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 82 ||
      (verifiedAmparo.items ?? []).some((menuItem) => menuItem.allergenSourceType === "official-allergen-menu") ||
      (verifiedAmparo.items ?? []).some((menuItem) => (menuItem.mayContain ?? []).length > 0) ||
      (verifiedAmparo.items ?? []).some((menuItem) =>
        ["Aguachile de Naranja", "Palmiitos con Chayote", "Halibut en Mole Coloradito"].includes(menuItem.name)
      ) ||
      ![
        "Tostaditas de Atún",
        "Naranjas de Invierno",
        "Sopesitos",
        "Hongos con Shishito",
        "Camarones en Mole Coloradito",
        "Tres Leches",
        "Chile Relleno",
        "Quesadilla de Maiz",
        "Horchata",
      ].every((name) => (verifiedAmparo.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmparo.items ?? []).some((menuItem) =>
        menuItem.name === "Tres Leches" &&
        menuItem.allergenSourceType === "official-ingredients" &&
        ["egg", "gluten", "milk", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAmparo.items ?? []).some((menuItem) =>
        menuItem.name === "Chile Relleno" &&
        menuItem.allergenSourceType === "unavailable" &&
        menuItem.inferredAllergenSignals?.length === 2 &&
        ["egg", "milk"].every((allergen) => menuItem.inferredAllergenSignals?.some((signal) => signal.id === allergen))
      ) ||
      !(verifiedAmparo.items ?? []).some((menuItem) =>
        menuItem.name === "Arrachera en Mole Coloradito" &&
        (menuItem.inferredAllergenSignals ?? []).length === 0
      ) ||
      !(verifiedAmparo.items ?? []).some((menuItem) =>
        menuItem.name === "Horchata" &&
        (menuItem.inferredAllergenSignals ?? []).length === 0
      )
    )
  ) {
    const amparoRepairNote =
      "Verified repair: quarantined the older six-course tasting PDF that still sits behind the current page's download link but visually contradicts the current on-page winter tasting menu; removed the stale Aguachile de Naranja, Palmiitos con Chayote, and Halibut en Mole Coloradito rows; retained Sopesitos, Hongos con Shishito, and Tres Leches with corrected official-ingredients semantics instead of the false official-allergen-menu label; restored 85 omitted current formulations; consolidated all 91 current linked Toast presentations and six current tasting-menu presentations into 88 formulations across 13 categories with beverages last; limited restaurant-issued positive allergen evidence to six current tasting formulations; left 82 formulations officially unavailable; kept linked-vendor descriptions only as Ingredient Intelligence; corrected Niman Ranch, egg-batter, oat-milk, panko, quesillo, and Spanish seafood inference edge cases; and invented no item-level cross-contact claims.";
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/amparo-fondita-dc/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(
      "amparo-fondita-dc",
      verifiedSnapshot,
      amparoRepairNote,
    );
    verifiedAmparo.brandKey = "amparofondita";
    verifiedAmparo.domain = "amparofondita.com";
    verifiedAmparo.locationId = "washington";
    verifiedAmparo.displayAddress = "2002 P St NW, Washington, DC 20036";
    verifiedAmparo.guideUrl = "https://amparofondita.com/";
    verifiedAmparo.guideLabel = "Current on-page tasting menu and linked ordering catalog";
    verifiedAmparo.sourceFamily = "generic-website";
    verifiedAmparo.parserProfile = "generic-website";
    verifiedAmparo.sourceProfile = "generic-website:generic-website";
    verifiedAmparo.sourceUrls = [
      "https://amparofondita.com/",
      "https://amparofondita.com/tasting-menu",
      "https://images.squarespace-cdn.com/content/v1/5b18899f70e802e523553734/85b6b732-c126-47fb-98f8-f3a7496660c5/Tasting+Menu+26%27.png",
      "https://order.toasttab.com/online/amparo-fondita-2002-p-street-northwest",
    ];
    verifiedAmparo.updated = "2026-07";
    verifiedAmparo.lastKnownGoodAt = "2026-07-15T02:41:10.104Z";
    verifiedAmparo.sourceUpdatedAt = "2026-07-15T02:41:10.104Z";
    verifiedAmparo.sourceStatus = {
      ...(verifiedAmparo.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-home:https://amparofondita.com/",
          "menu:current-restaurant-issued-tasting-page:https://amparofondita.com/tasting-menu",
          "menu:current-restaurant-issued-tasting-image:https://images.squarespace-cdn.com/content/v1/5b18899f70e802e523553734/85b6b732-c126-47fb-98f8-f3a7496660c5/Tasting+Menu+26%27.png",
          "menu:current-restaurant-linked-ordering-catalog:https://order.toasttab.com/online/amparo-fondita-2002-p-street-northwest",
          "history:contradictory-old-tasting-pdf:https://amparofondita.com/s/Single-Tasting-menu-Template-Dinner-Menu.pdf",
          "history:unlinked-conflicting-sample-image-menu:https://amparofondita.com/menu",
        ],
        configuredUrlWarnings: [
          "current-tasting-page-download-links-an-older-contradictory-pdf",
          "unlinked-sample-image-menu-conflicts-with-current-operational-catalog",
          "linked-toast-descriptions-are-not-promoted-to-official-allergen-evidence",
          "three-unattributed-description-blocks-were-not-invented-as-menu-items",
          "no-current-restaurant-issued-allergen-matrix-or-cross-contact-disclosure",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 3,
      ok: 18,
      failed: 2,
      total: 20,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "aguachile-de-naranja", kind: "stale-menu-item", name: "Aguachile de Naranja", reasons: ["contradictory-old-tasting-pdf"] },
        { id: "palmiitos-con-chayote", kind: "stale-menu-item", name: "Palmiitos con Chayote", reasons: ["contradictory-old-tasting-pdf"] },
        { id: "halibut-en-mole-coloradito", kind: "stale-menu-item", name: "Halibut en Mole Coloradito", reasons: ["contradictory-old-tasting-pdf"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 9,
      reviewedMenuQualityRepairs: [
        ...((verifiedAmparo.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Final generated repair: removed rows rejected by the shared menu-item classifier\.|Verified repair: quarantined the older six-course tasting PDF/.test(String(repair.note ?? ""))
        )),
        { replacedRows: 88, note: amparoRepairNote },
      ],
    };
  }

  for (const verifiedAmphoraId of [
    "osm-amphora-diner-deluxe-152763392",
    "amphoras-diner-deluxe-herndon-va-dc-metro",
  ]) {
    const verifiedAmphora = restaurant(verifiedAmphoraId);
    if (
    verifiedAmphora &&
    (
      verifiedAmphora.name !== "Amphora’s Diner Deluxe" ||
      verifiedAmphora.city !== "Herndon, VA" ||
      verifiedAmphora.locationId !== "herndon-va" ||
      verifiedAmphora.displayAddress !== "1151 Elden St, Herndon, VA 20170" ||
      verifiedAmphora.guideUrl !== "https://amphoragroup.com/amphoras-diner-deluxe/" ||
      (verifiedAmphora.items ?? []).length !== 300 ||
      new Set((verifiedAmphora.items ?? []).map((menuItem) => menuItem.category)).size !== 28 ||
      JSON.stringify([...new Set((verifiedAmphora.items ?? []).map((menuItem) => menuItem.category))].slice(-3)) !==
        JSON.stringify(["Shakes and Sundaes", "Breakfast Beverages", "Beverages"]) ||
      (verifiedAmphora.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 174 ||
      (verifiedAmphora.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 126 ||
      (verifiedAmphora.items ?? []).some((menuItem) => menuItem.allergenSourceType === "official-allergen-menu") ||
      (verifiedAmphora.items ?? []).some((menuItem) => (menuItem.mayContain ?? []).length > 0) ||
      (verifiedAmphora.items ?? []).some((menuItem) => [
        "ADDITIONAL TOPPINGS",
        "Amphora Classics",
        "Amphora’s Diner Deluxe",
        "Bagel with Cream Cheese",
        "Beef Tenderloin Medallions Sautéed with Mushrooms",
        "Cheese Vegetables Meats etc",
        "Coleslaw & Pickle",
        "Cream Sauce",
        "Eggs & Omelets",
        "Fresh Catch",
        "GROUND LAMB KEBABS",
        "Heavenly Hollandaise",
        "Honey Drizzle",
        "Sandwiches & Favorites",
        "SPECIALTY PASTA",
        "Substitute Cholesterol Free Egg Beaters or Egg Whites",
      ].includes(menuItem.name)) ||
      ![
        "Beef Burgundy",
        "Amphora’s Pick 2",
        "Baklava Pancakes",
        "Create Your Own Omelet",
        "Breakfast Panini",
        "Amphora's Greek Nacho Platter",
        "Golden Fried Calamari",
        "Build Your Favorite Burger",
        "Carrot Cake",
        "Classic Banana Split",
        "Candy Sundae",
        "Irish Coffee",
        "Bottle Spring Water",
      ].every((name) => (verifiedAmphora.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAmphora.items ?? []).some((menuItem) =>
        menuItem.name === "Greek Salad" &&
        menuItem.allergenSourceType === "official-ingredients" &&
        JSON.stringify([...(menuItem.allergens ?? [])].sort()) === JSON.stringify(["fish", "milk"])
      ) ||
      !(verifiedAmphora.items ?? []).some((menuItem) =>
        menuItem.name === "Create Your Own Omelet" &&
        menuItem.isConfigurable === true &&
        JSON.stringify(menuItem.allergens) === JSON.stringify(["egg"])
      ) ||
      !(verifiedAmphora.items ?? []).some((menuItem) =>
        menuItem.name === "Truffle Cake Balls ~ Nut Collection" &&
        JSON.stringify(menuItem.allergens) === JSON.stringify(["peanut"])
      )
    )
  ) {
    const amphoraRepairNote =
      "Verified repair: replaced the corrupted Amphora Diner Deluxe extraction with the union of the current 33-page restaurant-issued menu and the live exact-address FastOrder catalog; removed headings, modifier rows, captions, promotional cards, and description fragments; consolidated 320 retained presentations into 300 formulations across 28 categories with beverage sections last; preserved 24 restaurant-PDF items that are not currently orderable online, including Amphora’s Pick 2; corrected the Herndon identity and address; limited official ingredient evidence to 174 formulations with direct positive terms; left 126 formulations officially unavailable; ignored the repeated raw-food advisory as allergen and cross-contact evidence; preserved option groups without treating optional cheese, fish, or other modifiers as fixed ingredients; and invented no negative or may-contain claims.";
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/osm-amphora-diner-deluxe-152763392/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot(verifiedAmphoraId, verifiedSnapshot, amphoraRepairNote);
    verifiedAmphora.brandKey = "amphoragroup";
    verifiedAmphora.name = "Amphora’s Diner Deluxe";
    verifiedAmphora.category = "american";
    verifiedAmphora.city = "Herndon, VA";
    verifiedAmphora.domain = "amphoragroup.com";
    verifiedAmphora.locationId = "herndon-va";
    verifiedAmphora.displayAddress = "1151 Elden St, Herndon, VA 20170";
    verifiedAmphora.guideUrl = "https://amphoragroup.com/amphoras-diner-deluxe/";
    verifiedAmphora.guideLabel = "Current full menu and exact-address ordering catalog";
    verifiedAmphora.sourceFamily = "generic-website";
    verifiedAmphora.parserProfile = "generic-website";
    verifiedAmphora.sourceProfile = "generic-website:generic-website";
    verifiedAmphora.sourceUrls = [
      "https://amphoragroup.com/amphoras-diner-deluxe/",
      "https://amphoragroup.com/wp-content/uploads/2025/11/DINER-DX-MENU-2025.pdf",
      "https://www.fastordernow.com/order/menu/amphoradeluxe",
    ];
    verifiedAmphora.updated = "2026-07";
    verifiedAmphora.lastKnownGoodAt = "2026-07-15T03:05:11.034Z";
    verifiedAmphora.sourceUpdatedAt = "2026-07-15T03:05:11.034Z";
    verifiedAmphora.sourceStatus = {
      ...(verifiedAmphora.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-home:https://amphoragroup.com/amphoras-diner-deluxe/",
          "menu:current-restaurant-issued-full-menu:https://amphoragroup.com/wp-content/uploads/2025/11/DINER-DX-MENU-2025.pdf",
          "menu:current-restaurant-linked-exact-address-ordering-catalog:https://www.fastordernow.com/order/menu/amphoradeluxe",
        ],
        configuredUrlWarnings: [
          "current-full-menu-is-not-an-allergen-matrix",
          "repeated-raw-food-advisory-is-not-item-allergen-or-cross-contact-evidence",
          "linked-fastorder-descriptions-are-not-promoted-to-restaurant-issued-allergen-claims",
          "restaurant-pdf-only-items-remain-current-even-when-not-orderable-online",
          "hidden-2023-and-linked-2021-pdfs-are-retained-only-as-source-history",
          "configurator-options-are-not-treated-as-fixed-formulation-ingredients",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 16,
      ok: 3,
      failed: 0,
      total: 3,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "additional-toppings", kind: "modifier-heading", name: "ADDITIONAL TOPPINGS", reasons: ["pdf-option-heading"] },
        { id: "amphora-classics", kind: "section-heading", name: "Amphora Classics", reasons: ["pdf-section-heading"] },
        { id: "amphoras-diner-deluxe", kind: "promo", name: "Amphora’s Diner Deluxe", reasons: ["restaurant-identity-card"] },
        { id: "bagel-with-cream-cheese", kind: "modifier", name: "Bagel with Cream Cheese", reasons: ["breakfast-substitution"] },
        { id: "beef-tenderloin-medallions-sauteed-with-mushrooms", kind: "description-fragment", name: "Beef Tenderloin Medallions Sautéed with Mushrooms", reasons: ["steak-dianne-description-fragment"] },
        { id: "cheese-vegetables-meats-etc", kind: "section-label", name: "Cheese Vegetables Meats etc", reasons: ["omelet-option-columns"] },
        { id: "coleslaw-and-pickle", kind: "shared-rule", name: "Coleslaw & Pickle", reasons: ["sandwich-accompaniment-rule"] },
        { id: "cream-sauce", kind: "description-fragment", name: "Cream Sauce", reasons: ["orphan-description-fragment"] },
        { id: "eggs-and-omelets", kind: "section-heading", name: "Eggs & Omelets", reasons: ["pdf-section-heading"] },
        { id: "fresh-catch", kind: "section-heading", name: "Fresh Catch", reasons: ["pdf-section-heading"] },
        { id: "ground-lamb-kebabs", kind: "image-caption", name: "GROUND LAMB KEBABS", reasons: ["duplicate-photo-caption"] },
        { id: "heavenly-hollandaise", kind: "section-heading", name: "Heavenly Hollandaise", reasons: ["pdf-section-heading"] },
        { id: "honey-drizzle", kind: "description-fragment", name: "Honey Drizzle", reasons: ["baklava-pancakes-description-fragment"] },
        { id: "sandwiches-and-favorites", kind: "section-heading", name: "Sandwiches & Favorites", reasons: ["pdf-section-heading"] },
        { id: "specialty-pasta", kind: "section-heading", name: "SPECIALTY PASTA", reasons: ["pdf-section-heading"] },
        { id: "substitute-cholesterol-free-egg-beaters-or-egg-whites", kind: "modifier", name: "Substitute Cholesterol Free Egg Beaters or Egg Whites", reasons: ["breakfast-substitution"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 20,
      reviewedMenuQualityRepairs: [
        ...((verifiedAmphora.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Final generated repair: removed rows rejected by the shared menu-item classifier\.|Verified repair: replaced the corrupted(?: 100-row)? Amphora Diner Deluxe/.test(String(repair.note ?? ""))
        )),
        { replacedRows: 300, note: amphoraRepairNote },
      ],
    };
    }
  }

  const verifiedAmuse = restaurant("osm-amuse-3396064825");
  if (
    verifiedAmuse &&
    (
      (verifiedAmuse.items ?? []).length !== 0 ||
      verifiedAmuse.domain !== "marriott.com" ||
      verifiedAmuse.guideUrl !==
        "https://www.marriott.com/en-us/hotels/wasrl-le-meridien-arlington/dining/" ||
      verifiedAmuse.coverageStatus !== "blocked" ||
      verifiedAmuse.launchQualityStatus !== "quarantined" ||
      verifiedAmuse.launchRemediationBucket !== "no-menu-found" ||
      verifiedAmuse.sourceStatus?.locationStatus !==
        "temporarily_closed_for_renovation"
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-amuse-3396064825/corrected-menu.json",
        "utf8",
      ),
    );
    const amuseRepairNote =
      "Verified repair: removed all 11 cross-location and page-artifact rows attributed to Amuse; Marriott's current Le Méridien Arlington dining page states that its restaurant and bar are temporarily closed for renovation, the retired Marriott Amuse detail route publishes no menu URL, and no current restaurant-issued allergen disclosure exists. The record is quarantined with zero current menu items until first-party reopening evidence and a current menu are published.";
    replaceVerifiedMixedMenuSnapshot(
      "osm-amuse-3396064825",
      verifiedSnapshot,
      amuseRepairNote,
    );
    verifiedAmuse.brandKey = "marriott";
    verifiedAmuse.domain = "marriott.com";
    verifiedAmuse.guideUrl =
      "https://www.marriott.com/en-us/hotels/wasrl-le-meridien-arlington/dining/";
    verifiedAmuse.guideLabel = "Current first-party closure notice";
    verifiedAmuse.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAmuse.updated = "2026-07";
    verifiedAmuse.lastKnownGoodAt = null;
    verifiedAmuse.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAmuse.coveragePercent = 0;
    verifiedAmuse.coverageStatus = "blocked";
    verifiedAmuse.launchQualityStatus = "quarantined";
    verifiedAmuse.launchRemediationBucket = "no-menu-found";
    verifiedAmuse.sourceStatus = {
      ...(verifiedAmuse.sourceStatus ?? {}),
      locationStatus: verifiedSnapshot.locationStatus,
      temporarilyClosed: true,
      closureReason: "Marriott says the hotel bar and restaurant are temporarily closed for renovation.",
      configuredUrlAudit: {
        configuredUrlRoles: [
          `identity-and-closure:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `identity:retired-restaurant-issued-detail:${verifiedSnapshot.sourceUrls[1]}`,
          `identity:third-party-district-directory:${verifiedSnapshot.sourceUrls[2]}`,
        ],
        configuredUrlWarnings: [
          "restaurant-temporarily-closed-for-renovation",
          "legacy-hours-conflict-with-current-closure-banner",
          "retired-marriott-detail-route-has-no-menu-url",
          "rosslyn-directory-neighbor-pages-must-not-be-combined-as-one-menu",
          "no-current-restaurant-issued-allergen-disclosure",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 11,
      ok: 2,
      failed: 1,
      total: 3,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "apple-crisp-bowl", kind: "location-mismatch", name: "apple crisp bowl", reasons: ["district-wide-feature-row"] },
        { id: "cajun-shrimp-salad", kind: "location-mismatch", name: "Cajun shrimp salad", reasons: ["district-wide-feature-row"] },
        { id: "categories-bars-italian-pizza-lunch", kind: "artifact", name: "Categories Bars Italian Pizza Lunch", reasons: ["unrelated-directory-page-chrome"] },
        { id: "oh", kind: "artifact", name: "OH:", reasons: ["unrelated-interview-copy"] },
        { id: "pumpkin-spice-chai", kind: "location-mismatch", name: "pumpkin spice chai", reasons: ["district-wide-feature-row"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAmuse.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: removed all 11 cross-location/.test(String(repair.note ?? "")),
        )),
        { replacedRows: 0, note: amuseRepairNote },
      ],
    };
  }

  const verifiedAnafre = restaurant("anafre-dc");
  if (
    verifiedAnafre &&
    (
      (verifiedAnafre.items ?? []).length !== 100 ||
      new Set((verifiedAnafre.items ?? []).map((menuItem) => menuItem.category)).size !== 10 ||
      JSON.stringify([...new Set((verifiedAnafre.items ?? []).map((menuItem) => menuItem.category))].slice(-2)) !==
        JSON.stringify(["Sides", "Beverages"]) ||
      (verifiedAnafre.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 44 ||
      (verifiedAnafre.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 56 ||
      (verifiedAnafre.items ?? []).some((menuItem) => menuItem.name === "Chicken Sandwich") ||
      ![
        "The Classic",
        "Chile Relleno",
        "Calamari",
        "Hamburgers",
        "Seafood Nachos",
        "Shrimp & Choriozo Queso Fundido",
        "habanero hamburguesa",
        "Shrimp Alambre",
        "Grilled Steak Gringas",
        "Mandarina",
        "Tamarindo",
        "Toronja",
      ].every((name) => (verifiedAnafre.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAnafre.items ?? []).some((menuItem) =>
        menuItem.name === "Oysters al Carbon con Crab Meat" &&
        ["gluten", "milk", "shellfish", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAnafre.items ?? []).some((menuItem) =>
        menuItem.name === "Churrasco à la Carbon" &&
        menuItem.category === "Entrées" &&
        menuItem.allergenSourceType === "unavailable"
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/anafre-dc/corrected-menu.json",
        "utf8",
      ),
    );
    const anafreRepairNote =
      "Verified repair: reconciled 128 current restaurant-issued and restaurant-linked food and nonalcoholic presentations into 100 formulations across ten categories; removed the invented duplicate Chicken Sandwich; restored two omitted dine-in pizzas, four omitted happy-hour bites, three omitted first-party sodas, and the broader current Mealage ordering catalog; consolidated 28 exact, spelling, and same-formulation cross-surface variants; moved Churrasco from the malformed Pizza placement to Entrées using its steak-and-sides formulation and linked Platos Fuertes corroboration; corrected 41 frozen allergen results using only direct restaurant-issued ingredient or unambiguous formulation terms; retained 56 linked-vendor-only or description-insufficient formulations as allergen-unavailable; excluded alcohol-only sections; and kept Sides and Beverages last.";
    replaceVerifiedMixedMenuSnapshot("anafre-dc", verifiedSnapshot, anafreRepairNote);
    verifiedAnafre.guideUrl = "https://anafredc.com/menu";
    verifiedAnafre.guideLabel = "Current menu and linked ordering catalog";
    verifiedAnafre.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAnafre.updated = "2026-07";
    verifiedAnafre.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAnafre.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAnafre.coverageStatus = "complete";
    verifiedAnafre.launchQualityStatus = "published";
    verifiedAnafre.launchRemediationBucket = "none";
    verifiedAnafre.sourceStatus = {
      ...(verifiedAnafre.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:current-restaurant-issued-full-menu:https://anafredc.com/menu",
          "menu:current-restaurant-issued-happy-hour-and-nonalcoholic-menu:https://anafredc.com/",
          "menu:current-restaurant-linked-ordering-catalog:https://www.mealage.com/2foodmenu8.jsp?id=9079",
        ],
        configuredUrlWarnings: [
          "restaurant-issued-menu-is-not-an-allergen-matrix",
          "no-current-cross-contact-disclosure",
          "linked-mealage-only-items-are-not-promoted-to-restaurant-issued-allergen-claims",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
          "official-page-churrasco-pizza-placement-is-corrected-by-formulation-and-ordering-category",
          "alcohol-only-sections-are-excluded",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 1,
      ok: 3,
      failed: 0,
      total: 3,
      nonFoodDocumentSuspected: false,
      presentationCount: verifiedSnapshot.presentationCount,
      officialMenuPresentationCount: verifiedSnapshot.officialMenuPresentationCount,
      officialHappyHourPresentationCount: verifiedSnapshot.officialHappyHourPresentationCount,
      officialBeveragePresentationCount: verifiedSnapshot.officialBeveragePresentationCount,
      linkedOrderingPresentationCount: verifiedSnapshot.linkedOrderingPresentationCount,
      quarantinedItemExamples: [
        { id: "chicken-sandwich", kind: "duplicate-artifact", name: "Chicken Sandwich", reasons: ["invented-alongside-official-chicken-sandwich-row"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 28,
      reviewedMenuQualityRepairs: [
        ...((verifiedAnafre.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: reconciled 128 current/.test(String(repair.note ?? "")),
        )),
        { replacedRows: 100, note: anafreRepairNote },
      ],
    };
  }

  const verifiedAnatolianBistro = restaurant("osm-anatolian-bistro-6230019077");
  if (
    verifiedAnatolianBistro &&
    (
      (verifiedAnatolianBistro.items ?? []).length !== 105 ||
      new Set((verifiedAnatolianBistro.items ?? []).map((menuItem) => menuItem.category)).size !== 13 ||
      JSON.stringify([...new Set((verifiedAnatolianBistro.items ?? []).map((menuItem) => menuItem.category))].slice(-4)) !==
        JSON.stringify(["Side Orders", "Desserts", "Ice Cream", "Beverages"]) ||
      (verifiedAnatolianBistro.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 63 ||
      (verifiedAnatolianBistro.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 42 ||
      (verifiedAnatolianBistro.items ?? []).some((menuItem) =>
        [
          "Door Dash",
          "MARKER’S MARK 12 OLD FASHIONED",
          "Northern Virginia Magazine",
          "NoVA Magazine Review",
          "Soup & Salads",
          "Tripadvisor",
          "Yelp",
        ].includes(menuItem.name)
      ) ||
      ![
        "Apricot Juice",
        "Coke",
        "Cranberry Juice",
        "Ginger-Ale",
        "Orange Juice",
        "Sour Cherry Juice",
        "Sparkling Water",
        "Sprite",
      ].every((name) => (verifiedAnatolianBistro.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAnatolianBistro.items ?? []).some((menuItem) =>
        menuItem.name === "American Coffee" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0
      ) ||
      !(verifiedAnatolianBistro.items ?? []).some((menuItem) =>
        menuItem.name === "Doner Kebab" &&
        menuItem.category === "Entrees (Dinner)" &&
        ["gluten", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAnatolianBistro.items ?? []).some((menuItem) =>
        menuItem.name === "Lamb Chops (GF)" &&
        menuItem.allergenSourceType === "unavailable" &&
        !(menuItem.allergens ?? []).includes("wheat") &&
        !(menuItem.allergens ?? []).includes("gluten")
      ) ||
      !(verifiedAnatolianBistro.items ?? []).some((menuItem) =>
        menuItem.name === "Kabak Tatlisi (GF)" &&
        ["milk", "tree-nut"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !(menuItem.allergens ?? []).includes("sesame")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-anatolian-bistro-6230019077/corrected-menu.json",
        "utf8",
      ),
    );
    const anatolianBistroRepairNote =
      "Verified repair: rebuilt Anatolian Bistro from 158 current restaurant-issued lunch and dinner presentations representing 105 unique products across 13 categories; independently corroborated the first 100 products on the restaurant's pickup-order page; removed 14 stale or duplicate rows and 19 description, navigation, review, source-link, and alcohol-only artifacts; restored eight omitted nonalcoholic beverages; separated lunch and dinner formulations by their current product identities; corrected 44 frozen allergen outcomes using only direct positive ingredient, named-component, mandatory-formulation, and explicit universal-bread evidence; honored 27 item-specific GF labels without converting them into cross-contact or broad safety claims; excluded optional tahini and ice-cream add-ons from fixed signals; retained 42 description-insufficient formulations as allergen-unavailable; invented no may-contain claims; and placed Beverages last.";
    replaceVerifiedMixedMenuSnapshot(
      "osm-anatolian-bistro-6230019077",
      verifiedSnapshot,
      anatolianBistroRepairNote,
    );
    verifiedAnatolianBistro.name = "Anatolian Bistro";
    verifiedAnatolianBistro.category = "turkish";
    verifiedAnatolianBistro.city = "Herndon, VA";
    verifiedAnatolianBistro.domain = "anatolianbistro.com";
    verifiedAnatolianBistro.locationId = "herndon-va";
    verifiedAnatolianBistro.displayAddress = "13029 Worldgate Dr, Herndon, VA 20170";
    verifiedAnatolianBistro.guideUrl = "https://anatolianbistro.com/menu/";
    verifiedAnatolianBistro.guideLabel = "Current restaurant-issued lunch and dinner menus";
    verifiedAnatolianBistro.sourceUrls = [
      "https://anatolianbistro.com/menu/",
      ...verifiedSnapshot.sourceUrls,
    ];
    verifiedAnatolianBistro.updated = "2026-07";
    verifiedAnatolianBistro.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAnatolianBistro.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAnatolianBistro.coverageStatus = "complete";
    verifiedAnatolianBistro.launchQualityStatus = "published";
    verifiedAnatolianBistro.launchRemediationBucket = "none";
    verifiedAnatolianBistro.sourceStatus = {
      ...(verifiedAnatolianBistro.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu-index:current-restaurant-issued:https://anatolianbistro.com/menu/",
          "menu:current-restaurant-issued-lunch:https://anatolianbistro.com/lunch/",
          "menu:current-restaurant-issued-dinner:https://anatolianbistro.com/dinner-menu/",
          "menu:current-restaurant-issued-pickup-corroboration:https://anatolianbistro.com/order/",
        ],
        configuredUrlWarnings: [
          "restaurant-issued-menu-is-not-an-allergen-matrix",
          "no-current-cross-contact-disclosure",
          "gf-means-gluten-free-but-is-not-a-cross-contact-assurance",
          "non-gf-entrees-include-the-menu-published-homemade-bread-accompaniment",
          "optional-add-ons-are-not-fixed-formulation-ingredients",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
          "alcohol-only-menu-content-is-excluded",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 33,
      ok: 3,
      failed: 0,
      total: 3,
      nonFoodDocumentSuspected: false,
      presentationCount: verifiedSnapshot.presentationCount,
      lunchPresentationCount: 77,
      dinnerPresentationCount: 81,
      orderPageCorroboratingItemCount: verifiedSnapshot.orderPageCorroboratingItemCount,
      glutenFreeLabelCount: verifiedSnapshot.glutenFreeLabelCount,
      soldOutCount: verifiedSnapshot.soldOutCount,
      quarantinedItemExamples: [
        { id: "door-dash", kind: "source-link", name: "Door Dash", reasons: ["navigation-link-not-menu-item"] },
        { id: "fresh-calamari-lightly-breaded", kind: "description-fragment", name: "fresh Calamari lightly breaded and light fried served with a cocktail sauce", reasons: ["duplicate-calamari-description"] },
        { id: "markers-mark-12-old-fashioned", kind: "alcohol-only", name: "MARKER’S MARK 12 OLD FASHIONED", reasons: ["cocktail-misclassified-as-dessert"] },
        { id: "northern-virginia-magazine", kind: "review-card", name: "Northern Virginia Magazine", reasons: ["home-page-review-content"] },
        { id: "soup-and-salads", kind: "section-heading", name: "Soup & Salads", reasons: ["menu-heading-not-product"] },
      ],
      reviewedMenuQualityRepairDuplicatesRemoved: 14,
      reviewedMenuQualityRepairs: [
        ...((verifiedAnatolianBistro.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Anatolian Bistro from 158 current/.test(String(repair.note ?? "")),
        )),
        { replacedRows: 105, note: anatolianBistroRepairNote },
      ],
    };
  }

  const verifiedAndysPizzaAdamsMorgan = restaurant("andys-pizza-dc");
  if (
    verifiedAndysPizzaAdamsMorgan &&
    (
      (verifiedAndysPizzaAdamsMorgan.items ?? []).length !== 15 ||
      new Set((verifiedAndysPizzaAdamsMorgan.items ?? []).map((menuItem) => menuItem.category)).size !== 3 ||
      (verifiedAndysPizzaAdamsMorgan.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 15 ||
      (verifiedAndysPizzaAdamsMorgan.items ?? []).some((menuItem) =>
        /&quot;/.test(JSON.stringify(menuItem))
      ) ||
      (verifiedAndysPizzaAdamsMorgan.items ?? []).some((menuItem) =>
        [
          "Buffalo Crispy Chicken",
          "Cheese",
          "Chicken Tenders",
          "Chorizo Fries",
          "Classic Burger",
          "Dairy Free Margherita",
          "Fried Brussels Sprouts",
          "Fried Cauliflower",
          "Old Bay Fries",
          "Spicy Burger",
          "Whole Pie Toppings:",
          "Wings",
        ].includes(menuItem.name)
      ) ||
      !(verifiedAndysPizzaAdamsMorgan.items ?? []).some((menuItem) =>
        menuItem.name === "8 Makes a Pie" &&
        menuItem.isConfigurable === true &&
        ["gluten", "milk", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      !(verifiedAndysPizzaAdamsMorgan.items ?? []).some((menuItem) =>
        menuItem.name === "Miller Time (Plant Based)" &&
        ["gluten", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !(menuItem.allergens ?? []).includes("milk")
      ) ||
      !(verifiedAndysPizzaAdamsMorgan.items ?? []).some((menuItem) =>
        menuItem.name === "Caesar Salad" &&
        ["gluten", "milk", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/andys-pizza-dc/corrected-menu.json",
        "utf8",
      ),
    );
    const andysPizzaRepairNote =
      "Verified repair: scoped Andy's Pizza strictly to the current Adams Morgan restaurant at 2465 18th St NW; parsed its 16 restaurant-issued structured rows into 15 purchasable products across three categories; removed the price-less Whole Pie Toppings modifier group; removed 11 products that are published only on other Andy's location menus, including Buffalo Crispy Chicken, Dairy Free Margherita, and the NOMA-only burgers; retained all 15 current Adams Morgan products with no omissions; corrected 13 frozen allergen outcomes by applying the restaurant's universal 72-hour sourdough crust description to current pizza rows and direct item ingredients to starters; preserved Miller Time as milk-free while retaining wheat and gluten; represented 8 Makes a Pie as configurable with the fixed signals shared by the current standard-slice set; and invented no negative or may-contain claims.";
    replaceVerifiedMixedMenuSnapshot("andys-pizza-dc", verifiedSnapshot, andysPizzaRepairNote);
    verifiedAndysPizzaAdamsMorgan.name = "Andy's Pizza";
    verifiedAndysPizzaAdamsMorgan.category = "Pizza";
    verifiedAndysPizzaAdamsMorgan.addressLine1 = "2465 18th St NW";
    verifiedAndysPizzaAdamsMorgan.city = "Washington";
    verifiedAndysPizzaAdamsMorgan.region = "DC";
    verifiedAndysPizzaAdamsMorgan.postalCode = "20009";
    verifiedAndysPizzaAdamsMorgan.locationId = "adams-morgan-dc";
    verifiedAndysPizzaAdamsMorgan.displayAddress = "2465 18th St NW, Washington, DC 20009";
    verifiedAndysPizzaAdamsMorgan.guideUrl = "https://www.eatandyspizza.com/menu/adams-morgan/";
    verifiedAndysPizzaAdamsMorgan.guideLabel = "Current Adams Morgan menu";
    verifiedAndysPizzaAdamsMorgan.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAndysPizzaAdamsMorgan.updated = "2026-07";
    verifiedAndysPizzaAdamsMorgan.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAndysPizzaAdamsMorgan.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAndysPizzaAdamsMorgan.coverageStatus = "complete";
    verifiedAndysPizzaAdamsMorgan.launchQualityStatus = "published";
    verifiedAndysPizzaAdamsMorgan.launchRemediationBucket = "none";
    verifiedAndysPizzaAdamsMorgan.sourceStatus = {
      ...(verifiedAndysPizzaAdamsMorgan.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:current-exact-location:https://www.eatandyspizza.com/menu/adams-morgan/",
          "location-scope:restaurant-issued:https://www.eatandyspizza.com/menus/",
          "identity:current-exact-location:https://www.eatandyspizza.com/location/adams-morgan-andys-pizza/",
        ],
        configuredUrlWarnings: [
          "all-menus-page-contains-nine-other-location-catalogs",
          "other-location-products-and-dietary-labels-must-not-be-attributed-to-adams-morgan",
          "restaurant-issued-menu-is-not-an-allergen-matrix",
          "no-current-cross-contact-disclosure",
          "universal-sourdough-crust-description-applies-to-current-pizza-rows",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 12,
      ok: 3,
      failed: 0,
      total: 3,
      nonFoodDocumentSuspected: false,
      publishedStructuredRowCount: verifiedSnapshot.publishedStructuredRowCount,
      modifierGroupCount: verifiedSnapshot.modifierGroupCount,
      otherLocationBleedItemCount: 11,
      quarantinedItemExamples: [
        { id: "buffalo-crispy-chicken", kind: "location-mismatch", name: "Buffalo Crispy Chicken", reasons: ["absent-from-adams-morgan-menu"] },
        { id: "classic-burger", kind: "location-mismatch", name: "Classic Burger", reasons: ["noma-at-streets-only"] },
        { id: "dairy-free-margherita", kind: "location-mismatch", name: "Dairy Free Margherita", reasons: ["absent-from-adams-morgan-menu"] },
        { id: "whole-pie-toppings", kind: "modifier-group", name: "Whole Pie Toppings:", reasons: ["price-less-topping-options-not-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAndysPizzaAdamsMorgan.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: scoped Andy's Pizza strictly to the current Adams Morgan/.test(String(repair.note ?? "")),
        )),
        { replacedRows: 15, note: andysPizzaRepairNote },
      ],
    };
  }

  const verifiedAnju = restaurant("anju-dc");
  if (
    verifiedAnju &&
    (
      (verifiedAnju.items ?? []).length !== 49 ||
      verifiedAnju.sourceUpdatedAt !== "2026-07-15T06:02:24.000Z" ||
      new Set((verifiedAnju.items ?? []).map((menuItem) => menuItem.category)).size !== 9 ||
      (verifiedAnju.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 30 ||
      (verifiedAnju.items ?? []).some((menuItem) =>
        [
          "(OPTIONAL sub impossible meat)",
          "1530-Day Kimchi",
          "5 rice porridge, scallion, crispy shallots",
          "5gelato - black sesame or lemon or honey buttersorbet - seasonal",
          "6Collard Green Kimchi",
          "6Yeolmu Kimchi",
          "Black Sesame Bungeoppang",
          "Cinnamon Toast Punch",
          "Collard Green Kimchi",
          "Dotorimuk Spring Salad",
          "Ganjang Gejang",
          "Guksu",
          "Pat Pound Cake",
          "Seafood Rosé Noodles",
          "Spring Yache",
        ].includes(menuItem.name)
      ) ||
      !(verifiedAnju.items ?? []).some((menuItem) =>
        menuItem.name === "Mandu" &&
        ["shellfish", "soy"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        menuItem.sourceUrls?.includes("https://order.toasttab.com/online/anju")
      ) ||
      !(verifiedAnju.items ?? []).some((menuItem) =>
        menuItem.name === "Palace Ddukbokgi" &&
        JSON.stringify([...(menuItem.allergens ?? [])].sort()) === JSON.stringify(["soy"])
      ) ||
      !(verifiedAnju.items ?? []).some((menuItem) =>
        menuItem.name === "Jjampong" &&
        ["gluten", "shellfish", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      (verifiedAnju.items ?? []).at(-1)?.category !== "Beverages"
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/anju-dc/corrected-menu.json",
        "utf8",
      ),
    );
    const anjuRepairNote =
      "Verified repair: rebuilt Anju from 51 current restaurant-issued dinner, brunch, and happy-hour presentations into 49 canonical products across nine categories; merged the two duplicate Mandu presentations and the two duplicate Yache Mandu presentations; removed six frozen price/modifier extraction artifacts, nine stale frozen products, thirteen current modifier rows, and nine alcohol-only products; restored nineteen current products omitted by the frozen extraction; corrected ten shifted, truncated, or changed menu descriptions and eleven allergen outcomes; used the restaurant-linked Toast catalog only for overlapping Mandu and Eomuk disclosures; rejected the online FAQ's blanket no-peanut statement as a negative assurance because it conflicts with a current Toast peanut warning; kept ingredient-intelligence inference separate from official positive signals; and invented no may-contain or cross-contact claim.";
    replaceVerifiedMixedMenuSnapshot("anju-dc", verifiedSnapshot, anjuRepairNote);
    verifiedAnju.name = "Anju";
    verifiedAnju.category = "Korean";
    verifiedAnju.addressLine1 = "1805 18th Street NW";
    verifiedAnju.city = "Washington";
    verifiedAnju.region = "DC";
    verifiedAnju.postalCode = "20009";
    verifiedAnju.locationId = "dupont-circle-dc";
    verifiedAnju.displayAddress = "1805 18th Street NW, Washington, DC 20009";
    verifiedAnju.guideUrl = "https://www.anjurestaurant.com/dine-in";
    verifiedAnju.guideLabel = "Current Anju dinner menu";
    verifiedAnju.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAnju.updated = "2026-07";
    verifiedAnju.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAnju.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAnju.coverageStatus = "complete";
    verifiedAnju.launchQualityStatus = "published";
    verifiedAnju.launchRemediationBucket = "none";
    verifiedAnju.sourceStatus = {
      ...(verifiedAnju.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:dinner:https://www.anjurestaurant.com/dine-in",
          "menu:brunch:https://www.anjurestaurant.com/brunch",
          "menu:happy-hour:https://www.anjurestaurant.com/happy-hour",
          "dietary-availability:restaurant-faq:https://www.anjurestaurant.com/faq",
          "ordering-link:restaurant-issued:https://www.anjurestaurant.com/order-online",
          "item-detail:restaurant-linked-vendor:https://order.toasttab.com/online/anju",
        ],
        configuredUrlWarnings: [
          "configured-happy-hour-1-url-now-returns-404-and-is-replaced-by-happy-hour",
          "restaurant-linked-toast-catalog-is-used-only-for-overlapping-item-evidence",
          "printed-gluten-free-vegetarian-and-dairy-free-menus-are-not-published-online",
          "faq-no-peanut-claim-conflicts-with-current-toast-peanut-warning",
          "conflicting-global-negative-claim-is-not-used-as-a-safety-assurance",
          "restaurant-issued-menu-text-is-not-a-complete-allergen-matrix",
          "no-current-cross-contact-disclosure",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: verifiedSnapshot.excludedModifierCount + verifiedSnapshot.excludedAlcoholCount,
      ok: 6,
      failed: 1,
      total: 7,
      nonFoodDocumentSuspected: false,
      presentationCount: verifiedSnapshot.presentationCount,
      dinnerPresentationCount: verifiedSnapshot.dinnerPresentationCount,
      brunchPresentationCount: verifiedSnapshot.brunchPresentationCount,
      happyHourPresentationCount: verifiedSnapshot.happyHourPresentationCount,
      modifierRowCount: verifiedSnapshot.excludedModifierCount,
      alcoholOnlyRowCount: verifiedSnapshot.excludedAlcoholCount,
      frozenArtifactCount: 6,
      frozenStaleProductCount: 9,
      restoredCurrentProductCount: 19,
      frozenAllergenMismatchCount: 11,
      frozenMenuContentMismatchCount: 10,
      quarantinedItemExamples: [
        { id: "optional-sub-impossible-meat", kind: "modifier", name: "(OPTIONAL sub impossible meat)", reasons: ["brunch-smash-burger-inline-modifier"] },
        { id: "1530-day-kimchi", kind: "price-concatenation", name: "1530-Day Kimchi", reasons: ["set-price-concatenated-with-next-product"] },
        { id: "5gelato-fragment", kind: "description-fragment", name: "5gelato - black sesame or lemon or honey buttersorbet - seasonal", reasons: ["price-and-description-promoted-to-product"] },
        { id: "cinnamon-toast-punch", kind: "alcohol-only", name: "Cinnamon Toast Punch", reasons: ["rum-cocktail-excluded-from-food-catalog"] },
        { id: "black-sesame-bungeoppang", kind: "stale-product", name: "Black Sesame Bungeoppang", reasons: ["absent-from-current-menu-surfaces"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAnju.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Anju from 51 current/.test(String(repair.note ?? "")),
        )),
        { replacedRows: 49, note: anjuRepairNote },
      ],
    };
  }

  const verifiedAnnabelle = restaurant("annabelle-dc");
  if (
    verifiedAnnabelle &&
    (
      (verifiedAnnabelle.items ?? []).length !== 33 ||
      verifiedAnnabelle.sourceUpdatedAt !== "2026-07-15T06:16:00.000Z" ||
      new Set((verifiedAnnabelle.items ?? []).map((menuItem) => menuItem.category)).size !== 6 ||
      (verifiedAnnabelle.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 30 ||
      (verifiedAnnabelle.items ?? []).some((menuItem) => /\([ndgsv]\)/i.test(menuItem.name)) ||
      (verifiedAnnabelle.items ?? []).some((menuItem) =>
        ["Branzino", "Grilled Venison", "Madai Crudo", "Tentsuyu Sauce", "Toasted Freekeh Salad"].includes(menuItem.name)
      ) ||
      !(verifiedAnnabelle.items ?? []).some((menuItem) =>
        menuItem.name === "Prime Angus Teres Major" &&
        menuItem.allergens?.includes("milk") &&
        !menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAnnabelle.items ?? []).some((menuItem) =>
        menuItem.name === "Crispy Broccolini" &&
        JSON.stringify([...(menuItem.allergens ?? [])].sort()) === JSON.stringify(["tree-nut"])
      ) ||
      !(verifiedAnnabelle.items ?? []).some((menuItem) =>
        menuItem.name === "Snapper" &&
        ["fish", "shellfish"].every((allergen) => menuItem.allergens?.includes(allergen)) &&
        !menuItem.allergens?.includes("tree-nut")
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/annabelle-dc/corrected-menu.json",
        "utf8",
      ),
    );
    const annabelleRepairNote =
      "Verified repair: rebuilt Annabelle from its restaurant-issued July 11, 2026 dinner/dessert menu and current Bar Bites page into 33 products across six categories; removed four stale seasonal products and the Tentsuyu Sauce description artifact; restored twelve omitted current products, including all six Bar Bites; corrected five truncated continuation descriptions and sixteen allergen outcomes; applied Annabelle's item-scoped (d) dairy, (g) gluten, (n) nuts, and (s) shellfish legend only to marked products; fixed the frozen oyster-mushroom shellfish and cashew-cream dairy substring false positives; stopped classifying coconut as a major tree nut under current FDA guidance; retained the restaurant's generic nuts code as a non-species-specific tree-nut signal; and invented no cross-contact, may-contain, or negative assurance.";
    replaceVerifiedMixedMenuSnapshot("annabelle-dc", verifiedSnapshot, annabelleRepairNote);
    verifiedAnnabelle.name = "Annabelle";
    verifiedAnnabelle.category = "Modern American";
    verifiedAnnabelle.addressLine1 = "2132 Florida Avenue NW";
    verifiedAnnabelle.city = "Washington";
    verifiedAnnabelle.region = "DC";
    verifiedAnnabelle.postalCode = "20008";
    verifiedAnnabelle.locationId = "kalorama-dc";
    verifiedAnnabelle.displayAddress = "2132 Florida Avenue NW, Washington, DC 20008";
    verifiedAnnabelle.guideUrl = "https://annabelledc.com/dinneranddessert";
    verifiedAnnabelle.guideLabel = "Current dinner and dessert menu";
    verifiedAnnabelle.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAnnabelle.updated = "2026-07";
    verifiedAnnabelle.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAnnabelle.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAnnabelle.coverageStatus = "complete";
    verifiedAnnabelle.launchQualityStatus = "published";
    verifiedAnnabelle.launchRemediationBucket = "none";
    verifiedAnnabelle.sourceStatus = {
      ...(verifiedAnnabelle.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:dinner-dessert:https://annabelledc.com/dinneranddessert",
          "menu:bar-bites:https://annabelledc.com/easter-brunch-menu",
          "identity:restaurant-issued:https://annabelledc.com/eat-1",
          "identity:restaurant-issued:https://annabelledc.com/",
        ],
        configuredUrlWarnings: [
          "easter-brunch-menu-slug-currently-publishes-the-navigation-linked-bar-menu",
          "dinner-menu-is-a-recent-seasonal-menu-updated-2026-07-11",
          "specific-item-availability-is-not-guaranteed-by-the-restaurant",
          "n-label-says-contains-nuts-without-specifying-peanut-or-tree-nut-species",
          "g-label-supports-gluten-but-not-automatically-wheat",
          "restaurant-issued-labels-do-not-disclose-cross-contact",
          "coconut-is-not-mapped-to-major-tree-nut-under-current-fda-guidance",
          "oyster-mushrooms-must-not-map-to-shellfish",
          "cashew-cream-must-not-map-to-dairy",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: verifiedSnapshot.discardedLayoutRowCount,
      ok: 4,
      failed: 0,
      total: 4,
      nonFoodDocumentSuspected: false,
      menuUpdatedLabel: verifiedSnapshot.menuUpdatedLabel,
      dinnerItemCount: verifiedSnapshot.dinnerItemCount,
      barItemCount: verifiedSnapshot.barItemCount,
      discardedLayoutRowCount: verifiedSnapshot.discardedLayoutRowCount,
      frozenArtifactCount: 1,
      frozenStaleProductCount: 4,
      restoredCurrentProductCount: 12,
      frozenAllergenMismatchCount: 16,
      frozenMenuContentMismatchCount: 5,
      quarantinedItemExamples: [
        { id: "tentsuyu-sauce", kind: "description-fragment", name: "Tentsuyu Sauce", reasons: ["seasonal-vegetable-tempura-description-promoted-to-product"] },
        { id: "branzino", kind: "stale-product", name: "Branzino", reasons: ["absent-from-current-2026-07-11-menu"] },
        { id: "grilled-venison", kind: "stale-product", name: "Grilled Venison", reasons: ["absent-from-current-2026-07-11-menu"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAnnabelle.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Annabelle from its restaurant-issued July 11, 2026/.test(String(repair.note ?? "")),
        )),
        { replacedRows: 33, note: annabelleRepairNote },
      ],
    };
  }

  const verifiedAnniesParamount = restaurant(
    "annie-s-paramount-steak-house-washington-dc-dc-metro",
  );
  if (
    verifiedAnniesParamount &&
    (
      (verifiedAnniesParamount.items ?? []).length !== 112 ||
      verifiedAnniesParamount.sourceUpdatedAt !== "2026-07-15T06:28:14.628Z" ||
      verifiedAnniesParamount.sourceStatus?.excludedAlcoholCount !== 35 ||
      verifiedAnniesParamount.sourceStatus?.excludedNonFoodDrinkCount !== 1 ||
      new Set((verifiedAnniesParamount.items ?? []).map((menuItem) => menuItem.category)).size !== 16 ||
      (verifiedAnniesParamount.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 88 ||
      (verifiedAnniesParamount.items ?? []).some((menuItem) =>
        [
          "Annie’s Paramount Steak House",
          "BRUNCH FOR LUNCH",
          "BRUNCH PLATTERS",
          "ENTRÉE SALADS",
          "HAMBURGERS",
          "HOUSE SPECIALS",
          "OMELETS",
          "SEAFOOD",
          "SEAFOOD & PASTA",
        ].includes(menuItem.name)
      ) ||
      !(verifiedAnniesParamount.items ?? []).some((menuItem) =>
        menuItem.name === "Basil-Pine Nut Pesto Pasta" &&
        ["gluten", "milk", "tree-nut", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        ) &&
        !menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAnniesParamount.items ?? []).some((menuItem) =>
        menuItem.name === "Country Chicken Salad" &&
        ["gluten", "milk", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        ) &&
        !menuItem.allergens?.includes("shellfish")
      ) ||
      !(verifiedAnniesParamount.items ?? []).some((menuItem) =>
        menuItem.name === "Coconut Cream Pie" &&
        !menuItem.allergens?.includes("tree-nut")
      ) ||
      !(verifiedAnniesParamount.items ?? []).some((menuItem) =>
        menuItem.name === "Fried Shrimp" &&
        menuItem.sourceUrls?.includes(
          "https://www.anniesparamountdc.com/s/Happy-Hour-Menu-Spring-2025.pdf",
        )
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/annie-s-paramount-steak-house-washington-dc-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    const anniesParamountRepairNote =
      "Verified repair: rebuilt Annie's Paramount Steak House from its restaurant-issued May 2026 dinner, lunch, and brunch PDFs plus its Spring 2025 happy-hour food list into 112 canonical products across 16 categories; canonicalized repeated meal-period presentations while retaining every applicable source; removed nine frozen section/title artifacts and seventeen stale older-HTML products; restored twenty-nine current products omitted by the frozen extraction, including all current side products and happy-hour snacks; corrected eighty-four shifted or changed descriptions/categories and fifty-nine allergen outcomes; limited official positive signals to explicit product and ingredient terms; removed false shellfish from Basil-Pine Nut Pesto Pasta, Country Chicken Salad, Feta Bacon Omelet, and Grilled Atlantic Salmon; did not smear optional shrimp or salmon add-ons onto base items; excluded alcohol-only drink rows; did not classify coconut as a major tree nut; treated the generic consumer advisory as neither item-level may-contain evidence nor a negative assurance; and invented no cross-contact or negative claim.";
    replaceVerifiedMixedMenuSnapshot(
      "annie-s-paramount-steak-house-washington-dc-dc-metro",
      verifiedSnapshot,
      anniesParamountRepairNote,
    );
    verifiedAnniesParamount.name = "Annie's Paramount Steak House";
    verifiedAnniesParamount.category = "Steakhouse";
    verifiedAnniesParamount.addressLine1 = "1609 17th Street NW";
    verifiedAnniesParamount.city = "Washington";
    verifiedAnniesParamount.region = "DC";
    verifiedAnniesParamount.postalCode = "20009";
    verifiedAnniesParamount.locationId = "dupont-circle-dc";
    verifiedAnniesParamount.displayAddress = "1609 17th Street NW, Washington, DC 20009";
    verifiedAnniesParamount.guideUrl = "https://www.anniesparamountdc.com/menus";
    verifiedAnniesParamount.guideLabel = "Current dated food menus";
    verifiedAnniesParamount.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAnniesParamount.updated = "2026-07";
    verifiedAnniesParamount.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAnniesParamount.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAnniesParamount.coverageStatus = "complete";
    verifiedAnniesParamount.launchQualityStatus = "published";
    verifiedAnniesParamount.launchRemediationBucket = "none";
    verifiedAnniesParamount.sourceStatus = {
      ...(verifiedAnniesParamount.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-issued:https://www.anniesparamountdc.com/",
          "menu-navigation-and-older-html-catalog:https://www.anniesparamountdc.com/menus",
          "menu:dinner-may-2026:https://www.anniesparamountdc.com/s/Dinner-Menu-May-2026.pdf",
          "menu:lunch-may-2026:https://www.anniesparamountdc.com/s/Lunch-Menu-May-2026.pdf",
          "menu:brunch-may-2026:https://www.anniesparamountdc.com/s/Brunch-Menu-May-2026.pdf",
          "menu:happy-hour-spring-2025:https://www.anniesparamountdc.com/s/Happy-Hour-Menu-Spring-2025.pdf",
          "excluded-alcohol-catalog:https://www.anniesparamountdc.com/s/drink-menu-2026-final-draft.pdf",
        ],
        configuredUrlWarnings: [
          "legacy-menu-url-is-not-a-usable-current-source",
          "html-menu-block-publishes-an-older-catalog-than-the-linked-dated-pdfs",
          "dated-pdf-columns-must-not-be-read-across-page-order",
          "consumer-advisory-is-not-item-level-allergen-or-cross-contact-evidence",
          "restaurant-issued-food-menus-are-not-complete-allergen-matrices",
          "optional-protein-add-ons-must-not-smear-allergens-onto-base-items",
          "coconut-is-not-mapped-to-major-tree-nut",
          "alcohol-only-drink-products-are-excluded-from-the-food-catalog",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: verifiedSnapshot.excludedDrinkPresentationCount,
      ok: 7,
      failed: 1,
      total: 8,
      nonFoodDocumentSuspected: false,
      menuDateLabel: verifiedSnapshot.menuDateLabel,
      canonicalProductCount: verifiedSnapshot.itemCount,
      dinnerProductCount: verifiedSnapshot.dinnerItemCount,
      lunchProductCount: verifiedSnapshot.lunchItemCount,
      brunchProductCount: verifiedSnapshot.brunchItemCount,
      happyHourProductCount: verifiedSnapshot.happyHourItemCount,
      excludedAlcoholCount: verifiedSnapshot.excludedAlcoholCount,
      excludedNonFoodDrinkCount: verifiedSnapshot.excludedNonFoodDrinkCount,
      excludedDrinkPresentationCount: verifiedSnapshot.excludedDrinkPresentationCount,
      frozenArtifactCount: 9,
      frozenStaleProductCount: 17,
      restoredCurrentProductCount: 29,
      frozenAllergenMismatchCount: 59,
      frozenMenuContentMismatchCount: 84,
      quarantinedItemExamples: [
        { id: "entree-salads", kind: "section-heading", name: "ENTRÉE SALADS", reasons: ["pdf-section-title-promoted-to-product"] },
        { id: "annies-paramount-steak-house", kind: "restaurant-title", name: "Annie’s Paramount Steak House", reasons: ["home-page-card-promoted-to-product"] },
        { id: "rainbow-trout", kind: "stale-product", name: "Rainbow Trout", reasons: ["absent-from-current-dated-food-pdfs"] },
        { id: "porterhouse-steak", kind: "stale-product", name: "Porterhouse Steak", reasons: ["absent-from-current-dated-food-pdfs"] },
        { id: "heineken-zero", kind: "excluded-drink", name: "Heineken Zero", reasons: ["separate-alcohol-oriented-drink-catalog-excluded-from-food-menu"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAnniesParamount.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Annie's Paramount Steak House/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 112, note: anniesParamountRepairNote },
      ],
    };
  }

  const verifiedAnthonysFallsChurch = restaurant("osm-anthony-s-7464874523");
  if (
    verifiedAnthonysFallsChurch &&
    (
      (verifiedAnthonysFallsChurch.items ?? []).length !== 175 ||
      verifiedAnthonysFallsChurch.sourceUpdatedAt !== "2026-07-15T06:48:00.000Z" ||
      new Set((verifiedAnthonysFallsChurch.items ?? []).map((menuItem) => menuItem.category)).size !== 20 ||
      (verifiedAnthonysFallsChurch.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 129 ||
      (verifiedAnthonysFallsChurch.items ?? []).some((menuItem) =>
        [
          "1 MEATBALL",
          "Broccoli",
          "DOUBLE MEAT",
          "Extra Tzatziki sauce",
          "GRILLED PORK",
          "GYRO",
          "GYRO MEAT",
          "Italian Sausage",
          "KIDS",
          "Marinara Sauce (4oz)",
          "Marinara Sauce Side (8oz)",
          "MEAT SAUCE (8oz)",
          "Meat Sauce Side (4oz)",
          "Meatballs",
          "Provolone Cheese",
          "Sautéed Mushroom",
          "SMALL SOUP",
          "Thousand Island",
        ].includes(menuItem.name)
      ) ||
      !(verifiedAnthonysFallsChurch.items ?? []).some((menuItem) =>
        menuItem.name === "GARIDOMAKARONADA" &&
        ["gluten", "milk", "shellfish", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedAnthonysFallsChurch.items ?? []).some((menuItem) =>
        menuItem.name === "TILAPIA ALMANDINE" &&
        ["fish", "milk", "tree-nut"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedAnthonysFallsChurch.items ?? []).some((menuItem) =>
        menuItem.name === "NEW YORK STEAK 10oz" &&
        (menuItem.allergens ?? []).length === 0
      ) ||
      !(verifiedAnthonysFallsChurch.items ?? []).some((menuItem) =>
        menuItem.name === "CHICKEN 6oz" && menuItem.category === "SIDES"
      ) ||
      (verifiedAnthonysFallsChurch.sourceUrls ?? []).some((url) => /r\.jina\.ai/i.test(url))
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-anthony-s-7464874523/corrected-menu.json",
        "utf8",
      ),
    );
    const anthonysFallsChurchRepairNote =
      "Verified repair: rebuilt Anthony's Falls Church from its current restaurant-issued Owner ordering menu into 175 canonical products across 20 categories; reconciled 178 category presentations and merged only the repeated Garidomakaronada, Greek Fries, and Meatball listings; removed eighteen frozen nested modifiers and the KIDS heading that the prior structured extraction promoted to products; restored nine omitted current products; corrected thirty-nine shifted descriptions/categories and eighty allergen outcomes; retained the live official page and item URLs as the source of product claims while labeling the retained Jina Reader capture strictly as third-party transport corroboration; stripped the generic raw-food warning before allergen matching; kept absent terms from becoming negative assurances; and invented no cross-contact or may-contain claim.";
    replaceVerifiedMixedMenuSnapshot(
      "osm-anthony-s-7464874523",
      verifiedSnapshot,
      anthonysFallsChurchRepairNote,
    );
    verifiedAnthonysFallsChurch.name = "Anthony's Restaurant";
    verifiedAnthonysFallsChurch.category = "Greek & Italian";
    verifiedAnthonysFallsChurch.addressLine1 = "3000 Annandale Rd";
    verifiedAnthonysFallsChurch.city = "Falls Church";
    verifiedAnthonysFallsChurch.region = "VA";
    verifiedAnthonysFallsChurch.postalCode = "22042";
    verifiedAnthonysFallsChurch.locationId = "falls-church-va";
    verifiedAnthonysFallsChurch.displayAddress = "3000 Annandale Rd, Falls Church, VA 22042";
    verifiedAnthonysFallsChurch.guideUrl = "https://anthonysrestaurantva.com/menu";
    verifiedAnthonysFallsChurch.guideLabel = "Current Anthony's menu";
    verifiedAnthonysFallsChurch.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAnthonysFallsChurch.updated = "2026-07";
    verifiedAnthonysFallsChurch.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAnthonysFallsChurch.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAnthonysFallsChurch.coverageStatus = "complete";
    verifiedAnthonysFallsChurch.launchQualityStatus = "published";
    verifiedAnthonysFallsChurch.launchRemediationBucket = "none";
    verifiedAnthonysFallsChurch.sourceStatus = {
      ...(verifiedAnthonysFallsChurch.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-issued:https://anthonysrestaurantva.com/",
          "menu-and-item-links:restaurant-issued:https://anthonysrestaurantva.com/menu",
          `transport-snapshot:third-party:${verifiedSnapshot.transportUrl}`,
        ],
        configuredUrlWarnings: [
          "ledger-and-curl-archival-user-agents-receive-http-403",
          "live-official-page-remains-publicly-readable-through-web-reader",
          "jina-reader-artifact-is-third-party-transport-and-not-official-evidence",
          "owner-item-identifiers-may-change-while-base-menu-url-remains-stable",
          "nested-item-modifiers-must-not-be-promoted-to-products",
          "same-name-category-presentations-are-canonicalized-only-after-content-review",
          "raw-food-consumer-warning-is-not-allergen-or-cross-contact-evidence",
          "restaurant-issued-menu-is-not-a-complete-allergen-matrix",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 18,
      ok: 3,
      failed: 2,
      total: 5,
      nonFoodDocumentSuspected: false,
      publishedPresentationCount: verifiedSnapshot.presentationCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      duplicatePresentationCount: verifiedSnapshot.duplicatePresentationCount,
      frozenArtifactCount: 18,
      restoredCurrentProductCount: 9,
      frozenAllergenMismatchCount: 80,
      frozenMenuContentMismatchCount: 39,
      quarantinedItemExamples: [
        { id: "kids", kind: "section-heading", name: "KIDS", reasons: ["category-title-promoted-to-product"] },
        { id: "broccoli", kind: "nested-modifier", name: "Broccoli", reasons: ["pasta-option-promoted-to-product"] },
        { id: "double-meat", kind: "nested-modifier", name: "DOUBLE MEAT", reasons: ["pita-sandwich-option-promoted-to-product"] },
        { id: "gyro-meat", kind: "nested-modifier", name: "GYRO MEAT", reasons: ["pizza-topping-promoted-to-product"] },
        { id: "thousand-island", kind: "nested-modifier", name: "Thousand Island", reasons: ["sandwich-option-promoted-to-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAnthonysFallsChurch.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Anthony's Falls Church|Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 175, note: anthonysFallsChurchRepairNote },
      ],
    };
  }

  const verifiedAntonellisPizza = restaurant("replacement-antonelli-s-pizza-lorton-va");
  if (
    verifiedAntonellisPizza &&
    (
      (verifiedAntonellisPizza.items ?? []).length !== 80 ||
      verifiedAntonellisPizza.sourceUpdatedAt !== "2026-07-15T07:07:51.896Z" ||
      new Set((verifiedAntonellisPizza.items ?? []).map((menuItem) => menuItem.category)).size !== 15 ||
      (verifiedAntonellisPizza.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 73 ||
      (verifiedAntonellisPizza.items ?? []).at(-1)?.category !== "Beverages" ||
      (verifiedAntonellisPizza.items ?? []).some((menuItem) =>
        [
          "Coupons",
          "DRESSINGS:",
          "GOURMET SPECIALTY PIZZAS",
          "Pastas",
          "Subs",
          "Wraps",
          "Beer Bottle",
          "By The Glass",
        ].includes(menuItem.name)
      ) ||
      !(verifiedAntonellisPizza.items ?? []).some((menuItem) =>
        menuItem.name === "PLAIN CHEESE" &&
        ["gluten", "milk", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedAntonellisPizza.items ?? []).some((menuItem) =>
        menuItem.name === "GRILLED CHICKEN SUB" &&
        ["egg", "gluten", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        ) &&
        !menuItem.allergens?.includes("milk")
      ) ||
      !(verifiedAntonellisPizza.items ?? []).some((menuItem) =>
        menuItem.name === "BOTTLED WATER" && (menuItem.allergens ?? []).length === 0
      ) ||
      (verifiedAntonellisPizza.sourceStatus?.reviewedMenuQualityRepairs ?? []).some(
        (repair) => /Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
          String(repair.note ?? ""),
        ),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/replacement-antonelli-s-pizza-lorton-va/corrected-menu.json",
        "utf8",
      ),
    );
    const antonellisPizzaRepairNote =
      "Verified repair: rebuilt Antonelli's Pizza & Subs from its current restaurant-issued HTML menu and linked June 2025 PDF into 80 canonical top-level products across 15 food and nonalcoholic-beverage categories; reconciled all 100 frozen rows; removed thirty-seven promoted headings, modifiers, notes, description fragments, and promotional rows; restored seventeen omitted current products; corrected all sixty-three matched menu presentations and forty-five allergen outcomes; rejected twelve Beer & Wine presentations; resolved the stale hidden $12.99 medium Plain Cheese table in favor of the current $13.99 row corroborated by the PDF; kept Beverages last; stripped optional add-ons before positive-signal mapping; treated neither silence nor restaurant menu prose as a negative allergen or cross-contact assurance.";
    replaceVerifiedMixedMenuSnapshot(
      "replacement-antonelli-s-pizza-lorton-va",
      verifiedSnapshot,
      antonellisPizzaRepairNote,
    );
    verifiedAntonellisPizza.name = "Antonelli's Pizza & Subs";
    verifiedAntonellisPizza.category = "Pizza & Subs";
    verifiedAntonellisPizza.addressLine1 = "8212 Gunston Corner Lane";
    verifiedAntonellisPizza.city = "Lorton";
    verifiedAntonellisPizza.region = "VA";
    verifiedAntonellisPizza.postalCode = "22079";
    verifiedAntonellisPizza.locationId = "lorton-va";
    verifiedAntonellisPizza.displayAddress = "8212 Gunston Corner Lane, Lorton, VA 22079";
    verifiedAntonellisPizza.guideUrl = "https://antonellis-pizza.com/menu/";
    verifiedAntonellisPizza.guideLabel = "Current Antonelli's menu";
    verifiedAntonellisPizza.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAntonellisPizza.updated = "2026-07";
    verifiedAntonellisPizza.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAntonellisPizza.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAntonellisPizza.coverageStatus = "complete";
    verifiedAntonellisPizza.launchQualityStatus = "published";
    verifiedAntonellisPizza.launchRemediationBucket = "none";
    verifiedAntonellisPizza.sourceStatus = {
      ...(verifiedAntonellisPizza.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-issued:https://antonellis-pizza.com/",
          "menu-and-ingredient-text:restaurant-issued:https://antonellis-pizza.com/menu/",
          "menu-and-ingredient-text:restaurant-issued:https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf",
        ],
        configuredUrlWarnings: [
          "html-contains-stale-hidden-responsive-plain-cheese-price-table",
          "pdf-confirms-current-medium-plain-cheese-price-is-13-99",
          "responsive-duplicate-menu-structures-must-not-create-products",
          "section-headings-modifiers-descriptions-and-coupon-copy-are-not-products",
          "beer-and-wine-presentations-are-excluded-from-the-food-catalog",
          "optional-additions-must-not-smear-allergens-onto-base-products",
          "restaurant-issued-menus-are-not-complete-allergen-matrices",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: verifiedSnapshot.excludedHelperRowCount,
      ok: 3,
      failed: 0,
      total: 3,
      nonFoodDocumentSuspected: false,
      rawPriceListRowCount: verifiedSnapshot.rawPriceListRowCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      excludedHelperRowCount: verifiedSnapshot.excludedHelperRowCount,
      excludedAlcoholPresentationCount: verifiedSnapshot.excludedAlcoholPresentationCount,
      stalePlainCheesePriceRowCount: verifiedSnapshot.stalePlainCheesePriceRows.length,
      frozenArtifactCount: 37,
      restoredCurrentProductCount: 17,
      frozenAllergenMismatchCount: 45,
      frozenMenuContentMismatchCount: 63,
      quarantinedItemExamples: [
        { id: "coupons", kind: "promotional-copy", name: "Coupons", reasons: ["promotion-promoted-to-product"] },
        { id: "gourmet-specialty-pizzas", kind: "section-heading", name: "GOURMET SPECIALTY PIZZAS", reasons: ["category-title-promoted-to-product"] },
        { id: "honey-mustard-balsamic-vinaigrette", kind: "nested-modifier", name: "Honey Mustard • Balsamic Vinaigrette", reasons: ["dressing-options-promoted-to-product"] },
        { id: "our-dough-and-pizza-sauce-are-made-from-scratch-daily", kind: "source-note", name: "Our dough and pizza sauce are made from scratch daily", reasons: ["global-menu-note-promoted-to-product"] },
        { id: "beer-bottle", kind: "excluded-alcohol", name: "Beer Bottle", reasons: ["beer-and-wine-section-excluded"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAntonellisPizza.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Antonelli's Pizza & Subs|Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 80, note: antonellisPizzaRepairNote },
      ],
    };
  }

  const verifiedApPizzaShopBethesda = restaurant("ap-pizza-shop-bethesda-dc-metro");
  if (
    verifiedApPizzaShopBethesda &&
    (
      (verifiedApPizzaShopBethesda.items ?? []).length !== 49 ||
      verifiedApPizzaShopBethesda.sourceUpdatedAt !== "2026-07-15T07:26:50.728Z" ||
      new Set((verifiedApPizzaShopBethesda.items ?? []).map((menuItem) => menuItem.category)).size !== 7 ||
      (verifiedApPizzaShopBethesda.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 46 ||
      (verifiedApPizzaShopBethesda.items ?? []).some((menuItem) =>
        [
          "Deck-Oven Slices",
          "Lunch Pies",
          "Il Supremo",
          "Supremo Slice",
          "18\" Supremo",
          "Andy Boy",
          "Focaccia Breadsticks",
          "Eggplant Parm Arancini",
          "Leafy Green Salad",
        ].includes(menuItem.name)
      ) ||
      !(verifiedApPizzaShopBethesda.items ?? []).some((menuItem) =>
        menuItem.name === "The Tripper" &&
        ["fish", "gluten", "milk", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedApPizzaShopBethesda.items ?? []).some((menuItem) =>
        menuItem.name === "Duke #7" && menuItem.category === "Pizza"
      ) ||
      !(verifiedApPizzaShopBethesda.items ?? []).some((menuItem) =>
        menuItem.name === "Pizza Dough" &&
        ["gluten", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      (verifiedApPizzaShopBethesda.sourceUrls ?? []).some((url) => /r\.jina\.ai/i.test(url)) ||
      (verifiedApPizzaShopBethesda.sourceStatus?.reviewedMenuQualityRepairs ?? []).some(
        (repair) => /Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
          String(repair.note ?? ""),
        ),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/ap-pizza-shop-bethesda-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    const apPizzaShopBethesdaRepairNote =
      "Verified repair: rebuilt AP Pizza Shop Bethesda from its current meal-period-dependent restaurant-linked Toast catalog into 49 unique products across seven categories; reconciled all 47 frozen rows; retained thirty-eight current products, removed seven stale products and two category-heading artifacts, and restored eleven omitted products; corrected thirty-one stale categories/descriptions and twenty-seven allergen outcomes; represented neonata and anchovy as fish, pistachio and almond as tree nut, and pizza/focaccia/pasta forms as wheat and gluten; retained three accurately unavailable products; kept the official live Toast item URLs as product evidence while labeling two retained Jina Reader captures strictly as third-party transport corroboration; invented no negative, may-contain, or cross-contact claim.";
    replaceVerifiedMixedMenuSnapshot(
      "ap-pizza-shop-bethesda-dc-metro",
      verifiedSnapshot,
      apPizzaShopBethesdaRepairNote,
    );
    verifiedApPizzaShopBethesda.name = "AP Pizza Shop";
    verifiedApPizzaShopBethesda.category = "Pizza & Focaccia";
    verifiedApPizzaShopBethesda.addressLine1 = "4747 Bethesda Avenue";
    verifiedApPizzaShopBethesda.city = "Bethesda";
    verifiedApPizzaShopBethesda.region = "MD";
    verifiedApPizzaShopBethesda.postalCode = "20814";
    verifiedApPizzaShopBethesda.locationId = "bethesda-md";
    verifiedApPizzaShopBethesda.displayAddress = "4747 Bethesda Avenue, Bethesda, MD 20814";
    verifiedApPizzaShopBethesda.guideUrl = "https://order.toasttab.com/online/ap-pizza-shop-bethesda";
    verifiedApPizzaShopBethesda.guideLabel = "Current AP Pizza Shop menu";
    verifiedApPizzaShopBethesda.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedApPizzaShopBethesda.updated = "2026-07";
    verifiedApPizzaShopBethesda.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedApPizzaShopBethesda.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedApPizzaShopBethesda.coverageStatus = "complete";
    verifiedApPizzaShopBethesda.launchQualityStatus = "published";
    verifiedApPizzaShopBethesda.launchRemediationBucket = "none";
    verifiedApPizzaShopBethesda.sourceStatus = {
      ...(verifiedApPizzaShopBethesda.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-issued:https://allpurposedc.com/",
          "meal-period-menu-and-item-links:restaurant-linked:https://order.toasttab.com/online/ap-pizza-shop-bethesda",
          `transport-snapshot:third-party:${verifiedSnapshot.transportUrl}`,
        ],
        configuredUrlWarnings: [
          "toast-menu-is-meal-period-dependent",
          "current-lunch-surface-has-46-products-and-current-dinner-surface-has-35",
          "lunch-dinner-union-has-49-unique-products",
          "ledger-archival-user-agent-receives-http-403",
          "jina-reader-artifacts-are-third-party-transport-and-not-official-evidence",
          "category-headings-are-not-products",
          "neonata-is-a-fish-ingredient",
          "restaurant-linked-menu-is-not-a-complete-allergen-matrix",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 9,
      ok: 4,
      failed: 1,
      total: 5,
      nonFoodDocumentSuspected: false,
      lunchProductCount: verifiedSnapshot.lunchItemCount,
      dinnerProductCount: verifiedSnapshot.dinnerItemCount,
      dinnerOnlyProductCount: verifiedSnapshot.dinnerOnlyItemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      frozenArtifactCount: 2,
      frozenStaleProductCount: 7,
      restoredCurrentProductCount: 11,
      frozenAllergenMismatchCount: 27,
      frozenMenuContentMismatchCount: 31,
      quarantinedItemExamples: [
        { id: "deck-oven-slices", kind: "section-heading", name: "Deck-Oven Slices", reasons: ["toast-category-title-promoted-to-product"] },
        { id: "lunch-pies", kind: "section-heading", name: "Lunch Pies", reasons: ["toast-category-title-promoted-to-product"] },
        { id: "il-supremo", kind: "stale-product", name: "Il Supremo", reasons: ["absent-from-current-lunch-and-dinner-surfaces"] },
        { id: "supremo-slice", kind: "stale-product", name: "Supremo Slice", reasons: ["replaced-by-current-calabrese-slice"] },
        { id: "leafy-green-salad", kind: "stale-product", name: "Leafy Green Salad", reasons: ["replaced-by-current-agricola-salad"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedApPizzaShopBethesda.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt AP Pizza Shop Bethesda|Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 49, note: apPizzaShopBethesdaRepairNote },
      ],
    };
  }

  const verifiedApapachoTaqueria = restaurant("replacement-apapacho-taqueria-washington-dc");
  if (
    verifiedApapachoTaqueria &&
    (
      (verifiedApapachoTaqueria.items ?? []).length !== 40 ||
      verifiedApapachoTaqueria.sourceUpdatedAt !== "2026-07-15T07:44:59.987Z" ||
      new Set((verifiedApapachoTaqueria.items ?? []).map((menuItem) => menuItem.category)).size !== 7 ||
      (verifiedApapachoTaqueria.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 14 ||
      !(verifiedApapachoTaqueria.items ?? []).some((menuItem) =>
        menuItem.name === "Tacos de Mushrooms" &&
        (menuItem.allergens ?? []).length === 0
      ) ||
      !(verifiedApapachoTaqueria.items ?? []).some((menuItem) =>
        menuItem.name === "Fried Corn Quesadilla" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["milk"])
      ) ||
      !(verifiedApapachoTaqueria.items ?? []).some((menuItem) =>
        menuItem.name === "Chicken Milanesa" &&
        ["egg", "gluten", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      (verifiedApapachoTaqueria.items ?? []).some((menuItem) =>
        [
          "8 course Tasting Dinner - Las Quince Letras X Apapacho",
          "Champurrado 1qt",
          "Cubetazo Tecate /Modelo",
          "Dia de Muertos Brunch",
          "PREPARE BEFORE I ARRIVE",
          "Tamal",
          "To go Modelo",
          "Tostada Reyna",
        ].includes(menuItem.name)
      ) ||
      (verifiedApapachoTaqueria.sourceStatus?.reviewedMenuQualityRepairs ?? []).some(
        (repair) => /Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
          String(repair.note ?? ""),
        ),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/replacement-apapacho-taqueria-washington-dc/corrected-menu.json",
        "utf8",
      ),
    );
    const apapachoRepairNote =
      "Verified repair: rebuilt Apapacho Taqueria from its current owner-issued PDF menu and live Square order categories into 40 food and non-alcoholic products across seven sections; reconciled all 51 frozen rows; retained thirty-five frozen presentations representing thirty-four current products, removed sixteen expired preorder, holiday, event, alcohol, uncategorized, and duplicate promotional rows, and restored six omitted current products; corrected all thirty-five generic categories and seven allergen outcomes; removed false shellfish from oyster mushrooms and false wheat/gluten from the corn-masa quesadilla, added wheat/gluten to breaded chicken and battered shrimp, retained only fixed positive ingredient signals, and invented no negative, may-contain, or cross-contact claim.";
    replaceVerifiedMixedMenuSnapshot(
      "replacement-apapacho-taqueria-washington-dc",
      verifiedSnapshot,
      apapachoRepairNote,
    );
    verifiedApapachoTaqueria.name = "Apapacho Taqueria";
    verifiedApapachoTaqueria.category = "Mexican";
    verifiedApapachoTaqueria.addressLine1 = "1280 4th Street Northeast";
    verifiedApapachoTaqueria.city = "Washington";
    verifiedApapachoTaqueria.region = "DC";
    verifiedApapachoTaqueria.postalCode = "20002";
    verifiedApapachoTaqueria.locationId = "washington-dc";
    verifiedApapachoTaqueria.displayAddress = "1280 4th Street Northeast, Washington, DC 20002";
    verifiedApapachoTaqueria.guideUrl = "https://www.apapachotaqueria.com/menu";
    verifiedApapachoTaqueria.guideLabel = "Current Apapacho menu";
    verifiedApapachoTaqueria.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedApapachoTaqueria.updated = "2026-07";
    verifiedApapachoTaqueria.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedApapachoTaqueria.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedApapachoTaqueria.coverageStatus = "complete";
    verifiedApapachoTaqueria.launchQualityStatus = "published";
    verifiedApapachoTaqueria.launchRemediationBucket = "none";
    verifiedApapachoTaqueria.sourceStatus = {
      ...(verifiedApapachoTaqueria.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-issued:https://www.apapachotaqueria.com/",
          "menu:restaurant-issued:https://www.apapachotaqueria.com/menu",
          "menu-and-ingredient-text:restaurant-issued:https://www.apapachotaqueria.com/uploads/b/7b001730-3593-11ef-a80d-fb22eb17238f/3a960d90-f595-11f0-9cc0-1bb54b8fbc87.pdf",
          "live-category-structure:restaurant-issued:https://www.apapachotaqueria.com/s/order",
          `product-inventory:restaurant-issued:${verifiedSnapshot.sourceUrls.find((url) => /products\?page=/.test(url))}`,
        ],
        configuredUrlWarnings: [
          "square-product-endpoint-is-inventory-history-not-current-menu-by-itself",
          "expired-events-holidays-and-preorders-remain-visible-in-square-inventory",
          "alcohol-and-duplicate-promotional-presentations-are-excluded",
          "oyster-mushroom-is-not-shellfish",
          "corn-masa-is-not-wheat",
          "owner-issued-menu-is-not-a-complete-allergen-matrix",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: verifiedSnapshot.excludedHistoricalInventoryCount,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourceInventoryProductCount: verifiedSnapshot.sourceInventoryProductCount,
      liveSquareCategoryCount: verifiedSnapshot.liveSquareCategoryCount,
      pdfOnlyProductCount: verifiedSnapshot.pdfOnlyItemCount,
      apiOnlyCurrentProductCount: verifiedSnapshot.apiOnlyCurrentItemCount,
      frozenStaleProductCount: 16,
      restoredCurrentProductCount: 6,
      frozenAllergenMismatchCount: 7,
      frozenMenuContentMismatchCount: 35,
      quarantinedItemExamples: [
        { id: "tacos-de-mushrooms", kind: "allergen-false-positive", name: "Tacos de Mushrooms", reasons: ["oyster-mushroom-tokenized-as-shellfish"] },
        { id: "fried-corn-quesadilla", kind: "allergen-false-positive", name: "Fried Corn Quesadilla", reasons: ["corn-masa-tokenized-as-wheat-and-gluten"] },
        { id: "8-course-tasting-dinner-las-quince-letras-x-apapacho", kind: "expired-event", name: "8 course Tasting Dinner - Las Quince Letras X Apapacho", reasons: ["sold-out-february-20-one-night-event"] },
        { id: "tamal", kind: "expired-preorder", name: "Tamal", reasons: ["january-31-to-february-2-window"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedApapachoTaqueria.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Apapacho Taqueria|Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 40, note: apapachoRepairNote },
      ],
    };
  }

  const verifiedApero = restaurant("replacement-apero-washington-dc");
  const aperoRepairNote =
    "Verified repair: rebuilt Apéro from its current owner-issued brunch, lunch, dinner, caviar, prix-fixe, and Caviar Hour PDFs, with its restaurant-linked Toast menu used only as corroboration, into 53 unique current food presentations across seven sections; reconciled all 49 frozen rows; retained 37 frozen presentations representing 30 current products, removed five PDF heading/price artifacts and seven alcohol, merchandise, obsolete, or POS-control rows, and restored 23 omitted current products; corrected all 37 matched menu categories/descriptions and 21 allergen outcomes; kept caviar species headings separate from the 15 actual selections, limited caviar signals to fish and the explicitly served crème-fraîche milk signal, labeled Nutella manufacturer ingredient intelligence separately, and invented no negative, may-contain, or cross-contact assurance.";
  if (
    verifiedApero &&
    (
      (verifiedApero.items ?? []).length !== 53 ||
      verifiedApero.sourceUpdatedAt !== "2026-07-15T08:04:57.441Z" ||
      new Set((verifiedApero.items ?? []).map((menuItem) => menuItem.category)).size !== 7 ||
      (verifiedApero.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 49 ||
      (verifiedApero.items ?? []).filter((menuItem) => menuItem.category === "Caviar Selections").length !== 15 ||
      !(verifiedApero.items ?? []).filter((menuItem) => menuItem.category === "Caviar Selections").every(
        (menuItem) => JSON.stringify([...(menuItem.allergens ?? [])].sort()) === JSON.stringify(["fish", "milk"]),
      ) ||
      !(verifiedApero.items ?? []).some((menuItem) =>
        menuItem.name === "Steamed PEI Mussels" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["shellfish"])
      ) ||
      !(verifiedApero.items ?? []).some((menuItem) =>
        menuItem.name === "Fresh Fruit and Yogurt Parfait" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["milk"])
      ) ||
      !(verifiedApero.items ?? []).some((menuItem) =>
        menuItem.name === "Escargot Tartine" &&
        ["gluten", "milk", "shellfish", "wheat"].every((allergen) => menuItem.allergens?.includes(allergen))
      ) ||
      (verifiedApero.items ?? []).some((menuItem) =>
        [
          "10g $82 /",
          "Absinthe Service",
          "Beluga Hybrid",
          "Insulated Caviar To-Go Bag",
          "Mother of Pearl Caviar spoons (set of 2)",
          "Osetra",
          "Side Salad",
          "Siberian Sturgeon",
          "White Sturgeon",
        ].includes(menuItem.name)
      ) ||
      (verifiedApero.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === aperoRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/replacement-apero-washington-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "replacement-apero-washington-dc",
      verifiedSnapshot,
      aperoRepairNote,
    );
    verifiedApero.name = "Apéro";
    verifiedApero.category = "French";
    verifiedApero.addressLine1 = "2622 P Street NW";
    verifiedApero.city = "Washington";
    verifiedApero.region = "DC";
    verifiedApero.postalCode = "20007";
    verifiedApero.locationId = "washington-dc";
    verifiedApero.displayAddress = "2622 P Street NW, Washington, DC 20007";
    verifiedApero.guideUrl = "https://www.aperodc.com/";
    verifiedApero.guideLabel = "Current Apéro menus";
    verifiedApero.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedApero.sourceFamily = "verified-apero-pdf-menu";
    verifiedApero.parserProfile = "verified-apero-pdf-menu";
    verifiedApero.sourceProfile = "verified-apero-pdf-menu:restaurant-issued-and-linked-menu";
    verifiedApero.updated = "2026-07";
    verifiedApero.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedApero.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedApero.coverageStatus = "complete";
    verifiedApero.launchQualityStatus = "published";
    verifiedApero.launchRemediationBucket = "none";
    verifiedApero.sourceStatus = {
      ...(verifiedApero.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity-and-menu-hub:restaurant-issued:https://www.aperodc.com/",
          `menu-and-ingredient-text:restaurant-issued:${verifiedSnapshot.sourceUrls.find((url) => /Brunch\+Menu/.test(url))}`,
          `menu-and-ingredient-text:restaurant-issued:${verifiedSnapshot.sourceUrls.find((url) => /Lunch\+06/.test(url))}`,
          `menu-and-ingredient-text:restaurant-issued:${verifiedSnapshot.sourceUrls.find((url) => /Dinner\+Menu/.test(url))}`,
          "menu-and-ingredient-text:restaurant-issued:https://www.aperodc.com/s/Caviar-Hour-923-1.pdf",
          "current-menu-corroboration:restaurant-linked-vendor:https://order.toasttab.com/online/apero-2622-p-nw",
          `named-product-ingredient-intelligence:manufacturer:${verifiedSnapshot.sourceUrls.find((url) => /nutella\.com/.test(url))}`,
        ],
        configuredUrlWarnings: [
          "legacy-/menu-route-returns-http-404; the owner home page is the current menu hub",
          "direct-automated-toast-fetch-is-blocked-by-cloudflare; captured readable proxy remains third-party transport",
          "toast-is-restaurant-linked-corroboration-not-a-restaurant-issued-allergen-matrix",
          "caviar-species-headings-and-size-price-fragments-are-not-products",
          "alcohol-merchandise-and-pos-controls-are-excluded",
          "owner-issued-menu-descriptions-are-not-a-complete-allergen-matrix",
          "missing-ingredient-terms-are-not-negative-allergen-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 12,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      caviarSelectionCount: verifiedSnapshot.caviarSelectionCount,
      frozenMatchedPresentationCount: 37,
      frozenMatchedCurrentProductCount: 30,
      frozenArtifactCount: 5,
      frozenStaleOrOutOfScopeCount: 7,
      restoredCurrentProductCount: 23,
      frozenAllergenMismatchCount: 21,
      frozenMenuContentMismatchCount: 37,
      quarantinedItemExamples: [
        { id: "10g-dollar82", kind: "pdf-price-fragment", name: "10g $82 /", reasons: ["detached-two-column-price-fragment"] },
        { id: "osetra", kind: "pdf-section-heading", name: "Osetra", reasons: ["species-heading-not-product"] },
        { id: "absinthe-service", kind: "alcohol", name: "Absinthe Service", reasons: ["alcohol-service-and-swallowed-adjacent-brunch-feature"] },
        { id: "insulated-caviar-to-go-bag", kind: "merchandise", name: "Insulated Caviar To-Go Bag", reasons: ["retail-accessory-not-food"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedApero.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Apéro|Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 53, note: aperoRepairNote },
      ],
    };
  }

  const verifiedApplebees = restaurant("applebees");
  const applebeesRepairNote =
    "Verified repair: rebuilt Applebee's from its current restaurant-linked Nutritionix allergen dataset generated July 13, 2026 and the official Applebee's menu, nutrition, and cross-contact disclosures into 130 active consumer-menu rows across 16 categories with beverages last; reconciled all 118 frozen rows; retained 106 exact current products, removed 12 expired all-you-can-eat or removed limited-time products, and restored 24 omitted current sampler, appetizer, kids, and beverage rows; corrected eight missing item-level allergen matrices and applied Applebee's explicit shared-prep/common-fryer allergen-and-gluten warning to all 130 rows; preserved 119 item-level matrix rows and 11 configurable shells as global-cross-contact-only, excluded 84 catering and 44 preview-only internal rows, and never represented source zeroes as allergen-free guarantees.";
  const applebeesGlobalMayContain = [
    "egg",
    "fish",
    "gluten",
    "milk",
    "peanut",
    "sesame",
    "shellfish",
    "soy",
    "tree-nut",
    "wheat",
  ];
  if (
    verifiedApplebees &&
    (
      (verifiedApplebees.items ?? []).length !== 130 ||
      verifiedApplebees.sourceUpdatedAt !== "2026-07-15T08:23:51.208Z" ||
      new Set((verifiedApplebees.items ?? []).map((menuItem) => menuItem.category)).size !== 16 ||
      verifiedApplebees.items?.at(-1)?.category !== "Beverages" ||
      (verifiedApplebees.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-allergen-menu",
      ).length !== 119 ||
      (verifiedApplebees.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-global-cross-contact-note",
      ).length !== 11 ||
      !(verifiedApplebees.items ?? []).every((menuItem) =>
        JSON.stringify([...(menuItem.mayContain ?? [])].sort()) === JSON.stringify(applebeesGlobalMayContain)
      ) ||
      !(verifiedApplebees.items ?? []).some((menuItem) =>
        menuItem.name === "Brownie Bite" &&
        ["egg", "gluten", "milk", "soy", "tree-nut", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedApplebees.items ?? []).some((menuItem) =>
        menuItem.name === "Sesame Salmon Bowl" &&
        ["fish", "gluten", "milk", "sesame", "soy", "tree-nut", "wheat"].every(
          (allergen) => menuItem.allergens?.includes(allergen),
        )
      ) ||
      !(verifiedApplebees.items ?? []).some((menuItem) => menuItem.name === "Kids Kraft® Macaroni & Cheese") ||
      !(verifiedApplebees.items ?? []).some((menuItem) => menuItem.name === "Coffee & Hot Tea") ||
      (verifiedApplebees.items ?? []).some((menuItem) =>
        [
          "Bacon Cheddar Crispy Chicken Sandwich (with Grilled Chicken)",
          "Boneless Wings, Initial Order",
          "Double Crunch Shrimp, Refill Order",
          "Impossible Cheeseburger",
          "Neighborhood Nachos (with Beef)",
          "Riblets, Refill Order",
          "Whole Lotta Bacon Burger",
        ].includes(menuItem.name)
      ) ||
      (verifiedApplebees.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === applebeesRepairNote,
      ).length !== 1 ||
      (verifiedApplebees.sourceStatus?.reviewedMenuQualityRepairs ?? []).some(
        (repair) => /Final generated repair: removed Applebee's internal-only, beverage, sampler-option/.test(
          String(repair.note ?? ""),
        ),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/applebees/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot("applebees", verifiedSnapshot, applebeesRepairNote);
    verifiedApplebees.name = "Applebee's";
    verifiedApplebees.category = "American";
    verifiedApplebees.locationId = null;
    verifiedApplebees.regionalScope = "national-menu-with-location-availability-variation";
    verifiedApplebees.type = "chain";
    verifiedApplebees.guideUrl = "https://www.applebees.com/en/nutrition/interactive-menu";
    verifiedApplebees.guideLabel = "Applebee's interactive nutrition and allergen menu";
    verifiedApplebees.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedApplebees.sourceFamily = "verified-applebees-nutritionix-allergen-menu";
    verifiedApplebees.parserProfile = "verified-applebees-nutritionix-allergen-menu";
    verifiedApplebees.sourceProfile = "verified-applebees:restaurant-linked-matrix-plus-official-global-note";
    verifiedApplebees.updated = "2026-07";
    verifiedApplebees.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedApplebees.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedApplebees.coverageStatus = "complete";
    verifiedApplebees.launchQualityStatus = "published";
    verifiedApplebees.launchRemediationBucket = "none";
    verifiedApplebees.sourceStatus = {
      ...(verifiedApplebees.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:restaurant-issued:https://www.applebees.com/en/menu",
          "allergen-policy-and-global-cross-contact:restaurant-issued:https://www.applebees.com/en/nutrition",
          "allergen-matrix-hub:restaurant-issued:https://www.applebees.com/en/nutrition/interactive-menu",
          "allergen-matrix-loader:restaurant-linked-vendor:https://restaurant.nutritionix.com/applebees/landing",
          "current-item-allergen-data:restaurant-linked-vendor:https://nix-vue-inm.s3.amazonaws.com/restaurant/applebees/data/menu-latest.json.gz",
        ],
        configuredUrlWarnings: [
          "direct-automated-nutrition-page-fetches-are-blocked-by-cloudflare; readable proxies remain third-party transport",
          "nutritionix-is-restaurant-linked-and-not-relabeled-restaurant-issued",
          "all-item-zeroes-are-not-safety-guarantees-because-applebees-publishes-a-global-shared-prep-common-fryer-warning",
          "highly-refined-soybean-fryer-oil-is-fda-exempt-from-soy-allergen-labeling",
          "ingredient-substitutions-and-location-availability-can-vary",
          "catering-and-preview-only-internal-rows-are-not-consumer-menu-products",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 12,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourceGeneratedAt: verifiedSnapshot.sourceGeneratedAt,
      sourceCategoryCount: verifiedSnapshot.sourceCategoryCount,
      sourceItemCount: verifiedSnapshot.sourceItemCount,
      sourceModifierCount: verifiedSnapshot.sourceModifierCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      itemAllergenMatrixCount: verifiedSnapshot.officialAllergenMenuCount,
      globalCrossContactOnlyCount: verifiedSnapshot.globalCrossContactOnlyCount,
      globalCrossContactAppliedCount: verifiedSnapshot.globalCrossContactAppliedCount,
      excludedCateringItemCount: verifiedSnapshot.excludedCateringItemCount,
      excludedPreviewOnlyItemCount: verifiedSnapshot.excludedPreviewOnlyItemCount,
      frozenMatchedProductCount: 106,
      frozenStaleProductCount: 12,
      restoredCurrentProductCount: 24,
      frozenFixedAllergenMismatchCount: 8,
      frozenGlobalCrossContactMismatchCount: 106,
      frozenAllergenMismatchCount: 106,
      frozenMenuContentMismatchCount: 0,
      quarantinedItemExamples: [
        { id: "boneless-wings-refill-order", kind: "expired-promotion", name: "Boneless Wings, Refill Order", reasons: ["expired-all-you-can-eat-presentation"] },
        { id: "whole-lotta-bacon-burger", kind: "removed-limited-time-product", name: "Whole Lotta Bacon Burger", reasons: ["absent-from-current-consumer-menu"] },
        { id: "catering-inm-only", kind: "internal-category", name: "Catering (INM Only)", reasons: ["not-consumer-menu-category"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedApplebees.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Applebee's|Final generated repair: removed rows rejected by the shared menu-item classifier\.|Final generated repair: removed Applebee's internal-only, beverage, sampler-option/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 130, note: applebeesRepairNote },
      ],
    };
  }

  const verifiedAracosia = restaurant("osm-aracosia-3584164912");
  const aracosiaRepairNote =
    "Verified repair: rebuilt Aracosia from its current owner-issued Wix menu, section, and item APIs into 107 canonical products across 12 source-backed categories; reconciled all 139 frozen rows as 98 exact matches, 18 meal-period variants, and 23 hidden or stale products; restored Firni and eight omitted ready-to-grill products; excluded four hidden menus and 144 hidden or unreferenced source items; corrected 99 menu category or description mismatches and 33 allergen outcomes; limited 57 official ingredient rows to explicit owner-named signals, kept 27 format-based risks separately labeled as Ingredient Intelligence, removed false mustard signals from mustard greens and unsupported sesame from the burger bun, and invented no allergen-free or cross-contact assurance.";
  if (
    verifiedAracosia &&
    (
      (verifiedAracosia.items ?? []).length !== 107 ||
      verifiedAracosia.sourceUpdatedAt !== "2026-07-15T08:52:19.828Z" ||
      new Set((verifiedAracosia.items ?? []).map((menuItem) => menuItem.category)).size !== 12 ||
      (verifiedAracosia.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 57 ||
      (verifiedAracosia.items ?? []).filter(
        (menuItem) => (menuItem.inferredAllergenSignals ?? []).length > 0,
      ).length !== 27 ||
      !(verifiedAracosia.items ?? []).some((menuItem) =>
        menuItem.name === "Firni" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["milk", "tree-nut"])
      ) ||
      !(verifiedAracosia.items ?? []).some((menuItem) =>
        menuItem.name === "Marinated Salmon (1lb) - READY TO GRILL, BBQ, COOK" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["fish"])
      ) ||
      !(verifiedAracosia.items ?? []).some((menuItem) =>
        menuItem.name === "Afghania Chicken" && menuItem.category === "Qormas"
      ) ||
      !(verifiedAracosia.items ?? []).some((menuItem) =>
        menuItem.name === "Bistro Burger" &&
        (menuItem.allergens ?? []).length === 0 &&
        JSON.stringify((menuItem.inferredAllergenSignals ?? []).map((signal) => signal.id)) ===
          JSON.stringify(["gluten", "wheat", "egg", "milk"])
      ) ||
      (verifiedAracosia.items ?? []).some((menuItem) =>
        ["Kids Beef Bistro Burger", "Saffron Chicken", "Mother's Day Special"].includes(menuItem.name)
      ) ||
      (verifiedAracosia.items ?? []).some((menuItem) =>
        ["Sabzi", "Sabzi Chalou"].includes(menuItem.name) &&
        (menuItem.inferredAllergenSignals ?? []).some((signal) => signal.id === "mustard")
      ) ||
      (verifiedAracosia.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === aracosiaRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-aracosia-3584164912/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-aracosia-3584164912",
      verifiedSnapshot,
      aracosiaRepairNote,
    );
    verifiedAracosia.name = "Aracosia";
    verifiedAracosia.category = "Afghan";
    verifiedAracosia.addressLine1 = "1381 Beverly Road";
    verifiedAracosia.city = "McLean";
    verifiedAracosia.region = "VA";
    verifiedAracosia.postalCode = "22101";
    verifiedAracosia.locationId = "fairfax-tysons-reston";
    verifiedAracosia.displayAddress = "1381 Beverly Road, McLean, VA 22101";
    verifiedAracosia.guideUrl = "https://www.aracosiamclean.com/menu-1?location=Beverly+Road";
    verifiedAracosia.guideLabel = "Current Aracosia menus";
    verifiedAracosia.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAracosia.sourceFamily = "verified-aracosia-wix-menu";
    verifiedAracosia.parserProfile = "verified-aracosia-wix-menu";
    verifiedAracosia.sourceProfile =
      "verified-aracosia-wix-menu:restaurant-issued-ingredients-plus-separated-inference";
    verifiedAracosia.updated = "2026-07";
    verifiedAracosia.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAracosia.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAracosia.coverageStatus = "complete";
    verifiedAracosia.launchQualityStatus = "published";
    verifiedAracosia.launchRemediationBucket = "none";
    verifiedAracosia.sourceStatus = {
      ...(verifiedAracosia.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "identity:restaurant-issued:https://www.aracosiamclean.com/",
          "menu-and-dietary-badges:restaurant-issued:https://www.aracosiamclean.com/menu-1?location=Beverly+Road",
          "menu-relationships:restaurant-issued-wix-api:https://www.aracosiamclean.com/_api/restaurants-menus-menu/v1/menus",
          "section-relationships:restaurant-issued-wix-api:https://www.aracosiamclean.com/_api/restaurants-menus-section/v1/sections",
          "item-composition:restaurant-issued-wix-api:https://www.aracosiamclean.com/_api/restaurants-menus-item/v1/items",
        ],
        configuredUrlWarnings: [
          "four-hidden-menus-and-hidden-items-are-not-current-public-products",
          "lunch-and-dinner-copies-are-consolidated-when-composition-is-identical",
          "gluten-free-vegan-and-vegetarian-badges-are-not-complete-allergen-matrices",
          "owner-menu-descriptions-support-positive-explicit-ingredients-only",
          "format-based-dough-bread-brioche-cake-and-baklava-risks-remain-ingredient-intelligence",
          "missing-ingredient-terms-are-not-negative-allergen-or-cross-contact-assurances",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 23,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourceMenuCount: verifiedSnapshot.sourceMenuCount,
      sourceSectionCount: verifiedSnapshot.sourceSectionCount,
      sourceItemCount: verifiedSnapshot.sourceItemCount,
      visibleMenuCount: verifiedSnapshot.visibleMenuCount,
      visiblePresentationCount: verifiedSnapshot.visiblePresentationCount,
      visibleUniqueNameCount: verifiedSnapshot.visibleUniqueNameCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      separatedIngredientIntelligenceCount: verifiedSnapshot.inferredRiskCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      excludedHiddenMenuCount: verifiedSnapshot.excludedHiddenMenuCount,
      excludedUnreferencedOrHiddenItemCount: verifiedSnapshot.excludedUnreferencedOrHiddenItemCount,
      frozenExactMatchCount: 98,
      frozenVariantMatchCount: 18,
      frozenMatchedCurrentProductCount: 98,
      frozenStaleProductCount: 23,
      restoredCurrentProductCount: 9,
      frozenAllergenMismatchCount: 33,
      frozenFixedAllergenMismatchCount: 7,
      frozenInferenceMismatchCount: 32,
      frozenProvenanceMismatchCount: 5,
      frozenMenuContentMismatchCount: 99,
      quarantinedItemExamples: [
        { id: "kids-beef-bistro-burger", kind: "hidden-menu-product", name: "Kids Beef Bistro Burger", reasons: ["kids-menu-is-hidden"] },
        { id: "saffron-chicken", kind: "hidden-item", name: "Saffron Chicken", reasons: ["item-is-hidden-in-current-wix-catalog"] },
        { id: "mothers-day-special", kind: "hidden-event-menu", name: "Mother's Day Special", reasons: ["event-menu-is-hidden"] },
        { id: "billecart-salmon-rose-champagne-nv", kind: "hidden-alcohol-menu", name: "Billecart Salmon, Rosé, Champagne, NV", reasons: ["bar-menu-is-hidden-and-name-is-not-fish-evidence"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAracosia.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Aracosia|Reviewed Aracosia menu cleanup|Final generated repair: removed rows rejected by the shared menu-item classifier\./.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: 107, note: aracosiaRepairNote },
      ],
    };
  }

  const verifiedArbys = restaurant("arbys");
  const arbysRepairNote =
    "Verified repair: rebuilt Arby's into 78 canonical consumer products from ten current owner menu-category pages and the restaurant-linked July 2026 U.S. nutrition/allergen and ingredient guides; reconciled all 66 frozen rows as 4 exact matches, 16 normalized product variants, and 46 component, topping, or add-on artifacts; restored 64 current products absent from the frozen output; removed national reliance on the location-specific Alliance Kitchen sheet; separated 27 common-fryer or facility-contact signals from fixed allergens; and left the newly advertised Orange Cream Shake unavailable because the current allergen PDF has no matching formulation row.";
  if (
    verifiedArbys &&
    (
      (verifiedArbys.items ?? []).length !== 78 ||
      verifiedArbys.sourceUpdatedAt !== "2026-07-15T09:00:04.402Z" ||
      (verifiedArbys.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "official-allergen-menu"
      ).length !== 77 ||
      (verifiedArbys.items ?? []).some((menuItem) =>
        ["Brioche Bun", "Au Jus", "Crispy Onions", "Whipped Topping"].includes(menuItem.name)
      ) ||
      !(verifiedArbys.items ?? []).some((menuItem) =>
        menuItem.name === "Crispy Chicken Sandwich" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["egg", "wheat"]) &&
        JSON.stringify(menuItem.mayContain ?? []) === JSON.stringify(["fish", "milk", "sesame", "soy"])
      ) ||
      !(verifiedArbys.items ?? []).some((menuItem) =>
        menuItem.name === "Orange Cream Shake" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0 &&
        (menuItem.mayContain ?? []).length === 0
      ) ||
      !(verifiedArbys.items ?? []).some((menuItem) => menuItem.name === "Bacon, Egg & Cheese Biscuit") ||
      !(verifiedArbys.items ?? []).some((menuItem) => menuItem.name === "Roast Beef Gyro") ||
      (verifiedArbys.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === arbysRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/arbys/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot("arbys", verifiedSnapshot, arbysRepairNote);
    verifiedArbys.name = "Arby's";
    verifiedArbys.category = "Sandwich";
    verifiedArbys.guideUrl = "https://www.arbys.com/nutrition/";
    verifiedArbys.guideLabel = "Current Arby's menu and allergen guides";
    verifiedArbys.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArbys.sourceFamily = "verified-arbys-current-menu-allergen";
    verifiedArbys.parserProfile = "verified-arbys-current-menu-allergen";
    verifiedArbys.sourceProfile =
      "verified-arbys-current-menu-allergen:consumer-products-not-component-glossary";
    verifiedArbys.updated = "2026-07";
    verifiedArbys.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArbys.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArbys.coverageStatus = "complete";
    verifiedArbys.launchQualityStatus = "published";
    verifiedArbys.launchRemediationBucket = "none";
    verifiedArbys.regionalScope = "us-national-plus-official-regional";
    verifiedArbys.sourceStatus = {
      ...(verifiedArbys.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "menu:restaurant-issued:https://www.arbys.com/menu/",
          "menu-categories:restaurant-issued:https://www.arbys.com/menu/categories/",
          `allergen-matrix:restaurant-issued:${verifiedSnapshot.sourceUrls.at(-2)}`,
          `item-composition:restaurant-issued:${verifiedSnapshot.sourceUrls.at(-1)}`,
        ],
        configuredUrlWarnings: [
          "meal-and-kids-meal-pages-are-configurable-bundle-shells-whose-components-are-cataloged-separately",
          "ingredient-component-glossary-rows-are-not-consumer-menu-products",
          "alliance-kitchen-sheet-applies-only-to-the-named-atlanta-shared-kitchen",
          "common-fryer-and-facility-markers-are-may-contain-signals-not-fixed-ingredients",
          "orange-cream-shake-is-currently-published-but-absent-from-the-current-allergen-guide",
          "formulations-and-regional-availability-may-vary-per-the-official-guide",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 46,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      publishedCategoryPageCount: verifiedSnapshot.publishedCategoryPageCount,
      publishedPresentationCount: verifiedSnapshot.publishedPresentationCount,
      publishedConfigurableShellCount: verifiedSnapshot.publishedShellCount,
      officialItemCount: verifiedSnapshot.officialAllergenCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      commonFryerOrFacilitySignalCount: verifiedSnapshot.commonFryerSignalCount,
      excludedComponentGlossary: true,
      frozenExactMatchCount: 4,
      frozenNormalizedMatchCount: 16,
      frozenMatchedCurrentProductCount: 14,
      frozenArtifactCount: 46,
      restoredCurrentProductCount: 64,
      frozenAllergenMismatchCount: 8,
      frozenFixedAllergenMismatchCount: 0,
      frozenCrossContactMismatchCount: 8,
      frozenProvenanceMismatchCount: 0,
      frozenMenuContentMismatchCount: 15,
      quarantinedItemExamples: [
        { id: "brioche-bun", kind: "ingredient-component", name: "Brioche Bun", reasons: ["component-glossary-not-consumer-product"] },
        { id: "au-jus", kind: "location-specific-component", name: "Au Jus", reasons: ["alliance-kitchen-only", "component-glossary-not-consumer-product"] },
        { id: "bacon-3-half-strips", kind: "topping", name: "Bacon- 3 half strips", reasons: ["topping-not-canonical-product"] },
        { id: "horseys-sauce", kind: "add-on", name: "Horsey Sauce®", reasons: ["add-on-not-canonical-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArbys.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Arby's|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: arbysRepairNote },
      ],
    };
  }

  const verifiedArenasGeorgetown = restaurant("arenas-georgetown-dc");
  const arenasGeorgetownRepairNote =
    "Verified repair: rebuilt Arena's Georgetown into 101 current consumer products from the restaurant's July 2026 owner menu, its currently linked kids menu, and its restaurant-linked Toast catalog; reconciled all 90 frozen rows as 82 exact-name products, 2 normalized products, 3 section-heading artifacts, and 3 stale products; restored 17 current products missing from the frozen output; restored 10 real source categories in place of the generic American category; and limited fixed allergen signals to ingredients expressly named in owner-issued menu text, leaving 32 products unavailable rather than treating menu format or linked-vendor text as official allergen evidence.";
  if (
    verifiedArenasGeorgetown &&
    (
      (verifiedArenasGeorgetown.items ?? []).length !== 101 ||
      verifiedArenasGeorgetown.sourceUpdatedAt !== "2026-07-15T09:20:53.792Z" ||
      new Set((verifiedArenasGeorgetown.items ?? []).map((menuItem) => menuItem.category)).size !== 10 ||
      (verifiedArenasGeorgetown.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "official-ingredients"
      ).length !== 69 ||
      (verifiedArenasGeorgetown.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "unavailable"
      ).length !== 32 ||
      (verifiedArenasGeorgetown.items ?? []).some((menuItem) =>
        ["Chicken Sandwiches", "Classic Sandwiches", "Veggie Options & Burgers", "Large Hot Tots", "Small Hot Tots", "Mac and Cheese Bites"].includes(menuItem.name)
      ) ||
      !(verifiedArenasGeorgetown.items ?? []).some((menuItem) =>
        menuItem.name === "California Club" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["egg", "gluten", "milk", "wheat"])
      ) ||
      !(verifiedArenasGeorgetown.items ?? []).some((menuItem) => menuItem.name === "Italian Cold Cut") ||
      !(verifiedArenasGeorgetown.items ?? []).some((menuItem) => menuItem.name === "Kids Chicken Tenders") ||
      (verifiedArenasGeorgetown.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === arenasGeorgetownRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/arenas-georgetown-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "arenas-georgetown-dc",
      verifiedSnapshot,
      arenasGeorgetownRepairNote,
    );
    verifiedArenasGeorgetown.guideUrl = "https://www.arenasdeliandbar.com/menu/";
    verifiedArenasGeorgetown.guideLabel = "Current Arena's Georgetown menus";
    verifiedArenasGeorgetown.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArenasGeorgetown.sourceFamily = "verified-arenas-georgetown-current-menu";
    verifiedArenasGeorgetown.parserProfile = "verified-arenas-georgetown-current-menu";
    verifiedArenasGeorgetown.sourceProfile =
      "verified-arenas-georgetown-current-menu:owner-pdf-plus-linked-toast";
    verifiedArenasGeorgetown.updated = "2026-07";
    verifiedArenasGeorgetown.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArenasGeorgetown.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArenasGeorgetown.coverageStatus = "complete";
    verifiedArenasGeorgetown.launchQualityStatus = "published";
    verifiedArenasGeorgetown.launchRemediationBucket = "none";
    verifiedArenasGeorgetown.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedArenasGeorgetown.sourceStatus = {
      ...(verifiedArenasGeorgetown.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "location:restaurant-issued:https://www.arenasdeliandbar.com/locations/georgetown/",
          "menu-index:restaurant-issued:https://www.arenasdeliandbar.com/menu/",
          "menu:restaurant-issued:https://www.arenasdeliandbar.com/wp-content/uploads/2018/01/Arenas-Menu-7-2026.pdf",
          "kids-menu:restaurant-issued:https://www.arenasdeliandbar.com/wp-content/uploads/2018/01/kids-menu-9-22.pdf",
          "ordering-menu:restaurant-linked:https://order.toasttab.com/online/arenas-georgetown",
        ],
        configuredUrlWarnings: [
          "direct-toast-archival-request-returned-http-403-so-the-linked-catalog-was-read-through-a-third-party-text-transport",
          "restaurant-linked-toast-text-is-menu-evidence-not-restaurant-issued-allergen-evidence",
          "owner-menu-descriptions-are-not-a-complete-allergen-matrix-or-cross-contact-disclosure",
          "positive-fixed-signals-are-limited-to-allergen-bearing-ingredients-explicitly-named-by-the-owner-menu",
          "bread-batter-wrap-and-other-format-based-risks-remain-ingredient-intelligence-unless-the-owner-names-the-allergen-bearing-ingredient",
          "the-current-owner-menu-page-still-links-the-september-2022-kids-menu",
          "closed-hours-toast-output-suppressed-sides-and-kids-so-current-owner-menu-links-were-used-to-complete-the-catalog",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 6,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      toastPresentationCount: verifiedSnapshot.toastPresentationCount,
      toastUniqueProductCount: verifiedSnapshot.toastUniqueProductCount,
      ownerSupplementalProductCount: verifiedSnapshot.ownerSupplementalProductCount,
      officialItemCount: verifiedSnapshot.officialIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      linkedOnlyProductCount: verifiedSnapshot.linkedOnlyProductCount,
      frozenExactMatchCount: 82,
      frozenNormalizedMatchCount: 2,
      frozenMatchedCurrentProductCount: 84,
      frozenArtifactCount: 3,
      frozenStaleProductCount: 3,
      restoredCurrentProductCount: 17,
      frozenAllergenMismatchCount: 20,
      frozenFixedAllergenMismatchCount: 20,
      frozenProvenanceMismatchCount: 5,
      frozenMenuContentMismatchCount: 84,
      quarantinedItemExamples: [
        { id: "chicken-sandwiches", kind: "section-heading", name: "Chicken Sandwiches", reasons: ["section-heading-not-consumer-product"] },
        { id: "veggie-options-burgers", kind: "section-heading", name: "Veggie Options & Burgers", reasons: ["section-heading-not-consumer-product"] },
        { id: "large-hot-tots", kind: "stale-product", name: "Large Hot Tots", reasons: ["absent-from-current-owner-and-linked-menus"] },
        { id: "mac-and-cheese-bites", kind: "stale-product", name: "Mac and Cheese Bites", reasons: ["absent-from-current-owner-and-linked-menus"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArenasGeorgetown.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Arena's Georgetown|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: arenasGeorgetownRepairNote },
      ],
    };
  }

  const verifiedArepaZone = restaurant("arepa-zone-dc");
  const arepaZoneRepairNote =
    "Verified repair: rebuilt Arepa Zone's DC-metro catalog into 75 unique current products from the restaurant-linked live Mosaico, 14th Street, and Western Market Square menus; preserved per-product location scope; reconciled all 49 frozen rows as 2 exact matches, 15 normalized products, 4 multi-section variants, 25 stale matrix-era products, and 3 concatenated-row artifacts; restored 51 current products absent from the frozen output; visually transcribed the 71-row owner matrix after the PDF parser dropped its graphical dots; restored 18 fixed-allergen and 21 facility-contact discrepancies among matched rows; and left 41 newer or unmapped products unavailable rather than extending the 2024 matrix beyond a defensible formulation match.";
  if (
    verifiedArepaZone &&
    (
      (verifiedArepaZone.items ?? []).length !== 75 ||
      verifiedArepaZone.sourceUpdatedAt !== "2026-07-15T09:41:45.995Z" ||
      new Set((verifiedArepaZone.items ?? []).map((menuItem) => menuItem.category)).size !== 14 ||
      (verifiedArepaZone.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "official-allergen-menu"
      ).length !== 33 ||
      (verifiedArepaZone.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "official-global-cross-contact-note"
      ).length !== 1 ||
      (verifiedArepaZone.items ?? []).filter((menuItem) =>
        menuItem.allergenSourceType === "unavailable"
      ).length !== 41 ||
      (verifiedArepaZone.items ?? []).some((menuItem) =>
        ["Albina", "Camarón", "Golfeados", "Patacón Viudo Tres Leches", "Perro Caraqueño Pepito Fondue"].includes(menuItem.name)
      ) ||
      !(verifiedArepaZone.items ?? []).some((menuItem) =>
        menuItem.name === "Tequeños de Queso" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["egg", "gluten", "milk", "soy", "wheat"])
      ) ||
      !(verifiedArepaZone.items ?? []).some((menuItem) =>
        menuItem.name === "Viuda Arepa" &&
        menuItem.allergenSourceType === "official-global-cross-contact-note" &&
        JSON.stringify(menuItem.mayContain ?? []) === JSON.stringify(["egg", "gluten", "milk", "wheat"])
      ) ||
      !(verifiedArepaZone.items ?? []).some((menuItem) => menuItem.name === "Pabellón Bowl Beef") ||
      !(verifiedArepaZone.items ?? []).some((menuItem) => menuItem.name === "Ovomaltina") ||
      (verifiedArepaZone.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === arepaZoneRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/arepa-zone-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot("arepa-zone-dc", verifiedSnapshot, arepaZoneRepairNote);
    verifiedArepaZone.guideUrl = "https://www.arepazone.com/pages/nutrition-allergens";
    verifiedArepaZone.guideLabel = "Current Arepa Zone DC menus and allergen guide";
    verifiedArepaZone.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArepaZone.sourceFamily = "verified-arepa-zone-dc-current-menu-allergen";
    verifiedArepaZone.parserProfile = "verified-arepa-zone-dc-current-menu-allergen";
    verifiedArepaZone.sourceProfile =
      "verified-arepa-zone-dc-current-menu-allergen:three-location-square-union";
    verifiedArepaZone.updated = "2026-07";
    verifiedArepaZone.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArepaZone.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArepaZone.coverageStatus = "complete";
    verifiedArepaZone.launchQualityStatus = "published";
    verifiedArepaZone.launchRemediationBucket = "none";
    verifiedArepaZone.regionalScope = "dc-metro-location-scoped-menu-with-intelligence-fallback";
    verifiedArepaZone.sourceStatus = {
      ...(verifiedArepaZone.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          "allergen-page:restaurant-issued:https://www.arepazone.com/pages/nutrition-allergens",
          `allergen-matrix:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          "owner-products:restaurant-issued:https://www.arepazone.com/collections/all/products.json?limit=250",
          "locations-api:restaurant-linked:https://order.arepazone.com/api/stores/869ecfeb-ca29-4710-93e9-45f873671acf/locations",
          ...verifiedSnapshot.sourceUrls.slice(-3).map((url) => `location-menu:restaurant-linked:${url}`),
        ],
        configuredUrlWarnings: [
          "the-current-allergen-guide-was-created-in-july-2024-but-remains-the-guide-linked-by-the-current-owner-allergen-page",
          "pdf-allergen-dots-are-vector-graphics-and-were-dropped-by-the-frozen-text-parser",
          "matrix-dots-are-fixed-allergens-while-the-wheat-milk-egg-facility-statement-is-cross-contact",
          "arepa-viuda-has-contradictory-wheat-and-gluten-free-owner-claims-so-only-the-facility-contact-warning-is-published",
          "restaurant-linked-square-food-allergen-metadata-is-not-promoted-to-restaurant-issued-evidence",
          "newer-products-without-defensible-matrix-formulation-matches-remain-unavailable",
          "the-dc-metro-row-is-a-deduplicated-union-and-variant-group-preserves-each-products-live-location-set",
          "the-owner-allergen-page-warns-that-suppliers-substitutions-and-shared-preparation-may-change-exposure",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 28,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      currentProductCountByLocation: verifiedSnapshot.currentProductCountByLocation,
      matrixPublishedRowCount: verifiedSnapshot.matrixPublishedRowCount,
      matrixMatchedCurrentProductCount: verifiedSnapshot.matrixMatchedCurrentProductCount,
      officialItemCount: verifiedSnapshot.officialAllergenCount,
      officialMatrixCount: verifiedSnapshot.officialMatrixCount,
      globalContactOnlyCount: verifiedSnapshot.globalContactOnlyCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      matrixFacilityScopeCount: verifiedSnapshot.matrixFacilityScopeCount,
      nonRedundantFacilityContactCount: verifiedSnapshot.nonRedundantFacilityContactCount,
      locationLimitedProductCount: verifiedSnapshot.locationLimitedProductCount,
      frozenExactMatchCount: 2,
      frozenNormalizedMatchCount: 15,
      frozenVariantMatchCount: 4,
      frozenMatchedCurrentProductCount: 24,
      frozenArtifactCount: 3,
      frozenStaleProductCount: 25,
      restoredCurrentProductCount: 51,
      frozenAllergenMismatchCount: 21,
      frozenFixedAllergenMismatchCount: 18,
      frozenCrossContactMismatchCount: 21,
      frozenProvenanceMismatchCount: 2,
      frozenMenuContentMismatchCount: 21,
      quarantinedItemExamples: [
        { id: "patacon-viudo-tres-leches", kind: "concatenated-matrix-rows", name: "Patacón Viudo Tres Leches", reasons: ["adjacent-pdf-rows-collapsed"] },
        { id: "perro-caraqueno-pepito-fondue", kind: "concatenated-matrix-rows", name: "Perro Caraqueño Pepito Fondue", reasons: ["adjacent-pdf-sections-collapsed"] },
        { id: "albina", kind: "stale-matrix-product", name: "Albina", reasons: ["absent-from-all-three-current-dc-menus"] },
        { id: "camaron", kind: "stale-matrix-product", name: "Camarón", reasons: ["absent-from-all-three-current-dc-menus"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArepaZone.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Arepa Zone's DC-metro|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: arepaZoneRepairNote },
      ],
    };
  }

  const verifiedArepasCapitol = restaurant("osm-arepas-capitol-12316378227");
  const arepasCapitolRepairNote =
    "Verified repair: replaced Arepas Capitol's nine corrupted homepage tiles with 85 canonical current products from 86 exact-address menu presentations; reconciled the frozen rows as one exact product, three normalized products, and five category-tile artifacts; restored 81 current products absent from the frozen output; removed the false official milk claim from Ham & Cheese Arepa because the retired homepage label was not a current restaurant-issued allergen disclosure; kept all current product allergen fields unavailable while preserving explicit third-party menu wording only as labeled Ingredient Intelligence; and invented no negative or cross-contact claim.";
  if (
    verifiedArepasCapitol &&
    (
      (verifiedArepasCapitol.items ?? []).length !== 85 ||
      verifiedArepasCapitol.sourceUpdatedAt !== "2026-07-15T09:56:29.610Z" ||
      new Set((verifiedArepasCapitol.items ?? []).map((menuItem) => menuItem.category)).size !== 13 ||
      (verifiedArepasCapitol.items ?? []).some((menuItem) => menuItem.allergenSourceType !== "unavailable") ||
      (verifiedArepasCapitol.items ?? []).some((menuItem) => (menuItem.allergens ?? []).length > 0 || (menuItem.mayContain ?? []).length > 0) ||
      (verifiedArepasCapitol.items ?? []).some((menuItem) =>
        ["Cachapa", "Cakes", "Empanadas", "Fresh Juices", "Pepito"].includes(menuItem.name)
      ) ||
      ![
        "4 Tequeños",
        "Jamon Y Queso (Ham and Cheese)",
        "Pollo Mechado (Shredded Chicken)",
        "La Sifrina Burger",
        "Parrilla Mar Y Tierra",
        "Chicha (Cooked Rice with Milk Cream)",
      ].every((name) => (verifiedArepasCapitol.items ?? []).some((menuItem) => menuItem.name === name)) ||
      [...new Set((verifiedArepasCapitol.items ?? []).map((menuItem) => menuItem.category))].at(-1) !== "Natural Juices" ||
      (verifiedArepasCapitol.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === arepasCapitolRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-arepas-capitol-12316378227/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-arepas-capitol-12316378227",
      verifiedSnapshot,
      arepasCapitolRepairNote,
    );
    verifiedArepasCapitol.name = "Arepas Capitol";
    verifiedArepasCapitol.category = "Venezuelan";
    verifiedArepasCapitol.addressLine1 = "1000 Cannons Ct Unit 105";
    verifiedArepasCapitol.city = "Woodbridge";
    verifiedArepasCapitol.region = "VA";
    verifiedArepasCapitol.postalCode = "22191";
    verifiedArepasCapitol.locationId = "woodbridge-va";
    verifiedArepasCapitol.displayAddress = "1000 Cannons Ct Unit 105, Woodbridge, VA 22191";
    verifiedArepasCapitol.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedArepasCapitol.guideLabel = "Reviewed current exact-address menu";
    verifiedArepasCapitol.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArepasCapitol.sourceFamily = "verified-arepas-capitol-reviewed-current-menu";
    verifiedArepasCapitol.parserProfile = "verified-arepas-capitol-reviewed-current-menu";
    verifiedArepasCapitol.sourceProfile =
      "verified-arepas-capitol-reviewed-current-menu:third-party-menu-with-separated-intelligence";
    verifiedArepasCapitol.updated = "2026-07";
    verifiedArepasCapitol.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArepasCapitol.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArepasCapitol.coverageStatus = "complete";
    verifiedArepasCapitol.launchQualityStatus = "published";
    verifiedArepasCapitol.launchRemediationBucket = "none";
    verifiedArepasCapitol.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedArepasCapitol.sourceStatus = {
      ...(verifiedArepasCapitol.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu:reviewed-third-party-merchant-set:${verifiedSnapshot.sourceUrls[0]}`,
          `current-menu-corroboration:third-party:${verifiedSnapshot.sourceUrls[1]}`,
          `current-menu-corroboration:third-party:${verifiedSnapshot.sourceUrls[2]}`,
          `reviewed-menu-pdf:third-party:${verifiedSnapshot.sourceUrls[3]}`,
          `replacement-domain-live-state:restaurant-branded-domain:${verifiedSnapshot.sourceUrls[4]}`,
          `retired-domain:historical:${verifiedSnapshot.sourceUrls[5]}`,
        ],
        configuredUrlWarnings: [
          "the-configured-arepascapitolusa-domain-no-longer-resolves",
          "the-replacement-restaurant-branded-domain-now-serves-a-generic-fromtherestaurant-download-page",
          "current-exact-address-doordash-beyond-menu-and-uber-eats-catalogs-are-third-party",
          "door-dash-labels-prices-as-set-directly-by-the-merchant-but-does-not-become-restaurant-issued-allergen-evidence",
          "the-third-party-pdf-is-an-april-2026-auto-generated-menu-and-not-an-allergen-guide",
          "eight-tostones-appears-in-two-source-sections-and-is-one-canonical-product",
          "third-party-description-clues-remain-labeled-ingredient-intelligence",
          "no-current-restaurant-issued-allergen-matrix-complete-ingredient-list-or-cross-contact-disclosure-was-found",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 5,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourcePresentationCount: verifiedSnapshot.sourcePresentationCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      officialItemCount: 0,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 1,
      frozenNormalizedMatchCount: 3,
      frozenMatchedCurrentProductCount: 4,
      frozenArtifactCount: 5,
      restoredCurrentProductCount: 81,
      frozenAllergenMismatchCount: 1,
      frozenFixedAllergenMismatchCount: 1,
      frozenProvenanceMismatchCount: 1,
      frozenMenuContentMismatchCount: 4,
      quarantinedItemExamples: [
        { id: "cachapa", kind: "homepage-category-tile", name: "Cachapa", reasons: ["category-tile-not-consumer-product", "truncated-view-description"] },
        { id: "cakes", kind: "homepage-category-tile", name: "Cakes", reasons: ["category-tile-not-consumer-product", "false-official-allergen-promotion"] },
        { id: "empanadas", kind: "homepage-category-tile", name: "Empanadas", reasons: ["category-tile-not-consumer-product", "truncated-view-description"] },
        { id: "fresh-juices", kind: "homepage-category-tile", name: "Fresh Juices", reasons: ["category-tile-not-consumer-product", "truncated-view-description"] },
        { id: "pepito", kind: "homepage-category-tile", name: "Pepito", reasons: ["category-tile-not-consumer-product", "truncated-view-description"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArepasCapitol.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: replaced Arepas Capitol's nine corrupted homepage tiles|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: arepasCapitolRepairNote },
      ],
    };
  }

  const verifiedAriakeReston = restaurant("ariake-japanese-restaurant-reston-va-dc-metro");
  const ariakeRestonRepairNote =
    "Verified repair: rebuilt Ariake Reston into 235 current non-alcohol food products across 23 categories from the current owner Reston menu and restaurant-linked Toast catalog; removed ten Fairfax-only rows, four nested dinner-bento components, the ordering-hours and sushi-option artifacts, alcohol, and merchandise; reconciled all 190 frozen rows as 117 exact, 55 normalized, two split variants, ten Fairfax location mismatches, and six artifacts; restored 67 current products; corrected 141 fixed-allergen and provenance outcomes and 150 menu-content mismatches; represented only direct positive current menu terms, including the explicit Hire Katsu milk-marinade allergy note; treated imitation crab as fish rather than shellfish; and invented no negative or cross-contact claim.";
  if (
    verifiedAriakeReston &&
    (
      (verifiedAriakeReston.items ?? []).length !== 235 ||
      verifiedAriakeReston.sourceUpdatedAt !== "2026-07-15T10:06:39.227Z" ||
      new Set((verifiedAriakeReston.items ?? []).map((menuItem) => menuItem.category)).size !== 23 ||
      (verifiedAriakeReston.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 186 ||
      (verifiedAriakeReston.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 49 ||
      (verifiedAriakeReston.items ?? []).some((menuItem) => (menuItem.mayContain ?? []).length > 0) ||
      (verifiedAriakeReston.items ?? []).some((menuItem) =>
        [
          "FAIRFAX ONLINE ORDERING HOURS:",
          "a) with 6 pcs California Roll OR",
          "Albacore Tataki",
          "Alaskan Salmon Roll",
          "Miller Light",
          "Wanna Roll Youth Medium",
        ].includes(menuItem.name)
      ) ||
      ![
        "Hire Katsu",
        "Kani",
        "Cashew Shrimp Tempura Roll",
        "Dinner Bento Box",
        "Takoyaki",
        "Aji",
        "Zuwaigani",
      ].every((name) => (verifiedAriakeReston.items ?? []).some((menuItem) => menuItem.name === name)) ||
      (verifiedAriakeReston.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === ariakeRestonRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/ariake-japanese-restaurant-reston-va-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "ariake-japanese-restaurant-reston-va-dc-metro",
      verifiedSnapshot,
      ariakeRestonRepairNote,
    );
    verifiedAriakeReston.name = "Ariake Japanese Restaurant";
    verifiedAriakeReston.category = "Japanese";
    verifiedAriakeReston.addressLine1 = "12184 Glade Drive";
    verifiedAriakeReston.city = "Reston";
    verifiedAriakeReston.region = "VA";
    verifiedAriakeReston.postalCode = "20191";
    verifiedAriakeReston.locationId = "reston-va";
    verifiedAriakeReston.displayAddress = "12184 Glade Drive, Reston, VA 20191";
    verifiedAriakeReston.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedAriakeReston.guideLabel = "Current Ariake Reston menu";
    verifiedAriakeReston.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAriakeReston.sourceFamily = "verified-ariake-reston-current-menu";
    verifiedAriakeReston.parserProfile = "verified-ariake-reston-current-menu";
    verifiedAriakeReston.sourceProfile =
      "verified-ariake-reston-current-menu:owner-menu-plus-linked-toast";
    verifiedAriakeReston.updated = "2026-07";
    verifiedAriakeReston.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAriakeReston.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAriakeReston.coverageStatus = "complete";
    verifiedAriakeReston.launchQualityStatus = "published";
    verifiedAriakeReston.launchRemediationBucket = "none";
    verifiedAriakeReston.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAriakeReston.sourceStatus = {
      ...(verifiedAriakeReston.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `ordering-link:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          `current-menu:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[2]}`,
          `capture-transport:third-party:${verifiedSnapshot.sourceUrls[3]}`,
        ],
        configuredUrlWarnings: [
          "the-audit-is-scoped-to-the-reston-location-and-excludes-fairfax-only-products",
          "the-direct-linked-toast-capture-returned-http-403-during-the-audit",
          "the-jina-copy-is-only-a-readable-transport-for-the-restaurant-linked-toast-catalog",
          "the-owner-and-linked-toast-menu-descriptions-are-not-a-complete-allergen-matrix",
          "only-explicit-positive-ingredient-signals-are-represented",
          "no-current-restaurant-issued-negative-allergen-or-cross-contact-disclosure-was-found",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 54,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      liveToastFoodProductCount: verifiedSnapshot.liveToastFoodProductCount,
      ownerFoodPresentationCount: verifiedSnapshot.ownerFoodPresentationCount,
      ownerLunchSupplementCount: verifiedSnapshot.ownerLunchSupplementCount,
      ownerHappyHourSupplementCount: verifiedSnapshot.ownerHappyHourSupplementCount,
      ownerNigiriSupplementCount: verifiedSnapshot.ownerNigiriSupplementCount,
      ownerDinnerSupplementCount: verifiedSnapshot.ownerDinnerSupplementCount,
      excludedOwnerHelperCount: verifiedSnapshot.excludedOwnerHelperCount,
      excludedAlcoholCount: verifiedSnapshot.excludedAlcoholCount,
      excludedMerchandiseCount: verifiedSnapshot.excludedMerchandiseCount,
      officialItemCount: verifiedSnapshot.officialIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 117,
      frozenNormalizedMatchCount: 55,
      frozenVariantMatchCount: 2,
      frozenArtifactCount: 6,
      frozenLocationMismatchCount: 10,
      frozenMatchedCurrentProductCount: 168,
      restoredCurrentProductCount: 67,
      frozenAllergenMismatchCount: 141,
      frozenFixedAllergenMismatchCount: 141,
      frozenProvenanceMismatchCount: 141,
      frozenMenuContentMismatchCount: 150,
      quarantinedItemExamples: [
        { id: "fairfax-online-ordering-hours", kind: "ordering-hours-artifact", name: "FAIRFAX ONLINE ORDERING HOURS:", reasons: ["not-a-product"] },
        { id: "california-roll-option", kind: "nested-sushi-option", name: "a) with 6 pcs California Roll OR", reasons: ["not-a-standalone-product"] },
        { id: "albacore-tataki", kind: "location-mismatch", name: "Albacore Tataki", reasons: ["fairfax-only"] },
        { id: "alaskan-salmon-roll", kind: "location-mismatch", name: "Alaskan Salmon Roll", reasons: ["fairfax-only"] },
        { id: "miller-light", kind: "excluded-alcohol", name: "Miller Light", reasons: ["non-food-alcohol"] },
        { id: "wanna-roll-youth-medium", kind: "excluded-merchandise", name: "Wanna Roll Youth Medium", reasons: ["merchandise"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAriakeReston.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Ariake Reston|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: ariakeRestonRepairNote },
      ],
    };
  }

  const verifiedArmettas = restaurant("osm-armetta-s-italian-pizzeria-3935138350");
  const armettasRepairNote =
    "Verified repair: rebuilt Armetta's current owner menu into 225 standalone products across 19 categories; reconciled all 238 frozen rows as 186 exact products, five normalized products, and 47 modifier artifacts; restored 34 current products; removed toppings, sauces, protein choices, quantity options, and stale indexed products from the product boundary; corrected 142 fixed-allergen outcomes, 29 provenance outcomes, and 80 menu-content mismatches; retained 191 partial positive restaurant-issued ingredient rows and 34 accurately unavailable rows; kept configurable gluten-free create-your-own pasta free of a false fixed wheat claim; kept optional cheese or sauce choices out of fixed allergen fields; and invented no negative or cross-contact claim.";
  if (
    verifiedArmettas &&
    (
      (verifiedArmettas.items ?? []).length !== 225 ||
      verifiedArmettas.sourceUpdatedAt !== "2026-07-15T10:27:30.497Z" ||
      new Set((verifiedArmettas.items ?? []).map((menuItem) => menuItem.category)).size !== 19 ||
      (verifiedArmettas.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 191 ||
      (verifiedArmettas.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 34 ||
      (verifiedArmettas.items ?? []).some((menuItem) => (menuItem.mayContain ?? []).length > 0) ||
      (verifiedArmettas.items ?? []).some((menuItem) =>
        [
          "All Drums",
          "Feta",
          "Spinach",
          "9\" Extra Meat",
          "Chef Salad",
          "Broccoli Cheese Balls",
          "Tartufo",
          "Medium Half/Half Specialty",
        ].includes(menuItem.name)
      ) ||
      ![
        "Arancini",
        "Lunch Rigatoni Vodka",
        "Onion Rings",
        "Rigatoni Vodka",
        "Oreo cake",
        "Sicilian Soda",
        "Side Alfredo Sauce 4oz",
      ].every((name) => (verifiedArmettas.items ?? []).some((menuItem) => menuItem.name === name)) ||
      (verifiedArmettas.items ?? []).at(-1)?.category !== "To Go Drinks" ||
      (verifiedArmettas.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === armettasRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-armetta-s-italian-pizzeria-3935138350/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-armetta-s-italian-pizzeria-3935138350",
      verifiedSnapshot,
      armettasRepairNote,
    );
    verifiedArmettas.name = "Armetta's Italian Grill & Pizzeria";
    verifiedArmettas.category = "Italian";
    verifiedArmettas.addressLine1 = "5524 Staple Mill Plaza";
    verifiedArmettas.city = "Dale City";
    verifiedArmettas.region = "VA";
    verifiedArmettas.postalCode = "22193";
    verifiedArmettas.locationId = "dale-city-va";
    verifiedArmettas.displayAddress = "5524 Staple Mill Plaza, Dale City, VA 22193";
    verifiedArmettas.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedArmettas.guideLabel = "Current Armetta's owner menu";
    verifiedArmettas.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArmettas.sourceFamily = "verified-armettas-current-owner-menu";
    verifiedArmettas.parserProfile = "verified-armettas-current-owner-menu";
    verifiedArmettas.sourceProfile =
      "verified-armettas-current-owner-menu:owner-menu-via-readable-transport";
    verifiedArmettas.updated = "2026-07";
    verifiedArmettas.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArmettas.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArmettas.coverageStatus = "complete";
    verifiedArmettas.launchQualityStatus = "published";
    verifiedArmettas.launchRemediationBucket = "none";
    verifiedArmettas.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedArmettas.sourceStatus = {
      ...(verifiedArmettas.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `retired-menu-alias:restaurant-issued-redirect:${verifiedSnapshot.sourceUrls[1]}`,
          `capture-transport:third-party:${verifiedSnapshot.sourceUrls[2]}`,
        ],
        configuredUrlWarnings: [
          "the-direct-archival-request-is-blocked-by-a-cloudflare-managed-challenge",
          "the-jina-copy-is-only-a-readable-transport-for-the-current-owner-menu",
          "a-transient-indexed-242-product-view-contained-stale-products-whose-item-links-open-the-current-225-product-menu-without-those-items",
          "the-frozen-structured-parser-promoted-modifiers-and-options-to-products",
          "the-owner-menu-is-not-a-complete-allergen-matrix",
          "only-positive-direct-ingredient-and-unambiguous-product-form-signals-are-represented",
          "no-current-restaurant-issued-negative-allergen-or-cross-contact-disclosure-was-found",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 47,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      configurableItemCount: verifiedSnapshot.configurableItemCount,
      officialItemCount: verifiedSnapshot.officialIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 186,
      frozenNormalizedMatchCount: 5,
      frozenArtifactCount: 47,
      frozenMatchedCurrentProductCount: 191,
      restoredCurrentProductCount: 34,
      frozenAllergenMismatchCount: 142,
      frozenFixedAllergenMismatchCount: 142,
      frozenProvenanceMismatchCount: 29,
      frozenMenuContentMismatchCount: 80,
      quarantinedItemExamples: [
        { id: "all-drums", kind: "modifier-artifact", name: "All Drums", reasons: ["wing-modifier-not-product"] },
        { id: "feta", kind: "modifier-artifact", name: "Feta", reasons: ["pizza-topping-not-product"] },
        { id: "spinach", kind: "modifier-artifact", name: "Spinach", reasons: ["pizza-topping-not-product"] },
        { id: "extra-meat", kind: "modifier-artifact", name: "9\" Extra Meat", reasons: ["sub-modifier-not-product"] },
        { id: "shrimp-five", kind: "modifier-artifact", name: "Shrimp (5)", reasons: ["salad-protein-modifier-not-product"] },
        { id: "chef-salad", kind: "stale-indexed-product", name: "Chef Salad", reasons: ["absent-from-current-owner-menu"] },
        { id: "tartufo", kind: "stale-indexed-product", name: "Tartufo", reasons: ["item-link-opens-current-menu-without-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArmettas.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Armetta's current owner menu|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: armettasRepairNote },
      ],
    };
  }

  const verifiedAromaPizza = restaurant("aroma-pizza-lorton-dc-metro");
  const aromaPizzaRepairNote =
    "Verified repair: rebuilt Aroma Pizza Company Lorton's exact-address current restaurant-linked Toast catalog into 199 standalone products across 16 consumer categories; reconciled all 178 frozen rows as 163 exact products, seven normalized products, and eight heading or duplicate artifacts; restored 29 current products; corrected the frozen all-Pizza categorization for all 170 matched products; removed 109 unsupported fixed-allergen and provenance outcomes; kept all 199 allergen rows accurately unavailable because the configured owner domain is compromised, no restaurant-issued allergen disclosure was found, and Toast is vendor evidence only; retained menu wording solely as separate Ingredient Intelligence; placed beverages last; and invented no negative or cross-contact claim.";
  if (
    verifiedAromaPizza &&
    (
      (verifiedAromaPizza.items ?? []).length !== 199 ||
      verifiedAromaPizza.sourceUpdatedAt !== "2026-07-15T10:40:29.922Z" ||
      new Set((verifiedAromaPizza.items ?? []).map((menuItem) => menuItem.category)).size !== 16 ||
      (verifiedAromaPizza.items ?? []).some(
        (menuItem) => menuItem.allergenSourceType !== "unavailable" ||
          (menuItem.allergens ?? []).length > 0 ||
          (menuItem.mayContain ?? []).length > 0,
      ) ||
      (verifiedAromaPizza.items ?? []).some((menuItem) =>
        [
          "Baked Pastas",
          "Cheese Pizzas make your own",
          "Chicken pastas",
          "Chicken Pizza",
          "Pastas make your own (add topping)",
          "Seafood Pasta",
          "Soup & Salad",
          "Wings",
        ].includes(menuItem.name)
      ) ||
      ![
        "10'' Philly Steak Pizza",
        "Fries",
        "Steamed Broccoli",
        "Family deal 2 Large 1 topping pizzas, 10 wings & mozzarella sticks",
        "Can Soda",
        "AleoVera drink",
      ].every((name) => (verifiedAromaPizza.items ?? []).some((menuItem) => menuItem.name === name)) ||
      (verifiedAromaPizza.items ?? []).at(-1)?.category !== "Drinks" ||
      (verifiedAromaPizza.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === aromaPizzaRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/aroma-pizza-lorton-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "aroma-pizza-lorton-dc-metro",
      verifiedSnapshot,
      aromaPizzaRepairNote,
    );
    verifiedAromaPizza.name = "Aroma Pizza Company";
    verifiedAromaPizza.category = "Pizza";
    verifiedAromaPizza.addressLine1 = "7200 Telegraph Square Drive, Suite J";
    verifiedAromaPizza.city = "Lorton";
    verifiedAromaPizza.region = "VA";
    verifiedAromaPizza.postalCode = "22079";
    verifiedAromaPizza.locationId = "lorton-va";
    verifiedAromaPizza.displayAddress = "7200 Telegraph Square Drive, Suite J, Lorton, VA 22079";
    verifiedAromaPizza.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedAromaPizza.guideLabel = "Current restaurant-linked Toast menu";
    verifiedAromaPizza.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAromaPizza.sourceFamily = "verified-aroma-pizza-current-toast-menu";
    verifiedAromaPizza.parserProfile = "verified-aroma-pizza-current-toast-menu";
    verifiedAromaPizza.sourceProfile =
      "verified-aroma-pizza-current-toast-menu:exact-address-toast-plus-readable-transport";
    verifiedAromaPizza.updated = "2026-07";
    verifiedAromaPizza.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAromaPizza.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAromaPizza.coverageStatus = "complete";
    verifiedAromaPizza.launchQualityStatus = "published";
    verifiedAromaPizza.launchRemediationBucket = "none";
    verifiedAromaPizza.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAromaPizza.sourceStatus = {
      ...(verifiedAromaPizza.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[0]}`,
          `capture-transport:third-party:${verifiedSnapshot.sourceUrls[1]}`,
          "configured-owner-domain:restaurant-issued:https://www.aromapizzacompany.com/",
          "current-social-profile:restaurant-issued:https://www.instagram.com/aromapizzacompany/",
        ],
        configuredUrlWarnings: [
          "the-configured-owner-domain-currently-serves-unrelated-gambling-and-seo-content-and-cannot-support-menu-or-allergen-claims",
          "the-current-instagram-profile-could-not-be-fetched-during-the-audit",
          "no-current-restaurant-issued-allergen-guide-matrix-or-cross-contact-disclosure-was-found",
          "toast-is-restaurant-linked-vendor-menu-evidence-not-an-official-allergen-source",
          "the-readable-jina-copy-omitted-four-cheese-pizzas-eight-drinks-and-six-coupons-that-were-recovered-from-the-live-toast-view",
          "the-frozen-parser-promoted-section-headings-and-a-duplicate-manual-chicken-pizza-repair-to-products",
          "the-frozen-parser-assigned-every-product-to-pizza-and-truncated-several-descriptions",
          "all-menu-wording-is-retained-only-as-separate-ingredient-intelligence",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 8,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      configurableItemCount: verifiedSnapshot.configurableItemCount,
      officialItemCount: 0,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 163,
      frozenNormalizedMatchCount: 7,
      frozenArtifactCount: 8,
      frozenMatchedCurrentProductCount: 170,
      restoredCurrentProductCount: 29,
      frozenAllergenMismatchCount: 109,
      frozenFixedAllergenMismatchCount: 109,
      frozenProvenanceMismatchCount: 109,
      frozenMenuContentMismatchCount: 170,
      quarantinedItemExamples: [
        { id: "wings", kind: "section-heading-artifact", name: "Wings", reasons: ["not-a-product"] },
        { id: "soup-and-salad", kind: "section-heading-artifact", name: "Soup & Salad", reasons: ["not-a-product"] },
        { id: "baked-pastas", kind: "section-heading-artifact", name: "Baked Pastas", reasons: ["not-a-product"] },
        { id: "chicken-pizza", kind: "duplicate-manual-repair-artifact", name: "Chicken Pizza", reasons: ["duplicates-current-chicken-calzone"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAromaPizza.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Aroma Pizza Company Lorton's|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: aromaPizzaRepairNote },
      ],
    };
  }

  const verifiedAromaBanquet = restaurant("osm-aroma-banquet-1395623894");
  const aromaBanquetRepairNote =
    "Verified repair: rebuilt Aroma Restaurant Bar & Banquet from its current owner-linked 99-product dine-in PDF and 90-product Wix ordering subset into 99 products across 15 consumer categories; reconciled all 110 frozen rows as 94 exact products, one normalized Chicken 65 product, ten parser artifacts, and five superseded Wix-inventory products; restored Mint & Coriander, Tamarind, Matter Pulao, and Gulab Jamoon; corrected all 95 matched generic categories or descriptions and 17 allergen outcomes; retained 63 positive restaurant-named ingredient rows, kept four unspecified-batter or flavor risks as separate Ingredient Intelligence, removed false milk from creamy mustard greens and false tree-nut from coconut, represented raita-served biryanis as milk, and invented no allergen-free or cross-contact assurance.";
  if (
    verifiedAromaBanquet &&
    (
      (verifiedAromaBanquet.items ?? []).length !== 99 ||
      verifiedAromaBanquet.sourceUpdatedAt !== "2026-07-15T11:05:27.183Z" ||
      new Set((verifiedAromaBanquet.items ?? []).map((menuItem) => menuItem.category)).size !== 15 ||
      (verifiedAromaBanquet.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 63 ||
      (verifiedAromaBanquet.items ?? []).filter(
        (menuItem) => (menuItem.inferredAllergenSignals ?? []).length > 0,
      ).length !== 4 ||
      (verifiedAromaBanquet.items ?? []).some((menuItem) =>
        [
          "Get More Form Submissions",
          "Beats & Bites",
          "Perfume Making",
          "House Dressings",
          "Chili Rellieno",
          "Salmon en Cilantro",
          "Seekh Kebab Taquitos",
          "Soft Tacos",
          "Spinach & Potato Taquitos",
        ].includes(menuItem.name)
      ) ||
      ![
        "Mint & Coriander",
        "Tamarind",
        "Matter Pulao",
        "Gulab Jamoon",
      ].every((name) => (verifiedAromaBanquet.items ?? []).some((menuItem) => menuItem.name === name)) ||
      !(verifiedAromaBanquet.items ?? []).some((menuItem) =>
        menuItem.name === "Bagara Baigan" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["peanut", "sesame"])
      ) ||
      !(verifiedAromaBanquet.items ?? []).some((menuItem) =>
        menuItem.name === "Gajjar Halwa" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["milk", "tree-nut"])
      ) ||
      !(verifiedAromaBanquet.items ?? []).some((menuItem) =>
        menuItem.name === "Vegetable Biryani" &&
        JSON.stringify(menuItem.allergens ?? []) === JSON.stringify(["milk"])
      ) ||
      !(verifiedAromaBanquet.items ?? []).some((menuItem) =>
        menuItem.name === "Sarso Ka Saag" &&
        menuItem.allergenSourceType === "unavailable" &&
        (menuItem.allergens ?? []).length === 0
      ) ||
      (verifiedAromaBanquet.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === aromaBanquetRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-aroma-banquet-1395623894/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-aroma-banquet-1395623894",
      verifiedSnapshot,
      aromaBanquetRepairNote,
    );
    verifiedAromaBanquet.name = "Aroma Restaurant Bar & Banquet";
    verifiedAromaBanquet.category = "Indian";
    verifiedAromaBanquet.addressLine1 = "12821 Fair Lakes Parkway";
    verifiedAromaBanquet.city = "Fairfax";
    verifiedAromaBanquet.region = "VA";
    verifiedAromaBanquet.postalCode = "22033";
    verifiedAromaBanquet.locationId = "fairfax";
    verifiedAromaBanquet.displayAddress = "12821 Fair Lakes Parkway, Fairfax, VA 22033";
    verifiedAromaBanquet.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedAromaBanquet.guideLabel = "Current Aroma dine-in menu";
    verifiedAromaBanquet.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAromaBanquet.sourceFamily = "verified-aroma-banquet-owner-menu";
    verifiedAromaBanquet.parserProfile = "verified-aroma-banquet-owner-menu";
    verifiedAromaBanquet.sourceProfile =
      "verified-aroma-banquet-owner-menu:pdf-catalog-plus-visible-wix-ordering-subset";
    verifiedAromaBanquet.updated = "2026-07";
    verifiedAromaBanquet.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAromaBanquet.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAromaBanquet.coverageStatus = "complete";
    verifiedAromaBanquet.launchQualityStatus = "published";
    verifiedAromaBanquet.launchRemediationBucket = "none";
    verifiedAromaBanquet.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAromaBanquet.sourceStatus = {
      ...(verifiedAromaBanquet.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-dine-in-menu:restaurant-issued-pdf:${verifiedSnapshot.sourceUrls[0]}`,
          `current-ordering-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          `menu-shell:restaurant-issued:${verifiedSnapshot.sourceUrls[2]}`,
          `menu-relationships:restaurant-issued-wix-api:${verifiedSnapshot.sourceUrls[4]}`,
          `section-relationships:restaurant-issued-wix-api:${verifiedSnapshot.sourceUrls[5]}`,
          `item-composition:restaurant-issued-wix-api:${verifiedSnapshot.sourceUrls[6]}`,
        ],
        configuredUrlWarnings: [
          "the-visible-ordering-menu-is-a-90-product-subset-of-the-current-99-product-owner-linked-dine-in-pdf",
          "the-hidden-wix-dine-in-relationships-are-used-only-where-the-current-owner-linked-pdf-confirms-the-product",
          "house-dressings-is-a-salad-subheading-not-a-standalone-product",
          "five-unreferenced-wix-inventory-products-are-not-current-public-menu-products",
          "the-owner-publishes-positive-menu-ingredient-wording-but-no-complete-allergen-matrix",
          "missing-ingredient-terms-are-not-negative-allergen-or-cross-contact-assurances",
          "coconut-and-mustard-greens-are-not-promoted-to-tree-nut-or-mustard-allergens",
          "unspecified-batter-and-nutty-flavor-risks-remain-separate-ingredient-intelligence",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 15,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourceMenuCount: verifiedSnapshot.sourceMenuCount,
      sourceSectionCount: verifiedSnapshot.sourceSectionCount,
      sourceItemCount: verifiedSnapshot.sourceItemCount,
      dineInPresentationCount: verifiedSnapshot.dineInPresentationCount,
      orderingPresentationCount: verifiedSnapshot.orderingPresentationCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      separatedIngredientIntelligenceCount: verifiedSnapshot.inferredRiskCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      dineInOnlyProductCount: verifiedSnapshot.dineInOnlyProductCount,
      excludedHeadingCount: verifiedSnapshot.excludedHeadingCount,
      frozenExactMatchCount: 94,
      frozenNormalizedMatchCount: 1,
      frozenArtifactCount: 10,
      frozenStaleProductCount: 5,
      frozenMatchedCurrentProductCount: 95,
      restoredCurrentProductCount: 4,
      frozenAllergenMismatchCount: 17,
      frozenFixedAllergenMismatchCount: 17,
      frozenProvenanceMismatchCount: 10,
      frozenMenuContentMismatchCount: 95,
      quarantinedItemExamples: [
        { id: "get-more-form-submissions", kind: "wix-boilerplate-artifact", name: "Get More Form Submissions", reasons: ["not-menu-content"] },
        { id: "beats-and-bites", kind: "event-page-artifact", name: "Beats & Bites", reasons: ["not-a-product"] },
        { id: "house-dressings", kind: "section-heading-artifact", name: "House Dressings", reasons: ["salad-dressing-heading"] },
        { id: "chili-rellieno", kind: "stale-wix-inventory", name: "Chili Rellieno", reasons: ["absent-from-current-pdf-and-ordering-menu"] },
        { id: "salmon-en-cilantro", kind: "stale-wix-inventory", name: "Salmon en Cilantro", reasons: ["absent-from-current-pdf-and-ordering-menu"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAromaBanquet.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Aroma Restaurant Bar & Banquet|Final generated repair:/.test(String(repair.note ?? "")),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: aromaBanquetRepairNote },
      ],
    };
  }

  const verifiedArrels = restaurant("arrels-dc");
  const arrelsRepairNote =
    "Verified repair: removed all five stale Restaurant Week rows from the permanently closed Arrels identity; revoked the four promoted official-allergen claims that were derived from third-party menu descriptions; kept the hotel owner's current transitional breakfast menu separate because it is published under the replacement Arlo DC Restaurant identity; and quarantined Arrels with zero current menu items until the closed record is retired.";
  if (
    verifiedArrels &&
    (
      (verifiedArrels.items ?? []).length !== 0 ||
      verifiedArrels.domain !== "arlohotels.com" ||
      verifiedArrels.guideUrl !==
        "https://arlohotels.com/washingtondc/eat-and-drink/restaurant/" ||
      verifiedArrels.coverageStatus !== "blocked" ||
      verifiedArrels.launchQualityStatus !== "quarantined" ||
      verifiedArrels.launchRemediationBucket !== "no-menu-found" ||
      verifiedArrels.sourceStatus?.locationStatus !== "permanently_closed" ||
      verifiedArrels.sourceStatus?.permanentlyClosed !== true ||
      verifiedArrels.sourceStatus?.replacementStatus !==
        "transitional_breakfast_service" ||
      (verifiedArrels.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === arrelsRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/arrels-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "arrels-dc",
      verifiedSnapshot,
      arrelsRepairNote,
    );
    verifiedArrels.domain = "arlohotels.com";
    verifiedArrels.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedArrels.guideLabel = "Current first-party replacement notice";
    verifiedArrels.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArrels.sourceFamily = "verified-closed-restaurant";
    verifiedArrels.parserProfile = "manual-closure-audit";
    verifiedArrels.sourceProfile =
      "verified-closed-restaurant:owner-transition-page-plus-independent-closure-confirmation";
    verifiedArrels.updated = "2026-07";
    verifiedArrels.lastKnownGoodAt = null;
    verifiedArrels.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArrels.coveragePercent = 0;
    verifiedArrels.coverageStatus = "blocked";
    verifiedArrels.launchQualityStatus = "quarantined";
    verifiedArrels.launchRemediationBucket = "no-menu-found";
    verifiedArrels.sourceStatus = {
      ...(verifiedArrels.sourceStatus ?? {}),
      locationStatus: verifiedSnapshot.locationStatus,
      permanentlyClosed: true,
      replacementStatus: verifiedSnapshot.replacementStatus,
      closureReason:
        "Arrels closed in late March 2026; Arlo Hotels now describes the space as a transitional breakfast operation while a new dining concept is forthcoming.",
      configuredUrlAudit: {
        configuredUrlRoles: [
          `identity-and-transition:hotel-owner:${verifiedSnapshot.sourceUrls[0]}`,
          `replacement-menu:hotel-owner-linked-pdf:${verifiedSnapshot.sourceUrls[1]}`,
          `identity:legacy-stale-restaurant-menu:${verifiedSnapshot.sourceUrls[2]}`,
          `closure:third-party-announcement:${verifiedSnapshot.sourceUrls[3]}`,
          `closure:third-party-confirmation:${verifiedSnapshot.sourceUrls[4]}`,
        ],
        configuredUrlWarnings: [
          "restaurant-permanently-closed-in-late-march-2026",
          "legacy-arrels-site-conflicts-with-current-hotel-owner-transition-page",
          "transitional-breakfast-menu-belongs-to-replacement-identity-not-arrels",
          "restaurant-week-pdf-is-an-old-third-party-special-menu",
          "third-party-menu-descriptions-cannot-be-promoted-to-official-allergen-claims",
          "no-current-arrels-menu-or-restaurant-issued-allergen-disclosure",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 5,
      extractedFoodItemCount: 0,
      canonicalProductCount: 0,
      staleRestaurantWeekItemCount: 5,
      promotedThirdPartyAllergenClaimCount: 4,
      replacementMenuExcludedItemCount: 20,
      ok: 4,
      failed: 1,
      total: 5,
      nonFoodDocumentSuspected: false,
      quarantinedItemExamples: [
        { id: "esqueixada", kind: "stale-menu-item", name: "Esqueixada", reasons: ["closed-restaurant-week-menu"] },
        { id: "goat-milk-chocolate-cremeux", kind: "stale-menu-item", name: "Goat Milk Chocolate Cremeux", reasons: ["closed-restaurant-week-menu"] },
        { id: "iberico-presa", kind: "stale-menu-item", name: "Iberico Presa", reasons: ["closed-restaurant-week-menu"] },
        { id: "squid-ink-fideua", kind: "stale-menu-item", name: "Squid Ink Fideua", reasons: ["closed-restaurant-week-menu"] },
        { id: "torta-de-camarones", kind: "stale-menu-item", name: "Torta de Camarones", reasons: ["closed-restaurant-week-menu"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArrels.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) =>
            !/Verified repair: removed all five stale Restaurant Week rows|Final generated repair:/.test(
              String(repair.note ?? ""),
            ),
        )),
        { replacedRows: 0, note: arrelsRepairNote },
      ],
    };
  }

  const verifiedArtAndSoul = restaurant("art-and-soul-dc");
  const artAndSoulRepairNote =
    "Verified repair: rebuilt Art and Soul from its hashed current breakfast, brunch, and all-day owner pages; replaced four buffet headings with one configurable Breakfast Buffet; restored Crispy Brussels Sprouts, Cinnamon Roll, Fruit, and Grits; retained distinct all-day and brunch Angus Burger and Fried Chicken Sandwich formulations; consolidated only the three genuinely duplicate cross-service formulations; and corrected ten frozen allergen or provenance outcomes without turning menu silence into absence or cross-contact claims.";
  if (
    verifiedArtAndSoul &&
    (
      (verifiedArtAndSoul.items ?? []).length !== 54 ||
      new Set((verifiedArtAndSoul.items ?? []).map((menuItem) => menuItem.id)).size !== 54 ||
      (verifiedArtAndSoul.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 37 ||
      (verifiedArtAndSoul.items ?? []).some((menuItem) =>
        ["Adult", "HOT ITEMS", "BAKED ITEMS", "COLD ITEMS"].includes(menuItem.name)
      ) ||
      ![
        "Breakfast Buffet",
        "Crispy Brussels Sprouts",
        "Cinnamon Roll",
        "Fruit",
        "Grits",
      ].every((name) =>
        (verifiedArtAndSoul.items ?? []).some((menuItem) => menuItem.name === name)
      ) ||
      (verifiedArtAndSoul.items ?? []).filter(
        (menuItem) => menuItem.name === "Angus Burger",
      ).length !== 2 ||
      (verifiedArtAndSoul.items ?? []).filter(
        (menuItem) => menuItem.name === "Fried Chicken Sandwich",
      ).length !== 2 ||
      verifiedArtAndSoul.coverageStatus !== "complete" ||
      verifiedArtAndSoul.launchQualityStatus !== "published" ||
      (verifiedArtAndSoul.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === artAndSoulRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/art-and-soul-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "art-and-soul-dc",
      verifiedSnapshot,
      artAndSoulRepairNote,
    );
    verifiedArtAndSoul.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedArtAndSoul.guideLabel = "Current Art and Soul menus";
    verifiedArtAndSoul.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArtAndSoul.sourceFamily = "verified-art-and-soul-owner-menu";
    verifiedArtAndSoul.parserProfile = "verified-squarespace-menu-blocks";
    verifiedArtAndSoul.sourceProfile =
      "verified-art-and-soul-owner-menu:breakfast-buffet-plus-brunch-plus-all-day";
    verifiedArtAndSoul.updated = "2026-07";
    verifiedArtAndSoul.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArtAndSoul.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArtAndSoul.coverageStatus = "complete";
    verifiedArtAndSoul.launchQualityStatus = "published";
    verifiedArtAndSoul.launchRemediationBucket = "none";
    verifiedArtAndSoul.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedArtAndSoul.sourceStatus = {
      ...(verifiedArtAndSoul.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu:restaurant-issued-all-day:${verifiedSnapshot.sourceUrls[0]}`,
          `current-menu:restaurant-issued-brunch:${verifiedSnapshot.sourceUrls[1]}`,
          `current-menu:restaurant-issued-breakfast-buffet:${verifiedSnapshot.sourceUrls[2]}`,
          `menu-index:restaurant-issued:${verifiedSnapshot.sourceUrls[3]}`,
        ],
        configuredUrlWarnings: [
          "menu-descriptions-provide-positive-ingredient-signals-not-a-complete-allergen-matrix",
          "missing-menu-terms-are-not-negative-allergen-or-cross-contact-assurances",
          "breakfast-hot-baked-and-cold-items-are-buffet-subheadings-not-products",
          "all-day-add-ons-brunch-additions-and-each-nine-are-modifier-or-price-rows",
          "all-day-and-brunch-angus-burgers-have-distinct-published-compositions",
          "all-day-and-brunch-fried-chicken-sandwiches-have-distinct-published-compositions",
          "cake-cookie-pancake-and-creamy-wording-is-not-promoted-beyond-explicit-menu-ingredients",
          "no-current-restaurant-issued-allergen-matrix-or-cross-contact-disclosure-was-found",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 6,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourcePresentationCount: verifiedSnapshot.presentationCount,
      consolidatedPresentationCount: verifiedSnapshot.consolidatedPresentationCount,
      sourceRawRowCount: verifiedSnapshot.sourceStats.reduce(
        (sum, source) => sum + source.rawItemCount,
        0,
      ),
      allDayProductCount: verifiedSnapshot.sourceStats[0].productCount,
      brunchProductCount: verifiedSnapshot.sourceStats[1].productCount,
      breakfastProductCount: verifiedSnapshot.sourceStats[2].productCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 43,
      frozenNormalizedMatchCount: 3,
      frozenVariantMatchCount: 3,
      frozenArtifactCount: 3,
      frozenMatchedCurrentProductCount: 50,
      restoredCurrentProductCount: 4,
      frozenAllergenMismatchCount: 10,
      frozenProvenanceMismatchCount: 3,
      quarantinedItemExamples: [
        { id: "hot-items", kind: "buffet-component-heading", name: "HOT ITEMS", reasons: ["not-a-standalone-product"] },
        { id: "baked-items", kind: "buffet-component-heading", name: "BAKED ITEMS", reasons: ["not-a-standalone-product"] },
        { id: "cold-items", kind: "buffet-component-heading", name: "COLD ITEMS", reasons: ["not-a-standalone-product"] },
        { id: "add-ons", kind: "modifier-heading", name: "add ons", reasons: ["not-a-standalone-product"] },
        { id: "additions", kind: "modifier-heading", name: "ADDITIONS", reasons: ["not-a-standalone-product"] },
        { id: "each-nine", kind: "price-row", name: "Each | 9", reasons: ["not-a-standalone-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArtAndSoul.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) =>
            !/Verified repair: rebuilt Art and Soul|Final generated repair:/.test(
              String(repair.note ?? ""),
            ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: artAndSoulRepairNote },
      ],
    };
  }

  const verifiedArthaRini = restaurant("osm-artha-rini-45808686");
  const arthaRiniRepairNote =
    "Verified repair: rebuilt Artha Rini from the hashed current owner menu index and all eight linked restaurant-issued menu PDFs; replaced 62 corrupted frozen rows with 160 current orderable offerings across the main, Liwetan, Gudeg, Rijsttafel, Food Stall, Rice Box, Tumpeng, and Jajanan Pasar surfaces; kept configurable packages intact instead of promoting package components and instructions to standalone products; removed twelve frozen headings, modifiers, masthead, and duplicate-description artifacts; and applied the restaurant's explicit establishment-wide cross-contact warning separately from item-level positive ingredient signals.";
  if (
    verifiedArthaRini &&
    (
      (verifiedArthaRini.items ?? []).length !== 160 ||
      new Set((verifiedArthaRini.items ?? []).map((menuItem) => menuItem.id)).size !== 160 ||
      (verifiedArthaRini.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 113 ||
      (verifiedArthaRini.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-global-cross-contact-note",
      ).length !== 47 ||
      (verifiedArthaRini.items ?? []).some(
        (menuItem) => (menuItem.mayContain ?? []).length !== 10,
      ) ||
      (verifiedArthaRini.items ?? []).some((menuItem) => [
        "Minimum order for dine-in: 4 portion",
        "Soup (16oz)",
        "Beverages/Desserts",
        "Indonesian Restaurant",
        "Regular Menu/Entrees",
        "Rice Platters",
        "Soups",
        "START FROM",
        "SUBSTITUTE SHRIMP NO HEAD (PEELED)",
        "WITHOUT RICE",
      ].includes(menuItem.name)) ||
      verifiedArthaRini.coverageStatus !== "complete" ||
      verifiedArthaRini.launchQualityStatus !== "published" ||
      (verifiedArthaRini.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === arthaRiniRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-artha-rini-45808686/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-artha-rini-45808686",
      verifiedSnapshot,
      arthaRiniRepairNote,
    );
    verifiedArthaRini.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedArthaRini.guideLabel = "Current Artha Rini menus";
    verifiedArthaRini.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArthaRini.sourceFamily = "verified-artha-rini-owner-pdf-menu-set";
    verifiedArthaRini.parserProfile = "verified-multi-pdf-manual-reconciliation";
    verifiedArthaRini.sourceProfile =
      "verified-artha-rini-owner-pdfs:main-plus-special-plus-catering-plus-jajanan";
    verifiedArthaRini.updated = "2026-07";
    verifiedArthaRini.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArthaRini.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArthaRini.coverageStatus = "complete";
    verifiedArthaRini.launchQualityStatus = "published";
    verifiedArthaRini.launchRemediationBucket = "none";
    verifiedArthaRini.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedArthaRini.sourceStatus = {
      ...(verifiedArthaRini.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `menu-index:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          ...verifiedSnapshot.sourceStats.map(
            (source) => `current-menu:restaurant-issued-${source.key}:${source.sourceUrl}`,
          ),
          `allergen:restaurant-issued-global-cross-contact-warning:${verifiedSnapshot.sourceStats[0].sourceUrl}`,
        ],
        configuredUrlWarnings: [
          "restaurant-wide-warning-is-cross-contact-not-fixed-item-allergen-data",
          "global-warning-does-not-establish-allergen-absence-for-any-item",
          "gluten-free-and-vegan-labels-do-not-override-the-global-cross-contact-warning",
          "coconut-and-melinjo-seed-wording-is-not-promoted-to-tree-nut",
          "package-components-and-selection-lists-remain-inside-configurable-products",
          "ordering-minimums-section-headings-price-prefixes-and-modifiers-are-not-products",
          "food-stall-and-main-menu-presentations-are-distinct-service-specific-offerings",
          "beverage-and-dessert-category-is-ordered-after-food-and-side-categories",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 12,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      globalCrossContactOnlyCount: verifiedSnapshot.globalCrossContactOnlyCount,
      globalCrossContactAllergenCount: verifiedSnapshot.globalCrossContactAllergens.length,
      sourceProductCounts: Object.fromEntries(
        verifiedSnapshot.sourceStats.map((source) => [source.key, source.productCount]),
      ),
      frozenExactMatchCount: 21,
      frozenNormalizedMatchCount: 29,
      frozenArtifactCount: 12,
      frozenMatchedCurrentProductCount: 49,
      restoredCurrentProductCount: 111,
      frozenAllergenOrProvenanceMismatchCount: 50,
      frozenMissingGlobalCrossContactCount: 50,
      quarantinedItemExamples: [
        { id: "minimum-order-for-dine-in-4-portion", kind: "ordering-instruction", name: "Minimum order for dine-in: 4 portion", reasons: ["not-a-product"] },
        { id: "soup-16oz", kind: "section-heading", name: "Soup (16oz)", reasons: ["not-a-product"] },
        { id: "beverages-desserts", kind: "section-heading", name: "Beverages/Desserts", reasons: ["not-a-product"] },
        { id: "indonesian-restaurant", kind: "document-masthead", name: "Indonesian Restaurant", reasons: ["not-a-product"] },
        { id: "start-from", kind: "price-prefix", name: "START FROM", reasons: ["not-a-product"] },
        { id: "substitute-shrimp-no-head-peeled", kind: "modifier", name: "SUBSTITUTE SHRIMP NO HEAD (PEELED)", reasons: ["not-a-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArthaRini.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Artha Rini|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: arthaRiniRepairNote },
      ],
    };
  }

  const verifiedArties = restaurant("artie-s-fairfax-va-dc-metro");
  const artiesRepairNote =
    "Verified repair: rebuilt Artie's from the hashed current owner website and its linked lunch, dinner, gluten-sensitive lunch, and gluten-sensitive dinner PDFs; consolidated 170 source presentations into 60 current offerings; removed four duplicated-description artifacts and three stale standalone products; restored eight current offerings missing from the frozen output; corrected 45 allergen or provenance mismatches; and applied the gluten-sensitive menus' gluten cross-contact warning only to the 37 products actually represented on those menus rather than treating it as a restaurant-wide allergen matrix.";
  if (
    verifiedArties &&
    (
      (verifiedArties.items ?? []).length !== 60 ||
      new Set((verifiedArties.items ?? []).map((menuItem) => menuItem.id)).size !== 60 ||
      (verifiedArties.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 49 ||
      (verifiedArties.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-global-cross-contact-note",
      ).length !== 11 ||
      (verifiedArties.items ?? []).filter(
        (menuItem) => (menuItem.mayContain ?? []).includes("gluten"),
      ).length !== 37 ||
      (verifiedArties.items ?? []).some((menuItem) => [
        "4 Ozzie rolls with Honey Butter",
        "Cole Slaw",
        "Crumb fried & tossed with thin beans & spicy pepper jelly",
        "hot off the wood grill with Reggiano parmesan & fresh garlic croutons",
        "lettuce, mayo, pickles, mustard & fries",
        "Ozzie Rolls",
        "remoulade sauce, fries & cole slaw",
      ].includes(menuItem.name)) ||
      verifiedArties.coverageStatus !== "complete" ||
      verifiedArties.launchQualityStatus !== "published" ||
      (verifiedArties.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === artiesRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/artie-s-fairfax-va-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "artie-s-fairfax-va-dc-metro",
      verifiedSnapshot,
      artiesRepairNote,
    );
    verifiedArties.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedArties.guideLabel = "Current Artie's menus";
    verifiedArties.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedArties.sourceFamily = "verified-arties-owner-pdf-menu-set";
    verifiedArties.parserProfile = "verified-regular-plus-gluten-sensitive-pdf-reconciliation";
    verifiedArties.sourceProfile =
      "verified-arties-owner-pdfs:lunch-plus-dinner-plus-product-scoped-gluten-sensitive-menus";
    verifiedArties.updated = "2026-07";
    verifiedArties.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedArties.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedArties.coverageStatus = "complete";
    verifiedArties.launchQualityStatus = "published";
    verifiedArties.launchRemediationBucket = "none";
    verifiedArties.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedArties.sourceStatus = {
      ...(verifiedArties.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `menu-index:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `current-menu:restaurant-issued-lunch:${verifiedSnapshot.sourceUrls[1]}`,
          `current-menu:restaurant-issued-dinner:${verifiedSnapshot.sourceUrls[2]}`,
          `allergen:restaurant-issued-gluten-sensitive-lunch:${verifiedSnapshot.sourceUrls[3]}`,
          `allergen:restaurant-issued-gluten-sensitive-dinner:${verifiedSnapshot.sourceUrls[4]}`,
        ],
        configuredUrlWarnings: [
          "regular-menu-descriptions-provide-positive-ingredient-signals-not-a-complete-allergen-matrix",
          "gluten-sensitive-menu-warning-is-product-scoped-cross-contact-not-fixed-item-gluten",
          "gluten-sensitive-menu-silence-does-not-establish-absence-of-other-allergens",
          "regular-and-gluten-sensitive-presentations-are-consolidated-when-they-are-documented-variants-of-one-product",
          "the-separately-named-kids-gluten-free-penne-remains-a-distinct-product",
          "service-specific-side-compositions-are-retained-inside-the-configurable-drunken-rib-eye-product",
          "foodborne-illness-undercooking-footnotes-are-not-allergen-cross-contact-warnings",
          "description-fragments-accompaniments-and-discontinued-standalone-bread-rows-are-not-current-products",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 7,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourcePresentationCount: verifiedSnapshot.presentationCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      globalCrossContactOnlyCount: verifiedSnapshot.glutenCrossContactOnlyCount,
      glutenCrossContactItemCount: verifiedSnapshot.glutenCrossContactItemCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      sourcePresentationCounts: Object.fromEntries(
        verifiedSnapshot.sourceStats.map((source) => [source.key, source.presentationCount]),
      ),
      frozenExactMatchCount: 40,
      frozenNormalizedMatchCount: 11,
      frozenVariantMatchCount: 1,
      frozenStaleExtraCount: 3,
      frozenArtifactCount: 4,
      frozenMatchedCurrentProductCount: 52,
      restoredCurrentProductCount: 8,
      frozenAllergenOrProvenanceMismatchCount: 45,
      quarantinedItemExamples: [
        { id: "4-ozzie-rolls-with-honey-butter", kind: "stale-product", name: "4 Ozzie rolls with Honey Butter", reasons: ["absent-from-current-owner-menus"] },
        { id: "cole-slaw", kind: "accompaniment", name: "Cole Slaw", reasons: ["not-a-current-standalone-product"] },
        { id: "crumb-fried-tossed", kind: "description-fragment", name: "Crumb fried & tossed with thin beans & spicy pepper jelly", reasons: ["duplicate-description-as-product"] },
        { id: "hot-off-the-wood-grill", kind: "description-fragment", name: "hot off the wood grill with Reggiano parmesan & fresh garlic croutons", reasons: ["duplicate-description-as-product"] },
        { id: "lettuce-mayo-pickles", kind: "description-fragment", name: "lettuce, mayo, pickles, mustard & fries", reasons: ["duplicate-description-as-product"] },
        { id: "remoulade-sauce-fries", kind: "description-fragment", name: "remoulade sauce, fries & cole slaw", reasons: ["duplicate-description-as-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedArties.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Artie's|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: artiesRepairNote },
      ],
    };
  }

  const verifiedAshburnBiryaniGrill = restaurant(
    "ashburn-biryani-grill-ashburn-va-dc-metro",
  );
  const ashburnBiryaniGrillRepairNote =
    "Verified repair: replaced Ashburn Biryani Grill's incomplete 11-row reviewed-delivery subset with the complete 155-product catalog from the Ashburn location selected through the restaurant-linked Cash App/Square ordering profile; restored 144 current products; preserved fourteen currently sold-out products as published offerings; placed Beverages last; retained unavailable allergen status for 150 products because the linked catalog's ingredient and dietary arrays are empty; and limited five positive official ingredient signals to terms directly published on the restaurant-issued brand menu.";
  if (
    verifiedAshburnBiryaniGrill &&
    (
      (verifiedAshburnBiryaniGrill.items ?? []).length !== 155 ||
      new Set((verifiedAshburnBiryaniGrill.items ?? []).map((menuItem) => menuItem.id)).size !== 155 ||
      (verifiedAshburnBiryaniGrill.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 5 ||
      (verifiedAshburnBiryaniGrill.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 150 ||
      (verifiedAshburnBiryaniGrill.items ?? []).some(
        (menuItem) => (menuItem.mayContain ?? []).length > 0,
      ) ||
      !(verifiedAshburnBiryaniGrill.items ?? []).slice(-14).every(
        (menuItem) => menuItem.category === "Beverages",
      ) ||
      !["chicken-sukka", "bullet-naan", "kothu-parotta", "ambur-mutton-biryani"].every(
        (itemId) => (verifiedAshburnBiryaniGrill.items ?? []).some(
          (menuItem) => menuItem.id === itemId,
        ),
      ) ||
      verifiedAshburnBiryaniGrill.coverageStatus !== "complete" ||
      verifiedAshburnBiryaniGrill.launchQualityStatus !== "published" ||
      (verifiedAshburnBiryaniGrill.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === ashburnBiryaniGrillRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/ashburn-biryani-grill-ashburn-va-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "ashburn-biryani-grill-ashburn-va-dc-metro",
      verifiedSnapshot,
      ashburnBiryaniGrillRepairNote,
    );
    verifiedAshburnBiryaniGrill.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedAshburnBiryaniGrill.guideLabel = "Current Ashburn menu sources";
    verifiedAshburnBiryaniGrill.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAshburnBiryaniGrill.sourceFamily = "verified-ashburn-linked-square-catalog";
    verifiedAshburnBiryaniGrill.parserProfile =
      "verified-square-location-catalog-plus-owner-brand-menu";
    verifiedAshburnBiryaniGrill.sourceProfile =
      "verified-ashburn:location-specific-linked-square-catalog-plus-owner-positive-ingredient-text";
    verifiedAshburnBiryaniGrill.updated = "2026-07";
    verifiedAshburnBiryaniGrill.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAshburnBiryaniGrill.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAshburnBiryaniGrill.coverageStatus = "complete";
    verifiedAshburnBiryaniGrill.launchQualityStatus = "published";
    verifiedAshburnBiryaniGrill.launchRemediationBucket = "none";
    verifiedAshburnBiryaniGrill.regionalScope = "location-menu-with-intelligence-fallback";
    verifiedAshburnBiryaniGrill.reviewedMenuOnlyFallback = false;
    verifiedAshburnBiryaniGrill.sourceStatus = {
      ...(verifiedAshburnBiryaniGrill.sourceStatus ?? {}),
      accommodationOnly: false,
      configuredUrlAudit: {
        configuredUrlRoles: [
          `brand-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `location-identity:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          `ordering-profile:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[2]}`,
          `location-directory:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[3]}`,
          `current-location-menu:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[4]}`,
        ],
        configuredUrlWarnings: [
          "linked-square-catalog-is-complete-current-menu-boundary-not-official-allergen-evidence",
          "linked-square-ingredient-and-dietary-preference-arrays-are-empty",
          "linked-vendor-description-terms-remain-ingredient-intelligence-only",
          "owner-brand-menu-is-not-a-complete-allergen-matrix",
          "owner-accommodation-language-does-not-establish-item-level-absence-or-cross-contact",
          "creamy-without-an-explicit-dairy-ingredient-is-not-a-fixed-milk-signal",
          "no-product-scoped-or-global-cross-contact-statement-was-found",
          "currently-sold-out-products-remain-current-published-offerings",
          "beverages-are-ordered-after-all-food-categories",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 0,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      officialBrandMenuItemCount: verifiedSnapshot.officialBrandMenuItemCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      linkedCatalogIngredientArrayCount: verifiedSnapshot.linkedCatalogIngredientArrayCount,
      linkedCatalogDietaryPreferenceCount: verifiedSnapshot.linkedCatalogDietaryPreferenceCount,
      currentlySoldOutProductCount: verifiedSnapshot.soldOutItemCount,
      frozenExactMatchCount: 9,
      frozenNormalizedMatchCount: 2,
      frozenMatchedCurrentProductCount: 11,
      restoredCurrentProductCount: 144,
      frozenAllergenOrProvenanceMismatchCount: 0,
      reviewedMenuQualityRepairs: [
        ...((verifiedAshburnBiryaniGrill.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: replaced Ashburn Biryani Grill|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: ashburnBiryaniGrillRepairNote },
      ],
    };
  }

  const verifiedAsiaGarden = restaurant("osm-asia-garden-11366360044");
  const asiaGardenRepairNote =
    "Verified repair: rebuilt Asia Garden from the current owner-domain ordering system's hash-pinned raw menu payload; replaced 22 description/badge artifacts with 242 real named presentations across the 36-item lunch and 206-item all-day menus; excluded 154 explicitly cached vendor-AI descriptions; preserved only 46 raw ordering descriptions; moved the Beverages and Soda sections to the end; and kept every product's fixed-allergen and cross-contact status unavailable because the restaurant publishes no official allergen guide or complete ingredient disclosure.";
  if (
    verifiedAsiaGarden &&
    (
      (verifiedAsiaGarden.items ?? []).length !== 242 ||
      new Set((verifiedAsiaGarden.items ?? []).map((menuItem) => menuItem.id)).size !== 242 ||
      (verifiedAsiaGarden.items ?? []).some(
        (menuItem) => menuItem.allergenSourceType !== "unavailable" ||
          (menuItem.allergens ?? []).length > 0 ||
          (menuItem.mayContain ?? []).length > 0,
      ) ||
      !(verifiedAsiaGarden.items ?? []).slice(-13).every(
        (menuItem) => ["Beverages", "Soda"].includes(menuItem.category),
      ) ||
      (verifiedAsiaGarden.items ?? []).some((menuItem) => [
        "Choice of chicken, beef, shrimp, pork",
        "Crispy fried chicken tossed in a sweet and spicy sesame sauce",
        "Crispy fried jumbo shrimp served hot and golden",
        "OFTEN LIKED",
        "POPULAR",
        "Tender beef and steamed broccoli in a flavorful sauce",
      ].includes(menuItem.name)) ||
      verifiedAsiaGarden.coverageStatus !== "complete" ||
      verifiedAsiaGarden.launchQualityStatus !== "published" ||
      (verifiedAsiaGarden.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === asiaGardenRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-asia-garden-11366360044/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-asia-garden-11366360044",
      verifiedSnapshot,
      asiaGardenRepairNote,
    );
    verifiedAsiaGarden.guideUrl = verifiedSnapshot.sourceUrls[2];
    verifiedAsiaGarden.guideLabel = "Current Asia Garden menus";
    verifiedAsiaGarden.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAsiaGarden.sourceFamily = "verified-owner-domain-ordering-menu";
    verifiedAsiaGarden.parserProfile = "verified-next-rsc-raw-menu-payload";
    verifiedAsiaGarden.sourceProfile =
      "verified-asia-garden:owner-domain-linked-ordering-raw-menus-without-cached-ai-descriptions";
    verifiedAsiaGarden.updated = "2026-07";
    verifiedAsiaGarden.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAsiaGarden.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAsiaGarden.coverageStatus = "complete";
    verifiedAsiaGarden.launchQualityStatus = "published";
    verifiedAsiaGarden.launchRemediationBucket = "none";
    verifiedAsiaGarden.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAsiaGarden.reviewedMenuOnlyFallback = false;
    verifiedAsiaGarden.sourceStatus = {
      ...(verifiedAsiaGarden.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `identity:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `current-menu:restaurant-linked-lunch:${verifiedSnapshot.sourceUrls[1]}`,
          `current-menu:restaurant-linked-all-day:${verifiedSnapshot.sourceUrls[2]}`,
        ],
        configuredUrlWarnings: [
          "raw-menu-item-names-and-raw-descriptions-are-current-menu-boundary",
          "cached-ai-menu-item-descriptions-are-excluded-from-published-menu-data",
          "restaurant-linked-ordering-menu-is-not-an-official-allergen-guide",
          "menu-title-and-raw-description-terms-remain-ingredient-intelligence-only",
          "no-complete-ingredient-disclosure-or-cross-contact-statement-was-found",
          "recommendation-badges-and-description-text-are-not-products",
          "lunch-main-dinner-combo-and-party-tray-presentations-remain-distinct-when-separately-sold",
          "beverages-and-soda-sections-are-ordered-after-food-sections",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 22,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourcePresentationCount: verifiedSnapshot.sourcePresentationCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      lunchPresentationCount: verifiedSnapshot.lunchPresentationCount,
      allDayPresentationCount: verifiedSnapshot.allDayPresentationCount,
      rawOrderingDescriptionCount: verifiedSnapshot.rawDescriptionCount,
      ignoredCachedAIDescriptionCount: verifiedSnapshot.ignoredCachedAIDescriptionCount,
      explicitOfficialIngredientCount: 0,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenArtifactCount: 22,
      frozenMatchedCurrentProductCount: 0,
      restoredCurrentProductCount: verifiedSnapshot.itemCount,
      frozenSpuriousOfficialIngredientArtifactCount: 7,
      frozenAllergenOrProvenanceMismatchCount: 0,
      quarantinedItemExamples: [
        { id: "popular", kind: "recommendation-badge", name: "POPULAR", reasons: ["not-a-product"] },
        { id: "often-liked", kind: "recommendation-badge", name: "OFTEN LIKED", reasons: ["not-a-product"] },
        { id: "crispy-fried-jumbo-shrimp-served-hot-and-golden", kind: "cached-ai-description", name: "Crispy fried jumbo shrimp served hot and golden", reasons: ["description-as-product"] },
        { id: "tender-beef-and-steamed-broccoli-in-a-flavorful-sauce", kind: "cached-ai-description", name: "Tender beef and steamed broccoli in a flavorful sauce", reasons: ["description-as-product"] },
        { id: "choice-of-chicken-beef-shrimp-pork", kind: "raw-item-description", name: "Choice of chicken, beef, shrimp, pork", reasons: ["description-as-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAsiaGarden.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Asia Garden|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: asiaGardenRepairNote },
      ],
    };
  }

  const verifiedAsiaNine = restaurant("osm-asia-nine-1236156059");
  const asiaNineRepairNote =
    "Verified repair: rebuilt Asia Nine from the current owner-issued Wix populated-menu catalog; restored 35 omitted current products, removed six review-widget artifacts, retained all 161 visible products across 16 real sections, excluded the separate 21-item Wix demo catalog, placed Beverages last, corrected 33 frozen allergen/source-semantic mismatches, limited 99 official positives to fixed ingredients or unambiguous food identities published by the restaurant, and kept common wrapper, noodle, batter, mayonnaise, surimi, and miso risks separately labeled as Ingredient Intelligence.";
  if (
    verifiedAsiaNine &&
    (
      (verifiedAsiaNine.items ?? []).length !== 161 ||
      new Set((verifiedAsiaNine.items ?? []).map((menuItem) => menuItem.id)).size !== 161 ||
      new Set((verifiedAsiaNine.items ?? []).map((menuItem) => menuItem.category)).size !== 16 ||
      (verifiedAsiaNine.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 99 ||
      (verifiedAsiaNine.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 62 ||
      (verifiedAsiaNine.items ?? []).some(
        (menuItem) => (menuItem.mayContain ?? []).length > 0,
      ) ||
      !(verifiedAsiaNine.items ?? []).slice(-7).every(
        (menuItem) => menuItem.category === "Beverages",
      ) ||
      (verifiedAsiaNine.items ?? []).some((menuItem) => [
        "Custom style",
        "Customize font",
        "Manage your customer reviews",
        "Respond to reviews",
        "Sell more with social proof",
        "Unlimited reviews",
      ].includes(menuItem.name)) ||
      !["edamame", "fried-calamari", "yellowtail-hamachi", "add-crunchy", "can-of-soda"].every(
        (itemId) => (verifiedAsiaNine.items ?? []).some((menuItem) => menuItem.id === itemId),
      ) ||
      verifiedAsiaNine.coverageStatus !== "complete" ||
      verifiedAsiaNine.launchQualityStatus !== "published" ||
      (verifiedAsiaNine.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === asiaNineRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-asia-nine-1236156059/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-asia-nine-1236156059",
      verifiedSnapshot,
      asiaNineRepairNote,
    );
    verifiedAsiaNine.guideUrl = verifiedSnapshot.sourceUrls[1];
    verifiedAsiaNine.guideLabel = "Current Asia Nine menus";
    verifiedAsiaNine.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAsiaNine.sourceFamily = "verified-owner-wix-menu";
    verifiedAsiaNine.parserProfile = "verified-wix-warmup-populated-menus";
    verifiedAsiaNine.sourceProfile =
      "verified-asia-nine:owner-issued-populated-thai-and-sushi-menus";
    verifiedAsiaNine.updated = "2026-07";
    verifiedAsiaNine.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAsiaNine.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAsiaNine.coverageStatus = "complete";
    verifiedAsiaNine.launchQualityStatus = "published";
    verifiedAsiaNine.launchRemediationBucket = "none";
    verifiedAsiaNine.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAsiaNine.reviewedMenuOnlyFallback = false;
    verifiedAsiaNine.sourceStatus = {
      ...(verifiedAsiaNine.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `identity:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `current-thai-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          `current-sushi-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[2]}`,
          `wix-auth:restaurant-linked-platform:${verifiedSnapshot.sourceUrls[3]}`,
          `wix-menus:restaurant-issued-api:${verifiedSnapshot.sourceUrls[4]}`,
          `wix-sections:restaurant-issued-api:${verifiedSnapshot.sourceUrls[5]}`,
          `wix-items:restaurant-issued-api:${verifiedSnapshot.sourceUrls[6]}`,
          `ordering-menu:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[7]}`,
        ],
        configuredUrlWarnings: [
          "owner-menu-tabs-and-wix-populated-menu-graph-define-the-current-161-product-boundary",
          "raw-wix-items-endpoint-also-contains-21-unpublished-demo-products-that-must-be-excluded",
          "review-widget-configuration-and-promotional-text-is-not-menu-data",
          "owner-menu-is-not-a-complete-allergen-matrix-or-complete-recipe-disclosure",
          "positive-official-signals-require-a-fixed-published-ingredient-or-unambiguous-food-identity",
          "optional-shrimp-seafood-tofu-and-salmon-choices-are-not-fixed-base-item-allergens",
          "coconut-is-not-mapped-to-tree-nut-or-dairy",
          "wonton-dumpling-tempura-noodle-mayo-kani-and-miso-formulation-risks-remain-ingredient-intelligence",
          "raw-or-undercooked-foodborne-illness-warning-is-not-allergen-cross-contact",
          "no-product-scoped-or-global-allergen-cross-contact-statement-was-found",
          "beverages-are-ordered-after-all-food-and-sushi-sections",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 27,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      sourcePresentationCount: verifiedSnapshot.sourcePresentationCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      thaiPresentationCount: verifiedSnapshot.thaiItemCount,
      sushiPresentationCount: verifiedSnapshot.sushiItemCount,
      configurableItemCount: verifiedSnapshot.configurableItemCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      ingredientIntelligenceRiskCount: verifiedSnapshot.inferredRiskCount,
      globalCrossContactCount: verifiedSnapshot.globalCrossContactCount,
      wixDemoCatalogItemCount: 21,
      frozenExactMatchCount: 121,
      frozenNormalizedMatchCount: 5,
      frozenArtifactCount: 6,
      frozenMatchedCurrentProductCount: 126,
      restoredCurrentProductCount: 35,
      frozenAllergenOrProvenanceMismatchCount: 33,
      quarantinedItemExamples: [
        { id: "custom-style", kind: "review-widget", name: "Custom style", reasons: ["not-a-product"] },
        { id: "manage-your-customer-reviews", kind: "review-widget", name: "Manage your customer reviews", reasons: ["not-a-product"] },
        { id: "sell-more-with-social-proof", kind: "review-widget", name: "Sell more with social proof", reasons: ["not-a-product"] },
        { id: "tofu-skewers", kind: "wix-demo-catalog", name: "Tofu skewers", reasons: ["absent-from-published-menu-graph"] },
        { id: "classic-burger", kind: "wix-demo-catalog", name: "Classic burger", reasons: ["absent-from-published-menu-graph"] },
        { id: "classic-cheesecake", kind: "wix-demo-catalog", name: "Classic cheesecake", reasons: ["absent-from-published-menu-graph"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAsiaNine.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Asia Nine|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: asiaNineRepairNote },
      ],
    };
  }

  const verifiedAuntieAnnes = restaurant("auntie-annes");
  const auntieAnnesRepairNote =
    "Verified repair: rebuilt Auntie Anne's from the current March 2025 restaurant-issued U.S. nutrition guide; replaced the stale 37-row 2016 component abstraction with 46 current consumer products across ten sections; preserved 39 direct allergen-matrix rows and seven fountain products supported only by the guide's global cross-contact statement; applied the exact nine-allergen may-contain warning to every food and beverage; removed five process artifacts and eleven stale products; and did not infer gluten from the guide's wheat disclosure.";
  const auntieAnnesMayContain = [
    "egg",
    "fish",
    "milk",
    "peanut",
    "sesame",
    "shellfish",
    "soy",
    "tree-nut",
    "wheat",
  ];
  const auntieAnnesRemovedIds = [
    "cheddar-cheese-stuffed-nuggets",
    "clarified-butter",
    "frozen-mocha",
    "iced-tea-bag-in-box",
    "iced-tea-brewed",
    "latte-products",
    "non-stick-spray",
    "pina-colada-beverages",
    "pretzels-without-butter",
    "pretzels-with-butter",
    "raisin",
    "roasted-garlic-parmesan",
    "shake-products",
    "sour-cream-and-onion",
    "stabilizer",
    "wild-cherry-beverages",
  ];
  if (
    verifiedAuntieAnnes &&
    (
      (verifiedAuntieAnnes.items ?? []).length !== 46 ||
      new Set((verifiedAuntieAnnes.items ?? []).map((menuItem) => menuItem.id)).size !== 46 ||
      new Set((verifiedAuntieAnnes.items ?? []).map((menuItem) => menuItem.category)).size !== 10 ||
      (verifiedAuntieAnnes.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-allergen-menu",
      ).length !== 39 ||
      (verifiedAuntieAnnes.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-global-cross-contact-note",
      ).length !== 7 ||
      (verifiedAuntieAnnes.items ?? []).some(
        (menuItem) => JSON.stringify(menuItem.mayContain ?? []) !== JSON.stringify(auntieAnnesMayContain),
      ) ||
      (verifiedAuntieAnnes.items ?? []).some(
        (menuItem) =>
          (menuItem.allergens ?? []).includes("gluten") ||
          (menuItem.mayContain ?? []).includes("gluten"),
      ) ||
      (verifiedAuntieAnnes.items ?? []).some((menuItem) =>
        auntieAnnesRemovedIds.includes(menuItem.id)
      ) ||
      verifiedAuntieAnnes.coverageStatus !== "complete" ||
      verifiedAuntieAnnes.launchQualityStatus !== "published" ||
      (verifiedAuntieAnnes.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === auntieAnnesRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/auntie-annes/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "auntie-annes",
      verifiedSnapshot,
      auntieAnnesRepairNote,
    );
    verifiedAuntieAnnes.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedAuntieAnnes.guideLabel = "Current Auntie Anne's U.S. nutrition guide";
    verifiedAuntieAnnes.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAuntieAnnes.sourceFamily = "verified-current-us-nutrition-and-allergen-guide";
    verifiedAuntieAnnes.parserProfile = "verified-pdf-nutrition-plus-allergen-matrix";
    verifiedAuntieAnnes.sourceProfile =
      "verified-auntie-annes:current-us-guide-direct-matrix-plus-global-cross-contact";
    verifiedAuntieAnnes.updated = "2026-07";
    verifiedAuntieAnnes.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAuntieAnnes.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAuntieAnnes.coverageStatus = "complete";
    verifiedAuntieAnnes.launchQualityStatus = "published";
    verifiedAuntieAnnes.launchRemediationBucket = "none";
    verifiedAuntieAnnes.regionalScope = "national-menu-with-intelligence-fallback";
    verifiedAuntieAnnes.sourceStatus = {
      ...(verifiedAuntieAnnes.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu-and-allergen-guide:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
        ],
        configuredUrlWarnings: [
          "current-march-2025-us-guide-supersedes-revised-may-2016-chart",
          "direct-allergen-matrix-covers-39-of-46-current-products",
          "seven-fountain-products-are-supported-only-by-nutrition-rows-and-global-warning",
          "global-nine-allergen-warning-applies-as-may-contain-to-all-food-and-beverages",
          "global-warning-does-not-establish-fixed-allergens-or-allergen-absence",
          "guide-identifies-wheat-not-gluten",
          "processing-components-preparation-states-and-stale-products-are-not-current-products",
          "fountain-drinks-are-ordered-after-all-food-and-specialty-beverage-sections",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 16,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: 10,
      officialAllergenMatrixCount: 39,
      globalCrossContactOnlyCount: 7,
      unavailableAllergenCount: 0,
      frozenExactMatchCount: 3,
      frozenNormalizedMatchCount: 2,
      frozenVariantMatchCount: 16,
      frozenArtifactCount: 5,
      frozenStaleProductCount: 11,
      frozenAllergenMismatchCount: 21,
      restoredCurrentProductCount: 25,
      reviewedMenuQualityRepairs: [
        ...((verifiedAuntieAnnes.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Auntie Anne's|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: auntieAnnesRepairNote },
      ],
    };
  }

  const verifiedAwakening = restaurant(
    "replacement-awakening-bar-and-grill-washington-dc",
  );
  const awakeningRepairNote =
    "Verified repair: rebuilt Awakening Bar & Grill from the hash-pinned current owner menu; replaced 48 generic-extractor rows with 50 current service-specific presentations across the three public menu grids; removed four homepage/employment cards, one nested-description artifact, and one $2 OFF promotion; restored seven omitted presentations; repaired seven corrupted descriptions; separated the Lunch & Dinner and Brunch Chicken & Waffles formulations; placed Happy Hour beverages last; corrected nineteen frozen allergen/source outcomes; and limited direct positives to explicit restaurant-issued ingredients or unavoidable named identities without adding negative or cross-contact claims.";
  const awakeningRemovedIds = [
    "we-are-hiring",
    "a-place-where-flavors-come-together-in-the-best-style",
    "book-your-next-party-with-us",
    "rich-bread-pudding-with-bourbon-glaze-whole-9in-pan",
    "start-your-next-adventure-with-us",
    "all-bar-bites-and-specialty-cocktails",
  ];
  if (
    verifiedAwakening &&
    (
      (verifiedAwakening.items ?? []).length !== 50 ||
      new Set((verifiedAwakening.items ?? []).map((menuItem) => menuItem.id)).size !== 50 ||
      (verifiedAwakening.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 31 ||
      (verifiedAwakening.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 19 ||
      (verifiedAwakening.items ?? []).some(
        (menuItem) => (menuItem.mayContain ?? []).length > 0,
      ) ||
      (verifiedAwakening.items ?? []).some(
        (menuItem) =>
          (menuItem.allergens ?? []).includes("wheat") ||
          (menuItem.allergens ?? []).includes("gluten"),
      ) ||
      awakeningRemovedIds.some((removedId) =>
        (verifiedAwakening.items ?? []).some((menuItem) => menuItem.id === removedId)
      ) ||
      (verifiedAwakening.items ?? []).filter(
        (menuItem) => menuItem.name === "Chicken & Waffles",
      ).length !== 2 ||
      !["Select Draft Beers", "House Mixed Drinks"].every(
        (name, index) => verifiedAwakening.items?.at(index - 2)?.name === name,
      ) ||
      verifiedAwakening.coverageStatus !== "complete" ||
      verifiedAwakening.launchQualityStatus !== "published" ||
      (verifiedAwakening.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === awakeningRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/replacement-awakening-bar-and-grill-washington-dc/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "replacement-awakening-bar-and-grill-washington-dc",
      verifiedSnapshot,
      awakeningRepairNote,
    );
    verifiedAwakening.guideUrl = verifiedSnapshot.sourceUrls[1];
    verifiedAwakening.guideLabel = "Current Awakening food menus";
    verifiedAwakening.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAwakening.sourceFamily = "verified-owner-spotapps-menu-grids";
    verifiedAwakening.parserProfile = "verified-spotapps-menu-grid-parser";
    verifiedAwakening.sourceProfile =
      "verified-awakening:three-public-owner-menu-grids-with-service-aware-presentations";
    verifiedAwakening.updated = "2026-07";
    verifiedAwakening.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAwakening.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAwakening.coverageStatus = "complete";
    verifiedAwakening.launchQualityStatus = "published";
    verifiedAwakening.launchRemediationBucket = "none";
    verifiedAwakening.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAwakening.sourceStatus = {
      ...(verifiedAwakening.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `identity:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `current-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          "corroboration:restaurant-linked-vendor:https://tmt.spotapps.co/ordering-menu/?spot_id=549021",
        ],
        configuredUrlWarnings: [
          "owner-menu-provides-positive-ingredient-text-not-a-complete-allergen-matrix",
          "missing-menu-terms-are-not-negative-allergen-or-cross-contact-assurances",
          "culinary-formulation-assumptions-remain-ingredient-intelligence-only",
          "section-add-protein-text-is-not-a-fixed-item-allergen-signal",
          "two-chicken-and-waffles-presentations-have-distinct-service-formulations",
          "happy-hour-repeated-products-remain-distinct-presentations",
          "restaurant-linked-spotapps-shopping-cart-is-inactive",
          "hidden-spotapps-menu-1117304-is-not-an-owner-published-active-menu-tab",
          "happy-hour-beverages-are-ordered-last",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 6,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      rawMenuCardCount: verifiedSnapshot.rawCardCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.ingredientSignalCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 42,
      frozenVariantMatchCount: 1,
      frozenArtifactCount: 5,
      frozenMatchedCurrentProductCount: 43,
      restoredCurrentPresentationCount: 7,
      frozenAllergenOrProvenanceMismatchCount: 19,
      frozenCorruptDescriptionCount: 7,
      quarantinedItemExamples: [
        { id: "we-are-hiring", kind: "employment-card", name: "We are hiring!", reasons: ["not-a-product"] },
        { id: "book-your-next-party-with-us", kind: "promotion", name: "Book your next party with us!", reasons: ["not-a-product"] },
        { id: "rich-bread-pudding-with-bourbon-glaze-whole-9in-pan", kind: "description-fragment", name: "Rich bread pudding with bourbon glaze • Whole 9in pan", reasons: ["description-as-product"] },
        { id: "all-bar-bites-and-specialty-cocktails", kind: "discount-promotion", name: "All Bar Bites and Specialty Cocktails", reasons: ["not-a-product"] },
      ],
      reviewedMenuQualityRepairs: [
        ...((verifiedAwakening.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Awakening Bar & Grill|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: awakeningRepairNote },
      ],
    };
  }

  const verifiedAventino = restaurant("aventino-bethesda");
  const aventinoDuplicateId = "osm-aventino-cucina-romana-12342520793";
  const aventinoDuplicateIndex = (repository.restaurants ?? []).findIndex(
    (entry) => entry.id === aventinoDuplicateId,
  );
  const aventinoRepairNote =
    "Verified repair: rebuilt Aventino Cucina from the hash-pinned current restaurant-issued menus and restaurant-linked Toast ordering surface; reconciled 52 current food formulations across dinner, lunch, brunch, dessert, happy hour, and online ordering; removed three stale seasonal rows, seven alcohol-section artifacts, and the duplicate OSM restaurant record; replaced Rhubarb Coffee Cake with Blueberry Coffee Cake, collapsed two duplicate frozen presentations, and restored eight wholly missing current formulations; preserved materially different Rigatoni, Prosciutto, Burger, and Pesce preparations; and separated 27 restaurant-issued ingredient-positive rows, 12 linked-menu affirmative-label rows, and 13 unavailable rows without inventing negative or cross-contact claims.";
  const aventinoRemovedIds = [
    "asparagi",
    "carciofo",
    "rhubarb-coffee-cake",
    "bordiga-bianco",
    "carpano-antica",
    "cocchi-americano",
    "cocchi-dopo-teatro",
    "cocchi-torino",
    "montanaro-extra-dry",
    "punt",
    "aventino-pasta-club",
    "the-washington-posts-best-new-restaurants",
  ];
  if (
    verifiedAventino &&
    (
      (verifiedAventino.items ?? []).length !== 52 ||
      new Set((verifiedAventino.items ?? []).map((menuItem) => menuItem.id)).size !== 52 ||
      (verifiedAventino.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 27 ||
      (verifiedAventino.items ?? []).filter(
        (menuItem) =>
          menuItem.allergenSourceType === "restaurant-linked-product-allergen-section",
      ).length !== 12 ||
      (verifiedAventino.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 13 ||
      (verifiedAventino.items ?? []).some(
        (menuItem) => (menuItem.mayContain ?? []).length > 0,
      ) ||
      aventinoRemovedIds.some((removedId) =>
        (verifiedAventino.items ?? []).some((menuItem) => menuItem.id === removedId)
      ) ||
      verifiedAventino.coverageStatus !== "complete" ||
      verifiedAventino.launchQualityStatus !== "published" ||
      aventinoDuplicateIndex !== -1 ||
      !verifiedAventino.sourceStatus?.removedDuplicateRestaurantIds?.includes(
        aventinoDuplicateId,
      ) ||
      (verifiedAventino.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === aventinoRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/aventino-bethesda/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "aventino-bethesda",
      verifiedSnapshot,
      aventinoRepairNote,
    );
    verifiedAventino.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedAventino.guideLabel = "Current Aventino menus";
    verifiedAventino.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAventino.sourceFamily = "verified-owner-menu-plus-linked-toast-labels";
    verifiedAventino.parserProfile = "verified-aventino-service-aware-menu-parser";
    verifiedAventino.sourceProfile =
      "verified-aventino:owner-json-ld-formulations-plus-partial-linked-toast-affirmative-labels";
    verifiedAventino.updated = "2026-07";
    verifiedAventino.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAventino.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAventino.coverageStatus = "complete";
    verifiedAventino.launchQualityStatus = "published";
    verifiedAventino.launchRemediationBucket = "none";
    verifiedAventino.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAventino.sourceStatus = {
      ...(verifiedAventino.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `current-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `allergen-policy-context:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          `partial-affirmative-product-labels:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[2]}`,
        ],
        configuredUrlWarnings: [
          "owner-menu-ingredient-text-is-not-a-complete-allergen-matrix",
          "linked-toast-labels-are-partial-affirmative-evidence-only",
          "missing-toast-labels-are-not-negative-evidence",
          "no-global-cross-contact-claim-was-published",
          "seasonal-and-service-formulations-remain-separate-when-descriptions-differ",
          "three-pesce-formulations-remain-distinct",
          "happy-hour-burger-remains-distinct-from-the-bun-based-burger",
          "alcohol-only-sections-and-navigation-links-are-excluded",
          "osm-record-at-the-same-address-is-a-removed-duplicate",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 10,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      restaurantLinkedProductCount: verifiedSnapshot.linkedPositiveCount,
      restaurantLinkedItemCount: verifiedSnapshot.linkedPositiveCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 44,
      frozenNormalizedMatchCount: 1,
      frozenArtifactCount: 7,
      frozenStaleProductCount: 3,
      frozenMatchedPresentationCount: 45,
      frozenDuplicatePresentationCount: 2,
      frozenMatchedCurrentProductCount: 43,
      restoredCurrentFormulationCount: 9,
      frozenAllergenOrProvenanceMismatchCount: 17,
      removedDuplicateRestaurantIds: [aventinoDuplicateId],
      reviewedMenuQualityRepairs: [
        ...((verifiedAventino.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Aventino Cucina|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: aventinoRepairNote },
      ],
    };
    if (aventinoDuplicateIndex !== -1) {
      repository.restaurants.splice(aventinoDuplicateIndex, 1);
    }
  }

  const verifiedAyse = restaurant("osm-ay-e-meze-lounge-13134929927");
  const ayseRepairNote =
    "Verified repair: rebuilt AYŞE Meze Lounge from hash-pinned current restaurant-issued main, kids, brunch, July express-lunch, dessert, happy-hour, nonalcoholic-drink, and dated-special menus plus the restaurant-linked Toast catalog; reconciled 151 unique current food and nonalcoholic products; excluded alcohol and modifier-only choices; removed three extraction artifacts, five duplicate frozen presentations, and two stale specials; normalized the current soup and strawberry-sundae presentations; retained materially different service formulations; and separated 109 restaurant-issued ingredient-positive rows, four restaurant-linked affirmative-product rows, one restaurant-linked ingredient row, and 37 unavailable rows without inventing negative or cross-contact claims.";
  const ayseRemovedIds = [
    "caesar-salad-hummus-bowl", "cheese-pizza-pepperoni-pizza", "crabcake-fritters",
    "ice-cream-sundae", "linguini-pomodoro", "macaroni-and-cheese", "muhammara",
    "new-york-strip-steak", "salad-add-ons-chicken-dollar7-gulf-shrimp-dollar11-faroe-islands-salmon-dollar16-white-anchovies",
    "warm-pita",
  ];
  if (
    verifiedAyse && (
      (verifiedAyse.items ?? []).length !== 151 ||
      new Set((verifiedAyse.items ?? []).map((menuItem) => menuItem.id)).size !== 151 ||
      (verifiedAyse.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "official-ingredients").length !== 109 ||
      (verifiedAyse.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "restaurant-linked-product-allergen-section").length !== 4 ||
      (verifiedAyse.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "restaurant-linked-menu-ingredients").length !== 1 ||
      (verifiedAyse.items ?? []).filter((menuItem) => menuItem.allergenSourceType === "unavailable").length !== 37 ||
      (verifiedAyse.items ?? []).some((menuItem) => (menuItem.mayContain ?? []).length > 0) ||
      ayseRemovedIds.some((removedId) => (verifiedAyse.items ?? []).some((menuItem) => menuItem.id === removedId)) ||
      verifiedAyse.coverageStatus !== "complete" || verifiedAyse.launchQualityStatus !== "published" ||
      (verifiedAyse.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) => String(repair.note ?? "") === ayseRepairNote).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(await fs.readFile(
      "data/restaurant-verification/repairs/osm-ay-e-meze-lounge-13134929927/corrected-menu.json",
      "utf8",
    ));
    replaceVerifiedMixedMenuSnapshot("osm-ay-e-meze-lounge-13134929927", verifiedSnapshot, ayseRepairNote);
    verifiedAyse.guideUrl = verifiedSnapshot.sourceUrls[0];
    verifiedAyse.guideLabel = "Current AYŞE menus";
    verifiedAyse.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAyse.sourceFamily = "verified-owner-service-menus-plus-linked-toast-catalog";
    verifiedAyse.parserProfile = "verified-ayse-service-aware-menu-parser";
    verifiedAyse.sourceProfile = "verified-ayse:owner-service-formulations-plus-partial-linked-toast-affirmative-evidence";
    verifiedAyse.updated = "2026-07";
    verifiedAyse.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAyse.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAyse.coverageStatus = "complete";
    verifiedAyse.launchQualityStatus = "published";
    verifiedAyse.launchRemediationBucket = "none";
    verifiedAyse.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAyse.sourceStatus = {
      ...(verifiedAyse.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: verifiedSnapshot.sourceUrls.map((url, index) => `${index === 9 ? "partial-affirmative-menu:restaurant-linked-vendor" : "current-service-menu:restaurant-issued"}:${url}`),
        configuredUrlWarnings: [
          "owner-menu-ingredient-text-is-not-a-complete-allergen-matrix",
          "linked-toast-labels-are-partial-affirmative-evidence-only",
          "missing-terms-and-labels-are-not-negative-evidence",
          "no-global-cross-contact-claim-was-published",
          "service-specific-formulations-remain-separate-when-materially-different",
          "alcohol-and-modifier-only-choices-are-excluded",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 10,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      restaurantLinkedProductCount: verifiedSnapshot.linkedPositiveCount,
      restaurantLinkedIngredientCount: verifiedSnapshot.linkedIngredientCount,
      restaurantLinkedItemCount: verifiedSnapshot.linkedPositiveCount + verifiedSnapshot.linkedIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 94,
      frozenNormalizedMatchCount: 2,
      frozenArtifactCount: 3,
      frozenStaleProductCount: 7,
      frozenMatchedPresentationCount: 96,
      restoredCurrentFormulationCount: 55,
      frozenAllergenOrProvenanceMismatchCount: 48,
      reviewedMenuQualityRepairs: [
        ...((verifiedAyse.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter((repair) =>
          !/Verified repair: rebuilt AYŞE Meze Lounge|Final generated repair:/.test(String(repair.note ?? ""))
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: ayseRepairNote },
      ],
    };
  }

  const verifiedAztecaCollegePark = restaurant(
    "azteca-restaurant-college-park-md-dc-metro",
  );
  const aztecaCollegeParkRepairNote =
    "Verified repair: rebuilt Azteca Restaurant's College Park record from the hash-pinned current FOX Ordering menu linked by the official restaurant homepage; replaced the severely under-extracted three-row output with 94 canonical current products across nineteen categories; collapsed eight repeated vendor renderings and one duplicate Plato Picadera presentation; restored ninety-one current products; retained sixty-five narrow restaurant-linked ingredient-positive rows and twenty-nine unavailable rows; corrected all three frozen source-authority outcomes and the Grilled Quesadilla wheat/gluten overclaim; and did not promote flour-tortilla wording, missing labels, or incomplete descriptions into official, negative, or cross-contact claims.";
  if (
    verifiedAztecaCollegePark &&
    (
      (verifiedAztecaCollegePark.items ?? []).length !== 94 ||
      new Set((verifiedAztecaCollegePark.items ?? []).map((menuItem) => menuItem.id)).size !== 94 ||
      (verifiedAztecaCollegePark.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "restaurant-linked-menu-ingredients",
      ).length !== 65 ||
      (verifiedAztecaCollegePark.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 29 ||
      (verifiedAztecaCollegePark.items ?? []).some(
        (menuItem) => /official/i.test(String(menuItem.allergenSourceType ?? "")),
      ) ||
      (verifiedAztecaCollegePark.items ?? []).some(
        (menuItem) =>
          (menuItem.allergens ?? []).includes("wheat") ||
          (menuItem.allergens ?? []).includes("gluten") ||
          (menuItem.mayContain ?? []).length > 0,
      ) ||
      verifiedAztecaCollegePark.coverageStatus !== "complete" ||
      verifiedAztecaCollegePark.launchQualityStatus !== "published" ||
      (verifiedAztecaCollegePark.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === aztecaCollegeParkRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/azteca-restaurant-college-park-md-dc-metro/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "azteca-restaurant-college-park-md-dc-metro",
      verifiedSnapshot,
      aztecaCollegeParkRepairNote,
    );
    verifiedAztecaCollegePark.guideUrl = verifiedSnapshot.sourceUrls[1];
    verifiedAztecaCollegePark.guideLabel = "Current Azteca College Park ordering menu";
    verifiedAztecaCollegePark.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedAztecaCollegePark.sourceFamily = "verified-owner-linked-fox-ordering-menu";
    verifiedAztecaCollegePark.parserProfile = "verified-fox-ordering-category-parser";
    verifiedAztecaCollegePark.sourceProfile =
      "verified-azteca-college-park:owner-identity-plus-linked-fox-ordering-catalog";
    verifiedAztecaCollegePark.updated = "2026-07";
    verifiedAztecaCollegePark.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedAztecaCollegePark.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedAztecaCollegePark.coverageStatus = "complete";
    verifiedAztecaCollegePark.launchQualityStatus = "published";
    verifiedAztecaCollegePark.launchRemediationBucket = "none";
    verifiedAztecaCollegePark.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedAztecaCollegePark.sourceStatus = {
      ...(verifiedAztecaCollegePark.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `identity-and-ordering-linkage:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `current-menu-and-partial-ingredients:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[1]}`,
        ],
        configuredUrlWarnings: [
          "fox-ordering-footer-identifies-vendor-infrastructure",
          "linked-menu-is-not-a-restaurant-issued-allergen-matrix",
          "call-for-allergy-information-disclaimer-confirms-incomplete-public-allergen-data",
          "flour-tortilla-wording-is-not-promoted-to-wheat-or-gluten",
          "missing-description-terms-are-not-negative-evidence",
          "no-global-cross-contact-policy-was-published",
          "eight-repeated-vendor-renderings-are-deduplicated-by-iid",
          "two-plato-picadera-iids-are-one-canonical-product",
        ],
        nonFoodDocumentSuspected: false,
      },
      discardedItemCount: 9,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      rawMenuPresentationCount: verifiedSnapshot.rawPresentationCount,
      uniqueVendorProductCount: verifiedSnapshot.uniqueVendorProductCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: 0,
      restaurantLinkedIngredientCount: verifiedSnapshot.linkedIngredientCount,
      restaurantLinkedItemCount: verifiedSnapshot.linkedIngredientCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      frozenExactMatchCount: 2,
      frozenVariantMatchCount: 1,
      frozenMatchedCurrentProductCount: 3,
      restoredCurrentProductCount: 91,
      frozenAllergenOrProvenanceMismatchCount: 3,
      reviewedMenuQualityRepairs: [
        ...((verifiedAztecaCollegePark.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt Azteca Restaurant|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: aztecaCollegeParkRepairNote },
      ],
    };
  }

  const verifiedBSide = restaurant("b-side-mosaic-fairfax-va");
  const bSideRepairNote =
    "Verified repair: rebuilt B Side from four hash-pinned current restaurant-issued dinner, brunch, kids, and happy-hour PDFs plus its current linked ordering page; consolidated 66 food and nonalcoholic presentations into 58 canonical products; restored thirty-three products absent from the frozen catalog; corrected six dinner PDF-column category assignments; retained thirty narrow restaurant-issued ingredient-positive rows, two linked-menu ingredient rows, two linked-vendor affirmative product rows, and twenty-four unavailable rows; preserved the Chicharrones item-specific gluten and dairy cross-contact statement; corrected fifteen frozen allergen or provenance outcomes; excluded alcohol-only rows; and did not infer negatives from incomplete menu descriptions.";
  const bSideRequiredIds = [
    "48-hour-fermented-focaccia",
    "grilled-shishitos",
    "trio-of-the-above-3-snacks",
    "mixtape",
    "samples",
    "lemon-ricotta-donuts",
    "smoked-salmon-eggs-benedict",
    "breakfast-poutine",
    "kids-quesadilla",
    "pig-wings",
    "french-press-coffee",
    "whole-milk",
  ];
  if (
    verifiedBSide &&
    (
      (verifiedBSide.items ?? []).length !== 58 ||
      new Set((verifiedBSide.items ?? []).map((menuItem) => menuItem.id)).size !== 58 ||
      (verifiedBSide.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "official-ingredients",
      ).length !== 30 ||
      (verifiedBSide.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "restaurant-linked-menu-ingredients",
      ).length !== 2 ||
      (verifiedBSide.items ?? []).filter(
        (menuItem) =>
          menuItem.allergenSourceType === "restaurant-linked-product-allergen-section",
      ).length !== 2 ||
      (verifiedBSide.items ?? []).filter(
        (menuItem) => menuItem.allergenSourceType === "unavailable",
      ).length !== 24 ||
      (verifiedBSide.items ?? []).filter(
        (menuItem) => (menuItem.mayContain ?? []).length > 0,
      ).length !== 1 ||
      JSON.stringify(
        (verifiedBSide.items ?? []).find(
          (menuItem) => menuItem.id === "sour-cream-and-onion-chicharrones",
        )?.mayContain,
      ) !== JSON.stringify(["gluten", "milk"]) ||
      bSideRequiredIds.some((requiredId) =>
        !(verifiedBSide.items ?? []).some((menuItem) => menuItem.id === requiredId)
      ) ||
      verifiedBSide.coverageStatus !== "complete" ||
      verifiedBSide.launchQualityStatus !== "published" ||
      (verifiedBSide.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
        (repair) => String(repair.note ?? "") === bSideRepairNote,
      ).length !== 1
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/b-side-mosaic-fairfax-va/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "b-side-mosaic-fairfax-va",
      verifiedSnapshot,
      bSideRepairNote,
    );
    verifiedBSide.guideUrl = verifiedSnapshot.sourceUrls[1];
    verifiedBSide.guideLabel = "Current B Side food and nonalcoholic menus";
    verifiedBSide.sourceUrls = [...verifiedSnapshot.sourceUrls];
    verifiedBSide.sourceFamily = "verified-owner-pdfs-plus-linked-ordering-labels";
    verifiedBSide.parserProfile = "verified-b-side-rendered-multi-pdf-menu";
    verifiedBSide.sourceProfile =
      "verified-b-side:four-rendered-owner-pdfs-plus-partial-linked-ordering-evidence";
    verifiedBSide.updated = "2026-07";
    verifiedBSide.lastKnownGoodAt = verifiedSnapshot.retrievedAt;
    verifiedBSide.sourceUpdatedAt = verifiedSnapshot.retrievedAt;
    verifiedBSide.coverageStatus = "complete";
    verifiedBSide.launchQualityStatus = "published";
    verifiedBSide.launchRemediationBucket = "none";
    verifiedBSide.regionalScope = "local-menu-with-intelligence-fallback";
    verifiedBSide.sourceStatus = {
      ...(verifiedBSide.sourceStatus ?? {}),
      configuredUrlAudit: {
        configuredUrlRoles: [
          `identity-and-menu-linkage:restaurant-issued:${verifiedSnapshot.sourceUrls[0]}`,
          `current-dinner-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[1]}`,
          `current-brunch-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[2]}`,
          `current-kids-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[3]}`,
          `current-happy-hour-menu:restaurant-issued:${verifiedSnapshot.sourceUrls[4]}`,
          `partial-item-allergen-evidence:restaurant-linked-vendor:${verifiedSnapshot.sourceUrls[5]}`,
        ],
        configuredUrlWarnings: [
          "owner-pdfs-are-partial-ingredient-menus-not-a-complete-allergen-matrix",
          "linked-ordering-evidence-applies-only-to-caesar-smashburger-chicharrones-and-rambos",
          "missing-linked-labels-are-not-negative-evidence",
          "no-global-cross-contact-policy-was-published",
          "pdf-column-geometry-defines-small-plates-and-big-plates",
          "samples-is-a-current-configurable-priced-small-plates-offering",
          "mixtape-is-a-current-configurable-shared-menu-offering",
          "breakfast-poutine-is-duplicated-in-the-brunch-layout-and-consolidated",
          "alcohol-only-rows-are-excluded-from-the-allergen-focused-catalog",
        ],
        nonFoodDocumentSuspected: false,
      },
      ownerMenuPdfCount: 4,
      rawMenuPresentationCount: verifiedSnapshot.rawPresentationCount,
      collapsedDuplicatePresentationCount: verifiedSnapshot.collapsedPresentationCount,
      extractedFoodItemCount: verifiedSnapshot.itemCount,
      canonicalProductCount: verifiedSnapshot.itemCount,
      consumerCategoryCount: verifiedSnapshot.categoryCount,
      explicitOfficialIngredientCount: verifiedSnapshot.officialIngredientCount,
      restaurantLinkedIngredientCount: verifiedSnapshot.linkedIngredientCount,
      restaurantLinkedProductCount: verifiedSnapshot.linkedProductCount,
      restaurantLinkedItemCount: verifiedSnapshot.linkedPositiveCount,
      unavailableAllergenCount: verifiedSnapshot.unavailableAllergenCount,
      itemSpecificCrossContactCount: 1,
      retainedNonalcoholicBeverageCount: 7,
      frozenExactMatchCount: 25,
      frozenMatchedCurrentProductCount: 25,
      restoredCurrentProductCount: 33,
      correctedPdfColumnCategoryCount: 6,
      frozenAllergenOrProvenanceMismatchCount: 15,
      reviewedMenuQualityRepairs: [
        ...((verifiedBSide.sourceStatus?.reviewedMenuQualityRepairs ?? []).filter(
          (repair) => !/Verified repair: rebuilt B Side|Final generated repair:/.test(
            String(repair.note ?? ""),
          ),
        )),
        { replacedRows: verifiedSnapshot.itemCount, note: bSideRepairNote },
      ],
    };
  }

  const nineteenEightyThree = restaurant("osm-1983-chinese-cuisine-10746777097");
  if (
    nineteenEightyThree &&
    (
      new Set((nineteenEightyThree.items ?? []).map((menuItem) => menuItem.category)).size <= 1 ||
      nineteenEightyThree.items?.some((menuItem) =>
        ["noodles-and-fried-rice", "cherry-blossom-moose-cake", "coconut-jelly-cake"].includes(
          menuItem.id,
        ),
      )
    )
  ) {
    const verifiedSnapshot = JSON.parse(
      await fs.readFile(
        "data/restaurant-verification/repairs/osm-1983-chinese-cuisine-10746777097/corrected-menu.json",
        "utf8",
      ),
    );
    replaceVerifiedMixedMenuSnapshot(
      "osm-1983-chinese-cuisine-10746777097",
      verifiedSnapshot,
      "Verified repair: replaced the corrupted single-category 1983 Chinese Cuisine output with the current restaurant website and restaurant-linked Toast catalog; removed the section-heading artifact and shifted item associations, deduplicated menu surfaces, and retained only allergen signals explicitly supported by menu titles.",
    );
  }

  const shia = restaurant("shia-dc");
  if (shia && (shia.items?.length ?? 0) === 0) {
    const sourceUrl = "https://shiarestaurant.org/old-page1564878-menu/";
    replaceReviewedMenu(
      "shia-dc",
      reviewedMenuRows(
        [
          ["Scallop and Fried Oyster Ssam", "5-Course", "Scallop and fried oyster ssam with myeongran, Korean pear, and ssamjang."],
          ["Hobak Juk", "5-Course", "Kabocha porridge with chili and chestnut cream."],
          ["Soon-Dae", "5-Course", "Korean sausage with monkfish liver and daechu."],
          ["Saengsun Jjim", "5-Course", "Fish course with makgeolli, cauliflower, lotus root, and seojeot."],
          ["Grilled Roseda Farms Strip Loin", "5-Course", "Strip loin with galbi, gochujang, doenjang, and perilla."],
          ["Golden Queen Rice with Local Millet and Banchan", "5-Course", "Golden Queen rice with local millet and banchan."],
          ["Pumpkin & Perilla", "5-Course", "Pumpkin and perilla dessert with soondubu, sikhye, persimmon, and gangjeong."],
          ["OSULLOC & Gamtae Guksu", "7-Course", "Volcanic rock tea and gamtae noodle course with kelp, eel twigim, and pickled mu."],
          ["Ipgasim", "7-Course", "Sujeonggwa sorbet with nut gangjeong."],
          ["Gwail", "7-Course", "Fruit dessert with yuja, orange, and Juicyfruit."],
        ],
        sourceUrl,
        "reviewed-official-menu",
      ),
      "Final generated repair: recovered SHIA reviewed tasting-menu rows from its public menu page after the scraper produced no rows.",
    );
  }

  repairBaanMaeLinkedMenuAllergens();
}

for (const entry of repairEntries()) {
  for (const menuItem of entry.items ?? []) {
    if (
      menuItem.allergenSourceType === "unavailable" &&
      /Reviewed official row text: obvious ingredient terms were mapped to app allergens/i.test(
        String(menuItem.sourceSummary ?? ""),
      )
    ) {
      delete menuItem.sourceSummary;
    }
    if (
      !/Reviewed official row text: obvious ingredient terms were mapped to app allergens/i.test(
        String(menuItem.sourceSummary ?? ""),
      ) &&
      /(?:official menu ingredient review|mapped to app allergens|not a full allergen matrix|partial official ingredient evidence)/i.test(
        String(menuItem.sourceSummary ?? ""),
      )
    ) {
      delete menuItem.sourceSummary;
    }
  }
}

{
  const bindaasChickenTikkaPanini = item("bindaas-dc", "chicken-tikka-panini");
  if (bindaasChickenTikkaPanini?.allergenSourceType === "official-ingredients") {
    bindaasChickenTikkaPanini.sourceSummary =
      "Reviewed official row text: obvious ingredient terms were mapped to app allergens.";
  }
}

for (const entry of repairEntries()) {
  reconcileRestaurantCounts(entry);
}

await fs.writeFile(repositoryPath, JSON.stringify(repository));

console.log({
  repositoryPath,
  restaurantCount: repository.restaurants?.length ?? 0,
  itemCount: (repository.restaurants ?? []).reduce((count, entry) => count + (entry.items?.length ?? 0), 0),
});
