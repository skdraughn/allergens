#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultRoot = "data/restaurant-verification";
const terminalStatuses = new Set(["codex_verified", "blocked_unverifiable"]);
const expectedModels = Object.freeze({
  luna: { id: "gpt-5.6-luna", reasoningEffort: "low" },
  terra: { id: "gpt-5.6-terra", reasoningEffort: "low" },
  sol: { id: "gpt-5.6-sol", reasoningEffort: "medium" },
});

export async function generateWorkerEvaluation({
  root = defaultRoot,
  runId,
  now = new Date().toISOString(),
  write = true,
} = {}) {
  if (!/^[a-zA-Z0-9._-]+$/.test(String(runId ?? ""))) throw new Error("A safe runId is required.");
  const verificationRoot = path.resolve(root);
  const runRoot = path.join(verificationRoot, "worker-runs", runId);
  const manifestPath = path.join(runRoot, "manifest.json");
  const planPath = path.join(repositoryRoot, "docs/restaurant-verification-plan.md");
  const [manifest, ledgerRows, planBuffer, manifestBuffer] = await Promise.all([
    readJson(manifestPath),
    readJsonLines(path.join(verificationRoot, "ledger.jsonl")),
    readFile(planPath),
    readFile(manifestPath),
  ]);
  if (manifest.schemaVersion !== 2) throw new Error(`Evaluation requires a v2 worker run; found v${manifest.schemaVersion}.`);
  const manifestModelProvenanceExact = modelMatches(manifest.models?.scout, expectedModels.luna) &&
    modelMatches(manifest.models?.verifier, expectedModels.terra) && modelMatches(manifest.models?.reviewer, expectedModels.sol);

  const ledgerById = new Map(ledgerRows.map((row, index) => [row.restaurantId, { row, index }]));
  const artifacts = await artifactIndex(runRoot);
  const restaurants = [];
  for (const job of manifest.jobs ?? []) {
    const jobInput = await readJson(path.join(runRoot, job.jobPath));
    const ledger = ledgerById.get(job.restaurantId)?.row ?? null;
    const scout = await readJsonIfPresent(path.join(runRoot, job.scoutResultPath));
    const scoutRoute = await readJsonIfPresent(path.join(runRoot, job.scoutRoutePath));
    const terra = await readJsonIfPresent(path.join(runRoot, job.resultPath));
    const terraRoute = await readJsonIfPresent(path.join(runRoot, job.routePath));
    const sol = await readJsonIfPresent(path.join(runRoot, job.reviewPath));
    const solValidation = job.reviewValidationPath
      ? await readJsonIfPresent(path.join(runRoot, job.reviewValidationPath))
      : null;
    const gold = await readJsonIfPresent(path.join(runRoot, "coordinator-gold", `${job.restaurantId}.json`));
    const baselineItems = jobInput.inputs?.itemChecksPath
      ? await readJsonLines(path.resolve(repositoryRoot, jobInput.inputs.itemChecksPath))
      : null;
    const baselineKeys = baselineItems?.map((item) => item.auditItemKey) ?? null;
    const stageData = {};
    for (const stage of ["luna", "terra", "sol"]) {
      const logPath = path.join(runRoot, "logs", `${job.restaurantId}.${stage}.log`);
      const attempts = normalizeAttempts({
        attempts: job[`${stage}Attempts`],
        log: await readTextIfPresent(logPath),
        expectedModel: expectedModels[stage],
        finalExitCode: job[`${stage}ExitCode`],
      });
      stageData[stage] = {
        required: stage !== "sol" || terraRoute?.destination === "sol_medium",
        executed: attempts.length > 0,
        attempts,
        retryCount: Math.max(0, attempts.length - 1),
        runtimeFailureCount: attempts.filter((attempt) => attempt.exitCode !== 0).length,
        durationMs: attempts.every((attempt) => Number.isFinite(attempt.durationMs))
          ? attempts.reduce((total, attempt) => total + attempt.durationMs, 0)
          : null,
        finalOutcome: stage === "luna" ? scout?.outcome ?? null : stage === "terra" ? terra?.outcome ?? null : sol?.recommendation ?? null,
      };
    }
    const frozenLuna = reconciliationCoverage(scout, baselineKeys ?? jobInput.restaurant.baselineItemCount);
    const frozenTerra = reconciliationCoverage(terra, baselineKeys ?? jobInput.restaurant.baselineItemCount);
    const scoutProductKeys = new Set((scout?.currentProducts ?? []).map((product) => product.currentProductKey));
    const checkedProductKeys = new Set((terra?.currentProductCheckGroups ?? []).flatMap((group) => group.currentProductKeys ?? []));
    const currentProductsReviewed = scout
      ? { numerator: [...scoutProductKeys].filter((key) => checkedProductKeys.has(key)).length, denominator: scoutProductKeys.size }
      : null;
    const lineage = gold ? evaluateGoldLineage({ gold, scout, terra, sol, scoutRoute, terraRoute, solValidation, baselineKeys }) : null;
    const modelProvenanceExact = modelMatches(scout?.model, expectedModels.luna) &&
      modelMatches(terra?.model, expectedModels.terra) &&
      (!lineage?.routing.solRequired || modelMatches(sol?.model, expectedModels.sol));
    restaurants.push({
      restaurantId: job.restaurantId,
      name: job.name,
      workerStatus: job.status,
      baseline: {
        itemCount: jobInput.restaurant.baselineItemCount,
        itemFingerprint: jobInput.restaurant.baselineItemFingerprint,
      },
      terminal: ledger ? {
        status: ledger.status,
        completedAt: ledger.completedAt,
        verificationContractVersion: ledger.verificationContractVersion ?? null,
      } : null,
      coordinatorGold: gold ? { available: true, hash: sha256(JSON.stringify(gold)) } : { available: false, hash: null },
      modelProvenanceExact,
      stages: stageData,
      coverage: {
        sources: { luna: scout?.sources?.length ?? null, terra: terra?.sources?.length ?? null, solAdditional: sol?.additionalEvidence?.length ?? null, lineage: lineage?.coverage.sources ?? null },
        surfaces: { luna: scout?.menuSurfaces?.length ?? null, terraChecked: terra?.surfaceChecks?.length ?? null, terraAdditional: terra?.additionalMenuSurfaces?.length ?? null, lineage: lineage?.coverage.surfaces ?? null },
        currentProducts: { luna: scout?.currentProducts?.length ?? null, terraReviewed: currentProductsReviewed, terraAdditional: terra?.additionalCurrentProducts?.length ?? null, lineage: lineage?.coverage.products ?? null },
        frozenItems: { luna: frozenLuna, terra: frozenTerra },
      },
      routing: {
        scoutDestination: scoutRoute?.destination ?? null,
        terraDestination: terraRoute?.destination ?? null,
        scoutGateIds: scoutRoute?.risk?.triggeredGates ?? [],
        solRequired: terraRoute?.destination === "sol_medium",
        solValidated: solValidation?.valid ?? null,
        violations: lineage?.routing.violations ?? null,
      },
      discovery: lineage?.discovery ?? null,
      authority: lineage?.authority ?? null,
      quality: {
        lunaFalseClean: lineage?.quality.lunaFalseClean ?? null,
        terraFalseClean: lineage?.quality.terraFalseClean ?? null,
        authorityPromotionCount: lineage?.authority.promotedSourceIds.length ?? null,
        coordinatorOnlyMaterialFindingCount: lineage?.quality.coordinatorOnlyMaterialCount ?? null,
        unreviewedCurrentProductCount: lineage?.quality.unreviewedCurrentProductCount ?? null,
      },
    });
  }

  const orderIndexes = restaurants.map((restaurant) => ledgerById.get(restaurant.restaurantId)?.index ?? -1);
  const selectionOrderValid = orderIndexes.every((index, position) => index >= 0 && (position === 0 || index > orderIndexes[position - 1]));
  const eligibilityReasons = [];
  if (restaurants.length !== 10) eligibilityReasons.push(`Pilot requires 10 restaurants; found ${restaurants.length}.`);
  if (!selectionOrderValid) eligibilityReasons.push("Restaurant selection is not in canonical ledger order.");
  if (!manifestModelProvenanceExact) eligibilityReasons.push("Run manifest model provenance does not match Luna-low, Terra-low, and Sol-medium.");
  const nonCoordinatorJobs = restaurants.filter((restaurant) => restaurant.workerStatus !== "awaiting_coordinator");
  if (nonCoordinatorJobs.length > 0) eligibilityReasons.push(`${nonCoordinatorJobs.length} worker job(s) have not reached coordinator handoff.`);
  const nonterminal = restaurants.filter((restaurant) => !terminalStatuses.has(restaurant.terminal?.status));
  if (nonterminal.length > 0) eligibilityReasons.push(`${nonterminal.length} restaurant(s) lack a canonical terminal adjudication.`);
  const legacyTerminal = restaurants.filter((restaurant) =>
    terminalStatuses.has(restaurant.terminal?.status) && restaurant.terminal.verificationContractVersion !== 2);
  if (legacyTerminal.length > 0) eligibilityReasons.push(`${legacyTerminal.length} terminal restaurant(s) do not use verification contract v2.`);
  const missingGold = restaurants.filter((restaurant) => !restaurant.coordinatorGold.available);
  if (missingGold.length > 0) eligibilityReasons.push(`${missingGold.length} restaurant(s) lack coordinator gold/lineage annotations.`);
  const invalidGold = restaurants.filter((restaurant) => restaurant.coordinatorGold.available && !restaurant.discovery);
  if (invalidGold.length > 0) eligibilityReasons.push(`${invalidGold.length} coordinator gold annotation(s) are structurally incomplete.`);

  const executedAttempts = restaurants.flatMap((restaurant) => Object.values(restaurant.stages).flatMap((stage) => stage.attempts));
  const attemptsWithTokens = executedAttempts.filter((attempt) => attempt.tokens?.available);
  const exactModelProvenance = executedAttempts.every((attempt) => attempt.model?.exact === true) &&
    restaurants.every((restaurant) => !restaurant.coordinatorGold.available || restaurant.modelProvenanceExact);
  const eligible = eligibilityReasons.length === 0;
  const metrics = eligible ? acceptanceMetrics(restaurants) : null;
  const acceptance = [
    gate("evaluation_eligible", eligible, eligible, true, eligible ? [] : restaurants.map((restaurant) => restaurant.restaurantId)),
    gate("exact_model_provenance", executedAttempts.length > 0 ? exactModelProvenance : null, exactModelProvenance, true,
      exactModelProvenance ? [] : restaurants.filter((restaurant) => !restaurant.modelProvenanceExact).map((restaurant) => restaurant.restaurantId)),
    ...[
      ["luna_false_clean_count", "lunaFalseCleanCount"],
      ["authority_promotion_count", "authorityPromotionCount"],
      ["missing_frozen_reconciliation_count", "missingFrozenReconciliationCount"],
      ["duplicate_frozen_reconciliation_count", "duplicateFrozenReconciliationCount"],
      ["unreviewed_current_product_count", "unreviewedCurrentProductCount"],
      ["coordinator_only_material_finding_count", "coordinatorOnlyMaterialFindingCount"],
      ["routing_violation_count", "routingViolationCount"],
    ].map(([gateId, key]) => gate(gateId, eligible ? metrics[key] === 0 : null, eligible ? metrics[key] : null, 0, eligible ? metrics.restaurantIds[key] : [])),
  ];
  const evaluation = {
    schemaVersion: 1,
    evaluationId: sha256(`${runId}:${sha256(manifestBuffer)}:${sha256(JSON.stringify(artifacts))}`),
    runId,
    generatedAt: now,
    inputs: {
      planHash: sha256(planBuffer),
      manifestHash: sha256(manifestBuffer),
      artifactIndex: artifacts,
    },
    cohort: {
      requiredSize: 10,
      actualSize: restaurants.length,
      restaurantIds: restaurants.map((restaurant) => restaurant.restaurantId),
      selectionOrderValid,
      selectionFingerprint: sha256(JSON.stringify(restaurants.map((restaurant) => restaurant.restaurantId))),
    },
    expectedModels,
    eligibility: { eligible, reasons: eligibilityReasons },
    restaurants,
    batch: {
      stageMetrics: Object.fromEntries(["luna", "terra", "sol"].map((stage) => [stage, {
        executedRestaurants: restaurants.filter((restaurant) => restaurant.stages[stage].executed).length,
        attempts: restaurants.reduce((total, restaurant) => total + restaurant.stages[stage].attempts.length, 0),
        runtimeFailures: restaurants.reduce((total, restaurant) => total + restaurant.stages[stage].runtimeFailureCount, 0),
      }])),
      routing: {
        solEscalationNumerator: restaurants.filter((restaurant) => restaurant.routing.solRequired).length,
        validTerraDenominator: restaurants.filter((restaurant) => restaurant.stages.terra.finalOutcome !== null).length,
      },
      tokens: {
        availableAttempts: attemptsWithTokens.length,
        executedAttempts: executedAttempts.length,
        coverage: executedAttempts.length === 0 ? null : attemptsWithTokens.length / executedAttempts.length,
        total: attemptsWithTokens.length === executedAttempts.length
          ? attemptsWithTokens.reduce((total, attempt) => total + attempt.tokens.total, 0)
          : null,
        partialTotal: attemptsWithTokens.length > 0
          ? attemptsWithTokens.reduce((total, attempt) => total + attempt.tokens.total, 0)
          : null,
      },
      acceptance,
      overallPass: acceptance.every((entry) => entry.passed === true),
    },
  };
  if (write) {
    await writeAtomic(path.join(runRoot, "evaluation.json"), `${JSON.stringify(evaluation, null, 2)}\n`);
    await writeAtomic(path.join(runRoot, "evaluation.md"), renderEvaluationMarkdown(evaluation));
  }
  return evaluation;
}

function evaluateGoldLineage({ gold, scout, terra, sol, scoutRoute, terraRoute, solValidation, baselineKeys }) {
  if (!["finalSources", "finalSurfaces", "finalProducts", "findings"].every((field) => Array.isArray(gold[field]))) return null;
  const lunaSources = new Map((scout?.sources ?? []).flatMap((source) => [[source.evidenceId, source], [source.url, source]]));
  const terraSources = new Map((terra?.sources ?? []).flatMap((source) => [[source.evidenceId, source], [source.url, source]]));
  const solSources = new Map((sol?.additionalEvidence ?? []).map((source) => [source.url, source]));
  const sourceMaps = { luna: lunaSources, terra: terraSources, sol: solSources };
  const promotedSourceIds = [];
  const misclassifiedSourceIds = [];
  const sourceCoverage = {};
  for (const stage of ["luna", "terra", "sol"]) {
    let mapped = 0;
    for (const source of gold.finalSources) {
      const ids = source.stageEvidenceIds?.[stage] ?? [];
      const records = ids.map((id) => sourceMaps[stage].get(id)).filter(Boolean);
      if (records.length > 0) mapped += 1;
      if (records.some((record) => record.authorityTier === "restaurant_issued" && source.canonicalAuthorityTier !== "restaurant_issued")) {
        promotedSourceIds.push(source.sourceId);
      }
      if (records.some((record) => record.authorityTier !== source.canonicalAuthorityTier)) misclassifiedSourceIds.push(source.sourceId);
    }
    sourceCoverage[stage] = ratio(mapped, gold.finalSources.length);
  }

  const lunaSurfaceIds = new Set((scout?.menuSurfaces ?? []).map((surface) => surface.surfaceId));
  const terraSurfaceIds = new Set([
    ...(terra?.surfaceChecks ?? []).map((surface) => surface.surfaceId),
    ...(terra?.additionalMenuSurfaces ?? []).map((surface) => surface.surfaceId),
  ]);
  const lunaProductIds = new Set((scout?.currentProducts ?? []).map((product) => product.currentProductKey));
  const terraProductIds = new Set([
    ...(terra?.currentProductCheckGroups ?? []).flatMap((group) => group.currentProductKeys ?? []),
    ...(terra?.additionalCurrentProducts ?? []).map((product) => product.currentProductKey),
  ]);
  const surfaceCoverage = {
    luna: mappedRatio(gold.finalSurfaces, (surface) => surface.stageIds?.luna ?? [], lunaSurfaceIds),
    terra: mappedRatio(gold.finalSurfaces, (surface) => surface.stageIds?.terra ?? [], terraSurfaceIds),
  };
  const productCoverage = {
    luna: mappedRatio(gold.finalProducts, (product) => product.stageKeys?.luna ?? [], lunaProductIds),
    terra: mappedRatio(gold.finalProducts, (product) => product.stageKeys?.terra ?? [], terraProductIds),
  };

  const materialFindings = gold.findings.filter((finding) => finding.material === true);
  const lunaMissedIds = materialFindings.filter((finding) => finding.firstDiscoveredStage !== "luna").map((finding) => finding.findingId);
  const lunaRejectedIds = gold.findings.filter((finding) =>
    (finding.stageFindingIds?.luna ?? []).length > 0 && (finding.material === false || finding.resolution === "rejected"))
    .map((finding) => finding.findingId);
  const firstAt = (stage) => materialFindings.filter((finding) => finding.firstDiscoveredStage === stage).map((finding) => finding.findingId);
  const coordinatorOnlyIds = firstAt("coordinator");
  const unmatchedLunaSurfaceIds = gold.finalSurfaces.filter((surface) => !(surface.stageIds?.luna ?? []).some((id) => lunaSurfaceIds.has(id))).map((surface) => surface.surfaceId);
  const unmatchedLunaProductIds = gold.finalProducts.filter((product) => !(product.stageKeys?.luna ?? []).some((id) => lunaProductIds.has(id))).map((product) => product.productId);
  const unmatchedTerraSurfaceIds = gold.finalSurfaces.filter((surface) => !(surface.stageIds?.terra ?? []).some((id) => terraSurfaceIds.has(id))).map((surface) => surface.surfaceId);
  const unmatchedTerraProductIds = gold.finalProducts.filter((product) => !(product.stageKeys?.terra ?? []).some((id) => terraProductIds.has(id))).map((product) => product.productId);
  const laterMaterialForLuna = materialFindings.some((finding) => finding.firstDiscoveredStage !== "luna") ||
    unmatchedLunaSurfaceIds.length > 0 || unmatchedLunaProductIds.length > 0 || promotedSourceIds.length > 0 ||
    (terra?.itemCheckGroups ?? []).some((group) => group.allergenVerdict === "mismatch");
  const laterMaterialForTerra = materialFindings.some((finding) => ["sol", "coordinator"].includes(finding.firstDiscoveredStage)) ||
    unmatchedTerraSurfaceIds.length > 0 || unmatchedTerraProductIds.length > 0;

  const violations = [];
  if (scoutRoute?.validation?.valid === true && scoutRoute.destination !== "terra_low") violations.push("valid_luna_not_routed_to_terra");
  if (scoutRoute?.validation?.valid === false && scoutRoute.destination !== "luna_retry") violations.push("invalid_luna_not_retried");
  const hardRisk = terraRoute?.deterministicRisk?.requiresStrongReview || (terraRoute?.validation?.warnings ?? []).length > 0 ||
    ["discrepancy_found", "blocked_unverifiable", "low_confidence"].includes(terra?.outcome);
  if (hardRisk && terraRoute?.destination !== "sol_medium") violations.push("terra_risk_bypassed_sol");
  const solRequired = terraRoute?.destination === "sol_medium";
  if (solRequired && (!sol || solValidation?.valid !== true)) violations.push("required_sol_not_validated");
  const triggeredGateIds = scoutRoute?.risk?.triggeredGates ?? [];
  const reviewedGateIds = new Set((terra?.reviewedRiskGates ?? []).map((gate) => gate.gateId));
  for (const gateId of triggeredGateIds) if (!reviewedGateIds.has(gateId)) violations.push(`unreviewed_gate:${gateId}`);
  for (const finding of materialFindings) {
    for (const gateId of finding.expectedGateIds ?? []) if (!triggeredGateIds.includes(gateId)) violations.push(`gate_escape:${finding.findingId}:${gateId}`);
  }

  return {
    coverage: { sources: sourceCoverage, surfaces: surfaceCoverage, products: productCoverage },
    discovery: {
      finalMaterialFindingIds: materialFindings.map((finding) => finding.findingId),
      lunaMissedIds,
      lunaRejectedIds,
      terraAddedIds: firstAt("terra"),
      solAddedIds: firstAt("sol"),
      coordinatorOnlyIds,
    },
    authority: { promotedSourceIds: unique(promotedSourceIds), misclassifiedSourceIds: unique(misclassifiedSourceIds) },
    routing: { solRequired, violations: unique(violations) },
    quality: {
      lunaFalseClean: scout?.outcome === "no_discrepancy" && laterMaterialForLuna,
      terraFalseClean: terra?.outcome === "no_discrepancy" && laterMaterialForTerra,
      unreviewedCurrentProductCount: gold.finalProducts.filter((product) => product.coordinatorReviewed !== true).length,
      coordinatorOnlyMaterialCount: coordinatorOnlyIds.length,
    },
  };
}

function acceptanceMetrics(restaurants) {
  const definitions = {
    lunaFalseCleanCount: (restaurant) => restaurant.quality.lunaFalseClean ? 1 : 0,
    authorityPromotionCount: (restaurant) => restaurant.quality.authorityPromotionCount,
    missingFrozenReconciliationCount: (restaurant) =>
      (restaurant.coverage.frozenItems.luna?.missingKeys?.length ?? 0) + (restaurant.coverage.frozenItems.terra?.missingKeys?.length ?? 0),
    duplicateFrozenReconciliationCount: (restaurant) =>
      (restaurant.coverage.frozenItems.luna?.duplicateCount ?? 0) + (restaurant.coverage.frozenItems.terra?.duplicateCount ?? 0),
    unreviewedCurrentProductCount: (restaurant) => restaurant.quality.unreviewedCurrentProductCount,
    coordinatorOnlyMaterialFindingCount: (restaurant) => restaurant.quality.coordinatorOnlyMaterialFindingCount,
    routingViolationCount: (restaurant) => restaurant.routing.violations.length,
  };
  const result = { restaurantIds: {} };
  for (const [key, valueFor] of Object.entries(definitions)) {
    result[key] = restaurants.reduce((total, restaurant) => total + valueFor(restaurant), 0);
    result.restaurantIds[key] = restaurants.filter((restaurant) => valueFor(restaurant) > 0).map((restaurant) => restaurant.restaurantId);
  }
  return result;
}

function reconciliationCoverage(result, expected) {
  if (!result) return null;
  const keys = (result.itemCheckGroups ?? []).flatMap((group) => group.auditItemKeys ?? []);
  const unique = new Set(keys);
  const expectedKeys = Array.isArray(expected) ? expected : null;
  const denominator = expectedKeys?.length ?? expected;
  const expectedSet = new Set(expectedKeys ?? []);
  const missingKeys = expectedKeys ? expectedKeys.filter((key) => !unique.has(key)) : [];
  const unknownKeys = expectedKeys ? [...unique].filter((key) => !expectedSet.has(key)) : [];
  return {
    numerator: expectedKeys ? [...unique].filter((key) => expectedSet.has(key)).length : unique.size,
    denominator,
    missingKeys,
    unknownKeys,
    duplicateCount: keys.length - unique.size,
    complete: unique.size === denominator && keys.length === unique.size && unknownKeys.length === 0,
  };
}

function mappedRatio(records, idsFor, stageIds) {
  const numerator = records.filter((record) => idsFor(record).some((id) => stageIds.has(id))).length;
  return ratio(numerator, records.length);
}

function ratio(numerator, denominator) {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function modelMatches(actual, expected) {
  if (!actual) return false;
  return actual.id === expected.id && actual.reasoningEffort === expected.reasoningEffort;
}

function unique(values) { return [...new Set(values)]; }

function normalizeAttempts({ attempts, log, expectedModel, finalExitCode }) {
  const loggedAttempts = parseLogAttempts({ log, expectedModel, finalExitCode });
  if (attempts?.length) return attempts.map((attempt, index) => {
    const logged = loggedAttempts[index] ?? null;
    const runtimeId = attempt.model?.runtimeId ?? logged?.model.id ?? null;
    const runtimeReasoningEffort = attempt.model?.runtimeReasoningEffort ?? logged?.model.reasoningEffort ?? null;
    const exact = attempt.model?.exact ?? (runtimeId && runtimeReasoningEffort
      ? runtimeId === expectedModel.id && runtimeReasoningEffort === expectedModel.reasoningEffort
      : null);
    return {
      attempt: index + 1,
      ...attempt,
      failureCode: attempt.systemicFailure?.code ?? failureCode(attempt.error) ?? logged?.failureCode ?? null,
      model: {
        id: attempt.model?.id ?? expectedModel.id,
        reasoningEffort: attempt.model?.reasoningEffort ?? expectedModel.reasoningEffort,
        runtimeId,
        runtimeReasoningEffort,
        exact,
      },
      resultWritten: attempt.result?.written ?? logged?.resultWritten ?? false,
      validation: attempt.validation ?? { state: "not_run", valid: null, errors: [], warnings: [] },
      tokens: attempt.tokens?.available ? attempt.tokens : logged?.tokens ?? { available: false, total: null, source: null },
    };
  });
  return loggedAttempts;
}

function parseLogAttempts({ log, expectedModel, finalExitCode }) {
  if (!log) return [];
  const segments = log.split(/(?=OpenAI Codex v)/).filter((segment) => segment.includes("OpenAI Codex v"));
  return segments.map((segment, index) => {
    const modelId = /^model:\s*(\S+)/m.exec(segment)?.[1] ?? null;
    const reasoningEffort = /^reasoning effort:\s*(\S+)/m.exec(segment)?.[1] ?? null;
    const tokenText = /tokens used\s*\n?\s*([\d,]+)/i.exec(segment)?.[1];
    const code = failureCode(segment);
    return {
      attempt: index + 1,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      model: {
        id: expectedModel.id,
        reasoningEffort: expectedModel.reasoningEffort,
        runtimeId: modelId,
        runtimeReasoningEffort: reasoningEffort,
        exact: modelId === expectedModel.id && reasoningEffort === expectedModel.reasoningEffort,
      },
      exitCode: index === segments.length - 1 && Number.isInteger(finalExitCode) ? finalExitCode : code ? 1 : 0,
      failureCode: code,
      resultWritten: false,
      validation: { state: "not_run", errors: [], warnings: [] },
      tokens: tokenText ? { available: true, total: Number(tokenText.replaceAll(",", "")), source: "log" } : { available: false, total: null, source: null },
    };
  });
}

function failureCode(value) {
  const text = String(value ?? "");
  if (/usage limit/i.test(text)) return "usage_limit";
  if (/invalid_json_schema|invalid schema for response_format/i.test(text)) return "invalid_output_schema";
  if (/timed out/i.test(text)) return "timeout";
  if (/(?:model|deployment).*(?:not found|does not exist|not available)|unsupported model/i.test(text)) return "model_unavailable";
  return null;
}

function gate(gateId, passed, actual, expected, restaurantIds) {
  return { gateId, passed, actual, expected, restaurantIds };
}

function renderEvaluationMarkdown(evaluation) {
  const state = evaluation.batch.overallPass ? "PASS" : evaluation.eligibility.eligible ? "FAIL" : "INELIGIBLE";
  const cell = (value) => value === null || value === undefined ? "—" : String(value);
  const frozen = (coverage) => coverage ? `${coverage.numerator}/${coverage.denominator}` : "—";
  return [
    "# Restaurant Worker Pilot Evaluation",
    "",
    `Status: **${state}**`,
    "",
    `Run: \`${evaluation.runId}\``,
    "",
    `Generated: ${evaluation.generatedAt}`,
    "",
    `Cohort: ${evaluation.cohort.actualSize}/${evaluation.cohort.requiredSize}`,
    "",
    "## Eligibility",
    "",
    ...(evaluation.eligibility.reasons.length ? evaluation.eligibility.reasons.map((reason) => `- ${reason}`) : ["- Eligible"]),
    "",
    "## Stage reliability",
    "",
    "| Stage | Restaurants | Attempts | Runtime failures |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(evaluation.batch.stageMetrics).map(([stage, metrics]) => `| ${stage} | ${metrics.executedRestaurants} | ${metrics.attempts} | ${metrics.runtimeFailures} |`),
    "",
    "## Per-restaurant quality",
    "",
    "| Restaurant | Luna frozen | Terra frozen | Luna false-clean | Authority promotions | Unreviewed products | Coordinator-only findings | Route violations |",
    "| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |",
    ...evaluation.restaurants.map((restaurant) => `| ${restaurant.name} | ${frozen(restaurant.coverage.frozenItems.luna)} | ${frozen(restaurant.coverage.frozenItems.terra)} | ${cell(restaurant.quality.lunaFalseClean)} | ${cell(restaurant.quality.authorityPromotionCount)} | ${cell(restaurant.quality.unreviewedCurrentProductCount)} | ${cell(restaurant.quality.coordinatorOnlyMaterialFindingCount)} | ${cell(restaurant.routing.violations?.length)} |`),
    "",
    "## Deterministic routing and escalation",
    "",
    `Sol escalations: ${evaluation.batch.routing.solEscalationNumerator}/${evaluation.batch.routing.validTerraDenominator}`,
    "",
    ...evaluation.restaurants.flatMap((restaurant) => (restaurant.routing.violations ?? []).map((violation) => `- ${restaurant.restaurantId}: ${violation}`)),
    ...(evaluation.restaurants.every((restaurant) => !(restaurant.routing.violations ?? []).length) ? ["- No routing violations."] : []),
    "",
    "## Discovery lineage",
    "",
    ...evaluation.restaurants.flatMap((restaurant) => {
      if (!restaurant.discovery) return [`- ${restaurant.restaurantId}: not evaluated`];
      return [`- ${restaurant.restaurantId}: Luna missed ${restaurant.discovery.lunaMissedIds.length}; Terra added ${restaurant.discovery.terraAddedIds.length}; Sol added ${restaurant.discovery.solAddedIds.length}; coordinator-only ${restaurant.discovery.coordinatorOnlyIds.length}.`];
    }),
    "",
    "## Acceptance gates",
    "",
    "| Gate | Passed | Actual | Expected |",
    "| --- | --- | ---: | ---: |",
    ...evaluation.batch.acceptance.map((entry) => `| ${entry.gateId} | ${entry.passed === null ? "not evaluated" : entry.passed ? "yes" : "no"} | ${entry.actual ?? "—"} | ${entry.expected}${entry.restaurantIds.length ? ` (${entry.restaurantIds.join(", ")})` : ""} |`),
    "",
  ].join("\n");
}

async function artifactIndex(runRoot) {
  const paths = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (!new Set(["evaluation.json", "evaluation.md"]).has(entry.name)) paths.push(absolute);
    }
  }
  await walk(runRoot);
  paths.sort();
  return Promise.all(paths.map(async (absolute) => ({ path: path.relative(runRoot, absolute), sha256: sha256(await readFile(absolute)) })));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfPresent(filePath) {
  try { return await readJson(filePath); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function readTextIfPresent(filePath) {
  try { return await readFile(filePath, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function readJsonLines(filePath) {
  return (await readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function writeAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, filePath);
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    const [key, ...rest] = token.replace(/^--/, "").split("=");
    options[key] = rest.join("=");
  }
  return options;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const options = parseArgs(process.argv.slice(2));
  generateWorkerEvaluation({ root: options.root ?? defaultRoot, runId: options.run })
    .then((evaluation) => console.log(JSON.stringify({ runId: evaluation.runId, eligibility: evaluation.eligibility, output: `worker-runs/${evaluation.runId}/evaluation.json` }, null, 2)))
    .catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
