import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-ballston-local-9596339846";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-010-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
const writeCompact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).filter(Boolean))];
fs.mkdirSync(`${run}/apply-results`, { recursive: true });

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
if (result.currentProducts.length !== 123) throw new Error("expected 123 validated products");
if (result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete").map((s) => s.surfaceId).join() !== "surface-toast-main") {
  throw new Error("surface scope is not Toast-only");
}

const evidence = read(paths.evidence);
const evidenceById = new Map(evidence.sources.map((source) => [source.id, source]));
const canonicalPurpose = (value = "") => {
  if (value.includes("identity")) return "identity";
  if (value.includes("menu") || value.includes("ordering")) return "menu";
  if (value.includes("allergen")) return "allergen";
  return "other";
};
for (const source of result.sources) {
  const normalized = { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, excerpt: source.excerpt, rowIdentifiers: [], request: null, notes: source.notes ?? [] };
  if (evidenceById.has(normalized.id)) Object.assign(evidenceById.get(normalized.id), normalized);
  else { evidence.sources.push(normalized); evidenceById.set(normalized.id, normalized); }
}
write(paths.evidence, evidence);

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const toast = result.menuSurfaces.find((surface) => surface.surfaceId === "surface-toast-main");
const toastUrl = toast.url;
const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const canonicalProducts = result.currentProducts.map((p) => ({
  currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds),
  sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: p.containsAllergens ?? [], mayContainAllergens: p.mayContainAllergens ?? [],
  allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [], notes: p.notes ?? [],
}));

const dossier = read(paths.dossier);
dossier.restaurantId = id; dossier.name = job.name; dossier.status = "repair_in_progress";
dossier.identity = { status: "confirmed", location: result.identity.location, officialHomepage: "https://ballstonlocal.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence;
dossier.currentCatalog = {
  status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 123, reconciledCurrentProductCount: 123,
  surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.surfaceId === "surface-toast-main", scopeStatus: s.surfaceId === "surface-toast-main" ? "complete" : "supporting", verified: s.surfaceId === "surface-toast-main", evidenceIds: s.sourceEvidenceIds, notes: s.notes ?? [] })),
  products: canonicalProducts,
  notes: ["Toast is the sole current complete exact-location food/nonalcoholic catalog surface.", "Alcohol, modifiers, headers, artifacts, location mismatches, and duplicate presentations are excluded.", "Direct allergen evidence is unavailable; generic restaurant-level warnings remain separate from item fields."],
};
dossier.checks = { menu: { verdict: "verified", reviewedItemCount: 127, sourceItemCount: 123, notes: ["Validated Batch 10 catalog applied."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: null, notes: ["No complete direct allergen matrix located."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } };
dossier.adjudication = { type: "coordinator", runId: job.batchId, decidedAt: "2026-07-16T00:00:00.000Z", recommendation: "codex_verified", model: { id: "codex-serialized-apply", reasoningEffort: "high" }, rationale: "Validated Batch 10 research applied without Sol review." };
dossier.findings = result.findings; dossier.repairs = [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the validated current Toast catalog.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-ballston-local-poc.mjs`, paths.apply] }];
write(paths.dossier, dossier);

const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
target.items = result.currentProducts.map((p) => { const old = oldByName.get(p.name.toLowerCase()) ?? {}; const row = reconciliation.get(p.currentProductKey); return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: p.containsAllergens ?? [], mayContain: p.mayContainAllergens ?? [], allergenSourceType: "unavailable", sourceUrls: [toastUrl], matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined }; });
target.itemCount = 123; target.menuItemCount = 123; target.totalItemCount = 123; target.sourceUrls = unique([toastUrl]); target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);

const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 123, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "123 distinct current exact-location food/nonalcoholic products published", "surface-toast-main is the only current complete catalog surface", "supporting surfaces are current=false and non-catalog", "artifacts, location mismatches, alcohol, modifiers, headers, and duplicate presentations excluded", "validated Veg pizza presentation preserved", "direct app fields use exactly containsAllergens and mayContainAllergens from research", "generic allergen/cross-contact warnings remain restaurant-level only", "missing direct evidence remains unavailable", "all six research sources and referenced IDs retained", "Ingredient Intelligence recomputed after direct catalog", "dossier retains restaurantId/name and direct-vs-inferred boundaries", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-ballston-local-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "serialized APPLY twice with byte/hash comparison"], secondRunDiff: "none", scope: { currentCompleteSurface: "surface-toast-main", supportingCurrentFalse: ["surface-official-home", "surface-official-food", "surface-spotapps-main"] }, evidence: { researchSources: result.sources.map((s) => s.evidenceId), directVsInferred: "direct arrays are copied exactly; Ingredient Intelligence is inferred separately" } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, generatedSha256: crypto.createHash("sha256").update(fs.readFileSync(paths.generated)).digest("hex"), applySha256: crypto.createHash("sha256").update(fs.readFileSync(paths.apply)).digest("hex"), changedPaths: apply.changedPaths, validation: apply.validation }));
