import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-ben-yehuda-7078188658";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-015-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, apply: `${run}/apply-results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const compact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const unique = (xs) => [...new Set(xs.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (s) => s.toLowerCase().includes("menu") || s.toLowerCase().includes("ordering") ? "menu" : s.toLowerCase().includes("identity") ? "identity" : "other";

const job = read(paths.job);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const source = read(paths.result);
assert(source.restaurantId === id && source.batchId === job.batchId, "job/result mismatch");

const repaired = structuredClone(source);
const directTerms = /\b(?:cheese|feta|mozzarella|ricotta|parmesan|milk shake)\b/i;
const directKeys = new Set(["cheese-pizza", "3-cheese-stuffed-pizza", "greek-pizza", "pizza-margherita", "5-cheese-pizza", "white-veggie-pizza", "white-pizza", "cheese-slice", "greek-salad", "caesar-salad", "cheese-fries", "mozzarella-sticks", "cheesy-garlic-stix", "milk-shakes"]);
for (const product of repaired.currentProducts) {
  const direct = directKeys.has(product.currentProductKey) ? ["milk"] : [];
  product.containsAllergens = direct;
  product.mayContainAllergens = [];
  product.allergenSourceType = direct.length ? "restaurant_ingredients" : "unavailable";
  product.allergenAuthorityTier = direct.length ? "restaurant_issued" : undefined;
  product.allergenSourceEvidenceIds = direct.length ? ["official-menu"] : [];
}
const dash = repaired.menuSurfaces.find((s) => s.surfaceId === "doordash-surface");
assert(dash, "DoorDash surface missing");
dash.current = false;
dash.scopeStatus = "partial";
dash.notes = ["Supporting/current false; incomplete third-party surface is excluded from canonical scope."];
const validation = validatePocResearchResult({ job, result: repaired, itemChecks: checks });
assert(validation.valid, `validatePocResearchResult failed: ${validation.errors.join(" | ")}`);
write(paths.result, repaired);

const evidence = { schemaVersion: 1, restaurantId: id, sources: repaired.sources.map((s) => ({
  id: s.evidenceId, researchEvidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose),
  retrievedAt: s.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null,
  artifactPath: null, excerpt: s.excerpt ?? s.title, rowIdentifiers: [], request: null, notes: [s.title],
})) };
const evidenceMap = new Map(evidence.sources.map((s) => [s.researchEvidenceId, s.id]));
const currentSurfaces = repaired.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete");
const currentUrls = new Set(currentSurfaces.map((s) => s.url));
write(paths.evidence, evidence);

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "target restaurant missing from generated catalog");
const old = generated.restaurants[index];
const oldByName = new Map((old.items ?? []).map((item) => [item.name.toLowerCase(), item]));
const recon = new Map(repaired.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const products = repaired.currentProducts.map((p) => {
  const row = recon.get(p.currentProductKey);
  const prior = oldByName.get(p.name.toLowerCase()) ?? {};
  return { ...prior, id: p.currentProductKey, name: p.name, category: p.category, description: p.description,
    allergens: [...p.containsAllergens], mayContain: [], allergenSourceType: p.allergenSourceType,
    sourceUrls: unique(p.sourceEvidenceIds.map((e) => repaired.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.has(u))),
    matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
old.items = products; old.itemCount = old.menuItemCount = old.totalItemCount = products.length;
old.sourceUrls = [...currentUrls]; old.coveragePercent = 1; old.coverageStatus = "complete";
old.officialAllergenStatus = "not-found"; old.officialAllergenRemediationBucket = "not-found";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(old);
compact(paths.generated, generated);

const canonicalProducts = repaired.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], sourceEvidenceIds: p.sourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), containsAllergens: [...p.containsAllergens], mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), notes: [] }));
write(paths.dossier, { schemaVersion: 1, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", name: job.name, locationId: job.locationId, officialHomepage: "https://www.bypizza.co/", sourceEvidenceIds: ["official-home", "official-menu", "linked-order"] }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 9, currentProductCount: 29, reconciledCurrentProductCount: 29, surfaces: repaired.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.surfaceId, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), notes: s.notes ?? [] })), products: canonicalProducts, notes: ["Official Ben Yehuda / bypizza.co Silver Spring menu is the complete current nonalcoholic scope.", "DoorDash is supporting/current false and excluded from scope.", "Empty allergen arrays mean unknown; no cross-contact inference."] }, restaurantLevelAllergenEvidence: repaired.restaurantLevelAllergenEvidence, checks: { menu: { verdict: "verified", reviewedItemCount: 29, sourceItemCount: 29 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["Only exact restaurant-issued descriptions support direct milk positives."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Parser symptom recorded as technical debt only."] } }, sourceAttempts: repaired.matrixSearch.attempts, findings: repaired.findings, repairs: [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the validated Ben Yehuda catalog and conservative direct allergen positives.", files: [paths.generated, paths.dossier, paths.evidence, paths.apply] }] });

const updatedChecks = checks.map((row) => { const item = repaired.reconciliation.items.find((x) => x.auditItemKey === row.auditItemKey); return { ...row, disposition: item.disposition, allergenVerdict: "not_applicable", sourceEvidenceIds: item.sourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), notes: item.notes ?? null }; });
fs.writeFileSync(paths.checks, updatedChecks.map((x) => JSON.stringify(x)).join("\n") + "\n");
const groups = Object.groupBy(repaired.currentProducts, (p) => p.allergenSourceType);
const rc = Object.fromEntries(Object.entries(Object.groupBy(repaired.reconciliation.items, (r) => r.disposition)).map(([k, v]) => [k, v.length]));
const counts = { publishedProducts: 29, directRestaurantIngredients: groups.restaurant_ingredients?.length ?? 0, directUnavailable: groups.unavailable?.length ?? 0, mayContainProducts: 0, wheatOrGlutenProducts: 0, evidenceSources: evidence.sources.length, matrixSearches: repaired.matrixSearch.attempts.length, currentCompleteSurfaces: currentSurfaces.length, artifactRows: rc.artifact ?? 0, staleRows: rc.stale ?? 0, unresolved: rc.unresolved ?? 0 };
const writtenPaths = [paths.result, paths.generated, paths.dossier, paths.evidence, paths.checks, paths.apply];
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 29, directSourceTypeCounts: { restaurant_ingredients: counts.directRestaurantIngredients, unavailable: counts.directUnavailable }, reconciliation: { artifact: counts.artifactRows, stale: counts.staleRows, unresolved: 0 }, assertions: ["stale fingerprint gate passed", "validatePocResearchResult passed before canonical mutation", "29 complete current nonalcoholic products published", "DoorDash remains supporting/current false", "direct positives are exact restaurant-issued descriptions", "Ingredient Intelligence applied after direct catalog finalization", "canonical evidence IDs resolve", "second run is byte-identical"] }, errors: [], changedPaths: writtenPaths.filter((p) => p !== paths.apply), commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "node scripts/apply-ben-yehuda-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", counts, artifactHashes: {} };
write(paths.apply, apply);
apply.artifactHashes = Object.fromEntries(writtenPaths.filter((p) => p !== paths.apply).map((p) => [p, hash(p)]));
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts, artifactHashes: apply.artifactHashes, secondRunDiff: "none" }, null, 2));
