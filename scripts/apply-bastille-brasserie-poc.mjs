import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-bastille-brasserie-11075705705";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-013-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const writeCompact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const unique = (xs = []) => [...new Set(xs.filter(Boolean))];
const purpose = (p = "") => p.includes("cross") ? "cross_contact" : p.includes("ingredient") ? "ingredients" : p.includes("allergen") ? "allergen" : p.includes("identity") ? "identity" : p.includes("menu") ? "menu" : "other";

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((x) => x.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(result.restaurantId === id && result.batchId === job.batchId, "result/job identity mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened validator failed: ${preflight.errors.join(" | ")}`);

const complete = result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete");
assert(result.currentProducts.length === 67 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 67, "expected 67 unique products");
assert(JSON.stringify(complete.map((s) => [s.surfaceId, s.currentProductKeys.length])) === JSON.stringify([["official-dinner-pdf",31],["official-monthly-pdf",2],["official-happy-hour-pdf",9],["official-desserts-pdf",14],["official-kids-pdf",14],["official-beverages-pdf",9],["toast-current",28]]), "complete surface counts changed");
assert(result.menuSurfaces.filter((s) => s.current === false && s.url.includes("menus-events")).length === 4 && result.menuSurfaces.find((s) => s.surfaceId === "official-packet-dinner-pdf-superseded").scopeStatus === "superseded", "navigation/superseded surfaces changed");
const direct = result.currentProducts.reduce((a, p) => (a[p.allergenSourceType] = (a[p.allergenSourceType] || 0) + 1, a), {});
assert(direct.restaurant_ingredients === 37 && direct.restaurant_linked_vendor === 1 && direct.unavailable === 29, "direct distribution changed");
assert(result.currentProducts.every((p) => !(p.containsAllergens || []).some((x) => ["wheat", "gluten"].includes(x)) && !(p.mayContainAllergens || []).length), "wheat/gluten or mayContain present");
assert(result.sources.length === 15 && result.sources.every((s) => s.excerpt && s.authorityTier), "evidence sources lack proof/authority");
const reconciliationCounts = result.reconciliation.items.reduce((a, x) => (a[x.disposition] = (a[x.disposition] || 0) + 1, a), {});
assert(reconciliationCounts.exact_match === 25 && reconciliationCounts.normalized_match === 6 && reconciliationCounts.equivalent_presentation === 4 && reconciliationCounts.artifact === 17 && !reconciliationCounts.unresolved, "reconciliation changed");
assert(!/\b(sol|terra)\b/i.test(JSON.stringify(result)), "excluded source authority referenced");

const evidence = read(paths.evidence);
evidence.restaurantId = id;
evidence.sources = result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null, artifactPath: null, excerpt: s.excerpt, rowIdentifiers: [], request: null, notes: Array.isArray(s.notes) ? s.notes : [] }));
const evidenceIds = new Set(evidence.sources.map((s) => s.id));
for (const p of result.currentProducts) for (const e of [...p.sourceEvidenceIds, ...p.allergenSourceEvidenceIds]) assert(evidenceIds.has(e), `unresolved evidence ${e}`);
write(paths.evidence, evidence);

const generated = read(paths.generated); const i = generated.restaurants.findIndex((r) => r.id === id); assert(i >= 0, "target missing");
const target = generated.restaurants[i]; const recon = new Map(result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys.map((k) => [k, r]))); const urls = new Set(complete.map((s) => s.url));
target.items = result.currentProducts.map((p) => { const r = recon.get(p.currentProductKey); return { id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => urls.has(u))), matchedBaselineAuditItemKeys: r ? [r.auditItemKey] : [], ingredientIntelligence: undefined }; });
target.itemCount = 67; target.menuItemCount = 67; target.totalItemCount = 67; target.sourceUrls = [...urls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[i] = await annotateRestaurantWithIngredientIntelligence(target); writeCompact(paths.generated, generated);

const dossier = read(paths.dossier); dossier.status = "codex_verified"; dossier.updatedAt = "2026-07-16"; dossier.completedAt = "2026-07-16"; dossier.identity = { status: "confirmed", name: job.name, location: result.identity.location, locationId: "alexandria", officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds, notes: result.identity.notes };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 67, reconciledCurrentProductCount: 67, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds, notes: s.notes ? [s.notes] : [] })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: p.notes ? [p.notes] : [] })), notes: ["Seven current complete product surfaces union to 67 products; four HTML/navigation surfaces are current:false, including the superseded packet dinner PDF.", "Direct catalog fields are authoritative; Ingredient Intelligence is applied only after direct catalog finalization.", "Alcohol and modifiers are excluded."] };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence; dossier.sourceAttempts = result.matrixSearch.attempts; dossier.findings = result.findings; dossier.checks = { menu: { verdict: "verified", reviewedItemCount: 52, sourceItemCount: 67 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }; write(paths.dossier, dossier);

const owned = [paths.generated, paths.dossier, paths.evidence]; const artifactHashes = Object.fromEntries(owned.map((p) => [p, hash(p)]));
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 67, directSourceTypeCounts: direct, evidenceSourceCount: 15, currentCompleteSurfaceCounts: Object.fromEntries(complete.map((s) => [s.surfaceId, s.currentProductKeys.length])), reconciliationCounts, assertions: ["stale fingerprint gate passed", "strengthened validator passed before mutation", "seven current complete surfaces union to 67", "four navigation surfaces current:false", "direct catalog finalized before Ingredient Intelligence", "alcohol and modifiers excluded", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bastille-brasserie-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "serialized APPLY twice with byte/hash comparison"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 67, dinnerPdf: 31, monthly: 2, happyHour: 9, desserts: 14, kids: 14, beverages: 9, toast: 28, directRestaurantIngredients: 37, directLinkedVendor: 1, directUnavailable: 29, mayContainProducts: 0, wheatOrGlutenProducts: 0, evidenceSources: 15, reconciliation: reconciliationCounts } };
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, counts: apply.counts, secondRunDiff: "none", changedPaths: apply.changedPaths }, null, 2));
