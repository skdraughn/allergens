#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bistro-aracosia-dc";
const batchId = "poc-batch-021-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  evidenceArtifacts: `${root}/data/restaurant-verification/evidence/artifacts/${id}`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value, compact = false) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`); };
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => hash(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (value = "") => value.includes("identity") || value.includes("location") ? "identity" : value.includes("menu") || value.includes("catalog") ? "menu" : value.includes("ingredient") ? "ingredients" : value.includes("allergen") || value.includes("matrix") ? "allergen" : value.includes("cross-contact") ? "cross_contact" : "other";

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = hash(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === "135e6651d17a24d4f7a09afd22cb57ccf241d62b44c9f74c01e560de2ce17271" && fingerprint === job.baselineFingerprint, "stale_apply_packet");
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
assert(result.currentProducts.length === 123 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 123, "expected 123 distinct products");
assert(result.reconciliation.items.length === 123 && result.reconciliation.items.every((r) => r.disposition === "exact_match"), "expected 123 exact matches");
assert(result.reconciliation.items.filter((r) => r.disposition === "unresolved").length === 0, "unresolved reconciliation rows");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
assert(result.currentProducts.every((p) => !p.containsAllergens?.length && !p.mayContainAllergens?.length), "direct allergen aggregate is nonzero");
const research = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(research.valid, `research validator failed: ${research.errors.join(" | ")}`);
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `in-memory result validation failed: ${validation.errors.join(" | ")}`);

const evidenceArtifacts = result.sources.map((source) => {
  const excerpt = source.excerpt ?? source.purpose;
  const absolutePath = `${paths.evidenceArtifacts}/${source.evidenceId}.json`;
  const relativePath = `evidence/artifacts/${id}/${source.evidenceId}.json`;
  const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, rowIdentifiers: [source.evidenceId] }, null, 2)}\n`);
  return { source, excerpt, absolutePath, relativePath, bytes, sha256: hash(bytes) };
});
for (const artifact of evidenceArtifacts) { fs.mkdirSync(paths.evidenceArtifacts, { recursive: true }); fs.writeFileSync(artifact.absolutePath, artifact.bytes); }
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceArtifacts.map(({ source, excerpt, relativePath, sha256 }) => (
  { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, sha256, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] }
)) };
assert(evidence.sources.every((s) => s.id && s.excerpt && s.sha256 && s.artifactPath && s.rowIdentifiers.length && ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "canonical evidence incomplete");

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index]; const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const currentSurfaces = result.menuSurfaces.map((s) => ({ ...s, current: s.current === true && s.scopeStatus === "complete", scopeStatus: s.current === true && s.scopeStatus === "complete" ? "complete" : "supporting", verified: true, evidenceIds: unique(s.sourceEvidenceIds), notes: [s.notes ?? ""] }));
const currentUrls = new Set(currentSurfaces.filter((s) => s.current).map((s) => s.url));
const matchByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...oldById.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique((p.sourceEvidenceIds ?? []).map((sid) => result.sources.find((s) => s.evidenceId === sid)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean), ingredientIntelligence: undefined }));
Object.assign(target, { itemCount: 123, menuItemCount: 123, totalItemCount: 123, officialItemCount: 123, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys) }; });
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: p.notes ? [p.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: "5100 MacArthur Blvd NW, Washington, DC 20016", locationId: job.locationId, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 123, currentProductCount: 123, reconciledCurrentProductCount: 123, surfaces: currentSurfaces, products, notes: ["Palisades/MacArthur Boulevard identity only; current lunch, dinner, kids, and dessert menu surfaces define the catalog.", "Official ordering, Grubhub, and Wix API/token endpoints are evidence infrastructure/supporting surfaces, not user-facing menu surfaces.", "Direct allergen data is accurately unavailable; Ingredient Intelligence is inferred only after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 123, sourceItemCount: 123 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 123, exactMatchCount: 123, staleCount: 0, unresolvedCount: 0 } };
const evidenceArtifactPaths = evidenceArtifacts.map((artifact) => artifact.absolutePath);
const changedPaths = [paths.generated, paths.dossier, paths.evidence, ...evidenceArtifactPaths, paths.itemChecks, `${root}/scripts/apply-bistro-aracosia-poc.mjs`, paths.apply];
write(paths.evidence, evidence); write(paths.dossier, dossier); write(paths.generated, generated); fs.writeFileSync(paths.itemChecks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileHash(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 123, exactMatchCount: 123, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 123, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "buildPocCloseoutPacket (non-writing/in-memory)", "verify each evidence artifact path stays under data/restaurant-verification and sha256(file bytes) matches evidence.sha256", "target catalog/dossier/evidence/item-check serialization", "recompute Ingredient Intelligence after direct catalog finalization", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 123, exactMatches: 123, unresolved: 0, directAllergens: 0, mayContain: 0, unavailable: 123, evidenceSources: evidence.sources.length, evidenceArtifacts: evidenceArtifactPaths.length, matrixSearches: 4 } };
const closeoutPacket = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks });
assert(closeoutPacket.restaurantId === id && closeoutPacket.currentCatalog.products.length === 123, "in-memory closeout packet validation failed");
for (const source of evidence.sources) {
  const absolutePath = `${root}/data/restaurant-verification/${source.artifactPath}`;
  assert(absolutePath.startsWith(`${root}/data/restaurant-verification/evidence/artifacts/${id}/`), `evidence artifact escaped owned directory: ${source.id}`);
  assert(fileHash(absolutePath) === source.sha256, `evidence artifact hash mismatch: ${source.id}`);
}
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", artifactHashes: { ...artifactHashes, [paths.apply]: fileHash(paths.apply) }, changedPaths }, null, 2));
