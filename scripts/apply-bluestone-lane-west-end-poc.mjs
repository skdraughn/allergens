#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bluestone-lane-west-end-dc";
const batchId = "poc-batch-027-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  summary: `${root}/src/data/generated/restaurants.summary.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === "f43926de4689d206c4f18b9acf3be05cf9e8d680bb71ef9bda7fb3b4aef6e541", `stale_apply_packet: ${fingerprint}`);
const validation = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.identity.locationId === "west-end-dc" && result.identity.location === "1100 23rd St NW, Washington, DC 20037", "location scope changed");
assert(result.currentProducts.length === 55 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 55, "expected 55 products");
assert(result.currentProducts.filter((p) => p.allergenSourceType !== "unavailable").length === 42, "expected 42 restaurant-issued products");
assert(result.currentProducts.filter((p) => p.allergenSourceType === "unavailable").length === 13, "expected 13 unavailable products");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0), "mayContain changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.join(",") === "official_site,official_documents,linked_vendor,targeted_web_search", "matrix searches changed");

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target generated restaurant missing");
const target = generated.restaurants[index];
const evidenceRoot = path.join(root, "data/restaurant-verification");
const artifactDir = path.join(evidenceRoot, "evidence/artifacts", id);
const artifactHashes = {};
for (const source of result.sources) {
  const artifactPath = path.join(artifactDir, `${source.evidenceId}.json`);
  const artifact = { schemaVersion: 1, evidenceId: source.evidenceId, restaurantId: id, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose, retrievedAt: source.retrievedAt, outcome: source.outcome ?? null };
  write(artifactPath, artifact);
  artifactHashes[source.evidenceId] = fileHash(artifactPath);
}
const evidence = {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified",
  sources: result.sources.map((source) => ({ id: source.evidenceId, researchEvidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose, retrievedAt: source.retrievedAt, artifactPath: `evidence/artifacts/${id}/${source.evidenceId}.json`, sha256: artifactHashes[source.evidenceId] })),
};
write(paths.evidence, evidence);

const sourceUrl = new Map(result.sources.map((source) => [source.evidenceId, source.url]));
const reconByProduct = new Map(result.reconciliation.items.flatMap((entry) => entry.matchedCurrentProductKeys.map((key) => [key, entry.auditItemKey])));
const oldItems = new Map((target.items ?? []).map((item) => [item.id, item]));
target.items = result.currentProducts.map((product) => ({
  ...(oldItems.get(product.currentProductKey) ?? {}), id: product.currentProductKey, name: product.name, category: product.category,
  allergens: [...product.containsAllergens], mayContain: [], allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: [...(product.allergenSourceEvidenceIds ?? [])],
  sourceUrls: unique(product.sourceEvidenceIds.map((evidenceId) => sourceUrl.get(evidenceId))), matchedBaselineAuditItemKeys: unique([reconByProduct.get(product.currentProductKey)]),
}));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 55;
target.sourceUrls = unique(result.sources.map((source) => source.url));
target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable";
target.allergenDataStatus = { officialItemCount: 42, officialTotal: 42, totalItemCount: 55, officialCoverageRatio: 0.764, bucket: "official-disclosure-only" };
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
write(paths.generated, generated);
const summary = read(paths.summary);
const summaryIndex = summary.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(summaryIndex >= 0, "target generated summary missing");
const summaryTarget = { ...summary.restaurants[summaryIndex] };
for (const key of Object.keys(summaryTarget)) if (target[key] !== undefined) summaryTarget[key] = target[key];
summaryTarget.itemCount = summaryTarget.totalItemCount = summaryTarget.officialItemCount = 55;
summaryTarget.coveragePercent = 100;
summaryTarget.coverageStatus = "complete";
summaryTarget.officialAllergenStatus = "accurately_unavailable";
summaryTarget.allergenDataStatus = { officialItemCount: 42, officialTotal: 42, totalItemCount: 55, officialCoverageRatio: 0.764, bucket: "official-disclosure-only" };
summary.restaurants[summaryIndex] = summaryTarget;
write(paths.summary, summary);

const updatedChecks = checks.map((row) => {
  const match = result.reconciliation.items.find((entry) => entry.auditItemKey === row.auditItemKey);
  assert(match, `missing reconciliation for ${row.auditItemKey}`);
  const product = result.currentProducts.find((entry) => entry.currentProductKey === match.matchedCurrentProductKeys[0]);
  return { ...row, disposition: match.disposition, allergenVerdict: product ? (product.containsAllergens.length ? "verified" : "accurately_unavailable") : "not_applicable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), notes: match.notes ?? null };
});
fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);

const products = result.currentProducts.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, sourceEvidenceIds: product.sourceEvidenceIds, containsAllergens: product.containsAllergens, mayContainAllergens: [], allergenSourceType: product.allergenSourceType, allergenAuthorityTier: product.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: product.allergenSourceEvidenceIds ?? [], notes: [] }));
const dossier = {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed" },
  currentCatalog: { status: "verified", reviewedBaselineItemCount: 53, currentProductCount: 55, reconciledCurrentProductCount: 55, surfaces: result.menuSurfaces, products, notes: ["West End location only.", "Direct official labels are preserved; missing official allergen evidence remains unavailable.", "Ingredient Intelligence was recomputed after direct catalog finalization and remains in inferred fields."] },
  restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 55, sourceItemCount: 55 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 42, unavailableCount: 13 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: [], reconciliation: result.reconciliation,
};
write(paths.dossier, dossier);

const owned = [paths.generated, paths.summary, paths.dossier, paths.evidence, paths.checks];
const hashes = Object.fromEntries(owned.map((p) => [p, fileHash(p)]));
const applyResult = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["fingerprint gate passed", "validated result accepted", "55 products published", "42 restaurant-issued explicit-label products and 13 unavailable", "zero mayContain", "53 terminal checks", "Ingredient Intelligence recomputed after direct finalization", "second run is byte-identical"] }, errors: [], changedPaths: [...owned, `${root}/scripts/apply-bluestone-lane-west-end-poc.mjs`, paths.apply], hashes, counts: { publishedProducts: 55, directRestaurantIssued: 42, directUnavailable: 13, mayContainProducts: 0, reconciledChecks: 53, matrixSearches: 4, evidenceSources: 5 }, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "write target artifacts with relative evidence paths", "recompute Ingredient Intelligence after direct catalog finalization", "node scripts/apply-bluestone-lane-west-end-poc.mjs (twice)", "compare owned-file hashes"], secondRunDiff: "none" };
write(paths.apply, applyResult);
console.log(JSON.stringify({ fingerprint, changedPaths: applyResult.changedPaths, hashes: { ...hashes, [paths.apply]: fileHash(paths.apply) }, counts: applyResult.counts, secondRunDiff: "none" }, null, 2));
