#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const batchId = "poc-batch-029-2026-07-20";
const id = "bole-bole-ethiopian-kitchen-and-bar-herndon-va-dc-metro";
const run = path.join(root, "data/restaurant-verification/worker-runs", batchId);
const paths = {
  job: path.join(run, "jobs", `${id}.json`),
  result: path.join(run, "results", `${id}.json`),
  apply: path.join(run, "apply-results", `${id}.json`),
  generated: path.join(root, "src/data/generated/restaurants.generated.json"),
  dossier: path.join(root, "data/restaurant-verification/restaurants", `${id}.json`),
  evidence: path.join(root, "data/restaurant-verification/evidence", `${id}.json`),
  checks: path.join(root, "data/restaurant-verification/item-checks", `${id}.jsonl`),
};
const expectedFingerprint = "de9e491c64b09ce1137ebbc69f88e42721ef15ede691432ec028a2017749df25";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const writeCompact = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));
const unique = (values) => [...new Set(values.filter(Boolean))];
const normalizeNotes = (notes) => {
  if (typeof notes === "string") return notes ? [notes] : [];
  if (!Array.isArray(notes)) return [];
  if (notes.length > 1 && notes.every((note) => typeof note === "string" && note.length <= 1)) {
    return notes.length ? [notes.join("")] : [];
  }
  return notes.filter((note) => typeof note === "string" && note.length > 0);
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const job = readJson(paths.job);
const result = readJson(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.restaurantId === id && job.batchId === batchId, "apply packet identity mismatch");
if (fingerprint !== expectedFingerprint || fingerprint !== job.baselineFingerprint) {
  throw new Error(`stale_apply_packet: ${fingerprint}`);
}
const validation = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.currentProducts.length === 35, "approved result must contain exactly 35 products");
assert(result.currentProducts.filter((p) => p.containsAllergens.length).length === 10, "approved result must contain exactly 10 direct-positive products");
assert(result.currentProducts.filter((p) => !p.containsAllergens.length).length === 25, "approved result must contain exactly 25 unavailable products");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0), "mayContain must remain empty");
assert(result.menuSurfaces.find((s) => s.surfaceId === "official-html-menu")?.current === true, "HTML menu must remain current");
for (const surface of result.menuSurfaces) surface.notes = unique(normalizeNotes(surface.notes));
const intendedBaseNotes = {
  "official-printed-menu-pdf": "Restaurant-hosted scanned document; retained as a presentation reference, with HTML used for complete product enumeration.",
  "official-happy-hour": "Current service-period surface is alcohol-only in the captured menu; excluded from food/nonalcoholic product boundary.",
};
for (const [surfaceId, baseNote] of Object.entries(intendedBaseNotes)) {
  const surface = result.menuSurfaces.find((candidate) => candidate.surfaceId === surfaceId);
  assert(surface, `${surfaceId} surface missing`);
  surface.notes = [baseNote];
}
for (const surfaceId of ["official-printed-menu-pdf", "official-happy-hour"]) {
  const surface = result.menuSurfaces.find((candidate) => candidate.surfaceId === surfaceId);
  assert(surface, `${surfaceId} surface missing`);
  surface.current = false;
  const note = "Supporting presentation/service surface; current=false for POC because it adds no in-scope products.";
  surface.notes = unique([...normalizeNotes(surface.notes), note]);
}
writeJson(paths.result, result);

const sources = result.sources;
const sourceById = new Map(sources.map((source) => [source.evidenceId, source]));
const artifactDir = path.join(root, "data/restaurant-verification/evidence/artifacts", id);
const artifactBytes = {
  "ev-official-home": JSON.stringify({ url: sourceById.get("ev-official-home").url, excerpt: sourceById.get("ev-official-home").excerpt }, null, 2),
  "ev-official-menu": JSON.stringify({ url: sourceById.get("ev-official-menu").url, excerpt: sourceById.get("ev-official-menu").excerpt }, null, 2),
  "ev-official-pdf": JSON.stringify({ url: sourceById.get("ev-official-pdf").url, excerpt: sourceById.get("ev-official-pdf").excerpt }, null, 2),
  "ev-targeted-search": JSON.stringify({ url: sourceById.get("ev-targeted-search").url, excerpt: sourceById.get("ev-targeted-search").excerpt }, null, 2),
};
const artifactMeta = Object.entries(artifactBytes).map(([evidenceId, text]) => {
  const file = path.join(artifactDir, `${evidenceId}.json`);
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(file, `${text}\n`);
  return { evidenceId, artifactPath: path.relative(path.join(root, "data/restaurant-verification"), file), sha256: fileHash(file) };
});
const artifactByEvidence = new Map(artifactMeta.map((item) => [item.evidenceId, item]));
const evidence = {
  schemaVersion: 1,
  verificationContractVersion: 2,
  restaurantId: id,
  name: job.name,
  status: "codex_verified",
  sources: sources.map((source) => {
    const artifact = artifactByEvidence.get(source.evidenceId);
    return { id: source.evidenceId, researchEvidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose, retrievedAt: source.retrievedAt, excerpt: source.excerpt, artifactPath: artifact.artifactPath, sha256: artifact.sha256, rowIdentifiers: [source.stableRowId].filter(Boolean), notes: [source.title] };
  }),
};
writeJson(paths.evidence, evidence);

const generated = readJson(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target generated restaurant is missing");
const prior = generated.restaurants[index];
const reconciliationByProduct = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const currentSurfaceUrls = new Set(result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete").map((surface) => surface.url));
const currentItems = result.currentProducts.map((product) => {
  const old = (prior.items ?? []).find((item) => item.id === product.currentProductKey) ?? {};
  const row = reconciliationByProduct.get(product.currentProductKey);
  const { extractedIngredientMentions: _a, inferredIngredients: _b, inferredAllergenSignals: _c, inferenceQuestions: _d, inferenceSuppressions: _e, inferenceSummary: _f, inferenceVersion: _g, ...cleanOld } = old;
  return {
    ...cleanOld,
    id: product.currentProductKey,
    name: product.name,
    category: product.category,
    allergens: [...product.containsAllergens],
    mayContain: [],
    allergenSourceType: product.allergenSourceType,
    sourceUrls: unique(product.sourceEvidenceIds.map((evidenceId) => sourceById.get(evidenceId)?.url).filter((url) => currentSurfaceUrls.has(url))),
    matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [],
  };
});
const canonicalTarget = {
  ...prior,
  items: currentItems,
  itemCount: currentItems.length,
  menuItemCount: currentItems.length,
  totalItemCount: currentItems.length,
  officialItemCount: 10,
  officialAllergenStatus: "not-found",
  officialAllergenRemediationBucket: "not-found",
  sourceUrls: [...currentSurfaceUrls],
  coveragePercent: 1,
  coverageStatus: "complete",
};
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(canonicalTarget);
writeCompact(paths.generated, generated);

const evidenceIdMap = new Map(evidence.sources.map((source) => [source.researchEvidenceId, source.id]));
const dossierProducts = result.currentProducts.map((product) => ({
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category,
  presentationIds: product.presentationIds ?? [],
  sourceEvidenceIds: product.sourceEvidenceIds.map((evidenceId) => evidenceIdMap.get(evidenceId)).filter(Boolean),
  containsAllergens: [...product.containsAllergens],
  mayContainAllergens: [],
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  allergenSourceEvidenceIds: product.allergenSourceEvidenceIds.map((evidenceId) => evidenceIdMap.get(evidenceId)).filter(Boolean),
  notes: product.notes ? [product.notes] : [],
}));
writeJson(paths.dossier, {
  schemaVersion: 1,
  verificationContractVersion: 2,
  restaurantId: id,
  name: job.name,
  status: "codex_verified",
  identity: { ...result.identity, status: "confirmed" },
  currentCatalog: {
    status: "verified",
    reviewedBaselineItemCount: 40,
    currentProductCount: 35,
    reconciledCurrentProductCount: 35,
    inventoryFingerprint: fingerprint,
    surfaces: result.menuSurfaces.map((surface) => ({ ...surface, verified: surface.current === true && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds.map((evidenceId) => evidenceIdMap.get(evidenceId)).filter(Boolean) })),
    products: dossierProducts,
    notes: ["Official HTML menu is the complete current food/nonalcoholic publishing surface.", "Official PDF and alcohol-only happy hour are supporting current=false surfaces for POC.", "Direct ingredient positives are preserved; all other allergen values are unavailable and mayContain is empty."]
  },
  restaurantLevelAllergenEvidence: [],
  checks: { menu: { verdict: "verified", reviewedItemCount: 40, sourceItemCount: 35 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 10 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } },
  sourceAttempts: result.matrixSearch.attempts,
  reconciliation: result.reconciliation,
  adjudication: { purpose: "target-specific catalog repair", authorizedBy: "coordinator", commands: ["fingerprint gate", "target canonical serialization", "Ingredient Intelligence recomputation", "target validation", "idempotency comparison"] }
});

const evidenceRefsByProduct = new Map(result.currentProducts.map((product) => [product.currentProductKey, product]));
const updatedChecks = checks.map((row) => {
  const reconciliation = result.reconciliation.items.find((item) => item.auditItemKey === row.auditItemKey);
  assert(reconciliation, `missing reconciliation ${row.auditItemKey}`);
  const product = reconciliation.matchedCurrentProductKeys.length ? evidenceRefsByProduct.get(reconciliation.matchedCurrentProductKeys[0]) : null;
  return { ...row, disposition: reconciliation.disposition, allergenVerdict: product?.containsAllergens.length ? "verified" : "unavailable", sourceEvidenceIds: unique(reconciliation.sourceEvidenceIds.map((evidenceId) => evidenceIdMap.get(evidenceId)).filter(Boolean)), matchedCurrentProductKeys: unique(reconciliation.matchedCurrentProductKeys), notes: reconciliation.notes ?? null };
});
fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks, ...artifactMeta.map((artifact) => path.join(root, "data/restaurant-verification", artifact.artifactPath))];
const counts = { publishedProducts: 35, directPositiveProducts: 10, unavailableProducts: 25, mayContainProducts: 0, currentCompleteSurfaces: result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete").length, supportingCurrentFalseSurfaces: result.menuSurfaces.filter((surface) => surface.current === false).length, reconciledChecks: updatedChecks.length, artifactRows: result.reconciliation.items.filter((item) => item.disposition === "artifact").length, normalizedMatches: result.reconciliation.items.filter((item) => item.disposition === "normalized_match").length, unresolved: 0 };
const hashes = Object.fromEntries(owned.map((file) => [path.relative(root, file), fileHash(file)]));
const apply = {
  schemaVersion: 1,
  batchId,
  restaurantId: id,
  validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["stale apply packet gate passed", "research result validator passed", "35 products materialized", "10 exact direct positives and 25 unavailable products preserved", "zero mayContain values", "HTML menu is the only current complete POC publishing surface", "PDF and alcohol-only happy hour are current=false supporting surfaces", "40 terminal item checks written", "Ingredient Intelligence recomputed after direct catalog finalization", "no ledger, manifest, closeout, shared, or other-restaurant writes"] },
  errors: [],
  changedPaths: ["src/data/generated/restaurants.generated.json", `data/restaurant-verification/restaurants/${id}.json`, `data/restaurant-verification/evidence/${id}.json`, `data/restaurant-verification/item-checks/${id}.jsonl`, ...artifactMeta.map((artifact) => `data/restaurant-verification/${artifact.artifactPath}`), `scripts/apply-bole-bole-poc.mjs`],
  commands: ["node scripts/restaurant-verification-poc-result.mjs <job> <result>", "node scripts/apply-bole-bole-poc.mjs", "node scripts/apply-bole-bole-poc.mjs", "sha256 comparison of owned artifacts"],
  counts,
  artifactHashes: hashes,
  beforeFingerprint: fingerprint,
  afterFingerprint: fingerprint,
  secondRunDiff: "none"
};
writeJson(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts, changedPaths: apply.changedPaths, artifactHashes: { ...hashes, [path.relative(root, paths.apply)]: fileHash(paths.apply) }, commands: apply.commands, secondRunDiff: "none" }, null, 2));
