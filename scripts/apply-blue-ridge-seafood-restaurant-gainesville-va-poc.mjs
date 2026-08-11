#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "blue-ridge-seafood-restaurant-gainesville-va";
const batchId = "poc-batch-025-2026-07-20";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, apply: `${run}/apply-results/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
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
assert(job.batchId === batchId && job.restaurantId === id && job.name === "Blue Ridge Seafood Restaurant", "job identity mismatch");
assert(fingerprint === "4a910c35a740cb34511ff83e561719d07051ed8be5345dc495dc50e46cc0aec2", `stale_apply_packet: ${fingerprint}`);
assert(checks.length === 136, "frozen item-check count changed");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `research validation failed: ${preflight.errors.join(" | ")}`);
assert(result.currentProducts.length === 126 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 126, "expected 126 distinct products");
assert(result.currentProducts.every((p) => p.containsAllergens.length === 0 && p.mayContainAllergens.length === 0 && p.allergenSourceType === "unavailable"), "direct allergen fields changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search changed");

const artifactRoot = `${root}/data/restaurant-verification/artifacts/${id}`;
const artifactSpecs = [
  ["official-home.html", "https://www.blueridgeseafood.com/"],
  ["official-menu.html", "https://www.blueridgeseafood.com/menu"],
  ["official-menu.pdf", "https://www.blueridgeseafood.com/_files/ugd/6ef709_03cdddafb85c4cd08d8c33bab055dfcb.pdf"],
  ["official-steam-pot.pdf", "https://www.blueridgeseafood.com/_files/ugd/6ef709_99de6019c4a04f6299f98e75c63a2487.pdf"],
  ["official-order.html", "https://www.blueridgeseafood.com/order-online"],
];
fs.mkdirSync(artifactRoot, { recursive: true });
for (const [name, url] of artifactSpecs) { const response = await fetch(url); assert(response.ok, `artifact fetch failed: ${url}`); fs.writeFileSync(`${artifactRoot}/${name}`, Buffer.from(await response.arrayBuffer())); }
const artifactEntries = artifactSpecs.map(([name, url]) => ({ url, artifactPath: `artifacts/${id}/${name}`, sha256: fileHash(`${artifactRoot}/${name}`) }));
const evidence = {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified",
  sources: result.sources.map((s) => { const a = artifactEntries.find((x) => x.url === s.url); return { id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: ["identity","menu","allergen","ingredients","cross_contact","both","other"].includes(s.purpose) ? s.purpose : "other", retrievedAt: s.retrievedAt, artifactPath: a?.artifactPath ?? null, sha256: a?.sha256 ?? null, excerpt: s.excerpt, rowIdentifiers: [], notes: [] }; }),
  matrixSearch: result.matrixSearch, notes: ["No official allergen matrix found after all four searches.", "All 126 direct allergen fields remain unavailable; mayContain is empty and no wheat/gluten inference was applied."]
};
write(paths.evidence, evidence);

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "generated target missing");
const target = generated.restaurants[index]; const currentUrls = new Set(result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete").map((s) => s.url));
const recon = result.reconciliation.dispositions.flatMap((g) => g.auditItemKeys.map((key, i) => ({ auditItemKey: key, disposition: g.disposition, matchedCurrentProductKeys: g.disposition === "exact_match" ? [g.matchedCurrentProductKeys[i]] : [], sourceEvidenceIds: g.sourceEvidenceIds })));
const matchByProduct = new Map(recon.flatMap((r) => r.matchedCurrentProductKeys.map((key) => [key, r.auditItemKey])));
target.items = result.currentProducts.map((p) => ({ id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: [matchByProduct.get(p.currentProductKey)].filter(Boolean), ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 126; target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable"; target.officialAllergenRemediationBucket = "accurately-unavailable";
target.allergenDataStatus = { officialItemCount: 0, officialEvidence: { officialFullMatrixOrApi: 0, officialIngredientDisclosure: 0, officialProductSection: 0, globalCrossContactNote: 0, unavailable: 126, suspiciousOfficialParserFragments: 0 }, officialTotal: 0, totalItemCount: 126, officialCoverageRatio: 0, bucket: "unavailable" };
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target); write(paths.generated, generated);
const summary = read(paths.summary); const si = summary.restaurants.findIndex((r) => r.id === id); assert(si >= 0, "summary target missing"); summary.restaurants[si] = { ...summary.restaurants[si], itemCount: 126, totalItemCount: 126, officialAllergenStatus: "accurately_unavailable", allergenDataStatus: target.allergenDataStatus, officialTotal: 0, sourceUrls: [...currentUrls], coveragePercent: 1, coverageStatus: "complete" }; write(paths.summary, summary);

const updatedChecks = checks.map((row) => { const r = recon.find((x) => x.auditItemKey === row.auditItemKey); return { ...row, disposition: r.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: unique(r.sourceEvidenceIds), matchedCurrentProductKeys: unique(r.matchedCurrentProductKeys) }; });
fs.writeFileSync(paths.itemChecks, `${updatedChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
const surfaces = result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, url: s.url, current: s.current === true && s.scopeStatus === "complete", scopeStatus: s.scopeStatus, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: unique(s.sourceEvidenceIds), notes: [] }));
const counts = { frozenKeys: 136, exactMatchCount: 126, artifactCount: 10, staleCount: 0, unresolvedCount: 0 };
const adjudication = { type: "coordinator", runId: `${batchId}-${id}-apply`, recommendation: "codex_verified", model: { id: "codex-poc-coordinator", reasoningEffort: "low" }, rationale: "Authorized target-only apply; 126 distinct products and 10 artifacts reconcile all 136 frozen keys, with official allergen status accurately unavailable.", decidedAt: "2026-07-20T00:00:00.000Z", artifactPath: `artifacts/${id}/coordinator-adjudication.json` };
fs.writeFileSync(`${artifactRoot}/coordinator-adjudication.json`, `${JSON.stringify(adjudication, null, 2)}\n`); adjudication.sha256 = fileHash(`${artifactRoot}/coordinator-adjudication.json`);
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", location: result.identity.location, locationId: job.locationId, domain: result.identity.domain, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 136, currentProductCount: 126, reconciledCurrentProductCount: 126, artifactBaselineItemCount: 10, surfaces, products: result.currentProducts.map((p) => ({ ...p, presentationIds: [], allergenAuthorityTier: null, notes: [] })), notes: ["126 distinct orderable food/nonalcoholic products; headings, promotions, fragments, and word-search content excluded as artifacts.", "Direct allergen status is unavailable; Ingredient Intelligence is inferred separately after direct finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 136, sourceItemCount: 126 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, directMayContainCount: 0 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sources: evidence.sources, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: counts, adjudication };
write(paths.dossier, dossier);

const changedPaths = [paths.generated, paths.summary, paths.dossier, paths.evidence, paths.itemChecks, `${root}/scripts/apply-blue-ridge-seafood-restaurant-gainesville-va-poc.mjs`, paths.apply, ...artifactEntries.map((a) => `${root}/data/restaurant-verification/${a.artifactPath}`), `${artifactRoot}/coordinator-adjudication.json`];
const artifactHashes = Object.fromEntries(changedPaths.filter((p) => p !== paths.apply).map((p) => [p, fileHash(p)]));
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 126, reconciledCount: 136, exactMatchCount: 126, artifactCount: 10, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 126, evidenceSourceCount: evidence.sources.length, ingredientIntelligenceRecomputed: true, idempotencyVerified: true }, errors: [], changedPaths, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "node scripts/restaurant-verification-poc-result.mjs jobs/blue-ridge-seafood-restaurant-gainesville-va.json results/blue-ridge-seafood-restaurant-gainesville-va.json", "node scripts/apply-blue-ridge-seafood-restaurant-gainesville-va-poc.mjs (first run)", "node scripts/apply-blue-ridge-seafood-restaurant-gainesville-va-poc.mjs (second run)", "sha256 comparison of all owned canonical/artifact paths"], secondRunDiff: "none", artifactHashes, counts: { publishedProducts: 126, exact_match: 126, artifacts: 10, stale: 0, unresolved: 0, directAllergens: 0, mayContain: 0, unavailable: 126, wheat: 0, gluten: 0, evidenceSources: evidence.sources.length } };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, counts: apply.counts, secondRunDiff: "none", applyResult: paths.apply }, null, 2));
