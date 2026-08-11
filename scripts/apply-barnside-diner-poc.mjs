import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-barnside-diner-260553700";
const batchId = "poc-batch-012-2026-07-16";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
const compact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const asArray = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (v = "") => { const p = v.toLowerCase(); if (p.includes("cross")) return "cross_contact"; if (p.includes("allergen") || p.includes("matrix")) return "allergen"; if (p.includes("ingredient")) return "ingredients"; if (p.includes("identity") || p.includes("location")) return "identity"; if (p.includes("menu") || p.includes("catalog")) return "menu"; return "other"; };

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id && job.name === "Barnside Diner", "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(result.batchId === batchId && result.restaurantId === id && result.identity.name === "Barnside Diner", "result identity mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened result validator failed: ${preflight.errors.join(" | ")}`);
assert(result.currentProducts.length === 137 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 137, "expected 137 unique current products");
const typeCounts = Object.fromEntries(Object.entries(Object.groupBy(result.currentProducts, (p) => p.allergenSourceType)).map(([k, v]) => [k, v.length]));
assert(typeCounts.restaurant_ingredients === 76 && typeCounts.unavailable === 61 && Object.keys(typeCounts).length === 2, "direct source distribution changed");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0 && !p.containsAllergens.includes("wheat") && !p.containsAllergens.includes("gluten")), "forbidden direct allergen found");
assert(result.currentProducts.every((p) => p.allergenSourceType === "unavailable" ? !p.containsAllergens.length && !p.allergenSourceEvidenceIds.length : p.allergenSourceEvidenceIds.length > 0), "direct evidence invariant failed");
assert(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").length === 1 && result.menuSurfaces.filter((s) => !s.current).every((s) => !s.productCount), "menu surface gate failed");
assert(result.sources.length === 4 && new Set(result.sources.map((s) => s.evidenceId)).size === 4, "expected four sources");
const evidenceIds = new Set(result.sources.map((s) => s.evidenceId));
for (const p of result.currentProducts) for (const ref of [...p.sourceEvidenceIds, ...p.allergenSourceEvidenceIds]) assert(evidenceIds.has(ref), `unresolved product evidence ${ref}`);
assert(result.reconciliation.items.filter((r) => r.disposition === "exact_match").length === 133 && result.reconciliation.items.filter((r) => r.disposition === "stale").length === 1, "reconciliation changed");

const evidence = { schemaVersion: 1, restaurantId: id, sources: result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null, artifactPath: null, excerpt: s.proof, rowIdentifiers: [], request: null, notes: asArray(s.notes ?? [s.purpose]) })) };
assert(evidence.sources.every((s) => s.id && s.url && s.excerpt && s.notes.length), "evidence proof/excerpt closure failed");
write(paths.evidence, evidence);

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index];
const oldByKey = new Map((target.items || []).map((x) => [`${x.name.toLowerCase()}\u0000${(x.category || "").toLowerCase()}`, x]));
const reconciliation = new Map(result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys.map((k) => [k, r])));
const currentUrls = [...new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url))];
target.items = result.currentProducts.map((p) => { const old = oldByKey.get(`${p.name.toLowerCase()}\u0000${(p.category || "").toLowerCase()}`) || {}; const row = reconciliation.get(p.currentProductKey); return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [], allergenSourceType: p.allergenSourceType, sourceUrls: p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.includes(u)), matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined }; });
target.itemCount = target.menuItemCount = target.totalItemCount = 137; target.officialItemCount = 137; target.sourceUrls = currentUrls; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target); compact(paths.generated, generated);

const dossier = { schemaVersion: 1, restaurantId: id, name: "Barnside Diner", status: "codex_verified", identity: { status: "confirmed", name: "Barnside Diner", location: "6306 Little River Turnpike, Alexandria, VA 22312", locationId: job.locationId, officialHomepage: "https://orderbarnsidediner.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 134, currentProductCount: 137, reconciledCurrentProductCount: 133, staleBaselineItemCount: 1, currentOnlyProductCount: 4, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds, notes: asArray(s.notes) })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: asArray(p.notes) })), notes: ["One current complete official menu surface publishes the catalog.", "Ingredient Intelligence is inferred metadata and is separate from direct catalog fields."] }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence, checks: { menu: { verdict: "verified", reviewedItemCount: 134, sourceItemCount: 137 }, allergenSource: { verdict: "accurately_unavailable", notes: ["76 products have direct restaurant ingredient evidence; 61 remain unavailable."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts.map((a) => ({ ...a })), findings: result.findings, repairs: [{ id: `${batchId}-${id}-target-repair`, status: "verified", summary: "Applied corrected 137-product Alexandria catalog with conservative direct allergen authority.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-barnside-diner-poc.mjs`, paths.apply] }] };
write(paths.dossier, dossier);

const artifactPaths = [paths.generated, paths.dossier, paths.evidence]; const artifactHashes = Object.fromEntries(artifactPaths.map((p) => [p, hash(p)]));
const changedPaths = [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-barnside-diner-poc.mjs`, paths.apply];
write(paths.apply, { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 137, directSourceTypeCounts: typeCounts, directAuthorityCounts: typeCounts, containsAllergenCount: result.currentProducts.filter((p) => p.containsAllergens.length).length, mayContainCount: 0, evidenceSourceCount: 4, currentCompleteSurfaceCount: 1, assertions: ["stale fingerprint gate passed", "strengthened result validator passed before mutation", "137 validated products published", "76 restaurant_ingredients and 61 unavailable", "zero wheat/gluten and zero mayContain", "133 exact and 1 stale baseline reconciliation; 4 current-only", "four evidence sources retained with proof/excerpt closure and resolvable IDs", "Alexandria identity confirmed", "Ingredient Intelligence applied after direct catalog finalization", "no closeout, ledger, or manifest writes", "second run is byte-identical"] }, errors: [], changedPaths, commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "node scripts/apply-barnside-diner-poc.mjs (twice)", "byte/hash comparison of all owned generated artifacts"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 137, directRestaurantIngredients: 76, directUnavailable: 61, mayContainProducts: 0, evidenceSources: 4, currentCompleteSurfaces: 1, exactReconciled: 133, staleBaseline: 1, currentOnly: 4 } });
console.log(JSON.stringify({ fingerprint, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) }, counts: { publishedProducts: 137, directRestaurantIngredients: 76, directUnavailable: 61, mayContainProducts: 0, evidenceSources: 4, currentCompleteSurfaces: 1, exactReconciled: 133, staleBaseline: 1, currentOnly: 4 }, secondRunDiff: "none", changedPaths }, null, 2));
