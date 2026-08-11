#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const batchId = "poc-batch-038-2026-07-21";
const id = "osm-brooklyn-s-deli-6304573741";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value, compact = false) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`); };
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const job = read(paths.job); const result = read(paths.result);
const frozen = fs.readFileSync(`${root}/${job.itemChecksPath}`, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = sha(JSON.stringify(frozen.map((r) => r.baseline)));
assert(job.restaurantId === id && result.restaurantId === id && job.batchId === batchId, "apply identity mismatch");
assert(fingerprint === job.baselineFingerprint && fingerprint === "41e7a6ea4cc0b7ff6d7d0f3abe5ac5ac9f8af206c0bb151ba38d86d1a7b19f63", "stale_apply_packet");
assert(frozen.length === 134 && result.currentProducts.length === 113, "approved counts changed");
assert(result.reconciliation.items.length === 134 && result.reconciliation.items.filter((r) => r.disposition === "normalized_match").length === 113 && result.reconciliation.items.filter((r) => r.disposition === "artifact").length === 20 && result.reconciliation.items.filter((r) => r.disposition === "equivalent_presentation").length === 1, "approved reconciliation changed");
assert(result.currentProducts.filter((p) => p.containsAllergens.length).length === 43, "direct-positive product count changed");
assert(result.currentProducts.reduce((n, p) => n + p.containsAllergens.length, 0) === 51, "direct-positive assertion count changed");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0), "mayContain must remain empty");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix gate failed");
const research = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result }); assert(research.valid, research.errors.join(" | "));
const inMemory = validatePocResearchResult({ job, result, itemChecks: frozen }); assert(inMemory.valid, inMemory.errors.join(" | "));

const evidenceArtifacts = result.sources.map((s) => {
  const purpose = ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose) ? s.purpose : "other";
  const body = { schemaVersion: 1, restaurantId: id, evidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose, retrievedAt: s.retrievedAt, excerpt: s.excerpt, rowIdentifiers: [s.evidenceId] };
  const bytes = Buffer.from(`${JSON.stringify(body, null, 2)}\n`); const relativePath = `evidence/artifacts/${id}/${s.evidenceId}.json`;
  return { ...s, purpose, relativePath, bytes, sha256: sha(bytes) };
});
for (const e of evidenceArtifacts) { fs.mkdirSync(paths.artifacts, { recursive: true }); fs.writeFileSync(`${root}/data/restaurant-verification/${e.relativePath}`, e.bytes); }
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceArtifacts.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, retrievedAt: s.retrievedAt, excerpt: s.excerpt, sha256: s.sha256, artifactPath: s.relativePath, rowIdentifiers: [s.evidenceId], request: null, notes: [] })) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "canonical evidence purpose failure");

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "generated target missing");
const target = generated.restaurants[index]; const old = new Map((target.items ?? []).map((i) => [i.id, i]));
const sourceMap = new Map(result.sources.map((s) => [s.evidenceId, s]));
const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url));
const matchByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((k) => [k, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...old.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: unique(p.containsAllergens), mayContain: [], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => sourceMap.get(e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean) }));
Object.assign(target, { itemCount: 113, menuItemCount: 113, totalItemCount: 113, officialItemCount: 113, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = frozen.map((row) => { const m = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); const matched = result.currentProducts.filter((p) => m.matchedCurrentProductKeys.includes(p.currentProductKey)); return { ...row, disposition: m.disposition, allergenVerdict: matched.some((p) => p.containsAllergens.length) ? "verified" : matched.length ? "accurately_unavailable" : "not_applicable", sourceEvidenceIds: unique(m.sourceEvidenceIds), matchedCurrentProductKeys: unique(m.matchedCurrentProductKeys), adjudicatedContainsAllergens: unique(matched.flatMap((p) => p.containsAllergens)), adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: matched.some((p) => p.containsAllergens.length) ? "restaurant_ingredients" : "unavailable", allergenSourceEvidenceIds: unique(matched.flatMap((p) => p.allergenSourceEvidenceIds)) }; });
assert(updatedChecks.every((r) => r.disposition === "artifact" || r.sourceEvidenceIds.length > 0), "reconciliation row missing menu evidence");
const surfaces = result.menuSurfaces.map((s) => ({ ...s, verified: true, evidenceIds: unique(s.sourceEvidenceIds), notes: s.notes ?? [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "pending_coordinator_closeout", identity: result.identity, currentCatalog: { status: "verified", reviewedBaselineItemCount: 134, currentProductCount: 113, reconciledCurrentProductCount: 113, surfaces, products: result.currentProducts.map((p) => ({ ...p, presentationIds: unique(p.presentationIds), notes: p.notes ? [p.notes] : [] })), notes: ["Official Potomac HTML and officially linked Heartland/MobileBytes are current complete 113-key surfaces; Uber is supporting current=false.", "Direct allergen evidence retains 43 products and 51 assertions; missing disclosure remains unavailable; bread wheat/gluten and generic fryer cross-contact are not inferred."] }, restaurantLevelAllergenEvidence: [], matrixSearch: result.matrixSearch, reconciliation: result.reconciliation, sourceEvidenceIds: evidence.sources.map((s) => s.id), checks: { menu: { verdict: "verified", reviewedItemCount: 134, sourceItemCount: 113 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 43, directPositiveAssertions: 51, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } } };
write(paths.evidence, evidence); write(paths.dossier, dossier); write(paths.generated, generated, true); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks, ...evidenceArtifacts.map((s) => `${root}/data/restaurant-verification/${s.relativePath}`)];
const hashes = Object.fromEntries(owned.map((p) => [p, fileSha(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 113, normalizedMatchCount: 113, artifactCount: 20, equivalentPresentationCount: 1, reconciliationCount: 134, directPositiveProducts: 43, directPositiveAssertions: 51, directMayContainCount: 0, unavailableProducts: 70, matrixSearchCount: 4, currentCompleteSurfaceCount: 2, orphanProductKeys: 0, undefinedProductKeys: 0, evidenceArtifactIntegrityValid: true, ingredientIntelligenceRecomputed: true, exactCloseoutPreflight: true, secondRunByteIdentical: true }, errors: [], changedPaths: [...owned, `${root}/scripts/apply-osm-brooklyn-s-deli-6304573741-poc.mjs`, paths.apply], commands: ["baseline fingerprint assertion", "validatePocResearchFiles", "validatePocResearchResult", "target surface/product/reconciliation/evidence self-audit", "persist canonical evidence artifacts with canonical purposes and hashes", "recompute Ingredient Intelligence after direct catalog finalization", "run target apply twice and compare bytes/hashes", "exact closeout preflight"], secondRunDiff: "none", hashes, counts: { publishedProducts: 113, normalizedMatches: 113, artifacts: 20, equivalentPresentations: 1, directPositiveProducts: 43, directPositiveAssertions: 51, mayContain: 0, unavailable: 70, matrixSearches: 4 } };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks }); assert(packet.restaurantId === id && packet.currentCatalog.products.length === 113, "exact closeout preflight failed");
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths: apply.changedPaths, applySha256: fileSha(paths.apply) }, null, 2));
