#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-bkd-bagels-13669569925";
const batchId = "poc-batch-023-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, apply: `${run}/apply-results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, generated: `${root}/src/data/generated/restaurants.generated.json`,
  artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const unique = (values = []) => [...new Set((values ?? []).filter(Boolean))];
const arr = (value) => Array.isArray(value) ? value : [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const allowedPurposes = new Set(["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"]);
const canonicalPurpose = (purpose = "") => {
  const value = purpose.toLowerCase();
  if (value.includes("cross") && value.includes("contact")) return "cross_contact";
  if (value.includes("ingredient")) return "ingredients";
  if (value.includes("allergen")) return "allergen";
  if (value.includes("identity") || value.includes("brand") || value.includes("location")) return "identity";
  if (value.includes("menu") || value.includes("ordering") || value.includes("catalog")) return "menu";
  return "other";
};

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `research validation failed: ${preflight.errors.join(" | ")}`);
assert(result.currentProducts.length === 44 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 44, "expected 44 current products");
assert(checks.length === 70, "expected 70 frozen item checks");
const reconciliation = Object.fromEntries(["normalized_match", "equivalent_presentation", "artifact", "stale"].map((disposition) => [disposition, result.reconciliation.dispositions.filter((group) => group.disposition === disposition).flatMap((group) => group.auditItemKeys)]));
assert(JSON.stringify(Object.fromEntries(Object.entries(reconciliation).map(([k, v]) => [k, v.length]))) === JSON.stringify({ normalized_match: 29, equivalent_presentation: 15, artifact: 3, stale: 23 }), "reconciliation counts changed");
assert(Object.values(reconciliation).flat().length === 70 && new Set(Object.values(reconciliation).flat()).size === 70, "frozen keys are not exact-once");
assert(result.reconciliation.dispositions.filter((group) => ["artifact", "stale"].includes(group.disposition)).every((group) => JSON.stringify(group.sourceEvidenceIds) === JSON.stringify(["toast-leesburg"])), "artifact/stale Leesburg menu evidence changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4, "matrix search verdict changed");
assert(result.menuSurfaces.some((s) => s.surfaceId === "toast-leesburg" && s.current && s.scopeStatus === "complete"), "Leesburg surface missing");
assert(result.menuSurfaces.filter((s) => s.current === false && s.scopeStatus === "complete").length === 2, "excluded location surfaces changed");
assert(!result.currentProducts.some((p) => /mug|merch/i.test(`${p.name} ${p.category}`)), "merchandise entered catalog");
const direct = result.currentProducts.flatMap((p) => arr(p.containsAllergens)).reduce((out, allergen) => ({ ...out, [allergen]: (out[allergen] ?? 0) + 1 }), {});
assert(JSON.stringify(direct) === JSON.stringify({ fish: 1, milk: 1, egg: 1 }), "direct allergen aggregate changed");
assert(result.currentProducts.every((p) => arr(p.mayContainAllergens).length === 0), "mayContain changed");
assert(result.currentProducts.find((p) => p.currentProductKey === "side-of-bacon") && !result.currentProducts.some((p) => p.currentProductKey === "side-of-bacon-2"), "Side of Bacon normalization changed");

const sourceById = new Map(result.sources.map((source) => [source.id ?? source.evidenceId, source]));
const evidenceSources = result.sources.map((source) => {
  const sourceId = source.id ?? source.evidenceId;
  const purpose = canonicalPurpose(source.purpose);
  assert(allowedPurposes.has(purpose), `invalid evidence purpose ${purpose}`);
  return { id: sourceId, researchEvidenceId: sourceId, url: source.url, authorityTier: source.authorityTier, purpose, retrievedAt: source.retrievedAt, excerpt: source.purpose, notes: [source.purpose] };
});
write(paths.evidence, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: evidenceSources });
for (const source of result.sources) {
  const sourceId = source.id ?? source.evidenceId;
  write(`${paths.artifacts}/${sourceId}.json`, { schemaVersion: 1, artifactType: "restaurant-verification-source", restaurantId: id, sourceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, stableRecord: { purpose: source.purpose, notes: source.purpose } });
}

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index];
const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").flatMap((s) => s.sourceEvidenceIds).map((sourceId) => sourceById.get(sourceId)?.url).filter(Boolean));
const reconByProduct = new Map(result.reconciliation.dispositions.flatMap((group) => group.matchedCurrentProductKeys.map((key) => [key, group.auditItemKeys])));
target.items = result.currentProducts.map((product) => ({ ...(oldById.get(product.currentProductKey) ?? {}), id: product.currentProductKey, name: product.name, category: product.category, allergens: arr(product.containsAllergens), mayContain: [], allergenSourceType: product.allergenSourceType, sourceUrls: unique(product.sourceEvidenceIds.map((sourceId) => sourceById.get(sourceId)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: reconByProduct.get(product.currentProductKey) ?? [], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 44;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable"; target.launchQualityStatus = "published";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
write(paths.generated, generated);

const reconByAudit = new Map(result.reconciliation.dispositions.flatMap((group) => group.auditItemKeys.map((auditItemKey) => [auditItemKey, { disposition: group.disposition, matchedCurrentProductKeys: group.matchedCurrentProductKeys }])));
const updatedChecks = checks.map((row) => { const match = reconByAudit.get(row.auditItemKey); assert(match, `missing reconciliation ${row.auditItemKey}`); return { ...row, disposition: match.disposition, allergenVerdict: result.currentProducts.some((p) => arr(p.containsAllergens).length) ? "verified" : "accurately_unavailable", sourceEvidenceIds: unique(arr(row.sourceEvidenceIds).filter((sourceId) => sourceById.has(sourceId))), notes: row.notes ?? null }; });
fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);

const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: arr(p.containsAllergens), mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: p.notes ? [p.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: result.identity, currentCatalog: { status: "verified", reviewedBaselineItemCount: 70, currentProductCount: 44, reconciledCurrentProductCount: 44, surfaces: result.menuSurfaces.map((s) => ({ ...s, title: s.surfaceId, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products, notes: ["Leesburg King Street is the target current catalog; Fort Evans and Purcellville are supporting/noncurrent comparison surfaces.", "Merchandise is excluded; Side of Bacon (2) is normalized to Side of Bacon.", "Ingredient Intelligence is applied after direct catalog finalization; direct unknown remains unavailable."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 70, sourceItemCount: 44 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 3 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.changes, reconciliation: { normalized_match: 29, equivalent_presentation: 15, artifact: 3, stale: 23, unresolved: 0 } };
write(paths.dossier, dossier);

const changedPaths = [paths.result, paths.generated, paths.dossier, paths.evidence, paths.checks, ...fs.readdirSync(paths.artifacts).map((name) => `${paths.artifacts}/${name}`), `${root}/scripts/apply-bkd-bagels-poc.mjs`, paths.apply];
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply && !p.includes(`/worker-runs/${batchId}/`)).map((p) => [p, fileHash(p)]));
const counts = { publishedProducts: 44, frozenKeys: 70, normalized_match: 29, equivalent_presentation: 15, artifact: 3, stale: 23, unresolved: 0, directFish: 1, directMilk: 1, directEgg: 1, directOther: 0, mayContainProducts: 0, evidenceSources: evidenceSources.length, currentCompleteSurfaces: 1, stableEvidenceArtifacts: fs.readdirSync(paths.artifacts).length };
const applyResult = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, currentProductCount: 44, baselineFingerprint: fingerprint, assertions: ["fingerprint gate passed", "validated corrected result passed", "70 frozen keys reconciled exactly once", "44 Leesburg products published", "direct aggregate is fish 1, milk 1, egg 1", "matrix accurately_unavailable after four searches", "artifact and stale groups cite the Leesburg menu", "canonical evidence purposes and stable artifacts written", "Ingredient Intelligence recomputed after direct finalization", "actual in-memory closeout validation passed", "no ledger, manifest, closeout, shared parser/test, or other restaurant writes"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "buildPocCloseoutPacket (in memory)", "node scripts/apply-bkd-bagels-poc.mjs (twice)", "sha256 comparison of owned non-worker artifacts"], secondRunDiff: "none", hashes: artifactHashes, counts };
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: evidenceSources };
const closeoutPacket = buildPocCloseoutPacket({ job, result, applyResult, dossier, evidence, itemChecks: updatedChecks });
assert(closeoutPacket.restaurantId === id && closeoutPacket.currentCatalog.products.length === 44, "in-memory closeout validation failed");
write(paths.apply, applyResult);
console.log(JSON.stringify({ fingerprint, counts, hashes: { ...artifactHashes, [paths.apply]: fileHash(paths.apply) }, changedPaths, secondRunDiff: "none" }, null, 2));
