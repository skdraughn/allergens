#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(), batchId = "poc-batch-154-2026-08-07", restaurantId = "osm-green-olive-buffet-7765743294";
const run = path.join(root, "data/restaurant-verification/worker-runs", batchId);
const jobPath = path.join(run, "jobs", `${restaurantId}.json`), resultPath = path.join(run, "results", `${restaurantId}.json`);
const reviewPath = path.join(run, "reviews/green-olive-menu-scope.json"), validationPath = path.join(run, "review-validations", `${restaurantId}.json`);
const outputPath = path.join(run, `${restaurantId}.closeout.json`), itemChecksPath = path.join(root, "data/restaurant-verification/item-checks", `${restaurantId}.jsonl`);
const [jobBytes, resultBytes, reviewBytes, itemText] = await Promise.all([readFile(jobPath), readFile(resultPath), readFile(reviewPath), readFile(itemChecksPath, "utf8")]);
const job = JSON.parse(jobBytes), result = JSON.parse(resultBytes), review = JSON.parse(reviewBytes), checks = itemText.trim().split(/\r?\n/).map(JSON.parse);
const now = new Date().toISOString(), sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(path.dirname(validationPath), { recursive: true });
const validationBytes = Buffer.from(`${JSON.stringify(review.validation, null, 2)}\n`); await writeFile(validationPath, validationBytes);
const sources = result.sources.map((source) => ({ ...source, id: source.id ?? source.evidenceId, evidenceId: undefined, purpose: source.purpose === "identity/menu" ? "both" : source.purpose }));
const evidenceIds = new Set(sources.map((source) => source.id));
const packet = {
  restaurantId, name: job.name, identity: result.identity, status: "blocked_unverifiable",
  checks: {
    menu: { verdict: "unverifiable", reviewedItemCount: checks.length, sourceItemCount: null, notes: ["Binding Sol review found no complete current itemized menu boundary."] },
    allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: null, notes: ["All four searches completed without an official matrix."] },
    extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: [] }
  },
  currentCatalog: { status: "unverifiable", reviewedBaselineItemCount: checks.length, currentProductCount: 0, reconciledCurrentProductCount: 0, surfaces: [], products: [], notes: ["All 72 SinglePlatform rows are stale; their removal does not establish a complete zero-product catalog. The descriptive buffet placeholder is not publishable as an itemized product."] },
  adjudication: { type: "coordinator", runId: batchId, decidedAt: now, recommendation: "blocked_unverifiable", model: { id: "codex-poc-coordinator", reasoningEffort: "high" }, rationale: "Binding Sol review requires blocked status until a complete current itemized catalog is available.", artifactHashes: [] },
  evidence: sources, replaceEvidence: true,
  sourceAttempts: [
    { id: "attempt-official-site", attemptedAt: now, kind: "official_site", status: "contradictory", url: "https://green-olive-buffet.placejoys.com/", outcome: "Current listing is descriptive only.", scopeImpact: "It cannot establish itemized membership.", evidenceIds: ["ev-placejoys"] },
    { id: "attempt-linked-source", attemptedAt: now, kind: "linked_source", status: "blocked", url: "http://places.singleplatform.com/green-olive-buffet--grill/menu", outcome: "Itemized vendor surface is robot-blocked.", scopeImpact: "Frozen rows cannot be verified current.", evidenceIds: ["ev-singleplatform"] },
    { id: "attempt-ordering-vendor", attemptedAt: now, kind: "ordering_vendor", status: "blocked", url: "http://places.singleplatform.com/green-olive-buffet--grill/menu", outcome: "No accessible current itemized menu.", scopeImpact: "Complete catalog remains unknown.", evidenceIds: ["ev-search-vendor"] },
    { id: "attempt-targeted-search", attemptedAt: now, kind: "targeted_search", status: "not_found", query: "Green Olive Buffet Alexandria allergen nutrition ingredients PDF menu", outcome: "No complete official itemized catalog or allergen matrix found.", scopeImpact: "Search did not resolve scope.", evidenceIds: ["ev-search-web"] },
    { id: "attempt-archive", attemptedAt: now, kind: "archive", status: "not_found", query: "Green Olive Buffet Alexandria archived menu", outcome: "No historical source can prove current membership.", scopeImpact: "Archive evidence was not used as current.", evidenceIds: ["ev-search-web"] },
    { id: "attempt-third-party", attemptedAt: now, kind: "third_party", status: "contradictory", url: "https://green-olive-buffet.placejoys.com/", outcome: "Descriptive categories are not orderable products.", scopeImpact: "Context only; no complete boundary.", evidenceIds: ["ev-placejoys"] }
  ],
  findings: [{ id: "unverifiable-current-itemized-menu", severity: "high", kind: "menu_scope", summary: "Complete current Green Olive Buffet menu cannot be verified.", evidenceIds: ["ev-placejoys", "ev-singleplatform"], resolved: true, resolution: "Binding Sol review requires blocked_unverifiable until a complete current itemized catalog is captured." }], replaceFindings: true,
  repairs: [], replaceRepairs: true,
  itemChecks: checks.map((item) => ({ auditItemKey: item.auditItemKey, disposition: "stale_extra", allergenVerdict: "accurately_unavailable", sourceEvidenceIds: ["ev-singleplatform"].filter((id) => evidenceIds.has(id)), matchedCurrentProductKeys: [], adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: ["unverifiable-current-itemized-menu"], notes: "Frozen SinglePlatform row is stale; no current product match or allergen absence is claimed." })),
  workerHandoff: { runId: batchId, restaurantId, preparedAt: now, routeDestination: "sol_medium", solRequired: true, artifacts: [
    { kind: "poc_job", path: path.relative(path.join(root, "data/restaurant-verification"), jobPath), sha256: sha(jobBytes) },
    { kind: "poc_research", path: path.relative(path.join(root, "data/restaurant-verification"), resultPath), sha256: sha(resultBytes) },
    { kind: "sol_review", path: path.relative(path.join(root, "data/restaurant-verification"), reviewPath), sha256: sha(reviewBytes) },
    { kind: "sol_validation", path: path.relative(path.join(root, "data/restaurant-verification"), validationPath), sha256: sha(validationBytes) }
  ], notes: ["Binding narrow Sol menu-scope review persisted."] },
  notes: ["Coordinator blocked closeout for unresolved itemized menu scope."]
};
await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`); console.log(outputPath);
