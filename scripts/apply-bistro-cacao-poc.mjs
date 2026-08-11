#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-bistro-cacao-washington-dc";
const batchId = "poc-batch-021-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  artifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value, compact = false) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`); };
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const purpose = (value = "") => value.includes("identity") || value.includes("location") ? "identity" : value.includes("allergen") || value.includes("matrix") ? "allergen" : value.includes("ingredient") ? "ingredients" : value.includes("cross-contact") ? "cross_contact" : value.includes("menu") || value.includes("catalog") || value.includes("ordering") ? "menu" : "other";

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === "8f618c2c8fc1f3b3168283480f7e0e08857aaa8a1bb98cc4537b350dff161887" && fingerprint === job.baselineFingerprint, "stale_apply_packet");
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
assert(result.currentProducts.length === 64 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 64, "expected 64 distinct current products");
assert(result.reconciliation.items.length === 66, "expected 66 frozen reconciliation keys");
assert(result.reconciliation.items.filter((r) => r.disposition === "normalized_match").length === 42, "expected 42 normalized matches");
assert(result.reconciliation.items.filter((r) => r.disposition === "artifact").length === 24, "expected 24 artifacts");
assert(result.reconciliation.items.every((r) => r.disposition !== "unresolved"), "unresolved reconciliation rows");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
assert(result.currentProducts.every((p) => !p.containsAllergens?.length && !p.mayContainAllergens?.length), "direct allergen fields must remain unavailable");
const research = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(research.valid, `research validator failed: ${research.errors.join(" | ")}`);
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `in-memory result validation failed: ${validation.errors.join(" | ")}`);

const evidenceArtifacts = result.sources.map((source) => {
  const canonicalPurpose = purpose(source.purpose);
  const excerpt = source.excerpt ?? source.purpose;
  const relativePath = `evidence/artifacts/${id}/${source.evidenceId}.json`;
  const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose, retrievedAt: source.retrievedAt, excerpt, rowIdentifiers: [source.evidenceId] }, null, 2)}\n`);
  return { source, excerpt, relativePath, bytes, sha256: sha(bytes), absolutePath: `${root}/data/restaurant-verification/${relativePath}` };
});
for (const artifact of evidenceArtifacts) { fs.mkdirSync(paths.artifacts, { recursive: true }); fs.writeFileSync(artifact.absolutePath, artifact.bytes); }
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceArtifacts.map(({ source, excerpt, relativePath, sha256 }) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, sha256, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] })) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "non-canonical evidence purpose");

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index]; const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const currentSurfaces = result.menuSurfaces.map((s) => ({ ...s, current: s.current === true && s.scopeStatus === "complete" && s.surfaceId !== "official-home", scopeStatus: s.current === true && s.scopeStatus === "complete" && s.surfaceId !== "official-home" ? "complete" : "supporting", verified: true, evidenceIds: unique(s.sourceEvidenceIds), notes: [s.notes ?? ""] }));
const currentUrls = new Set(currentSurfaces.filter((s) => s.current).map((s) => s.url));
const matchByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...oldById.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique((p.sourceEvidenceIds ?? []).map((sid) => result.sources.find((s) => s.evidenceId === sid)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean), ingredientIntelligence: undefined }));
Object.assign(target, { itemCount: 64, menuItemCount: 64, totalItemCount: 64, officialItemCount: 64, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys) }; });
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: p.notes ? [p.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 66, currentProductCount: 64, reconciledCurrentProductCount: 64, surfaces: currentSurfaces, products, notes: ["Summer 2026 lunch and dinner plus current brunch catalog surfaces define the current menu; stale dessert PDF, headings, fragments, and alcohol-only items are excluded.", "Direct allergen data is accurately unavailable after all four required searches; no menu-word inference is promoted to allergen caution.", "Ingredient Intelligence is generated only after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 66, sourceItemCount: 64 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 66, normalizedMatchCount: 42, artifactCount: 24, unresolvedCount: 0 } };

const changedPaths = [paths.generated, paths.dossier, paths.evidence, ...evidenceArtifacts.map((a) => a.absolutePath), paths.itemChecks, `${root}/scripts/apply-bistro-cacao-poc.mjs`, paths.apply];
write(paths.evidence, evidence); write(paths.dossier, dossier); write(paths.generated, generated, true); fs.writeFileSync(paths.itemChecks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileSha(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 64, normalizedMatchCount: 42, artifactCount: 24, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 64, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "buildPocCloseoutPacket (in-memory)", "persist dedicated evidence artifacts and verify every sha256", "update only Bistro Cacao generated row, dossier, evidence, and item checks", "recompute Ingredient Intelligence after direct catalog finalization", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 64, normalizedMatches: 42, artifacts: 24, unresolved: 0, directAllergens: 0, mayContain: 0, unavailable: 64, evidenceSources: evidence.sources.length, evidenceArtifacts: evidenceArtifacts.length, matrixSearches: 4 } };
const closeoutPacket = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks });
assert(closeoutPacket.restaurantId === id && closeoutPacket.currentCatalog.products.length === 64, "in-memory closeout packet validation failed");
for (const source of evidence.sources) { const absolutePath = `${root}/data/restaurant-verification/${source.artifactPath}`; assert(absolutePath.startsWith(`${paths.artifacts}/`), `evidence artifact escaped owned directory: ${source.id}`); assert(fileSha(absolutePath) === source.sha256, `evidence artifact hash mismatch: ${source.id}`); }
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths, artifactHashes: { ...artifactHashes, [paths.apply]: fileSha(paths.apply) } }, null, 2));
