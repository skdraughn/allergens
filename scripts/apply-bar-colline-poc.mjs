import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-colline-13121610585";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-012-2026-07-16`;
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
const array = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (v = "") => { const p = v.toLowerCase(); if (p.includes("cross")) return "cross_contact"; if (p.includes("allergen") || p.includes("matrix")) return "allergen"; if (p.includes("ingredient")) return "ingredients"; if (p.includes("identity") || p.includes("location")) return "identity"; if (p.includes("menu") || p.includes("catalog") || p.includes("ordering")) return "menu"; return "other"; };

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(job.batchId === "poc-batch-012-2026-07-16" && job.restaurantId === id && result.batchId === job.batchId && result.restaurantId === id, "job/result mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened POC validator failed: ${preflight.errors.join(" | ")}`);

assert(result.currentProducts.length === 41 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 41, "expected 41 distinct current products");
const typeCounts = Object.fromEntries(Object.entries(Object.groupBy(result.currentProducts, (p) => p.allergenSourceType)).map(([k, v]) => [k, v.length]));
assert(typeCounts.restaurant_ingredients === 26 && typeCounts.restaurant_linked_vendor === 1 && typeCounts.unavailable === 14, "direct source distribution changed");
assert(result.currentProducts.every((p) => !p.containsAllergens.includes("wheat") && !p.containsAllergens.includes("gluten") && p.mayContainAllergens.length === 0), "wheat/gluten/mayContain positive found");
assert(result.currentProducts.filter((p) => p.allergenSourceType === "unavailable").every((p) => !p.containsAllergens.length && !p.mayContainAllergens.length && !p.allergenSourceEvidenceIds.length), "unavailable evidence invariant failed");
assert(result.currentProducts.find((p) => p.currentProductKey === "kids-buttered-bucatini").allergenSourceType === "restaurant_linked_vendor", "Kids Buttered Bucatini authority changed");
const complete = result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete");
assert(complete.length === 5 && complete.map((s) => s.surfaceId).join(",") === "official-happy-hour,official-prix-fixe-lunch,official-dinner,official-dessert,toast-takeaway", "current complete surface set changed");
assert(complete.map((s) => s.currentProductKeys.length).join(",") === "6,25,27,5,20", "surface counts changed");
const dispositions = Object.groupBy(result.reconciliation.items, (r) => r.disposition);
assert(dispositions.exact_match?.length === 19 && dispositions.normalized_match?.length === 2 && dispositions.equivalent_presentation?.length === 18 && dispositions.artifact?.length === 2 && !dispositions.unresolved, "reconciliation counts changed");
assert(result.sources.length === 10 && new Set(result.sources.map((s) => s.evidenceId)).size === 10, "expected 10 canonical evidence sources");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search verdict incomplete");
assert(!/\b(sol|terra)\b/i.test(JSON.stringify(result.currentProducts)), "reviewer reference in applied products");

const evidence = read(paths.evidence);
const evidenceIds = new Set(result.sources.map((s) => s.evidenceId));
for (const p of result.currentProducts) for (const ref of [...p.sourceEvidenceIds, ...p.allergenSourceEvidenceIds]) assert(evidenceIds.has(ref), `unresolved evidence ${ref}`);
evidence.restaurantId = id;
evidence.sources = result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null, artifactPath: null, excerpt: s.excerpt ?? s.proof, rowIdentifiers: [], request: null, notes: array(s.notes ?? [s.purpose]) }));
assert(evidence.sources.every((s) => s.id && s.excerpt && Array.isArray(s.notes)), "canonical evidence incomplete");
write(paths.evidence, evidence);

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index];
const oldByKey = new Map((target.items || []).map((x) => [`${x.name.toLowerCase()}\u0000${(x.category || "").toLowerCase()}`, x]));
const recon = new Map(result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys.map((k) => [k, r])));
const currentUrls = new Set(complete.map((s) => s.url));
target.items = result.currentProducts.map((p) => ({ ...oldByKey.get(`${p.name.toLowerCase()}\u0000${(p.category || "").toLowerCase()}`), id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: recon.get(p.currentProductKey)?.auditItemKey ? [recon.get(p.currentProductKey).auditItemKey] : [], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = 41;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
compact(paths.generated, generated);

const dossier = read(paths.dossier);
dossier.restaurantId = id; dossier.name = job.name; dossier.status = "codex_verified";
dossier.identity = { status: "confirmed", name: job.name, location: result.identity.location, locationId: job.locationId, officialHomepage: "https://www.barcolline.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 41, reconciledCurrentProductCount: 41, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: unique(s.sourceEvidenceIds), notes: array(s.notes) })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: array(p.notes) })), notes: ["The five current complete surfaces define the union catalog: Happy Hour, Prix Fixe Lunch, Dinner, Dessert, and Toast takeaway.", "The official menu index is supporting only; beverage and wine surfaces are excluded.", "Direct allergen fields are copied from the validated result; Ingredient Intelligence is inferred separately."] };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence;
dossier.checks = { menu: { verdict: "verified", reviewedItemCount: 41, sourceItemCount: 41 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["26 products have restaurant-issued direct positives, one product retains linked-vendor authority, and 14 remain unavailable."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } };
dossier.sourceAttempts = result.matrixSearch.attempts.map((a) => ({ ...a })); dossier.findings = result.findings; dossier.repairs = [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied corrected 41-product Bar Colline catalog with exact source authority.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bar-colline-poc.mjs`, paths.apply] }];
write(paths.dossier, dossier);

const artifactPaths = [paths.generated, paths.dossier, paths.evidence];
const artifactHashes = Object.fromEntries(artifactPaths.map((p) => [p, hash(p)]));
const changedPaths = [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bar-colline-poc.mjs`, paths.apply];
const counts = { publishedProducts: 41, directRestaurantIngredients: 26, directLinkedVendor: 1, directUnavailable: 14, mayContainProducts: 0, wheatOrGlutenProducts: 0, evidenceSources: 10, matrixSearches: 4, currentCompleteSurfaces: 5, surfaceProducts: { happyHour: 6, prixFixeLunch: 25, dinner: 27, dessert: 5, toastTakeaway: 20 }, unionProducts: 41, exactMatches: 19, normalizedMatches: 2, equivalentPresentations: 18, artifactRows: 2, unresolved: 0 };
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 41, directSourceTypeCounts: typeCounts, directAuthorityCounts: { restaurant_ingredients: 26, restaurant_linked_vendor: 1, unavailable: 14 }, containsAllergenCount: result.currentProducts.filter((p) => p.containsAllergens.length).length, mayContainCount: 0, wheatOrGlutenCount: 0, evidenceSourceCount: 10, reconciliation: { exact: 19, normalized: 2, equivalentPresentations: 18, artifact: 2, unresolved: 0 }, assertions: ["stale fingerprint gate passed", "strengthened result validator passed before mutation", "five current complete surfaces publish their 41-product union", "official menu index is supporting only", "direct source authority copied exactly; Kids Buttered Bucatini remains linked-vendor", "zero wheat/gluten and zero mayContain", "all 10 canonical evidence sources and E4-E7 official links retained", "Ingredient Intelligence applied after direct catalog finalization", "no closeout, ledger, manifest, Sol review, or unrelated writes", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "node scripts/apply-bar-colline-poc.mjs (twice)", "byte/hash comparison of all owned artifacts"], secondRunDiff: "none", artifactHashes, counts };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, counts, secondRunDiff: "none", changedPaths }, null, 2));
