#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const batchId = "poc-batch-149-2026-08-07";
const restaurantId = "gong-cha";
const run = path.join(root, "data/restaurant-verification/worker-runs", batchId);
const jobPath = path.join(run, "jobs", `${restaurantId}.json`);
const resultPath = path.join(run, "results", `${restaurantId}.json`);
const reviewPath = path.join(run, "reviews/gong-cha-menu-scope.json");
const validationPath = path.join(run, "review-validations/gong-cha.json");
const outputPath = path.join(run, `${restaurantId}.closeout.json`);
const itemChecksPath = path.join(root, "data/restaurant-verification/item-checks/gong-cha.jsonl");

const [jobBytes, resultBytes, reviewBytes, itemText] = await Promise.all([
  readFile(jobPath), readFile(resultPath), readFile(reviewPath), readFile(itemChecksPath, "utf8"),
]);
const job = JSON.parse(jobBytes);
const result = JSON.parse(resultBytes);
const review = JSON.parse(reviewBytes);
const checks = itemText.trim().split(/\r?\n/).map(JSON.parse);
const now = new Date().toISOString();
await mkdir(path.dirname(validationPath), { recursive: true });
const validationBytes = Buffer.from(`${JSON.stringify(review.validation, null, 2)}\n`);
await writeFile(validationPath, validationBytes);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = result.sources.map((source) => ({
  ...source,
  id: source.id ?? source.evidenceId,
  evidenceId: undefined,
}));
const evidenceIds = new Set(sources.map((source) => source.id));
const packet = {
  restaurantId,
  name: job.name,
  identity: result.identity,
  restaurantLevelAllergenEvidence: [{
    kind: "cross_contact",
    scope: "restaurant_level_all_bubble_tea_products",
    mayContainAllergens: ["milk", "peanut", "tree-nut", "soy", "gluten"],
    sourceEvidenceIds: ["ev-allergy"],
    notes: ["Official broad may-contain/contact warning; not a complete item-level allergen profile."],
  }],
  status: "blocked_unverifiable",
  checks: {
    menu: { verdict: "unverifiable", reviewedItemCount: checks.length, sourceItemCount: null, notes: ["Binding Sol review requires a concrete store-specific ordering catalog."] },
    allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["All four searches completed; broad official cross-contact warning preserved without unsupported negatives."] },
    extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: [] },
  },
  currentCatalog: {
    status: "unverifiable", reviewedBaselineItemCount: checks.length, currentProductCount: 0,
    reconciledCurrentProductCount: 0, surfaces: [], products: [],
    notes: ["National showcase is partial and location-specific ordering requires a concrete store selection."],
  },
  adjudication: {
    type: "coordinator", runId: batchId, decidedAt: now, recommendation: "blocked_unverifiable",
    model: { id: "codex-poc-coordinator", reasoningEffort: "high" },
    rationale: "Binding Sol review found no complete current menu boundary for the location-null chain record.", artifactHashes: [],
  },
  evidence: sources,
  replaceEvidence: true,
  sourceAttempts: [
    { id: "attempt-official-site", attemptedAt: now, kind: "official_site", status: "contradictory", url: "https://www.gong-cha.com/usa/us-en/our-products", outcome: "Official page is a partial showcase, not a complete USA catalog.", scopeImpact: "National current membership remains unknown.", evidenceIds: ["ev-products"] },
    { id: "attempt-linked-source", attemptedAt: now, kind: "linked_source", status: "blocked", url: "https://www.gong-cha.com/usa/us-en/store-finder", outcome: "Ordering requires selection of a concrete store.", scopeImpact: "No location-specific menu is available for locationId null.", evidenceIds: ["ev-store"] },
    { id: "attempt-ordering-vendor", attemptedAt: now, kind: "ordering_vendor", status: "blocked", url: "https://www.gong-cha.com/usa/us-en/store-finder", outcome: "Store-specific ordering remains locked until a store is selected.", scopeImpact: "Complete orderable product boundary cannot be captured.", evidenceIds: ["ev-store"] },
    { id: "attempt-targeted-search", attemptedAt: now, kind: "targeted_search", status: "not_found", query: "site:gong-cha-usa.com allergen nutrition ingredients complete menu", outcome: "No complete national item catalog or matrix found.", scopeImpact: "Search did not resolve menu completeness.", evidenceIds: ["ev-search-web"] },
    { id: "attempt-archive", attemptedAt: now, kind: "archive", status: "not_found", query: "Gong cha USA archived complete national menu", outcome: "No archive suitable to prove current national availability found.", scopeImpact: "Historical material cannot establish current membership.", evidenceIds: ["ev-search-web"] },
    { id: "attempt-third-party", attemptedAt: now, kind: "third_party", status: "contradictory", url: "https://www.nutritionix.com/gong-cha/menu/premium", outcome: "Nutritionix exposes 205 rows but has no established official linkage, effective date, or location scope.", scopeImpact: "Third-party rows cannot establish current national or store availability.", evidenceIds: ["ev-nutritionix"] },
  ],
  findings: [{
    id: "unverifiable-location-specific-menu", severity: "high", kind: "menu_scope",
    summary: "A concrete store is required to verify Gong cha's complete current menu.",
    evidenceIds: ["ev-products", "ev-store", "ev-nutritionix"], resolved: true,
    resolution: "Binding Sol review requires blocked_unverifiable until a store-specific official ordering catalog is captured.",
  }],
  replaceFindings: true,
  repairs: [], replaceRepairs: true,
  itemChecks: checks.map((item) => ({
    auditItemKey: item.auditItemKey,
    disposition: "location_mismatch",
    allergenVerdict: "accurately_unavailable",
    sourceEvidenceIds: [...["ev-products", "ev-store", "ev-nutritionix"].filter((id) => evidenceIds.has(id))],
    matchedCurrentProductKeys: [], adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [],
    adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null,
    allergenSourceEvidenceIds: [], resolvedFindingIds: ["unverifiable-location-specific-menu"],
    notes: "Location-specific currency is unresolved; no current product match or allergen absence is claimed.",
  })),
  workerHandoff: {
    runId: batchId, restaurantId, preparedAt: now, routeDestination: "sol_medium", solRequired: true,
    artifacts: [
      { kind: "poc_job", path: path.relative(path.join(root, "data/restaurant-verification"), jobPath), sha256: sha(jobBytes) },
      { kind: "poc_research", path: path.relative(path.join(root, "data/restaurant-verification"), resultPath), sha256: sha(resultBytes) },
      { kind: "sol_review", path: path.relative(path.join(root, "data/restaurant-verification"), reviewPath), sha256: sha(reviewBytes) },
      { kind: "sol_validation", path: path.relative(path.join(root, "data/restaurant-verification"), validationPath), sha256: sha(validationBytes) },
    ],
    notes: ["Binding narrow Sol menu-scope review persisted."],
  },
  notes: ["Coordinator blocked closeout: concrete store selection is required."],
};
await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
console.log(outputPath);
