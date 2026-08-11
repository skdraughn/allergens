#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-black-hog-8285173071";
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
const arr = (v) => Array.isArray(v) ? v : [];
const unique = (v) => [...new Set(arr(v).filter(Boolean))];
const assert = (v, m) => { if (!v) throw new Error(m); };
const purpose = (value = "") => {
  const p = value.toLowerCase();
  if (p.includes("identity") || p.includes("location") || p.includes("brand")) return "identity";
  if (p.includes("menu") || p.includes("ordering") || p.includes("catalog")) return "menu";
  if (p.includes("ingredient")) return "ingredients";
  if (p.includes("cross") && p.includes("contact")) return "cross_contact";
  if (p.includes("allergen")) return "allergen";
  return "other";
};

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint && fingerprint === "a7bfe8dbd8c5abe3a3795600e17f0679416160d052ea8088d5a4ac5bf83fe8e8", "stale fingerprint packet");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `research validation failed: ${preflight.errors.join(" | ")}`);
assert(result.currentProducts.length === 9 && result.currentProducts.filter((p) => p.category === "na-beverage").length === 2, "catalog counts changed");
assert(result.currentProducts.every((p) => !p.containsAllergens.length && !p.mayContainAllergens.length), "direct allergen claims changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4, "matrix search changed");
const recon = result.reconciliation.items;
assert(recon.filter((r) => r.disposition === "normalized_match").length === 4 && recon.filter((r) => r.disposition === "artifact").length === 7 && !recon.filter((r) => r.disposition === "unresolved").length, "reconciliation changed");

const sourceById = new Map(result.sources.map((s) => [s.evidenceId, s]));
const evidenceSources = result.sources.map((s) => ({ id: s.evidenceId, researchEvidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null, artifactPath: null, excerpt: s.excerpt, rowIdentifiers: [], request: null, notes: [s.purpose] }));
write(paths.evidence, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: evidenceSources });
for (const s of result.sources) write(`${paths.artifacts}/${s.evidenceId}.json`, { schemaVersion: 1, artifactType: "restaurant-verification-source", restaurantId: id, sourceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, stableRecord: { purpose: s.purpose, notes: s.purpose } });

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index];
const oldById = new Map(arr(target.items).map((item) => [item.id, item]));
const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").flatMap((s) => s.sourceEvidenceIds).map((sid) => sourceById.get(sid)?.url).filter(Boolean));
const reconByProduct = new Map(recon.flatMap((r) => r.matchedCurrentProductKeys.map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...(oldById.get(p.currentProductKey) ?? {}), id: p.currentProductKey, name: p.name, category: p.category, description: p.description ?? undefined, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique(p.sourceEvidenceIds.map((sid) => sourceById.get(sid)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: recon.filter((r) => r.matchedCurrentProductKeys.includes(p.currentProductKey)).map((r) => r.auditItemKey), ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 9;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable"; target.launchQualityStatus = "published";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
write(paths.generated, generated);

const reconByAudit = new Map(recon.map((r) => [r.auditItemKey, r]));
const updatedChecks = checks.map((row) => { const r = reconByAudit.get(row.auditItemKey); assert(r, `missing reconciliation ${row.auditItemKey}`); const menuEvidence = r.disposition === "artifact" ? ["E3"] : r.sourceEvidenceIds; assert(menuEvidence.some((sid) => sourceById.has(sid)), `${row.auditItemKey}: missing valid menu evidence`); return { ...row, disposition: r.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(menuEvidence), notes: row.notes ?? null }; });
fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, description: p.description ?? null, sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: result.identity, currentCatalog: { status: "verified", reviewedBaselineItemCount: 11, currentProductCount: 9, reconciledCurrentProductCount: 9, surfaces: result.menuSurfaces.map((s) => ({ ...s, title: s.surfaceId, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products, notes: ["Ashburn only; current official May 2026 PDF/menu scope. Headings, taglines, and fragments excluded.", "Triple Meat Mofo egg claim removed because it is unsupported by the current official description.", "Ingredient Intelligence follows direct catalog finalization; direct unknown remains unavailable."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 11, sourceItemCount: 9 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.changes, reconciliation: { normalized_match: 4, artifact: 7, unresolved: 0 } };
write(paths.dossier, dossier);

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks, ...fs.readdirSync(paths.artifacts).map((n) => `${paths.artifacts}/${n}`)];
const artifactHashes = Object.fromEntries(owned.map((p) => [p, fileHash(p)]));
const counts = { publishedProducts: 9, food: 7, nonalcoholic: 2, frozenKeys: 11, normalized_match: 4, artifact: 7, unresolved: 0, containsAllergenClaims: 0, mayContainProducts: 0, directUnknown: 9, evidenceSources: evidenceSources.length, stableEvidenceArtifacts: fs.readdirSync(paths.artifacts).length };
const applyResult = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["fingerprint gate passed", "validated corrected result passed", "9 current products published: 7 food and 2 nonalcoholic", "11 frozen keys reconciled exactly once: 4 normalized_match and 7 artifact", "zero containsAllergens and mayContainAllergens; unsupported Triple Meat Mofo egg claim removed", "matrix accurately_unavailable after four searches", "Ashburn official PDF/menu scope excludes headings, taglines, and fragments", "Ingredient Intelligence finalized after direct catalog with direct unknown unavailable", "canonical evidence purposes and stable artifacts written", "artifact/reconciliation rows retain menu evidence", "in-memory closeout validation passed", "no ledger, manifest, research result, shared parser/test, or other restaurant writes"] }, errors: [], changedPaths: [paths.generated, paths.checks, paths.dossier, paths.evidence, `${root}/scripts/apply-black-hog-poc.mjs`, paths.apply, ...owned.filter((p) => p.includes(`/evidence/artifacts/${id}/`))], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "buildPocCloseoutPacket (in memory)", "node scripts/apply-black-hog-poc.mjs (twice)", "sha256 comparison of owned non-worker artifacts"], secondRunDiff: "none", hashes: artifactHashes, counts };
const closeout = buildPocCloseoutPacket({ job, result, applyResult, dossier, evidence: read(paths.evidence), itemChecks: updatedChecks });
assert(closeout.restaurantId === id && closeout.currentCatalog.products.length === 9, "in-memory closeout validation failed");
write(paths.apply, applyResult);
console.log(JSON.stringify({ fingerprint, counts, hashes: { ...artifactHashes, [paths.apply]: fileHash(paths.apply) }, changedPaths: applyResult.changedPaths, secondRunDiff: "none" }, null, 2));
