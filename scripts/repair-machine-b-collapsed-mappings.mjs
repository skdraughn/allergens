#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import {
  normalizeCurrentProducts,
  normalizeReconciliation,
  validatePocResearchResult,
} from "./restaurant-verification-poc-result.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verificationRoot = path.join(repositoryRoot, "data/restaurant-verification");
const runsRoot = path.join(verificationRoot, "distributed-runs");
const generatedPath = path.join(repositoryRoot, "src/data/generated/restaurants.generated.json");
const applyChanges = process.argv.includes("--apply");
const allDistributedMachines = process.argv.includes("--all-distributed");
const repairReason = allDistributedMachines
  ? "distributed_aggregate_catalog_serialization"
  : "machine_b_aggregate_catalog_serialization";
const matchedDispositions = new Set(["exact_match", "normalized_match", "equivalent_presentation"]);
const emptyCatalogReasons = new Set(["closed_or_no_current_catalog", "not_yet_published"]);
const canonicalAllergens = new Set(["shellfish", "milk", "peanut", "tree-nut", "egg", "fish", "wheat", "soy", "sesame", "gluten", "mustard", "sulfites", "other"]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readJsonLines = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const writeJsonLines = (file, values) => fs.writeFileSync(file, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
const unique = (values) => [...new Set(values.filter(Boolean))];
const sha256Json = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function isAggregateProduct(product) {
  return Number(product?.productCount ?? 0) > 1 ||
    /(?:current|complete|full|entire).*\b(?:menu|catalog)\b|\b(?:menu|catalog)\b.*(?:aggregate|boundary)/i.test(product?.name ?? "") ||
    /\b(?:all|entire|complete)\b.*\bproducts?\b/i.test(product?.boundary ?? "");
}

function canonicalProducts(dossier) {
  return Array.isArray(dossier.currentCatalog?.products) ? dossier.currentCatalog.products : [];
}

function isCollapsed({ baselineCount, canonicalCount }) {
  return (baselineCount >= 10 && canonicalCount <= 2) ||
    (baselineCount >= 20 && canonicalCount / baselineCount < 0.2);
}

function sourceId(source) {
  return source?.evidenceId ?? source?.id;
}

function directType(authorityTier, baselineType) {
  if (authorityTier === "restaurant_linked_vendor") return "restaurant_linked_vendor";
  return baselineType === "official-ingredients" ? "restaurant_ingredients" : "restaurant_allergen_document";
}

function buildRestoredProduct({ check, evidenceIds, sources, usedKeys }) {
  const baseline = check.baseline;
  let key = baseline.itemId;
  if (usedKeys.has(key)) key = `${key}--${check.baselineIndex + 1}`;
  usedKeys.add(key);
  const canonicalizeAllergen = (allergen) => canonicalAllergens.has(allergen) ? allergen : "other";
  const containsAllergens = unique((check.adjudicatedContainsAllergens ?? []).map(canonicalizeAllergen));
  const mayContainAllergens = unique((check.adjudicatedMayContainAllergens ?? []).map(canonicalizeAllergen));
  const hasDirect = containsAllergens.length > 0 || mayContainAllergens.length > 0;
  const evidenceSources = evidenceIds.map((id) => sources.find((source) => sourceId(source) === id)).filter(Boolean);
  const adjudicatedEvidenceIds = new Set(check.allergenSourceEvidenceIds ?? []);
  const directSource = evidenceSources.find((source) =>
    adjudicatedEvidenceIds.has(sourceId(source)) &&
    ["restaurant_issued", "restaurant_linked_vendor"].includes(source.authorityTier));
  const directEvidenceIds = hasDirect && directSource ? [sourceId(directSource)] : [];
  return {
    currentProductKey: key,
    name: baseline.name,
    category: baseline.category ?? "Menu",
    variantGroup: baseline.variantGroup ?? null,
    isConfigurable: baseline.isConfigurable === true,
    sourceEvidenceIds: evidenceIds,
    containsAllergens: hasDirect && directSource ? containsAllergens : [],
    mayContainAllergens: hasDirect && directSource ? mayContainAllergens : [],
    allergenSourceType: hasDirect && directSource
      ? directType(directSource.authorityTier, check.adjudicatedAllergenSourceType ?? baseline.allergenSourceType)
      : "unavailable",
    allergenAuthorityTier: hasDirect && directSource ? directSource.authorityTier : null,
    allergenSourceEvidenceIds: directEvidenceIds,
  };
}

function generatedItem(product, check, evidenceById) {
  return {
    id: product.currentProductKey,
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    variantGroup: product.variantGroup,
    isConfigurable: product.isConfigurable,
    description: null,
    ingredientsText: null,
    allergens: [...product.containsAllergens],
    mayContain: [...product.mayContainAllergens],
    mayContainAllergens: [...product.mayContainAllergens],
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier,
    allergenSourceEvidenceIds: [...product.allergenSourceEvidenceIds],
    sourceEvidenceIds: [...product.sourceEvidenceIds],
    sourceUrls: unique([
      ...(check?.baseline?.sourceUrls ?? []),
      ...product.sourceEvidenceIds.map((id) => evidenceById.get(id)?.url),
    ]),
    matchedBaselineAuditItemKeys: check ? [check.auditItemKey] : [],
    inferredAllergenSignals: [],
    inferredIngredients: [],
    inferredQuestions: [],
  };
}

function normalizeEvidenceSource(source) {
  return {
    id: sourceId(source),
    url: source.url,
    authorityTier: source.authorityTier,
    purpose: source.purpose,
    retrievedAt: source.retrievedAt,
    contentType: source.contentType ?? null,
    finalUrl: source.finalUrl ?? null,
    httpStatus: source.httpStatus ?? null,
    byteLength: source.byteLength ?? null,
    sha256: source.sha256 ?? null,
    artifactPath: source.artifactPath ?? null,
    excerpt: source.excerpt ?? "Inspected during the Machine B research run.",
    rowIdentifiers: source.rowIdentifiers ?? [],
    request: source.request ?? null,
    notes: source.notes ?? [],
  };
}

function canonicalEvidencePurpose(purpose) {
  const normalized = String(purpose ?? "").toLowerCase();
  if (["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(normalized)) return normalized;
  if (/allergen|nutrition|dietary/.test(normalized) && /menu|catalog|product/.test(normalized)) return "both";
  if (/allergen|nutrition|dietary/.test(normalized)) return "allergen";
  if (/ingredient/.test(normalized)) return "ingredients";
  if (/cross|contact|facility|fryer/.test(normalized)) return "cross_contact";
  if (/menu|catalog|product|order/.test(normalized)) return "menu";
  if (/identity|home|location/.test(normalized)) return "identity";
  return "other";
}

function catalogFingerprintRecord(product) {
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

function repairResult({ result, itemChecks }) {
  const products = normalizeCurrentProducts(result.currentProducts);
  const reconciliation = normalizeReconciliation(result.reconciliation);
  const checksByKey = new Map(itemChecks.map((check) => [check.auditItemKey, check]));
  const fanIn = new Map();
  for (const entry of reconciliation) {
    if (!matchedDispositions.has(entry.disposition)) continue;
    for (const key of entry.matchedCurrentProductKeys) fanIn.set(key, (fanIn.get(key) ?? 0) + 1);
  }
  const collapsedKeys = new Set(products.filter((product) =>
    isAggregateProduct(product) || (fanIn.get(product.currentProductKey) ?? 0) >= 5).map((product) => product.currentProductKey));
  if (collapsedKeys.size === 0 && reconciliation.filter((entry) => matchedDispositions.has(entry.disposition)).length >= 10) {
    for (const product of products) collapsedKeys.add(product.currentProductKey);
  }
  const retainedProducts = products.filter((product) => !collapsedKeys.has(product.currentProductKey) && !isAggregateProduct(product));
  const usedKeys = new Set(retainedProducts.map((product) => product.currentProductKey));
  const sources = result.sources ?? [];
  const restoredByAuditKey = new Map();
  const repairedReconciliation = reconciliation.map((entry) => {
    const shouldRestore = matchedDispositions.has(entry.disposition) &&
      entry.matchedCurrentProductKeys.some((key) => collapsedKeys.has(key));
    if (!shouldRestore) return { ...entry, matchedCurrentProductKeys: [...entry.matchedCurrentProductKeys] };
    const check = checksByKey.get(entry.auditItemKey);
    if (!check) throw new Error(`Missing frozen check ${entry.auditItemKey}.`);
    const evidenceIds = unique(entry.sourceEvidenceIds ?? []);
    if (!evidenceIds.length) {
      evidenceIds.push(...unique(products.filter((product) =>
        entry.matchedCurrentProductKeys.includes(product.currentProductKey)).flatMap((product) => product.sourceEvidenceIds ?? [])));
    }
    if (!evidenceIds.length && sources.length) evidenceIds.push(sourceId(sources[0]));
    const product = buildRestoredProduct({ check, evidenceIds, sources, usedKeys });
    restoredByAuditKey.set(entry.auditItemKey, product);
    return {
      ...entry,
      matchedCurrentProductKeys: [product.currentProductKey],
      sourceEvidenceIds: evidenceIds,
      notes: "Restored the distinct current-item mapping after the distributed aggregate-catalog serialization defect.",
    };
  });
  const restoredProducts = [...restoredByAuditKey.values()];
  if (!restoredProducts.length) return { repairable: false, reason: "no_current_matches_to_restore" };
  const repairedProducts = [...retainedProducts, ...restoredProducts];
  const surfaces = (result.menuSurfaces ?? []).map((surface, index) => {
    const surfaceEvidence = new Set(surface.sourceEvidenceIds ?? surface.evidenceIds ?? []);
    const keys = repairedProducts.filter((product) =>
      product.sourceEvidenceIds.some((id) => surfaceEvidence.has(id))).map((product) => product.currentProductKey);
    return {
      ...surface,
      currentProductKeys: unique(keys.length ? keys : (index === 0 ? repairedProducts.map((product) => product.currentProductKey) : [])),
    };
  });
  return {
    repairable: true,
    restoredByAuditKey,
    result: {
      ...result,
      currentProducts: repairedProducts,
      menuSurfaces: surfaces,
      reconciliation: { items: repairedReconciliation },
      outcome: "verified",
      recommendedLane: "verify",
      blockedReason: null,
    },
  };
}

const generated = readJson(generatedPath);
const generatedById = new Map(generated.restaurants.map((restaurant, index) => [restaurant.id, { restaurant, index }]));
const report = { apply: applyChanges, scannedRuns: 0, collapsedCanonical: [], repaired: [], needsResearch: [], skipped: [], errors: [] };

for (const runId of fs.readdirSync(runsRoot).filter((name) =>
  name.startsWith(allDistributedMachines ? "distributed-machine-" : "distributed-machine-b-")).sort()) {
  const runRoot = path.join(runsRoot, runId);
  const manifestPath = path.join(runRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) continue;
  report.scannedRuns += 1;
  const manifest = readJson(manifestPath);
  for (const jobEntry of manifest.jobs ?? []) {
    const id = jobEntry.restaurantId;
    const dossierPath = path.join(verificationRoot, "restaurants", `${id}.json`);
    const evidencePath = path.join(verificationRoot, "evidence", `${id}.json`);
    const checksPath = path.join(verificationRoot, "item-checks", `${id}.jsonl`);
    if (![dossierPath, evidencePath, checksPath].every(fs.existsSync)) continue;
    const resultRelativePath = String(jobEntry.finalResultPath ?? jobEntry.resultPath).replaceAll("\\", "/");
    const resultPath = path.join(runRoot, resultRelativePath);
    const jobPath = path.join(runRoot, String(jobEntry.jobPath).replaceAll("\\", "/"));
    if (![resultPath, jobPath].every(fs.existsSync)) continue;
    const dossier = readJson(dossierPath);
    if (dossier.adjudication?.runId && dossier.adjudication.runId !== runId) continue;
    const baselineCount = jobEntry.validation?.expectedItemCount ?? dossier.currentCatalog?.reviewedBaselineItemCount ?? 0;
    const canonicalCount = canonicalProducts(dossier).length;
    if (!isCollapsed({ baselineCount, canonicalCount })) continue;
    let result;
    try {
      result = readJson(resultPath);
    } catch (error) {
      report.errors.push({
        id,
        runId,
        stage: "read_research_result",
        errors: [error instanceof Error ? error.message : String(error)],
      });
      continue;
    }
    if (emptyCatalogReasons.has(result.emptyCatalogReason)) continue;
    report.collapsedCanonical.push({ id, runId, baselineCount, canonicalCount });
    const itemChecks = readJsonLines(checksPath);
    const repaired = repairResult({ result, itemChecks });
    if (!repaired.repairable) {
      report.needsResearch.push({ id, runId, reason: repaired.reason, baselineCount, canonicalCount });
      continue;
    }
    const job = readJson(jobPath);
    const validation = validatePocResearchResult({ job, result: repaired.result, itemChecks });
    if (!validation.valid) {
      report.errors.push({ id, runId, stage: "repaired_result_validation", errors: validation.errors });
      continue;
    }
    const evidence = readJson(evidencePath);
    const evidenceIds = new Set((evidence.sources ?? []).map(sourceId));
    for (const source of repaired.result.sources ?? []) {
      if (!evidenceIds.has(sourceId(source))) evidence.sources.push(normalizeEvidenceSource(source));
    }
    const evidenceById = new Map((evidence.sources ?? []).map((source) => [sourceId(source), source]));
    const repairedChecks = itemChecks.map((check) => {
      const entry = repaired.result.reconciliation.items.find((item) => item.auditItemKey === check.auditItemKey);
      const product = repaired.restoredByAuditKey.get(check.auditItemKey) ??
        repaired.result.currentProducts.find((item) => entry?.matchedCurrentProductKeys.includes(item.currentProductKey));
      return {
        ...check,
        disposition: entry.disposition,
        allergenVerdict: product ? (product.containsAllergens.length || product.mayContainAllergens.length ? "verified" : "accurately_unavailable") : "not_applicable",
        sourceEvidenceIds: unique(entry.sourceEvidenceIds ?? []),
        matchedCurrentProductKeys: unique(entry.matchedCurrentProductKeys ?? []),
        adjudicatedContainsAllergens: [...(product?.containsAllergens ?? [])],
        adjudicatedMayContainAllergens: [...(product?.mayContainAllergens ?? [])],
        adjudicatedAllergenSourceType: product?.allergenSourceType ?? "unavailable",
        adjudicatedAllergenAuthorityTier: product?.allergenAuthorityTier ?? null,
        allergenSourceEvidenceIds: [...(product?.allergenSourceEvidenceIds ?? [])],
        notes: entry.notes ?? check.notes,
      };
    });
    const products = repaired.result.currentProducts.map((product) => ({
      currentProductKey: product.currentProductKey,
      name: product.name,
      category: product.category,
      variantGroup: product.variantGroup ?? null,
      isConfigurable: product.isConfigurable === true,
      presentationIds: product.presentationIds ?? [],
      sourceEvidenceIds: [...product.sourceEvidenceIds],
      containsAllergens: [...product.containsAllergens],
      mayContainAllergens: [...product.mayContainAllergens],
      allergenSourceType: product.allergenSourceType,
      allergenAuthorityTier: product.allergenAuthorityTier ?? null,
      allergenSourceEvidenceIds: [...product.allergenSourceEvidenceIds],
      notes: ["Distinct product mapping restored after the distributed aggregate-catalog defect."],
    }));
    const directCount = products.filter((product) => product.containsAllergens.length || product.mayContainAllergens.length).length;
    dossier.currentCatalog = {
      ...dossier.currentCatalog,
      reviewedBaselineItemCount: baselineCount,
      currentProductCount: products.length,
      reconciledCurrentProductCount: products.length,
      products,
      notes: unique([...(dossier.currentCatalog?.notes ?? []), "Distributed aggregate mappings were expanded back to distinct current products using the worker's affirmative frozen-key reconciliation."]),
    };
    dossier.reconciliation = repaired.result.reconciliation;
    dossier.checks = {
      ...dossier.checks,
      menu: { ...dossier.checks?.menu, verdict: "verified", reviewedItemCount: baselineCount, sourceItemCount: products.length },
      allergenSource: { ...dossier.checks?.allergenSource, directPositiveCount: directCount },
    };
    dossier.adjudication = {
      ...(dossier.adjudication ?? {}),
      mappingRepair: {
        repairedAt: new Date().toISOString(),
        reason: repairReason,
        restoredProductCount: repaired.restoredByAuditKey.size,
        validatorGate: "aggregate_catalog_placeholders_rejected",
      },
    };
    const generatedEntry = generatedById.get(id);
    if (!generatedEntry) {
      report.errors.push({ id, runId, stage: "generated_projection", errors: ["Restaurant missing from generated projection."] });
      continue;
    }
    const checkByProductKey = new Map(repairedChecks.flatMap((check) =>
      (check.matchedCurrentProductKeys ?? []).map((key) => [key, check])));
    const target = {
      ...generatedEntry.restaurant,
      sourceUrls: unique([...(generatedEntry.restaurant.sourceUrls ?? []), ...(repaired.result.sources ?? []).map((source) => source.url)]),
      items: products.map((product) => generatedItem(product, checkByProductKey.get(product.currentProductKey), evidenceById)),
      itemCount: products.length,
      menuItemCount: products.length,
      totalItemCount: products.length,
      coveragePercent: 1,
      coverageStatus: "complete",
    };
    const annotated = applyChanges ? await annotateRestaurantWithIngredientIntelligence(target) : target;
    if (applyChanges) {
      writeJson(resultPath, repaired.result);
      writeJson(evidencePath, evidence);
      writeJson(dossierPath, dossier);
      writeJsonLines(checksPath, repairedChecks);
      generated.restaurants[generatedEntry.index] = annotated;
    }
    report.repaired.push({
      id,
      runId,
      beforeProducts: canonicalCount,
      afterProducts: products.length,
      restoredProducts: repaired.restoredByAuditKey.size,
      directProducts: directCount,
      validation: "valid",
    });
  }
}

if (applyChanges) {
  for (const file of fs.readdirSync(path.join(verificationRoot, "restaurants")).filter((name) => name.endsWith(".json"))) {
    const dossierPath = path.join(verificationRoot, "restaurants", file);
    const dossier = readJson(dossierPath);
    if (dossier.adjudication?.mappingRepair?.reason !== repairReason) continue;
    const id = dossier.restaurantId;
    const checksPath = path.join(verificationRoot, "item-checks", `${id}.jsonl`);
    const evidencePath = path.join(verificationRoot, "evidence", `${id}.json`);
    const checks = readJsonLines(checksPath).map((check) => ({
      ...check,
      disposition: check.disposition === "equivalent_presentation" ? "variant_match" :
        check.disposition === "stale" ? "stale_extra" : check.disposition,
    }));
    const evidence = readJson(evidencePath);
    const directEvidenceIds = new Set(checks.flatMap((check) => check.allergenVerdict === "verified"
      ? (check.allergenSourceEvidenceIds ?? []) : []));
    evidence.sources = (evidence.sources ?? []).map((source) => {
      const idValue = sourceId(source);
      const purpose = canonicalEvidencePurpose(source.purpose);
      return {
        ...source,
        purpose: directEvidenceIds.has(idValue) && !["allergen", "ingredients", "cross_contact", "both"].includes(purpose)
          ? "both"
          : purpose,
      };
    });
    const inverse = new Map();
    for (const check of checks) {
      for (const key of check.matchedCurrentProductKeys ?? []) {
        if (!inverse.has(key)) inverse.set(key, []);
        inverse.get(key).push(check.auditItemKey);
      }
    }
    dossier.currentCatalog.products = dossier.currentCatalog.products.map((product) => ({
      ...product,
      presentationIds: product.presentationIds ?? [],
      matchedBaselineAuditItemKeys: unique(inverse.get(product.currentProductKey) ?? []),
      coordinatorReviewed: true,
      notes: Array.isArray(product.notes) ? product.notes : product.notes ? [product.notes] : [],
    }));
    dossier.currentCatalog.inventoryFingerprint = sha256Json(
      dossier.currentCatalog.products.map(catalogFingerprintRecord),
    );
    writeJsonLines(checksPath, checks);
    writeJson(evidencePath, evidence);
    writeJson(dossierPath, dossier);
  }
  generated.generatedAt = new Date().toISOString();
  generated.restaurantCount = generated.restaurants.length;
  generated.itemCount = generated.restaurants.reduce((sum, restaurant) => sum + (restaurant.items?.length ?? 0), 0);
  fs.writeFileSync(generatedPath, `${JSON.stringify(generated)}\n`);
}

console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
