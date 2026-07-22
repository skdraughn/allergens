#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeReconciliation,
  validatePocResearchResult,
} from "./restaurant-verification-poc-result.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const nonCatalogSurfaceStatuses = new Set(["excluded", "supporting"]);
const evidencePurposes = new Set(["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"]);

export function mergeBindingSolReview(result, review) {
  if (review?.validation?.valid !== true || review?.resolution?.binding !== true) {
    throw new Error("Sol review is not valid and binding.");
  }
  if (review.restaurantId !== result.restaurantId || review.batchId !== result.batchId) {
    throw new Error("Sol review does not match the research result.");
  }
  const reconciliation = normalizeReconciliation(result.reconciliation);
  const unresolvedKeys = reconciliation
    .filter((entry) => entry.disposition === "unresolved")
    .map((entry) => entry.auditItemKey);
  const reviewItems = review.resolution.items ?? [];
  const reviewedKeys = reviewItems.map((entry) => entry.auditItemKey);
  const missingReviewKeys = unresolvedKeys.filter((key) => !reviewedKeys.includes(key));
  const extraReviewKeys = reviewedKeys.filter((key) => !unresolvedKeys.includes(key));
  if (missingReviewKeys.length || extraReviewKeys.length || new Set(reviewedKeys).size !== reviewedKeys.length) {
    throw new Error("Sol review does not resolve the exact unresolved key set once.");
  }
  const reviewByKey = new Map(reviewItems.map((entry) => [entry.auditItemKey, entry]));
  const resolvedItems = reconciliation.map((entry) => {
    const resolution = reviewByKey.get(entry.auditItemKey);
    if (!resolution) return entry;
    if (resolution.disposition === "unresolved") throw new Error(`${entry.auditItemKey}: binding Sol review remained unresolved.`);
    return {
      auditItemKey: entry.auditItemKey,
      disposition: resolution.disposition,
      matchedCurrentProductKeys: resolution.matchedCurrentProductKeys ?? [],
      sourceEvidenceIds: resolution.sourceEvidenceIds ?? entry.sourceEvidenceIds ?? [],
      notes: resolution.rationale ?? entry.notes ?? null,
    };
  });

  const surfaceResolutions = review.resolution.surfaceResolutions ??
    (review.resolution.surfaceResolution ? [review.resolution.surfaceResolution] : []);

  const currentProductsValue = Array.isArray(result.currentProducts)
    ? result.currentProducts
    : result.currentProducts?.products ?? [];
  const productByKey = new Map(currentProductsValue.map((product) => [product.currentProductKey, product]));
  const excludedProductKeys = unique([
    ...(review.resolution.catalogDefinition?.excludedAlcoholicProductKeys ?? []),
    ...(review.resolution.catalogDefinition?.excludedCategoryPlaceholderKeys ?? []),
    ...surfaceResolutions.flatMap((resolution) => [
      ...(resolution.excludedAlcoholicProductKeys ?? []),
      ...(resolution.excludedCategoryPlaceholderKeys ?? []),
    ]),
  ]);
  for (const productKey of excludedProductKeys) productByKey.delete(productKey);
  const additionalProducts = [
    ...(review.resolution.additionalProducts ?? []),
    ...(review.resolution.products ?? []),
    ...surfaceResolutions.flatMap((resolution) => resolution.additionalProductsRequired ?? []),
  ];
  for (const product of additionalProducts) {
    if (!product.currentProductKey || !product.name) {
      throw new Error("Sol introduced a current product without a complete key and name.");
    }
    if (productByKey.has(product.currentProductKey)) {
      throw new Error(`${product.currentProductKey}: Sol additional product duplicates the research catalog.`);
    }
    const containsAllergens = unique(product.containsAllergens ?? product.allergenAssessment?.explicitPositiveSupport);
    const sourceEvidenceIds = unique(product.sourceEvidenceIds);
    productByKey.set(product.currentProductKey, {
      currentProductKey: product.currentProductKey,
      name: product.name,
      category: product.category ?? "Sol-resolved current menu",
      description: product.description ?? null,
      presentationIds: unique(product.presentationIds),
      sourceEvidenceIds,
      containsAllergens,
      mayContainAllergens: unique(product.mayContainAllergens),
      allergenSourceType: containsAllergens.length ? product.allergenSourceType ?? "restaurant_issued_ingredients" : "unavailable",
      allergenAuthorityTier: containsAllergens.length ? product.allergenAuthorityTier ?? "restaurant_issued" : null,
      allergenSourceEvidenceIds: containsAllergens.length
        ? unique(product.allergenSourceEvidenceIds ?? sourceEvidenceIds)
        : [],
      notes: unique(product.notes),
    });
  }
  for (const reviewItem of reviewItems) {
    const mapping = reviewItem.currentProductMapping;
    for (const productKey of reviewItem.matchedCurrentProductKeys ?? []) {
      if (productByKey.has(productKey)) continue;
      if (!mapping || mapping.currentProductKey !== productKey || !mapping.name) {
        throw new Error(`${reviewItem.auditItemKey}: Sol introduced an undefined product without a complete mapping.`);
      }
      const containsAllergens = unique(reviewItem.allergenAssessment?.explicitPositiveSupport);
      const sourceEvidenceIds = unique(reviewItem.sourceEvidenceIds);
      productByKey.set(productKey, {
        currentProductKey: productKey,
        name: mapping.name,
        category: mapping.category ?? "Sol-resolved current menu",
        description: mapping.description ?? null,
        presentationIds: [],
        sourceEvidenceIds,
        containsAllergens,
        mayContainAllergens: [],
        allergenSourceType: containsAllergens.length ? "restaurant_issued_ingredients" : "unavailable",
        allergenAuthorityTier: containsAllergens.length ? "restaurant_issued" : null,
        allergenSourceEvidenceIds: containsAllergens.length ? sourceEvidenceIds : [],
        notes: [reviewItem.rationale].filter(Boolean),
      });
    }
  }
  const expectedResolvedProductCount = review.validation?.resolvedCatalogProductCount ??
    review.resolution.catalogDefinition?.resolvedCatalogProductCount;
  if (expectedResolvedProductCount != null && productByKey.size !== expectedResolvedProductCount) {
    throw new Error(`Sol resolved catalog count ${productByKey.size} does not match expected ${expectedResolvedProductCount}.`);
  }

  const merged = structuredClone(result);
  const partialSurfaceIds = (merged.menuSurfaces ?? [])
    .filter((surface) => surface.current !== false &&
      ["partial", "unresolved"].includes(String(surface.scopeStatus ?? "").toLowerCase()))
    .map((surface) => surface.surfaceId);
  const resolvedSurfaceIds = surfaceResolutions.map((resolution) => resolution.surfaceId);
  const missingSurfaceIds = partialSurfaceIds.filter((id) => !resolvedSurfaceIds.includes(id));
  const extraSurfaceIds = resolvedSurfaceIds.filter((id) => !partialSurfaceIds.includes(id));
  if (missingSurfaceIds.length || extraSurfaceIds.length ||
      new Set(resolvedSurfaceIds).size !== resolvedSurfaceIds.length) {
    throw new Error("Sol review does not resolve the exact partial surface set once.");
  }
  const surfaceResolutionById = new Map(surfaceResolutions.map((resolution) => {
    if (["partial", "unresolved"].includes(String(resolution.disposition ?? "").toLowerCase())) {
      throw new Error(`${resolution.surfaceId}: binding Sol surface review remained unresolved.`);
    }
    return [resolution.surfaceId, resolution];
  }));
  merged.menuSurfaces = (merged.menuSurfaces ?? []).map((surface) => {
    const surfaceResolution = surfaceResolutionById.get(surface.surfaceId);
    if (!surfaceResolution) return surface;
    const disposition = String(surfaceResolution.disposition ?? "").toLowerCase();
    const nonCatalog = nonCatalogSurfaceStatuses.has(disposition);
    return {
      ...surface,
      current: nonCatalog ? false : surface.current,
      scopeStatus: nonCatalog ? disposition : "complete",
      notes: unique([surface.notes, surfaceResolution.rationale]).join(" "),
    };
  });
  merged.currentProducts = { products: [...productByKey.values()] };
  merged.reconciliation = {
    expectedCount: result.reconciliation?.expectedCount ?? resolvedItems.length,
    reconciledCount: resolvedItems.length,
    duplicateKeys: [],
    missingKeys: [],
    items: resolvedItems,
  };
  merged.changes = {
    ...merged.changes,
    menuScopeUnresolved: false,
    ...((review.validation?.identityConflictResolved === true ||
      review.validation?.boundedChainLevelCatalogDeclared === true) &&
      review.validation?.storeIdentityClaimed === false
      ? { identityAmbiguous: false }
      : {}),
    ...(review.resolution.safetySourceAuthorityConflictRemains === false
      ? {
          sourceAuthorityAmbiguous: false,
          officialAllergenConflict: false,
          crossContactConflict: false,
          unsupportedNegativeClaim: false,
        }
      : {}),
  };
  merged.recommendedLane = "luna_fix";
  merged.solConflictPacket = {
    required: true,
    resolved: true,
    reviewType: review.reviewType,
    reviewedKeys,
    resolvedSurfaceIds,
    excludedProductKeys,
    remainingSolSignals: review.remainingSolSignals ?? [],
  };
  return merged;
}

export function buildPocCloseoutPacket({ job, result, applyResult, dossier, evidence, itemChecks, workerHandoff = null }) {
  const researchValidation = validatePocResearchResult({ job, result, itemChecks });
  const errors = [...researchValidation.errors];
  if (applyResult?.validation?.valid !== true) errors.push("APPLY validation is not valid.");
  const idempotent = applyResult?.secondRunDiff === "none" || applyResult?.secondRunDiff === false ||
    (Array.isArray(applyResult?.secondRunDiff) && applyResult.secondRunDiff.length === 0);
  if (!idempotent) errors.push("APPLY did not prove idempotency.");
  const appliedProductCount = applyResult?.validation?.currentProductCount ??
    applyResult?.validation?.generatedItemCount ??
    applyResult?.validation?.publishedItemCount ??
    applyResult?.validation?.checks?.generatedItemCount ??
    researchValidation.currentProductCount;
  if (dossier.currentCatalog?.currentProductCount !== appliedProductCount ||
      dossier.currentCatalog?.products?.length !== appliedProductCount) {
    errors.push("Applied dossier current-product count does not match validated APPLY output.");
  }
  if (errors.length) throw new Error(errors.join("\n"));

  const evidenceSources = (evidence.sources ?? []).map((source) => ({
    ...source,
    id: source.id ?? source.evidenceId,
    retrievedAt: source.retrievedAt ?? source.currentAsOf,
  }));
  const evidenceSourceIds = evidenceSources.map((source) => source.id).filter(Boolean);
  if (new Set(evidenceSourceIds).size !== evidenceSourceIds.length) {
    throw new Error("Canonical evidence source ids must be unique.");
  }
  for (const source of evidenceSources) {
    if (![source.id, source.url, source.authorityTier, source.purpose, source.retrievedAt]
      .every((value) => typeof value === "string" && value.length > 0)) {
      throw new Error("Canonical evidence sources require id, url, authorityTier, purpose, and retrievedAt.");
    }
    if (!evidencePurposes.has(source.purpose)) {
      throw new Error(`Evidence source ${source.id} has invalid purpose ${source.purpose}.`);
    }
    if (!source.sha256 && !source.artifactPath && !source.excerpt && !(source.rowIdentifiers ?? []).length) {
      throw new Error(`Evidence source ${source.id} needs a hash, artifact, excerpt, or row identifier.`);
    }
  }
  const evidenceById = new Map(evidenceSources.filter((source) => source.id).map((source) => [source.id, source]));
  const evidenceIds = new Set(evidenceById.keys());
  const directEvidenceIds = new Set();
  const reconciliation = normalizeReconciliation(result.reconciliation);
  const inverseMatches = new Map();
  for (const entry of reconciliation) {
    for (const productKey of entry.matchedCurrentProductKeys) {
      const matches = inverseMatches.get(productKey) ?? [];
      matches.push(entry.auditItemKey);
      inverseMatches.set(productKey, matches);
    }
  }

  const products = (dossier.currentCatalog?.products ?? []).map((product) => {
    const sourceEvidenceIds = validEvidenceIds(product.sourceEvidenceIds, evidenceIds);
    if (!sourceEvidenceIds.length) throw new Error(`${product.currentProductKey}: current product has no valid menu evidence.`);
    const containsAllergens = unique(product.containsAllergens);
    const mayContainAllergens = unique(product.mayContainAllergens);
    const hasDirectAllergens = containsAllergens.length > 0 || mayContainAllergens.length > 0;
    const allergenSourceEvidenceIds = hasDirectAllergens
      ? validEvidenceIds(
        (product.allergenSourceEvidenceIds ?? []).length
          ? product.allergenSourceEvidenceIds
          : sourceEvidenceIds,
        evidenceIds,
      )
      : [];
    if (hasDirectAllergens && !allergenSourceEvidenceIds.length) {
      throw new Error(`${product.currentProductKey}: direct allergens have no valid evidence.`);
    }
    for (const evidenceId of allergenSourceEvidenceIds) directEvidenceIds.add(evidenceId);
    const declaredAuthorityTier = product.allergenAuthorityTier ?? null;
    const evidenceAuthorityTiers = new Set(allergenSourceEvidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId)?.authorityTier)
      .filter(Boolean));
    if (hasDirectAllergens && declaredAuthorityTier && !evidenceAuthorityTiers.has(declaredAuthorityTier)) {
      throw new Error(`${product.currentProductKey}: declared allergen authority is not present in its evidence.`);
    }
    const authorityTier = hasDirectAllergens
      ? declaredAuthorityTier ?? highestEvidenceAuthority(allergenSourceEvidenceIds, evidenceById)
      : null;
    if (hasDirectAllergens && !authorityTier) {
      throw new Error(`${product.currentProductKey}: direct allergens have no supported authority tier.`);
    }
    return {
      currentProductKey: product.currentProductKey,
      name: product.name,
      category: product.category ?? null,
      presentationIds: unique(product.presentationIds),
      matchedBaselineAuditItemKeys: unique(inverseMatches.get(product.currentProductKey)),
      sourceEvidenceIds,
      containsAllergens,
      mayContainAllergens,
      allergenSourceType: hasDirectAllergens ? product.allergenSourceType : "unavailable",
      allergenAuthorityTier: authorityTier,
      allergenSourceEvidenceIds,
      coordinatorReviewed: true,
      notes: unique(product.notes),
    };
  });
  const productByKey = new Map(products.map((product) => [product.currentProductKey, product]));

  const itemCheckUpdates = reconciliation.map((entry) => {
    const matchedProducts = entry.matchedCurrentProductKeys.map((key) => productByKey.get(key));
    if (matchedProducts.some((product) => !product)) {
      throw new Error(`${entry.auditItemKey}: closeout references an unknown current product.`);
    }
    const containsAllergens = unique(matchedProducts.flatMap((product) => product.containsAllergens));
    const mayContainAllergens = unique(matchedProducts.flatMap((product) => product.mayContainAllergens));
    const hasDirectAllergens = containsAllergens.length > 0 || mayContainAllergens.length > 0;
    const authorityTiers = unique(matchedProducts.map((product) => product.allergenAuthorityTier).filter(Boolean));
    if (hasDirectAllergens && authorityTiers.length !== 1) {
      throw new Error(`${entry.auditItemKey}: mapped products do not have one direct-evidence authority tier.`);
    }
    const sourceEvidenceIds = validEvidenceIds([
      ...(entry.sourceEvidenceIds ?? []),
      ...matchedProducts.flatMap((product) => product.sourceEvidenceIds),
    ], evidenceIds);
    if (!sourceEvidenceIds.length) throw new Error(`${entry.auditItemKey}: item reconciliation has no valid menu evidence.`);
    const allergenSourceEvidenceIds = hasDirectAllergens
      ? validEvidenceIds(matchedProducts.flatMap((product) => product.allergenSourceEvidenceIds), evidenceIds)
      : [];
    const excluded = new Set(["artifact", "location_mismatch"]).has(entry.disposition);
    return {
      auditItemKey: entry.auditItemKey,
      disposition: ledgerDisposition(entry.disposition),
      allergenVerdict: excluded ? "not_applicable" : hasDirectAllergens ? "verified" : "accurately_unavailable",
      sourceEvidenceIds,
      matchedCurrentProductKeys: entry.matchedCurrentProductKeys,
      adjudicatedContainsAllergens: containsAllergens,
      adjudicatedMayContainAllergens: mayContainAllergens,
      adjudicatedAllergenSourceType: hasDirectAllergens
        ? matchedProducts.find((product) => product.allergenSourceType)?.allergenSourceType
        : "unavailable",
      adjudicatedAllergenAuthorityTier: hasDirectAllergens ? authorityTiers[0] : null,
      allergenSourceEvidenceIds,
      resolvedFindingIds: [],
      notes: excluded
        ? "Coordinator confirmed this frozen row is outside the current POC catalog."
        : "Coordinator reconciled this row against the validated current product catalog.",
    };
  });

  const appliedSurfaces = dossier.currentCatalog?.surfaces?.length
    ? dossier.currentCatalog.surfaces
    : result.menuSurfaces ?? [];
  const surfaces = appliedSurfaces.filter((surface) =>
    surface.current !== false &&
    !nonCatalogSurfaceStatuses.has(String(surface.scopeStatus ?? "").toLowerCase())).map((surface) => {
    const surfaceEvidenceIds = validEvidenceIds(surface.sourceEvidenceIds ?? surface.evidenceIds, evidenceIds);
    if (!surfaceEvidenceIds.length) throw new Error(`${surface.surfaceId}: current surface has no valid evidence.`);
    const surfaceUrl = surface.url ?? evidenceById.get(surfaceEvidenceIds[0])?.url;
    if (!surfaceUrl) throw new Error(`${surface.surfaceId}: current surface has no URL or evidence URL.`);
    return {
      surfaceId: surface.surfaceId,
      title: surface.title ?? null,
      url: surfaceUrl,
      current: true,
      scopeStatus: "complete",
      verified: true,
      evidenceIds: surfaceEvidenceIds,
      notes: unique([surface.scope, surface.servicePeriod, surface.status]),
    };
  });
  if (!surfaces.length && (products.length > 0 || itemChecks.length > 0)) {
    throw new Error("Closeout requires at least one verified current menu surface for a nonempty catalog or baseline.");
  }

  const now = new Date().toISOString();
  const referencedEvidenceIds = unique([
    ...products.flatMap((product) => [
      ...product.sourceEvidenceIds,
      ...product.allergenSourceEvidenceIds,
    ]),
    ...itemCheckUpdates.flatMap((item) => [
      ...item.sourceEvidenceIds,
      ...item.allergenSourceEvidenceIds,
    ]),
    ...surfaces.flatMap((surface) => surface.evidenceIds),
    ...validEvidenceIds(dossier.identity?.sourceEvidenceIds, evidenceIds),
    ...validEvidenceIds(dossier.restaurantWideCaution?.sourceEvidenceIds, evidenceIds),
    ...(dossier.restaurantLevelAllergenEvidence ?? []).flatMap((entry) =>
      validEvidenceIds(entry.sourceEvidenceIds, evidenceIds)),
  ]);
  const evidenceUpdates = referencedEvidenceIds.map((evidenceId) => {
    const source = evidenceById.get(evidenceId);
    return {
      ...source,
      purpose: directEvidenceIds.has(evidenceId) ? "both" : source.purpose,
    };
  });
  return {
    restaurantId: job.restaurantId,
    name: job.name,
    ...(dossier.identity ? { identity: dossier.identity } : {}),
    ...(dossier.restaurantWideCaution ? { restaurantWideCaution: dossier.restaurantWideCaution } : {}),
    ...(dossier.restaurantLevelAllergenEvidence
      ? { restaurantLevelAllergenEvidence: dossier.restaurantLevelAllergenEvidence }
      : {}),
    status: "repair_in_progress",
    checks: {
      menu: {
        verdict: "verified",
        reviewedItemCount: itemChecks.length,
        sourceItemCount: products.length,
        notes: ["POC catalog and every frozen item were coordinator-reconciled."],
      },
      allergenSource: {
        verdict: result.matrixSearch?.status === "found" ? "verified" : "accurately_unavailable",
        highestAuthorityTier: highestAuthority(products),
        notes: ["All four official-matrix search classes completed; direct positives are retained and missing disclosure remains unavailable."],
      },
      extraction: {
        verdict: "not_applicable",
        parserReviewed: false,
        semanticsVerified: true,
        notes: ["POC closeout uses a verified target-specific catalog transformation; shared-parser review is deferred."],
      },
    },
    currentCatalog: {
      status: "verified",
      reviewedBaselineItemCount: itemChecks.length,
      currentProductCount: products.length,
      reconciledCurrentProductCount: products.length,
      surfaces,
      products,
      notes: ["Coordinator terminal catalog derived from validated Luna research and serialized APPLY output."],
    },
    adjudication: {
      type: "coordinator",
      runId: job.batchId,
      decidedAt: now,
      recommendation: "codex_verified",
      model: { id: "codex-poc-coordinator", reasoningEffort: "high" },
      rationale: "Research structure, current product mappings, direct allergen authority, target repair, Ingredient Intelligence timing, focused validation, and idempotency passed the POC terminal gates.",
      artifactHashes: dossier.adjudication?.artifactHashes ?? [],
    },
    evidence: evidenceUpdates,
    replaceEvidence: true,
    findings: [],
    replaceFindings: true,
    ...(workerHandoff ? { workerHandoff } : {}),
    repairs: [{
      id: `${job.batchId}-${job.restaurantId}-target-repair`,
      status: "verified",
      summary: "Applied and validated the restaurant-specific POC catalog repair.",
      files: unique(applyResult.changedPaths),
      fixturePaths: [resultPathFor(job)],
      verificationCommands: unique((applyResult.commands ?? []).map((entry) =>
        typeof entry === "string" ? entry : entry.command)),
    }],
    replaceRepairs: true,
    itemChecks: itemCheckUpdates,
    notes: ["Coordinator-only POC closeout packet generated after serialized APPLY."],
  };
}

function ledgerDisposition(disposition) {
  const mapping = {
    exact_match: "exact_match",
    normalized_match: "normalized_match",
    equivalent_presentation: "variant_match",
    stale: "stale_extra",
    artifact: "artifact",
    location_mismatch: "location_mismatch",
  };
  if (!mapping[disposition]) throw new Error(`Cannot close unresolved disposition: ${disposition}.`);
  return mapping[disposition];
}

function highestAuthority(products) {
  const order = ["restaurant_issued", "restaurant_linked_vendor", "ingredient_intelligence", "third_party"];
  return order.find((tier) => products.some((product) => product.allergenAuthorityTier === tier)) ?? null;
}

function highestEvidenceAuthority(evidenceIds, evidenceById) {
  const order = ["restaurant_issued", "restaurant_linked_vendor", "ingredient_intelligence", "third_party"];
  return order.find((tier) => evidenceIds.some((id) => evidenceById.get(id)?.authorityTier === tier)) ?? null;
}

function validEvidenceIds(values, allowed) {
  return unique(values).flatMap((value) => {
    if (allowed.has(value)) return [value];
    if (allowed.has(`${value}-LINK`)) return [`${value}-LINK`];
    return [];
  });
}

function unique(values = []) {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  return [...new Set(list.filter(Boolean))];
}

function resultPathFor(job) {
  return job.resultPath ?? `data/restaurant-verification/worker-runs/${job.batchId}/results/${job.restaurantId}.json`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [job, result, applyResult, dossier, evidence, itemChecksText] = await Promise.all([
    readJson(options.job),
    readJson(options.result),
    readJson(options.apply),
    readJson(options.dossier),
    readJson(options.evidence),
    readFile(options.itemChecks, "utf8"),
  ]);
  const itemChecks = itemChecksText.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const review = options.review ? await readJson(options.review) : null;
  const resolvedResult = review ? mergeBindingSolReview(result, review) : result;
  const workerHandoff = await persistPocWorkerArtifacts({ job, result, applyResult, review, jobPath: options.job });
  const packet = buildPocCloseoutPacket({ job, result: resolvedResult, applyResult, dossier, evidence, itemChecks, workerHandoff });
  await writeFile(options.output, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  console.log(options.output);
}

async function persistPocWorkerArtifacts({ job, result, applyResult, review, jobPath }) {
  const verificationRoot = path.join(repositoryRoot, "data/restaurant-verification");
  const runRoot = path.join(verificationRoot, "worker-runs", job.batchId);
  const researchPath = path.join(runRoot, "results", `${job.restaurantId}.json`);
  const applyPath = path.join(runRoot, "apply-results", `${job.restaurantId}.json`);
  const reviewPath = path.join(runRoot, "reviews", `${job.restaurantId}.json`);
  const reviewValidationPath = path.join(runRoot, "review-validations", `${job.restaurantId}.json`);
  await Promise.all([
    mkdir(path.dirname(researchPath), { recursive: true }),
    mkdir(path.dirname(applyPath), { recursive: true }),
  ]);
  const researchBytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  const applyBytes = Buffer.from(`${JSON.stringify(applyResult, null, 2)}\n`);
  const reviewBytes = review ? Buffer.from(`${JSON.stringify(review, null, 2)}\n`) : null;
  const reviewValidationBytes = review ? Buffer.from(`${JSON.stringify(review.validation, null, 2)}\n`) : null;
  await Promise.all([
    writeFile(researchPath, researchBytes),
    writeFile(applyPath, applyBytes),
    ...(review ? [
      mkdir(path.dirname(reviewPath), { recursive: true }).then(() => writeFile(reviewPath, reviewBytes)),
      mkdir(path.dirname(reviewValidationPath), { recursive: true }).then(() => writeFile(reviewValidationPath, reviewValidationBytes)),
    ] : []),
  ]);
  const jobBytes = await readFile(jobPath);
  return {
    runId: job.batchId,
    restaurantId: job.restaurantId,
    preparedAt: new Date().toISOString(),
    routeDestination: review ? "sol_medium" : "coordinator",
    solRequired: Boolean(review),
    artifacts: [
      artifact("poc_job", path.relative(verificationRoot, jobPath), jobBytes),
      artifact("poc_research", path.relative(verificationRoot, researchPath), researchBytes),
      artifact("poc_apply", path.relative(verificationRoot, applyPath), applyBytes),
      ...(review ? [
        artifact("sol_review", path.relative(verificationRoot, reviewPath), reviewBytes),
        artifact("sol_validation", path.relative(verificationRoot, reviewValidationPath), reviewValidationBytes),
      ] : []),
    ],
    notes: ["POC worker artifacts persisted by the root coordinator."],
  };
}

function artifact(kind, artifactPath, bytes) {
  return {
    kind,
    path: artifactPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unknown argument: ${key}`);
    values[key.slice(2)] = path.resolve(repositoryRoot, argv[++index]);
  }
  for (const key of ["job", "result", "apply", "dossier", "evidence", "itemChecks", "output"]) {
    if (!values[key]) throw new Error(`Missing --${key}.`);
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
