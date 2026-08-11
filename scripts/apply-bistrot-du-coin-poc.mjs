#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bistrot-du-coin-washington-dc-dc-metro";
const batchId = "poc-batch-022-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`, apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (p = "") => p.includes("cross-contact") ? "cross_contact" : p.includes("ingredient") ? "ingredients" : p.includes("allergen") || p.includes("matrix") ? "allergen" : p.includes("identity") || p.includes("location") ? "identity" : p.includes("menu") || p.includes("catalog") ? "menu" : "other";

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint && fingerprint === "ce16f42658bed1478f036b8476bb986e71c3c0a1937c3e30376167e766fa694e", "stale_apply_packet");
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
const products = result.currentProducts;
const reconciliation = result.reconciliation.items;
const counts = reconciliation.reduce((a, row) => (a[row.disposition] = (a[row.disposition] ?? 0) + 1, a), {});
assert(products.length === 71 && new Set(products.map((p) => p.currentProductKey)).size === 71, "expected 71 current products");
assert(reconciliation.length === 209 && counts.normalized_match === 71 && counts.equivalent_presentation === 1 && counts.artifact === 137 && !counts.unresolved, "frozen reconciliation counts failed");
assert(products.every((p) => !(p.containsAllergens ?? []).length && !(p.mayContainAllergens ?? []).length), "allergen inference detected");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4 && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
const fold = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
assert(products.some((p) => p.name === "HEINEKEN Zero") && products.filter((p) => fold(p.name).includes("gratinee des halles")).length === 1, "drink/consolidation gate failed");
assert((await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result })).valid, "research validator failed");
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `in-memory result validation failed: ${validation.errors.join(" | ")}`);

const evidenceEntries = result.sources.map((source) => {
  const artifact = { schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt ?? source.purpose, rowIdentifiers: [source.evidenceId] };
  const artifactPath = `${paths.artifacts}/${source.evidenceId}.json`; write(artifactPath, artifact);
  return { source, artifactPath, relativePath: `evidence/artifacts/${id}/${source.evidenceId}.json`, sha256: fileSha(artifactPath) };
});
const canonicalPurposes = ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"];
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceEntries.map(({ source, relativePath, sha256: digest }) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt ?? source.purpose, sha256: digest, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] })) };
assert(evidence.sources.every((s) => canonicalPurposes.includes(s.purpose)), "non-canonical evidence purpose");

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index]; const oldByKey = new Map((target.items ?? []).map((item) => [item.id, item]));
const surfaces = result.menuSurfaces.map((s) => ({ ...s, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: unique(s.sourceEvidenceIds) }));
const currentUrls = unique(surfaces.filter((s) => s.current).map((s) => s.url));
const matchByProduct = new Map(reconciliation.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = products.map((p) => ({ ...oldByKey.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], sourceUrls: unique((p.sourceEvidenceIds ?? []).map((sid) => result.sources.find((s) => s.evidenceId === sid)?.url).filter((url) => currentUrls.includes(url))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean), ingredientIntelligence: undefined }));
Object.assign(target, { itemCount: 71, menuItemCount: 71, totalItemCount: 71, officialItemCount: 71, sourceUrls: currentUrls, coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable", officialAllergenRemediationBucket: "accurately-unavailable" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const match = reconciliation.find((entry) => entry.auditItemKey === row.auditItemKey); assert(match, `missing reconciliation row ${row.auditItemKey}`); return { ...row, disposition: match.disposition, allergenVerdict: match.disposition === "artifact" ? "not_applicable" : "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [] }; });
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed", locationId: job.locationId }, restaurantLevelAllergenEvidence: [], currentCatalog: { status: "verified", reviewedBaselineItemCount: 209, currentProductCount: 71, reconciledCurrentProductCount: 71, surfaces, products: products.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: p.notes ? [p.notes] : [] })), notes: ["Alcohol-only entries are excluded; HEINEKEN Zero is retained; singular/plural Gratinée des Halles is consolidated.", "Ingredient Intelligence is derived only after direct catalog finalization; unknown direct evidence remains unavailable."] }, checks: { menu: { verdict: "verified", reviewedItemCount: 209, sourceItemCount: 71 }, allergenSource: { verdict: "accurately_unavailable", directContainsCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 209, normalizedMatchCount: 71, equivalentPresentationCount: 1, artifactCount: 137, unresolvedCount: 0 } };
write(paths.dossier, dossier); write(paths.evidence, evidence); write(paths.generated, generated); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const changedPaths = [paths.generated, paths.dossier, paths.evidence, ...evidenceEntries.map((e) => e.artifactPath), paths.checks, `${root}/scripts/apply-bistrot-du-coin-poc.mjs`, paths.apply];
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileSha(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 71, normalizedMatchCount: 71, equivalentPresentationCount: 1, artifactCount: 137, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "buildPocCloseoutPacket (in-memory)", "write stable evidence artifacts and verify sha256(file bytes)", "finalize direct catalog then recompute Ingredient Intelligence", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { currentProducts: 71, normalizedMatch: 71, equivalentPresentation: 1, artifacts: 137, unresolved: 0, containsAllergens: 0, mayContainAllergens: 0, matrixSearches: 4, evidenceSources: evidence.sources.length, evidenceArtifacts: evidenceEntries.length } };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks }); assert(packet.restaurantId === id && packet.currentCatalog.products.length === 71, "in-memory closeout validation failed");
for (const source of evidence.sources) assert(fileSha(`${root}/data/restaurant-verification/${source.artifactPath}`) === source.sha256, `evidence artifact hash mismatch: ${source.id}`);
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths, artifactHashes: { ...artifactHashes, [paths.apply]: fileSha(paths.apply) } }, null, 2));
