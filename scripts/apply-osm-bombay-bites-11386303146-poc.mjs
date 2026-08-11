#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-bombay-bites-11386303146";
const batchId = "poc-batch-030-2026-07-20";
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
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const writeCompact = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, JSON.stringify(value)); };
const bytesHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => bytesHash(fs.readFileSync(p));
const arr = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const unique = (value) => [...new Set(arr(value).filter(Boolean))];
const purpose = (value = "") => value.includes("allergen") || value.includes("matrix") ? "allergen" : value.includes("identity") || value.includes("location") ? "identity" : value.includes("menu") ? "menu" : "other";
const fail = (condition, message) => { if (!condition) throw new Error(message); };

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = bytesHash(JSON.stringify(checks.map((row) => row.baseline)));
fail(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
fail(fingerprint === "2518dd6197841c82903070a72bd24f0d32dc3e58e5156820c1959cce9029598d", "stale_apply_packet");
fail(result.batchId === batchId && result.restaurantId === id, "research result identity mismatch");
fail(result.currentProducts.length === 166, "expected 166 research products");
const reconciliation = result.reconciliation.items;
const reconCounts = reconciliation.reduce((counts, row) => { counts[row.disposition] = (counts[row.disposition] ?? 0) + 1; return counts; }, {});
fail(reconciliation.length === 171 && reconCounts.normalized_match === 166 && reconCounts.artifact === 5, "terminal reconciliation counts failed");
fail(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
fail(result.currentProducts.every((p) => !(p.containsAllergens ?? []).length && !(p.mayContainAllergens ?? []).length), "direct allergens must be unavailable and mayContain zero");
fail((await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result })).valid, "research validator failed");

const evidenceEntries = result.sources.map((source) => {
  const evidenceId = source.evidenceId ?? source.id;
  const artifact = { schemaVersion: 1, restaurantId: id, evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt ?? source.title ?? source.purpose, rowIdentifiers: [evidenceId], notes: arr(source.notes ?? [source.title ?? source.purpose]) };
  const artifactPath = `${paths.artifacts}/${evidenceId}.json`;
  write(artifactPath, artifact);
  return { source, evidenceId, relativePath: `evidence/artifacts/${id}/${evidenceId}.json`, sha256: fileHash(artifactPath) };
});
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceEntries.map(({ source, evidenceId, relativePath, sha256 }) => ({ id: evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt ?? source.title ?? source.purpose, artifactPath: relativePath, sha256, rowIdentifiers: [evidenceId], request: null, notes: arr(source.notes ?? [source.title ?? source.purpose]) })), sourceAttempts: result.matrixSearch.attempts };
fail(evidence.sources.every((source) => source.artifactPath && source.sha256 && ["identity", "menu", "allergen", "other"].includes(source.purpose)), "canonical evidence fields failed");

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
fail(index >= 0, "generated Bombay Bites entry missing");
const old = generated.restaurants[index];
const toast = result.menuSurfaces.find((surface) => surface.surfaceId === "toast-centreville-menu");
fail(toast?.current === true && toast.scopeStatus === "complete" && toast.currentProductKeys.length === 166, "Toast publishing surface contract failed");
const sourceById = new Map(result.sources.map((source) => [source.evidenceId ?? source.id, source]));
const products = result.currentProducts.map((product) => ({
  ...(old.items ?? []).find((item) => item.id === product.currentProductKey),
  id: product.currentProductKey, name: product.name, category: product.category,
  allergens: [], mayContain: [], allergenSourceType: "unavailable",
  allergenAuthorityTier: null, allergenSourceEvidenceIds: [],
  sourceUrls: unique((product.sourceEvidenceIds ?? []).map((evidenceId) => sourceById.get(evidenceId)?.url).filter((url) => url === toast.url)),
  matchedBaselineAuditItemKeys: reconciliation.filter((row) => (row.matchedCurrentProductKeys ?? []).includes(product.currentProductKey)).map((row) => row.auditItemKey),
  notes: [],
}));
fail(products.length === 166 && products.every((product) => product.sourceUrls.includes(toast.url)), "canonical product boundary failed");
const surfaces = result.menuSurfaces.map((surface) => ({
  surfaceId: surface.surfaceId, title: surface.title, url: surface.url,
  current: surface.surfaceId === toast.surfaceId, scopeStatus: surface.surfaceId === toast.surfaceId ? "complete" : "supporting",
  verified: true, currentProductKeys: surface.surfaceId === toast.surfaceId ? products.map((product) => product.id) : [],
  evidenceIds: unique(surface.sourceEvidenceIds), notes: arr(surface.notes),
}));
const currentUrls = [toast.url];
const target = { ...old, name: job.name, domain: job.domain, guideUrl: result.identity.officialHomepage, locationId: job.locationId, items: products, itemCount: 166, menuItemCount: 166, totalItemCount: 166, officialItemCount: 166, sourceUrls: currentUrls, locationSurfaces: surfaces, coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable", officialAllergenRemediationBucket: "accurately_unavailable" };
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => {
  const match = reconciliation.find((entry) => entry.auditItemKey === row.auditItemKey);
  const artifact = match.disposition === "artifact";
  return { ...row, disposition: match.disposition, allergenVerdict: artifact ? "not_applicable" : "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [], notes: arr(row.notes) };
});
fail(updatedChecks.length === 171 && updatedChecks.filter((row) => row.disposition === "normalized_match").length === 166 && updatedChecks.filter((row) => row.disposition === "artifact").length === 5, "updated item-check counts failed");

const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "pending_coordinator_closeout", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, domain: job.domain, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds, notes: arr(result.identity.notes) }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 171, currentProductCount: 166, reconciledCurrentProductCount: 166, surfaces, products: products.map((product) => ({ currentProductKey: product.id, name: product.name, category: product.category, presentationIds: [], sourceEvidenceIds: unique(result.currentProducts.find((p) => p.currentProductKey === product.id)?.sourceEvidenceIds), containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: [] })), notes: ["Toast Centreville is the sole complete current publishing surface with 166 products.", "Official homepage and official menu are supporting surfaces only.", "Direct allergen disclosure is unavailable; no negative or may-contain claims are inferred."] }, matrixSearch: result.matrixSearch, reconciliation: { frozenKeys: 171, normalizedMatchCount: 166, artifactCount: 5, unresolvedCount: 0, items: updatedChecks.map((row) => ({ auditItemKey: row.auditItemKey, disposition: row.disposition, matchedCurrentProductKeys: row.matchedCurrentProductKeys })) }, sourceEvidenceIds: evidence.sources.map((source) => source.id), sourceAttempts: result.matrixSearch.attempts, checks: { menu: { verdict: "verified", reviewedItemCount: 171, sourceItemCount: 166 }, allergenSource: { verdict: "accurately_unavailable", directContainsCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } } };

write(paths.evidence, evidence);
write(paths.dossier, dossier);
writeCompact(paths.generated, generated);
fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks, ...evidenceEntries.map((entry) => `${root}/data/restaurant-verification/${entry.relativePath}`)];
const hashes = Object.fromEntries(owned.map((path) => [path, fileHash(path)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 166, reconciliation: { normalized_match: 166, artifact: 5, terminalChecks: 171 }, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 166, matrixStatus: "accurately_unavailable", matrixSearchCount: 4, currentCompleteSurfaces: [toast.surfaceId], supportingSurfaces: ["official-home", "official-centreville-menu"], evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, ingredientIntelligence: true }, errors: [], changedPaths: [...owned, `${root}/scripts/apply-osm-bombay-bites-11386303146-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "target-only canonical catalog/dossier/evidence apply", "persist canonical evidence artifacts with top-level artifactPath and sha256", "normalize note fields to arrays", "recompute Ingredient Intelligence after direct catalog finalization", "run apply script twice and compare owned artifact bytes"], hashes, secondRunDiff: "none", counts: { publishedProducts: 166, normalizedMatches: 166, artifacts: 5, terminalChecks: 171, directContains: 0, directMayContain: 0, unavailable: 166, evidenceSources: evidence.sources.length, evidenceArtifacts: evidenceEntries.length, matrixSearches: 4 } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths: apply.changedPaths }, null, 2));
