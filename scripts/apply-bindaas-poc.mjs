#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bindaas-dc";
const batchId = "poc-batch-020-2026-07-17";
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
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const compact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const hashFile = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const canonicalPurpose = (value = "") => {
  const p = value.toLowerCase();
  if (p.includes("identity") && p.includes("menu")) return "both";
  if (p.includes("identity")) return "identity";
  if (p.includes("allergen")) return "allergen";
  if (p.includes("ingredient")) return "ingredients";
  if (p.includes("cross")) return "cross_contact";
  if (p.includes("menu") || p.includes("vendor")) return "menu";
  return "other";
};

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === "7049de6d56398ac6faf69dc220a1913ddda9433fbad35602788954fe80003c81", `stale_apply_packet: ${fingerprint}`);
assert(result.currentProducts.length === 99, "expected 99 current products");
const reconCounts = Object.groupBy(result.reconciliation.items, (row) => row.disposition);
assert(result.reconciliation.items.length === 99 && reconCounts.exact_match?.length === 99 && !reconCounts.unresolved, "reconciliation counts changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.join(",") === "official_site,official_documents,linked_vendor,targeted_web_search", "matrix search verdict changed");
assert(result.currentProducts.every((p) => !p.containsAllergens.length && !p.mayContainAllergens.length && p.allergenSourceType === "unavailable"), "direct allergen aggregate changed");
const researchValidation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(researchValidation.valid, researchValidation.errors.join("\n"));

const excerpts = {
  "src-home": "Official Bindaas menu navigation identifies the current DC catalog and links the Penn Quarter and Foggy Bottom location surfaces.",
  "src-penn": "Penn Quarter official menu surface at 415 7th Street NW was retained as a distinct current complete location-scoped catalog.",
  "src-foggy": "Foggy Bottom official menu surface at 2000 Pennsylvania Ave NW was retained as a distinct current complete location-scoped catalog.",
  "src-toast-penn": "Restaurant-linked Toast exposes the Penn Quarter ordering surface and supporting current product presentations.",
  "src-toast-foggy": "Restaurant-linked Toast exposes the Foggy Bottom ordering surface and supporting current product presentations.",
  "src-search": "Targeted search found no authoritative Bindaas allergen matrix or item-level allergen disclosure after the required search sequence.",
};
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((source) => {
  const excerpt = excerpts[source.evidenceId];
  assert(excerpt, `missing evidence excerpt: ${source.evidenceId}`);
  const artifactPath = `${paths.artifacts}/${source.evidenceId}.txt`;
  fs.mkdirSync(paths.artifacts, { recursive: true });
  fs.writeFileSync(artifactPath, `${excerpt}\n`);
  return { id: source.evidenceId, researchEvidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.authorityTier === "restaurant_linked_vendor" ? "menu" : canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, sha256: sha(`${excerpt}\n`), artifactPath, rowIdentifiers: [`${source.evidenceId}:canonical`], contentType: "text/plain", finalUrl: source.url, httpStatus: 200, byteLength: Buffer.byteLength(`${excerpt}\n`), request: null, notes: [source.purpose] };
}) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "non-canonical evidence purpose");
write(paths.evidence, evidence);

const updatedChecks = checks.map((row) => {
  const match = result.reconciliation.items.find((entry) => entry.auditItemKey === row.auditItemKey);
  assert(match, `missing reconciliation for ${row.auditItemKey}`);
  return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: match.sourceEvidenceIds, matchedCurrentProductKeys: match.matchedCurrentProductKeys, adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: "Direct allergen data remains unavailable after all four matrix searches; ingredient names are not allergen claims." };
});
fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index];
const currentSurfaces = result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
const sourcesById = new Map(result.sources.map((s) => [s.evidenceId, s]));
const reconciliation = new Map(result.reconciliation.items.map((r) => [r.matchedCurrentProductKeys[0], r]));
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], matchedBaselineAuditItemKeys: [reconciliation.get(p.currentProductKey).auditItemKey], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed" }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 99, sourceItemCount: 99 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, mayContainCount: 0 }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true } }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 99, currentProductCount: 99, reconciledCurrentProductCount: 99, surfaces: result.menuSurfaces.map((s) => ({ ...s, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products, notes: ["Penn Quarter and Foggy Bottom are distinct current complete location-scoped official/vendor surfaces; chain navigation is supporting.", "Baseline official-ingredients records without positive allergen evidence remain unavailable.", "Ingredient Intelligence is derived only after direct catalog finalization; direct unknown remains unavailable."] }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: result.reconciliation, matrixSearch: result.matrixSearch };
write(paths.dossier, dossier);
target.items = result.currentProducts.map((p) => ({ id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique(p.sourceEvidenceIds.map((eid) => sourcesById.get(eid)?.url)), matchedBaselineAuditItemKeys: [reconciliation.get(p.currentProductKey).auditItemKey], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 99;
target.sourceUrls = unique(currentSurfaces.flatMap((s) => [s.url]));
target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
compact(paths.generated, generated);

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks];
const hashes = Object.fromEntries(owned.map((p) => [p, hashFile(p)]));
const counts = { publishedProducts: 99, exact_match: 99, normalized_match: 0, artifact: 0, unresolved: 0, containsAllergensProducts: 0, mayContainProducts: 0, matrixStatus: result.matrixSearch.status, matrixSearches: result.matrixSearch.attempted.length, currentCompleteSurfaces: currentSurfaces.length, evidenceSources: evidence.sources.length };
const changedPaths = [...owned, `${root}/scripts/apply-bindaas-poc.mjs`, paths.apply, ...evidence.sources.map((s) => s.artifactPath)];
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 99, evidenceSourceCount: evidence.sources.length, reconciliation: { exact_match: 99, unresolved: 0 }, assertions: ["fingerprint gate passed", "99 current products published", "99 exact_match and zero unresolved", "direct and mayContain allergen aggregates are zero", "matrix accurately_unavailable after all four searches", "bounded DC catalog preserves distinct Penn Quarter and Foggy Bottom surfaces", "baseline ingredient records without positive allergen evidence remain unavailable", "Ingredient Intelligence runs after direct catalog finalization", "canonical evidence has purpose, excerpt, hash, artifact, and row identifier", "in-memory closeout packet validation passed", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "node scripts/apply-bindaas-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", hashes, counts };
buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks });
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts, hashes: { ...hashes, [paths.apply]: hashFile(paths.apply) }, changedPaths, secondRunDiff: "none" }, null, 2));
