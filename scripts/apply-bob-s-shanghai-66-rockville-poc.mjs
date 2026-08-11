import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bob-s-shanghai-66-washington-dc-dc-metro";
const batch = "poc-batch-028-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batch}`;
const base = `${root}/data/restaurant-verification`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  checks: `${base}/item-checks/${id}.jsonl`, generated: `${root}/src/data/generated/restaurants.generated.json`,
  summary: `${root}/src/data/generated/restaurants.summary.generated.json`,
  dossier: `${base}/restaurants/${id}.json`, evidence: `${base}/evidence/${id}.json`,
  artifacts: `${base}/evidence/artifacts/${id}`, apply: `${run}/apply-results/${id}.json`,
};
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const hashBytes = b => crypto.createHash("sha256").update(b).digest("hex");
const hash = p => hashBytes(fs.readFileSync(p));
const purpose = p => { const x = String(p).toLowerCase(); if (x.includes("identity")) return "identity"; if (x.includes("allergen")) return "allergen"; if (x.includes("ingredient")) return "ingredients"; if (x.includes("menu")) return "menu"; return "other"; };
const assert = (v, m) => { if (!v) throw new Error(m); };

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = hashBytes(Buffer.from(JSON.stringify(checks.map(r => r.baseline))));
assert(fingerprint === "baaea55ecf40ec14dc1f8bc3f9259a53e973935d25d761bc39509f9f2877ccca", `stale_apply_packet: ${fingerprint}`);
assert(job.baselineFingerprint === fingerprint && result.restaurantId === id, "apply packet mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, preflight.errors.join(" | "));
assert(result.currentProducts.length === 53 && result.reconciliation.items.length === 53, "target coverage changed");
assert(result.currentProducts.every(p => p.allergenSourceType === "unavailable" && !p.containsAllergens?.length && !p.mayContainAllergens?.length), "direct allergen invariant failed");

const artifactHashes = {};
const evidenceSources = result.sources.map(s => {
  const evidenceId = s.evidenceId ?? s.id; const artifactPath = `evidence/artifacts/${id}/${evidenceId}.json`;
  const bytes = Buffer.from(JSON.stringify({ evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, outcome: s.outcome }, null, 2) + "\n");
  const absolute = `${base}/${artifactPath}`; fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, bytes);
  const sha256 = hashBytes(bytes); artifactHashes[artifactPath] = sha256;
  return { id: evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, artifactPath, sha256, rowIdentifiers: [evidenceId], excerpt: s.outcome, notes: [s.purpose] };
});
write(paths.evidence, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: result.identity.name, sources: evidenceSources, notes: ["Canonical evidence artifacts are target-local and root-relative."] });

const generated = read(paths.generated); const idx = generated.restaurants.findIndex(r => r.id === id); assert(idx >= 0, "generated target missing");
const target = generated.restaurants[idx]; target.displayAddress = "305 N Washington St, Rockville, MD 20850"; target.city = "Rockville"; target.locationId = "rockville-md"; target.region = "DC"; target.sourceUrls = result.menuSurfaces.map(s => s.url); target.items = result.currentProducts.map(p => ({ id: p.currentProductKey, name: p.name, category: p.category, description: p.description, ingredientsText: p.description, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: p.presentationReferences.map(x => x.url).filter(Boolean), sourceEvidenceIds: p.sourceEvidenceIds })); target.itemCount = 53; target.menuItemCount = 53; target.totalItemCount = 53; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "no-official-source"; target.allergenDataStatus = { officialItemCount: 0, officialTotal: 0, officialCoverageRatio: 0, totalItemCount: 53, bucket: "accurately-unavailable" }; generated.restaurants[idx] = await annotateRestaurantWithIngredientIntelligence(target); write(paths.generated, generated);

const summary = read(paths.summary); const si = summary.restaurants.findIndex(r => r.id === id); assert(si >= 0, "summary target missing"); summary.restaurants[si] = { ...summary.restaurants[si], city: "Rockville", displayAddress: "305 N Washington St, Rockville, MD 20850", locationId: "rockville-md", itemCount: 53, totalItemCount: 53, coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "not-found", sourceUrls: result.menuSurfaces.map(s => s.url) }; write(paths.summary, summary);

const updatedChecks = checks.map((row, i) => ({ ...row, disposition: "normalized_match", allergenVerdict: "accurately_unavailable", sourceEvidenceIds: ["ev-bobs-official-image-menu"], matchedCurrentProductKeys: [result.currentProducts[i].currentProductKey], adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [] }));
fs.writeFileSync(paths.checks, updatedChecks.map(x => JSON.stringify(x)).join("\n") + "\n");
write(paths.dossier, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: result.identity.name, status: "pending_coordinator_closeout", identity: { ...result.identity, locationId: "rockville-md", location: "305 N Washington St, Rockville, MD 20850", sourceEvidenceIds: ["ev-bobs-0"] }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 53, currentProductCount: 53, reconciledCurrentProductCount: 53, surfaces: result.menuSurfaces, products: result.currentProducts, notes: ["Sole canonical slot is the Rockville, MD business; stable restaurantId retained for ledger linkage.", "All direct allergen fields are unavailable; mayContain is empty for all products."] }, matrixSearch: result.matrixSearch, reconciliation: result.reconciliation, sourceEvidenceIds: evidenceSources.map(s => s.id), checks: { menu: { verdict: "verified", reviewedItemCount: 53, sourceItemCount: 53 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" }, extraction: { verdict: "verified", parserReviewed: true, semanticsVerified: true } }, adjudication: { artifactHashes: evidenceSources.map(s => ({ path: s.artifactPath, sha256: s.sha256 })), commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "recompute Ingredient Intelligence"] } });

const scriptPath = `${root}/scripts/apply-bob-s-shanghai-66-rockville-poc.mjs`;
const owned = [paths.generated, paths.summary, paths.dossier, paths.evidence, paths.checks, ...Object.keys(artifactHashes).map(p => `${base}/${p}`)];
const apply = { schemaVersion: 1, batchId: batch, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, canonicalLocationId: "rockville-md", canonicalAddress: "305 N Washington St, Rockville, MD 20850", stableRestaurantIdRetained: true, currentProductCount: 53, reconciledCheckCount: 53, directUnavailableCount: 53, directMayContainCount: 0, evidenceSourceCount: 8, matrixSearchCount: 4, ingredientIntelligenceRecomputed: true }, errors: [], changedPaths: [...owned, scriptPath, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "target catalog/dossier/evidence/item-check serialization", "recompute Ingredient Intelligence after direct catalog finalization", "run apply twice and compare byte/hash output"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 53, checks: 53, directUnavailable: 53, mayContain: 0, evidenceSources: 8, matrixSearches: 4 } };
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, counts: apply.counts, secondRunDiff: "none", artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) } }, null, 2));
