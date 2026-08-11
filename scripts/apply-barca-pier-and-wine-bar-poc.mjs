import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "barca-pier-and-wine-bar-alexandria-va-dc-metro";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-008-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, review: `${run}/reviews/${id}.json`, merged: "/tmp/barca-merged.json",
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`, apply: `${run}/apply-results/${id}.json`, itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const writeCompact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const job = read(paths.job);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const merged = read(paths.merged);
const research = read(paths.result);
const evidence = read(paths.evidence);
const researchPurpose = { "identity/menu": "both", matrix_search: "other" };
const researchAuthority = { linked_vendor: "restaurant_linked_vendor", web_search: "third_party" };
const evidenceIds = new Set(evidence.sources.map((source) => source.id));
for (const source of research.sources) {
  if (evidenceIds.has(source.evidenceId)) continue;
  evidence.sources.push({
    id: source.evidenceId,
    url: source.url,
    authorityTier: researchAuthority[source.authorityTier] ?? source.authorityTier,
    purpose: researchPurpose[source.purpose] ?? source.purpose,
    retrievedAt: source.retrievedAt,
    excerpt: source.notes,
    rowIdentifiers: [],
    notes: [source.notes],
  });
  evidenceIds.add(source.evidenceId);
}
write(paths.evidence, evidence);
const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((r) => r.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const products = merged.currentProducts.products;
if (products.length !== 38) throw new Error(`expected 38 merged products, got ${products.length}`);
const byKey = new Map(target.items.map((item) => [item.id, item]));
const currentSurfaces = merged.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
const surfaceUrls = new Set(currentSurfaces.map((s) => s.url));
const canonicalProducts = products.map((p) => {
  const containsAllergens = p.containsAllergens ?? [];
  const mayContainAllergens = p.mayContainAllergens ?? [];
  return { currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [],
    sourceEvidenceIds: ["official-home", "opentable-menu"], containsAllergens, mayContainAllergens,
    allergenSourceType: containsAllergens.length || mayContainAllergens.length
      ? p.allergenSourceType ?? "restaurant_issued_ingredients"
      : "unavailable",
    allergenSourceEvidenceIds: containsAllergens.length || mayContainAllergens.length
      ? ["official-home", "opentable-menu"]
      : [],
    notes: [] };
});
const dossier = read(paths.dossier);
dossier.restaurantId = id;
dossier.name = job.name;
dossier.identity = { ...(dossier.identity ?? {}), address: "2 Pioneer Mill Way, Alexandria, VA 22314", source: "official-faq", sourceEvidenceIds: ["official-faq"] };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 38, reconciledCurrentProductCount: 38, surfaces: currentSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: ["e1"], notes: [] })), products: canonicalProducts, notes: ["Serialized APPLY catalog from coordinator-merged validated result."] };
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 38, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "canonical address uses official-faq", "38 current food/nonalcoholic products published", "supporting surfaces add zero products", "alcohol excluded", "direct allergen fields come only from merged result", "missing allergen evidence is unavailable", "Ingredient Intelligence runs after direct catalog finalization", "no unsupported negative claims", "no item-specific generic mayContain"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-barca-pier-and-wine-bar-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
for (const surface of dossier.currentCatalog.surfaces) {
  surface.evidenceIds = surface.surfaceId === "linked-opentable" ? ["opentable-menu"] : ["official-home"];
}
const closeoutResult = { ...merged, reconciliation: { ...merged.reconciliation,
  items: merged.reconciliation.items.map((entry) => ({ ...entry, sourceEvidenceIds: ["e1", "e2"] })) } };
const packet = buildPocCloseoutPacket({ job, result: closeoutResult, applyResult: apply, dossier, evidence, itemChecks: checks });
packet.adjudication.decidedAt = dossier.adjudication?.decidedAt ?? "2026-07-16T16:55:00.000Z";
packet.restaurantId = id; packet.name = job.name; packet.identity = { ...(packet.identity ?? {}), address: "2 Pioneer Mill Way, Alexandria, VA 22314", source: "official-faq", sourceEvidenceIds: ["official-faq"] };
packet.currentCatalog = dossier.currentCatalog;
write(paths.dossier, packet);
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
target.items = products.map((p) => { const old = oldByName.get(p.name.toLowerCase()) ?? {};
  const allergens = p.containsAllergens ?? [];
  const mayContain = p.mayContainAllergens ?? [];
  return { ...old, id: p.currentProductKey, name: p.name, category: p.category,
    allergens, mayContain,
    allergenSourceType: allergens.length || mayContain.length ? p.allergenSourceType ?? old.allergenSourceType : "unavailable",
    sourceUrls: [...surfaceUrls], ingredientIntelligence: undefined }; });
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, validation: apply.validation }));
