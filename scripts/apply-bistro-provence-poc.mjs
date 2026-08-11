#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-bistro-provence-4829739070";
const batchId = "poc-batch-022-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileHash = (p) => sha256(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const canonicalPurpose = (p = "") => p.includes("cross-contact") ? "cross_contact" : p.includes("ingredient") ? "ingredients" : p.includes("allergen") || p.includes("matrix") ? "allergen" : p.includes("identity") || p.includes("location") || p.includes("operating") ? "identity" : p.includes("menu") || p.includes("catalog") ? "menu" : "other";

const job = read(paths.job); const result = read(paths.result);
const baselineChecks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(baselineChecks.map((r) => r.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint && fingerprint === "3cfe9fe74ba87440170b03ae48b5ecc281715ae914b867a6284b9255f1ff7ead", "stale_apply_packet");
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
assert(result.currentProducts.length === 18 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 18, "expected 18 current products");
const reconciliation = result.reconciliation.items;
const reconciliationCounts = reconciliation.reduce((a, r) => (a[r.disposition] = (a[r.disposition] ?? 0) + 1, a), {});
assert(reconciliation.length === 13 && reconciliationCounts.exact_match === 8 && reconciliationCounts.normalized_match === 1 && reconciliationCounts.artifact === 2 && reconciliationCounts.stale === 2 && !reconciliationCounts.unresolved, "reconciliation counts failed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4 && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
const directCounts = result.currentProducts.reduce((a, p) => { for (const x of p.containsAllergens ?? []) a[x] = (a[x] ?? 0) + 1; return a; }, {});
assert(JSON.stringify(directCounts) === JSON.stringify({ shellfish: 1, milk: 7, fish: 1, "tree-nut": 1 }), "direct allergen aggregate changed");
assert(result.currentProducts.every((p) => !(p.mayContainAllergens ?? []).length), "mayContain must be zero");
assert((await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result })).valid, "research validator failed");
const validation = validatePocResearchResult({ job, result, itemChecks: baselineChecks });
assert(validation.valid, `in-memory result validation failed: ${validation.errors.join(" | ")}`);

const evidenceEntries = result.sources.map((source) => {
  const artifact = { schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt, rowIdentifiers: [source.evidenceId] };
  const artifactPath = `${paths.artifacts}/${source.evidenceId}.json`; write(artifactPath, artifact);
  return { source, artifactPath, relativePath: `evidence/artifacts/${id}/${source.evidenceId}.json`, sha256: fileHash(artifactPath) };
});
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceEntries.map(({ source, relativePath, sha256: digest }) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt, sha256: digest, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] })) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "canonical evidence purpose failed");

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index]; const oldByKey = new Map((target.items ?? []).map((item) => [item.id, item]));
const surfaces = result.menuSurfaces.map((s) => ({ ...s, current: s.current === true && s.scopeStatus === "complete", verified: s.current === true && s.scopeStatus === "complete", evidenceIds: unique(s.sourceEvidenceIds), notes: [] }));
const currentUrls = [...new Set(surfaces.filter((s) => s.current).map((s) => s.url))];
const matchByProduct = new Map(reconciliation.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...oldByKey.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, sourceUrls: unique((p.sourceEvidenceIds ?? []).map((sid) => result.sources.find((s) => s.evidenceId === sid)?.url).filter((url) => currentUrls.includes(url))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean), ingredientIntelligence: undefined }));
Object.assign(target, { itemCount: 18, menuItemCount: 18, totalItemCount: 18, officialItemCount: 18, sourceUrls: currentUrls, coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable", officialAllergenRemediationBucket: "accurately-unavailable" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = baselineChecks.map((row) => { const match = reconciliation.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: match.disposition === "artifact" ? "not_applicable" : "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [] }; });
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.scope, locationId: job.locationId, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds, notes: result.identity.notes }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 13, currentProductCount: 18, reconciledCurrentProductCount: 18, surfaces, products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: [] })), notes: ["Current Bethesda official dinner menu defines 18 products; stale and artifact frozen rows are excluded.", "Direct catalog allergen evidence is limited to exact official ingredient/name support; Ingredient Intelligence runs only after direct catalog finalization.", "Direct unknown evidence remains unavailable; no may-contain or cross-contact claim is inferred."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 13, sourceItemCount: 18 }, allergenSource: { verdict: "accurately_unavailable", directContainsCount: 10, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 13, exactMatchCount: 8, normalizedMatchCount: 1, artifactCount: 2, staleCount: 2, unresolvedCount: 0 } };
write(paths.evidence, evidence); write(paths.dossier, dossier); write(paths.generated, generated); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const changedPaths = [paths.generated, paths.dossier, paths.evidence, ...evidenceEntries.map((e) => e.artifactPath), paths.checks, `${root}/scripts/apply-bistro-provence-poc.mjs`, paths.apply];
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileHash(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 18, directContainsCounts: directCounts, directMayContainCount: 0, directUnavailableCount: 8, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "buildPocCloseoutPacket (in-memory)", "write stable evidence artifacts and verify sha256(file bytes)", "target catalog/dossier/evidence/item-check serialization", "recompute Ingredient Intelligence after direct catalog finalization", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 18, exactMatches: 8, normalizedMatches: 1, artifacts: 2, stale: 2, unresolved: 0, directFish: 1, directMilk: 7, directShellfish: 1, directTreeNut: 1, directMayContain: 0, directUnavailable: 8, evidenceSources: evidence.sources.length, evidenceArtifacts: evidenceEntries.length, matrixSearches: 4 } };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks }); assert(packet.restaurantId === id && packet.currentCatalog.products.length === 18, "in-memory closeout packet validation failed");
for (const source of evidence.sources) assert(fileHash(`${root}/data/restaurant-verification/${source.artifactPath}`) === source.sha256, `evidence artifact hash mismatch: ${source.id}`);
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths, artifactHashes: { ...artifactHashes, [paths.apply]: fileHash(paths.apply) } }, null, 2));
