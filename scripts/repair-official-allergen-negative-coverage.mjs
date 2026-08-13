#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const apply = process.argv.includes("--apply");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const verificationRoot = path.join(root, "data/restaurant-verification");
const reportPath = path.join(
  verificationRoot,
  "reports/official-allergen-negative-coverage-repair.json",
);
const repository = readJson(repositoryPath);
const report = {
  apply,
  generatedAt: new Date().toISOString(),
  restaurantCount: 0,
  profileCount: 0,
  profiledItemCount: 0,
  officialPositiveProfiledCount: 0,
  officialNegativeProfiledCount: 0,
  skippedGroups: [],
  restaurants: [],
};

for (let restaurantIndex = 0; restaurantIndex < repository.restaurants.length; restaurantIndex += 1) {
  const restaurant = repository.restaurants[restaurantIndex];
  const checksPath = path.join(verificationRoot, "item-checks", `${restaurant.id}.jsonl`);
  const dossierPath = path.join(verificationRoot, "restaurants", `${restaurant.id}.json`);
  const evidencePath = path.join(verificationRoot, "evidence", `${restaurant.id}.json`);

  if (![checksPath, dossierPath, evidencePath].every(fs.existsSync)) {
    continue;
  }

  const checks = readJsonLines(checksPath);
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const evidenceById = new Map((evidence.sources ?? []).map((source) => [source.id, source]));
  const precleanedProfileProductCount = resetExistingCoverageProfiles({
    checks,
    dossier,
    restaurant,
  });
  const groups = buildEligibleGroups({ checks, evidenceById, restaurantId: restaurant.id });

  if (groups.length === 0 && precleanedProfileProductCount === 0) {
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
          generatedItem.allergens = [];
          generatedItem.mayContain = [];
          generatedItem.mayContainAllergens = [];
          generatedItem.allergenSourceType = "unavailable";
          generatedItem.allergenAuthorityTier = null;
          generatedItem.allergenSourceEvidenceIds = [];
          delete generatedItem.officialAllergenProfileId;
        }

        if (dossierProduct) {
          dossierProduct.containsAllergens = [];
          dossierProduct.mayContainAllergens = [];
          dossierProduct.allergenSourceType = "unavailable";
          dossierProduct.allergenAuthorityTier = null;
          dossierProduct.allergenSourceEvidenceIds = [];
          delete dossierProduct.officialAllergenProfileId;
        }

        for (const check of checks) {
          if (!(check.matchedCurrentProductKeys ?? []).includes(productKey)) continue;
          check.allergenVerdict = "accurately_unavailable";
          check.adjudicatedContainsAllergens = [];
          check.adjudicatedMayContainAllergens = [];
          check.adjudicatedAllergenSourceType = "unavailable";
          check.adjudicatedAllergenAuthorityTier = null;
          check.allergenSourceEvidenceIds = [];
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

    check.allergenVerdict = "verified";
    check.adjudicatedContainsAllergens = [...(check.baseline?.allergens ?? [])];
    check.adjudicatedMayContainAllergens = [...(check.baseline?.mayContain ?? [])];
    check.adjudicatedAllergenSourceType = "official-allergen-menu";
    check.adjudicatedAllergenAuthorityTier = "restaurant_issued";
    check.allergenSourceEvidenceIds = [...group.sourceEvidenceIds];
    check.notes = appendNote(
      check.notes,
      "Restored explicit official-matrix negative coverage for the allergens declared by the source profile; uncovered allergens remain unresolved.",
    );
  }

  const usedProfileIds = new Set(
    [...generatedById.values()].map((item) => item.officialAllergenProfileId).filter(Boolean),
  );
  const usedGroups = groups.filter((group) => usedProfileIds.has(group.profileId));
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

  const annotatedRestaurant = await annotateRestaurantWithIngredientIntelligence(restaurant);
  refreshOfficialCounts(annotatedRestaurant);
  repository.restaurants[restaurantIndex] = annotatedRestaurant;

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
  });

  if (apply) {
    writeJsonLines(checksPath, checks);
    writeJson(dossierPath, dossier, true);
  }
}

report.restaurants.sort((left, right) => left.restaurantId.localeCompare(right.restaurantId));
report.skippedGroups.sort((left, right) =>
  `${left.restaurantId}:${left.reason}`.localeCompare(`${right.restaurantId}:${right.reason}`),
);

if (apply) {
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

function buildEligibleGroups({ checks, evidenceById, restaurantId }) {
  const bySourceType = new Map();

  for (const check of checks) {
    const baseline = check.baseline ?? {};

    if (
      baseline.allergenSourceType !== "official-allergen-menu" ||
      !(check.matchedCurrentProductKeys ?? []).length
    ) {
      continue;
    }

    const sourceType = baseline.sourceType || "official-allergen-menu";
    const entry = bySourceType.get(sourceType) ?? { checks: [], sourceType };
    entry.checks.push(check);
    bySourceType.set(sourceType, entry);
  }

  const groups = [];

  for (const [sourceType, entry] of [...bySourceType].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const coveredAllergenIds = unique(
      entry.checks.flatMap((check) => [
        ...(check.baseline?.allergens ?? []),
        ...(check.baseline?.mayContain ?? []),
      ]),
    ).sort();
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
  const baseline = check.baseline ?? {};

  return (
    baseline.allergenSourceType === "official-allergen-menu" &&
    (check.adjudicatedAllergenSourceType === "unavailable" ||
      typeof check.officialAllergenProfileId === "string")
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
    item.allergens = [];
    item.mayContain = [];
    item.mayContainAllergens = [];
    item.allergenSourceType = "unavailable";
    item.allergenAuthorityTier = null;
    item.allergenSourceEvidenceIds = [];
    delete item.officialAllergenProfileId;
  }

  for (const product of dossier.currentCatalog?.products ?? []) {
    if (!product.officialAllergenProfileId) continue;
    profiledProductKeys.add(product.currentProductKey);
    product.containsAllergens = [];
    product.mayContainAllergens = [];
    product.allergenSourceType = "unavailable";
    product.allergenAuthorityTier = null;
    product.allergenSourceEvidenceIds = [];
    delete product.officialAllergenProfileId;
  }

  for (const check of checks) {
    if (!check.officialAllergenProfileId) continue;
    check.allergenVerdict = "accurately_unavailable";
    check.adjudicatedContainsAllergens = [];
    check.adjudicatedMayContainAllergens = [];
    check.adjudicatedAllergenSourceType = "unavailable";
    check.adjudicatedAllergenAuthorityTier = null;
    check.allergenSourceEvidenceIds = [];
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
