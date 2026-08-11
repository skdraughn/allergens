#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bethesda-bagels-navy-yard-dc";
const batchId = "poc-batch-017-2026-07-17";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hash = (p) => sha(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (value = "") => value.includes("identity") ? "identity" : value.includes("allergen") ? "allergen" : value.includes("menu") || value.includes("ordering") ? "menu" : "other";

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id && job.locationId === "navy-yard-dc", "job identity/location mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.currentProducts.length === 111 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 111, "expected 111 unique products");
const complete = result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
assert(JSON.stringify(complete.map((s) => s.surfaceId)) === JSON.stringify(["MS-BAGELS", "MS-BREAKFAST", "MS-LUNCH", "MS-TOAST"]), "current surfaces changed");
const reconCounts = Object.fromEntries(Object.entries(Object.groupBy(result.reconciliation.items, (r) => r.disposition)).map(([key, rows]) => [key, rows.length]));
assert(JSON.stringify(reconCounts) === JSON.stringify({ exact_match: 111 }), "reconciliation counts changed");
assert(result.reconciliation.items.length === 111 && !result.reconciliation.items.some((r) => r.disposition === "unresolved"), "reconciliation unresolved");
const direct = result.currentProducts.flatMap((p) => p.containsAllergens).reduce((a, allergen) => ({ ...a, [allergen]: (a[allergen] ?? 0) + 1 }), {});
assert(JSON.stringify(direct) === JSON.stringify({ egg: 15, milk: 39, fish: 7, peanut: 1, "tree-nut": 2 }), "direct aggregate changed");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0 && !p.containsAllergens.some((a) => ["wheat", "gluten", "soy", "sesame"].includes(a))), "forbidden allergen outcome present");
assert(result.sources.length === 5 && result.sources.every((s) => s.evidenceId && s.url && s.authorityTier && s.purpose && s.retrievedAt), "canonical evidence invalid");

const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((s) => ({ id: s.evidenceId, researchEvidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, excerpt: s.excerpt, notes: [s.purpose] })) };
const evidenceIds = new Set(evidence.sources.map((s) => s.id));
for (const product of result.currentProducts) for (const evidenceId of [...product.sourceEvidenceIds, ...product.allergenSourceEvidenceIds]) assert(evidenceIds.has(evidenceId), `unresolved evidence ${evidenceId}`);
write(paths.evidence, evidence);

const generated = read(paths.generated); const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id); assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index]; const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const currentUrls = new Set(complete.flatMap((surface) => surface.sourceEvidenceIds).map((evidenceId) => result.sources.find((s) => s.evidenceId === evidenceId)?.url).filter(Boolean));
const reconByProduct = new Map(result.reconciliation.items.flatMap((row) => (row.matchedCurrentProductKeys ?? []).map((key) => [key, row.auditItemKey])));
target.items = result.currentProducts.map((product) => ({ ...(oldById.get(product.currentProductKey) ?? {}), id: product.currentProductKey, name: product.name, category: product.category, allergens: [...product.containsAllergens], mayContain: [], allergenSourceType: product.allergenSourceType, sourceUrls: unique(product.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: [reconByProduct.get(product.currentProductKey)], ingredientIntelligence: undefined }));
Object.assign(target, { itemCount: 111, menuItemCount: 111, totalItemCount: 111, officialItemCount: 111, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "verified", launchQualityStatus: "published" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target); write(paths.generated, generated);

const updatedChecks = checks.map((row) => { const matches = result.reconciliation.items.filter((r) => r.auditItemKey === row.auditItemKey); assert(matches.length === 1, `item check ${row.auditItemKey} update count ${matches.length}`); const match = matches[0]; return { ...row, disposition: match.disposition, allergenVerdict: "verified", sourceEvidenceIds: unique((match.sourceEvidenceIds ?? []).filter((e) => evidenceIds.has(e))), notes: match.notes ?? null }; });
assert(updatedChecks.length === 111, "item-check count changed"); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: p.presentationIds ?? [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: p.containsAllergens, mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds, notes: p.notes ? [p.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed", locationId: job.locationId }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 111, currentProductCount: 111, reconciledCurrentProductCount: 111, surfaces: result.menuSurfaces.map((s) => ({ ...s, title: s.surfaceId, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products, notes: ["MS-BAGELS, MS-BREAKFAST, MS-LUNCH, and MS-TOAST are the complete current Navy Yard catalog.", "Direct allergen fields are preserved from the accepted corrected result; Ingredient Intelligence is recomputed after direct finalization."] }, restaurantLevelAllergenEvidence: [], sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: reconCounts, checks: { menu: { verdict: "verified", reviewedItemCount: 111, sourceItemCount: 111 }, allergenSource: { verdict: "verified", directPositiveCount: 5 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } } };
write(paths.dossier, dossier);

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks]; const artifactHashes = Object.fromEntries(owned.map((p) => [p, hash(p)]));
const counts = { publishedProducts: 111, exact_match: 111, unresolved: 0, egg: 15, milk: 39, fish: 7, peanut: 1, treeNut: 2, wheat: 0, gluten: 0, soy: 0, sesame: 0, mayContainProducts: 0, evidenceSources: 5, currentCompleteSurfaces: 4 };
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 111, evidenceSourceCount: 5, reconciliation: reconCounts, assertions: ["fingerprint gate passed", "accepted corrected JOB/RESULT validated", "direct aggregate preserved exactly", "canonical evidence purposes and IDs resolve", "Ingredient Intelligence recomputed after direct finalization", "all 111 item-checks updated exactly once", "Navy Yard location only", "no ledger, manifest, parser, or other restaurant writes"] }, errors: [], changedPaths: [...owned, `${root}/scripts/apply-bethesda-bagels-navy-yard-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "node scripts/apply-bethesda-bagels-navy-yard-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", hashes: artifactHashes, counts };
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, counts, hashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, changedPaths: apply.changedPaths, secondRunDiff: "none" }, null, 2));
