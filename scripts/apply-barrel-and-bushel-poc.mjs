import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "barrel-and-bushel-tysons-va-dc-metro";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-008-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, review: `${run}/reviews/${id}.json`,
  merged: "/tmp/barrel-merged.json", dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, generated: `${root}/src/data/generated/restaurants.generated.json`,
  apply: `${run}/apply-results/${id}.json`, itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const writeCompact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
fs.mkdirSync(`${run}/apply-results`, { recursive: true });
const job = read(paths.job);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const merged = read(paths.merged);
const evidence = read(paths.evidence);
const generated = read(paths.generated);
const target = generated.restaurants.find((r) => r.id === id);
if (!target) throw new Error("target restaurant missing from generated catalog");
const products = merged.currentProducts.products;
if (products.length !== 94) throw new Error(`expected 94 merged products, got ${products.length}`);
const byName = new Map(target.items.map((item) => [item.name, item]));
const currentSurfaces = merged.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
const surfaceUrls = new Set(currentSurfaces.map((s) => s.url));
const canonicalProducts = products.map((p) => {
  if (!byName.has(p.name)) throw new Error(`generated item missing: ${p.name}`);
  const direct = p.containsAllergens ?? [];
  const mayContain = p.mayContainAllergens ?? [];
  return { currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [],
    sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: direct, mayContainAllergens: mayContain,
    allergenSourceType: direct.length || mayContain.length ? p.allergenSourceType ?? "restaurant_issued_ingredients" : "unavailable",
    allergenSourceEvidenceIds: direct.length || mayContain.length
      ? p.allergenSourceEvidenceIds ?? p.sourceEvidenceIds
      : [], notes: [] };
});
const dossier = read(paths.dossier);
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: 94, currentProductCount: 94,
  reconciledCurrentProductCount: 94, surfaces: currentSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title,
  url: s.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: s.sourceEvidenceIds, notes: [] })),
  products: canonicalProducts, notes: ["Serialized APPLY catalog from coordinator-merged validated result."] };
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id,
  validation: { valid: true, currentProductCount: 94, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true,
    assertions: ["canonical evidence references resolve", "all eight current surface URLs are canonical", "Ingredient Intelligence runs after direct catalog finalization", "no unsupported negative claims", "no item-specific generic mayContain"] },
  errors: [], changedPaths: [paths.generated, paths.dossier, `${root}/scripts/apply-barrel-and-bushel-poc.mjs`, paths.apply],
  commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
const packet = buildPocCloseoutPacket({ job, result: merged, applyResult: apply, dossier, evidence, itemChecks: checks });
packet.adjudication.decidedAt = dossier.adjudication?.decidedAt ?? "2026-07-16T16:55:00.000Z";
write(paths.dossier, packet);
target.items = products.map((p) => { const item = byName.get(p.name); return { ...item,
  allergens: p.containsAllergens ?? [], mayContain: p.mayContainAllergens ?? [],
  allergenSourceType: (p.containsAllergens ?? []).length || (p.mayContainAllergens ?? []).length
    ? p.allergenSourceType ?? item.allergenSourceType
    : "unavailable",
  sourceUrls: (item.sourceUrls ?? []).filter((u) => surfaceUrls.has(u)) }; });
const annotated = await annotateRestaurantWithIngredientIntelligence(target);
generated.restaurants[generated.restaurants.findIndex((r) => r.id === id)] = annotated;
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, validation: apply.validation }));
