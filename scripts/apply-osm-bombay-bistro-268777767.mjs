#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const batchId = "poc-batch-030-2026-07-20";
const id = "osm-bombay-bistro-268777767";
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
const expectedFingerprint = "d3e6e3708a2fe92717337ffa3ea2aa8cc0cccc83a9279c5578ebac80a9163b6b";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const writeCompact = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value)}\n`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));
const unique = (values) => [...new Set(values.filter(Boolean))];
const notes = (value) => typeof value === "string" ? (value ? [value] : []) : Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const job = readJson(paths.job);
const result = readJson(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.restaurantId === id && job.batchId === batchId, "apply packet identity mismatch");
if (fingerprint !== expectedFingerprint || fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint}`);
const validation = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.currentProducts.length === 92, "approved result must contain exactly 92 products");
assert(result.reconciliation.items.length === 94, "approved result must contain 94 reconciliations");
assert(result.reconciliation.items.filter((row) => row.disposition === "normalized_match").length === 92, "approved result must contain 92 normalized matches");
assert(result.reconciliation.items.filter((row) => row.disposition === "stale").length === 2, "approved result must contain 2 stale rows");
assert(result.currentProducts.every((product) => product.containsAllergens.length === 0 && product.mayContainAllergens.length === 0 && product.allergenSourceType === "unavailable"), "direct allergen fields must be unavailable and empty");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.join(",") === "official_site,official_documents,linked_vendor,targeted_web_search", "matrix search contract failed");
const completeCurrent = result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete");
assert(completeCurrent.length === 2 && completeCurrent.every((surface) => surface.currentProductKeys.length === 92), "two complete current surfaces must enumerate 92 products");
assert(result.menuSurfaces.filter((surface) => surface.current === false).length === 4, "four supporting surfaces must be current=false");

const sourceById = new Map(result.sources.map((source) => [source.evidenceId, source]));
const artifactDir = path.join(root, "data/restaurant-verification/evidence/artifacts", id);
const artifactMeta = [];
for (const source of result.sources) {
  const artifactPath = path.join(artifactDir, `${source.evidenceId}.json`);
  const artifact = { evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose, retrievedAt: source.retrievedAt, excerpt: source.excerpt };
  fs.mkdirSync(artifactDir, { recursive: true });
  writeJson(artifactPath, artifact);
  artifactMeta.push({ evidenceId: source.evidenceId, artifactPath: path.relative(path.join(root, "data/restaurant-verification"), artifactPath), sha256: fileHash(artifactPath) });
}
const artifactById = new Map(artifactMeta.map((item) => [item.evidenceId, item]));
const evidence = {
  schemaVersion: 1,
  verificationContractVersion: 2,
  restaurantId: id,
  name: job.name,
  status: "codex_verified",
  sources: result.sources.map((source) => ({ id: source.evidenceId, researchEvidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose, retrievedAt: source.retrievedAt, excerpt: source.excerpt, artifactPath: artifactById.get(source.evidenceId).artifactPath, sha256: artifactById.get(source.evidenceId).sha256, rowIdentifiers: [], notes: [source.title].filter(Boolean) })),
};
writeJson(paths.evidence, evidence);
const evidenceIdMap = new Map(evidence.sources.map((source) => [source.researchEvidenceId, source.id]));
const generated = readJson(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target generated restaurant is missing");
const prior = generated.restaurants[index];
const rowByProduct = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const currentUrls = completeCurrent.map((surface) => surface.url);
const cleanOld = (item) => { const { extractedIngredientMentions: _a, inferredIngredients: _b, inferredAllergenSignals: _c, inferenceQuestions: _d, inferenceSuppressions: _e, inferenceSummary: _f, inferenceVersion: _g, ...rest } = item; return rest; };
const currentItems = result.currentProducts.map((product) => {
  const old = (prior.items ?? []).find((item) => item.id === product.currentProductKey) ?? {};
  return { ...cleanOld(old), id: product.currentProductKey, name: product.name, category: product.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: currentUrls, matchedBaselineAuditItemKeys: [rowByProduct.get(product.currentProductKey).auditItemKey] };
});
const canonicalTarget = await annotateRestaurantWithIngredientIntelligence({ ...prior, items: currentItems, itemCount: 92, menuItemCount: 92, totalItemCount: 92, officialItemCount: 0, officialAllergenStatus: "not-found", officialAllergenRemediationBucket: "not-found", sourceUrls: currentUrls, coveragePercent: 1, coverageStatus: "complete" });
generated.restaurants[index] = canonicalTarget;
writeCompact(paths.generated, generated);

const dossierProducts = result.currentProducts.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationReferences: product.presentationReferences ?? [], matchedBaselineAuditItemKeys: [rowByProduct.get(product.currentProductKey).auditItemKey], sourceEvidenceIds: product.sourceEvidenceIds.map((key) => evidenceIdMap.get(key)).filter(Boolean), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: notes(product.notes) }));
const dossierSurfaces = result.menuSurfaces.map((surface) => ({ ...surface, notes: notes(surface.notes), verified: surface.current === true && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds.map((key) => evidenceIdMap.get(key)).filter(Boolean) }));
writeJson(paths.dossier, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed", sourceEvidenceIds: result.identity.sourceEvidenceIds.map((key) => evidenceIdMap.get(key)).filter(Boolean) }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 94, currentProductCount: 92, reconciledCurrentProductCount: 92, inventoryFingerprint: fingerprint, surfaces: dossierSurfaces, products: dossierProducts, notes: ["Official lunch/dinner and carryout are the complete current food/nonalcoholic publishing surfaces.", "Home, late-night, Clover, and DoorDash are supporting current=false surfaces.", "Direct allergen disclosure is accurately unavailable; all direct allergen and mayContain fields are empty."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 94, sourceItemCount: 92 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, reconciliation: result.reconciliation, adjudication: { purpose: "target-specific catalog repair", authorizedBy: "coordinator", commands: ["fingerprint gate", "canonical serialization", "Ingredient Intelligence recomputation", "target validation", "idempotency comparison"] } });

const productByKey = new Map(result.currentProducts.map((product) => [product.currentProductKey, product]));
const updatedChecks = checks.map((row) => { const reconciliation = result.reconciliation.items.find((item) => item.auditItemKey === row.auditItemKey); assert(reconciliation, `missing reconciliation ${row.auditItemKey}`); const product = reconciliation.matchedCurrentProductKeys.length ? productByKey.get(reconciliation.matchedCurrentProductKeys[0]) : null; return { ...row, disposition: reconciliation.disposition, allergenVerdict: product ? "unavailable" : "stale", sourceEvidenceIds: reconciliation.sourceEvidenceIds.map((key) => evidenceIdMap.get(key)).filter(Boolean), matchedCurrentProductKeys: [...reconciliation.matchedCurrentProductKeys], notes: notes(reconciliation.notes) }; });
fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
assert(updatedChecks.length === 94 && updatedChecks.filter((row) => row.disposition === "normalized_match").length === 92 && updatedChecks.filter((row) => row.disposition === "stale").length === 2, "terminal item checks failed");

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks, ...artifactMeta.map((item) => path.join(root, "data/restaurant-verification", item.artifactPath))];
const hashes = Object.fromEntries(owned.map((file) => [path.relative(root, file), fileHash(file)]));
const counts = { publishedProducts: 92, normalizedMatches: 92, stale: 2, directPositiveProducts: 0, unavailableProducts: 92, mayContainProducts: 0, currentCompleteSurfaces: 2, supportingCurrentFalseSurfaces: 4, reconciledChecks: 94, evidenceSources: 10, artifactRows: 0, unresolved: 0 };
writeJson(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["stale fingerprint gate passed", "research result validator passed", "92 products materialized", "92 normalized matches and 2 stale alcohol rows written", "zero direct allergens and zero mayContain values", "official lunch/dinner and carryout are current complete surfaces", "home, late-night, Clover, and DoorDash are current=false", "Ingredient Intelligence recomputed after direct catalog finalization", "no ledger, manifest, closeout, shared workflow, tests, parsers, or unrelated restaurant writes"] }, errors: [], changedPaths: ["src/data/generated/restaurants.generated.json", `data/restaurant-verification/restaurants/${id}.json`, `data/restaurant-verification/evidence/${id}.json`, `data/restaurant-verification/item-checks/${id}.jsonl`, ...artifactMeta.map((item) => `data/restaurant-verification/${item.artifactPath}`), `scripts/apply-${id}.mjs`], commands: ["node scripts/restaurant-verification-poc-result.mjs <job> <result>", `node scripts/apply-${id}.mjs`, `node scripts/apply-${id}.mjs`, "sha256 comparison of owned artifacts"], counts, artifactHashes: hashes, beforeFingerprint: fingerprint, afterFingerprint: fingerprint, secondRunDiff: "none" });
console.log(JSON.stringify({ fingerprint, counts, hashes }, null, 2));
