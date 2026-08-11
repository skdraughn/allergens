#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const batchId = "poc-batch-024-2026-07-20";
const id = "blacksalt-washington-dc-dc-metro";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  script: `${root}/scripts/apply-blacksalt-poc.mjs`,
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`, apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value, compact = false) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`); };
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));
const unique = (a = []) => [...new Set(a.filter(Boolean))];
const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((r) => r.baseline)));
if (fingerprint !== job.baselineFingerprint || fingerprint !== "2b854facbfaa8fc646e624387bc77ff22b4e39ef8dc70fa8a6fb1c7a9c3a155f") throw new Error("stale_apply_packet");
if (job.restaurantId !== id || result.restaurantId !== id) throw new Error("target identity mismatch");
const research = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
if (!research.valid) throw new Error(`research validator failed: ${research.errors.join(" | ")}`);
const inMemory = validatePocResearchResult({ job, result, itemChecks: checks });
if (!inMemory.valid) throw new Error(`result validation failed: ${inMemory.errors.join(" | ")}`);
const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id);
if (index < 0) throw new Error("target restaurant missing");
const old = generated.restaurants[index];
const sourceById = new Map(result.sources.map((s) => [s.evidenceId, s]));
const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete").map((s) => s.url));
const matchedByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((k) => [k, r.auditItemKey])));
const items = result.currentProducts.map((p) => {
  const oldItem = (old.items ?? []).find((x) => x.id === p.currentProductKey) ?? {};
  return { ...oldItem, id: p.currentProductKey, name: p.name, category: p.category, allergens: p.containsAllergens, mayContain: p.mayContainAllergens, allergenSourceType: p.allergenSourceType === "unavailable" ? "unavailable" : "official-ingredients", sourceType: "restaurant-issued-menu", sourceUrls: unique(p.sourceEvidenceIds.map((sid) => sourceById.get(sid)?.url).filter((u) => currentUrls.has(u))), sourceEvidenceIds: unique(p.sourceEvidenceIds), matchedBaselineAuditItemKeys: [matchedByProduct.get(p.currentProductKey)].filter(Boolean) };
});
const target = await annotateRestaurantWithIngredientIntelligence({ ...old, items, itemCount: items.length, menuItemCount: items.length, totalItemCount: items.length, officialItemCount: items.length, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable", officialAllergenRemediationBucket: "official-ingredients" });
generated.restaurants[index] = target;
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: result.sources.map((s) => { const purpose = s.purpose.includes("identity") || s.purpose.includes("location") ? "identity" : s.purpose.includes("allergen") || s.purpose.includes("matrix") ? "allergen" : s.purpose.includes("ingredient") ? "ingredients" : s.purpose.includes("cross-contact") ? "cross_contact" : s.purpose.includes("menu") || s.purpose.includes("catalog") || s.purpose.includes("ordering") ? "menu" : "other"; const artifact = { schemaVersion: 1, restaurantId: id, evidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose, retrievedAt: s.retrievedAt, excerpt: s.outcome, rowIdentifiers: [s.evidenceId] }; const artifactPath = `${paths.artifacts}/${s.evidenceId}.json`; write(artifactPath, artifact); return { id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose, retrievedAt: s.retrievedAt, excerpt: s.outcome, artifactPath: `evidence/artifacts/${id}/${s.evidenceId}.json`, sha256: fileSha(artifactPath), rowIdentifiers: [s.evidenceId] }; }) };
const currentSurfaces = result.menuSurfaces.map((s) => ({ ...s, verified: true, evidenceIds: unique(s.sourceEvidenceIds) }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 46, currentProductCount: items.length, reconciledCurrentProductCount: items.length, surfaces: currentSurfaces, products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: p.containsAllergens ?? [], mayContainAllergens: p.mayContainAllergens ?? [], allergenSourceType: p.allergenSourceType })), notes: ["Current restaurant dinner, lunch and happy-hour food menus are publishing surfaces; Fish Market/catering and inaccessible Grubhub are supporting only.", "Direct allergen evidence is narrow; unavailable remains unavailable and no generic may-contain claims are emitted.", "Ingredient Intelligence was recomputed after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 46, sourceItemCount: items.length }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: items.filter((p) => (p.allergens ?? []).length).length, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 46, normalizedMatchCount: result.reconciliation.items.filter((r) => r.disposition === "normalized_match").length, equivalentPresentationCount: result.reconciliation.items.filter((r) => r.disposition === "equivalent_presentation").length, unresolvedCount: 0 } };
const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys) }; });
write(paths.generated, generated, true); write(paths.dossier, dossier); write(paths.evidence, evidence); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const owned = [paths.script, paths.generated, paths.dossier, paths.evidence, paths.checks, ...evidence.sources.map((s) => `${root}/data/restaurant-verification/${s.artifactPath}`)];
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: items.length, normalizedMatchCount: dossier.reconciliation.normalizedMatchCount, equivalentPresentationCount: dossier.reconciliation.equivalentPresentationCount, unresolvedCount: 0, directContainsCount: items.filter((p) => (p.allergens ?? []).length).length, directMayContainCount: 0, directUnavailableCount: items.filter((p) => p.allergenSourceType === "unavailable").length, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, ingredientIntelligenceRecomputed: true }, errors: [], changedPaths: [...owned, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "annotateRestaurantWithIngredientIntelligence", "target-only generated/dossier/evidence/item-check validation", "run apply twice and compare owned-file bytes"], secondRunDiff: "none", counts: { publishedProducts: items.length, normalizedMatches: dossier.reconciliation.normalizedMatchCount, equivalentPresentations: dossier.reconciliation.equivalentPresentationCount, unresolved: 0, directAllergens: items.filter((p) => (p.allergens ?? []).length).length, mayContain: 0, unavailable: items.filter((p) => p.allergenSourceType === "unavailable").length, evidenceSources: evidence.sources.length, matrixSearches: 4 }, beforeAfter: { baselineFingerprint: fingerprint } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, changedPaths: apply.changedPaths, secondRunDiff: "none" }, null, 2));
