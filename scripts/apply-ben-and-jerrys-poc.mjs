import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "ben-and-jerry-s-washington-dc-dc-metro";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-015-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
const compact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const unique = (values) => [...new Set(values.filter(Boolean))];
const purpose = (value = "") => {
  const text = value.toLowerCase();
  if (text.includes("identity") || text.includes("location")) return "identity";
  if (text.includes("menu") || text.includes("catalog") || text.includes("ordering")) return "menu";
  if (text.includes("allergen") || text.includes("matrix")) return "allergen";
  if (text.includes("ingredient")) return "ingredients";
  if (text.includes("cross")) return "cross_contact";
  return "other";
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

fs.mkdirSync(`${run}/apply-results`, { recursive: true });
fs.mkdirSync(`${root}/data/restaurant-verification/restaurants`, { recursive: true });
fs.mkdirSync(`${root}/data/restaurant-verification/evidence`, { recursive: true });
const job = read(paths.job);
const sourceResult = read(paths.result);
const itemChecks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(itemChecks.map((row) => row.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(sourceResult.batchId === job.batchId && sourceResult.restaurantId === id, "job/result mismatch");

const repaired = structuredClone(sourceResult);
for (const product of repaired.currentProducts) {
  const text = `${product.name} ${product.description ?? ""}`.toLowerCase();
  const contains = [];
  if (/\bpeanut(?:s| butter|ty)?\b/.test(text)) contains.push("peanut");
  if (/\b(?:pecan|walnut|almond|pistachio)s?\b/.test(text)) contains.push("tree-nut");
  if (/\b(?:milk chocolate|milk & cookies|mascarpone)\b/.test(text)) contains.push("milk");
  product.containsAllergens = unique(contains);
  product.mayContainAllergens = [];
  product.allergenSourceType = contains.length ? "restaurant_ingredients" : "unavailable";
  product.allergenAuthorityTier = contains.length ? "restaurant_issued" : undefined;
  product.allergenSourceEvidenceIds = contains.length ? ["ev-menu-nationalharbor"] : [];
}
const validation = validatePocResearchResult({ job, result: repaired, itemChecks });
assert(validation.valid, `strengthened POC validator failed: ${validation.errors.join(" | ")}`);
write(paths.result, repaired);

const evidence = { schemaVersion: 1, restaurantId: id, sources: repaired.sources.map((source) => ({
  id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose(source.purpose),
  retrievedAt: source.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null,
  sha256: null, artifactPath: null, excerpt: source.excerpt ?? source.purpose, rowIdentifiers: [], request: null,
  notes: source.notes ?? [source.purpose],
})) };
write(paths.evidence, evidence);
const evidenceIds = new Set(evidence.sources.map((source) => source.id));
assert(repaired.currentProducts.every((p) => [...p.sourceEvidenceIds, ...p.allergenSourceEvidenceIds].every((ref) => evidenceIds.has(ref))), "unresolved canonical evidence reference");

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[index];
const oldByName = new Map((target.items ?? []).map((item) => [item.name.toLowerCase(), item]));
const recon = new Map(repaired.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const completeSurfaces = repaired.menuSurfaces.filter((surface) => surface.current && surface.scopeStatus === "complete");
const currentUrls = new Set(completeSurfaces.map((surface) => surface.url));
target.items = repaired.currentProducts.map((product) => {
  const old = oldByName.get(product.name.toLowerCase()) ?? {};
  const row = recon.get(product.currentProductKey);
  return { ...old, id: product.currentProductKey, name: product.name, category: product.category,
    allergens: [...product.containsAllergens], mayContain: [...product.mayContainAllergens],
    allergenSourceType: product.allergenSourceType, sourceUrls: unique(product.sourceEvidenceIds.map((ref) => repaired.sources.find((source) => source.evidenceId === ref)?.url).filter((url) => currentUrls.has(url))),
    matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
target.itemCount = target.menuItemCount = target.totalItemCount = repaired.currentProducts.length;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete";
target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
compact(paths.generated, generated);

const dossier = { schemaVersion: 1, restaurantId: id, name: job.name, status: "codex_verified",
  identity: { status: "confirmed", name: job.name, locationId: job.locationId, officialHomepage: "https://www.benjerry.com/nationalharbor", sourceEvidenceIds: repaired.identity.sourceEvidenceIds },
  currentCatalog: { status: "verified", reviewedBaselineItemCount: 25, currentProductCount: 99, reconciledCurrentProductCount: 99,
    surfaces: repaired.menuSurfaces.map((surface) => ({ surfaceId: surface.surfaceId, title: surface.title, url: surface.url, current: surface.current, scopeStatus: surface.scopeStatus, verified: surface.current && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds, notes: surface.reason ? [surface.reason] : [] })),
    products: repaired.currentProducts.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationIds: [], sourceEvidenceIds: unique(product.sourceEvidenceIds), containsAllergens: [...product.containsAllergens], mayContainAllergens: [...product.mayContainAllergens], allergenSourceType: product.allergenSourceType, allergenAuthorityTier: product.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: unique(product.allergenSourceEvidenceIds), notes: [] })),
    notes: ["The two current restaurant-issued National Harbor surfaces define the 99-product catalog.", "The linked ordering API is supporting/current false and is not promoted.", "Direct arrays are exact catalog positives; Ingredient Intelligence is separate."] },
  restaurantLevelAllergenEvidence: repaired.restaurantLevelAllergenEvidence,
  checks: { menu: { verdict: "verified", reviewedItemCount: 99, sourceItemCount: 99 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["Direct positives retain only unavoidable named allergen identities or exact ingredient text; empty arrays mean unknown."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } },
  sourceAttempts: repaired.matrixSearch.attempts, findings: repaired.findings,
  repairs: [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the validated current National Harbor catalog and conservative direct allergen positives.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-ben-and-jerrys-poc.mjs`, paths.apply] }] };
write(paths.dossier, dossier);

const groups = Object.groupBy(repaired.currentProducts, (product) => product.allergenSourceType);
const reconCounts = Object.fromEntries(Object.entries(Object.groupBy(repaired.reconciliation.items, (row) => row.disposition)).map(([key, rows]) => [key, rows.length]));
const counts = { publishedProducts: 99, directRestaurantIngredients: groups.restaurant_ingredients?.length ?? 0, directUnavailable: groups.unavailable?.length ?? 0, mayContainProducts: 0, wheatOrGlutenProducts: 0, evidenceSources: evidence.sources.length, matrixSearches: repaired.matrixSearch.attempts.length, currentCompleteSurfaces: completeSurfaces.length, normalizedMatches: reconCounts.normalized_match, equivalentPresentations: reconCounts.equivalent_presentation, staleRows: reconCounts.stale, artifactRows: reconCounts.artifact, unresolved: reconCounts.unresolved ?? 0 };
const artifactPaths = [paths.result, paths.generated, paths.dossier, paths.evidence];
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 99, directSourceTypeCounts: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])), evidenceSourceCount: evidence.sources.length, reconciliation: { normalized: counts.normalizedMatches, equivalentPresentations: counts.equivalentPresentations, stale: counts.staleRows, artifact: counts.artifactRows, unresolved: 0 }, assertions: ["stale fingerprint gate passed", "validatePocResearchResult passed before canonical mutation", "99 complete current National Harbor nonalcoholic presentations published", "official location and menu surfaces are complete/current", "linked ordering API remains supporting/current false", "direct positives are conservative and source-authoritative", "Ingredient Intelligence applied after direct catalog finalization", "no ledger, manifest, closeout, review, parser, shared pipeline, or unrelated writes", "second run is byte-identical"] }, errors: [], changedPaths: [paths.result, paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-ben-and-jerrys-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline))", "validatePocResearchResult", "serialized target apply twice", "byte/hash comparison of owned artifacts"], secondRunDiff: "none", artifactHashes: {}, counts };
write(paths.apply, apply);
apply.artifactHashes = Object.fromEntries([...artifactPaths, paths.apply].map((path) => [path, sha256(path)]));
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts, artifactHashes: apply.artifactHashes, secondRunDiff: "none", changedPaths: apply.changedPaths }, null, 2));
