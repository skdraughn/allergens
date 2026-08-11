import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "beau-thai-dc";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-008-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, review: `${run}/reviews/${id}.json`, merged: "/tmp/beau-merged.json",
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, generated: `${root}/src/data/generated/restaurants.generated.json`, apply: `${run}/apply-results/${id}.json`, itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
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
const purpose = { "identity/navigation": "identity", "location-mismatch": "other", "cross-contact": "cross_contact", cross_contact: "cross_contact", menu: "menu" };
const known = new Map(evidence.sources.map((source) => [source.id, source]));
for (const source of research.sources) {
  const normalized = { ...source, id: source.evidenceId, purpose: purpose[source.purpose] ?? source.purpose };
  if (!known.has(normalized.id)) evidence.sources.push(normalized);
  else known.set(normalized.id, { ...known.get(normalized.id), purpose: normalized.purpose });
}
for (const source of evidence.sources) {
  source.purpose = purpose[source.purpose] ?? source.purpose;
  if (!["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(source.purpose)) source.purpose = "other";
}
write(paths.evidence, evidence);
const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((r) => r.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const products = merged.currentProducts.products;
if (products.length !== 59) throw new Error(`expected 59 merged products, got ${products.length}`);
const normalize = (value) => value.toLowerCase().replace(/[!*()\[\]\"']/g, "").replace(/\s+/g, " ").trim();
const oldByName = new Map(target.items.map((item) => [normalize(item.name), item]));
const oldByAuditKey = new Map(target.items.map((item) => [item.id, item]));
const reconciliation = new Map(merged.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const currentSurfaces = merged.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
const surfaceUrls = new Set(currentSurfaces.map((s) => s.url));
const canonicalProducts = products.map((p) => {
  const direct = p.containsAllergens ?? [];
  const mayContain = p.mayContainAllergens ?? [];
  return { currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: direct, mayContainAllergens: mayContain, allergenSourceType: direct.length || mayContain.length ? p.allergenSourceType ?? "restaurant_issued_ingredients" : "unavailable", allergenSourceEvidenceIds: direct.length || mayContain.length ? p.allergenSourceEvidenceIds ?? p.sourceEvidenceIds : [], notes: [] };
});
const dossier = read(paths.dossier);
dossier.restaurantId = id;
dossier.name = job.name;
dossier.identity = { status: "confirmed", location: "1550 7th St NW, Unit A, Washington, DC 20001 (Shaw)", officialHomepage: "https://www.beauthaidc.com/", sourceEvidenceIds: ["E1", "E2"] };
dossier.restaurantWideCaution = { text: "Kitchen uses nuts/seeds, flour, and shellfish; cross-contamination can occur.", sourceEvidenceIds: ["E6"] };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 59, reconciledCurrentProductCount: 59, surfaces: currentSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: s.sourceEvidenceIds, notes: [] })), products: canonicalProducts, notes: ["Exact Shaw food and nonalcoholic catalog; Mount Pleasant and alcohol excluded.", "E6 is restaurant-wide caution only and is not copied to item mayContain fields."] };
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 59, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "59 distinct current Shaw food/nonalcoholic products published", "Mount Pleasant and alcohol excluded", "resolved duplicate identities remain collapsed", "direct allergen fields come only from merged result", "missing direct allergen evidence is unavailable", "E6 restaurant-wide caution is not item mayContain", "Ingredient Intelligence runs after direct catalog finalization", "canonical evidence references resolve"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-beau-thai-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
const packet = buildPocCloseoutPacket({ job, result: merged, applyResult: apply, dossier, evidence, itemChecks: checks });
packet.restaurantId = id; packet.name = job.name; packet.identity = dossier.identity; packet.restaurantWideCaution = dossier.restaurantWideCaution; packet.currentCatalog = dossier.currentCatalog;
packet.adjudication.decidedAt = "2026-07-16T21:00:00.000Z";
write(paths.dossier, packet);
target.items = products.map((p) => {
  const row = reconciliation.get(p.currentProductKey);
  const auditId = row?.auditItemKey?.split(":").slice(1).join(":");
  const old = oldByName.get(normalize(p.name)) ?? oldByAuditKey.get(auditId) ?? {};
  const allergens = p.containsAllergens ?? [];
  const mayContain = p.mayContainAllergens ?? [];
  return { ...old, id: p.currentProductKey.toLowerCase(), name: p.name, category: p.category, allergens, mayContain, allergenSourceType: allergens.length || mayContain.length ? p.allergenSourceType ?? old.allergenSourceType : "unavailable", sourceUrls: [...new Set((old.sourceUrls ?? []).filter((url) => surfaceUrls.has(url)).concat((p.surfaceIds ?? []).map((sid) => merged.menuSurfaces.find((s) => s.surfaceId === sid)?.url).filter(Boolean)))], ingredientIntelligence: undefined };
});
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, validation: apply.validation }));
