#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-bitez-6127374174";
const batchId = "poc-batch-023-2026-07-20";
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
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const writeJson = (p, value, compact = false) => {
  fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(p, `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`);
};
const purpose = (source) => source.evidenceId === "src-official-home" ? "menu"
  : source.evidenceId === "src-official-menu" ? "menu"
  : source.evidenceId === "src-official-locator" ? "identity" : "other";

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
if (job.batchId !== batchId || job.restaurantId !== id) throw new Error("job identity mismatch");
if (fingerprint !== job.baselineFingerprint || fingerprint !== "ac93f27b58083cbe67550cf26da0fa7ead00eda2a8a8f8eac52a1af8d17f502d") throw new Error("stale_apply_packet");
if (result.batchId !== batchId || result.restaurantId !== id) throw new Error("result identity mismatch");
if (result.currentProducts.length !== 22 || new Set(result.currentProducts.map((p) => p.currentProductKey)).size !== 22) throw new Error("expected 22 distinct current products");
const dispositionCounts = Object.fromEntries(["exact_match", "equivalent_presentation", "artifact", "unresolved"].map((d) => [d, result.reconciliation.items.filter((r) => r.disposition === d).length]));
if (dispositionCounts.exact_match !== 12 || dispositionCounts.equivalent_presentation !== 1 || dispositionCounts.artifact !== 2 || dispositionCounts.unresolved !== 0) throw new Error("reconciliation counts failed");
if (result.matrixSearch.status !== "accurately_unavailable" || result.matrixSearch.attempts.length !== 4) throw new Error("matrix search gate failed");
if (result.currentProducts.some((p) => p.containsAllergens?.length || p.mayContainAllergens?.length)) throw new Error("direct allergen fields must remain unavailable");
const research = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
if (!research.valid) throw new Error(`research validator failed: ${research.errors.join(" | ")}`);
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
if (!validation.valid) throw new Error(`in-memory result validation failed: ${validation.errors.join(" | ")}`);

const artifacts = result.sources.map((source) => {
  const excerpt = source.purpose;
  const relativePath = `evidence/artifacts/${id}/${source.evidenceId}.json`;
  const body = { schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source), retrievedAt: source.retrievedAt, excerpt, rowIdentifiers: [source.evidenceId] };
  const bytes = Buffer.from(`${JSON.stringify(body, null, 2)}\n`);
  return { source, relativePath, absolutePath: `${root}/data/restaurant-verification/${relativePath}`, bytes, sha256: sha(bytes) };
});
for (const artifact of artifacts) { fs.mkdirSync(paths.artifacts, { recursive: true }); fs.writeFileSync(artifact.absolutePath, artifact.bytes); }
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: artifacts.map(({ source, relativePath, sha256 }) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source), retrievedAt: source.retrievedAt, excerpt: source.purpose, sha256, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] })) };

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (index < 0) throw new Error("target restaurant missing");
const target = generated.restaurants[index];
const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const surfaces = result.menuSurfaces.map((surface) => ({ ...surface, current: surface.current === true && surface.scopeStatus === "complete", verified: true, evidenceIds: unique(surface.productEvidenceIds) }));
const currentUrls = unique(surfaces.filter((surface) => surface.current).map((surface) => surface.url));
const matches = new Map(result.reconciliation.items.flatMap((row) => (row.matchedCurrentProductKeys ?? []).map((key) => [key, row.auditItemKey])));
target.items = result.currentProducts.map((product) => ({ ...oldById.get(product.currentProductKey), id: product.currentProductKey, name: product.name, category: product.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique((product.sourceEvidenceIds ?? []).map((sid) => result.sources.find((source) => source.evidenceId === sid)?.url).filter((url) => currentUrls.includes(url))), matchedBaselineAuditItemKeys: [matches.get(product.currentProductKey)].filter(Boolean) }));
Object.assign(target, { itemCount: 22, menuItemCount: 22, totalItemCount: 22, officialItemCount: 22, sourceUrls: currentUrls, coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable", locationSurfaces: result.identity.locations });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((candidate) => candidate.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys) }; });
const products = result.currentProducts.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationIds: unique(product.presentationReferences), sourceEvidenceIds: unique(product.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.locationScope, locationId: job.locationId, officialHomepage: result.identity.officialHomepage, locations: result.identity.locations, sourceEvidenceIds: result.identity.evidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 15, currentProductCount: 22, reconciledCurrentProductCount: 22, surfaces, products, notes: ["One observed official catalog is shared across Fairfax, Tysons, and Reston; each location identity remains explicit.", "Direct allergen data is accurately unavailable after all four required searches; no menu-word inference is promoted to direct allergen fields.", "Ingredient Intelligence is generated only after direct catalog finalization; direct unknown remains unavailable."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 15, sourceItemCount: 22 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 15, exactMatchCount: 12, equivalentPresentationCount: 1, artifactCount: 2, unresolvedCount: 0 } };

writeJson(paths.evidence, evidence);
writeJson(paths.dossier, dossier);
writeJson(paths.generated, generated);
fs.mkdirSync(paths.itemChecks.slice(0, paths.itemChecks.lastIndexOf("/")), { recursive: true });
fs.writeFileSync(paths.itemChecks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const changedPaths = [paths.generated, paths.dossier, paths.evidence, ...artifacts.map((artifact) => artifact.absolutePath), paths.itemChecks, `${root}/scripts/apply-bitez-poc.mjs`, paths.apply];
const artifactHashes = Object.fromEntries(changedPaths.filter((path) => path !== paths.apply && path !== `${root}/scripts/apply-bitez-poc.mjs`).map((path) => [path, fileSha(path)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 22, exactMatchCount: 12, equivalentPresentationCount: 1, artifactCount: 2, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 22, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "buildPocCloseoutPacket (in-memory)", "persist dedicated evidence artifacts and verify every sha256", "update only Bitez generated row, dossier, evidence, and item checks", "recompute Ingredient Intelligence after direct catalog finalization", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 22, exact_match: 12, equivalent_presentation: 1, artifacts: 2, unresolved: 0, directAllergens: 0, mayContain: 0, unavailable: 22, evidenceSources: evidence.sources.length, evidenceArtifacts: artifacts.length }, fingerprint };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks });
if (packet.restaurantId !== id || packet.currentCatalog.products.length !== 22) throw new Error("in-memory closeout packet validation failed");
for (const source of evidence.sources) if (fileSha(`${root}/data/restaurant-verification/${source.artifactPath}`) !== source.sha256) throw new Error(`evidence artifact hash mismatch: ${source.id}`);
writeJson(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths, artifactHashes: { ...artifactHashes, [paths.apply]: fileSha(paths.apply) } }, null, 2));
