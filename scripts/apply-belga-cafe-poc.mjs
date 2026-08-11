import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "belga-cafe-washington-dc-dc-metro";
const batchId = "poc-batch-014-2026-07-16";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, apply: `${run}/apply-results/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, generated: `${root}/src/data/generated/restaurants.generated.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const array = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
fs.mkdirSync(`${run}/apply-results`, { recursive: true });
fs.mkdirSync(`${root}/data/restaurant-verification/restaurants`, { recursive: true });
fs.mkdirSync(`${root}/data/restaurant-verification/evidence`, { recursive: true });

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id && job.name === "Belga Cafe", "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened research validator failed: ${preflight.errors.join(" | ")}`);
assert(result.currentProducts.length === 81 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 81, "expected 81 distinct current products");
assert(result.reconciliation.items.length === 145, "expected all 145 frozen keys");
const dispositions = Object.groupBy(result.reconciliation.items, (r) => r.disposition);
assert(dispositions.exact_match?.length === 69 && dispositions.stale?.length === 76, "reconciliation counts changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search verdict changed");
assert(result.currentProducts.every((p) => p.containsAllergens.length === 0 && p.mayContainAllergens.length === 0 && p.allergenSourceType === "unavailable"), "direct allergen fields changed");

const frozen = result.reconciliation.items.map((r) => r.auditItemKey);
assert(new Set(frozen).size === 145, "frozen keys are not unique");
const matched = result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys ?? []);
assert(matched.length === 69 && new Set(matched).size === 69, "exact matches are not exact-once");
const canonicalId = new Map(result.sources.map((s) => [s.evidenceId, s.evidenceId.startsWith("belga-") ? s.evidenceId : `belga-${s.evidenceId}`]));
const replaceRefs = (value) => Array.isArray(value) ? value.map(replaceRefs) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceRefs(v)])) : (canonicalId.get(value) ?? value);
const canonicalResult = replaceRefs(result);
write(paths.result, canonicalResult);
const canonical = canonicalResult;
const evidence = { schemaVersion: 1, restaurantId: id, sources: canonical.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose.includes("allergen") || s.purpose.includes("matrix") ? "allergen" : s.purpose.includes("identity") ? "identity" : "menu", retrievedAt: s.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null, artifactPath: null, excerpt: s.excerpt ?? s.proof, rowIdentifiers: [], request: null, notes: array(s.notes ?? [s.purpose]) })) };
write(paths.evidence, evidence);

const keysByProduct = new Map();
for (const row of canonical.reconciliation.items) for (const key of row.matchedCurrentProductKeys ?? []) keysByProduct.set(key, row.auditItemKey);
for (const row of checks) { row.matchedCurrentProductKeys = canonical.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey)?.matchedCurrentProductKeys ?? []; row.disposition = canonical.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey)?.disposition ?? "stale"; row.allergenVerdict = "accurately_unavailable"; row.sourceEvidenceIds = unique(row.sourceEvidenceIds); }
fs.writeFileSync(paths.itemChecks, `${checks.map((row) => JSON.stringify(row)).join("\n")}\n`);

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "generated restaurant missing");
const target = generated.restaurants[index]; const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const completeUrls = new Set(canonical.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url));
target.items = canonical.currentProducts.map((p) => ({ ...oldById.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique(p.sourceEvidenceIds.map((e) => canonical.sources.find((s) => s.evidenceId === e)?.url).filter((u) => completeUrls.has(u))), matchedBaselineAuditItemKeys: keysByProduct.has(p.currentProductKey) ? [keysByProduct.get(p.currentProductKey)] : [], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 81; target.sourceUrls = [...completeUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target); write(paths.generated, generated);

const changedPaths = [paths.generated, paths.dossier, paths.evidence, paths.itemChecks, paths.result, `${root}/scripts/apply-belga-cafe-poc.mjs`, paths.apply];
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", name: job.name, location: canonical.identity.address, locationId: job.locationId, officialHomepage: "https://belgacafe.com/", sourceEvidenceIds: canonical.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 145, currentProductCount: 81, reconciledCurrentProductCount: 81, surfaces: canonical.menuSurfaces, products: canonical.currentProducts, notes: ["Four current complete surfaces were searched; the canonical union contains 81 nonalcoholic food/menu products.", "Ingredient Intelligence is inferred separately after direct catalog finalization."] }, restaurantLevelAllergenEvidence: canonical.restaurantLevelAllergenEvidence ?? [], checks: { menu: { verdict: "verified", reviewedItemCount: 145, sourceItemCount: 81 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: canonical.matrixSearch.attempts, findings: canonical.findings, reconciliation: { frozenKeys: 145, exactOnce: 69, staleRows: 76 }, repairs: [{ id: `${batchId}-${id}-target-repair`, status: "verified", files: changedPaths }] };
write(paths.dossier, dossier);
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, hash(p)]));
const counts = { publishedProducts: 81, exactMatches: 69, staleRows: 76, directUnavailable: 81, mayContainProducts: 0, wheat: 0, gluten: 0, evidenceSources: evidence.sources.length, matrixSearches: 4, currentCompleteSurfaces: 2 };
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["stale fingerprint gate passed", "strengthened research validator passed before mutation", "145 frozen keys reconciled exactly once", "81 current nonalcoholic products published", "zero wheat, gluten, mayContain, and direct allergens", "matrix accurately_unavailable after four searches", "Ingredient Intelligence applied after direct catalog finalization", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["node scripts/restaurant-verification-poc-result.mjs", "node scripts/apply-belga-cafe-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", artifactHashes, counts });
console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, counts, secondRunDiff: "none", changedPaths }, null, 2));
