#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyPocRestaurant,
  requiredAllergenMatrixSearches,
} from "./restaurant-verification-poc-policy.mjs";

const matchedDispositions = new Set([
  "exact_match",
  "normalized_match",
  "equivalent_presentation",
]);
const unmatchedDispositions = new Set(["stale", "artifact"]);
const allowedDispositions = new Set([
  ...matchedDispositions,
  "stale",
  "artifact",
  "location_mismatch",
  "unresolved",
]);
const policyChangeKeys = Object.freeze([
  "identityAmbiguous",
  "menuScopeUnresolved",
  "officialAllergenConflict",
  "crossContactConflict",
  "unsupportedNegativeClaim",
  "sourceAuthorityAmbiguous",
  "duplicateItems",
  "catalogDrift",
  "staleItems",
  "newItems",
  "nameOrCategoryCleanup",
  "restaurantSpecificExtraction",
  "parserIssue",
]);
const sourceAuthorityTiers = new Set([
  "restaurant_issued",
  "restaurant_linked_vendor",
  "third_party",
  "ingredient_intelligence",
]);
const directAllergenSourceTypes = new Set([
  "restaurant_allergen_document",
  "restaurant_ingredients",
  "restaurant_linked_vendor",
  "unavailable",
]);
const allergenIds = new Set([
  "shellfish",
  "milk",
  "peanut",
  "tree-nut",
  "egg",
  "fish",
  "wheat",
  "soy",
  "sesame",
  "gluten",
  "mustard",
  "sulfites",
  "other",
]);

export async function validatePocResearchFiles({ jobPath, resultPath }) {
  const job = await readJson(jobPath);
  const [result, itemChecksText] = await Promise.all([
    readJson(resultPath),
    readFile(path.resolve(repositoryRoot(), job.itemChecksPath), "utf8"),
  ]);
  const itemChecks = parseJsonLines(itemChecksText);
  return validatePocResearchResult({ job, result, itemChecks });
}

export function validatePocResearchResult({ job, result, itemChecks }) {
  const errors = [];
  const warnings = [];

  if (result.batchId !== job.batchId) errors.push(`batchId mismatch: expected ${job.batchId}.`);
  if (result.restaurantId !== job.restaurantId) errors.push(`restaurantId mismatch: expected ${job.restaurantId}.`);
  if (result.packetValidation?.baselineItemCount !== job.baselineItemCount) {
    errors.push(`Packet item count mismatch: expected ${job.baselineItemCount}.`);
  }
  if (result.packetValidation?.baselineFingerprint !== job.baselineFingerprint) {
    errors.push("Packet baseline fingerprint mismatch.");
  }

  const expectedKeys = itemChecks.map((row) => row.auditItemKey);
  if (expectedKeys.some((key) => typeof key !== "string" || key.length === 0)) {
    errors.push("Frozen item checks contain a missing auditItemKey.");
  }
  if (expectedKeys.length !== job.baselineItemCount) {
    errors.push(`Frozen item-check count ${expectedKeys.length} does not match packet ${job.baselineItemCount}.`);
  }

  const products = normalizeCurrentProducts(result.currentProducts);
  const productKeys = products.map((product) => product.currentProductKey).filter(Boolean);
  const definedProductKeys = new Set(productKeys);
  const duplicateProductKeys = duplicates(productKeys);
  if (products.length === 0 && job.baselineItemCount > 0) errors.push("No current products were defined.");
  if (products.some((product) => !product.currentProductKey || !product.name)) {
    errors.push("Every current product must define currentProductKey and name.");
  }
  if (duplicateProductKeys.length) errors.push(`Duplicate current product keys: ${duplicateProductKeys.join(", ")}.`);
  const invalidProductSchema = products.filter((product) =>
    !Array.isArray(product.sourceEvidenceIds) ||
    !Array.isArray(product.containsAllergens) ||
    !Array.isArray(product.mayContainAllergens) ||
    !Array.isArray(product.allergenSourceEvidenceIds) ||
    !directAllergenSourceTypes.has(product.allergenSourceType));
  if (invalidProductSchema.length) {
    errors.push(`${invalidProductSchema.length} current products are missing the canonical direct-allergen schema.`);
  }
  const productsWithoutMenuEvidence = products.filter((product) => !product.sourceEvidenceIds?.length);
  if (productsWithoutMenuEvidence.length) {
    errors.push(`${productsWithoutMenuEvidence.length} current products have no menu evidence.`);
  }
  const invalidAllergenIds = duplicates(products.flatMap((product) => [
    ...(product.containsAllergens ?? []),
    ...(product.mayContainAllergens ?? []),
  ].filter((allergen) => !allergenIds.has(allergen))));
  if (invalidAllergenIds.length) {
    errors.push(`Invalid direct allergen ids: ${invalidAllergenIds.join(", ")}.`);
  }
  const invalidDirectEvidence = products.filter((product) => {
    const hasDirectEvidence = (product.containsAllergens?.length ?? 0) > 0 ||
      (product.mayContainAllergens?.length ?? 0) > 0;
    if (hasDirectEvidence) {
      return product.allergenSourceType === "unavailable" ||
        !sourceAuthorityTiers.has(product.allergenAuthorityTier) ||
        !product.allergenSourceEvidenceIds?.length;
    }
    return product.allergenSourceType !== "unavailable" ||
      product.allergenAuthorityTier != null ||
      (product.allergenSourceEvidenceIds?.length ?? 0) > 0;
  });
  if (invalidDirectEvidence.length) {
    errors.push(`${invalidDirectEvidence.length} current products have inconsistent direct-allergen evidence or authority.`);
  }

  const sources = Array.isArray(result.sources) ? result.sources : [];
  const sourceIds = sources.map((source) => source.evidenceId ?? source.id).filter(Boolean);
  const duplicateSourceIds = duplicates(sourceIds);
  if (!sources.length) errors.push("Research result must include a nonempty sources inventory.");
  if (sources.some((source) => {
    const id = source.evidenceId ?? source.id;
    return !id || !source.url || !source.authorityTier || !source.purpose || !source.retrievedAt;
  })) {
    errors.push("Every research source must define id, url, authorityTier, purpose, and retrievedAt.");
  }
  if (duplicateSourceIds.length) errors.push(`Duplicate research source ids: ${duplicateSourceIds.join(", ")}.`);
  const invalidSourceAuthorities = sources.filter((source) => !sourceAuthorityTiers.has(source.authorityTier));
  if (invalidSourceAuthorities.length) {
    errors.push(`Invalid research source authority tiers: ${duplicates(invalidSourceAuthorities.map((source) => source.authorityTier)).join(", ")}.`);
  }
  const sourceAuthorityById = new Map(sources.map((source) => [
    source.evidenceId ?? source.id,
    source.authorityTier,
  ]));
  const inconsistentDirectAuthorities = products.filter((product) => {
    const hasDirectEvidence = (product.containsAllergens?.length ?? 0) > 0 ||
      (product.mayContainAllergens?.length ?? 0) > 0;
    if (!hasDirectEvidence) return false;
    const evidenceAuthorities = new Set((product.allergenSourceEvidenceIds ?? [])
      .map((id) => sourceAuthorityById.get(id)).filter(Boolean));
    const sourceTypeMatches = product.allergenAuthorityTier === "restaurant_issued"
      ? new Set(["restaurant_allergen_document", "restaurant_ingredients"]).has(product.allergenSourceType)
      : product.allergenAuthorityTier === "restaurant_linked_vendor"
        ? product.allergenSourceType === "restaurant_linked_vendor"
        : false;
    return !evidenceAuthorities.has(product.allergenAuthorityTier) || !sourceTypeMatches;
  });
  if (inconsistentDirectAuthorities.length) {
    errors.push(`${inconsistentDirectAuthorities.length} current products have direct source types that do not match their evidence authority.`);
  }
  const referencedEvidenceIds = collectEvidenceReferences(result, products);
  const sourceIdSet = new Set(sourceIds);
  const unresolvedEvidenceIds = referencedEvidenceIds.filter((id) => !sourceIdSet.has(id));
  if (unresolvedEvidenceIds.length) {
    errors.push(`Unresolved research evidence ids: ${unresolvedEvidenceIds.join(", ")}.`);
  }

  const reconciliation = normalizeReconciliation(result.reconciliation);
  const reconciledKeys = reconciliation.map((entry) => entry.auditItemKey);
  const duplicateKeys = duplicates(reconciledKeys);
  const expectedSet = new Set(expectedKeys);
  const reconciledSet = new Set(reconciledKeys);
  const missingKeys = expectedKeys.filter((key) => !reconciledSet.has(key));
  const extraKeys = reconciledKeys.filter((key) => !expectedSet.has(key));
  if (duplicateKeys.length) errors.push(`Duplicate reconciled audit keys: ${duplicateKeys.join(", ")}.`);
  if (missingKeys.length) errors.push(`Missing ${missingKeys.length} frozen audit keys.`);
  if (extraKeys.length) errors.push(`Found ${extraKeys.length} reconciliation keys outside the frozen packet.`);
  if (reconciliation.length !== expectedKeys.length) {
    errors.push(`Reconciled ${reconciliation.length} rows; expected ${expectedKeys.length}.`);
  }

  const invalidDispositions = reconciliation.filter((entry) => !allowedDispositions.has(entry.disposition));
  if (invalidDispositions.length) errors.push(`${invalidDispositions.length} rows use an invalid disposition.`);
  const unmappedMatches = reconciliation.filter((entry) =>
    matchedDispositions.has(entry.disposition) && entry.matchedCurrentProductKeys.length === 0);
  if (unmappedMatches.length) errors.push(`${unmappedMatches.length} matched rows have no current-product mapping.`);
  const mappedNonmatches = reconciliation.filter((entry) =>
    unmatchedDispositions.has(entry.disposition) && entry.matchedCurrentProductKeys.length > 0);
  if (mappedNonmatches.length) {
    errors.push(`${mappedNonmatches.length} stale/artifact rows incorrectly reference current products.`);
  }
  const contradictoryNonmatches = reconciliation.filter((entry) => {
    if (!unmatchedDispositions.has(entry.disposition)) return false;
    const auditSlug = String(entry.auditItemKey).replace(/^\d+:/, "");
    return definedProductKeys.has(auditSlug);
  });
  if (contradictoryNonmatches.length) {
    errors.push(`${contradictoryNonmatches.length} stale/artifact rows have an exact current-product key.`);
  }
  const undefinedMappings = reconciliation.flatMap((entry) =>
    entry.matchedCurrentProductKeys.filter((key) => !definedProductKeys.has(key))
      .map((key) => `${entry.auditItemKey} -> ${key}`));
  if (undefinedMappings.length) errors.push(`${undefinedMappings.length} mappings reference undefined current products.`);
  const ambiguousGroupedMappings = reconciliation.filter((entry) => entry.mappingAmbiguous);
  if (ambiguousGroupedMappings.length) {
    errors.push(`${ambiguousGroupedMappings.length} grouped rows have ambiguous current-product mapping cardinality.`);
  }

  const unresolvedKeys = reconciliation
    .filter((entry) => entry.disposition === "unresolved")
    .map((entry) => entry.auditItemKey);
  if (unresolvedKeys.length && result.changes?.menuScopeUnresolved !== true) {
    errors.push(`${unresolvedKeys.length} unresolved rows require menuScopeUnresolved: true.`);
  }

  for (const key of policyChangeKeys) {
    if (typeof result.changes?.[key] !== "boolean") errors.push(`changes.${key} must be boolean.`);
  }

  const attemptedSearches = new Set([
    ...(Array.isArray(result.matrixSearch?.attempted) ? result.matrixSearch.attempted : []),
    ...((result.matrixSearch?.attempts ?? []).map((attempt) => attempt.class ?? attempt.searchClass)),
  ]);
  const missingSearches = requiredAllergenMatrixSearches.filter((search) => !attemptedSearches.has(search));
  if (missingSearches.length) errors.push(`Missing allergen searches: ${missingSearches.join(", ")}.`);
  const rawMatrixStatus = result.matrixSearch?.status;
  const matrixStatus = rawMatrixStatus === "found" ? "found" :
    rawMatrixStatus === "accurately_unavailable" ? "accurately_unavailable" : "not_searched";

  const structuralValidation = { valid: errors.length === 0, errors };
  const partialCurrentSurfaces = (result.menuSurfaces ?? []).filter((surface) =>
    surface.current !== false &&
    ["partial", "unresolved"].includes(String(surface.scopeStatus ?? "").toLowerCase()));
  const routingChanges = {
    ...result.changes,
    menuScopeUnresolved: result.changes?.menuScopeUnresolved === true || partialCurrentSurfaces.length > 0,
  };
  if (partialCurrentSurfaces.length > 0 && result.changes?.menuScopeUnresolved !== true) {
    warnings.push(`Coordinator detected ${partialCurrentSurfaces.length} partial current menu surface(s).`);
  }
  const route = classifyPocRestaurant({
    validation: structuralValidation,
    matrixSearch: { attempted: [...attemptedSearches], status: matrixStatus },
    changes: routingChanges,
  });
  if (result.recommendedLane && route.lane !== "luna_retry" && result.recommendedLane !== route.lane) {
    warnings.push(`Worker recommended ${result.recommendedLane}; coordinator policy computed ${route.lane}.`);
  }

  return {
    valid: errors.length === 0,
    restaurantId: job.restaurantId,
    expectedItemCount: expectedKeys.length,
    reconciledItemCount: reconciliation.length,
    currentProductCount: products.length,
    unresolvedItemCount: unresolvedKeys.length,
    missingKeys,
    duplicateKeys,
    undefinedMappings,
    mappedNonmatchKeys: mappedNonmatches.map((entry) => entry.auditItemKey),
    sourceCount: sources.length,
    unresolvedEvidenceIds,
    attemptedMatrixSearches: [...attemptedSearches],
    partialCurrentSurfaceIds: partialCurrentSurfaces.map((surface) => surface.surfaceId),
    matrixStatus,
    route,
    errors,
    warnings,
  };
}

function collectEvidenceReferences(result, products) {
  const containers = [
    result.identity,
    ...(result.menuSurfaces ?? []),
    ...products,
    ...normalizeReconciliation(result.reconciliation),
    ...(result.matrixSearch?.attempts ?? []),
    ...(result.restaurantLevelAllergenEvidence ?? []),
    ...(result.findings ?? []),
    ...(result.riskSignals ?? []).filter((signal) => signal && typeof signal === "object"),
  ];
  return [...new Set(containers.flatMap((container) => [
    ...(container?.sourceEvidenceIds ?? []),
    ...(container?.allergenSourceEvidenceIds ?? []),
    ...(container?.evidenceIds ?? []),
  ]).filter(Boolean))];
}

export function normalizeCurrentProducts(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.products)) return value.products;
  return [];
}

export function normalizeReconciliation(value = {}) {
  if (Array.isArray(value.items)) {
    return value.items.map((entry) => ({
      ...entry,
      matchedCurrentProductKeys: entry.matchedCurrentProductKeys ?? [],
    }));
  }
  if (!Array.isArray(value.dispositions)) return [];
  return value.dispositions.flatMap((group) => {
    const auditItemKeys = group.auditItemKeys ?? [];
    const matchedKeys = group.matchedCurrentProductKeys ?? [];
    const pairwise = auditItemKeys.length > 1 && matchedKeys.length === auditItemKeys.length;
    const shared = matchedKeys.length <= 1;
    return auditItemKeys.map((auditItemKey, index) => ({
      auditItemKey,
      disposition: group.disposition,
      matchedCurrentProductKeys: pairwise ? [matchedKeys[index]] : matchedKeys,
      mappingAmbiguous: matchedKeys.length > 1 && !pairwise && !shared,
      sourceEvidenceIds: group.sourceEvidenceIds ?? group.evidenceIds ?? [],
    }));
  });
}

function duplicates(values) {
  const seen = new Set();
  const duplicatesFound = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicatesFound.add(value);
    seen.add(value);
  }
  return [...duplicatesFound];
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function repositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function main() {
  const [jobPath, resultPath] = process.argv.slice(2);
  if (!jobPath || !resultPath) {
    throw new Error("Usage: node scripts/restaurant-verification-poc-result.mjs JOB.json RESULT.json");
  }
  const validation = await validatePocResearchFiles({
    jobPath: path.resolve(jobPath),
    resultPath: path.resolve(resultPath),
  });
  console.log(JSON.stringify(validation, null, 2));
  if (!validation.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
