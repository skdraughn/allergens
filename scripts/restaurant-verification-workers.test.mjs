import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCoordinatorDecisionFromArtifacts,
  ingestCoordinatorDecision,
  prepareCoordinatorHandoff,
  validateGoldLineage,
  validateGoldMappings,
} from "./restaurant-verification-coordinator.mjs";
import { completeRestaurantVerification } from "./restaurant-verification-ledger.mjs";

import {
  classifySystemicWorkerFailure,
  classifyWorkerExecutionSystemicFailure,
  createWorkerRun,
  lunaModel,
  routeWorkerResult,
  runLunaScouts,
  runTerraWorkers,
  selectWorkerCandidates,
  solModel,
  terraModel,
  validateScoutResult,
  validateSolReview,
  validateTerraResult,
  workerWorkflowSchemaVersion,
} from "./restaurant-verification-workers.mjs";

test("structured-output schemas avoid unsupported uniqueItems keywords", async () => {
  const schemaPaths = [
    "schemas/restaurant-verification-scout-result.schema.json",
    "schemas/restaurant-verification-worker-result.schema.json",
    "schemas/restaurant-verification-review-result.schema.json",
  ];
  for (const schemaPath of schemaPaths) {
    const contents = await readFile(new URL(schemaPath, import.meta.url), "utf8");
    assert.doesNotMatch(contents, /\"uniqueItems\"/);
    assertStructuredOutputObjects(JSON.parse(contents));
  }
});

function assertStructuredOutputObjects(node, location = "$") {
  if (!node || typeof node !== "object") return;
  if (node.type === "object" && node.properties) {
    assert.deepEqual(
      new Set(node.required ?? []),
      new Set(Object.keys(node.properties)),
      `${location} must require every declared property`,
    );
  }
  for (const [key, value] of Object.entries(node)) {
    assertStructuredOutputObjects(value, `${location}.${key}`);
  }
}

test("a v2 run reserves the next alphabetical records without mutating the ledger", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledgerPath = path.join(root, "ledger.jsonl");
  const before = await readFile(ledgerPath, "utf8");

  const run = await createWorkerRun({ root, limit: 2, runId: "test-run", now: "2026-07-15T12:00:00.000Z" });

  assert.equal(run.schemaVersion, 2);
  assert.deepEqual(run.models, { scout: lunaModel, verifier: terraModel, reviewer: solModel });
  assert.deepEqual(run.jobs.map((job) => job.restaurantId), ["alpha", "bravo"]);
  assert.ok(run.jobs.every((job) => job.scoutResultPath && job.verifierPacketPath && job.resultPath));
  assert.equal(await readFile(ledgerPath, "utf8"), before);
  assert.deepEqual((await selectWorkerCandidates({ root, limit: 3 })).map((row) => row.restaurantId), ["charlie"]);
});

test("dry-run selection creates no reservation", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const dryRun = await createWorkerRun({ root, limit: 2, runId: "dry-run", dryRun: true });
  assert.deepEqual(dryRun.candidates.map((row) => row.restaurantId), ["alpha", "bravo"]);
  assert.deepEqual((await selectWorkerCandidates({ root, limit: 2 })).map((row) => row.restaurantId), ["alpha", "bravo"]);
});

test("a systemic Luna failure trips the circuit breaker", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createWorkerRun({ root, limit: 3, runId: "circuit-test" });
  let calls = 0;
  const manifest = await runLunaScouts({
    root,
    runId: "circuit-test",
    concurrency: 1,
    spawnWorker: async () => {
      calls += 1;
      return {
        exitCode: 1,
        error: null,
        systemicFailure: classifySystemicWorkerFailure("ERROR: You've hit your usage limit."),
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(manifest.systemicFailure.code, "usage_limit");
  assert.ok(manifest.jobs.every((job) => job.status === "luna_failed"));
  assert.equal(manifest.jobs[0].lunaAttempts.length, 1);
  assert.equal(manifest.jobs[0].lunaAttempts[0].systemicFailure.code, "usage_limit");
  assert.equal(manifest.jobs[1].lunaAttempts, undefined);
  assert.match(manifest.jobs[1].lunaError, /Circuit breaker/);
});

test("successful worker output cannot trip a systemic circuit breaker by mentioning an error phrase", () => {
  assert.deepEqual(classifySystemicWorkerFailure("invalid_json_schema"), {
    code: "invalid_output_schema",
    message: "Codex rejected the configured structured-output schema.",
  });
  // spawnCodex applies this classifier only to nonzero exits; structured result prose is never a circuit-breaker signal.
});

test("a timed-out worker cannot trip a systemic circuit breaker from its draft prose", () => {
  assert.equal(classifyWorkerExecutionSystemicFailure({
    exitCode: -1,
    timedOut: true,
    output: "Required local files were not available for complete reconciliation.",
  }), null);
});

test("a complete Luna scout is structurally valid but always routes through Terra", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createWorkerRun({ root, limit: 1, runId: "luna-test" });

  const manifest = await runLunaScouts({
    root,
    runId: "luna-test",
    concurrency: 1,
    spawnWorker: async ({ args }) => {
      assert.deepEqual(args.slice(0, 4), ["-a", "never", "--search", "exec"]);
      assert.equal(args[args.indexOf("--model") + 1], lunaModel.id);
      assert.ok(args.includes(`model_reasoning_effort=${lunaModel.reasoningEffort}`));
      assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
      const outputPath = args[args.indexOf("--output-last-message") + 1];
      await writeFile(outputPath, `${JSON.stringify(scoutFixture({ runId: "luna-test" }))}\n`);
      return {
        exitCode: 0,
        error: null,
        reportedModel: lunaModel,
        tokens: { available: true, total: 1234, source: "test" },
      };
    },
  });

  assert.equal(manifest.status, "awaiting_terra");
  assert.equal(manifest.jobs[0].status, "awaiting_terra");
  assert.equal(manifest.jobs[0].lunaAttempts.length, 1);
  assert.equal(manifest.jobs[0].lunaAttempts[0].model.exact, true);
  assert.match(manifest.jobs[0].lunaAttempts[0].schema.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.jobs[0].lunaAttempts[0].prompt.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.jobs[0].lunaAttempts[0].inputs[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.jobs[0].lunaAttempts[0].result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.jobs[0].lunaAttempts[0].validation.valid, true);
  assert.equal(manifest.jobs[0].lunaAttempts[0].tokens.total, 1234);
  const route = JSON.parse(await readFile(path.join(root, "worker-runs/luna-test/scout-routes/alpha.json"), "utf8"));
  assert.equal(route.destination, "terra_low");
  assert.match(route.reasons.join(" "), /Every valid Luna scout/i);
});

test("a valid low-confidence incomplete scout escalates to Terra instead of retrying Luna", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createWorkerRun({ root, limit: 1, runId: "luna-escalation-test" });

  const manifest = await runLunaScouts({
    root,
    runId: "luna-escalation-test",
    concurrency: 1,
    spawnWorker: async ({ args }) => {
      const result = scoutFixture({ runId: "luna-escalation-test" });
      result.outcome = "low_confidence";
      result.confidence = {
        level: "low",
        overall: 0.5,
        menu: 0.5,
        allergenSource: 0.5,
        extraction: 0.5,
        rationale: "The accessible surface could not be fully enumerated.",
      };
      result.menuSurfaces[0].fullyEnumerated = false;
      result.menuSurfaces[0].scopeStatus = "partial";
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify(result));
      return { exitCode: 0, error: null, reportedModel: lunaModel };
    },
  });

  assert.equal(manifest.jobs[0].status, "awaiting_terra");
  const route = JSON.parse(await readFile(path.join(root, "worker-runs/luna-escalation-test/scout-routes/alpha.json"), "utf8"));
  assert.equal(route.destination, "terra_low");
  assert.ok(route.risk.triggeredGates.includes("scope_incomplete"));
  assert.equal(route.risk.retryRequired, false);
});

test("Luna retries retain immutable per-attempt logs and result receipts", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createWorkerRun({ root, limit: 1, runId: "luna-retry-test" });
  await runLunaScouts({
    root,
    runId: "luna-retry-test",
    concurrency: 1,
    spawnWorker: async ({ logPath }) => {
      await writeFile(logPath, "OpenAI Codex v\nmodel: gpt-5.6-luna\nreasoning effort: low\nfirst failure\n");
      return { exitCode: 1, error: "transient failure", reportedModel: lunaModel };
    },
  });
  const manifest = await runLunaScouts({
    root,
    runId: "luna-retry-test",
    concurrency: 1,
    spawnWorker: async ({ args, logPath }) => {
      await writeFile(logPath, "OpenAI Codex v\nmodel: gpt-5.6-luna\nreasoning effort: low\nsecond success\n");
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify(scoutFixture({ runId: "luna-retry-test" })));
      return { exitCode: 0, error: null, reportedModel: lunaModel };
    },
  });
  const attempts = manifest.jobs[0].lunaAttempts;
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0].log.path, attempts[1].log.path);
  assert.notEqual(attempts[0].result.path, attempts[1].result.path);
  assert.equal(attempts[0].result.written, false);
  assert.equal(attempts[1].result.written, true);
  assert.equal(attempts[1].validation.valid, true);
  assert.match(attempts[1].prompt.text, /remove that dangling reference/i);
  assert.match(await readFile(path.resolve(new URL("..", import.meta.url).pathname, attempts[0].log.path), "utf8"), /first failure/);
  assert.match(await readFile(path.resolve(new URL("..", import.meta.url).pathname, attempts[1].log.path), "utf8"), /second success/);
});

test("stale Luna provenance and incomplete baseline reconciliation require a Luna retry", () => {
  const { job, baselineItems } = validationFixture();
  const result = scoutFixture();
  result.restaurant.baselineItemFingerprint = "f".repeat(64);
  result.itemCheckGroups = [];
  const validation = validateScoutResult({ job, baselineItems, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /fingerprint/i);
  assert.match(validation.errors.join(" "), /every baseline item/i);
  assert.match(validation.errors.join(" "), /1:item/);
});

test("scout forward references to undefined products escalate as Terra-review warnings", () => {
  const { job, baselineItems } = validationFixture();
  const result = scoutFixture();
  result.menuSurfaces[0].currentProductKeys.push("current:needs-terra");
  result.itemCheckGroups[0].matchedCurrentProductKeys.push("current:needs-terra");
  const validation = validateScoutResult({ job, baselineItems, result });
  assert.equal(validation.valid, true);
  assert.match(validation.warnings.join(" "), /Unresolved surface currentProductKey/);
  assert.match(validation.warnings.join(" "), /Unresolved matched currentProductKey/);
});

test("scout cannot forward an entirely undefined current product catalog", () => {
  const { job, baselineItems } = validationFixture();
  const result = scoutFixture();
  result.currentProducts = [];
  const validation = validateScoutResult({ job, baselineItems, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /defines no currentProducts records/);
});

test("Terra hard-fails missing surfaces/products while presentation and gate omissions escalate", () => {
  const { job, baselineItems } = validationFixture();
  const scout = scoutFixture();
  const verifierPacket = verifierPacketFixture(scout, ["multi_service"]);
  const result = terraFixture({ resultHash: verifierPacket.scout.resultHash });
  result.surfaceChecks = [];
  result.currentProductCheckGroups[0].presentationIds = [];
  result.reviewedRiskGates = [];
  const validation = validateTerraResult({ job, baselineItems, result, verifierPacket });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /menu surface/i);
  assert.match(validation.warnings.join(" "), /presentation/i);
  assert.match(validation.warnings.join(" "), /risk gate/i);
});

test("contradictory or expanded Terra results cannot bypass Sol review", () => {
  const { job, baselineItems } = validationFixture();
  const scout = scoutFixture();
  const verifierPacket = verifierPacketFixture(scout);
  const result = terraFixture({ resultHash: verifierPacket.scout.resultHash });
  result.surfaceChecks[0].verdict = "mismatch";
  result.additionalCurrentProducts = [structuredClone(scout.currentProducts[0])];
  result.additionalCurrentProducts[0].currentProductKey = "current:missed";
  const validation = validateTerraResult({ job, baselineItems, result, verifierPacket });
  assert.equal(validation.valid, true);
  assert.match(validation.warnings.join(" "), /mismatched or unverifiable menu surface/i);
  assert.match(validation.warnings.join(" "), /additional current products/i);
  assert.equal(routeWorkerResult({ result, validation }).destination, "sol_medium");
});

test("the executable Terra verifier consumes the scout packet and a clean result reaches the coordinator", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createWorkerRun({ root, limit: 1, runId: "terra-test" });
  await runLunaScouts({
    root,
    runId: "terra-test",
    concurrency: 1,
    spawnWorker: async ({ args }) => {
      const outputPath = args[args.indexOf("--output-last-message") + 1];
      await writeFile(outputPath, `${JSON.stringify(scoutFixture({ runId: "terra-test" }))}\n`);
      return { exitCode: 0, error: null };
    },
  });

  const manifest = await runTerraWorkers({
    root,
    runId: "terra-test",
    concurrency: 1,
    spawnWorker: async ({ args }) => {
      assert.equal(args[args.indexOf("--model") + 1], terraModel.id);
      assert.ok(args.includes(`model_reasoning_effort=${terraModel.reasoningEffort}`));
      const packet = JSON.parse(await readFile(path.join(root, "worker-runs/terra-test/verifier-packets/alpha.json"), "utf8"));
      assert.equal(packet.scout.model.id, lunaModel.id);
      const outputPath = args[args.indexOf("--output-last-message") + 1];
      await writeFile(outputPath, `${JSON.stringify(terraFixture({ runId: "terra-test", resultHash: packet.scout.resultHash }))}\n`);
      return { exitCode: 0, error: null, reportedModel: terraModel };
    },
  });

  assert.equal(manifest.status, "awaiting_coordinator");
  assert.equal(manifest.jobs[0].status, "awaiting_coordinator");
  assert.equal(manifest.jobs[0].terraAttempts.length, 1);
  assert.equal(manifest.jobs[0].terraAttempts[0].model.exact, true);
  assert.equal(manifest.jobs[0].terraAttempts[0].validation.valid, true);
  assert.match(manifest.jobs[0].terraAttempts[0].inputs[0].sha256, /^[a-f0-9]{64}$/);
});

test("coordinator preparation revalidates and hashes the full clean worker chain", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createWorkerRun({ root, limit: 1, runId: "handoff-test" });
  await runLunaScouts({
    root,
    runId: "handoff-test",
    concurrency: 1,
    spawnWorker: async ({ args, logPath }) => {
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify(scoutFixture({ runId: "handoff-test" })));
      await writeFile(logPath, "OpenAI Codex v\nmodel: gpt-5.6-luna\nreasoning effort: low\n");
      return { exitCode: 0, error: null, reportedModel: lunaModel };
    },
  });
  await runTerraWorkers({
    root,
    runId: "handoff-test",
    concurrency: 1,
    spawnWorker: async ({ args, logPath }) => {
      const packet = JSON.parse(await readFile(path.join(root, "worker-runs/handoff-test/verifier-packets/alpha.json"), "utf8"));
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify(terraFixture({ runId: "handoff-test", resultHash: packet.scout.resultHash })));
      await writeFile(logPath, "OpenAI Codex v\nmodel: gpt-5.6-terra\nreasoning effort: low\n");
      return { exitCode: 0, error: null, reportedModel: terraModel };
    },
  });

  const packet = await prepareCoordinatorHandoff({ root, runId: "handoff-test", restaurantId: "alpha" });
  assert.equal(packet.coordinator.terminalDecisionAllowed, false);
  assert.equal(packet.coordinator.requiresCoordinatorGold, false);
  assert.deepEqual(packet.lineageInventory.luna.productKeys, ["current:item"]);
  assert.deepEqual(packet.lineageInventory.terra.surfaceIds, ["dinner"]);
  assert.equal(packet.provenance.artifacts.length, 6);
  assert.ok(packet.provenance.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)));
  assert.equal(packet.ledgerCandidate.currentCatalog.status, "not_reviewed");
  assert.equal(packet.ledgerCandidate.currentCatalog.products[0].containsAllergens.length, 0);

  const draft = buildCoordinatorDecisionFromArtifacts({
    packet,
    terra: terraFixture({ runId: "handoff-test", resultHash: packet.lineageInventory ? JSON.parse(await readFile(path.join(root, "worker-runs/handoff-test/verifier-packets/alpha.json"), "utf8")).scout.resultHash : "" }),
    solReview: {
      recommendation: "repair_required",
      summary: "A nonterminal repair is required.",
      confirmedFindings: [],
      rejectedFindings: [],
      coordinatorActions: ["Repair the discrepancy."],
    },
    decidedAt: "2026-07-15T12:30:00.000Z",
  });
  assert.equal(draft.recommendation, "repair_required");
  assert.equal(draft.currentCatalog.status, "not_reviewed");
  assert.equal(draft.goldLineage.finalProducts[0].coordinatorReviewed, true);
  validateGoldLineage(draft.goldLineage, draft.currentCatalog);
  validateGoldMappings(draft.goldLineage, packet.lineageInventory);

  const finalCatalog = structuredClone(packet.ledgerCandidate.currentCatalog);
  finalCatalog.status = "verified";
  const decisionPath = path.join(root, "decision.json");
  await writeFile(decisionPath, JSON.stringify({
    schemaVersion: 1,
    runId: "handoff-test",
    restaurantId: "alpha",
    packetArtifactIndexHash: packet.provenance.artifactIndexHash,
    model: solModel,
    decidedAt: "2026-07-15T13:00:00.000Z",
    recommendation: "codex_verified",
    rationale: "The hashed clean chain and complete current catalog support verification.",
    checks: {
      menu: { verdict: "verified", reviewedItemCount: 1, sourceItemCount: 1 },
      allergenSource: { verdict: "verified", highestAuthorityTier: "restaurant_issued" },
      extraction: { verdict: "verified", parserReviewed: true, semanticsVerified: true },
    },
    currentCatalog: finalCatalog,
    goldLineage: {
      finalSources: [{
        sourceId: "official-menu",
        canonicalAuthorityTier: "restaurant_issued",
        stageEvidenceIds: { luna: ["official-menu"], terra: ["official-menu"], sol: [] },
      }],
      finalSurfaces: [{ surfaceId: "dinner", stageIds: { luna: ["dinner"], terra: ["dinner"] } }],
      finalProducts: [{
        productId: "current:item",
        coordinatorReviewed: true,
        stageKeys: { luna: ["current:item"], terra: ["current:item"] },
      }],
      findings: [],
    },
  }));
  const ingested = await ingestCoordinatorDecision({ root, runId: "handoff-test", restaurantId: "alpha", decisionPath });
  assert.equal(ingested.row.status, "codex_verified");

  const scoutPath = path.join(root, "worker-runs/handoff-test/scout-results/alpha.json");
  const scout = JSON.parse(await readFile(scoutPath, "utf8"));
  scout.summary = "Tampered after Terra verification.";
  await writeFile(scoutPath, JSON.stringify(scout));
  await assert.rejects(
    prepareCoordinatorHandoff({ root, runId: "handoff-test", restaurantId: "alpha", write: false }),
    /luna canonical result does not match|scout hash does not match/i,
  );
  await assert.rejects(
    completeRestaurantVerification({ root, restaurantId: "alpha", status: "codex_verified" }),
    /artifact hash does not match/i,
  );
});

test("coordinator gold lineage requires exact catalog IDs and complete stage provenance", () => {
  const catalog = {
    surfaces: [{ surfaceId: "dinner" }],
    products: [{ currentProductKey: "current:item" }],
  };
  const valid = {
    finalSources: [{
      sourceId: "official-menu",
      canonicalAuthorityTier: "restaurant_issued",
      stageEvidenceIds: { luna: ["luna-source"], terra: ["terra-source"], sol: [] },
    }],
    finalSurfaces: [{ surfaceId: "dinner", stageIds: { luna: ["dinner"], terra: ["dinner"] } }],
    finalProducts: [{
      productId: "current:item",
      coordinatorReviewed: true,
      stageKeys: { luna: ["current:item"], terra: ["current:item"] },
    }],
    findings: [{
      findingId: "finding:one",
      material: true,
      firstDiscoveredStage: "terra",
      stageFindingIds: { luna: [], terra: ["terra:finding:one"], sol: [] },
      expectedGateIds: ["allergen_semantics"],
      resolution: "confirmed",
    }],
  };
  assert.doesNotThrow(() => validateGoldLineage(valid, catalog));

  const missingProduct = structuredClone(valid);
  missingProduct.finalProducts[0].productId = "current:other";
  assert.throws(() => validateGoldLineage(missingProduct, catalog), /do not exactly match/i);

  const missingStageMap = structuredClone(valid);
  delete missingStageMap.finalSources[0].stageEvidenceIds.terra;
  assert.throws(() => validateGoldLineage(missingStageMap, catalog), /array of non-empty strings/i);

  const promotedAuthority = structuredClone(valid);
  promotedAuthority.finalSources[0].canonicalAuthorityTier = "official";
  assert.throws(() => validateGoldLineage(promotedAuthority, catalog), /invalid canonical authority tier/i);

  const inventory = {
    luna: { evidenceIds: ["luna-source"], surfaceIds: ["dinner"], productKeys: ["current:item"], findingIds: [] },
    terra: { evidenceIds: ["terra-source"], surfaceIds: ["dinner"], productKeys: ["current:item"], findingIds: ["terra:finding:one"] },
    sol: { evidenceIds: [], surfaceIds: [], productKeys: [], findingIds: [] },
  };
  assert.doesNotThrow(() => validateGoldMappings(valid, inventory));
  const inventedMapping = structuredClone(valid);
  inventedMapping.finalProducts[0].stageKeys.luna = ["current:invented"];
  assert.throws(() => validateGoldMappings(inventedMapping, inventory), /unknown stage IDs/i);
});

test("Terra discrepancies, evidence warnings, and deterministic hard risks route to Sol medium", () => {
  const base = terraFixture();
  assert.equal(routeWorkerResult({
    result: { ...base, outcome: "discrepancy_found" },
    validation: { valid: true, errors: [], warnings: [] },
  }).destination, "sol_medium");
  assert.equal(routeWorkerResult({
    result: base,
    validation: { valid: true, errors: [], warnings: ["unresolved evidence"] },
  }).destination, "sol_medium");
  assert.equal(routeWorkerResult({
    result: base,
    validation: { valid: true, errors: [], warnings: [] },
    deterministicRisk: { requiresStrongReview: true, triggeredGates: ["multi_service"] },
  }).destination, "sol_medium");
});

test("Sol review provenance and routed outcome are validated before coordinator handoff", () => {
  const job = validationFixture().job;
  const route = { effectiveOutcome: "low_confidence" };
  const review = {
    schemaVersion: workerWorkflowSchemaVersion,
    runId: job.runId,
    stage: "sol_review",
    model: solModel,
    restaurantId: job.restaurant.restaurantId,
    verifierOutcome: "low_confidence",
    recommendation: "return_to_coordinator",
    confidence: { level: "medium", score: 0.8, rationale: "Checked." },
  };
  assert.equal(validateSolReview({ job, route, review }).valid, true);
  review.restaurantId = "wrong-restaurant";
  review.verifierOutcome = "no_discrepancy";
  const validation = validateSolReview({ job, route, review });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /restaurantId/i);
  assert.match(validation.errors.join(" "), /effective outcome/i);
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "restaurant-workers-"));
  await mkdir(path.join(root, "item-checks"), { recursive: true });
  await mkdir(path.join(root, "restaurants"), { recursive: true });
  await mkdir(path.join(root, "evidence"), { recursive: true });
  const rows = [
    fixtureRow("verified", "Already Verified", "codex_verified"),
    fixtureRow("alpha", "Alpha"),
    fixtureRow("bravo", "Bravo"),
    fixtureRow("charlie", "Charlie"),
  ];
  await writeFile(path.join(root, "ledger.jsonl"), `${rows.map(JSON.stringify).join("\n")}\n`);
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    baseline: { restaurantCount: rows.length, itemCount: rows.length, sha256: "a".repeat(64) },
    model: solModel,
  }));
  for (const row of rows) {
    await writeFile(path.join(root, row.paths.itemChecks), `${JSON.stringify({ auditItemKey: "1:item", baseline: { name: "Item" } })}\n`);
    await writeFile(path.join(root, row.paths.dossier), JSON.stringify({
      schemaVersion: 1,
      restaurantId: row.restaurantId,
      name: row.name,
      status: row.status,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      completedAt: row.completedAt,
      model: solModel,
      checks: {
        menu: { verdict: "not_reviewed", reviewedItemCount: 0, sourceItemCount: null, notes: [] },
        allergenSource: { verdict: "not_reviewed", highestAuthorityTier: null, notes: [] },
        extraction: { verdict: "not_reviewed", parserReviewed: false, semanticsVerified: false, notes: [] },
      },
      sourceAttempts: [],
      findings: [],
      repairs: [],
      notes: [],
    }));
    await writeFile(path.join(root, row.paths.evidence), JSON.stringify({ restaurantId: row.restaurantId, sources: [] }));
  }
  return root;
}

function fixtureRow(restaurantId, name, status = "pending") {
  return {
    schemaVersion: 1,
    restaurantId,
    name,
    domain: `${restaurantId}.example`,
    locationId: "test",
    status,
    claimedAt: null,
    completedAt: status === "codex_verified" ? "2026-07-15T00:00:00.000Z" : null,
    updatedAt: "2026-07-15T00:00:00.000Z",
    attemptCount: 0,
    baseline: {
      itemCount: 1,
      itemFingerprint: "a".repeat(64),
      officialItemCount: 1,
      officialAllergenStatus: "extracted",
      sourceFamily: "test",
      parserProfile: "test",
      guideUrl: `https://${restaurantId}.example/menu`,
      sourceUrls: [`https://${restaurantId}.example/menu`],
    },
    verdicts: { menu: "not_reviewed", allergenSource: "not_reviewed", extraction: "not_reviewed" },
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    repairStatus: "not_needed",
    paths: {
      itemChecks: `item-checks/${restaurantId}.jsonl`,
      dossier: `restaurants/${restaurantId}.json`,
      evidence: `evidence/${restaurantId}.json`,
    },
  };
}

function validationFixture() {
  return {
    job: {
      runId: "test-run",
      restaurant: {
        restaurantId: "alpha",
        baselineItemCount: 1,
        baselineItemFingerprint: "a".repeat(64),
        sourceUrls: ["https://alpha.example/menu"],
      },
    },
    baselineItems: [{ auditItemKey: "1:item", baseline: { name: "Item" } }],
  };
}

function baseResult({ runId = "test-run", stage, model }) {
  return {
    schemaVersion: workerWorkflowSchemaVersion,
    runId,
    stage,
    model,
    restaurant: {
      restaurantId: "alpha",
      name: "Alpha",
      baselineItemCount: 1,
      baselineItemFingerprint: "a".repeat(64),
    },
    outcome: "no_discrepancy",
    confidence: {
      level: "high",
      overall: 0.95,
      menu: 0.95,
      allergenSource: 0.95,
      extraction: 0.95,
      rationale: "Primary-source coverage is complete.",
    },
    identity: {
      verdict: "verified",
      scope: "Test location",
      confidence: 0.95,
      sourceEvidenceIds: ["official-menu"],
      notes: "Identity matches.",
    },
    sources: [{
      evidenceId: "official-menu",
      url: "https://alpha.example/menu",
      authorityTier: "restaurant_issued",
      purpose: "both",
      title: "Menu",
      retrievedAt: "2026-07-15T12:00:00.000Z",
      excerpt: "Item",
      stableRowId: "item",
      contentHash: null,
      artifactSuggested: null,
    }],
    sourceAttempts: [{ kind: "official_site", status: "accessible", url: "https://alpha.example/menu", notes: "Current menu." }],
    itemCheckGroups: [{
      auditItemKeys: ["1:item"],
      disposition: "exact_match",
      allergenVerdict: "verified",
      matchedCurrentProductKeys: ["current:item"],
      sourceEvidenceIds: ["official-menu"],
      adjudicatedContainsAllergens: [],
      adjudicatedMayContainAllergens: [],
      adjudicatedAllergenSourceType: "restaurant_ingredients",
      adjudicatedAllergenAuthorityTier: "restaurant_issued",
      allergenSourceEvidenceIds: ["official-menu"],
    }],
    findings: [],
    summary: "No discrepancy found.",
    coordinatorNotes: [],
  };
}

function scoutFixture({ runId = "test-run" } = {}) {
  return {
    ...baseResult({ runId, stage: "luna_scout", model: lunaModel }),
    menuSurfaces: [{
      surfaceId: "dinner",
      title: "Dinner",
      service: "dinner",
      url: "https://alpha.example/menu",
      authorityTier: "restaurant_issued",
      mediaType: "html",
      accessStatus: "accessible",
      fullyEnumerated: true,
      scopeStatus: "complete",
      current: true,
      sourceEvidenceIds: ["official-menu"],
      currentProductKeys: ["current:item"],
      notes: "Complete menu.",
    }],
    currentProducts: [{
      currentProductKey: "current:item",
      name: "Item",
      category: "Dinner",
      surfaceIds: ["dinner"],
      sourceEvidenceIds: ["official-menu"],
      matchedBaselineAuditItemKeys: ["1:item"],
      presentationIds: ["dinner:item"],
      containsAllergens: [],
      mayContainAllergens: [],
      allergenEvidenceStatus: "partial_positive_only",
      allergenSourceType: "restaurant_ingredients",
      allergenAuthorityTier: "restaurant_issued",
      allergenSourceEvidenceIds: ["official-menu"],
      authorityVerdict: "verified",
      notes: "Exact current product.",
    }],
    riskSignals: [],
  };
}

function verifierPacketFixture(scout, triggeredGates = []) {
  return {
    scout: { ...scout, resultHash: "b".repeat(64) },
    deterministicRisk: {
      triggeredGates,
      requiresStrongReview: triggeredGates.length > 0,
      retryRequired: false,
      metrics: {},
    },
  };
}

function terraFixture({ runId = "test-run", resultHash = "b".repeat(64) } = {}) {
  return {
    ...baseResult({ runId, stage: "terra_verification", model: terraModel }),
    scoutProvenance: { runId, model: lunaModel, resultHash },
    reviewedRiskGates: [],
    surfaceChecks: [{ surfaceId: "dinner", verdict: "verified", sourceEvidenceIds: ["official-menu"], notes: "Verified." }],
    currentProductCheckGroups: [{
      currentProductKeys: ["current:item"],
      presentationIds: ["dinner:item"],
      verdict: "verified",
      containsAllergens: [],
      mayContainAllergens: [],
      allergenEvidenceStatus: "partial_positive_only",
      allergenSourceType: "restaurant_ingredients",
      allergenAuthorityTier: "restaurant_issued",
      allergenSourceEvidenceIds: ["official-menu"],
      sourceEvidenceIds: ["official-menu"],
      notes: "Verified.",
    }],
    additionalMenuSurfaces: [],
    additionalCurrentProducts: [],
  };
}
