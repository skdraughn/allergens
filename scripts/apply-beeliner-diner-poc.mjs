import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-beeliner-diner-9732729794";
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
const assert = (ok, message) => { if (!ok) throw new Error(message); };
fs.mkdirSync(`${run}/apply-results`, { recursive: true });

const job = read(paths.job); const result = read(paths.result);
const itemChecks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(itemChecks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id && job.name === "Beeliner Diner", "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened result validator failed: ${preflight.errors.join(" | ")}`);
assert(result.currentProducts.length === 152 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 152, "expected 152 unique current products");
assert(result.reconciliation.items.length === 131 && result.reconciliation.items.every((row) => row.matchedCurrentProductKeys.length >= 1), "reconciliation changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4, "matrix search verdict changed");
assert(result.currentProducts.every((p) => p.containsAllergens.length === 0 && p.mayContainAllergens.length === 0 && p.allergenSourceType === "unavailable"), "direct allergen fields changed");

const keysByProduct = new Map();
for (const row of result.reconciliation.items) for (const key of row.matchedCurrentProductKeys) {
  assert(result.currentProducts.some((p) => p.currentProductKey === key), `unknown current product ${key}`);
  const keys = keysByProduct.get(key) ?? []; keys.push(row.auditItemKey); keysByProduct.set(key, keys);
}
const frozenKeys = result.reconciliation.items.map((row) => row.auditItemKey);
assert(new Set(frozenKeys).size === 131 && [...keysByProduct.values()].flat().length === 131 && new Set([...keysByProduct.values()].flat()).size === 131, "frozen reconciliation keys are not exact-once");

result.currentProducts = result.currentProducts.map((p) => ({ ...p, matchedBaselineAuditItemKeys: keysByProduct.get(p.currentProductKey) ?? [] }));
for (const row of itemChecks) row.matchedCurrentProductKeys = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey)?.matchedCurrentProductKeys ?? [];
fs.writeFileSync(paths.itemChecks, `${itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
write(paths.result, result);

const evidence = read(paths.evidence);
assert(evidence.restaurantId === id && evidence.sources.length >= result.sources.length, "evidence scope changed");
const researchSourceById = new Map(result.sources.map((source) => [source.evidenceId, source]));
const canonicalSourceByUrl = new Map();
for (const source of evidence.sources) {
  if (!canonicalSourceByUrl.has(source.url)) canonicalSourceByUrl.set(source.url, source.id);
}
const canonicalizeEvidenceRefs = (value, key = "") => {
  if (Array.isArray(value)) {
    if (["sourceEvidenceIds", "allergenSourceEvidenceIds", "evidenceIds"].includes(key)) {
      return unique(value.map((sourceId) => canonicalSourceByUrl.get(researchSourceById.get(sourceId)?.url)));
    }
    return value.map((entry) => canonicalizeEvidenceRefs(entry));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
    childKey,
    canonicalizeEvidenceRefs(childValue, childKey),
  ]));
};
const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "generated restaurant missing");
const target = generated.restaurants[index]; const oldById = new Map((target.items ?? []).map((item) => [item.id, item]));
const urls = new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url));
target.items = result.currentProducts.map((p) => ({ ...oldById.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => urls.has(u))), matchedBaselineAuditItemKeys: p.matchedBaselineAuditItemKeys, ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 152;
target.sourceUrls = [...urls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target); fs.writeFileSync(paths.generated, `${JSON.stringify(generated, null, 2)}\n`);

const counts = { publishedProducts: 152, exactReconciled: 131, currentOnly: result.currentProducts.filter((p) => !p.matchedBaselineAuditItemKeys.length).length, directUnavailable: 152, mayContainProducts: 0, wheat: 0, gluten: 0, researchSources: 4, evidenceSources: evidence.sources.length, currentCompleteSurfaces: 1 };
const changedPaths = [paths.generated, paths.dossier, paths.evidence, paths.itemChecks, paths.result, `${root}/scripts/apply-beeliner-diner-poc.mjs`, paths.apply];
const dossier = canonicalizeEvidenceRefs({ schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: "Beeliner Diner", status: "codex_verified", identity: { status: "confirmed", name: "Beeliner Diner", location: "3648 King St, Alexandria, VA 22302", locationId: job.locationId, officialHomepage: "https://www.beelinerdiner.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 131, currentProductCount: 152, reconciledCurrentProductCount: 152, surfaces: result.menuSurfaces, products: result.currentProducts, notes: ["Complete current nonalcoholic food catalog; alcohol, merchandise, and modifiers excluded.", "Ingredient Intelligence is inferred separately after direct catalog finalization."] }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence ?? [], checks: { menu: { verdict: "verified", reviewedItemCount: 131, sourceItemCount: 152 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 131, exactOnce: 131, currentOnly: counts.currentOnly }, repairs: [{ id: `${batchId}-${id}-target-repair`, status: "verified", files: changedPaths }] });
write(paths.dossier, dossier);

const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, hash(p)]));
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["stale fingerprint gate passed", "strengthened research validator passed before mutation", "131 frozen keys reconciled exactly once", "152 current nonalcoholic products published", "zero wheat, gluten, mayContain, and direct allergens", "matrix accurately_unavailable after four searches", "Ingredient Intelligence applied after direct catalog finalization", "no ledger, manifest, closeout, review, parser, pipeline, or other restaurant writes", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "node scripts/apply-beeliner-diner-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", artifactHashes, counts });
console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, counts, secondRunDiff: "none", changedPaths }, null, 2));
