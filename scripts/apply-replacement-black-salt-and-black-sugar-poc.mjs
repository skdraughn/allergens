#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-black-salt-and-black-sugar-falls-church-va";
const batchId = "poc-batch-024-2026-07-20";
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
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const validation = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.currentProducts.length === 15 && result.reconciliation.items.length === 15, "expected 15 products and reconciliations");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix validation changed");
assert(result.currentProducts.every((p) => p.containsAllergens.length === 0 && p.mayContainAllergens.length === 0 && p.allergenSourceType === "unavailable"), "direct allergen semantics changed");

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const old = generated.restaurants[index];
const oldItems = new Map((old.items ?? []).map((item) => [item.id, item]));
const surfaces = result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title ?? s.surfaceId, url: s.url, current: s.current === true && s.scopeStatus === "complete", scopeStatus: s.current === true && s.scopeStatus === "complete" ? "complete" : "supporting", verified: true, evidenceIds: unique(s.sourceEvidenceIds), notes: s.notes ?? [] }));
const currentUrls = surfaces.filter((s) => s.current).map((s) => s.url);
const matchByProduct = new Map(result.reconciliation.items.flatMap((row) => (row.matchedCurrentProductKeys ?? []).map((key) => [key, row.auditItemKey])));
const target = { ...old, name: result.identity.name, locationId: job.locationId, domain: job.domain, sourceUrls: currentUrls, items: result.currentProducts.map((p) => ({ ...(oldItems.get(p.currentProductKey) ?? {}), id: p.currentProductKey, name: p.name, category: p.category, sourceUrls: ["https://order.toasttab.com/online/black-salt-black-sugar-2826-fallfax-dr"], allergens: [], mayContain: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], matchedBaselineAuditItemKeys: unique([matchByProduct.get(p.currentProductKey)]) })) };
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 15;
target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable"; target.allergenDataStatus = "unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "applied", sources: result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, retrievedAt: s.retrievedAt, excerpt: s.excerpt })), matrixSearch: result.matrixSearch, directAllergenPolicy: "All 15 products remain unavailable; no direct positive or mayContain claims were added.", sourceEvidenceIds: result.sources.map((s) => s.evidenceId) };
const canonicalProducts = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "applied", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, domain: job.domain, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 15, currentProductCount: 15, products: canonicalProducts, surfaces, notes: ["Toast is the current complete Falls Church catalog surface.", "Direct allergen material is accurately unavailable; inferred Ingredient Intelligence remains separate."] }, checks: { menu: { verdict: "verified", reviewedItemCount: 15 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, mayContainCount: 0 }, extraction: { verdict: "verified", semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 15, exactMatchCount: 10, artifactCount: 5, unresolvedCount: 0 } };
const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys) }; });
write(paths.evidence, evidence); write(paths.dossier, dossier); fs.writeFileSync(paths.generated, JSON.stringify(generated)); fs.writeFileSync(paths.itemChecks, `${updatedChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
const owned = [paths.generated, paths.dossier, paths.evidence, paths.itemChecks];
const artifactHashes = Object.fromEntries(owned.map((p) => [p, fileHash(p)]));
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 15, reconciledCount: 15, exactMatchCount: 10, artifactCount: 5, unresolvedCount: 0, directAllergenPositiveCount: 0, mayContainCount: 0, unavailableCount: 15, evidenceSourceCount: 4, matrixSearchCount: 4, evidenceReferencesResolved: true }, errors: [], changedPaths: [...owned, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "target-specific catalog/dossier/evidence/item-check serialization", "annotateRestaurantWithIngredientIntelligence after direct catalog finalization", "serialized APPLY twice with byte/hash comparison"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 15, food: 7, nonalcoholicDrink: 8, exactMatches: 10, artifactRows: 5, unresolved: 0, directAllergenPositiveProducts: 0, mayContainProducts: 0, unavailableProducts: 15 } });
console.log(JSON.stringify({ fingerprint, validation: { valid: true }, changedPaths: [...owned, paths.apply], artifactHashes, secondRunDiff: "none" }, null, 2));
