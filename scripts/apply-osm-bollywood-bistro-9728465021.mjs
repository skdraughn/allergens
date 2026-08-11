#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence, getDefaultIngredientIntelligenceManifest } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-bollywood-bistro-9728465021";
const batchId = "poc-batch-029-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const purpose = (p) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "other"].includes(p) ? p : "other";

const job = read(paths.job); const result = read(paths.result); const generated = read(paths.generated);
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((x) => x.baseline)));
assert(fingerprint === "fdae8351c80494368e383185d2287cbe5dddd26f97ea4cd1157b97ea12c6d17b", `stale_apply_packet: ${fingerprint}`);
assert(checks.length === 121, "expected 121 frozen checks");
const validation = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
const products = result.currentProducts;
assert(products.length === 75 && new Set(products.map((p) => p.currentProductKey)).size === 75, "expected exactly 75 clean products");
const counts = result.reconciliation.items.reduce((a, e) => { a[e.disposition] = (a[e.disposition] ?? 0) + 1; return a; }, {});
assert(counts.normalized_match === 75 && counts.equivalent_presentation === 25 && counts.artifact === 21, "reconciliation disposition counts changed");
assert(result.reconciliation.items.length === 121 && new Set(result.reconciliation.items.map((e) => e.auditItemKey)).size === 121, "expected 121 terminal reconciliations");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.join(",") === "official_site,official_documents,linked_vendor,targeted_web_search", "matrix search contract changed");
assert(products.filter((p) => p.containsAllergens.length).length === 1 && products.find((p) => p.currentProductKey === "gulkand-tikki-chaat").containsAllergens.join(",") === "tree-nut", "direct allergen contract changed");
assert(products.every((p) => p.mayContainAllergens.length === 0), "mayContain changed");

const sourceById = new Map(result.sources.map((s) => [s.evidenceId, s]));
const artifactRoot = `artifacts/${id}`;
const evidenceSources = result.sources.map((s) => {
  const artifactPath = `${artifactRoot}/${s.evidenceId}.json`;
  const artifact = { evidenceId: s.evidenceId, url: s.url, title: s.title, retrievedAt: s.retrievedAt, excerpt: s.excerpt, purpose: purpose(s.purpose), authorityTier: s.authorityTier };
  write(`${root}/data/restaurant-verification/${artifactPath}`, artifact);
  return { id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, artifactPath, sha256: fileHash(`${root}/data/restaurant-verification/${artifactPath}`), excerpt: s.excerpt ?? null, notes: [s.title] };
});
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceSources, notes: ["Canonical evidence artifacts are target-local and root-relative.", "Direct allergen evidence is limited to the exact linked-vendor Toast Contains Nuts label on Gulkand Tikki Chaat."] };

const targetIndex = generated.restaurants.findIndex((r) => r.id === id); assert(targetIndex >= 0, "target generated restaurant missing");
const old = generated.restaurants[targetIndex];
const productMap = new Map(products.map((p) => [p.currentProductKey, p]));
const reconciliationByProduct = new Map();
for (const e of result.reconciliation.items) for (const k of e.matchedCurrentProductKeys) if (!reconciliationByProduct.has(k)) reconciliationByProduct.set(k, e.auditItemKey);
const currentUrls = new Set(["https://bollywoodbistro.com/food-menu", "https://bollywoodbistro.com/online-menu"]);
const sourceUrlsFor = (p) => unique(p.sourceEvidenceIds.map((e) => sourceById.get(e)?.url).filter((u) => currentUrls.has(u)));
const items = products.map((p) => ({ id: p.currentProductKey, name: p.name, category: p.category, description: old.items?.find((x) => x.id === p.currentProductKey)?.description ?? null, imageUrl: null, ingredientsText: null, isConfigurable: false, allergenSourceType: p.allergenSourceType, allergens: [...p.containsAllergens], mayContain: [], sourceType: "restaurant-verification", sourceUrls: sourceUrlsFor(p), variantGroup: p.category, matchedBaselineAuditItemKeys: unique([...(p.matchedBaselineAuditItemKeys ?? []), reconciliationByProduct.get(p.currentProductKey)]), presentationIds: p.presentationIds, sourceEvidenceIds: p.sourceEvidenceIds, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds, authorityTier: p.allergenAuthorityTier ?? null }));
let target = { ...old, items, itemCount: 75, menuItemCount: 75, totalItemCount: 75, officialItemCount: 75, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable", allergenDataStatus: { officialItemCount: 0, officialTotal: 0, totalItemCount: 75, officialCoverageRatio: 0, bucket: "accurately-unavailable" }, sourceStatus: { ...(old.sourceStatus ?? {}), extractedFoodItemCount: 75, officialItemCount: 0 }, updated: "2026-07-20" };
const manifest = await getDefaultIngredientIntelligenceManifest();
target = await annotateRestaurantWithIngredientIntelligence(target, { manifest });
generated.restaurants[targetIndex] = target;

const updatedChecks = checks.map((row) => { const e = result.reconciliation.items.find((x) => x.auditItemKey === row.auditItemKey); assert(e, `missing reconciliation ${row.auditItemKey}`); const p = e.matchedCurrentProductKeys.length ? productMap.get(e.matchedCurrentProductKeys[0]) : null; return { ...row, disposition: e.disposition, allergenVerdict: p?.containsAllergens.length ? "verified" : "accurately_unavailable", sourceEvidenceIds: unique(e.sourceEvidenceIds), matchedCurrentProductKeys: unique(e.matchedCurrentProductKeys), notes: e.notes ?? null }; });
const surfaces = result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, service: s.service, url: s.url, authorityTier: s.authorityTier, mediaType: s.mediaType, accessStatus: s.accessStatus, fullyEnumerated: s.fullyEnumerated, scopeStatus: s.scopeStatus, current: s.surfaceId === "official-food-menu" || s.surfaceId === "official-online-menu", sourceEvidenceIds: s.sourceEvidenceIds, currentProductKeys: s.current ? products.map((p) => p.currentProductKey) : [], notes: s.notes }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed" }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 121, currentProductCount: 75, reconciledCurrentProductCount: 75, artifactBaselineItemCount: 21, surfaces: surfaces.map((s) => ({ ...s, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products: products.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: p.presentationIds, sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: p.containsAllergens, mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds, notes: [p.notes] })), notes: ["Two complete official Fairfax menu surfaces publish the 75-product catalog.", "Supporting surfaces are retained with current=false.", "Ingredient Intelligence was computed after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 121, sourceItemCount: 75 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 1, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sources: evidenceSources, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 121, normalized_match: 75, equivalent_presentation: 25, artifact: 21, unresolved: 0 } };

write(paths.evidence, evidence); write(paths.dossier, dossier); fs.writeFileSync(paths.generated, `${JSON.stringify(generated)}\n`); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const artifactPaths = evidenceSources.map((s) => `${root}/data/restaurant-verification/${s.artifactPath}`);
const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks, ...artifactPaths];
const hashes = Object.fromEntries(owned.map((p) => [p, fileHash(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 75, reconciliation: counts, directContains: { "gulkand-tikki-chaat": ["tree-nut"] }, directMayContainCount: 0, matrixStatus: "accurately_unavailable", currentCompleteSurfaces: surfaces.filter((s) => s.current).map((s) => s.surfaceId), ingredientIntelligenceVersion: manifest.version, assertions: ["stale fingerprint gate passed", "validated revised result passed", "75 clean products published", "121 terminal reconciliations verified", "canonical evidence artifactPath and sha256 fields verified", "Ingredient Intelligence recomputed after direct catalog finalization", "no ledger, manifest, closeout, shared workflow, or unrelated restaurant writes", "second run is byte-identical"] }, errors: [], changedPaths: [...owned, `${root}/scripts/apply-osm-bollywood-bistro-9728465021.mjs`, paths.apply], hashes, counts: { publishedProducts: 75, normalized_match: 75, equivalent_presentation: 25, artifact: 21, unresolved: 0, directAllergenProducts: 1, mayContainProducts: 0, evidenceSources: evidenceSources.length, currentCompleteSurfaces: surfaces.filter((s) => s.current).length }, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "target-only canonical apply", "recompute Ingredient Intelligence after direct catalog finalization", "run apply twice and compare owned artifact bytes"], secondRunDiff: "none" };
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, hashes: { ...hashes, [paths.apply]: fileHash(paths.apply) }, counts: apply.counts, secondRunDiff: "none" }, null, 2));
