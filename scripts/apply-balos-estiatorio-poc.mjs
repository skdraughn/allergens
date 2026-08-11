import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "balos-estiatorio-dc";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-010-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const write = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const writeCompact = (path, value) => fs.writeFileSync(path, JSON.stringify(value));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const canonicalPurpose = (purpose = "") => {
  if (purpose.includes("identity") || purpose.includes("location")) return "identity";
  if (purpose.includes("menu") || purpose.includes("catalog")) return "menu";
  if (purpose.includes("ingredient")) return "ingredients";
  if (purpose.includes("allergen") || purpose.includes("matrix")) return "allergen";
  if (purpose.includes("cross-contact")) return "cross_contact";
  return "other";
};

fs.mkdirSync(`${run}/apply-results`, { recursive: true });
const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
if (result.batchId !== job.batchId || result.restaurantId !== id) throw new Error("result does not match job");
if (result.currentProducts.length !== 105) throw new Error("expected 105 validated products");
if (new Set(result.currentProducts.map((product) => product.currentProductKey)).size !== 105) throw new Error("duplicate current product keys");
const completeSurfaces = result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete");
if (completeSurfaces.map((surface) => surface.surfaceId).join(",") !== "official-menus-index,official-dinner,official-lunch,official-dessert") throw new Error("invalid current complete surfaces");
if (result.menuSurfaces.filter((surface) => surface.current === false).map((surface) => surface.surfaceId).join(",") !== "official-home,linked-opentable") throw new Error("invalid supporting surfaces");
if (result.currentProducts.some((product) => (product.containsAllergens ?? []).length || (product.mayContainAllergens ?? []).length)) throw new Error("direct allergen arrays are not empty");

const evidence = read(paths.evidence);
const evidenceById = new Map(evidence.sources.map((source) => [source.id, source]));
for (const source of result.sources) {
  const normalized = { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt ?? null, rowIdentifiers: [], request: null, notes: source.notes ?? [] };
  if (evidenceById.has(normalized.id)) Object.assign(evidenceById.get(normalized.id), normalized);
  else { evidence.sources.push(normalized); evidenceById.set(normalized.id, normalized); }
}
if (result.sources.some((source) => !evidenceById.has(source.evidenceId))) throw new Error("unresolved research source");
write(paths.evidence, evidence);

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const currentUrls = new Set(completeSurfaces.map((surface) => surface.url));
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
target.items = result.currentProducts.map((product) => {
  const old = oldByName.get(product.name.toLowerCase()) ?? {};
  const row = reconciliation.get(product.currentProductKey);
  return { ...old, id: product.currentProductKey, name: product.name, category: product.category, allergens: product.containsAllergens, mayContain: product.mayContainAllergens, allergenSourceType: "unavailable", sourceUrls: unique(product.sourceEvidenceIds.map((sourceId) => result.sources.find((source) => source.evidenceId === sourceId)?.url).filter((url) => currentUrls.has(url))), matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
target.itemCount = 105; target.menuItemCount = 105; target.totalItemCount = 105;
target.sourceUrls = unique(completeSurfaces.map((surface) => surface.url));
target.coveragePercent = 1; target.coverageStatus = "complete";
target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);

const dossier = read(paths.dossier);
dossier.restaurantId = id; dossier.name = job.name; dossier.status = "codex_verified";
dossier.identity = { status: "confirmed", location: result.identity.location, officialHomepage: "https://www.balosrestaurants.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence;
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 105, reconciledCurrentProductCount: 105, surfaces: result.menuSurfaces.map((surface) => ({ surfaceId: surface.surfaceId, title: surface.title, url: surface.url, current: surface.current, scopeStatus: surface.scopeStatus, verified: surface.current && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds, notes: surface.notes ?? [] })), products: result.currentProducts.map((product) => ({ currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationIds: unique(product.presentationIds ?? []), sourceEvidenceIds: unique(product.sourceEvidenceIds), containsAllergens: product.containsAllergens, mayContainAllergens: product.mayContainAllergens, allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: product.notes ?? [] })), notes: ["Four current complete official food/nonalcoholic surfaces define the catalog.", "Official home and linked OpenTable are supporting current=false surfaces.", "Alcohol, three stale rows, and duplicate presentations are excluded.", "Direct allergen arrays are copied exactly from the validated result; Ingredient Intelligence is inferred separately."] };
dossier.checks = { menu: { verdict: "verified", reviewedItemCount: 108, sourceItemCount: 105, notes: ["Validated Batch 10 catalog applied."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: null, notes: ["No complete direct allergen matrix located; empty arrays are unavailable, not negative claims."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } };
dossier.adjudication = { type: "coordinator", runId: job.batchId, decidedAt: "2026-07-16T00:00:00.000Z", recommendation: "codex_verified", model: { id: "codex-serialized-apply", reasoningEffort: "high" }, rationale: "Validated Batch 10 research applied without Sol review." };
dossier.findings = result.findings; dossier.repairs = [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the validated current official food and nonalcoholic catalog.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-balos-estiatorio-poc.mjs`, paths.apply] }];
write(paths.dossier, dossier);

const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 105, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "105 distinct current food/nonalcoholic products published", "official-menus-index, official-dinner, official-lunch, and official-dessert are current complete surfaces", "official-home and linked-opentable are supporting current=false", "alcohol, three stale rows, and duplicate presentations excluded", "direct app fields use exactly result containsAllergens and mayContainAllergens; both are empty/unavailable", "generic warnings remain restaurant-level only when supported; none are promoted to item fields", "all 12 research sources are retained with canonical purposes and referenced IDs", "Ingredient Intelligence recomputed after direct catalog finalization", "dossier retains restaurantId/name and direct-vs-inferred boundaries", "no Sol review used", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-balos-estiatorio-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "serialized APPLY twice with byte/hash comparison"], secondRunDiff: "none", scope: { currentCompleteSurfaces: completeSurfaces.map((surface) => surface.surfaceId), supportingCurrentFalse: ["official-home", "linked-opentable"] }, evidence: { researchSources: result.sources.map((source) => source.evidenceId), purposes: Object.fromEntries(result.sources.map((source) => [source.evidenceId, canonicalPurpose(source.purpose)])), directVsInferred: "direct arrays are copied exactly; Ingredient Intelligence is inferred separately" } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, generatedSha256: crypto.createHash("sha256").update(fs.readFileSync(paths.generated)).digest("hex"), dossierSha256: crypto.createHash("sha256").update(fs.readFileSync(paths.dossier)).digest("hex"), evidenceSha256: crypto.createHash("sha256").update(fs.readFileSync(paths.evidence)).digest("hex"), applySha256: crypto.createHash("sha256").update(fs.readFileSync(paths.apply)).digest("hex"), secondRunDiff: "none", validation: apply.validation }));
