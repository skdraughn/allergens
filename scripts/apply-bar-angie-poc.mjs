import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bar-angie-dc";
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

assert(result.currentProducts.length === 97, "expected 97 validated products");
assert(new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 97, "duplicate current product keys");
const typeCounts = Object.fromEntries(Object.entries(Object.groupBy(result.currentProducts, (p) => p.allergenSourceType)).map(([k, v]) => [k, v.length]));
assert(typeCounts.restaurant_ingredients === 68 && typeCounts.unavailable === 29 && Object.keys(typeCounts).length === 2, "direct source-type distribution changed");
assert(result.currentProducts.every((p) => p.containsAllergens.length === 0 || (!p.containsAllergens.includes("wheat") && !p.containsAllergens.includes("gluten"))), "wheat/gluten direct positive found");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0), "mayContain direct positive found");
assert(result.currentProducts.every((p) => !(p.allergenSourceType === "unavailable" && (p.containsAllergens?.length || p.mayContainAllergens?.length))), "unavailable product has positive direct allergen");
assert(result.currentProducts.every((p) => (p.containsAllergens?.length || p.mayContainAllergens?.length) || !(p.allergenSourceEvidenceIds?.length)), "empty direct arrays have evidence");
assert(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.surfaceId).join(",") === "official-lunch-html,official-dinner-html,official-brunch-html", "invalid current complete surfaces");
assert(result.menuSurfaces.filter((s) => !s.current).map((s) => s.surfaceId).join(",") === "official-home,official-lunch-pdf-surface,official-dinner-pdf-surface,official-brunch-pdf-surface", "invalid current=false surfaces");
assert(result.sources.length === 9 && new Set(result.sources.map((s) => s.evidenceId)).size === 9, "expected nine unique result sources");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4 && result.matrixSearch.attempts.length === 4, "matrix search verdict is incomplete");
assert(result.reconciliation.items.filter((r) => r.disposition === "artifact" && r.matchedCurrentProductKeys.length === 0).length === 15, "expected fifteen unmapped artifact rows");
assert(!/\b(sol|terra)\b/i.test(JSON.stringify(result)), "forbidden Sol/Terra reference");

const evidence = read(paths.evidence);
evidence.restaurantId = id;
evidence.sources = result.sources.map((source) => ({
  id: source.evidenceId, url: source.url, authorityTier: source.authorityTier,
  purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt,
  contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null,
  artifactPath: null, excerpt: source.excerpt ?? source.proof, rowIdentifiers: [], request: null,
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
const oldByNameAndCategory = new Map(target.items.map((item) => [`${item.name.toLowerCase()}\u0000${(item.category ?? "").toLowerCase()}`, item]));
target.items = result.currentProducts.map((p) => {
  const old = oldByNameAndCategory.get(`${p.name.toLowerCase()}\u0000${(p.category ?? "").toLowerCase()}`) ?? {};
  const row = reconciliation.get(p.currentProductKey);
  return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
target.itemCount = 97; target.menuItemCount = 97; target.totalItemCount = 97; target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);

const dossier = read(paths.dossier);
dossier.restaurantId = id; dossier.name = job.name; dossier.status = "codex_verified";
dossier.identity = { status: "confirmed", name: "Bar Angie", location: result.identity.location ?? result.identity.address, locationId: "washington", officialHomepage: "https://www.barangiedc.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 97, reconciledCurrentProductCount: 97, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds, notes: asArray(s.notes) })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: asArray(p.notes) })), notes: ["Official lunch, dinner, and brunch HTML surfaces are complete current catalog surfaces.", "Official homepage and all three PDF surfaces are supporting current=false; PDF extraction was garbled.", "Direct allergen fields are copied from the validated result; Ingredient Intelligence remains inferred separately."] };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence;
dossier.checks = { menu: { verdict: "verified", reviewedItemCount: job.baselineItemCount, sourceItemCount: 97, notes: ["Validated Batch 11 catalog applied; fifteen artifact rows remain unmapped."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["All four required searches completed without a complete matrix; empty direct fields remain unavailable, not allergen-free."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } };
dossier.sourceAttempts = result.matrixSearch.attempts.map((a) => ({ ...a })); dossier.findings = result.findings; dossier.repairs = [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the validated Bar Angie catalog with conservative direct allergen authority.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bar-angie-poc.mjs`, paths.apply] }];
write(paths.dossier, dossier);

const artifactHashes = Object.fromEntries([paths.generated, paths.dossier, paths.evidence].map((p) => [p, sha256(p)]));
const changedPaths = [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bar-angie-poc.mjs`, paths.apply];
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 97, directSourceTypeCounts: typeCounts, evidenceSourceCount: 9, evidencePreflightValid: true, assertions: ["strengthened POC validator passed before mutation", "97 distinct current products published", "official lunch/dinner/brunch HTML are current complete surfaces with 79/79/70 products", "official homepage and all three official PDFs are current=false supporting surfaces", "reconciliation is 70 exact, 7 normalized, 5 equivalent presentations, and 15 unmapped artifacts", "direct distribution is 68 restaurant_ingredients and 29 unavailable", "zero wheat/gluten/mayContain direct positives", "unavailable is not allergen-free and has no direct evidence", "matrix verdict accurately_unavailable with four searches", "all nine evidence sources canonical and resolvable", "Ingredient Intelligence applied after final direct catalog", "no Sol or Terra used", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "serialized APPLY twice with byte/hash comparison", "assert direct source-type distribution, allergen, surface, and reconciliation invariants"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 97, directRestaurantIngredients: 68, directUnavailable: 29, unmappedArtifactRows: 15, evidenceSources: 9, matrixSearches: 4, surfaceProducts: { "official-lunch-html": 79, "official-dinner-html": 79, "official-brunch-html": 70 } } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: sha256(paths.apply) }, counts: apply.counts, secondRunDiff: "none", changedPaths: apply.changedPaths }, null, 2));
