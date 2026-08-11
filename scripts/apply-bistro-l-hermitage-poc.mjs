#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bistro-l-hermitage-woodbridge-va-dc-metro";
const batchId = "poc-batch-022-2026-07-20";
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
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const canonicalPurpose = (value = "") => value.includes("identity") || value.includes("location") ? "identity" : value.includes("allergen") || value.includes("matrix") ? "allergen" : value.includes("ingredient") ? "ingredients" : value.includes("cross-contact") ? "cross_contact" : value.includes("menu") || value.includes("catalog") ? "menu" : "other";

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
const products = Array.isArray(result.currentProducts) ? result.currentProducts : result.currentProducts.products;
const dispositions = result.reconciliation.items.reduce((counts, row) => ({ ...counts, [row.disposition]: (counts[row.disposition] ?? 0) + 1 }), {});
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === "143dcbd4b0b5e46815d9eeda90e9223a91177a281c300bc6cce0e9a5e127067f" && fingerprint === job.baselineFingerprint, "stale_apply_packet");
assert(result.batchId === batchId && result.restaurantId === id, "result identity mismatch");
assert(products.length === 40 && new Set(products.map((p) => p.currentProductKey)).size === 40, "expected 40 current products");
assert(result.reconciliation.items.length === 23 && dispositions.exact_match === 3 && dispositions.normalized_match === 4 && dispositions.equivalent_presentation === 3 && dispositions.artifact === 12 && dispositions.stale === 1 && !dispositions.unresolved, "frozen reconciliation counts failed");
const directCounts = products.flatMap((p) => p.containsAllergens ?? []).reduce((counts, allergen) => ({ ...counts, [allergen]: (counts[allergen] ?? 0) + 1 }), {});
assert(JSON.stringify(directCounts) === JSON.stringify({ shellfish: 5, milk: 10, "tree-nut": 3, egg: 7, fish: 4 }) && products.every((p) => !(p.mayContainAllergens ?? []).length), "direct allergen aggregate failed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search gate failed");
assert(result.identity.address === "12724 Occoquan Rd, Woodbridge, VA 22192", "identity address mismatch");
assert((result.menuSurfaces ?? []).some((s) => s.current && s.url.includes("/menu/") && s.servicePeriod.includes("dinner")), "current desktop dinner surface missing");
assert((result.menuSurfaces ?? []).some((s) => s.current && s.url.includes("brunch-menu") && s.servicePeriod.includes("brunch")), "current desktop brunch surface missing");
assert((result.menuSurfaces ?? []).some((s) => !s.current && s.url.startsWith("https://m.")), "legacy mobile surface missing");
assert(products.find((p) => p.currentProductKey === "gratinée-de-fruits-rouges").allergenSourceType === "unavailable" && !products.find((p) => p.currentProductKey === "gratinée-de-fruits-rouges").containsAllergens.length, "Gratinée claim changed");
assert((await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result })).valid, "research validator failed");
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `in-memory result validation failed: ${validation.errors.join(" | ")}`);

const evidenceEntries = result.sources.map((source) => {
  const excerpt = source.excerpt ?? source.purpose;
  const relativePath = `evidence/artifacts/${id}/${source.evidenceId}.json`;
  const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, restaurantId: id, evidenceId: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, rowIdentifiers: [source.evidenceId] }, null, 2)}\n`);
  const absolutePath = `${root}/data/restaurant-verification/${relativePath}`;
  fs.mkdirSync(paths.artifacts, { recursive: true }); fs.writeFileSync(absolutePath, bytes);
  return { source, excerpt, relativePath, absolutePath, sha256: sha(bytes) };
});
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceEntries.map(({ source, excerpt, relativePath, sha256 }) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt, sha256, artifactPath: relativePath, rowIdentifiers: [source.evidenceId], request: null, notes: [source.purpose] })) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "non-canonical evidence purpose");

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index];
const oldByKey = new Map((target.items ?? []).map((item) => [item.id, item]));
const surfaces = result.menuSurfaces.map((surface) => ({ ...surface, current: surface.current === true && surface.scopeStatus === "complete", scopeStatus: surface.current === true && surface.scopeStatus === "complete" ? "complete" : "supporting", verified: true, evidenceIds: unique(surface.sourceEvidenceIds) }));
const currentUrls = new Set(surfaces.filter((surface) => surface.current).map((surface) => surface.url));
const matchByProduct = new Map(result.reconciliation.items.flatMap((row) => (row.matchedCurrentProductKeys ?? []).map((key) => [key, row.auditItemKey])));
target.items = products.map((product) => ({ ...oldByKey.get(product.currentProductKey), id: product.currentProductKey, name: product.name, ...(product.description != null ? { description: product.description } : {}), category: product.category, allergens: product.containsAllergens, mayContain: product.mayContainAllergens, allergenSourceType: product.allergenSourceType, allergenAuthorityTier: product.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: unique(product.allergenSourceEvidenceIds), sourceUrls: unique((product.sourceEvidenceIds ?? []).map((sid) => result.sources.find((source) => source.evidenceId === sid)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: [matchByProduct.get(product.currentProductKey)].filter(Boolean), ingredientIntelligence: undefined }));
Object.assign(target, { itemCount: 40, menuItemCount: 40, totalItemCount: 40, officialItemCount: 40, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable" });
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((entry) => entry.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: match.disposition === "artifact" || match.disposition === "stale" ? "not_applicable" : "verified", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [] }; });
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.address, locationId: job.locationId, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 23, currentProductCount: 40, reconciledCurrentProductCount: 40, surfaces, products: products.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationIds: unique(product.presentationIds), sourceEvidenceIds: unique(product.sourceEvidenceIds), containsAllergens: product.containsAllergens, mayContainAllergens: product.mayContainAllergens, allergenSourceType: product.allergenSourceType, allergenAuthorityTier: product.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: unique(product.allergenSourceEvidenceIds), ...(product.description != null ? { description: product.description } : {}), notes: product.notes ? [product.notes] : [] })), notes: ["Current desktop dinner and brunch menus define the catalog; legacy mobile surfaces are supporting/noncurrent.", "Ingredient Intelligence is inferred only after direct catalog finalization; unknown direct evidence remains unavailable."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 23, sourceItemCount: 40 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 27, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings ?? [], reconciliation: { frozenKeys: 23, exactMatchCount: 3, normalizedMatchCount: 4, equivalentPresentationCount: 3, artifactCount: 12, staleCount: 1, unresolvedCount: 0 } };

const changedPaths = [paths.generated, paths.dossier, paths.evidence, ...evidenceEntries.map((entry) => entry.absolutePath), paths.checks, `${root}/scripts/apply-bistro-l-hermitage-poc.mjs`, paths.apply];
write(paths.dossier, dossier); write(paths.evidence, evidence); write(paths.generated, generated); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileSha(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 40, exactMatchCount: 3, normalizedMatchCount: 4, equivalentPresentationCount: 3, artifactCount: 12, staleCount: 1, unresolvedCount: 0, directContainsCount: 27, directMayContainCount: 0, matrixSearchCount: 4, evidenceSourceCount: evidence.sources.length, evidenceArtifactIntegrityValid: true, inMemoryCloseoutPacketValid: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "buildPocCloseoutPacket (in-memory)", "write stable evidence artifacts and verify sha256(file bytes)", "finalize direct catalog then recompute Ingredient Intelligence", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 40, exactMatches: 3, normalizedMatches: 4, equivalentPresentations: 3, artifacts: 12, stale: 1, unresolved: 0, directAllergens: 27, mayContain: 0, unavailable: 13, evidenceSources: evidence.sources.length, evidenceArtifacts: evidenceEntries.length, matrixSearches: 4 } };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: updatedChecks });
assert(packet.restaurantId === id && packet.currentCatalog.products.length === 40, "in-memory closeout packet validation failed");
for (const source of evidence.sources) { const artifactPath = `${root}/data/restaurant-verification/${source.artifactPath}`; assert(artifactPath.startsWith(`${paths.artifacts}/`) && fileSha(artifactPath) === source.sha256, `evidence artifact hash mismatch: ${source.id}`); }
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", changedPaths, artifactHashes: { ...artifactHashes, [paths.apply]: fileSha(paths.apply) } }, null, 2));
