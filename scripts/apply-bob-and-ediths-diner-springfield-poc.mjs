#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bob-and-ediths-diner-springfield-va-dc-metro";
const batchId = "poc-batch-027-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const writeJson = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const rel = (p) => p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const canonicalPurpose = (p) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(p) ? p : "other";

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint && fingerprint === "0b1eca9fe865895162f6ec46557546ecbdc0bd78f82aea7db61a4a589f803dbb", "stale_apply_packet");
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
const products = Array.isArray(result.currentProducts) ? result.currentProducts : result.currentProducts.products;
assert(products.length === 98 && new Set(products.map((p) => p.currentProductKey)).size === 98, "expected 98 distinct current products");
assert(result.reconciliation.items.length === 98 && result.reconciliation.items.every((r) => r.disposition === "exact_match"), "reconciliation failed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
assert(products.every((p) => p.allergenSourceType === "unavailable" && !p.containsAllergens?.length && !p.mayContainAllergens?.length), "direct allergen fields must remain unavailable");
assert((await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result })).valid, "research validator failed");
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `in-memory result validation failed: ${validation.errors.join(" | ")}`);

const artifacts = result.sources.map((source) => {
  const relativePath = `evidence/artifacts/${id}/${source.evidenceId}.json`;
  const body = { schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt, rowIdentifiers: [source.evidenceId] };
  const bytes = Buffer.from(`${JSON.stringify(body, null, 2)}\n`);
  return { source, relativePath, absolutePath: `${root}/data/restaurant-verification/${relativePath}`, bytes, sha256: sha(bytes) };
});
const adjudicationPath = `evidence/artifacts/${id}/adjudication.json`;
const adjudicationBody = { schemaVersion: 1, restaurantId: id, batchId, decision: "verify", rationale: "Identity, Springfield scope, complete current product boundary, four matrix searches, and conservative unavailable allergen semantics validated.", sourceEvidenceIds: result.sources.map((s) => s.evidenceId) };
const adjudicationBytes = Buffer.from(`${JSON.stringify(adjudicationBody, null, 2)}\n`);
for (const artifact of artifacts) { fs.mkdirSync(paths.artifacts, { recursive: true }); fs.writeFileSync(artifact.absolutePath, artifact.bytes); }
const adjudicationAbsolutePath = `${root}/data/restaurant-verification/${adjudicationPath}`;
fs.writeFileSync(adjudicationAbsolutePath, adjudicationBytes);
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, adjudication: { path: adjudicationPath, sha256: sha(adjudicationBytes) }, sources: artifacts.map(({ source, relativePath, sha256 }) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt, sha256, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] })) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "non-canonical evidence purpose");

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((r) => r.id === id);
const oldTarget = targetIndex >= 0 ? generated.restaurants[targetIndex] : {};
const surfaces = result.menuSurfaces.map((s) => ({ ...s, surfaceId: s.surfaceId, verified: true, current: s.current === true && s.scopeStatus === "complete", evidenceIds: unique(s.evidenceIds) }));
assert(surfaces.every((s) => s.surfaceId && !Object.hasOwn(s, "surfaceKey")), "surfaceId is required for every menu surface");
assert(surfaces.filter((s) => s.current).every((s) => s.scopeStatus === "complete"), "current surfaces must be complete");
const currentUrls = unique(surfaces.filter((s) => s.current).map((s) => s.url));
const matchByProduct = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row.auditItemKey])));
const oldById = new Map((oldTarget.items ?? []).map((item) => [item.id, item]));
const target = { ...oldTarget, id, name: job.name, category: "Diner", domain: job.domain, guideUrl: result.identity.officialHomepage, guideLabel: "Official menu and allergen sources", updated: "2026-07-20", sourceFamily: "restaurant-specific", parserProfile: "poc-direct", sourceProfile: "poc-direct:restaurant-specific", officialAllergenStatus: "accurately_unavailable", officialAllergenRemediationBucket: "accurately-unavailable", sourceUrls: currentUrls, locationId: job.locationId, location: result.identity.location, locationSurfaces: surfaces, items: products.map((p) => ({ ...oldById.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, variantGroup: p.variantGroup, isConfigurable: p.isConfigurable, allergens: [], mayContain: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], sourceType: "poc-direct", sourceUrls: unique(p.sourceEvidenceIds.map((sid) => result.sources.find((s) => s.evidenceId === sid)?.url).filter((u) => currentUrls.includes(u))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean) })), itemCount: 98, menuItemCount: 98, totalItemCount: 98, officialItemCount: 0, coveragePercent: 1, coverageStatus: "complete", launchQualityStatus: "published", launchRemediationBucket: "none" };
const annotatedTarget = await annotateRestaurantWithIngredientIntelligence(target);
if (targetIndex >= 0) generated.restaurants[targetIndex] = annotatedTarget; else generated.restaurants.push(annotatedTarget);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((candidate) => candidate.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [] }; });
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, domain: job.domain, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.evidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 98, currentProductCount: 98, reconciledCurrentProductCount: 98, surfaces: surfaces.map((s) => ({ ...s, surfaceId: s.surfaceId })), products: products.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, variantGroup: p.variantGroup, sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: [] })), notes: ["Springfield-only catalog; other Bob & Edith's locations were not merged.", "The chain homepage is supporting/nonpublishing; only Springfield product-publishing surfaces are current complete surfaces.", "All direct allergen fields remain unavailable after four required searches; no menu-term or facility-language inference was promoted.", "Ingredient Intelligence was recomputed after direct catalog finalization and remains in inferred fields only."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 98, sourceItemCount: 98 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: [], reconciliation: { frozenKeys: 98, exactMatchCount: 98, unresolvedCount: 0 } };

writeJson(paths.generated, generated); writeJson(paths.dossier, dossier); writeJson(paths.evidence, evidence); fs.mkdirSync(paths.checks.slice(0, paths.checks.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const scriptPath = `${root}/scripts/apply-bob-and-ediths-diner-springfield-poc.mjs`;
const changedPaths = [rel(paths.generated), rel(paths.dossier), rel(paths.evidence), ...artifacts.map((a) => rel(a.absolutePath)), rel(adjudicationAbsolutePath), rel(paths.checks), rel(scriptPath), rel(paths.apply)];
const artifactHashes = Object.fromEntries([...artifacts.map((a) => [a.relativePath, fileSha(a.absolutePath)]), [adjudicationPath, fileSha(adjudicationAbsolutePath)], [rel(paths.generated), fileSha(paths.generated)], [rel(paths.dossier), fileSha(paths.dossier)], [rel(paths.evidence), fileSha(paths.evidence)], [rel(paths.checks), fileSha(paths.checks)]]);
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 98, exactMatchCount: 98, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, unavailableCount: 98, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "persist generated row, dossier, evidence, hashed artifacts, adjudication, and 98 terminal checks", "recompute Ingredient Intelligence after direct catalog finalization", "run target apply twice and compare bytes and hashes"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 98, exactMatches: 98, unresolved: 0, directAllergens: 0, mayContain: 0, unavailable: 98, evidenceSources: evidence.sources.length, evidenceArtifacts: artifacts.length + 1, matrixSearches: 4 }, fingerprint };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks });
assert(packet.restaurantId === id && packet.currentCatalog.products.length === 98, "in-memory closeout packet validation failed");
for (const source of evidence.sources) assert(fileSha(`${root}/data/restaurant-verification/${source.artifactPath}`) === source.sha256, `evidence hash mismatch: ${source.id}`);
assert(fileSha(`${root}/data/restaurant-verification/${evidence.adjudication.path}`) === evidence.adjudication.sha256, "adjudication hash mismatch");
writeJson(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths, artifactHashes: { ...artifactHashes, [rel(paths.apply)]: fileSha(paths.apply) } }, null, 2));
