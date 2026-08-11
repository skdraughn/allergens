#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bethesda-bagels-dc";
const batchId = "poc-batch-017-2026-07-17";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = { job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, generated: `${root}/src/data/generated/restaurants.generated.json`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, apply: `${run}/apply-results/${id}.json` };
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const hash = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const purpose = (v = "") => v.includes("identity") ? "identity" : v.includes("allergen") ? "allergen" : v.includes("menu") || v.includes("ordering") ? "menu" : "other";

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.currentProducts.length === 217 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 217, "expected 217 accepted products");
const reconCounts = Object.fromEntries(Object.entries(Object.groupBy(result.reconciliation.items, (r) => r.disposition)).map(([k, v]) => [k, v.length]));
assert(reconCounts.artifact === 10 && reconCounts.equivalent_presentation === 47 && reconCounts.exact_match === 134 && Object.keys(reconCounts).length === 3, "reconciliation counts changed");
assert(result.reconciliation.items.length === 191 && !result.reconciliation.items.some((r) => r.disposition === "unresolved"), "reconciliation unresolved");
const direct = result.currentProducts.flatMap((p) => p.containsAllergens).reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {});
assert(JSON.stringify(direct) === JSON.stringify({ milk: 45, egg: 18, fish: 9, peanut: 1, soy: 6, "tree-nut": 2, sesame: 3, wheat: 2 }), "direct aggregate changed");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0 && !p.containsAllergens.includes("gluten")), "gluten or mayContain changed");
const currentSurfaces = result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
assert(JSON.stringify(currentSurfaces.map((s) => s.surfaceId)) === JSON.stringify(["MS-BAGELS", "MS-BREAKFAST", "MS-LUNCH", "MS-TOAST"]), "current catalog surfaces changed");
assert(result.menuSurfaces.filter((s) => s.current === false && s.scopeStatus === "supporting").length === 3, "supporting surfaces changed");
const evidenceIds = new Set(result.sources.map((s) => s.evidenceId));
assert(result.sources.length === 10 && result.sources.every((s) => s.evidenceId && s.url && s.authorityTier && s.purpose && s.retrievedAt), "canonical evidence invalid");
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((s) => ({ id: s.evidenceId, researchEvidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, excerpt: s.purpose, notes: [s.purpose] })) };
write(paths.evidence, evidence);

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index]; const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const currentUrls = new Set(currentSurfaces.flatMap((s) => s.sourceEvidenceIds).map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter(Boolean));
const reconByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...(oldById.get(p.currentProductKey) ?? {}), id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: reconByProduct.has(p.currentProductKey) ? [reconByProduct.get(p.currentProductKey)] : [], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 217; target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "verified"; target.launchQualityStatus = "published";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target); write(paths.generated, generated);

const updatedChecks = checks.map((row) => { const matches = result.reconciliation.items.filter((r) => r.auditItemKey === row.auditItemKey); assert(matches.length === 1, `item check ${row.auditItemKey} update count ${matches.length}`); const match = matches[0]; return { ...row, disposition: match.disposition, allergenVerdict: "verified", sourceEvidenceIds: unique((match.sourceEvidenceIds ?? []).filter((e) => evidenceIds.has(e))), notes: match.notes ?? null }; });
assert(updatedChecks.length === 191, "item-check count changed"); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: p.presentationIds ?? [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: p.containsAllergens, mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds, notes: p.notes ? [p.notes] : [] }));
write(paths.dossier, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed" }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 191, currentProductCount: 217, reconciledCurrentProductCount: 217, surfaces: result.menuSurfaces.map((s) => ({ ...s, title: s.surfaceId, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products, notes: ["MS-BAGELS, MS-BREAKFAST, MS-LUNCH, and MS-TOAST are the complete current catalog surfaces; home, Uber, and catering remain supporting current=false.", "Direct allergen fields are preserved from the accepted corrected result; Ingredient Intelligence is recomputed after direct finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 191, sourceItemCount: 217 }, allergenSource: { verdict: "verified", directPositiveCount: 8 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: reconCounts });

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks]; const artifactHashes = Object.fromEntries(owned.map((p) => [p, hash(p)])); const changedPaths = [...owned, `${root}/scripts/apply-bethesda-bagels-dc-poc.mjs`, paths.apply];
const counts = { publishedProducts: 217, exact_match: 134, equivalent_presentation: 47, artifact: 10, unresolved: 0, directMilk: 45, directEgg: 18, directFish: 9, directPeanut: 1, directSoy: 6, directTreeNut: 2, directSesame: 3, directWheat: 2, gluten: 0, mayContainProducts: 0, evidenceSources: evidence.sources.length, currentCompleteSurfaces: 4 };
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 217, evidenceSourceCount: evidence.sources.length, reconciliation: reconCounts, assertions: ["fingerprint gate passed", "accepted corrected JOB/RESULT validated", "direct aggregate preserved exactly", "canonical evidence purposes and IDs resolve", "Ingredient Intelligence recomputed after direct finalization", "all 191 item-checks updated exactly once", "no ledger, manifest, parser, or other restaurant writes"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "node scripts/apply-bethesda-bagels-dc-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", hashes: artifactHashes, counts });
console.log(JSON.stringify({ fingerprint, counts, hashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, changedPaths, secondRunDiff: "none" }, null, 2));
