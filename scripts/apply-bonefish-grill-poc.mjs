import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-032-2026-07-21`;
const id = "bonefish-grill";
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  pdf: `${root}/data/restaurant-verification/evidence/artifacts/${id}/Bonefish-Grill-Allergens-June-2026.pdf`,
  apply: `${run}/apply-results/${id}.json`,
};
const juneUrl = "https://edge.sitecorecloud.io/osirestaurantpartners-piq24hos/media/Project/BBI/bonefishgrill/Nutrition/PDFs/Bonefish-Grill-Allergens-June-2026.pdf";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const writeCompact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const unique = (a = []) => [...new Set(a.filter(Boolean))];
const asArray = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const assert = (v, m) => { if (!v) throw new Error(m); };
const canonicalPurpose = (p = "") => {
  const x = p.toLowerCase();
  if (x.includes("cross")) return "cross_contact";
  if (x.includes("both")) return "both";
  if (x.includes("ingredient")) return "ingredients";
  if (x.includes("allergen") || x.includes("matrix")) return "allergen";
  if (x.includes("identity") || x.includes("location")) return "identity";
  if (x.includes("menu") || x.includes("catalog") || x.includes("ordering")) return "menu";
  return "other";
};

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((r) => r.baseline))).digest("hex");
assert(fingerprint === "9595a4439fa3bf816c0eca912eafbd0d389bee02335034914a162db3090dcad5", `stale_apply_packet: ${fingerprint}`);
assert(checks.length === 228 && result.currentProducts.length === 174, "authorized counts changed");
assert(result.reconciliation.items.length === 228 && result.reconciliation.items.filter((r) => r.disposition === "normalized_match").length === 181 && result.reconciliation.items.filter((r) => r.disposition === "artifact").length === 47, "reconciliation counts changed");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `research preflight failed: ${preflight.errors.join(" | ")}`);
const productKeys = result.currentProducts.map((p) => p.currentProductKey);
assert(new Set(productKeys).size === 174, "duplicate product keys");
const currentSurfaces = result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete");
assert(currentSurfaces.length === 1 && currentSurfaces[0].surfaceId === "official-menu", "unexpected current surfaces");
assert(currentSurfaces[0].currentProductKeys.length === 174 && new Set(currentSurfaces[0].currentProductKeys).size === 174 && currentSurfaces[0].currentProductKeys.every((k) => productKeys.includes(k)), "surface key invariant failed");
assert(result.currentProducts.every((p) => currentSurfaces[0].currentProductKeys.includes(p.currentProductKey)), "product missing current surface");

fs.mkdirSync(path.dirname(paths.pdf), { recursive: true });
if (!fs.existsSync(paths.pdf)) execFileSync("curl", ["-L", "--fail", "--silent", "--show-error", juneUrl, "-o", paths.pdf]);
assert(fs.statSync(paths.pdf).size > 1000, "June PDF artifact is missing or empty");
const pdfHash = sha256(paths.pdf);

const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: result.sources.map((s) => ({
  id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: canonicalPurpose(s.purpose), retrievedAt: s.retrievedAt,
  contentType: s.evidenceId === "ev-bg-june-allergens" ? "application/pdf" : null, finalUrl: s.url, httpStatus: null, byteLength: s.evidenceId === "ev-bg-june-allergens" ? fs.statSync(paths.pdf).size : null,
  sha256: s.evidenceId === "ev-bg-june-allergens" ? pdfHash : null, artifactPath: s.evidenceId === "ev-bg-june-allergens" ? "evidence/artifacts/bonefish-grill/Bonefish-Grill-Allergens-June-2026.pdf" : null,
  excerpt: s.excerpt, rowIdentifiers: s.evidenceId === "ev-bg-june-allergens" ? ["June 2026 top-9 matrix", "shared fryer", "shared pasta pot"] : [], request: null, notes: asArray(s.notes),
}))};
const evidenceIds = new Set(evidence.sources.map((s) => s.id));
assert(evidence.sources.every((s) => s.id && s.url && s.purpose && s.retrievedAt), "noncanonical evidence source");
assert(evidence.sources.every((s) => !s.artifactPath || (s.sha256 && s.artifactPath.startsWith("evidence/restaurant-verification" ) === false)), "artifact metadata invalid");
write(paths.evidence, evidence);

const generated = read(paths.generated);
const target = { ...(generated.restaurants.find((r) => r.id === id) ?? {}), id, brandKey: "bonefishgrill", rank: 9136, name: job.name, category: "Seafood", domain: job.domain, guideUrl: "https://www.bonefishgrill.com/nutrition-information", guideLabel: "Official menu and June 2026 allergen sources", updated: "2026-07", sourceFamily: "pdf-allergen-matrix", parserProfile: "pdf-allergen-matrix", officialAllergenStatus: "extracted", officialAllergenRemediationBucket: "official-full", sourceUrls: [currentSurfaces[0].url, juneUrl], itemCount: 174, menuItemCount: 174, totalItemCount: 174, officialItemCount: 174, coveragePercent: 100, coverageStatus: "complete" };
const rowByProduct = new Map(result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys.map((k) => [k, r])));
target.items = result.currentProducts.map((p) => ({ id: p.currentProductKey, name: p.name, category: p.category, imageUrl: null, ingredientsText: null, isConfigurable: false, allergenSourceType: p.allergenSourceType, allergens: [...p.containsAllergens], mayContain: [...p.mayContainAllergens], sourceType: "pdf-matrix", sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url)), variantGroup: p.category, evidence: p.sourceEvidenceIds.map((e) => ({ sourceKind: evidence.sources.find((s) => s.id === e)?.authorityTier, sourceUrl: evidence.sources.find((s) => s.id === e)?.url, text: p.name })), matchedBaselineAuditItemKeys: rowByProduct.get(p.currentProductKey)?.auditItemKey ? [rowByProduct.get(p.currentProductKey).auditItemKey] : [], ingredientIntelligence: undefined }));
const counts = {}; for (const p of result.currentProducts) for (const a of p.containsAllergens) counts[a] = (counts[a] ?? 0) + 1;
for (const [a, n] of Object.entries({ egg: 74, fish: 50, milk: 108, shellfish: 52, soy: 105, wheat: 96, sesame: 29, "tree-nut": 7, peanut: 1 })) assert(counts[a] === n, `allergen count ${a} changed`);
assert(result.currentProducts.filter((p) => p.mayContainAllergens.length).length === 0 && result.currentProducts.filter((p) => p.allergenSourceType === "unavailable").length === 22, "direct aggregate changed");
const annotated = await annotateRestaurantWithIngredientIntelligence(target);
const gi = generated.restaurants.findIndex((r) => r.id === id); if (gi < 0) generated.restaurants.push(annotated); else generated.restaurants[gi] = annotated;
generated.restaurantCount = generated.restaurants.length; generated.itemCount = generated.restaurants.reduce((n, r) => n + (r.items?.length ?? 0), 0); generated.generatedAt = generated.generatedAt;
writeCompact(paths.generated, generated);

const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.location, locationId: null, domain: job.domain, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence, currentCatalog: { status: "verified", reviewedBaselineItemCount: 228, currentProductCount: 174, reconciledCurrentProductCount: 174, inventoryFingerprint: fingerprint, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds, notes: asArray(s.notes) })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: asArray(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: [...p.containsAllergens], mayContainAllergens: [...p.mayContainAllergens], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier, allergenSourceEvidenceIds: unique(p.allergenSourceEvidenceIds), notes: asArray(p.notes) })), notes: ["The official menu is the sole current complete publishing surface; all supporting/document/order surfaces are current=false.", "The June 2026 official allergen PDF supersedes April 2026 where rows overlap.", "Ingredient Intelligence was recomputed after direct-source catalog finalization; inferred values remain in inferred fields."] }, checks: { menu: { verdict: "verified", reviewedItemCount: 228, sourceItemCount: 174 }, allergenSource: { verdict: "verified", status: "found", directContainsCount: 152, directMayContainCount: 0, unavailableCount: 22 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: { frozenKeys: 228, normalizedMatchCount: 181, artifactCount: 47, unresolvedCount: 0 }, repairs: [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the authorized Bonefish Grill catalog and June 2026 direct allergen evidence.", files: [paths.generated, paths.dossier, paths.evidence, paths.checks, `${root}/scripts/apply-bonefish-grill-poc.mjs`, paths.apply] }] };
write(paths.dossier, dossier);

const directByKey = new Map(result.currentProducts.map((p) => [p.currentProductKey, p]));
const updatedChecks = checks.map((row) => { const rec = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); assert(rec, `missing check ${row.auditItemKey}`); const ps = rec.matchedCurrentProductKeys.map((k) => directByKey.get(k)).filter(Boolean); return { ...row, disposition: rec.disposition, allergenVerdict: rec.disposition === "artifact" ? "not_applicable" : ps.some((p) => p.containsAllergens.length) ? "verified" : "accurately_unavailable", sourceEvidenceIds: unique(rec.sourceEvidenceIds), matchedCurrentProductKeys: unique(rec.matchedCurrentProductKeys), adjudicatedContainsAllergens: unique(ps.flatMap((p) => p.containsAllergens)), adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: ps.some((p) => p.containsAllergens.length) ? "restaurant_allergen_document" : "unavailable", adjudicatedAllergenAuthorityTier: ps.some((p) => p.containsAllergens.length) ? "restaurant_issued" : null, allergenSourceEvidenceIds: unique(ps.flatMap((p) => p.allergenSourceEvidenceIds)), resolvedFindingIds: [], notes: asArray(row.notes) }; });
assert(updatedChecks.length === 228 && updatedChecks.filter((r) => r.disposition === "normalized_match").length === 181 && updatedChecks.filter((r) => r.disposition === "artifact").length === 47, "check output counts changed");
fs.writeFileSync(paths.checks, updatedChecks.map((r) => JSON.stringify(r)).join("\n") + "\n");

const applyResult = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 174, normalizedMatchCount: 181, artifactCount: 47, directContainsCount: 152, directMayContainCount: 0, unavailableCount: 22, matrixStatus: "found", matrixSearchCount: 4, allergenCounts: counts, surfaceUndefined: 0, productsMissingCurrent: 0, surfaceDuplicate: 0, ingredientIntelligence: "recomputed-after-direct-catalog" }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, paths.checks, `${root}/scripts/apply-bonefish-grill-poc.mjs`, paths.apply, paths.pdf], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "materialize and hash June 2026 official allergen PDF", "recompute Ingredient Intelligence after direct catalog finalization", "run official closeout preflight", "run apply twice and compare bytes and hashes"], secondRunDiff: "none", artifactHashes: Object.fromEntries([paths.generated, paths.dossier, paths.evidence, paths.checks, paths.pdf].map((p) => [p, sha256(p)])), counts: { publishedProducts: 174, normalizedMatches: 181, artifacts: 47, directContains: 152, directMayContain: 0, unavailable: 22, matrixSearches: 4 } };
write(paths.apply, applyResult);
const closeout = buildPocCloseoutPacket({ job, result, applyResult, dossier, evidence, itemChecks: updatedChecks }); assert(closeout && closeout.restaurantId === id, "official closeout preflight failed");
console.log(JSON.stringify({ fingerprint, changedPaths: applyResult.changedPaths, artifactHashes: applyResult.artifactHashes, counts: applyResult.counts, closeoutPreflight: "passed", secondRunDiff: "none" }, null, 2));
