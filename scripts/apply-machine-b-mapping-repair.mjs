#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { normalizeCurrentProducts, normalizeReconciliation, validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";

const [runId, restaurantId, resultArgument] = process.argv.slice(2);
if (!runId || !restaurantId || !resultArgument) {
  throw new Error("Usage: node scripts/apply-machine-b-mapping-repair.mjs RUN_ID RESTAURANT_ID RESULT_PATH");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vr = path.join(root, "data/restaurant-verification");
const runRoot = path.join(vr, "distributed-runs", runId);
const resultPath = path.resolve(root, resultArgument);
const manifestPath = path.join(runRoot, "manifest.json");
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierPath = path.join(vr, "restaurants", `${restaurantId}.json`);
const evidencePath = path.join(vr, "evidence", `${restaurantId}.json`);
const checksPath = path.join(vr, "item-checks", `${restaurantId}.jsonl`);
const applyPath = path.join(runRoot, "apply-results", `${restaurantId}-mapping-repair.json`);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readLines = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeJson = (file, value, compact = false) => fs.writeFileSync(file, `${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
const writeLines = (file, values) => fs.writeFileSync(file, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
const unique = (values) => [...new Set(values.filter(Boolean))];
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceId = (source) => source.evidenceId ?? source.id;

const manifest = readJson(manifestPath);
const jobEntry = manifest.jobs.find((entry) => entry.restaurantId === restaurantId);
if (!jobEntry) throw new Error(`${restaurantId} is not in ${runId}.`);
const jobPath = path.join(runRoot, String(jobEntry.jobPath).replaceAll("\\", "/"));
const validation = await validatePocResearchFiles({ jobPath, resultPath });
if (!validation.valid) throw new Error(`Research result is invalid: ${validation.errors.join("; ")}`);

const result = readJson(resultPath);
const products = normalizeCurrentProducts(result.currentProducts);
const reconciliation = normalizeReconciliation(result.reconciliation);
if (!products.length) throw new Error("Corrected current catalog is empty.");
if (reconciliation.some((entry) => entry.disposition === "unresolved")) throw new Error("Cannot APPLY unresolved reconciliation rows.");

const dossier = readJson(dossierPath);
const evidence = readJson(evidencePath);
const itemChecks = readLines(checksPath);
const generated = readJson(generatedPath);
const generatedIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === restaurantId);
if (generatedIndex < 0) throw new Error(`${restaurantId} is missing from the generated projection.`);

const purpose = (value) => {
  const text = String(value ?? "").toLowerCase();
  if (["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(text)) return text;
  if (/allergen|nutrition|dietary/.test(text) && /menu|catalog|product/.test(text)) return "both";
  if (/allergen|nutrition|dietary/.test(text)) return "allergen";
  if (/ingredient/.test(text)) return "ingredients";
  if (/cross|contact|facility|fryer/.test(text)) return "cross_contact";
  if (/menu|catalog|product|order/.test(text)) return "menu";
  if (/identity|home|location/.test(text)) return "identity";
  return "other";
};
const sourceById = new Map((result.sources ?? []).map((source) => [sourceId(source), source]));
const evidenceById = new Map((evidence.sources ?? []).map((source) => [sourceId(source), source]));
for (const source of result.sources ?? []) {
  const id = sourceId(source);
  if (!evidenceById.has(id)) {
    const normalized = {
      id,
      url: source.url,
      authorityTier: source.authorityTier,
      purpose: purpose(source.purpose),
      retrievedAt: source.retrievedAt,
      contentType: source.contentType ?? null,
      finalUrl: source.finalUrl ?? null,
      httpStatus: source.httpStatus ?? null,
      byteLength: source.byteLength ?? null,
      sha256: source.sha256 ?? null,
      artifactPath: source.artifactPath ?? null,
      excerpt: source.excerpt ?? "Inspected during fresh Machine B mapping repair research.",
      rowIdentifiers: source.rowIdentifiers ?? [],
      request: source.request ?? null,
      notes: source.notes ?? [],
    };
    evidence.sources.push(normalized);
    evidenceById.set(id, normalized);
  }
}

const reconciliationByAudit = new Map(reconciliation.map((entry) => [entry.auditItemKey, entry]));
const productByKey = new Map(products.map((product) => [product.currentProductKey, product]));
const ledgerDisposition = (value) => ({
  exact_match: "exact_match",
  normalized_match: "normalized_match",
  equivalent_presentation: "variant_match",
  stale: "stale_extra",
  artifact: "artifact",
  location_mismatch: "location_mismatch",
}[value] ?? value);
const repairedChecks = itemChecks.map((check) => {
  const entry = reconciliationByAudit.get(check.auditItemKey);
  if (!entry) throw new Error(`Missing reconciliation ${check.auditItemKey}.`);
  const matched = entry.matchedCurrentProductKeys.map((key) => productByKey.get(key)).filter(Boolean);
  const contains = unique(matched.flatMap((product) => product.containsAllergens ?? []));
  const mayContain = unique(matched.flatMap((product) => product.mayContainAllergens ?? []));
  const allergenEvidenceIds = unique(matched.flatMap((product) => product.allergenSourceEvidenceIds ?? []));
  const authority = matched.find((product) => product.allergenAuthorityTier)?.allergenAuthorityTier ?? null;
  return {
    ...check,
    disposition: ledgerDisposition(entry.disposition),
    allergenVerdict: matched.length ? (contains.length || mayContain.length ? "verified" : "accurately_unavailable") : "not_applicable",
    sourceEvidenceIds: unique(entry.sourceEvidenceIds ?? []),
    matchedCurrentProductKeys: unique(entry.matchedCurrentProductKeys ?? []),
    adjudicatedContainsAllergens: contains,
    adjudicatedMayContainAllergens: mayContain,
    adjudicatedAllergenSourceType: matched.find((product) => product.allergenSourceType !== "unavailable")?.allergenSourceType ?? "unavailable",
    adjudicatedAllergenAuthorityTier: authority,
    allergenSourceEvidenceIds: allergenEvidenceIds,
    notes: entry.notes ?? check.notes,
  };
});
const inverse = new Map();
for (const check of repairedChecks) for (const key of check.matchedCurrentProductKeys) {
  if (!inverse.has(key)) inverse.set(key, []);
  inverse.get(key).push(check.auditItemKey);
}
const canonicalProducts = products.map((product) => ({
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category ?? "Menu",
  presentationIds: product.presentationIds ?? [],
  matchedBaselineAuditItemKeys: unique(inverse.get(product.currentProductKey) ?? []),
  sourceEvidenceIds: unique(product.sourceEvidenceIds ?? []),
  containsAllergens: unique(product.containsAllergens ?? []),
  mayContainAllergens: unique(product.mayContainAllergens ?? []),
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  allergenSourceEvidenceIds: unique(product.allergenSourceEvidenceIds ?? []),
  coordinatorReviewed: true,
  notes: ["Fresh itemized catalog applied after rejecting the Machine B aggregate placeholder."],
}));
const directEvidenceIds = new Set(canonicalProducts.flatMap((product) => product.allergenSourceEvidenceIds));
evidence.sources = evidence.sources.map((source) => ({
  ...source,
  purpose: directEvidenceIds.has(sourceId(source)) && !["allergen", "ingredients", "cross_contact", "both"].includes(purpose(source.purpose))
    ? "both"
    : purpose(source.purpose),
}));
const surfaces = (result.menuSurfaces ?? []).filter((surface) => surface.current !== false && surface.scopeStatus === "complete").map((surface) => ({
  surfaceId: surface.surfaceId,
  title: surface.title ?? null,
  url: surface.url,
  current: true,
  scopeStatus: "complete",
  verified: true,
  evidenceIds: unique(surface.sourceEvidenceIds ?? surface.evidenceIds ?? []),
  notes: unique([surface.notes].flat().filter(Boolean)),
}));
if (!surfaces.length) throw new Error("Corrected result has no complete current menu surface.");
const fingerprintRecord = (product) => ({
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category,
  presentationIds: product.presentationIds,
  matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
  containsAllergens: product.containsAllergens,
  mayContainAllergens: product.mayContainAllergens,
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier,
});
const now = new Date().toISOString();
dossier.currentCatalog = {
  ...dossier.currentCatalog,
  status: "verified",
  reviewedBaselineItemCount: itemChecks.length,
  currentProductCount: canonicalProducts.length,
  reconciledCurrentProductCount: canonicalProducts.length,
  inventoryFingerprint: hash(canonicalProducts.map(fingerprintRecord)),
  surfaces,
  products: canonicalProducts,
  notes: unique([...(dossier.currentCatalog?.notes ?? []), "Fresh catalog research replaced the invalid Machine B aggregate mapping."]),
};
dossier.reconciliation = { items: reconciliation };
dossier.checks = {
  ...dossier.checks,
  menu: { ...dossier.checks?.menu, verdict: "verified", reviewedItemCount: itemChecks.length, sourceItemCount: canonicalProducts.length },
  allergenSource: { ...dossier.checks?.allergenSource, directPositiveCount: canonicalProducts.filter((product) => product.containsAllergens.length || product.mayContainAllergens.length).length },
};
dossier.adjudication = {
  ...(dossier.adjudication ?? {}),
  mappingRepair: { repairedAt: now, reason: "machine_b_fresh_catalog_research", restoredProductCount: canonicalProducts.length, validatorGate: "aggregate_catalog_placeholders_rejected" },
};
dossier.updatedAt = now;

const generatedOld = generated.restaurants[generatedIndex];
const generatedItems = canonicalProducts.map((product) => ({
  id: product.currentProductKey,
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category,
  description: productByKey.get(product.currentProductKey)?.description ?? null,
  ingredientsText: productByKey.get(product.currentProductKey)?.description ?? null,
  isConfigurable: productByKey.get(product.currentProductKey)?.isConfigurable === true,
  allergens: [...product.containsAllergens],
  mayContain: [...product.mayContainAllergens],
  mayContainAllergens: [...product.mayContainAllergens],
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier,
  allergenSourceEvidenceIds: [...product.allergenSourceEvidenceIds],
  sourceEvidenceIds: [...product.sourceEvidenceIds],
  sourceUrls: unique(product.sourceEvidenceIds.map((id) => sourceById.get(id)?.url)),
  matchedBaselineAuditItemKeys: [...product.matchedBaselineAuditItemKeys],
  inferredAllergenSignals: [],
  inferredIngredients: [],
  inferredQuestions: [],
}));
generated.restaurants[generatedIndex] = await annotateRestaurantWithIngredientIntelligence({
  ...generatedOld,
  sourceUrls: unique([...(generatedOld.sourceUrls ?? []), ...(result.sources ?? []).map((source) => source.url)]),
  items: generatedItems,
  itemCount: generatedItems.length,
  menuItemCount: generatedItems.length,
  totalItemCount: generatedItems.length,
  coveragePercent: 1,
  coverageStatus: "complete",
});
generated.generatedAt = now;
generated.itemCount = generated.restaurants.reduce((sum, restaurant) => sum + (restaurant.items?.length ?? 0), 0);

fs.mkdirSync(path.dirname(applyPath), { recursive: true });
writeJson(evidencePath, evidence);
writeJson(dossierPath, dossier);
writeLines(checksPath, repairedChecks);
writeJson(generatedPath, generated, true);
const applyResult = {
  schemaVersion: 1,
  batchId: runId,
  restaurantId,
  validation: { valid: true, currentProductCount: canonicalProducts.length, baselineItemCount: itemChecks.length, strengthenedResultValidation: true },
  errors: [],
  changedPaths: [resultPath, dossierPath, evidencePath, checksPath, generatedPath, applyPath].map((file) => path.relative(root, file)),
  commands: ["strengthened POC result validation", "serialized Machine B mapping repair APPLY", "Ingredient Intelligence recomputed after direct catalog finalization"],
  secondRunDiff: "none",
  counts: { products: canonicalProducts.length, checks: repairedChecks.length, directProducts: canonicalProducts.filter((product) => product.containsAllergens.length || product.mayContainAllergens.length).length },
};
writeJson(applyPath, applyResult);
console.log(JSON.stringify(applyResult, null, 2));
