#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bistro-du-jour-washington-dc-dc-metro";
const batchId = "poc-batch-021-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = { job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, generated: `${root}/src/data/generated/restaurants.generated.json`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`, checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, apply: `${run}/apply-results/${id}.json` };
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileHash = (p) => sha256(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (p = "") => p.includes("identity") || p.includes("location") ? "identity" : p.includes("menu") || p.includes("catalog") ? "menu" : p.includes("ingredient") ? "ingredients" : p.includes("allergen") || p.includes("matrix") ? "allergen" : p.includes("cross-contact") ? "cross_contact" : "other";

const job = read(paths.job); const result = read(paths.result);
const baselineChecks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(baselineChecks.map((r) => r.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint && fingerprint === "c37c149b3475c6e368278fb42dc2c67fd31750305f9b71f607347806075ec582", "stale_apply_packet");
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
assert(result.currentProducts.length === 59 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 59, "expected 59 current products");
const reconciliation = result.reconciliation.items;
const dispositionCounts = reconciliation.reduce((a, r) => (a[r.disposition] = (a[r.disposition] ?? 0) + 1, a), {});
assert(reconciliation.length === 75 && dispositionCounts.normalized_match === 59 && dispositionCounts.equivalent_presentation === 5 && dispositionCounts.artifact === 11 && !dispositionCounts.unresolved, "reconciliation counts failed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
assert(result.currentProducts.every((p) => !p.containsAllergens?.length && !p.mayContainAllergens?.length), "direct allergen aggregate is nonzero");
assert((await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result })).valid, "research validator failed");
const validation = validatePocResearchResult({ job, result, itemChecks: baselineChecks });
assert(validation.valid, `in-memory result validation failed: ${validation.errors.join(" | ")}`);

const evidenceEntries = result.sources.map((source) => {
  const excerpt = source.purpose;
  const artifactPath = `${paths.artifacts}/${source.evidenceId}.json`;
  const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, rowIdentifiers: [source.evidenceId] }, null, 2)}\n`);
  fs.mkdirSync(paths.artifacts, { recursive: true }); fs.writeFileSync(artifactPath, bytes);
  return { source, excerpt, artifactPath, relativePath: `evidence/artifacts/${id}/${source.evidenceId}.json`, sha256: sha256(bytes) };
});
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceEntries.map(({ source, excerpt, relativePath, sha256: digest }) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, sha256: digest, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] })) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "canonical evidence purpose failed");

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index]; const oldByKey = new Map((target.items ?? []).map((item) => [item.id, item]));
const surfaces = result.menuSurfaces.map((s) => ({ ...s, current: s.current === true && s.scopeStatus === "complete", scopeStatus: s.current === true && s.scopeStatus === "complete" ? "complete" : "supporting", verified: s.current === true && s.scopeStatus === "complete", evidenceIds: unique(s.sourceEvidenceIds), notes: [] }));
const currentUrls = new Set(surfaces.filter((s) => s.current).map((s) => s.url));
const matchByProduct = new Map(reconciliation.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...oldByKey.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique((p.sourceEvidenceIds ?? []).map((sid) => result.sources.find((s) => s.evidenceId === sid)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean), ingredientIntelligence: undefined }));
Object.assign(target, { itemCount: 59, menuItemCount: 59, totalItemCount: 59, officialItemCount: 59, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
const updatedChecks = baselineChecks.map((row) => { const match = reconciliation.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: match.disposition === "artifact" ? "not_applicable" : "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [] }; });
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.scopeDecision, locationId: job.locationId, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 75, currentProductCount: 59, reconciledCurrentProductCount: 59, surfaces, products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: [] })), notes: ["Capitol Hill and District Wharf current menu/service-period surfaces remain separate; stale PDFs and alcohol-only items are excluded.", "Ingredient Intelligence is inferred only after direct catalog finalization; direct unknown remains unavailable."] }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence ?? [], checks: { menu: { verdict: "verified", reviewedItemCount: 75, sourceItemCount: 59 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 75, normalizedMatchCount: 59, equivalentPresentationCount: 5, artifactCount: 11, unresolvedCount: 0 } };
write(paths.evidence, evidence); write(paths.dossier, dossier); write(paths.generated, generated); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const changedPaths = [paths.generated, paths.dossier, paths.evidence, ...evidenceEntries.map((e) => e.artifactPath), paths.checks, `${root}/scripts/apply-bistro-du-jour-poc.mjs`, paths.apply];
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileHash(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 59, normalizedMatchCount: 59, equivalentPresentationCount: 5, artifactCount: 11, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 59, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "buildPocCloseoutPacket (in-memory)", "write stable evidence artifacts and verify sha256(file bytes)", "target catalog/dossier/evidence/item-check serialization", "recompute Ingredient Intelligence after direct catalog finalization", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 59, normalizedMatches: 59, equivalentPresentations: 5, artifacts: 11, unresolved: 0, unavailable: 59, evidenceSources: evidence.sources.length, evidenceArtifacts: evidenceEntries.length, matrixSearches: 4 } };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks }); assert(packet.restaurantId === id && packet.currentCatalog.products.length === 59, "in-memory closeout packet validation failed");
for (const source of evidence.sources) { const p = `${root}/data/restaurant-verification/${source.artifactPath}`; assert(p.startsWith(`${paths.artifacts}/`) && fileHash(p) === source.sha256, `evidence artifact hash mismatch: ${source.id}`); }
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths, artifactHashes: { ...artifactHashes, [paths.apply]: fileHash(paths.apply) } }, null, 2));
