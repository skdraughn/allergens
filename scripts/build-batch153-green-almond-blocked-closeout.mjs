#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const batchId = "poc-batch-153-2026-08-07";
const restaurantId = "green-almond-pantry-dc";
const run = path.join(root, "data/restaurant-verification/worker-runs", batchId);
const jobPath = path.join(run, "jobs", `${restaurantId}.json`);
const resultPath = path.join(run, "results", `${restaurantId}.json`);
const reviewPath = path.join(run, "reviews", "green-almond-menu-scope.json");
const validationPath = path.join(run, "review-validations", `${restaurantId}.json`);
const outputPath = path.join(run, `${restaurantId}.closeout.json`);
const [jobBytes, resultBytes, reviewBytes] = await Promise.all([readFile(jobPath), readFile(resultPath), readFile(reviewPath)]);
const job = JSON.parse(jobBytes);
const result = JSON.parse(resultBytes);
const review = JSON.parse(reviewBytes);
const now = new Date().toISOString();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(path.dirname(validationPath), { recursive: true });
const validationBytes = Buffer.from(`${JSON.stringify(review.validation, null, 2)}\n`);
await writeFile(validationPath, validationBytes);
const sources = result.sources.map((source) => ({
  ...source,
  id: source.id ?? source.evidenceId,
  evidenceId: undefined,
  purpose: ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(source.purpose) ? source.purpose : "other",
}));
const packet = {
  restaurantId,
  name: job.name,
  identity: result.identity,
  status: "blocked_unverifiable",
  checks: {
    menu: { verdict: "unverifiable", reviewedItemCount: 0, sourceItemCount: null, notes: ["Binding Sol review found no complete readable current public menu boundary."] },
    allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: null, notes: ["All four searches completed without an official item matrix."] },
    extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: [] },
  },
  currentCatalog: {
    status: "unverifiable",
    reviewedBaselineItemCount: 0,
    currentProductCount: 0,
    reconciledCurrentProductCount: 0,
    surfaces: [],
    products: [],
    notes: ["The zero-row baseline does not establish a zero-product catalog; current official and linked menu surfaces are unreadable or incomplete."],
  },
  adjudication: {
    type: "coordinator",
    runId: batchId,
    decidedAt: now,
    recommendation: "blocked_unverifiable",
    model: { id: "codex-poc-coordinator", reasoningEffort: "high" },
    rationale: "Binding Sol review requires blocked status until a complete current food and nonalcoholic menu is enumerated.",
    artifactHashes: [],
  },
  evidence: sources,
  replaceEvidence: true,
  sourceAttempts: [
    { id: "attempt-official-site", attemptedAt: now, kind: "official_site", status: "blocked", url: "https://www.greenalmondpantry.com/menu", outcome: "Official menu exposes no readable itemized catalog.", scopeImpact: "The current product boundary remains unknown.", evidenceIds: ["ev-menu"] },
    { id: "attempt-linked-source", attemptedAt: now, kind: "linked_source", status: "blocked", url: "https://greenalmondpantry.square.site/", outcome: "Restaurant-linked Square surface exposes no readable menu.", scopeImpact: "Linked evidence cannot establish catalog completeness.", evidenceIds: ["ev-square"] },
    { id: "attempt-ordering-vendor", attemptedAt: now, kind: "ordering_vendor", status: "blocked", url: "https://www.doordash.com/store/green-almond-pantry-29666979/", outcome: "Linked DoorDash page reports inactive status; cached names are stale.", scopeImpact: "The inactive surface cannot prove current membership.", evidenceIds: ["ev-doordash"] },
    { id: "attempt-targeted-search", attemptedAt: now, kind: "targeted_search", status: "not_found", query: "site:greenalmondpantry.com allergen allergy nutrition ingredients PDF menu", outcome: "No complete current catalog or official allergen matrix found.", scopeImpact: "Search did not resolve menu scope.", evidenceIds: ["ev-home", "ev-hours"] },
    { id: "attempt-archive", attemptedAt: now, kind: "archive", status: "not_found", query: "Green Almond Pantry archived menu", outcome: "No archive suitable to prove current membership was used.", scopeImpact: "Historical material cannot establish the current catalog.", evidenceIds: ["ev-georgetown"] },
    { id: "attempt-third-party", attemptedAt: now, kind: "third_party", status: "contradictory", url: "https://www.restaurantji.com/dc/washington/green-almond-pantry-/", outcome: "Third-party listing cannot establish a complete current catalog.", scopeImpact: "Third-party context remains supporting only.", evidenceIds: ["ev-restaurantji"] },
  ],
  findings: [{ id: "unverifiable-current-menu-boundary", severity: "high", kind: "menu_scope", summary: "Complete current Green Almond Pantry menu cannot be verified.", evidenceIds: ["ev-menu", "ev-square", "ev-doordash"], resolved: true, resolution: "Binding Sol review requires blocked_unverifiable until a complete current public menu is captured." }],
  replaceFindings: true,
  repairs: [],
  replaceRepairs: true,
  itemChecks: [],
  workerHandoff: {
    runId: batchId,
    restaurantId,
    preparedAt: now,
    routeDestination: "sol_medium",
    solRequired: true,
    artifacts: [
      { kind: "poc_job", path: path.relative(path.join(root, "data/restaurant-verification"), jobPath), sha256: sha(jobBytes) },
      { kind: "poc_research", path: path.relative(path.join(root, "data/restaurant-verification"), resultPath), sha256: sha(resultBytes) },
      { kind: "sol_review", path: path.relative(path.join(root, "data/restaurant-verification"), reviewPath), sha256: sha(reviewBytes) },
      { kind: "sol_validation", path: path.relative(path.join(root, "data/restaurant-verification"), validationPath), sha256: sha(validationBytes) },
    ],
    notes: ["Binding Sol menu-scope review persisted."],
  },
  notes: ["Coordinator blocked closeout for unresolved current menu scope."],
};
await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
console.log(outputPath);
