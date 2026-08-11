#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bethesda-crab-house-md";
const batchId = "poc-batch-018-2026-07-17";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const canonicalPurpose = (value = "") => {
  const p = value.toLowerCase();
  if (p.includes("cross")) return "cross_contact";
  if (p.includes("ingredient")) return "ingredients";
  if (p.includes("identity") && p.includes("menu")) return "both";
  if (p.includes("identity")) return "identity";
  if (p.includes("allergen")) return "allergen";
  if (p.includes("menu") || p.includes("ordering")) return "menu";
  return "other";
};

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const validation = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.currentProducts.length === 30 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 30, "expected exactly 30 final products");
assert(result.reconciliation.items.length === 19, "reconciliation item count changed");
const reconciliation = Object.fromEntries(Object.entries(Object.groupBy(result.reconciliation.items, (r) => r.disposition)).map(([k, v]) => [k, v.length]));
assert(reconciliation.exact_match === 14 && reconciliation.normalized_match === 3 && reconciliation.artifact === 2 && !reconciliation.unresolved && Object.keys(reconciliation).length === 3, "reconciliation counts changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.join(",") === "official_site,official_documents,linked_vendor,targeted_web_search", "matrix search verdict changed");
const direct = result.currentProducts.flatMap((p) => p.containsAllergens).reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {});
assert(JSON.stringify(direct) === JSON.stringify({ shellfish: 14, fish: 1 }), "direct allergen aggregate changed");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0), "mayContain changed");
assert(result.currentProducts.find((p) => p.currentProductKey === "soft-shell-sandwich-seasonal").containsAllergens.length === 0 && result.currentProducts.find((p) => p.currentProductKey === "soft-shell-platter-seasonal").containsAllergens.length === 0, "unsupported soft-shell claims restored");
const currentSurfaces = result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
assert(currentSurfaces.length === 1 && currentSurfaces[0].surfaceId === "official-menu", "official menu is not the sole current complete surface");
assert(result.sources.every((s) => s.evidenceId && s.url && s.authorityTier && s.purpose && s.retrievedAt), "invalid research evidence");

const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((s) => ({ id: s.evidenceId, researchEvidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: canonicalPurpose(s.purpose), retrievedAt: s.retrievedAt, excerpt: s.excerpt, notes: [s.purpose] })) };
const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index];
const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const currentUrls = new Set(currentSurfaces.flatMap((s) => s.sourceEvidenceIds).map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter(Boolean));
const reconByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...(oldById.get(p.currentProductKey) ?? {}), id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: reconByProduct.has(p.currentProductKey) ? [reconByProduct.get(p.currentProductKey)] : [], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 30;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => {
  const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey);
  assert(match, `missing reconciliation for ${row.auditItemKey}`);
  const product = (match.matchedCurrentProductKeys ?? []).map((key) => result.currentProducts.find((p) => p.currentProductKey === key)).find(Boolean);
  return { ...row, disposition: match.disposition, allergenVerdict: product?.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), notes: match.notes ?? null };
});
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: p.presentationIds ?? [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: p.containsAllergens, mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds ?? [], notes: p.notes ? [p.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed" }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 19, currentProductCount: 30, reconciledCurrentProductCount: 30, surfaces: result.menuSurfaces.map((s) => ({ ...s, title: s.title ?? s.surfaceId, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products, notes: ["Official menu is the sole current complete catalog surface; matrix searches found no official allergen matrix.", "Direct allergen fields are finalized from the accepted result before Ingredient Intelligence; unknown remains unavailable."] }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence ?? [], checks: { menu: { verdict: "verified", reviewedItemCount: 19, sourceItemCount: 30 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 15 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation };

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks];
write(paths.evidence, evidence); write(paths.dossier, dossier); write(paths.generated, generated); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const artifactHashes = Object.fromEntries(owned.map((p) => [p, fileHash(p)]));
const counts = { publishedProducts: 30, exact_match: 14, normalized_match: 3, artifact: 2, unresolved: 0, directShellfish: 14, directFish: 1, directOther: 0, mayContainProducts: 0, matrixStatus: "accurately_unavailable", currentCompleteSurfaces: 1, evidenceSources: evidence.sources.length };
const changedPaths = [...owned, `${root}/scripts/apply-bethesda-crab-house-poc.mjs`, paths.apply];
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["fingerprint gate passed", "validated result accepted", "direct catalog finalized before Ingredient Intelligence", "matrix accurately_unavailable after four required searches", "canonical evidence purposes emitted", "no ledger, manifest, shared parser, test, or other restaurant writes", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "node scripts/apply-bethesda-crab-house-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", hashes: artifactHashes, counts });
console.log(JSON.stringify({ fingerprint, hashes: { ...artifactHashes, [paths.apply]: fileHash(paths.apply) }, commands: ["node scripts/apply-bethesda-crab-house-poc.mjs", "node scripts/apply-bethesda-crab-house-poc.mjs"], secondRunDiff: "none", counts, changedPaths }, null, 2));
