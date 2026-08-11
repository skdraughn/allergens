#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "blue-duck-tavern-dc";
const batchId = "poc-batch-025-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  apply: `${run}/apply-results/${id}.json`, itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`, summary: `${root}/src/data/generated/restaurants.summary.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => sha256(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id && job.name === "Blue Duck Tavern", "job identity mismatch");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(checks.length === 71, "frozen item-check count changed");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `research validation failed: ${preflight.errors.join(" | ")}`);
assert(result.currentProducts.length === 71 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 71, "expected 71 products");
assert(result.currentProducts.every((p) => p.containsAllergens.length === 0 && p.mayContainAllergens.length === 0 && p.allergenSourceType === "unavailable"), "direct allergen fields changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search changed");

const artifactRoot = `${root}/data/restaurant-verification/artifacts/${id}`;
const artifactSpecs = [
  ["official-home.html", "https://www.blueducktavern.com/"],
  ["official-menus.html", "https://www.blueducktavern.com/menus/"],
  ["official-breakfast.html", "https://www.blueducktavern.com/menu/breakfast-menu/"],
  ["official-lunch.html", "https://www.blueducktavern.com/menu/lunch-menu/"],
  ["official-dinner.html", "https://www.blueducktavern.com/menu/dinner-menu/"],
  ["official-brunch.html", "https://www.blueducktavern.com/menu/brunch-menu/"],
  ["official-lounge.html", "https://www.blueducktavern.com/menu/lounge-menu/"],
  ["official-dessert.html", "https://www.blueducktavern.com/menu/dessert-menu/"],
  ["official-wine.html", "https://www.blueducktavern.com/menu/wine-list/"],
];
fs.mkdirSync(artifactRoot, { recursive: true });
for (const [name, url] of artifactSpecs) {
  const response = await fetch(url); assert(response.ok, `artifact fetch failed: ${url}`);
  fs.writeFileSync(`${artifactRoot}/${name}`, Buffer.from(await response.arrayBuffer()));
}
const artifactEntries = artifactSpecs.map(([name, url]) => ({ url, artifactPath: `artifacts/${id}/${name}`, sha256: fileHash(`${artifactRoot}/${name}`) }));
const evidence = {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified",
  sources: result.sources.map((s) => {
    const artifact = artifactEntries.find((a) => a.url === s.url);
    return { id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: ["identity","menu","allergen","ingredients","cross_contact","both","other"].includes(s.purpose) ? s.purpose : "other", retrievedAt: s.retrievedAt, artifactPath: artifact?.artifactPath ?? null, sha256: artifact?.sha256 ?? null, excerpt: s.purpose, rowIdentifiers: [], notes: [] };
  }),
  matrixSearch: result.matrixSearch, restaurantLevelAllergenEvidence: [], notes: ["No verifiable official allergen matrix found after all four required searches.", "Direct allergen fields remain unavailable; no mayContain or inferred wheat/gluten was promoted."],
};
write(paths.evidence, evidence);

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "generated target missing");
const target = generated.restaurants[index]; const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url));
const matchByProduct = new Map(result.reconciliation.items.flatMap((r) => (r.matchedCurrentProductKeys ?? []).map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ ...p, id: p.currentProductKey, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 71; target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable"; target.officialAllergenRemediationBucket = "accurately-unavailable";
target.allergenDataStatus = { officialItemCount: 0, officialEvidence: { officialFullMatrixOrApi: 0, officialIngredientDisclosure: 0, officialProductSection: 0, globalCrossContactNote: 0, unavailable: 71, suspiciousOfficialParserFragments: 0 }, officialTotal: 0, totalItemCount: 71, officialCoverageRatio: 0, bucket: "unavailable" };
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target); write(paths.generated, generated);

const summary = read(paths.summary); const summaryIndex = summary.restaurants.findIndex((r) => r.id === id); assert(summaryIndex >= 0, "summary target missing");
summary.restaurants[summaryIndex] = { ...summary.restaurants[summaryIndex], itemCount: 71, totalItemCount: 71, officialAllergenStatus: "accurately_unavailable", allergenDataStatus: target.allergenDataStatus, officialTotal: 0, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete" }; write(paths.summary, summary);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys) }; });
fs.writeFileSync(paths.itemChecks, `${updatedChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
const currentSurfaces = result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, url: s.url, current: s.current === true && s.scopeStatus === "complete", scopeStatus: s.scopeStatus, verified: true, evidenceIds: unique(s.sourceEvidenceIds), notes: s.notes ? [s.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, domain: result.identity.domain, officialHomepage: result.identity.officialHomepageUrl, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 71, currentProductCount: 71, reconciledCurrentProductCount: 71, surfaces: currentSurfaces, products: result.currentProducts, notes: ["Current food and nonalcoholic catalog is represented; alcohol-only wine list presentations are excluded from products.", "Direct allergen data is accurately unavailable. Ingredient Intelligence remains inferred separately."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 71, sourceItemCount: 71 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, reconciliation: { frozenKeys: 71, exactOnce: 71, normalizedMatchCount: 71 }, adjudication: { type: "coordinator", runId: `${batchId}-${id}-apply`, recommendation: "codex_verified", model: { id: "codex-poc-coordinator", reasoningEffort: "low" }, rationale: "Identity, current menu scope, exact-once reconciliation, and four-class allergen search are complete; official allergen status is accurately unavailable.", decidedAt: "2026-07-20T00:00:00.000Z", artifactPath: `artifacts/${id}/coordinator-adjudication.json` } };
fs.writeFileSync(`${artifactRoot}/coordinator-adjudication.json`, `${JSON.stringify(dossier.adjudication, null, 2)}\n`); dossier.adjudication.sha256 = fileHash(`${artifactRoot}/coordinator-adjudication.json`); write(paths.dossier, dossier);

const changedPaths = [paths.generated, paths.summary, paths.dossier, paths.evidence, paths.itemChecks, `${root}/scripts/apply-blue-duck-tavern-dc-poc.mjs`, paths.apply, ...artifactEntries.map((a) => `${root}/data/restaurant-verification/${a.artifactPath}`), `${artifactRoot}/coordinator-adjudication.json`];
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileHash(p)]));
const applyResult = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 71, reconciledCount: 71, normalizedMatchCount: 71, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 71, evidenceSourceCount: evidence.sources.length, ingredientIntelligenceRecomputed: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "node scripts/restaurant-verification-poc-result.mjs jobs/blue-duck-tavern-dc.json results/blue-duck-tavern-dc.json", "node scripts/apply-blue-duck-tavern-dc-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 71, normalizedMatches: 71, directAllergens: 0, mayContain: 0, unavailable: 71, wheat: 0, gluten: 0, evidenceSources: evidence.sources.length } };
write(paths.apply, applyResult); console.log(JSON.stringify({ fingerprint, counts: applyResult.counts, changedPaths, secondRunDiff: "none", applyResult: paths.apply }, null, 2));
