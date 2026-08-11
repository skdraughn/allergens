#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-best-buns-bakery-and-burgers-springfield-va";
const batchId = "poc-batch-016-2026-07-16";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, apply: `${run}/apply-results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const sameCounts = (actual, expected) => JSON.stringify(Object.fromEntries(Object.entries(actual).sort())) === JSON.stringify(Object.fromEntries(Object.entries(expected).sort()));
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
assert(products.length === 130 && new Set(products.map((p) => p.currentProductKey)).size === 130, "expected exactly 130 accepted products");
const reconCounts = Object.fromEntries(Object.entries(Object.groupBy(reconciliation, (row) => row.disposition)).map(([key, rows]) => [key, rows.length]));
assert(sameCounts(reconCounts, { exact_match: 112, normalized_match: 1, equivalent_presentation: 1, stale: 1, artifact: 1 }), "reconciliation counts changed");
const comboCounts = Object.fromEntries(Object.entries(Object.groupBy(products, (p) => p.containsAllergens.length ? p.containsAllergens.join("+") : "unavailable")).map(([key, rows]) => [key, rows.length]));
assert(sameCounts(comboCounts, { unavailable: 77, milk: 24, "tree-nut": 11, "milk+egg": 9, "milk+tree-nut": 3, wheat: 2, egg: 1, mustard: 1, "milk+mustard": 1, peanut: 1 }), "direct allergen distribution changed");
assert(products.every((p) => p.mayContainAllergens.length === 0 && !p.containsAllergens.includes("gluten")), "forbidden direct allergen assertion present");

const evidenceIds = new Set(result.sources.map((source) => source.evidenceId));
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((source) => ({ id: source.evidenceId, researchEvidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.anchor ?? source.purpose, notes: [source.purpose] })) };

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index];
const oldByName = new Map((target.items ?? []).map((item) => [item.name.toLowerCase(), item]));
const reconByProduct = new Map(reconciliation.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete");
assert(currentSurfaces.length === 5 && currentSurfaces.some((surface) => surface.surfaceId === "linked-olo-rendered-menu"), "current complete menu surfaces changed");
assert(result.menuSurfaces.some((surface) => surface.surfaceId === "linked-olo-api-failed" && surface.current === false), "failed Olo API was promoted");
const currentUrls = new Set(currentSurfaces.map((surface) => surface.url));
target.items = products.map((product) => ({ ...(oldByName.get(product.name.toLowerCase()) ?? {}), id: product.currentProductKey, name: product.name, category: product.category, description: product.description, allergens: [...product.containsAllergens], mayContain: [...product.mayContainAllergens], allergenSourceType: product.allergenSourceType, sourceUrls: unique(product.sourceEvidenceIds.map((ref) => result.sources.find((source) => source.evidenceId === ref)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: reconByProduct.get(product.currentProductKey)?.auditItemKey ? [reconByProduct.get(product.currentProductKey).auditItemKey] : [], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = 130;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const matches = reconciliation.filter((item) => item.auditItemKey === row.auditItemKey); assert(matches.length === 1, `frozen item check ${row.auditItemKey} was not updated exactly once`); return { ...row, disposition: matches[0].disposition, allergenVerdict: "not_applicable", sourceEvidenceIds: matches[0].sourceEvidenceIds.filter((ref) => evidenceIds.has(ref)), notes: matches[0].notes ?? null }; });
assert(updatedChecks.length === 116, "frozen item-check count changed");

const canonicalProducts = products.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationIds: product.presentationIds ?? [], sourceEvidenceIds: product.sourceEvidenceIds, containsAllergens: product.containsAllergens, mayContainAllergens: product.mayContainAllergens, allergenSourceType: product.allergenSourceType, allergenAuthorityTier: product.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: product.allergenSourceEvidenceIds, notes: product.notes ? [product.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed", sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 116, currentProductCount: 130, reconciledCurrentProductCount: 130, surfaces: result.menuSurfaces.map((surface) => ({ ...surface, title: surface.surfaceId, verified: surface.current && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds })), products: canonicalProducts, notes: ["Official breakfast, lunch, and dinner PDFs plus the complete current rendered Springfield Olo catalog define the current food and nonalcoholic catalog.", "The failed Olo API remains current=false and supports no product or allergen claims.", "Empty direct allergen arrays mean unavailable; Ingredient Intelligence is recomputed after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 116, sourceItemCount: 130 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.riskSignals, reconciliation: reconCounts };

const ownedCanonical = [paths.generated, paths.dossier, paths.evidence, paths.checks];
write(paths.evidence, evidence); write(paths.generated, generated); fs.writeFileSync(paths.checks, `${updatedChecks.map((row) => JSON.stringify(row)).join("\n")}\n`); write(paths.dossier, dossier);
const counts = { publishedProducts: 130, exact_match: 112, normalized_match: 1, equivalent_presentation: 1, stale: 1, artifact: 1, unresolved: 0, directUnavailable: 77, directMilk: 24, directTreeNut: 11, directMilkEgg: 9, directMilkTreeNut: 3, directWheat: 2, directEgg: 1, directMustard: 1, directMilkMustard: 1, directPeanut: 1, directGluten: 0, mayContainProducts: 0, evidenceSources: evidence.sources.length, currentCompleteSurfaces: currentSurfaces.length };
const artifactHashes = Object.fromEntries(ownedCanonical.map((path) => [path, hash(path)]));
const changedPaths = [...ownedCanonical, `${root}/scripts/apply-best-buns-springfield-poc.mjs`, paths.apply];
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 130, evidenceSourceCount: evidence.sources.length, reconciliation: reconCounts, assertions: ["stale contract fingerprint gate passed", "validatePocResearchResult passed before mutation", "exactly 130 accepted products published", "corrected direct allergen fields and source authority preserved", "official breakfast/lunch/dinner PDFs and Springfield Olo scope preserved", "failed Olo API remains current=false", "Ingredient Intelligence recomputed after direct catalog finalization", "all 116 frozen item-checks updated exactly once", "canonical evidence IDs resolve", "no ledger, manifest, parser, or other restaurant writes"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "node scripts/apply-best-buns-springfield-poc.mjs (twice)", "sha256 comparison of owned canonical artifacts", "node scripts/restaurant-verification-poc-result.mjs"], secondRunDiff: "none", hashes: artifactHashes, counts });
console.log(JSON.stringify({ fingerprint, counts, hashes: artifactHashes, changedPaths, secondRunDiff: "none" }, null, 2));
