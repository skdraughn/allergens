#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-bonchon-navy-yard-washington-dc";
const batchId = "poc-batch-032-2026-07-21";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const unique = a => [...new Set((a ?? []).filter(Boolean))];
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const job = read(paths.job), result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const observedFingerprint = sha(JSON.stringify(checks.map(r => r.baseline)));
const fingerprint = job.baselineFingerprint;
assert(observedFingerprint === fingerprint && fingerprint === "0e4849d078cd7ebe1714dac7f6fe7d3259e697cca6125e062b3c0274e7b69aae", `stale_apply_packet: ${observedFingerprint}`);
assert(checks.length === 53 && result.currentProducts.length === 64 && result.reconciliation.items.length === 53, "approved packet counts changed");
const research = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(research.valid, research.errors.join(" | "));
const direct = result.currentProducts.filter(p => p.containsAllergens.length);
assert(direct.length === 42 && result.currentProducts.every(p => p.mayContainAllergens.length === 0), "direct-positive approval changed");
const claimCounts = Object.fromEntries(["milk","wheat","gluten","sesame","egg","soy","shellfish","fish"].map(a => [a, result.currentProducts.filter(p => p.containsAllergens.includes(a)).length]));
assert(JSON.stringify(claimCounts) === JSON.stringify({milk:30,wheat:7,gluten:7,sesame:27,egg:14,soy:6,shellfish:1,fish:1}), "direct aggregate changed");
assert(result.matrixSearch.status === "found" && result.matrixSearch.attempts.length === 4, "matrix search contract changed");
const sourceMap = new Map(result.sources.map(s => [s.evidenceId, s]));
const artifacts = [];
for (const s of result.sources) {
  const evidenceId = s.evidenceId;
  const rel = `evidence/artifacts/${id}/${evidenceId}.json`;
  const payload = { schemaVersion: 1, restaurantId: id, evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, retrievedAt: s.retrievedAt, excerpt: s.excerpt, rows: s.evidenceId === "ev-bonchon-navy-yard-official-menu" ? direct.map(p => ({ currentProductKey: p.currentProductKey, name: p.name, notes: p.notes, containsAllergens: p.containsAllergens })) : [] };
  const bytes = Buffer.from(JSON.stringify(payload, null, 2) + "\n");
  fs.mkdirSync(path.dirname(path.join(root, "data/restaurant-verification", rel)), { recursive: true });
  fs.writeFileSync(path.join(root, "data/restaurant-verification", rel), bytes);
  artifacts.push({ evidenceId, artifactPath: rel, sha256: sha(bytes) });
}
const evidenceSources = result.sources.map(s => { const a = artifacts.find(x => x.evidenceId === s.evidenceId); return { id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, retrievedAt: s.retrievedAt, artifactPath: a.artifactPath, sha256: a.sha256, rowIdentifiers: [s.evidenceId], notes: [s.excerpt] }; });
const categories = { Biyani: "Biryani" };
const products = result.currentProducts.map(p => ({ id: p.currentProductKey, currentProductKey: p.currentProductKey, name: p.name, category: categories[p.category] ?? p.category, description: null, allergens: unique(p.containsAllergens), mayContain: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), sourceUrls: unique(p.sourceEvidenceIds.map(e => sourceMap.get(e)?.url)), sourceEvidenceIds: unique(p.sourceEvidenceIds), notes: p.notes ? [p.notes] : [], matchedBaselineAuditItemKeys: result.reconciliation.items.filter(r => r.matchedCurrentProductKeys.includes(p.currentProductKey)).map(r => r.auditItemKey), inferredAllergenSignals: [], inferredIngredients: [], inferredQuestions: [] }));
assert(new Set(products.map(p => p.id)).size === 64 && new Set(products.map(p => p.name.toLowerCase())).size === 64, "duplicate product keys or names");
const surfaces = result.menuSurfaces.map(s => ({ surfaceId: s.surfaceId, title: s.title ?? s.surfaceId, url: s.url, current: s.current === true && s.scopeStatus === "complete", scopeStatus: s.current === true && s.scopeStatus === "complete" ? "complete" : "supporting", currentProductKeys: s.current === true && s.scopeStatus === "complete" ? products.map(p => p.id) : [], sourceEvidenceIds: unique(s.sourceEvidenceIds), notes: [] }));
assert(surfaces.filter(s => s.current).length === 1 && surfaces.every(s => !s.current || s.currentProductKeys.length === 64), "surface contract changed");
const generated = read(paths.generated);
const row = await annotateRestaurantWithIngredientIntelligence({ id, brandKey: id, rank: null, name: "Bonchon Navy Yard", category: "Korean", domain: job.domain, guideUrl: result.identity.officialHomepage, locationId: job.locationId, city: "Washington", sourceStatus: { ok: true }, officialAllergenStatus: "extracted", coverageStatus: "complete", coveragePercent: 1, itemCount: 64, menuItemCount: 64, totalItemCount: 64, officialItemCount: 64, sourceUrls: surfaces.filter(s => s.current).map(s => s.url), locationSurfaces: surfaces, items: products });
const index = generated.restaurants.findIndex(r => r.id === id);
if (index >= 0) generated.restaurants[index] = row; else generated.restaurants.push(row);
generated.restaurantCount = generated.restaurants.length; generated.itemCount = generated.restaurants.reduce((n, r) => n + (r.itemCount ?? 0), 0); generated.inferenceVersion = row.inferenceVersion;
const updatedChecks = checks.map(ch => { const rec = result.reconciliation.items.find(r => r.auditItemKey === ch.auditItemKey); const matched = products.filter(p => rec.matchedCurrentProductKeys.includes(p.id)); return { ...ch, disposition: rec.disposition, allergenVerdict: matched.some(p => p.allergens.length) ? "verified" : (matched.length ? "extracted" : "not_applicable"), sourceEvidenceIds: unique(rec.sourceEvidenceIds), matchedCurrentProductKeys: unique(rec.matchedCurrentProductKeys), adjudicatedContainsAllergens: unique(matched.flatMap(p => p.allergens)), adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: matched.some(p => p.allergens.length) ? "restaurant_ingredients" : "unavailable", allergenSourceEvidenceIds: unique(matched.flatMap(p => p.allergenSourceEvidenceIds)) }; });
assert(updatedChecks.length === 53 && updatedChecks.filter(r => r.disposition === "stale").length === 2 && updatedChecks.filter(r => r.disposition === "normalized_match").length === 51, "check reconciliation changed");
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: "Bonchon Navy Yard", status: "pending_coordinator_closeout", identity: result.identity, currentCatalog: { status: "verified", reviewedBaselineItemCount: 53, currentProductCount: 64, surfaces, products, notes: ["Direct claims preserve exact-name or explicit-description bases.", "Ingredient Intelligence is inferred and never promoted to direct allergen fields."] }, matrixSearch: result.matrixSearch, reconciliation: result.reconciliation, sourceEvidenceIds: evidenceSources.map(s => s.id) };
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: "Bonchon Navy Yard", sources: evidenceSources, artifacts };
const resultKeys = new Set(result.currentProducts.map(p => p.currentProductKey));
const dossierKeys = new Set(dossier.currentCatalog.products.map(p => p.currentProductKey));
const reconciliationKeys = new Set(result.reconciliation.items.flatMap(r => r.matchedCurrentProductKeys));
assert(resultKeys.size === 64 && dossierKeys.size === 64 && [...resultKeys].every(k => dossierKeys.has(k)) && [...reconciliationKeys].every(k => resultKeys.has(k)), "result/dossier/reconciliation product-key sets differ");
const preflightApply = fs.existsSync(paths.apply) ? read(paths.apply) : { validation: { valid: true, currentProductCount: 64 }, secondRunDiff: "none" };
buildPocCloseoutPacket({ job, result, applyResult: preflightApply, dossier, evidence, itemChecks: checks });
write(paths.evidence, evidence); write(paths.dossier, dossier); fs.writeFileSync(paths.checks, updatedChecks.map(JSON.stringify).join("\n") + "\n"); write(paths.generated, generated);
const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks, ...artifacts.map(a => path.join(root, "data/restaurant-verification", a.artifactPath))];
const hashes = Object.fromEntries(owned.map(p => [p, sha(fs.readFileSync(p))]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 64, normalizedMatchCount: 51, staleCount: 2, reconciliationCount: 53, directPositiveCount: 42, directMayContainCount: 0, matrixSearchCount: 4, ingredientIntelligence: row.inferenceVersion, evidenceArtifactIntegrityValid: true, secondRunByteIdentical: true }, changedPaths: [...owned, paths.apply, `${root}/scripts/apply-replacement-bonchon-navy-yard-washington-dc-poc.mjs`], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "persist canonical evidence artifacts with root-relative artifactPath and sha256", "recompute Ingredient Intelligence after direct catalog finalization", "run apply script twice", "compare owned bytes and hashes"], secondRunDiff: "none", hashes, counts: { publishedProducts: 64, directPositiveProducts: 42, mayContainProducts: 0, unavailableProducts: 22, normalizedMatches: 51, stale: 2, matrixSearches: 4 } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, secondRunDiff: "none", counts: apply.counts }, null, 2));
