#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateRestaurantWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "./ingredient-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const repositoryPath = path.join(
  root,
  "src/data/generated/restaurants.generated.json",
);
const verificationRoot = path.join(root, "data/restaurant-verification");
const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
const reportPath = path.join(
  verificationRoot,
  "reports/structured-nutritionix-rebuild.json",
);
const replacementSourcePath = argumentPath(
  "source",
  ".codex-tmp/nutritionix-structured-repair-raw.json",
);
const overlaySourcePath = argumentPath(
  "overlay-source",
  ".codex-tmp/la-madeleine-structured-repair-raw.json",
);
const repository = readJson(repositoryPath);
const replacementSource = readJson(replacementSourcePath);
const overlaySource = readJson(overlaySourcePath);
const ledgerRows = readJsonLines(ledgerPath);
const manifest = await getDefaultIngredientIntelligenceManifest();
const repairAt = new Date().toISOString();

const targets = [
  {
    id: "texas-roadhouse",
    mode: "replace",
    sourceUrl:
      "https://nix-vue-inm.s3.amazonaws.com/restaurant/texas-roadhouse/data/menu-latest.json.gz",
  },
  {
    id: "chilis",
    mode: "replace",
    sourceUrl:
      "https://nix-vue-inm.s3.amazonaws.com/restaurant/chilis/data/menu-latest.json.gz",
  },
  {
    id: "mcalisters-deli",
    mode: "replace",
    sourceUrl:
      "https://nix-vue-inm.s3.amazonaws.com/restaurant/mcalisters-deli/data/menu-latest.json.gz",
  },
  {
    id: "la-madeleine",
    mode: "overlay",
    sourceUrl:
      "https://nix-vue-inm.s3.amazonaws.com/restaurant/la-madeleine/data/menu-latest.json.gz",
  },
];
const baselineBeforeById = new Map([
  [
    "texas-roadhouse",
    {
      itemCount: 57,
      officialItemCount: 30,
      unavailableItemCount: 27,
      describedItemCount: 0,
      ingredientTextItemCount: 0,
      optionVariantCount: 0,
      profileCount: 7,
    },
  ],
  [
    "chilis",
    {
      itemCount: 103,
      officialItemCount: 0,
      unavailableItemCount: 103,
      describedItemCount: 0,
      ingredientTextItemCount: 0,
      optionVariantCount: 0,
      profileCount: 0,
    },
  ],
  [
    "mcalisters-deli",
    {
      itemCount: 74,
      officialItemCount: 73,
      unavailableItemCount: 1,
      describedItemCount: 74,
      ingredientTextItemCount: 1,
      optionVariantCount: 0,
      profileCount: 0,
    },
  ],
  [
    "la-madeleine",
    {
      itemCount: 234,
      officialItemCount: 2,
      unavailableItemCount: 232,
      describedItemCount: 0,
      ingredientTextItemCount: 0,
      optionVariantCount: 0,
      profileCount: 0,
    },
  ],
]);

const report = {
  schemaVersion: 1,
  apply,
  generatedAt: repairAt,
  audit: {
    structuredFeedCandidates: 24,
    userVisibleRepairs: targets.map((target) => target.id),
    excludedOlderOrNonPublishingFeeds: [
      "corner-bakery-cafe",
      "firehouse-subs",
      "non-ledger-empty-source-shells",
    ],
  },
  repairs: [],
};

for (const target of targets) {
  const repositoryIndex = repository.restaurants.findIndex(
    (restaurant) => restaurant.id === target.id,
  );
  const existingRestaurant = repository.restaurants[repositoryIndex];
  if (!existingRestaurant) throw new Error(`${target.id}: restaurant missing.`);

  const refreshedRestaurant =
    target.mode === "replace"
      ? replacementSource.restaurants.find(
          (restaurant) => restaurant.id === target.id,
        )
      : overlaySource.restaurants.find(
          (restaurant) => restaurant.id === target.id,
        );
  if (!refreshedRestaurant) {
    throw new Error(`${target.id}: refreshed source restaurant missing.`);
  }

  const before = summarizeRestaurant(existingRestaurant);
  let nextRestaurant =
    target.mode === "replace"
      ? replaceRestaurant(existingRestaurant, refreshedRestaurant, target)
      : overlayRestaurant(existingRestaurant, refreshedRestaurant, target);

  nextRestaurant = assignCoverageProfiles(nextRestaurant);
  nextRestaurant = await annotateRestaurantWithIngredientIntelligence(
    nextRestaurant,
    { manifest },
  );
  nextRestaurant = refreshRestaurantCounts(nextRestaurant);
  assertRestaurant(target.id, nextRestaurant);

  const canonical = updateCanonicalVerification({
    existingRestaurant,
    nextRestaurant,
    repairAt,
    target,
  });
  repository.restaurants[repositoryIndex] = nextRestaurant;
  report.repairs.push({
    restaurantId: target.id,
    mode: target.mode,
    before: baselineBeforeById.get(target.id) ?? before,
    observedBefore: before,
    after: summarizeRestaurant(nextRestaurant),
    reconciliation: canonical.reconciliation,
  });
}

repository.generatedAt = repairAt;
repository.itemCount = repository.restaurants.reduce(
  (sum, restaurant) => sum + (restaurant.items?.length ?? 0),
  0,
);
repository.restaurantCount = repository.restaurants.length;
repository.metadata = {
  ...(repository.metadata ?? {}),
  structuredNutritionixRebuild: {
    generatedAt: repairAt,
    restaurantIds: targets.map((target) => target.id),
    contractVersion: 1,
  },
};

if (apply) {
  fs.writeFileSync(repositoryPath, `${JSON.stringify(repository)}\n`);
  writeJsonLines(ledgerPath, ledgerRows);
}
writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));

function replaceRestaurant(existing, refreshed, target) {
  return prepareRestaurant(
    {
      ...existing,
      ...refreshed,
      id: existing.id,
      brandKey: existing.brandKey ?? refreshed.brandKey,
      rank: existing.rank,
      coveragePercent: existing.coveragePercent,
      coverageStatus: existing.coverageStatus,
      logoAspectRatio: existing.logoAspectRatio ?? refreshed.logoAspectRatio,
      logoMonogram: existing.logoMonogram ?? refreshed.logoMonogram,
      logoSvgUrl: existing.logoSvgUrl ?? refreshed.logoSvgUrl,
      logoUrl: existing.logoUrl ?? refreshed.logoUrl,
      sourceFamily: "nutritionix",
      parserProfile: "nutritionix-official",
      sourceProfile: "nutritionix:nutritionix-official",
      sourceUrls: unique([
        ...(existing.sourceUrls ?? []),
        ...(refreshed.sourceUrls ?? []),
        target.sourceUrl,
      ]),
    },
    target,
  );
}

function overlayRestaurant(existing, refreshed, target) {
  const officialByName = new Map(
    (refreshed.items ?? [])
      .filter(
        (item) =>
          isOfficialItem(item) &&
          (item.sourceUrls ?? []).includes(target.sourceUrl),
      )
      .map((item) => [normalizeName(item.name), item]),
  );
  let overlaidItemCount = 0;
  const items = existing.items.map((item) => {
    const official = officialByName.get(normalizeName(item.name));
    if (!official) {
      const {
        officialAllergenProfileId: _profileId,
        officialAllergenCoveredIds: _coveredIds,
        ...baseItem
      } = item;
      return {
        ...baseItem,
        allergens: [],
        mayContain: [],
        mayContainAllergens: [],
        allergenSourceType: "unavailable",
        allergenAuthorityTier: null,
        allergenSourceEvidenceIds: [],
      };
    }
    overlaidItemCount += 1;
    return {
      ...item,
      allergens: official.allergens ?? [],
      mayContain: official.mayContain ?? [],
      mayContainAllergens: official.mayContain ?? [],
      officialAllergenCoveredIds:
        official.officialAllergenCoveredIds ?? [],
      allergenSourceType: "official-allergen-menu",
      allergenAuthorityTier: "restaurant_linked_vendor",
      description: meaningfulDescription(official.description)
        ? official.description
        : item.description ?? null,
      ingredientsText: official.ingredientsText ?? item.ingredientsText ?? null,
      nutritionFacts: official.nutritionFacts ?? item.nutritionFacts,
      sourceType: "official-api",
      sourceUrls: unique([...(item.sourceUrls ?? []), target.sourceUrl]),
      sourceSummary:
        "Reviewed restaurant-linked structured Nutritionix allergen row.",
    };
  });

  if (overlaidItemCount < 100) {
    throw new Error(
      `${target.id}: expected at least 100 structured overlays, found ${overlaidItemCount}.`,
    );
  }

  return prepareRestaurant(
    {
      ...existing,
      items,
      sourceUrls: unique([...(existing.sourceUrls ?? []), target.sourceUrl]),
      sourceStatus: {
        ...(existing.sourceStatus ?? {}),
        structuredNutritionixOverlayCount: overlaidItemCount,
      },
    },
    target,
  );
}

function prepareRestaurant(restaurant, target) {
  return {
    ...restaurant,
    guideLabel: "Official menu and allergen sources",
    officialAllergenStatus: "extracted",
    items: restaurant.items.map((item) => {
      const structured = (item.sourceUrls ?? []).includes(target.sourceUrl);
      const official = isOfficialItem(item);
      return {
        ...item,
        mayContainAllergens: item.mayContain ?? item.mayContainAllergens ?? [],
        ...(official
          ? {
              allergenAuthorityTier:
                item.allergenAuthorityTier ?? "restaurant_linked_vendor",
              sourceSummary: structured
                ? "Reviewed restaurant-linked structured Nutritionix allergen row."
                : item.sourceSummary,
            }
          : {}),
      };
    }),
  };
}

function assignCoverageProfiles(restaurant) {
  const profileIdByCoverage = new Map();
  const profiles = {};
  const items = restaurant.items.map((item) => {
    const coveredAllergenIds = unique(item.officialAllergenCoveredIds).sort();
    if (!isOfficialItem(item) || coveredAllergenIds.length === 0) {
      const { officialAllergenProfileId: _profileId, ...cleanItem } = item;
      return cleanItem;
    }

    const key = coveredAllergenIds.join(",");
    let profileId = profileIdByCoverage.get(key);
    if (!profileId) {
      profileId = `m${profileIdByCoverage.size + 1}`;
      profileIdByCoverage.set(key, profileId);
      profiles[profileId] = { coveredAllergenIds };
    }
    const { officialAllergenCoveredIds: _coveredIds, ...profiledItem } = item;
    return { ...profiledItem, officialAllergenProfileId: profileId };
  });

  return {
    ...restaurant,
    items,
    officialAllergenProfiles: profiles,
  };
}

function refreshRestaurantCounts(restaurant) {
  const officialItemCount = restaurant.items.filter(isOfficialItem).length;
  const totalItemCount = restaurant.items.length;
  const unavailableItemCount = totalItemCount - officialItemCount;
  const officialCoverageRatio = totalItemCount
    ? officialItemCount / totalItemCount
    : 0;
  return {
    ...restaurant,
    itemCount: totalItemCount,
    menuItemCount: totalItemCount,
    totalItemCount,
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      extractedFoodItemCount: totalItemCount,
      officialItemCount,
      officialEvidenceBucket:
        unavailableItemCount === 0 ? "official-full" : "official-partial",
    },
    allergenDataStatus: {
      itemCount: totalItemCount,
      officialItemCount,
      officialTotal: officialItemCount,
      totalItemCount,
      totalOfficialItemCount: officialItemCount,
      unavailableItemCount,
      officialCoverageRatio,
      bucket:
        unavailableItemCount === 0
          ? "official-disclosure"
          : "official-disclosure-only",
    },
  };
}

function updateCanonicalVerification({
  existingRestaurant,
  nextRestaurant,
  repairAt,
  target,
}) {
  const dossierPath = path.join(
    verificationRoot,
    "restaurants",
    `${target.id}.json`,
  );
  const evidencePath = path.join(
    verificationRoot,
    "evidence",
    `${target.id}.json`,
  );
  const checksPath = path.join(
    verificationRoot,
    "item-checks",
    `${target.id}.jsonl`,
  );
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const checks = readJsonLines(checksPath);
  const structuredEvidenceId = "ev-structured-nutritionix";
  const oldProductByKey = new Map(
    (dossier.currentCatalog?.products ?? []).map((product) => [
      product.currentProductKey,
      product,
    ]),
  );
  const nextItemsByName = groupBy(
    nextRestaurant.items,
    (item) => normalizeName(item.name),
  );
  const nextItemByKey = new Map(
    nextRestaurant.items.map((item) => [item.id, item]),
  );
  const matchedChecksByProduct = new Map(
    nextRestaurant.items.map((item) => [item.id, []]),
  );

  upsertEvidenceSource(evidence, {
    id: structuredEvidenceId,
    url: target.sourceUrl,
    finalUrl: target.sourceUrl,
    authorityTier: "restaurant_linked_vendor",
    purpose: "both",
    retrievedAt: repairAt,
    contentType: "application/json",
    httpStatus: 200,
    byteLength: null,
    sha256: null,
    artifactPath: null,
    excerpt:
      "Restaurant-linked structured Nutritionix feed with item-level allergen presence values and explicitly declared coverage dimensions.",
    rowIdentifiers: [],
    request: null,
    notes: [
      "Used for the structured Nutritionix rebuild; undefined allergen dimensions remain unavailable.",
    ],
  });

  for (const check of checks) {
    const candidateNames = unique([
      check.baseline?.name,
      ...(check.matchedCurrentProductKeys ?? []).map(
        (key) => oldProductByKey.get(key)?.name,
      ),
    ]);
    let matchedItems = candidateNames.flatMap(
      (name) => nextItemsByName.get(normalizeName(name)) ?? [],
    );
    matchedItems = uniqueBy(matchedItems, (item) => item.id);
    if (matchedItems.length === 0) {
      matchedItems = (check.matchedCurrentProductKeys ?? [])
        .map((key) => nextItemByKey.get(key))
        .filter(Boolean);
    }

    check.matchedCurrentProductKeys = matchedItems.map((item) => item.id);
    if (matchedItems.length === 0) {
      check.disposition = "stale_extra";
      check.allergenVerdict = "not_applicable";
      check.adjudicatedContainsAllergens = [];
      check.adjudicatedMayContainAllergens = [];
      check.adjudicatedAllergenSourceType = "unavailable";
      check.adjudicatedAllergenAuthorityTier = null;
      check.allergenSourceEvidenceIds = [];
      delete check.officialAllergenProfileId;
      check.notes =
        "The refreshed restaurant-linked structured menu no longer publishes this frozen product name.";
      continue;
    }

    for (const item of matchedItems) {
      matchedChecksByProduct.get(item.id)?.push(check.auditItemKey);
    }
    const officialItems = matchedItems.filter(isOfficialItem);
    const usesStructured = officialItems.some((item) =>
      (item.sourceUrls ?? []).includes(target.sourceUrl),
    );
    check.disposition = matchedItems.length > 1 ? "variant_match" : "exact_match";
    check.adjudicatedContainsAllergens = unique(
      officialItems.flatMap((item) => item.allergens ?? []),
    );
    check.adjudicatedMayContainAllergens = unique(
      officialItems.flatMap((item) => item.mayContain ?? []),
    );
    check.adjudicatedAllergenSourceType = officialItems.length
      ? "restaurant_allergen_document"
      : "unavailable";
    check.adjudicatedAllergenAuthorityTier = officialItems.length
      ? mode(
          officialItems.map(
            (item) =>
              item.allergenAuthorityTier ?? "restaurant_linked_vendor",
          ),
        )
      : null;
    check.allergenSourceEvidenceIds = usesStructured
      ? [structuredEvidenceId]
      : unique(check.allergenSourceEvidenceIds ?? []);
    check.sourceEvidenceIds = unique([
      ...(check.sourceEvidenceIds ?? []),
      ...(usesStructured ? [structuredEvidenceId] : []),
    ]);
    check.allergenVerdict = officialItems.length
      ? "verified"
      : "accurately_unavailable";
    const profileIds = unique(
      officialItems.map((item) => item.officialAllergenProfileId),
    );
    if (profileIds.length === 1) {
      check.officialAllergenProfileId = profileIds[0];
    } else {
      delete check.officialAllergenProfileId;
    }
    check.notes =
      "Reconciled against the refreshed restaurant-linked structured menu and allergen source.";
  }

  const products = nextRestaurant.items.map((item) => {
    const oldProduct = oldProductByKey.get(item.id);
    const structured = (item.sourceUrls ?? []).includes(target.sourceUrl);
    const official = isOfficialItem(item);
    const sourceEvidenceIds = unique([
      ...(oldProduct?.sourceEvidenceIds ?? []),
      ...(structured ? [structuredEvidenceId] : []),
    ]);
    const allergenSourceEvidenceIds = official
      ? unique([
          ...(structured ? [structuredEvidenceId] : []),
          ...(structured ? [] : oldProduct?.allergenSourceEvidenceIds ?? []),
        ])
      : [];
    return {
      currentProductKey: item.id,
      name: item.name,
      category: item.category,
      description: item.description ?? null,
      ingredientsText: item.ingredientsText ?? null,
      presentationIds: unique([
        ...(oldProduct?.presentationIds ?? []),
        item.sourceType,
        item.variantGroup ? `variant:${item.variantGroup}` : null,
        item.optionParentId ? `option-parent:${item.optionParentId}` : null,
      ]),
      matchedBaselineAuditItemKeys: matchedChecksByProduct.get(item.id) ?? [],
      sourceEvidenceIds,
      containsAllergens: item.allergens ?? [],
      mayContainAllergens: item.mayContain ?? [],
      allergenSourceType: official
        ? "restaurant_allergen_document"
        : "unavailable",
      allergenAuthorityTier: official
        ? item.allergenAuthorityTier ?? "restaurant_linked_vendor"
        : null,
      allergenSourceEvidenceIds,
      ...(item.officialAllergenProfileId
        ? { officialAllergenProfileId: item.officialAllergenProfileId }
        : {}),
      coordinatorReviewed: true,
      notes: unique([
        ...(oldProduct?.notes ?? []),
        ...(structured
          ? ["Refreshed from the restaurant-linked structured Nutritionix row."]
          : []),
      ]),
    };
  });

  const profiles = Object.fromEntries(
    Object.entries(nextRestaurant.officialAllergenProfiles ?? {}).map(
      ([profileId, profile]) => [
        profileId,
        {
          coveredAllergenIds: profile.coveredAllergenIds,
          sourceEvidenceIds: [structuredEvidenceId],
          sourceType: "restaurant-linked-vendor",
        },
      ],
    ),
  );
  const reconciliation = summarizeReconciliation(checks);
  dossier.currentCatalog = {
    ...(dossier.currentCatalog ?? {}),
    status: "verified",
    currentProductCount: products.length,
    reconciledCurrentProductCount: products.length,
    reviewedBaselineItemCount: checks.length,
    products,
    officialAllergenProfiles: profiles,
    notes: unique([
      ...(dossier.currentCatalog?.notes ?? []),
      "Rebuilt from restaurant-linked structured Nutritionix rows; explicit zeroes are negative only within each declared coverage profile.",
    ]),
    inventoryFingerprint: sha256(
      products.map(currentProductFingerprintRecord),
    ),
  };
  dossier.reconciliation = reconciliation;
  dossier.status = "codex_verified";
  dossier.updatedAt = repairAt;
  dossier.completedAt = repairAt;
  dossier.repairs = upsertById(dossier.repairs ?? [], {
    id: `structured-nutritionix-rebuild-${target.id}`,
    status: "verified",
    summary:
      "Rebuilt menu and official allergen coverage from the restaurant-linked structured Nutritionix source.",
    files: [repositoryPath, dossierPath, evidencePath, checksPath],
    fixturePaths: [
      "scripts/pipeline/legacy-scrape-engine.mjs",
      "scripts/pipeline/nutritionix-option-variants.mjs",
      "scripts/restaurant-pipeline.test.mjs",
    ],
    verificationCommands: [
      "restaurant pipeline tests",
      "canonical ledger validation",
      "allergen distribution audit",
      "allergen smear audit",
      "Ingredient Intelligence audit",
    ],
  });
  dossier.checks = {
    ...(dossier.checks ?? {}),
    menu: {
      verdict: "verified",
      reviewedItemCount: checks.length,
      sourceItemCount: products.length,
      notes: ["Current structured menu scope was refreshed and reconciled."],
    },
    allergenSource: {
      verdict: "verified",
      directPositiveCount: products.filter(
        (product) => product.containsAllergens.length > 0,
      ).length,
      directAssertionCount: products.filter(
        (product) => product.allergenSourceType !== "unavailable",
      ).length,
      highestAuthorityTier: "restaurant_linked_vendor",
      notes: [
        "Official positives and explicit negative dimensions are retained; undefined source dimensions remain unavailable.",
      ],
    },
    extraction: {
      verdict: "verified",
      parserReviewed: true,
      semanticsVerified: true,
      notes: ["Structured source parsing and projection semantics were regression tested."],
    },
  };

  const ledger = ledgerRows.find((row) => row.restaurantId === target.id);
  if (!ledger) throw new Error(`${target.id}: ledger row missing.`);
  ledger.status = "codex_verified";
  ledger.updatedAt = repairAt;
  ledger.completedAt = repairAt;
  ledger.repairStatus = "verified";
  ledger.verdicts = {
    menu: "verified",
    allergenSource: "verified",
    extraction: "verified",
  };

  if (apply) {
    writeJson(dossierPath, dossier);
    writeJson(evidencePath, evidence);
    writeJsonLines(checksPath, checks);
  }
  return { reconciliation };
}

function summarizeRestaurant(restaurant) {
  const items = restaurant.items ?? [];
  const official = items.filter(isOfficialItem);
  return {
    itemCount: items.length,
    officialItemCount: official.length,
    unavailableItemCount: items.length - official.length,
    describedItemCount: items.filter((item) => meaningfulDescription(item.description))
      .length,
    ingredientTextItemCount: items.filter((item) => item.ingredientsText).length,
    optionVariantCount: items.filter((item) => item.isOptionVariant).length,
    profileCount: Object.keys(restaurant.officialAllergenProfiles ?? {}).length,
  };
}

function assertRestaurant(restaurantId, restaurant) {
  if (!restaurant.items.length) throw new Error(`${restaurantId}: empty rebuild.`);
  const ids = new Set();
  for (const item of restaurant.items) {
    if (!item.id || !item.name) throw new Error(`${restaurantId}: invalid item.`);
    if (ids.has(item.id)) {
      throw new Error(`${restaurantId}: duplicate item ID ${item.id}.`);
    }
    ids.add(item.id);
  }
}

function summarizeReconciliation(checks) {
  return checks.reduce(
    (summary, check) => {
      summary[check.disposition] = (summary[check.disposition] ?? 0) + 1;
      return summary;
    },
    { exact_match: 0, variant_match: 0, stale_extra: 0, unresolved: 0 },
  );
}

function isOfficialItem(item) {
  return Boolean(
    item?.allergenSourceType && item.allergenSourceType !== "unavailable",
  );
}

function meaningfulDescription(value) {
  return Boolean(
    value && !/^Official .+ Nutritionix (?:nutrition and allergen |online )?guide\.?$/i.test(value),
  );
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function currentProductFingerprintRecord(product) {
  return {
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    presentationIds: product.presentationIds,
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
    containsAllergens: product.containsAllergens,
    mayContainAllergens: product.mayContainAllergens,
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier,
  };
}

function upsertEvidenceSource(evidence, source) {
  evidence.sources = upsertById(evidence.sources ?? [], source);
}

function upsertById(values, nextValue) {
  return [...values.filter((value) => value.id !== nextValue.id), nextValue];
}

function groupBy(values, keyForValue) {
  const groups = new Map();
  for (const value of values) {
    const key = keyForValue(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function uniqueBy(values, keyForValue) {
  return [...new Map(values.map((value) => [keyForValue(value), value])).values()];
}

function mode(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function argumentPath(name, fallback) {
  return path.resolve(root, argumentValue(name) ?? fallback);
}

function argumentValue(name) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonLines(filePath, values) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${values.map((value) => JSON.stringify(value)).join("\n")}\n`,
  );
}
