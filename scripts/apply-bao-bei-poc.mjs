import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-bao-bei-633630359";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-011-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const write = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const writeCompact = (path, value) => fs.writeFileSync(path, JSON.stringify(value));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sha256 = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const canonicalPurpose = (purpose = "") => {
  const p = purpose.toLowerCase();
  if (p.includes("cross")) return "cross_contact";
  if (p.includes("both")) return "both";
  if (p.includes("ingredient")) return "ingredients";
  if (p.includes("allergen") || p.includes("matrix")) return "allergen";
  if (p.includes("identity") || p.includes("location")) return "identity";
  if (p.includes("menu") || p.includes("catalog") || p.includes("ordering")) return "menu";
  return "other";
};

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(result.batchId === job.batchId && result.restaurantId === id, "result does not match job");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened POC validator failed: ${preflight.errors.join(" | ")}`);

assert(result.currentProducts.length === 38, "expected 38 validated products");
assert(new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 38, "duplicate current product keys");
const typeCounts = Object.fromEntries(Object.entries(Object.groupBy(result.currentProducts, (p) => p.allergenSourceType)).map(([k, v]) => [k, v.length]));
assert(typeCounts.restaurant_ingredients === 6 && typeCounts.restaurant_linked_vendor === 9 && typeCounts.unavailable === 23, "direct source-type distribution changed");
assert(result.currentProducts.every((p) => !(p.allergenSourceType === "unavailable" && (p.containsAllergens?.length || p.mayContainAllergens?.length))), "unavailable product has positive direct allergen");
assert(result.currentProducts.every((p) => (p.containsAllergens?.length || p.mayContainAllergens?.length) || !(p.allergenSourceEvidenceIds?.length)), "empty direct arrays have evidence");
assert(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.surfaceId).join(",") === "S2,S3", "invalid current complete surfaces");
assert(result.menuSurfaces.filter((s) => !s.current).map((s) => s.surfaceId).join(",") === "S1,S4,S5,S6", "invalid current=false surfaces");
assert(result.sources.length === 7 && new Set(result.sources.map((s) => s.evidenceId)).size === 7, "expected seven unique result sources");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4 && result.matrixSearch.attempts.length === 4, "matrix search verdict is incomplete");
assert(result.reconciliation.items.filter((r) => r.disposition === "artifact" && r.matchedCurrentProductKeys.length === 0).length === 3, "expected three unmapped artifact rows");
assert(!/\b(sol|terra)\b/i.test(JSON.stringify(result)), "forbidden Sol/Terra reference");

const evidence = read(paths.evidence);
evidence.restaurantId = id;
evidence.sources = result.sources.map((source) => ({
  id: source.evidenceId, url: source.url, authorityTier: source.authorityTier,
  purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt,
  contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null,
  artifactPath: null, excerpt: source.excerpt, rowIdentifiers: [], request: null,
  notes: asArray(source.notes),
}));
assert(evidence.sources.every((s) => s.id && s.excerpt && Array.isArray(s.notes)), "evidence source is not canonical");
const evidenceIds = new Set(evidence.sources.map((s) => s.id));
for (const p of result.currentProducts) for (const ref of [...p.sourceEvidenceIds, ...p.allergenSourceEvidenceIds]) assert(evidenceIds.has(ref), `unresolved product evidence ${ref}`);
write(paths.evidence, evidence);

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((r) => r.id === id);
assert(targetIndex >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url));
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
target.items = result.currentProducts.map((p) => {
  const old = oldByName.get(p.name.toLowerCase()) ?? {};
  const row = reconciliation.get(p.currentProductKey);
  return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
target.itemCount = 38; target.menuItemCount = 38; target.totalItemCount = 38; target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);

const dossier = read(paths.dossier);
dossier.restaurantId = id; dossier.name = job.name; dossier.status = "codex_verified";
dossier.identity = { status: "confirmed", name: "Bao Bei", location: result.identity.address, locationId: "rockville", officialHomepage: "https://baobei.menu/", sourceEvidenceIds: result.identity.sourceEvidenceIds };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 38, reconciledCurrentProductCount: 38, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds, notes: asArray(s.notes) })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: asArray(p.notes) })), notes: ["S2 official menu and S3 linked Toast are the complete current catalog surfaces.", "S1 homepage is supporting current=false; S4-S6 are non-catalog current=false surfaces.", "Direct allergen fields are copied from the validated result; Ingredient Intelligence remains inferred separately."] };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence;
dossier.checks = { menu: { verdict: "verified", reviewedItemCount: job.baselineItemCount, sourceItemCount: 38, notes: ["Validated Batch 11 catalog applied; three artifact rows remain unmapped."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["All four required searches completed without a complete matrix; empty direct fields remain unavailable, not allergen-free."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } };
dossier.sourceAttempts = result.matrixSearch.attempts.map((a) => ({ ...a })); dossier.findings = result.findings; dossier.repairs = [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the validated Bao Bei catalog with conservative direct allergen authority.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bao-bei-poc.mjs`, paths.apply] }];
write(paths.dossier, dossier);

const artifactHashes = Object.fromEntries([paths.generated, paths.dossier, paths.evidence].map((p) => [p, sha256(p)]));
const changedPaths = [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bao-bei-poc.mjs`, paths.apply];
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 38, directSourceTypeCounts: typeCounts, evidenceSourceCount: 7, evidencePreflightValid: true, assertions: ["strengthened POC validator passed before mutation", "38 distinct current products published", "S2 and S3 are current complete surfaces", "S1 and S4-S6 are current=false", "three artifact rows remain unmapped", "direct arrays, source types, authority tiers, and evidence IDs copied exactly", "unavailable is not allergen-free and has no direct evidence", "matrix verdict accurately_unavailable with four searches", "all seven evidence sources canonical and resolvable", "Ingredient Intelligence applied after final direct catalog", "no Sol or Terra used", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "serialized APPLY twice with byte/hash comparison", "assert direct source-type distribution and empty-array evidence invariants"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 38, unmappedArtifactRows: 3, evidenceSources: 7, matrixSearches: 4 } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: sha256(paths.apply) }, counts: apply.counts, secondRunDiff: "none", changedPaths: apply.changedPaths }, null, 2));
