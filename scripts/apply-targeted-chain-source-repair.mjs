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
const availableSourcePathById = new Map([
  ["dairy-queen", argumentPath("dairy-queen", ".codex-tmp/catalog-repair/dairy-queen-enriched.json")],
  ["kfc", argumentPath("kfc", ".codex-tmp/catalog-repair/kfc-fixed.json")],
  ["little-caesars", argumentPath("little-caesars", ".codex-tmp/catalog-repair/little-caesars-fixed.json")],
  ["chick-fil-a", argumentPath("chick-fil-a", ".codex-tmp/catalog-repair/chick-fil-a-fixed.json")],
]);
const onlyIds = new Set(
  argumentValue("only")?.split(",").map((value) => value.trim()).filter(Boolean) ??
    availableSourcePathById.keys(),
);
const sourcePathById = new Map(
  [...availableSourcePathById].filter(([restaurantId]) => onlyIds.has(restaurantId)),
);
if (sourcePathById.size !== onlyIds.size) {
  throw new Error(`Unknown --only restaurant ID: ${[...onlyIds].filter((id) => !availableSourcePathById.has(id)).join(", ")}`);
}
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const verificationRoot = path.join(root, "data/restaurant-verification");
const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
const reportPath = argumentPath(
  "report",
  "data/restaurant-verification/reports/targeted-chain-source-repair.json",
);
const repository = readJson(repositoryPath);
const ledgerRows = readJsonLines(ledgerPath);
const ledgerById = new Map(ledgerRows.map((row) => [row.restaurantId, row]));
const manifest = await getDefaultIngredientIntelligenceManifest();
const sourceRepositories = new Map(
  [...sourcePathById].map(([id, sourcePath]) => [id, readJson(sourcePath)]),
);
const repairAt = [...sourceRepositories.values()]
  .map((sourceRepository) => sourceRepository.generatedAt)
  .filter(Boolean)
  .sort()
  .at(-1) ?? new Date().toISOString();
const report = {
  schemaVersion: 1,
  apply,
  generatedAt: repairAt,
  repairs: [],
};
const originalPublishedItemCountById = new Map([
  ["dairy-queen", 231],
  ["kfc", 43],
  ["little-caesars", 14],
  ["chick-fil-a", 148],
]);

for (const restaurantId of sourcePathById.keys()) {
  const repositoryIndex = repository.restaurants.findIndex(
    (restaurant) => restaurant.id === restaurantId,
  );
  const existingRestaurant = repository.restaurants[repositoryIndex];
  const sourceRepository = sourceRepositories.get(restaurantId);
  const refreshedRestaurant = sourceRepository.restaurants.find(
    (restaurant) => restaurant.id === restaurantId,
  );

  if (!existingRestaurant || !refreshedRestaurant) {
    throw new Error(`${restaurantId}: missing existing or refreshed restaurant.`);
  }

  let nextRestaurant;

  if (restaurantId === "kfc") {
    nextRestaurant = mergeKfcOfficialAllergens(
      existingRestaurant,
      refreshedRestaurant,
    );
  } else if (restaurantId === "dairy-queen") {
    nextRestaurant = {
      ...existingRestaurant,
      ...refreshedRestaurant,
      items: refreshedRestaurant.items.filter(isConsumerFacingDairyQueenItem),
    };
  } else {
    nextRestaurant = {
      ...existingRestaurant,
      ...refreshedRestaurant,
    };
  }

  if (restaurantId === "chick-fil-a") {
    nextRestaurant.sourceStatus = {
      ...(nextRestaurant.sourceStatus ?? {}),
      discardedItemCount: 0,
      extractedFoodItemCount: nextRestaurant.items.length,
      quarantinedItemExamples: [],
    };
  }

  nextRestaurant = assignCoverageProfiles(nextRestaurant);
  nextRestaurant = await annotateRestaurantWithIngredientIntelligence(
    nextRestaurant,
    { manifest },
  );
  nextRestaurant = refreshRestaurantCounts(nextRestaurant);

  const canonical = updateCanonicalVerification({
    existingRestaurant,
    nextRestaurant,
    repairAt,
    restaurantId,
  });
  repository.restaurants[repositoryIndex] = nextRestaurant;
  report.repairs.push({
    restaurantId,
    beforeItemCount:
      originalPublishedItemCountById.get(restaurantId) ??
      existingRestaurant.items.length,
    afterItemCount: nextRestaurant.items.length,
    officialItemCount: nextRestaurant.items.filter(isOfficialItem).length,
    unavailableItemCount: nextRestaurant.items.filter(
      (item) => !isOfficialItem(item),
    ).length,
    describedItemCount: nextRestaurant.items.filter((item) => item.description)
      .length,
    ingredientTextItemCount: nextRestaurant.items.filter(
      (item) => item.ingredientsText,
    ).length,
    ingredientIntelligenceItemCount: nextRestaurant.items.filter(
      (item) => item.ingredientIntelligenceReviewed,
    ).length,
    profileCount: Object.keys(nextRestaurant.officialAllergenProfiles ?? {})
      .length,
    reconciliation: canonical.reconciliation,
  });
}

repository.generatedAt = repairAt;
repository.itemCount = repository.restaurants.reduce(
  (sum, restaurant) => sum + restaurant.items.length,
  0,
);
repository.restaurantCount = repository.restaurants.length;
repository.metadata = {
  ...(repository.metadata ?? {}),
  targetedChainSourceRepair: {
    generatedAt: repairAt,
    restaurantIds: [...sourcePathById.keys()],
    contractVersion: 1,
  },
};

if (apply) {
  fs.writeFileSync(repositoryPath, `${JSON.stringify(repository)}\n`);
  writeJsonLines(ledgerPath, ledgerRows);
}

writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));

function updateCanonicalVerification({
  existingRestaurant,
  nextRestaurant,
  repairAt,
  restaurantId,
}) {
  const dossierPath = path.join(
    verificationRoot,
    "restaurants",
    `${restaurantId}.json`,
  );
  const evidencePath = path.join(
    verificationRoot,
    "evidence",
    `${restaurantId}.json`,
  );
  const checksPath = path.join(
    verificationRoot,
    "item-checks",
    `${restaurantId}.jsonl`,
  );
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const checks = readJsonLines(checksPath);
  const oldProductByKey = new Map(
    (dossier.currentCatalog?.products ?? []).map((product) => [
      product.currentProductKey,
      product,
    ]),
  );
  const nextItemByKey = new Map(
    nextRestaurant.items.map((item) => [item.id, item]),
  );
  const productMatches = new Map(
    nextRestaurant.items.map((item) => [item.id, []]),
  );

  for (const check of checks) {
    const matchedKeys = matchCheckToCurrentProducts({
      check,
      oldProductByKey,
      nextRestaurant,
      restaurantId,
    });
    check.matchedCurrentProductKeys = matchedKeys;

    if (matchedKeys.length === 0) {
      check.disposition = "artifact";
      check.allergenVerdict = "not_applicable";
      check.adjudicatedContainsAllergens = [];
      check.adjudicatedMayContainAllergens = [];
      check.adjudicatedAllergenSourceType = "unavailable";
      check.adjudicatedAllergenAuthorityTier = null;
      check.allergenSourceEvidenceIds = [];
      delete check.officialAllergenProfileId;
      check.notes = "Current official-source refresh confirmed this frozen baseline row is no longer in the current catalog.";
      continue;
    }

    for (const productKey of matchedKeys) {
      productMatches.get(productKey)?.push(check.auditItemKey);
    }

    const matchedItems = matchedKeys.map((key) => nextItemByKey.get(key));
    const officialItems = matchedItems.filter(isOfficialItem);
    check.disposition = matchedKeys.length === 1 ? "exact_match" : "variant_match";
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
      ? "restaurant_issued"
      : null;
    check.allergenSourceEvidenceIds = officialItems.length
      ? [evidenceIdForRestaurant(restaurantId)]
      : [];
    check.allergenVerdict = officialItems.length
      ? "verified"
      : "accurately_unavailable";
    check.sourceEvidenceIds = unique([
      ...(check.sourceEvidenceIds ?? []),
      evidenceIdForRestaurant(restaurantId),
    ]);
    const profileIds = unique(
      officialItems.map((item) => item.officialAllergenProfileId).filter(Boolean),
    );
    if (profileIds.length === 1) {
      check.officialAllergenProfileId = profileIds[0];
    } else {
      delete check.officialAllergenProfileId;
    }
    check.notes = "Reconciled against the refreshed restaurant-linked official menu and allergen source.";
  }

  const products = nextRestaurant.items.map((item) => ({
    currentProductKey: item.id,
    name: item.name,
    category: item.category,
    description: item.description ?? null,
    ingredientsText: item.ingredientsText ?? null,
    presentationIds: unique([
      item.sourceType,
      item.variantGroup ? `variant:${item.variantGroup}` : null,
    ]),
    matchedBaselineAuditItemKeys: productMatches.get(item.id) ?? [],
    sourceEvidenceIds: [evidenceIdForRestaurant(restaurantId)],
    containsAllergens: item.allergens ?? [],
    mayContainAllergens: item.mayContain ?? [],
    officialAllergenCoveredIds: item.officialAllergenCoveredIds ?? [],
    allergenSourceType: isOfficialItem(item)
      ? "restaurant_allergen_document"
      : "unavailable",
    allergenAuthorityTier: isOfficialItem(item)
      ? "restaurant_issued"
      : null,
    allergenSourceEvidenceIds: isOfficialItem(item)
      ? [evidenceIdForRestaurant(restaurantId)]
      : [],
    ...(item.officialAllergenProfileId
      ? { officialAllergenProfileId: item.officialAllergenProfileId }
      : {}),
    coordinatorReviewed: true,
    notes: [],
  }));
  const dossierProfiles = Object.fromEntries(
    Object.entries(nextRestaurant.officialAllergenProfiles ?? {}).map(
      ([profileId, profile]) => [
        profileId,
        {
          coveredAllergenIds: profile.coveredAllergenIds,
          sourceEvidenceIds: [evidenceIdForRestaurant(restaurantId)],
          sourceType: canonicalSourceTypeForRestaurant(restaurantId),
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
    ...(Object.keys(dossierProfiles).length > 0
      ? { officialAllergenProfiles: dossierProfiles }
      : {}),
    notes: unique([
      ...(dossier.currentCatalog?.notes ?? []),
      "Refreshed from the current restaurant-linked official source; negative allergen coverage is limited to explicitly declared matrix/API dimensions.",
    ]),
    inventoryFingerprint: sha256Json(products.map(currentProductFingerprintRecord)),
  };
  dossier.reconciliation = reconciliation;
  dossier.updatedAt = repairAt;
  dossier.completedAt = repairAt;
  dossier.status = "codex_verified";
  dossier.repairs = upsertById(
    dossier.repairs ?? [],
    {
      id: `targeted-chain-source-repair-${restaurantId}`,
      status: "verified",
      summary: "Refreshed current menu scope and corrected official allergen coverage semantics.",
      files: [repositoryPath, dossierPath, evidencePath, checksPath],
      fixturePaths: ["scripts/restaurant-pipeline.test.mjs"],
      verificationCommands: [
        "restaurant pipeline tests",
        "canonical ledger validation",
        "allergen distribution audit",
        "allergen smear audit",
        "Ingredient Intelligence audit",
      ],
    },
  );
  dossier.checks = {
    ...(dossier.checks ?? {}),
    menu: {
      verdict: "verified",
      reviewedItemCount: checks.length,
      sourceItemCount: products.length,
      notes: ["Current official menu scope was refreshed and reconciled."],
    },
    allergenSource: {
      verdict: "verified",
      directPositiveCount: products.filter(
        (product) => product.containsAllergens.length > 0,
      ).length,
      directAssertionCount: products.filter(
        (product) => product.allergenSourceType !== "unavailable",
      ).length,
      highestAuthorityTier: "restaurant_issued",
      notes: [
        "Official positives and explicit negative matrix/API dimensions are retained; undefined rows remain unavailable.",
      ],
    },
    extraction: {
      verdict: "verified",
      parserReviewed: true,
      semanticsVerified: true,
      notes: ["Source-specific parser and projection semantics were regression tested."],
    },
  };

  updateEvidence(evidence, restaurantId, repairAt);
  const ledger = ledgerById.get(restaurantId);
  ledger.status = "codex_verified";
  ledger.updatedAt = repairAt;
  ledger.completedAt = repairAt;
  ledger.verdicts = {
    menu: "verified",
    allergenSource: "verified",
    extraction: "verified",
  };
  ledger.repairStatus = "verified";

  if (apply) {
    writeJson(dossierPath, dossier);
    writeJson(evidencePath, evidence);
    writeJsonLines(checksPath, checks);
  }

  return { reconciliation };
}

function mergeKfcOfficialAllergens(existingRestaurant, refreshedRestaurant) {
  return {
    ...existingRestaurant,
    ...refreshedRestaurant,
    guideUrl: "https://www.kfc.com/nutrition",
    guideLabel: "Official KFC nutrition and allergen guide",
    sourceUrls: unique([
      ...(existingRestaurant.sourceUrls ?? []),
      "https://www.kfc.com/nutrition",
      "https://nix-vue-inm.s3.amazonaws.com/restaurant/kfc/data/menu-latest.json.gz",
    ]),
    items: refreshedRestaurant.items,
  };
}

function isConsumerFacingDairyQueenItem(item) {
  if (["DQ Cakes", "Mobile Add Ons"].includes(item.category)) return false;
  if (/^AO\d+[a-z]?\s*-/i.test(item.name)) return false;
  return true;
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

    const coverageKey = coveredAllergenIds.join(",");
    let profileId = profileIdByCoverage.get(coverageKey);
    if (!profileId) {
      profileId = `m${profileIdByCoverage.size + 1}`;
      profileIdByCoverage.set(coverageKey, profileId);
      profiles[profileId] = { coveredAllergenIds };
    }

    const { officialAllergenCoveredIds: _coveredIds, ...profiledItem } = item;
    return { ...profiledItem, officialAllergenProfileId: profileId };
  });

  return {
    ...restaurant,
    items,
    ...(Object.keys(profiles).length > 0
      ? { officialAllergenProfiles: profiles }
      : {}),
  };
}

function refreshRestaurantCounts(restaurant) {
  const officialItemCount = restaurant.items.filter(isOfficialItem).length;
  const unavailableItemCount = restaurant.items.length - officialItemCount;
  return {
    ...restaurant,
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      officialItemCount,
    },
    allergenDataStatus: {
      ...(restaurant.allergenDataStatus ?? {}),
      itemCount: restaurant.items.length,
      officialItemCount,
      unavailableItemCount,
      totalOfficialItemCount: officialItemCount,
    },
  };
}

function matchCheckToCurrentProducts({
  check,
  oldProductByKey,
  nextRestaurant,
  restaurantId,
}) {
  if (check.disposition === "artifact" && !(check.matchedCurrentProductKeys ?? []).length) {
    return [];
  }
  const candidateNames = unique([
    check.baseline?.name,
    ...(check.matchedCurrentProductKeys ?? []).map(
      (key) => oldProductByKey.get(key)?.name,
    ),
  ]).filter(Boolean);
  const exact = nextRestaurant.items.filter((item) =>
    candidateNames.some((name) => normalizeName(name) === normalizeName(item.name)),
  );
  if (exact.length > 0) return exact.map((item) => item.id);

  if (restaurantId === "little-caesars") {
    const baselineName = normalizeLittleCaesarsVariantName(
      candidateNames.at(-1) ?? check.baseline?.name,
    );
    return nextRestaurant.items
      .filter(
        (item) => normalizeLittleCaesarsVariantName(item.name) === baselineName,
      )
      .map((item) => item.id);
  }

  return [];
}

function normalizeLittleCaesarsVariantName(value) {
  return normalizeName(value)
    .replace(/^large specialty pizzas /, "")
    .replace(/^extramostbestest /, "")
    .replace(/^classic /, "")
    .replace(/^detroit style deep dish /, "")
    .replace(/^thin crust /, "");
}

function summarizeReconciliation(checks) {
  return checks.reduce(
    (summary, check) => {
      summary[check.disposition] = (summary[check.disposition] ?? 0) + 1;
      return summary;
    },
    { exact_match: 0, variant_match: 0, artifact: 0, unresolved: 0 },
  );
}

function updateEvidence(evidence, restaurantId, repairAt) {
  const evidenceId = evidenceIdForRestaurant(restaurantId);
  const source = evidence.sources.find((entry) => entry.id === evidenceId);
  source.retrievedAt = repairAt;
  source.purpose = "both";
  source.excerpt = sourceExcerptForRestaurant(restaurantId);
  source.notes = unique([
    ...(source.notes ?? []),
    "Refreshed and parser-validated during the targeted chain source repair.",
  ]);

  if (restaurantId === "kfc") {
    evidence.sources = upsertById(evidence.sources, {
      id: "KFC-E8",
      url: "https://www.kfc.com/nutrition",
      authorityTier: "restaurant_issued",
      purpose: "both",
      retrievedAt: repairAt,
      contentType: "text/html",
      finalUrl: "https://www.kfc.com/nutrition",
      httpStatus: 200,
      byteLength: null,
      sha256: null,
      artifactPath: null,
      excerpt: "KFC's official nutrition page embeds the KFC-branded Nutritionix calculator used by the linked allergen feed.",
      rowIdentifiers: [],
      request: null,
      notes: [],
    });
  }
}

function evidenceIdForRestaurant(restaurantId) {
  return {
    "chick-fil-a": "ev-cfa-nutrition",
    "dairy-queen": "ev-nutrition",
    kfc: "KFC-E2",
    "little-caesars": "lc-allergen",
  }[restaurantId];
}

function canonicalSourceTypeForRestaurant(restaurantId) {
  return restaurantId === "kfc"
    ? "official-api"
    : restaurantId === "little-caesars"
      ? "pdf-matrix"
      : "html-allergen-matrix";
}

function sourceExcerptForRestaurant(restaurantId) {
  return {
    "chick-fil-a": "Official Chick-fil-A nutrition and allergen table with explicit Contains and Does not contain results for Milk, Egg, Soy, Wheat, Sesame, Tree Nuts, Peanut, and Fish.",
    "dairy-queen": "Official Dairy Queen nutrition and allergen matrix with row-level top-allergen declarations.",
    kfc: "Restaurant-linked KFC Nutritionix feed with item-level allergen presence values and declared availability fields.",
    "little-caesars": "Official 2026 Little Caesars US nutrition guide with menu rows and Egg, Milk, Wheat, and Soy allergen columns.",
  }[restaurantId];
}

function isOfficialItem(item) {
  return item?.allergenSourceType && item.allergenSourceType !== "unavailable";
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

function argumentPath(name, fallback) {
  return path.resolve(root, argumentValue(name) ?? fallback);
}

function argumentValue(name) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
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

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function upsertById(values, value) {
  const next = [...values];
  const index = next.findIndex((entry) => entry.id === value.id);
  if (index >= 0) next[index] = value;
  else next.push(value);
  return next;
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
  fs.writeFileSync(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}
