import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateWorkerEvaluation } from "./restaurant-verification-worker-evaluation.mjs";

test("runtime-aborted worker runs remain evaluation-ineligible with unknown quality gates", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worker-evaluation-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const runId = "aborted-pilot";
  const runRoot = path.join(root, "worker-runs", runId);
  await mkdir(path.join(runRoot, "jobs"), { recursive: true });
  await mkdir(path.join(runRoot, "logs"), { recursive: true });
  const jobs = [];
  const ledger = [];
  for (let index = 0; index < 10; index += 1) {
    const restaurantId = `restaurant-${String(index).padStart(2, "0")}`;
    const jobPath = `jobs/${restaurantId}.json`;
    const shared = {
      restaurantId,
      name: `Restaurant ${index}`,
      jobPath,
      scoutResultPath: `scout-results/${restaurantId}.json`,
      scoutRoutePath: `scout-routes/${restaurantId}.json`,
      resultPath: `results/${restaurantId}.json`,
      routePath: `routes/${restaurantId}.json`,
      reviewPath: `reviews/${restaurantId}.json`,
      reviewValidationPath: `review-validations/${restaurantId}.json`,
      status: "luna_failed",
      lunaExitCode: 1,
    };
    jobs.push(shared);
    ledger.push({ restaurantId, name: shared.name, status: "pending", completedAt: null });
    await writeFile(path.join(runRoot, jobPath), JSON.stringify({
      runId,
      restaurant: { restaurantId, baselineItemCount: 1, baselineItemFingerprint: "a".repeat(64) },
    }));
    await writeFile(path.join(runRoot, "logs", `${restaurantId}.luna.log`), `OpenAI Codex v0\nmodel: gpt-5.6-luna\nreasoning effort: low\nERROR: You've hit your usage limit.\n`);
  }
  await writeFile(path.join(root, "ledger.jsonl"), `${ledger.map(JSON.stringify).join("\n")}\n`);
  await writeFile(path.join(runRoot, "manifest.json"), JSON.stringify({ schemaVersion: 2, runId, status: "awaiting_luna_retry", jobs }));

  const evaluation = await generateWorkerEvaluation({ root, runId, now: "2026-07-15T00:00:00.000Z" });
  assert.equal(evaluation.eligibility.eligible, false);
  assert.equal(evaluation.cohort.actualSize, 10);
  assert.equal(evaluation.cohort.selectionOrderValid, true);
  assert.equal(evaluation.batch.stageMetrics.luna.runtimeFailures, 10);
  assert.equal(evaluation.batch.tokens.total, null);
  assert.equal(evaluation.batch.tokens.partialTotal, null);
  assert.equal(evaluation.batch.acceptance.find((gate) => gate.gateId === "luna_false_clean_count").passed, null);
  assert.match(await readFile(path.join(runRoot, "evaluation.md"), "utf8"), /Status: \*\*INELIGIBLE\*\*/);
});

test("ten fully mapped terminal restaurants pass every mandatory pilot gate", async (context) => {
  const { root, runId } = await createCompletedFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const evaluation = await generateWorkerEvaluation({ root, runId, write: false });
  assert.equal(evaluation.eligibility.eligible, true);
  assert.equal(evaluation.batch.overallPass, true);
  assert.ok(evaluation.batch.acceptance.every((gate) => gate.passed === true));
  assert.deepEqual(evaluation.restaurants[0].coverage.sources.lineage.luna, { numerator: 1, denominator: 1, rate: 1 });
});

test("planted false-clean, authority, coverage, product, coordinator-only, and gate-escape failures all fail", async (context) => {
  const { root, runId } = await createCompletedFixture({ failing: true });
  context.after(() => rm(root, { recursive: true, force: true }));
  const evaluation = await generateWorkerEvaluation({ root, runId, write: false });
  assert.equal(evaluation.eligibility.eligible, true);
  assert.equal(evaluation.batch.overallPass, false);
  for (const gateId of [
    "luna_false_clean_count",
    "authority_promotion_count",
    "missing_frozen_reconciliation_count",
    "duplicate_frozen_reconciliation_count",
    "unreviewed_current_product_count",
    "coordinator_only_material_finding_count",
    "routing_violation_count",
  ]) {
    const gate = evaluation.batch.acceptance.find((candidate) => candidate.gateId === gateId);
    assert.equal(gate.passed, false, gateId);
    assert.ok(gate.actual > 0, gateId);
    assert.deepEqual(gate.restaurantIds, ["restaurant-00"], gateId);
  }
});

async function createCompletedFixture({ failing = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "completed-worker-evaluation-"));
  const runId = "completed-pilot";
  const runRoot = path.join(root, "worker-runs", runId);
  for (const directory of ["jobs", "scout-results", "scout-routes", "results", "routes", "reviews", "review-validations", "coordinator-gold", "logs", "item-checks"]) {
    await mkdir(path.join(runRoot, directory), { recursive: true });
  }
  await mkdir(path.join(root, "item-checks"), { recursive: true });
  const jobs = [];
  const ledger = [];
  for (let index = 0; index < 10; index += 1) {
    const restaurantId = `restaurant-${String(index).padStart(2, "0")}`;
    const isFailing = failing && index === 0;
    const itemCheckPath = path.join(root, "item-checks", `${restaurantId}.jsonl`);
    const baselineRows = ["1:first", "2:second"].map((auditItemKey) => ({ auditItemKey, baseline: { name: auditItemKey } }));
    await writeFile(itemCheckPath, `${baselineRows.map(JSON.stringify).join("\n")}\n`);
    const relative = (folder) => `${folder}/${restaurantId}.json`;
    const entry = {
      restaurantId,
      name: `Restaurant ${index}`,
      jobPath: relative("jobs"), scoutResultPath: relative("scout-results"), scoutRoutePath: relative("scout-routes"),
      resultPath: relative("results"), routePath: relative("routes"), reviewPath: relative("reviews"),
      reviewValidationPath: relative("review-validations"), status: "awaiting_coordinator",
    };
    jobs.push(entry);
    ledger.push({ restaurantId, name: entry.name, status: "codex_verified", completedAt: "2026-07-15T00:00:00.000Z", verificationContractVersion: 2 });
    await writeJson(path.join(runRoot, entry.jobPath), {
      runId,
      restaurant: { restaurantId, baselineItemCount: 2, baselineItemFingerprint: "a".repeat(64) },
      inputs: { itemChecksPath: itemCheckPath },
    });
    const evidence = [{ evidenceId: "source", url: `https://${restaurantId}.example/menu`, authorityTier: isFailing ? "restaurant_issued" : "third_party" }];
    const normalGroups = [{ auditItemKeys: ["1:first", "2:second"], allergenVerdict: "verified" }];
    const scout = {
      model: { id: "gpt-5.6-luna", reasoningEffort: "low" }, outcome: "no_discrepancy", sources: evidence,
      menuSurfaces: [{ surfaceId: "menu" }], currentProducts: [{ currentProductKey: "current:one" }],
      itemCheckGroups: isFailing ? [{ auditItemKeys: ["1:first", "1:first"], allergenVerdict: "verified" }] : normalGroups,
    };
    const terra = {
      model: { id: "gpt-5.6-terra", reasoningEffort: "low" }, outcome: "no_discrepancy", sources: evidence,
      surfaceChecks: [{ surfaceId: "menu" }], currentProductCheckGroups: [{ currentProductKeys: ["current:one"] }],
      additionalMenuSurfaces: [], additionalCurrentProducts: isFailing ? [{ currentProductKey: "current:extra" }] : [],
      reviewedRiskGates: [], findings: [], itemCheckGroups: normalGroups,
    };
    await writeJson(path.join(runRoot, entry.scoutResultPath), scout);
    await writeJson(path.join(runRoot, entry.scoutRoutePath), { destination: "terra_low", validation: { valid: true }, risk: { triggeredGates: [] } });
    await writeJson(path.join(runRoot, entry.resultPath), terra);
    await writeJson(path.join(runRoot, entry.routePath), { destination: "coordinator", validation: { valid: true, warnings: [] }, deterministicRisk: { requiresStrongReview: false } });
    const finalProducts = [{ productId: "product-one", coordinatorReviewed: true, stageKeys: { luna: ["current:one"], terra: ["current:one"] } }];
    if (isFailing) finalProducts.push({ productId: "product-extra", coordinatorReviewed: false, stageKeys: { luna: [], terra: ["current:extra"] } });
    await writeJson(path.join(runRoot, "coordinator-gold", `${restaurantId}.json`), {
      finalSources: [{ sourceId: "canonical-source", canonicalAuthorityTier: "third_party", stageEvidenceIds: { luna: ["source"], terra: ["source"], sol: [] } }],
      finalSurfaces: [{ surfaceId: "menu", stageIds: { luna: ["menu"], terra: ["menu"] } }],
      finalProducts,
      findings: isFailing ? [{
        findingId: "coordinator-only",
        material: true,
        firstDiscoveredStage: "coordinator",
        stageFindingIds: { luna: [], terra: [], sol: [] },
        expectedGateIds: ["missing_required_gate"],
      }] : [],
    });
    await writeFile(path.join(runRoot, "logs", `${restaurantId}.luna.log`), "OpenAI Codex v0\nmodel: gpt-5.6-luna\nreasoning effort: low\ntokens used\n100\n");
    await writeFile(path.join(runRoot, "logs", `${restaurantId}.terra.log`), "OpenAI Codex v0\nmodel: gpt-5.6-terra\nreasoning effort: low\ntokens used\n100\n");
  }
  await writeJson(path.join(runRoot, "manifest.json"), {
    schemaVersion: 2,
    runId,
    status: "awaiting_coordinator",
    models: {
      scout: { id: "gpt-5.6-luna", reasoningEffort: "low" },
      verifier: { id: "gpt-5.6-terra", reasoningEffort: "low" },
      reviewer: { id: "gpt-5.6-sol", reasoningEffort: "medium" },
    },
    jobs,
  });
  await writeFile(path.join(root, "ledger.jsonl"), `${ledger.map(JSON.stringify).join("\n")}\n`);
  return { root, runId };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value));
}
