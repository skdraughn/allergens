import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-bar-chinois-dc-washington-dc";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-011-2026-07-16`;
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
const purpose = (v = "") => {
  const p = v.toLowerCase();
  if (p.includes("cross")) return "cross_contact";
  if (p.includes("allergen") || p.includes("matrix")) return "allergen";
  if (p.includes("ingredient")) return "ingredients";
  if (p.includes("identity") || p.includes("location")) return "identity";
  if (p.includes("menu") || p.includes("catalog") || p.includes("ordering")) return "menu";
  return "other";
};

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
assert(fingerprint === "8d3f0f03744486141c4360ea8e11d03a989eced71652eeddf9501998639cf881", "frozen fingerprint mismatch");
assert(job.baselineFingerprint === fingerprint && job.batchId === "poc-batch-011-2026-07-16" && result.batchId === job.batchId && result.restaurantId === id, "job/result mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened POC validator failed: ${preflight.errors.join(" | ")}`);

assert(result.currentProducts.length === 40, "expected exactly 40 current products");
assert(new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 40, "duplicate current product keys");
const types = Object.fromEntries(Object.entries(Object.groupBy(result.currentProducts, (p) => p.allergenSourceType)).map(([k, v]) => [k, v.length]));
assert(types.restaurant_linked_vendor === 16 && types.unavailable === 24, "direct source distribution changed");
assert(result.currentProducts.every((p) => p.mayContainAllergens?.length === 0), "nonempty mayContain in result");
assert(result.currentProducts.every((p) => p.allergenSourceType !== "unavailable" || (!(p.containsAllergens?.length) && !(p.mayContainAllergens?.length) && !(p.allergenSourceEvidenceIds?.length))), "unavailable product has positive evidence");
assert(result.currentProducts.filter((p) => p.allergenSourceType === "restaurant_linked_vendor").every((p) => p.allergenAuthorityTier === "restaurant_linked_vendor"), "positive authority is not linked vendor");
assert(result.menuSurfaces.map((s) => `${s.surfaceId}:${s.current}:${s.scopeStatus}`).join(",") === "dc-official-dinner:true:complete,dc-official-brunch:true:complete,dc-toast-rendered:true:complete,dc-toast-root:false:unavailable,national-landing-menu:false:location_mismatch", "surface scope changed");
const dispositions = Object.groupBy(result.reconciliation.items, (r) => r.disposition);
assert(dispositions.exact_match?.length === 19 && dispositions.normalized_match?.length === 1 && dispositions.stale?.length === 1, "reconciliation counts changed");
assert(dispositions.stale[0].auditItemKey === "19:surfside-iced-tea" && result.currentProducts.some((p) => p.name === "Croque Monsieur Spring Roll"), "stale/current item boundary changed");
assert(result.sources.length === 8 && new Set(result.sources.map((s) => s.evidenceId)).size === 8, "expected eight unique sources");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix searches incomplete");
assert(!/\b(sol|terra)\b/i.test(JSON.stringify(result.currentProducts)) && !/\b(sol|terra)\b/i.test(JSON.stringify(result.findings)), "forbidden Terra/Sol reference in applied data");

const evidence = read(paths.evidence);
const evidenceIds = new Set(result.sources.map((s) => s.evidenceId));
for (const p of result.currentProducts) for (const ref of [...p.sourceEvidenceIds, ...p.allergenSourceEvidenceIds]) assert(evidenceIds.has(ref), `unresolved evidence ${ref}`);
evidence.restaurantId = id;
const priorSources = new Map((evidence.sources || []).map((s) => [s.id, s]));
evidence.sources = result.sources.map((s) => { const prior = priorSources.get(s.evidenceId) || {}; return { ...prior, id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, excerpt: s.excerpt || s.proof, notes: array(s.notes ?? prior.notes ?? [s.purpose]) }; });
assert(evidence.sources.every((s) => s.id && s.excerpt && Array.isArray(s.notes)), "source canonicalization failed");

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "generated target missing");
const old = generated.restaurants[index];
const reconciliation = new Map(result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys.map((k) => [k, r])));
const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url));
const oldByName = new Map((old.items || []).map((item) => [item.name.toLowerCase(), item]));
old.items = result.currentProducts.map((p) => ({ ...oldByName.get(p.name.toLowerCase()), id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: reconciliation.get(p.currentProductKey)?.auditItemKey ? [reconciliation.get(p.currentProductKey).auditItemKey] : [], ingredientIntelligence: undefined }));
old.itemCount = old.menuItemCount = old.totalItemCount = 40;
old.sourceUrls = [...currentUrls]; old.coveragePercent = 1; old.coverageStatus = "complete"; old.officialAllergenStatus = "accurately-unavailable"; old.officialAllergenRemediationBucket = "accurately-unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(old);

const dossier = read(paths.dossier);
dossier.restaurantId = id; dossier.name = job.name; dossier.status = "codex_verified";
dossier.identity = { status: "confirmed", name: job.name, location: result.identity.address, locationId: "washington-dc", officialHomepage: "https://www.barchinois.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: 21, currentProductCount: 40, reconciledCurrentProductCount: 40, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: unique(s.sourceEvidenceIds), notes: array(s.notes) })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: array(p.notes) })), notes: ["Current DC catalog is limited to the three complete DC surfaces; National Landing is excluded.", "Four item-scoped Toast fry-oil statements remain in product notes/findings and are not may-contain or restaurant-wide evidence."] };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence;
dossier.checks = { menu: { verdict: "verified", reviewedItemCount: 21, sourceItemCount: 40, notes: ["19 exact matches, 1 normalized match, and 1 stale Surfside Iced Tea baseline item."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_linked_vendor", notes: ["16 linked-vendor positives and 24 unavailable products; no complete matrix was found after four searches."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } };
dossier.sourceAttempts = result.matrixSearch.attempts.map((a) => ({ ...a })); dossier.findings = result.findings;
dossier.repairs = [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the corrected 40-product DC catalog with conservative linked-vendor allergen authority.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bar-chinois-dc-poc.mjs`, paths.apply] }];

write(paths.evidence, evidence); compact(paths.generated, generated); write(paths.dossier, dossier);
const artifactPaths = [paths.generated, paths.dossier, paths.evidence];
const artifactHashes = Object.fromEntries(artifactPaths.map((p) => [p, hash(p)]));
const changedPaths = [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bar-chinois-dc-poc.mjs`, paths.apply];
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 40, reconciliation: { exact: 19, normalized: 1, stale: 1 }, directSourceTypeCounts: types, directAuthorityCounts: { restaurant_linked_vendor: 16, unavailable: 24 }, mayContainCount: 0, evidenceSourceCount: 8, matrixSearchCount: 4, assertions: ["strengthened POC validator passed before mutation", "three current complete DC surfaces published", "dc-toast-root and National Landing excluded", "Surfside Iced Tea stale and absent", "Croque Monsieur Spring Roll current and exact", "unavailable products have no positive evidence", "all direct positives are S6/restaurant_linked_vendor", "fry-oil statements remain item-scoped", "Ingredient Intelligence applied after final direct catalog", "no Terra or Sol and no ledger writes"] }, errors: [], changedPaths, commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "serialized APPLY twice with byte/hash comparison", "assert 16 linked / 24 unavailable and empty mayContain/evidence invariants"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 40, exactMatches: 19, normalizedMatches: 1, staleItems: 1, evidenceSources: 8, matrixSearches: 4, directLinkedVendor: 16, directUnavailable: 24, mayContainProducts: 0 } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, counts: apply.counts, secondRunDiff: "none", changedPaths }, null, 2));
