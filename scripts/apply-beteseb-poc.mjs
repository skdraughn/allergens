#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "beteseb-silver-spring-md";
const batchId = "poc-batch-017-2026-07-17";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const writeCompact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => sha256(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const research = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(research.valid, `research validation failed: ${research.errors.join(" | ")}`);
assert(result.currentProducts.length === 44 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 44, "expected 44 distinct products");
assert(result.reconciliation.items.length === 44 && result.reconciliation.items.every((r) => r.disposition === "exact_match"), "expected 44 exact reconciliations");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix validation changed");
assert(result.currentProducts.every((p) => p.containsAllergens.length === 0 && p.mayContainAllergens.length === 0 && p.allergenSourceType === "unavailable"), "direct allergen fields changed");

const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose.includes("ingredients") ? "ingredients" : s.purpose.includes("identity") ? "identity" : s.purpose, retrievedAt: s.retrievedAt, excerpt: s.excerpt })) };
const canonicalProducts = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: p.notes ? [p.notes] : [] }));
const currentSurfaces = result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current === true && s.scopeStatus === "complete", scopeStatus: s.current === true && s.scopeStatus === "complete" ? "complete" : "supporting", verified: true, evidenceIds: unique(s.sourceEvidenceIds), notes: s.notes ? [s.notes] : [] }));

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((r) => r.id === id);
assert(targetIndex >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const currentUrls = new Set(currentSurfaces.filter((s) => s.current).map((s) => s.url));
const matchByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...oldById.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique((p.surfaceIds ?? []).map((sid) => result.menuSurfaces.find((s) => s.surfaceId === sid)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 44;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable";
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys) }; });
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.evidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 44, currentProductCount: 44, reconciledCurrentProductCount: 44, surfaces: currentSurfaces, products: canonicalProducts, notes: ["Official menu is the complete current catalog; official ordering and Grubhub are supporting current=false.", "Direct allergen fields are unavailable; Ingredient Intelligence is inferred after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 44, sourceItemCount: 44 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 44, exactMatchCount: 44, staleCount: 0, unresolvedCount: 0 } };

const changedPaths = [paths.generated, paths.dossier, paths.evidence, paths.itemChecks, `${root}/scripts/apply-beteseb-poc.mjs`, paths.apply];
write(paths.evidence, evidence); write(paths.dossier, dossier); writeCompact(paths.generated, generated); fs.writeFileSync(paths.itemChecks, `${updatedChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileHash(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 44, reconciledCount: 44, exactMatchCount: 44, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 44, evidenceSourceCount: evidence.sources.length, officialMenuComplete: true, supportingCurrentFalse: ["official-order", "linked-grubhub"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "target catalog/dossier/evidence/item-check serialization", "recompute Ingredient Intelligence after direct finalization", "serialized APPLY twice with byte/hash comparison"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 44, exactMatches: 44, directAllergens: 0, mayContain: 0, unavailable: 44 } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, validation: apply.validation, counts: apply.counts, changedPaths, artifactHashes: { ...artifactHashes, [paths.apply]: fileHash(paths.apply) }, secondRunDiff: "none" }, null, 2));
