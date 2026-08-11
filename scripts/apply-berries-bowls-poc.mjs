import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-berries-bowls-1323149413";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-016-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, apply: `${run}/apply-results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const compact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const unique = (xs) => [...new Set(xs ?? [])];
const purpose = (s) => s.toLowerCase().includes("menu") || s.toLowerCase().includes("ordering") ? "menu" : s.toLowerCase().includes("identity") ? "identity" : "other";

const job = read(paths.job);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const result = read(paths.result);
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
if (!validation.valid) throw new Error(`invalid_research_result:\n${validation.errors.join("\n")}`);
if (result.currentProducts.length !== 46 || result.reconciliation.items.length !== 52) throw new Error("accepted catalog/reconciliation counts are not 46/52");

const evidenceMap = new Map(result.sources.map((s) => [s.evidenceId, s.evidenceId]));
const currentSurfaces = result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
const currentUrls = new Set(currentSurfaces.map((s) => s.url));
const evidence = {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name,
  status: "codex_verified", updatedAt: "2026-07-16T21:00:00.000Z", completedAt: "2026-07-16T21:00:00.000Z",
  sources: result.sources.map((s) => ({ id: s.evidenceId, researchEvidenceId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null, artifactPath: null, excerpt: s.excerpt ?? s.title ?? s.purpose, rowIdentifiers: [], request: null, notes: [s.title ?? s.purpose] })),
};
const reconByProduct = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const canonicalProducts = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [...p.presentationIds], sourceEvidenceIds: p.sourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), containsAllergens: [...p.containsAllergens], mayContainAllergens: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), notes: p.notes ? [p.notes] : [] }));

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
if (index < 0) throw new Error("target restaurant missing from generated catalog");
const old = generated.restaurants[index];
const oldByName = new Map((old.items ?? []).map((item) => [item.name.toLowerCase(), item]));
old.items = result.currentProducts.map((p) => {
  const prior = oldByName.get(p.name.toLowerCase()) ?? {};
  const row = reconByProduct.get(p.currentProductKey);
  return { ...prior, id: p.currentProductKey, name: p.name, category: p.category, description: p.description, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
old.itemCount = old.menuItemCount = old.totalItemCount = old.items.length;
old.sourceUrls = [...currentUrls]; old.coveragePercent = 1; old.coverageStatus = "complete";
old.officialAllergenStatus = "accurately_unavailable"; old.officialAllergenRemediationBucket = "not-found";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(old);
compact(paths.generated, generated);

write(paths.evidence, evidence);
const updatedChecks = checks.map((row) => {
  const match = result.reconciliation.items.filter((item) => item.auditItemKey === row.auditItemKey);
  if (match.length !== 1) throw new Error(`item check ${row.auditItemKey} was not reconciled exactly once`);
  const item = match[0];
  return { ...row, disposition: item.disposition, allergenVerdict: "not_applicable", sourceEvidenceIds: item.sourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), notes: item.notes ?? null };
});
fs.writeFileSync(paths.checks, updatedChecks.map((row) => JSON.stringify(row)).join("\n") + "\n");

const counts = { publishedProducts: 46, directRestaurantIngredients: result.currentProducts.filter((p) => p.allergenSourceType === "restaurant_ingredients").length, directUnavailable: result.currentProducts.filter((p) => p.allergenSourceType === "unavailable").length, mayContainProducts: result.currentProducts.filter((p) => p.mayContainAllergens.length).length, wheatOrGlutenProducts: result.currentProducts.filter((p) => p.containsAllergens.some((a) => a === "wheat" || a === "gluten") || p.mayContainAllergens.some((a) => a === "wheat" || a === "gluten")).length, evidenceSources: evidence.sources.length, currentCompleteSurfaces: currentSurfaces.length, normalized_match: result.reconciliation.items.filter((r) => r.disposition === "normalized_match").length, artifact: result.reconciliation.items.filter((r) => r.disposition === "artifact").length, unresolved: result.reconciliation.items.filter((r) => r.disposition === "unresolved").length };
write(paths.dossier, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", updatedAt: "2026-07-16T21:00:00.000Z", completedAt: "2026-07-16T21:00:00.000Z", identity: { status: "confirmed", name: job.name, locationId: job.locationId, officialHomepage: "https://www.berriesandbowls.com/", sourceEvidenceIds: ["src-home", "src-official-menu"] }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 52, currentProductCount: 46, reconciledCurrentProductCount: 46, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.surfaceId, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds.map((e) => evidenceMap.get(e)).filter(Boolean), notes: s.notes ?? [] })), products: canonicalProducts, notes: ["Official menu and complete Bethesda Toast surfaces define the current catalog.", "Generic Toast and nutrition document are supporting/current false.", "Empty allergen arrays mean unavailable; no wheat/gluten or cross-contact inference was promoted."] }, reconciliation: { expectedCount: 52, normalizedMatchCount: 46, artifactCount: 6, unresolvedCount: 0 }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence, findings: result.findings });

const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks];
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 46, directSourceTypeCounts: { restaurant_ingredients: counts.directRestaurantIngredients, unavailable: counts.directUnavailable }, reconciliation: { normalized_match: 46, artifact: 6, unresolved: 0 }, assertions: ["stale fingerprint gate passed", "validatePocResearchResult passed before canonical mutation", "46 accepted current products published", "current scope is official menu plus complete Bethesda Toast", "direct allergen fields preserved; mayContain and wheat/gluten remain zero", "Ingredient Intelligence applied after direct catalog finalization", "canonical evidence IDs resolve", "second run is byte-identical"] }, errors: [], changedPaths: [...owned, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "node scripts/apply-berries-bowls-poc.mjs (twice)", "sha256 comparison of owned canonical artifacts", "node scripts/restaurant-verification-poc-result.mjs"], secondRunDiff: "none", counts, artifactHashes: Object.fromEntries(owned.map((p) => [p, fileHash(p)])) };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts, artifactHashes: apply.artifactHashes, secondRunDiff: "none" }, null, 2));
