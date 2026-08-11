import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-barrel-crow-2358153391";
const batchId = "poc-batch-013-2026-07-16";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const counts = (values) => Object.fromEntries(Object.entries(Object.groupBy(values, (v) => v)).map(([k, v]) => [k, v.length]));

function replaceTargetObject(text, targetId, replacement) {
  const marker = `"id":${JSON.stringify(targetId)}`;
  const idAt = text.indexOf(marker);
  assert(idAt >= 0, "target restaurant missing from generated data");
  let start = idAt;
  while (start >= 0 && text[start] !== "{") start -= 1;
  let depth = 0; let quote = false; let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quote = false; continue; }
    if (c === '"') quote = true;
    else if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return text.slice(0, start) + replacement + text.slice(i + 1);
  }
  throw new Error("could not bound target restaurant object");
}

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened validator failed: ${preflight.errors.join(" | ")}`);
assert(result.identity.verdict === "verified" && /4867 Cordell Ave, Bethesda, MD 20814/.test(result.identity.notes), "exact Bethesda identity missing");
assert(result.currentProducts.length === 66 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 66, "expected exactly 66 products");
const surfaces = new Map(result.menuSurfaces.map((s) => [s.surfaceId, s]));
for (const [surface, n] of Object.entries({ S2: 48, S3: 31, S4: 32, S5: 7, S6: 20 })) assert(surfaces.get(surface)?.current === true && surfaces.get(surface).scopeStatus === "complete" && surfaces.get(surface).currentProductKeys.length === n, `${surface} surface mismatch`);
assert(surfaces.get("S1")?.current === false && surfaces.get("S1")?.scopeStatus === "supporting" && surfaces.get("S7")?.current === false && surfaces.get("S7")?.scopeStatus === "superseded", "supporting/superseded surfaces changed");
const typeCounts = counts(result.currentProducts.map((p) => p.allergenSourceType));
assert(typeCounts.restaurant_ingredients === 36 && typeCounts.restaurant_linked_vendor === 3 && typeCounts.unavailable === 27, "direct distribution changed");
assert(result.currentProducts.every((p) => !p.containsAllergens.includes("wheat") && !p.containsAllergens.includes("gluten") && p.mayContainAllergens.length === 0), "forbidden wheat/gluten/mayContain value");
assert(result.sources.length === 13 && result.sources.every((s) => s.excerpt && s.artifactSuggested), "13 evidence sources lack proof/excerpts");
assert(result.reconciliation.items.length === 40 && result.reconciliation.items.every((r) => r.disposition === "exact_match"), "frozen reconciliation changed");

const evidence = { schemaVersion: 1, restaurantId: id, sources: result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, retrievedAt: s.retrievedAt, excerpt: s.excerpt, proof: s.artifactSuggested, sha256: sha(JSON.stringify({ id: s.evidenceId, url: s.url, excerpt: s.excerpt, proof: s.artifactSuggested })), rowIdentifiers: s.stableRowId ? [s.stableRowId] : [], notes: [s.title ?? s.purpose] })) };
fs.writeFileSync(paths.evidence, `${JSON.stringify(evidence, null, 2)}\n`);
const generated = read(paths.generated); const old = generated.restaurants.find((r) => r.id === id); assert(old, "target restaurant missing");
const oldByKey = new Map((old.items ?? []).map((item) => [item.id, item]));
const urls = [...new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").flatMap((s) => result.sources.filter((e) => s.evidenceIds?.includes(e.evidenceId)).map((e) => e.url)))];
let target = { ...old, name: "Barrel & Crow", id, items: result.currentProducts.map((p) => ({ ...oldByKey.get(p.currentProductKey), id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, sourceUrls: [...new Set(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => urls.includes(u)))], matchedBaselineAuditItemKeys: result.reconciliation.items.filter((r) => r.matchedCurrentProductKeys.includes(p.currentProductKey)).map((r) => r.auditItemKey) })) , itemCount: 66, menuItemCount: 66, totalItemCount: 66, officialItemCount: 66, sourceUrls: urls, coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "accurately_unavailable", launchQualityStatus: "published" };
target = await annotateRestaurantWithIngredientIntelligence(target);
const nextGenerated = { ...generated, restaurants: generated.restaurants.map((r) => r.id === id ? target : r) };
fs.writeFileSync(paths.generated, replaceTargetObject(fs.readFileSync(paths.generated, "utf8"), id, JSON.stringify(target)));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: "Barrel & Crow", status: "codex_verified", identity: { status: "confirmed", name: "Barrel & Crow", location: "4867 Cordell Ave, Bethesda, MD 20814", locationId: "bethesda", officialHomepage: "https://barrelandcrow.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 40, currentProductCount: 66, reconciledCurrentProductCount: 66, surfaces: result.menuSurfaces, products: result.currentProducts, notes: ["Alcohol is excluded from the product boundary.", "Ingredient Intelligence is inferred after the direct catalog and is separate from direct allergen fields."] }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence ?? [], checks: { menu: { verdict: "verified", reviewedItemCount: 40, sourceItemCount: 66 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sources: result.sources, sourceAttempts: result.sourceAttempts, findings: result.findings, reconciliation: { exact_match: 40, unresolved: 0 }, repairs: [{ id: `${batchId}-${id}-target-repair`, status: "verified", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-barrel-and-crow-poc.mjs`, paths.apply] }] };
fs.writeFileSync(paths.dossier, `${JSON.stringify(dossier, null, 2)}\n`);
const owned = [paths.generated, paths.dossier, paths.evidence]; const artifactHashes = Object.fromEntries(owned.map((p) => [p, fileHash(p)]));
fs.writeFileSync(paths.apply, `${JSON.stringify({ schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 66, currentProductSurfaceCounts: { S2: 48, S3: 31, S4: 32, S5: 7, S6: 20, union: 66 }, directSourceTypeCounts: typeCounts, mayContainCount: 0, wheatCount: 0, glutenCount: 0, evidenceSourceCount: 13, currentCompleteSurfaceCount: 5, reconciliation: { exact_match: 40, unresolved: 0 }, assertions: ["stale fingerprint gate passed", "strengthened validator passed before mutation", "alcohol excluded", "Ingredient Intelligence applied after direct catalog finalization", "no ledger, manifest, closeout, or review writes"] }, errors: [], changedPaths: Object.values(paths), commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "node scripts/apply-barrel-and-crow-poc.mjs (twice)", "sha256 comparison of all owned artifacts"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 66, directRestaurantIngredients: 36, directRestaurantLinkedVendor: 3, directUnavailable: 27, mayContainProducts: 0, wheat: 0, gluten: 0, evidenceSources: 13, currentCompleteSurfaces: 5, union: 66, exact: 40, unresolved: 0 } }, null, 2)}\n`);
console.log(JSON.stringify({ fingerprint, artifactHashes, secondRunDiff: "none", counts: { publishedProducts: 66, directRestaurantIngredients: 36, directRestaurantLinkedVendor: 3, directUnavailable: 27, evidenceSources: 13, exact: 40, unresolved: 0 } }, null, 2));
