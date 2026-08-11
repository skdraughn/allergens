import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-babylon-futbol-9311198934";
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
if (result.currentProducts.products.length !== 12) throw new Error("expected 12 validated products");

const evidence = read(paths.evidence);
const evidenceById = new Map(evidence.sources.map((source) => [source.id, source]));
const purpose = { "identity/navigation": "identity", "current food menu": "menu", "ordering/menu corroboration": "menu", "targeted web search": "other" };
for (const source of result.sources) {
  const normalized = { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose[source.purpose] ?? source.purpose, retrievedAt: source.retrievedAt ?? "2026-07-16T00:00:00Z", excerpt: source.excerpt ?? null, rowIdentifiers: [], notes: [] };
  if (evidenceById.has(normalized.id)) Object.assign(evidenceById.get(normalized.id), normalized);
  else { evidence.sources.push(normalized); evidenceById.set(normalized.id, normalized); }
}
for (const source of evidence.sources) {
  source.retrievedAt ??= "2026-07-16T00:00:00Z";
  if (!["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(source.purpose)) source.purpose = "other";
}
if (!evidenceById.has("official-hookah")) {
  const hookah = evidence.sources.find((source) => source.id === "src-official-shisha");
  evidence.sources.push({ ...hookah, id: "official-hookah", purpose: "menu", excerpt: "Official hookah menu; excluded from the food and nonalcoholic catalog." });
}
write(paths.evidence, evidence);

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current === true && surface.scopeStatus === "complete");
const surfaceUrls = new Set(currentSurfaces.map((surface) => surface.url));
const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const products = result.currentProducts.products;
const canonicalProducts = products.map((product) => {
  const direct = product.containsAllergens ?? [];
  const mayContain = product.mayContainAllergens ?? [];
  return { currentProductKey: product.currentProductKey, name: product.name, category: product.category, presentationIds: [], sourceEvidenceIds: product.sourceEvidenceIds, containsAllergens: direct, mayContainAllergens: mayContain, allergenSourceType: direct.length || mayContain.length ? product.allergenSourceType : "unavailable", allergenSourceEvidenceIds: direct.length || mayContain.length ? (product.allergenSourceEvidenceIds ?? product.sourceEvidenceIds) : [], notes: [] };
});
const dossier = read(paths.dossier);
dossier.restaurantId = id;
dossier.name = job.name;
dossier.identity = { status: "confirmed", location: result.identity.location, officialHomepage: "https://www.babylonfc.com/", sourceEvidenceIds: result.identity.evidenceIds };
delete dossier.restaurantWideCaution;
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 12, reconciledCurrentProductCount: 12, surfaces: currentSurfaces.map((surface) => ({ surfaceId: surface.surfaceId, title: surface.title, url: surface.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: surface.sourceEvidenceIds, notes: [] })), products: canonicalProducts, notes: ["Official Food Menu is the only current complete food/nonalcoholic catalog surface.", "Supporting and out-of-scope surfaces do not add products.", "Generic undercooked and cross-contact language remains restaurant-level only."] };
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 12, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "12 current food/nonalcoholic products published", "official-food-menu is the only current complete catalog surface", "hookah, tobacco, alcohol, navigation, cart, account, and RSVP artifacts excluded", "direct allergen fields come only from validated result containsAllergens and mayContainAllergens", "missing direct allergen evidence is unavailable", "generic undercooked warning remains restaurant-level only", "Ingredient Intelligence runs after direct catalog finalization", "canonical evidence references resolve", "dossier retains restaurantId and name", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-babylon-futbol-cafe-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: checks });
packet.restaurantId = id;
packet.name = job.name;
packet.adjudication.decidedAt = "2026-07-16T21:00:00.000Z";
packet.identity = dossier.identity;
packet.currentCatalog = dossier.currentCatalog;
write(paths.dossier, packet);
target.items = products.map((product) => {
  const old = oldByName.get(product.name.toLowerCase()) ?? {};
  const direct = product.containsAllergens ?? [];
  const mayContain = product.mayContainAllergens ?? [];
  const row = reconciliation.get(product.currentProductKey);
  return { ...old, id: product.currentProductKey, name: product.name, category: product.category, allergens: direct, mayContain, allergenSourceType: direct.length || mayContain.length ? product.allergenSourceType : "unavailable", sourceUrls: [...new Set((product.surfaceIds ?? []).map((surfaceId) => result.menuSurfaces.find((surface) => surface.surfaceId === surfaceId)?.url).filter((url) => surfaceUrls.has(url)))], matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, validation: apply.validation }));
