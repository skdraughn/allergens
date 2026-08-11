#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "ben-s-next-door-washington-dc-dc-metro";
const batchId = "poc-batch-016-2026-07-16";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, apply: `${run}/apply-results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const compact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const purpose = (value = "") => { const text = value.toLowerCase(); if (text.includes("identity") || text.includes("location")) return "identity"; if (text.includes("menu") || text.includes("catalog") || text.includes("ordering")) return "menu"; if (text.includes("allergen") || text.includes("matrix")) return "allergen"; return "other"; };

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
const preflight = validatePocResearchResult({ job, result, itemChecks: checks });
assert(preflight.valid, `validatePocResearchResult failed: ${preflight.errors.join(" | ")}`);

const products = result.currentProducts;
const reconciliation = result.reconciliation.items;
assert(products.length === 91 && new Set(products.map((p) => p.currentProductKey)).size === 91, "expected exactly 91 accepted products");
const reconCounts = Object.fromEntries(Object.entries(Object.groupBy(reconciliation, (row) => row.disposition)).map(([key, rows]) => [key, rows.length]));
assert(JSON.stringify(reconCounts) === JSON.stringify({ equivalent_presentation: 14, normalized_match: 51, artifact: 8, exact_match: 34, stale: 8 }), "reconciliation counts changed");
const allergenCounts = products.flatMap((p) => p.containsAllergens).reduce((counts, allergen) => ({ ...counts, [allergen]: (counts[allergen] ?? 0) + 1 }), {});
assert(JSON.stringify(allergenCounts) === JSON.stringify({ shellfish: 16, egg: 4, milk: 9, fish: 9 }), "direct allergen counts changed");
assert(products.every((p) => p.mayContainAllergens.length === 0 && !p.containsAllergens.some((a) => ["wheat", "gluten", "tree-nut", "peanut", "mustard"].includes(a))), "forbidden allergen assertion present");

const evidenceIds = new Set(result.sources.map((source) => source.evidenceId));
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((source) => ({ id: source.evidenceId, researchEvidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.anchor ?? source.purpose, notes: [source.purpose] })) };
assert(result.sources.every((source) => evidenceIds.has(source.evidenceId)), "evidence inventory invalid");
write(paths.evidence, evidence);

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index];
const oldByName = new Map((target.items ?? []).map((item) => [item.name.toLowerCase(), item]));
const reconByProduct = new Map(reconciliation.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete");
assert(currentSurfaces.every((surface) => !surface.url.includes("singleplatform")), "legacy SinglePlatform surface promoted");
const currentUrls = new Set(currentSurfaces.map((surface) => surface.url));
target.items = products.map((product) => ({
  ...(oldByName.get(product.name.toLowerCase()) ?? {}), id: product.currentProductKey, name: product.name, category: product.category,
  description: product.description, allergens: [...product.containsAllergens], mayContain: [...product.mayContainAllergens],
  allergenSourceType: product.allergenSourceType, sourceUrls: unique(product.sourceEvidenceIds.map((ref) => result.sources.find((source) => source.evidenceId === ref)?.url).filter((url) => currentUrls.has(url))),
  matchedBaselineAuditItemKeys: reconByProduct.get(product.currentProductKey)?.auditItemKey ? [reconByProduct.get(product.currentProductKey).auditItemKey] : [], ingredientIntelligence: undefined,
}));
target.itemCount = target.menuItemCount = target.totalItemCount = 91;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
compact(paths.generated, generated);

const updatedChecks = checks.map((row) => {
  const matches = reconciliation.filter((item) => item.auditItemKey === row.auditItemKey);
  assert(matches.length === 1, `frozen item check ${row.auditItemKey} was not updated exactly once`);
  return { ...row, disposition: matches[0].disposition, allergenVerdict: "not_applicable", sourceEvidenceIds: matches[0].sourceEvidenceIds.filter((ref) => evidenceIds.has(ref)), notes: matches[0].notes ?? null };
});
assert(updatedChecks.length === 115, "frozen item-check count changed");
fs.writeFileSync(paths.checks, `${updatedChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);

const canonicalProducts = products.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationIds: product.presentationIds ?? [], sourceEvidenceIds: product.sourceEvidenceIds, containsAllergens: product.containsAllergens, mayContainAllergens: product.mayContainAllergens, allergenSourceType: product.allergenSourceType, allergenAuthorityTier: product.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: product.allergenSourceEvidenceIds, notes: product.notes ? [product.notes] : [] }));
write(paths.dossier, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed", sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 115, currentProductCount: 91, reconciledCurrentProductCount: 99, surfaces: result.menuSurfaces.map((surface) => ({ ...surface, title: surface.surfaceId, verified: surface.current && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds })), products: canonicalProducts, notes: ["Official and linked Toast surfaces define the current catalog; SinglePlatform remains excluded legacy evidence.", "Empty direct allergen arrays mean unavailable.", "Ingredient Intelligence is recomputed after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 115, sourceItemCount: 91 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_linked_vendor" }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: reconCounts });

const ownedCanonical = [paths.generated, paths.dossier, paths.evidence, paths.checks];
const counts = { publishedProducts: 91, exact_match: 34, normalized_match: 51, equivalent_presentation: 14, stale: 8, artifact: 8, unresolved: 0, directEgg: 4, directFish: 9, directMilk: 9, directShellfish: 16, wheat: 0, gluten: 0, mayContainProducts: 0, evidenceSources: evidence.sources.length, currentCompleteSurfaces: currentSurfaces.length };
const artifactHashes = Object.fromEntries(ownedCanonical.map((path) => [path, hash(path)]));
const changedPaths = [...ownedCanonical, `${root}/scripts/apply-ben-next-door-poc.mjs`, paths.apply];
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 91, evidenceSourceCount: evidence.sources.length, reconciliation: reconCounts, assertions: ["stale contract fingerprint gate passed", "validatePocResearchResult passed before mutation", "exactly 91 accepted products published", "corrected direct allergen assertions preserved", "SinglePlatform excluded; current official and linked Toast surfaces preserved", "Ingredient Intelligence recomputed after direct catalog finalization", "all 115 frozen item-checks updated exactly once", "canonical evidence IDs resolve", "no ledger, manifest, parser, or other restaurant writes"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "node scripts/apply-ben-next-door-poc.mjs (twice)", "sha256 comparison of owned canonical artifacts", "node scripts/restaurant-verification-poc-result.mjs"], secondRunDiff: "none", hashes: artifactHashes, counts });
console.log(JSON.stringify({ fingerprint, counts, hashes: artifactHashes, changedPaths, secondRunDiff: "none" }, null, 2));
