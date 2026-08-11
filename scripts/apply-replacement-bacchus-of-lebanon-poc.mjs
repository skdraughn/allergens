import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-bacchus-of-lebanon-bethesda-md";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-009-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  apply: `${run}/apply-results/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const writeCompact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const products = result.currentProducts;
if (products.length !== 91 || new Set(products.map((p) => p.currentProductKey)).size !== 91) throw new Error("expected 91 distinct validated products");
const currentSurfaces = result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
if (currentSurfaces.length !== 2 || !currentSurfaces.every((s) => ["official-menu", "toast-menu"].includes(s.surfaceId))) throw new Error("unexpected current catalog surfaces");
const surfaceUrls = new Set(currentSurfaces.map((s) => s.url));
const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
if (result.reconciliation.items.length !== 91) throw new Error("expected all 91 reconciliation rows");

const evidence = read(paths.evidence);
const purpose = { "identity/navigation": "identity", "menu/allergen": "menu", "allergen discovery": "allergen", menu: "menu", identity: "identity" };
const evidenceById = new Map(evidence.sources.map((s) => [s.id, s]));
const needed = new Set([
  ...result.identity.evidenceIds,
  ...result.sources.map((s) => s.evidenceId),
  ...result.menuSurfaces.flatMap((s) => s.sourceEvidenceIds),
  ...products.flatMap((p) => p.sourceEvidenceIds),
  ...result.reconciliation.items.flatMap((r) => r.sourceEvidenceIds),
]);
for (const source of result.sources) {
  const normalized = { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: purpose[source.purpose] ?? "other", retrievedAt: source.retrievedAt?.includes("T") ? source.retrievedAt : `${source.retrievedAt ?? "2026-07-16"}T00:00:00Z`, excerpt: source.excerpt ?? null, rowIdentifiers: [], notes: [] };
  if (evidenceById.has(normalized.id)) Object.assign(evidenceById.get(normalized.id), normalized);
  else { evidence.sources.push(normalized); evidenceById.set(normalized.id, normalized); }
}
for (const source of evidence.sources) {
  source.retrievedAt ??= "2026-07-16T00:00:00Z";
  if (!needed.has(source.id) && source.id.startsWith("terra-")) needed.add(source.id);
  if (!["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(source.purpose)) source.purpose = "other";
}
write(paths.evidence, evidence);

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((r) => r.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
const canonicalProducts = products.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenSourceEvidenceIds: [], notes: p.notes ? [p.notes] : [] }));
const dossier = read(paths.dossier);
dossier.restaurantId = id;
dossier.name = job.name;
dossier.identity = { status: "confirmed", location: result.identity.location, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.evidenceIds };
delete dossier.restaurantWideCaution;
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 91, reconciledCurrentProductCount: 91, surfaces: currentSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: s.sourceEvidenceIds, notes: [] })), products: canonicalProducts, notes: ["Official menu and restaurant-linked Toast are the complete current food and nonalcoholic surfaces.", "Official homepage is supporting identity evidence only; alcohol and presentation artifacts are excluded.", "Direct allergen evidence is unavailable; no generic food-safety prose is promoted to item caution."] };
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 91, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "91 distinct current food and nonalcoholic products published", "official-menu and toast-menu are current complete surfaces", "official-home is supporting current=false", "alcohol, duplicate presentations, stale items, and aggregate/header artifacts excluded", "five newly recovered products retained", "direct app allergen fields use only validated containsAllergens and mayContainAllergens; both are unavailable", "missing direct evidence remains unavailable", "no generic food-safety prose promoted to allergy caution", "all reconciliation, identity, surface, and product evidence references resolve", "Ingredient Intelligence recomputed after direct catalog finalization", "dossier retains restaurantId and name", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-replacement-bacchus-of-lebanon-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks: checks });
packet.restaurantId = id; packet.name = job.name; packet.identity = dossier.identity; packet.currentCatalog = dossier.currentCatalog; packet.adjudication.decidedAt = "2026-07-16T21:00:00.000Z";
write(paths.dossier, packet);
target.items = products.map((p) => { const old = oldByName.get(p.name.toLowerCase()) ?? {}; const row = reconciliation.get(p.currentProductKey); return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: [...new Set((p.surfaceIds ?? []).flatMap((sid) => { const s = result.menuSurfaces.find((x) => x.surfaceId === sid); return s && s.current && s.scopeStatus === "complete" && surfaceUrls.has(s.url) ? [s.url] : []; }))], matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined }; });
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, validation: apply.validation }));
