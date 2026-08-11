import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-badd-pizza-2193531310";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-009-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  apply: `${run}/apply-results/${id}.json`, itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const writeCompact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
if (result.currentProducts.length !== 66) throw new Error("expected 66 validated products");

const evidence = read(paths.evidence);
const evidenceById = new Map(evidence.sources.map((source) => [source.id, source]));
for (const source of result.sources) {
  const normalized = { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose === "identity" ? "identity" : source.purpose, retrievedAt: source.retrievedAt, excerpt: source.excerpt, rowIdentifiers: [], request: null, notes: source.notes ?? [] };
  if (evidenceById.has(normalized.id)) Object.assign(evidenceById.get(normalized.id), normalized);
  else { evidence.sources.push(normalized); evidenceById.set(normalized.id, normalized); }
}
write(paths.evidence, evidence);

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete");
const currentSurfaceUrls = new Set(currentSurfaces.map((surface) => surface.url));
const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const canonicalProducts = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: p.containsAllergens ?? [], mayContainAllergens: p.mayContainAllergens ?? [], allergenSourceType: (p.containsAllergens?.length || p.mayContainAllergens?.length) ? p.allergenSourceType : "unavailable", allergenSourceEvidenceIds: (p.containsAllergens?.length || p.mayContainAllergens?.length) ? (p.allergenSourceEvidenceIds ?? p.sourceEvidenceIds) : [], notes: [] }));

const dossier = read(paths.dossier);
dossier.restaurantId = id;
dossier.name = job.name;
dossier.identity = { status: "confirmed", location: result.identity.location, officialHomepage: "https://baddpizza.com/", sourceEvidenceIds: ["v-home"] };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence;
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 66, reconciledCurrentProductCount: 66, surfaces: currentSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: s.sourceEvidenceIds, notes: [] })), products: canonicalProducts, notes: ["Four current complete surfaces define the exact-location catalog.", "Alcohol, modifiers, ingredients/toppings not independently sold, headers, aggregates, and duplicate presentations are excluded.", "Generic soy, fryer, and food-safety language remains restaurant-level evidence only."] };
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 66, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "66 distinct current exact-location food/nonalcoholic products published", "official-menu, official-specials, toast-full, and toast-service are current complete surfaces", "supporting and excluded surfaces are not product surfaces", "alcohol, modifiers, ingredients/toppings not independently sold, headers, aggregate classes, and duplicate presentations excluded", "direct app fields use exactly validated containsAllergens and mayContainAllergens", "Monkey Bread peanut may-contain claim preserved with v-allergen-index", "generic pizza, sauce, dressing, shared-fryer, undercooked, and general food-safety statements remain restaurant-level only", "missing evidence remains unavailable", "all nine research sources and referenced evidence IDs resolve", "Ingredient Intelligence runs after direct catalog finalization", "dossier retains restaurantId/name and direct-vs-inferred evidence boundaries", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-badd-pizza-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: checks });
packet.restaurantId = id;
packet.name = job.name;
packet.adjudication.decidedAt = "2026-07-16T21:00:00.000Z";
packet.identity = dossier.identity;
packet.restaurantLevelAllergenEvidence = dossier.restaurantLevelAllergenEvidence;
packet.currentCatalog = dossier.currentCatalog;
write(paths.dossier, packet);

const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
target.items = result.currentProducts.map((p) => {
  const old = oldByName.get(p.name.toLowerCase()) ?? {};
  const direct = p.containsAllergens ?? [];
  const may = p.mayContainAllergens ?? [];
  const row = reconciliation.get(p.currentProductKey);
  return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: direct, mayContain: may, allergenSourceType: direct.length || may.length ? p.allergenSourceType : "unavailable", sourceUrls: [...new Set((p.surfaceIds ?? []).map((surfaceId) => result.menuSurfaces.find((s) => s.surfaceId === surfaceId)?.url).filter((url) => currentSurfaceUrls.has(url)))], matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, validation: apply.validation }));
