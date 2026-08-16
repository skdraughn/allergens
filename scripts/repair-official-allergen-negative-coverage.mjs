#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

import { classifyMenuItemRow } from "./menu-item-quality.mjs";

const apply = process.argv.includes("--apply");
const targetRestaurantId = process.argv
  .find((argument) => argument.startsWith("--restaurant="))
  ?.slice("--restaurant=".length) || null;
const targetRestaurantIds = new Set([
  ...(targetRestaurantId ? [targetRestaurantId] : []),
  ...(
    process.argv
      .find((argument) => argument.startsWith("--restaurants="))
      ?.slice("--restaurants=".length)
      .split(",") ?? []
  ).filter(Boolean),
]);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const verificationRoot = path.join(root, "data/restaurant-verification");
const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
const reportPath = path.join(
  verificationRoot,
  "reports/official-allergen-negative-coverage-repair.json",
);
const repository = readJson(repositoryPath);
const ledgerRows = readJsonLines(ledgerPath);
const ledgerByRestaurantId = new Map(
  ledgerRows.map((row) => [row.restaurantId, row]),
);
const report = {
  apply,
  coverageContractVersion: 3,
  generatedAt: new Date().toISOString(),
  restaurantCount: 0,
  profileCount: 0,
  profiledItemCount: 0,
  officialPositiveProfiledCount: 0,
  officialNegativeProfiledCount: 0,
  explicitBooleanCoverageRepairs: [],
  removedStructuralHeadingArtifacts: [],
  rolledBackUnsupportedIngredientPromotions: [],
  skippedGroups: [],
  restaurants: [],
};

for (let restaurantIndex = 0; restaurantIndex < repository.restaurants.length; restaurantIndex += 1) {
  const restaurant = repository.restaurants[restaurantIndex];
  if (targetRestaurantIds.size > 0 && !targetRestaurantIds.has(restaurant.id)) continue;
  const checksPath = path.join(verificationRoot, "item-checks", `${restaurant.id}.jsonl`);
  const dossierPath = path.join(verificationRoot, "restaurants", `${restaurant.id}.json`);
  const evidencePath = path.join(verificationRoot, "evidence", `${restaurant.id}.json`);

  if (![checksPath, dossierPath, evidencePath].every(fs.existsSync)) {
    continue;
  }

  const checks = readJsonLines(checksPath);
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const rolledBackUnsupportedIngredientPromotions = rollbackUnsupportedIngredientPromotions({
    checks,
    dossier,
    restaurant,
  });
  const removedStructuralHeadingArtifacts = removeStructuralHeadingArtifacts({
    checks,
    dossier,
    restaurant,
  });
  const evidenceById = new Map((evidence.sources ?? []).map((source) => [source.id, source]));
  const explicitBooleanCoverage = await hydrateExplicitBooleanCoverage({
    checks,
    evidenceSources: evidence.sources ?? [],
    restaurantId: restaurant.id,
  });
  const precleanedProfileProductCount = resetExistingCoverageProfiles({
    checks,
    dossier,
    restaurant,
  });
  const groups = buildEligibleGroups({ checks, evidenceById, restaurantId: restaurant.id });

  if (
    groups.length === 0 &&
    precleanedProfileProductCount === 0 &&
    removedStructuralHeadingArtifacts.length === 0
  ) {
    continue;
  }

  const profileByAuditKey = new Map();
  const profileIdsByProductKey = new Map();

  groups.forEach((group, index) => {
    group.profileId = `m${index + 1}`;

    for (const check of group.checks) {
      profileByAuditKey.set(check.auditItemKey, group);

      for (const productKey of check.matchedCurrentProductKeys ?? []) {
        const ids = profileIdsByProductKey.get(productKey) ?? new Set();
        ids.add(group.profileId);
        profileIdsByProductKey.set(productKey, ids);
      }
    }
  });

  const ambiguousProductKeys = new Set(
    [...profileIdsByProductKey]
      .filter(([, profileIds]) => profileIds.size !== 1)
      .map(([productKey]) => productKey),
  );
  const generatedById = new Map((restaurant.items ?? []).map((item) => [item.id, item]));
  const dossierByKey = new Map(
    (dossier.currentCatalog?.products ?? []).map((product) => [
      product.currentProductKey,
      product,
    ]),
  );
  let profiledItemCount = 0;
  let cleanedAmbiguousProductCount = 0;
  let officialPositiveProfiledCount = 0;
  let officialNegativeProfiledCount = 0;

  for (const [productKey, profileIds] of profileIdsByProductKey) {
    if (ambiguousProductKeys.has(productKey)) {
      report.skippedGroups.push({
        reason: "ambiguous-product-profile",
        restaurantId: restaurant.id,
        productKey,
        profileIds: [...profileIds],
      });
      const generatedItem = generatedById.get(productKey);
      const dossierProduct = dossierByKey.get(productKey);

      if (generatedItem?.officialAllergenProfileId || dossierProduct?.officialAllergenProfileId) {
        if (generatedItem) {
          delete generatedItem.officialAllergenProfileId;
        }

        if (dossierProduct) {
          delete dossierProduct.officialAllergenProfileId;
        }

        for (const check of checks) {
          if (!(check.matchedCurrentProductKeys ?? []).includes(productKey)) continue;
          check.notes = removeRepairNote(check.notes);
          delete check.officialAllergenProfileId;
        }
        cleanedAmbiguousProductCount += 1;
      }
      continue;
    }

    const profileId = [...profileIds][0];
    const group = groups.find((candidate) => candidate.profileId === profileId);
    const generatedItem = generatedById.get(productKey);
    const dossierProduct = dossierByKey.get(productKey);

    if (!group || !generatedItem || !dossierProduct) {
      continue;
    }

    generatedItem.officialAllergenProfileId = profileId;
    dossierProduct.officialAllergenProfileId = profileId;
    profiledItemCount += 1;

    const matchedChecks = group.checks.filter((check) =>
      (check.matchedCurrentProductKeys ?? []).includes(productKey),
    );
    const repairableChecks = matchedChecks.filter(isRepairableOfficialMatrixRow);

    if (repairableChecks.length === 0) {
      continue;
    }

    const baselineAllergens = unique(
      repairableChecks.flatMap((check) => check.baseline?.allergens ?? []),
    ).sort();
    const baselineMayContain = unique(
      repairableChecks.flatMap((check) => check.baseline?.mayContain ?? []),
    ).sort();

    if (generatedItem.allergenSourceType === "unavailable") {
      generatedItem.allergens = baselineAllergens;
      generatedItem.mayContain = baselineMayContain;
      generatedItem.mayContainAllergens = baselineMayContain;
      generatedItem.allergenSourceType = "official-allergen-menu";
      generatedItem.allergenAuthorityTier = "restaurant_issued";
      generatedItem.allergenSourceEvidenceIds = [...group.sourceEvidenceIds];
      dossierProduct.containsAllergens = baselineAllergens;
      dossierProduct.mayContainAllergens = baselineMayContain;
      dossierProduct.allergenSourceType = "official-allergen-menu";
      dossierProduct.allergenAuthorityTier = "restaurant_issued";
      dossierProduct.allergenSourceEvidenceIds = [...group.sourceEvidenceIds];
    }

    if (baselineAllergens.length > 0 || baselineMayContain.length > 0) {
      officialPositiveProfiledCount += 1;
    } else {
      officialNegativeProfiledCount += 1;
    }
  }

  if (
    profiledItemCount === 0 &&
    cleanedAmbiguousProductCount === 0 &&
    precleanedProfileProductCount === 0
  ) {
    continue;
  }

  for (const check of checks) {
    const group = profileByAuditKey.get(check.auditItemKey);

    if (!group) {
      continue;
    }

    check.officialAllergenProfileId = group.profileId;

    if (!isRepairableOfficialMatrixRow(check)) {
      continue;
    }

    if (check.adjudicatedAllergenSourceType === "unavailable") {
      check.allergenVerdict = "verified";
      check.adjudicatedContainsAllergens = [...(check.baseline?.allergens ?? [])];
      check.adjudicatedMayContainAllergens = [...(check.baseline?.mayContain ?? [])];
      check.adjudicatedAllergenSourceType = "official-allergen-menu";
      check.adjudicatedAllergenAuthorityTier = "restaurant_issued";
      check.allergenSourceEvidenceIds = [...group.sourceEvidenceIds];
    }
    check.notes = appendNote(
      check.notes,
      "Restored explicit official-matrix negative coverage for the allergens declared by the source profile; uncovered allergens remain unresolved.",
    );
  }

  const usedProfileIds = new Set(
    [...generatedById.values()].map((item) => item.officialAllergenProfileId).filter(Boolean),
  );
  const usedGroups = groups.filter((group) => usedProfileIds.has(group.profileId));
  for (const check of checks) {
    if (
      check.officialAllergenProfileId &&
      !usedProfileIds.has(check.officialAllergenProfileId)
    ) {
      delete check.officialAllergenProfileId;
    }
  }
  const runtimeProfiles = Object.fromEntries(
    usedGroups.map((group) => [
      group.profileId,
      { coveredAllergenIds: [...group.coveredAllergenIds] },
    ]),
  );
  const dossierProfiles = Object.fromEntries(
    usedGroups.map((group) => [
      group.profileId,
      {
        coveredAllergenIds: [...group.coveredAllergenIds],
        sourceEvidenceIds: [...group.sourceEvidenceIds],
        sourceType: group.sourceType,
      },
    ]),
  );
  validateExplicitProfileAssignments({ checks, groups: usedGroups });
  if (usedGroups.length > 0) {
    restaurant.officialAllergenProfiles = runtimeProfiles;
    dossier.currentCatalog.officialAllergenProfiles = dossierProfiles;
  } else {
    delete restaurant.officialAllergenProfiles;
    delete dossier.currentCatalog.officialAllergenProfiles;
  }
  const coverageNote =
    "Explicit official matrix rows now retain allergy-specific negative coverage; silence outside each matrix profile remains unavailable.";
  dossier.currentCatalog.notes = usedGroups.length > 0
    ? unique([...(dossier.currentCatalog.notes ?? []), coverageNote])
    : (dossier.currentCatalog.notes ?? []).filter((note) => note !== coverageNote);
  dossier.currentCatalog.inventoryFingerprint = createHash("sha256")
    .update(JSON.stringify(dossier.currentCatalog.products.map(currentProductFingerprintRecord)))
    .digest("hex");

  refreshOfficialCounts(restaurant);
  repository.restaurants[restaurantIndex] = restaurant;

  report.restaurantCount += 1;
  report.profileCount += usedGroups.length;
  report.profiledItemCount += profiledItemCount;
  report.officialPositiveProfiledCount += officialPositiveProfiledCount;
  report.officialNegativeProfiledCount += officialNegativeProfiledCount;
  report.restaurants.push({
    restaurantId: restaurant.id,
    name: restaurant.name,
    cleanedAmbiguousProductCount,
    precleanedProfileProductCount,
    profiles: usedGroups.map((group) => ({
      coveredAllergenIds: group.coveredAllergenIds,
      profileId: group.profileId,
      sourceEvidenceIds: group.sourceEvidenceIds,
      sourceType: group.sourceType,
    })),
    profiledItemCount,
    officialPositiveProfiledCount,
    officialNegativeProfiledCount,
    explicitBooleanCoverage,
    removedStructuralHeadingArtifacts,
    rolledBackUnsupportedIngredientPromotions,
  });
  report.removedStructuralHeadingArtifacts.push(...removedStructuralHeadingArtifacts);
  report.rolledBackUnsupportedIngredientPromotions.push(
    ...rolledBackUnsupportedIngredientPromotions,
  );
  if (explicitBooleanCoverage.length > 0) {
    report.explicitBooleanCoverageRepairs.push(...explicitBooleanCoverage);
  }

  if (apply) {
    const ledgerRow = ledgerByRestaurantId.get(restaurant.id);
    if (!ledgerRow) {
      throw new Error(`Missing ledger row for ${restaurant.id}.`);
    }
    ledgerRow.baseline.itemFingerprint = sha256Json(
      checks.map((check) => check.baseline),
    );
    writeJsonLines(checksPath, checks);
    writeJson(dossierPath, dossier, true);
  }
}

report.restaurants.sort((left, right) => left.restaurantId.localeCompare(right.restaurantId));
report.skippedGroups.sort((left, right) =>
  `${left.restaurantId}:${left.reason}`.localeCompare(`${right.restaurantId}:${right.reason}`),
);

if (apply) {
  writeJsonLines(ledgerPath, ledgerRows);
  repository.generatedAt = report.generatedAt;
  repository.itemCount = repository.restaurants.reduce(
    (sum, restaurant) => sum + (restaurant.items?.length ?? 0),
    0,
  );
  repository.restaurantCount = repository.restaurants.length;
  repository.metadata = {
    ...(repository.metadata ?? {}),
    officialAllergenNegativeCoverageRepair: {
      generatedAt: report.generatedAt,
      profileCount: report.profileCount,
      profiledItemCount: report.profiledItemCount,
      restaurantCount: report.restaurantCount,
      officialPositiveProfiledCount: report.officialPositiveProfiledCount,
      officialNegativeProfiledCount: report.officialNegativeProfiledCount,
    },
  };
  writeJson(repositoryPath, repository, false);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  writeJson(reportPath, report, true);
}

console.log(JSON.stringify(report, null, 2));

function rollbackUnsupportedIngredientPromotions({ checks, dossier, restaurant }) {
  const repairNote =
    "Restored explicit official-matrix negative coverage for the allergens declared by the source profile; uncovered allergens remain unresolved.";
  const affectedProductKeys = new Set();

  for (const check of checks) {
    if (
      check.baseline?.allergenSourceType !== "official-ingredients" ||
      !String(check.notes ?? "").includes(repairNote) ||
      check.adjudicatedAllergenSourceType !== "official-allergen-menu"
    ) {
      continue;
    }
    for (const productKey of check.matchedCurrentProductKeys ?? []) {
      affectedProductKeys.add(productKey);
    }
    check.allergenVerdict = "accurately_unavailable";
    check.adjudicatedContainsAllergens = [];
    check.adjudicatedMayContainAllergens = [];
    check.adjudicatedAllergenSourceType = "unavailable";
    check.adjudicatedAllergenAuthorityTier = null;
    check.allergenSourceEvidenceIds = [];
    check.notes = removeRepairNote(check.notes);
    delete check.officialAllergenProfileId;
  }

  if (affectedProductKeys.size === 0) return [];
  const dossierByKey = new Map(
    (dossier.currentCatalog?.products ?? []).map((product) => [product.currentProductKey, product]),
  );
  const generatedByKey = new Map((restaurant.items ?? []).map((item) => [item.id, item]));

  for (const productKey of affectedProductKeys) {
    const product = dossierByKey.get(productKey);
    const item = generatedByKey.get(productKey);
    if (!product || !item) {
      throw new Error(`${restaurant.id}:${productKey}: cannot roll back an unsupported promotion.`);
    }
    product.containsAllergens = [];
    product.mayContainAllergens = [];
    product.allergenSourceType = "unavailable";
    product.allergenAuthorityTier = null;
    product.allergenSourceEvidenceIds = [];
    delete product.officialAllergenProfileId;
    item.allergens = [];
    item.mayContain = [];
    delete item.mayContainAllergens;
    item.allergenSourceType = "unavailable";
    delete item.allergenAuthorityTier;
    delete item.allergenSourceEvidenceIds;
    delete item.officialAllergenProfileId;
  }

  return [...affectedProductKeys].sort().map((itemId) => ({
    itemId,
    restaurantId: restaurant.id,
  }));
}

function removeStructuralHeadingArtifacts({ checks, dossier, restaurant }) {
  const removableItems = (restaurant.items ?? []).filter((item) => {
    const classification = classifyMenuItemRow(item);
    return (
      String(item.name ?? "").trim().endsWith(":") &&
      classification.kind === "source-note" &&
      classification.reasons.includes("section-header-name")
    );
  });
  if (removableItems.length === 0) return [];

  const removableKeys = new Set(removableItems.map((item) => item.id));
  const removed = [];
  restaurant.items = (restaurant.items ?? []).filter((item) => !removableKeys.has(item.id));

  for (const item of removableItems) {
    const product = (dossier.currentCatalog?.products ?? []).find(
      (candidate) => candidate.currentProductKey === item.id,
    );
    if (!product) {
      throw new Error(`${restaurant.id}:${item.id}: structural heading is missing its canonical product.`);
    }

    for (const auditItemKey of product.matchedBaselineAuditItemKeys ?? []) {
      const check = checks.find((candidate) => candidate.auditItemKey === auditItemKey);
      if (!check) {
        throw new Error(`${restaurant.id}:${item.id}: structural heading references an unknown audit row.`);
      }
      const previousDisposition = check.disposition;
      check.disposition = "artifact";
      check.allergenVerdict = "not_applicable";
      check.matchedCurrentProductKeys = [];
      delete check.officialAllergenProfileId;
      delete check.adjudicatedContainsAllergens;
      delete check.adjudicatedMayContainAllergens;
      delete check.adjudicatedAllergenSourceType;
      delete check.adjudicatedAllergenAuthorityTier;
      delete check.allergenSourceEvidenceIds;
      check.notes = appendNote(
        check.notes,
        "Excluded by the shared structural-heading classifier; this colon-suffixed section label is not a menu product.",
      );

      if (dossier.reconciliation?.[previousDisposition] > 0) {
        dossier.reconciliation[previousDisposition] -= 1;
      }
      dossier.reconciliation = {
        ...(dossier.reconciliation ?? {}),
        artifact: (dossier.reconciliation?.artifact ?? 0) + 1,
      };
    }

    removed.push({
      itemId: item.id,
      name: item.name,
      restaurantId: restaurant.id,
    });
  }

  dossier.currentCatalog.products = dossier.currentCatalog.products.filter(
    (product) => !removableKeys.has(product.currentProductKey),
  );
  dossier.currentCatalog.currentProductCount = dossier.currentCatalog.products.length;
  dossier.currentCatalog.reconciledCurrentProductCount = dossier.currentCatalog.products.length;
  return removed;
}

function buildEligibleGroups({ checks, evidenceById, restaurantId }) {
  const byCoverageProfile = new Map();

  for (const check of checks) {
    const baseline = check.baseline ?? {};

    if (!isExplicitOfficialSchemaRow(check) || !(check.matchedCurrentProductKeys ?? []).length) {
      continue;
    }

    const sourceType = baseline.sourceType || "official-allergen-menu";
    const coveredAllergenIds = unique([
      ...(baseline.officialAllergenCoveredIds ?? []),
      ...(baseline.allergens ?? []),
      ...(baseline.mayContain ?? []),
    ]).sort();
    const profileKey = `${sourceType}:${coveredAllergenIds.join(",")}`;
    const entry = byCoverageProfile.get(profileKey) ?? {
      checks: [],
      coveredAllergenIds,
      sourceType,
    };
    entry.checks.push(check);
    byCoverageProfile.set(profileKey, entry);
  }

  const groups = [];

  for (const [, entry] of [...byCoverageProfile].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const { coveredAllergenIds, sourceType } = entry;
    const sourceUrls = new Set(
      entry.checks.flatMap((check) => check.baseline?.sourceUrls ?? []).filter(Boolean),
    );
    const exactSourceEvidenceIds = [...evidenceById]
      .filter(([, source]) =>
        sourceUrls.has(source.url) &&
        source.authorityTier === "restaurant_issued" &&
        isAllergenEvidence(source),
      )
      .map(([evidenceId]) => evidenceId)
      .sort();
    const sourceEvidenceIds =
      exactSourceEvidenceIds.length > 0
        ? exactSourceEvidenceIds
        : [...evidenceById]
            .filter(
              ([, source]) =>
                source.authorityTier === "restaurant_issued" && isAllergenEvidence(source),
            )
            .map(([evidenceId]) => evidenceId)
            .sort();
    const restorableCount = entry.checks.filter(isRepairableOfficialMatrixRow).length;

    if (coveredAllergenIds.length === 0 || sourceEvidenceIds.length === 0 || restorableCount === 0) {
      report.skippedGroups.push({
        coveredAllergenIds,
        reason:
          coveredAllergenIds.length === 0
            ? "no-declared-covered-allergens"
            : sourceEvidenceIds.length === 0
              ? "no-matching-restaurant-issued-allergen-evidence"
              : "no-restorable-negative-rows",
        restaurantId,
        sourceType,
      });
      continue;
    }

    groups.push({
      checks: entry.checks,
      coveredAllergenIds,
      key: `${sourceType}:${createHash("sha256").update([...sourceUrls].sort().join("\n")).digest("hex").slice(0, 12)}`,
      sourceEvidenceIds,
      sourceType,
    });
  }

  return groups;
}

function isRepairableOfficialMatrixRow(check) {
  return (
    check.baseline?.allergenSourceType === "official-allergen-menu" &&
    (check.matchedCurrentProductKeys ?? []).length > 0
  );
}

function isExplicitOfficialSchemaRow(check) {
  const baseline = check.baseline ?? {};
  return (
    baseline.allergenSourceType === "official-allergen-menu" ||
    (baseline.allergenSourceType === "official-ingredients" &&
      ["pdf-matrix", "official-api"].includes(baseline.sourceType))
  );
}

function isAllergenEvidence(source) {
  return ["allergen", "ingredients", "cross_contact", "both"].includes(source.purpose);
}

function resetExistingCoverageProfiles({ checks, dossier, restaurant }) {
  const profiledProductKeys = new Set();

  for (const item of restaurant.items ?? []) {
    if (!item.officialAllergenProfileId) continue;
    profiledProductKeys.add(item.id);
    delete item.officialAllergenProfileId;
  }

  for (const product of dossier.currentCatalog?.products ?? []) {
    if (!product.officialAllergenProfileId) continue;
    profiledProductKeys.add(product.currentProductKey);
    delete product.officialAllergenProfileId;
  }

  for (const check of checks) {
    if (!check.officialAllergenProfileId) continue;
    check.notes = removeRepairNote(check.notes);
    delete check.officialAllergenProfileId;
  }

  delete restaurant.officialAllergenProfiles;
  if (dossier.currentCatalog) delete dossier.currentCatalog.officialAllergenProfiles;
  return profiledProductKeys.size;
}

function refreshOfficialCounts(restaurant) {
  const officialItemCount = (restaurant.items ?? []).filter(
    (item) => item.allergenSourceType && item.allergenSourceType !== "unavailable",
  ).length;
  const totalItemCount = restaurant.items?.length ?? 0;
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    officialItemCount,
    officialTotal: officialItemCount,
    totalItemCount,
    officialCoverageRatio: totalItemCount ? officialItemCount / totalItemCount : 0,
  };
  restaurant.officialItemCount = officialItemCount;
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    officialItemCount,
  };
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

function validateExplicitProfileAssignments({ checks, groups }) {
  const groupById = new Map(groups.map((group) => [group.profileId, group]));

  for (const check of checks) {
    if (!check.officialAllergenProfileId) continue;
    const group = groupById.get(check.officialAllergenProfileId);
    if (!group) {
      throw new Error(
        `${check.auditItemKey}: allergen coverage profile is missing.`,
      );
    }
    const explicitlySupported = new Set([
      ...(check.baseline?.officialAllergenCoveredIds ?? []),
      ...(check.baseline?.allergens ?? []),
      ...(check.baseline?.mayContain ?? []),
    ]);
    const unsupported = group.coveredAllergenIds.filter(
      (allergenId) => !explicitlySupported.has(allergenId),
    );
    if (unsupported.length > 0) {
      throw new Error(
        `${check.auditItemKey}: profile infers unsupported negative coverage for ${unsupported.join(", ")}.`,
      );
    }
  }
}

function appendNote(current, note) {
  if (!current) return note;
  if (String(current).includes(note)) return current;
  return `${current} ${note}`;
}

function removeRepairNote(current) {
  const repairNote =
    "Restored explicit official-matrix negative coverage for the allergens declared by the source profile; uncovered allergens remain unresolved.";
  const next = String(current ?? "").replace(repairNote, "").replace(/\s+/g, " ").trim();
  return next || null;
}

async function hydrateExplicitBooleanCoverage({ checks, evidenceSources, restaurantId }) {
  const eligibleChecks = checks.filter(
    isExplicitOfficialSchemaRow,
  );

  if (eligibleChecks.length === 0) {
    return [];
  }

  const candidates = unique(
    [
      ...eligibleChecks.flatMap((check) => check.baseline?.sourceUrls ?? []),
      ...evidenceSources
        .filter(
          (source) =>
            source.authorityTier === "restaurant_issued" &&
            ["allergen", "ingredients", "both"].includes(source.purpose),
        )
        .map((source) => source.url),
    ],
  ).filter(
    (url) =>
      /^https:\/\//i.test(url) &&
      !/google\.com\/search/i.test(url),
  );

  const detections = [];
  for (const sourceUrl of candidates.slice(0, 32)) {
    try {
      const response = await fetch(sourceUrl, {
        headers: { accept: "application/json, application/pdf, text/html, application/xml, text/xml" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      let explicitCoverage;
      if (/pdf/i.test(contentType) || /\.pdf(?:[?#]|$)/i.test(sourceUrl)) {
        explicitCoverage = await findExplicitPdfCoverage(
          Buffer.from(await response.arrayBuffer()),
        );
      } else {
        const text = await response.text();
        if (/json/i.test(contentType) || /^[\s\r\n]*[\[{]/.test(text)) {
          explicitCoverage = findExplicitAllergenCoverage(JSON.parse(text));
        } else {
          explicitCoverage = findExplicitMarkupCoverage(text);
        }
      }
      const coveredAllergenIds = explicitCoverage.coveredAllergenIds;
      if (coveredAllergenIds.length < 5) continue;

      const sourceChecks = eligibleChecks.filter((check) =>
        (check.baseline?.sourceUrls ?? []).includes(sourceUrl),
      );
      if (sourceChecks.length === 0) continue;

      for (const check of sourceChecks) {
        check.baseline.officialAllergenCoveredIds = [...coveredAllergenIds];
      }

      detections.push({
        coveredAllergenIds,
        derivation: explicitCoverage.derivation,
        restaurantId,
        sourceUrl,
      });
    } catch {
      // A failed live check cannot reduce existing canonical coverage.
    }
  }

  return detections;
}

export function findExplicitMarkupCoverage(text) {
  const $ = cheerio.load(String(text ?? ""), { xmlMode: /^\s*<\?xml/i.test(text) });
  const covered = new Set();

  $("*").each((_index, element) => {
    const attributeCoverage = Object.keys(element.attribs ?? {})
      .map((key) => allergenIdForSchemaLabel(key))
      .filter(Boolean);
    if (attributeCoverage.length >= 3) {
      attributeCoverage.forEach((id) => covered.add(id));
    }
  });

  $("tr").each((_index, row) => {
    const headerCoverage = $(row)
      .find("th,td")
      .toArray()
      .flatMap((cell) => allergenIdsForSchemaText($(cell).text()));
    if (unique(headerCoverage).length >= 3) {
      headerCoverage.forEach((id) => covered.add(id));
    }
  });

  const searchableText = `${$("body").text()} ${$("[data-allergy-note]").attr("data-allergy-note") ?? ""}`
    .replace(/\s+/g, " ");
  for (const sentence of searchableText.split(/[.!?]/)) {
    if (
      /\b(?:do|does)\s+not\s+(?:use|contain)\b/i.test(sentence) &&
      /\bingredients?\b/i.test(sentence)
    ) {
      allergenIdsForSchemaText(sentence).forEach((id) => covered.add(id));
    }
  }

  return {
    coveredAllergenIds: [...covered].sort(),
    derivation: covered.size > 0 ? "explicit-markup-schema" : null,
  };
}

async function findExplicitPdfCoverage(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let best = [];

  try {
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 5); pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const labels = unique(
        content.items
          .map((item) => String(item.str ?? "").trim())
          .filter((label) => label.length > 0 && label.length <= 32)
          .flatMap(allergenIdsForExactSchemaLabel),
      ).sort();
      if (labels.length > best.length) best = labels;
    }
  } finally {
    await document.destroy();
  }

  return {
    coveredAllergenIds: best,
    derivation: best.length > 0 ? "explicit-pdf-matrix-columns" : null,
  };
}

function allergenIdForSchemaLabel(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/^(?:data[-_])/, "")
    .replace(/(?:[-_](?:allergen|allergy|image|icon))+$/g, "")
    .replace(/^(?:has|contains|is)/, "")
    .replace(/[^a-z]/g, "");
  const mappings = new Map([
    ["dairy", "milk"], ["egg", "egg"], ["eggs", "egg"], ["fish", "fish"],
    ["gluten", "gluten"], ["milk", "milk"], ["milklactose", "milk"],
    ["mustard", "mustard"], ["nuts", "tree-nut"], ["peanut", "peanut"],
    ["peanuts", "peanut"], ["sesame", "sesame"], ["shellfish", "shellfish"],
    ["crustacea", "shellfish"], ["crustacean", "shellfish"],
    ["crustaceans", "shellfish"], ["crustaceanshellfish", "shellfish"],
    ["mollusk", "shellfish"], ["mollusks", "shellfish"],
    ["mollusc", "shellfish"], ["molluscs", "shellfish"],
    ["soy", "soy"], ["soya", "soy"], ["soybeans", "soy"],
    ["sulfites", "sulfites"], ["sulphites", "sulfites"],
    ["sulphurdioxide", "sulfites"], ["treenut", "tree-nut"],
    ["treenuts", "tree-nut"], ["wheat", "wheat"], ["wheatgluten", "wheat"],
  ]);
  return mappings.get(normalized) ?? null;
}

function allergenIdsForExactSchemaLabel(value) {
  const text = String(value ?? "").trim();
  if (!text || /\b(?:may|contains?|free from|without)\b/i.test(text)) return [];
  if (/^(?:crustacea(?:n|ns)?|crustacean shellfish|mollus[ck]s?)(?:\b|\s*\()/i.test(text)) {
    return ["shellfish"];
  }
  const direct = allergenIdForSchemaLabel(text);
  if (direct) {
    return /wheat\s*(?:&|and|\/)\s*gluten/i.test(text)
      ? ["wheat", "gluten"]
      : [direct];
  }
  return [];
}

function allergenIdsForSchemaText(value) {
  const text = String(value ?? "").toLowerCase();
  const patterns = [
    [/\beggs?\b/g, "egg"], [/\bfish\b/g, "fish"], [/\bgluten\b/g, "gluten"],
    [/\b(?:milk|dairy|lactose)\b/g, "milk"], [/\bmustard\b/g, "mustard"],
    [/\bpeanuts?\b/g, "peanut"], [/\bsesame\b/g, "sesame"],
    [/\bshellfish\b/g, "shellfish"], [/\b(?:soy|soya|soybeans?)\b/g, "soy"],
    [/\b(?:sulfites?|sulphites?|sulphur dioxide)\b/g, "sulfites"],
    [/\b(?:tree nuts?|nuts)\b/g, "tree-nut"], [/\bwheat\b/g, "wheat"],
  ];
  return patterns.filter(([pattern]) => pattern.test(text)).map(([, id]) => id);
}

export function findExplicitAllergenCoverage(payload) {
  const allergenByKey = new Map([
    ["egg", "egg"],
    ["eggs", "egg"],
    ["fish", "fish"],
    ["gluten", "gluten"],
    ["milk", "milk"],
    ["mustard", "mustard"],
    ["peanut", "peanut"],
    ["peanuts", "peanut"],
    ["sesame", "sesame"],
    ["shellfish", "shellfish"],
    ["crustaceanshellfish", "shellfish"],
    ["soy", "soy"],
    ["soya", "soy"],
    ["sulfites", "sulfites"],
    ["sulphites", "sulfites"],
    ["sulphurdioxide", "sulfites"],
    ["treenut", "tree-nut"],
    ["treenuts", "tree-nut"],
    ["wheat", "wheat"],
  ]);
  let availabilityBest = [];
  let completeUsAllergenDeclarationCount = 0;
  const fieldSets = [];

  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(value, "item_allergen") &&
      Object.prototype.hasOwnProperty.call(value, "item_ingredient_statement")
    ) {
      completeUsAllergenDeclarationCount += 1;
    }

    const covered = [];
    for (const [key, entryValue] of Object.entries(value)) {
      if (typeof entryValue !== "boolean" && typeof entryValue !== "number") continue;
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
      const allergenKey = normalizedKey.replace(/^(?:has|contains|is)/, "");
      const allergenId = allergenByKey.get(allergenKey);
      if (allergenId) covered.push(allergenId);
    }
    const uniqueCovered = unique(covered).sort();
    if (uniqueCovered.length >= 3) fieldSets.push(uniqueCovered);

    const availableFields = Object.entries(value).find(
      ([key, entryValue]) =>
        key.toLowerCase().replace(/[^a-z]/g, "") === "availableallergenfields" &&
        entryValue &&
        typeof entryValue === "object" &&
        !Array.isArray(entryValue),
    )?.[1];
    if (availableFields) {
      const availableCoverage = unique(
        Object.entries(availableFields)
          .filter(([, entryValue]) => entryValue === 1 || entryValue === true)
          .map(([key]) => {
            const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
            return allergenByKey.get(normalizedKey) ?? null;
          }),
      ).sort();
      if (availableCoverage.length > availabilityBest.length) {
        availabilityBest = availableCoverage;
      }
    }

    Object.values(value).forEach(visit);
  }

  visit(payload);
  if (completeUsAllergenDeclarationCount > 0) {
    return {
      coveredAllergenIds: [
        "egg",
        "fish",
        "milk",
        "peanut",
        "sesame",
        "shellfish",
        "soy",
        "tree-nut",
        "wheat",
      ],
      derivation: "explicit-us-allergen-declaration-fields",
    };
  }
  if (availabilityBest.length > 0) {
    return {
      coveredAllergenIds: availabilityBest,
      derivation: "explicit-allergen-availability-schema",
    };
  }

  const commonFields = fieldSets.length > 0
    ? fieldSets.reduce(
        (common, fields) => common.filter((field) => fields.includes(field)),
        fieldSets[0],
      )
    : [];
  return {
    coveredAllergenIds: commonFields,
    derivation: commonFields.length > 0
      ? "explicit-typed-api-fields"
      : null,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function writeJson(filePath, value, pretty) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
