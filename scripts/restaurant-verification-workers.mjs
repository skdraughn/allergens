#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  createWriteStream,
  existsSync,
} from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateScoutRisk } from "./restaurant-verification-risk-gates.mjs";

export const workerWorkflowSchemaVersion = 2;
export const lunaModel = Object.freeze({ id: "gpt-5.6-luna", reasoningEffort: "low" });
export const terraModel = Object.freeze({ id: "gpt-5.6-terra", reasoningEffort: "low" });
export const solModel = Object.freeze({ id: "gpt-5.6-sol", reasoningEffort: "medium" });
export const defaultConcurrency = 3;
export const maximumConcurrency = 4;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultVerificationRoot = "data/restaurant-verification";
const activeRunStatuses = new Set([
  "planned",
  "luna_running",
  "luna_failed",
  "awaiting_luna_retry",
  "awaiting_terra",
  "terra_running",
  "terra_failed",
  "awaiting_terra_retry",
  "awaiting_sol",
  "sol_running",
  "sol_failed",
  "awaiting_sol_retry",
  "awaiting_coordinator",
]);
const escalationOutcomes = new Set([
  "discrepancy_found",
  "blocked_unverifiable",
  "low_confidence",
]);
const sourceAttemptKinds = [
  "official_site",
  "linked_source",
  "ordering_vendor",
  "targeted_search",
  "archive",
  "third_party",
];

export function workerPaths(root = defaultVerificationRoot) {
  const verificationRoot = path.resolve(root);
  const workflowRoot = path.join(verificationRoot, "worker-runs");
  return {
    verificationRoot,
    ledger: path.join(verificationRoot, "ledger.jsonl"),
    workflowRoot,
    lock: path.join(workflowRoot, ".coordinator.lock"),
    scoutSchema: path.join(repositoryRoot, "scripts/schemas/restaurant-verification-scout-result.schema.json"),
    workerSchema: path.join(repositoryRoot, "scripts/schemas/restaurant-verification-worker-result.schema.json"),
    reviewSchema: path.join(repositoryRoot, "scripts/schemas/restaurant-verification-review-result.schema.json"),
  };
}

function runPaths(root, runId) {
  const base = path.join(workerPaths(root).workflowRoot, runId);
  return {
    base,
    manifest: path.join(base, "manifest.json"),
    jobs: path.join(base, "jobs"),
    scoutResults: path.join(base, "scout-results"),
    scoutRoutes: path.join(base, "scout-routes"),
    verifierPackets: path.join(base, "verifier-packets"),
    results: path.join(base, "results"),
    routes: path.join(base, "routes"),
    reviewPackets: path.join(base, "review-packets"),
    reviews: path.join(base, "reviews"),
    reviewValidations: path.join(base, "review-validations"),
    attemptResults: path.join(base, "attempt-results"),
    logs: path.join(base, "logs"),
  };
}

export async function selectWorkerCandidates({ root = defaultVerificationRoot, limit = 3 } = {}) {
  assertPositiveInteger(limit, "limit");
  const paths = workerPaths(root);
  const rows = await readJsonLines(paths.ledger);
  const reservedIds = await reservedRestaurantIds(paths.workflowRoot);

  return rows
    .filter((row) => row.status === "pending" && !reservedIds.has(row.restaurantId))
    .slice(0, limit);
}

export async function createWorkerRun({
  root = defaultVerificationRoot,
  limit = 3,
  runId = createRunId(),
  now = new Date().toISOString(),
  dryRun = false,
} = {}) {
  assertSafeRunId(runId);

  if (dryRun) {
    const candidates = await selectWorkerCandidates({ root, limit });
    return {
      runId,
      dryRun: true,
      candidates: candidates.map(candidateSummary),
    };
  }

  return withCoordinatorLock(root, async () => {
    const candidates = await selectWorkerCandidates({ root, limit });
    if (candidates.length === 0) {
      throw new Error("No unreserved pending restaurants are available for a worker run.");
    }
    const paths = runPaths(root, runId);
    if (existsSync(paths.base)) throw new Error(`Worker run already exists: ${runId}`);

    await Promise.all([
      mkdir(paths.jobs, { recursive: true }),
      mkdir(paths.scoutResults, { recursive: true }),
      mkdir(paths.scoutRoutes, { recursive: true }),
      mkdir(paths.verifierPackets, { recursive: true }),
      mkdir(paths.results, { recursive: true }),
      mkdir(paths.routes, { recursive: true }),
      mkdir(paths.reviewPackets, { recursive: true }),
      mkdir(paths.reviews, { recursive: true }),
      mkdir(paths.reviewValidations, { recursive: true }),
      mkdir(paths.attemptResults, { recursive: true }),
      mkdir(paths.logs, { recursive: true }),
    ]);

    const jobs = [];
    for (const row of candidates) {
      const job = {
        schemaVersion: workerWorkflowSchemaVersion,
        runId,
        stage: "luna_scout",
        createdAt: now,
        model: lunaModel,
        restaurant: {
          restaurantId: row.restaurantId,
          name: row.name,
          domain: row.domain ?? null,
          locationId: row.locationId ?? null,
          baselineItemCount: row.baseline.itemCount,
          baselineItemFingerprint: row.baseline.itemFingerprint,
          officialItemCount: row.baseline.officialItemCount ?? null,
          officialAllergenStatus: row.baseline.officialAllergenStatus ?? null,
          sourceFamily: row.baseline.sourceFamily ?? null,
          parserProfile: row.baseline.parserProfile ?? null,
          guideUrl: row.baseline.guideUrl ?? null,
          sourceUrls: row.baseline.sourceUrls ?? [],
        },
        inputs: {
          itemChecksPath: path.relative(repositoryRoot, path.join(path.resolve(root), row.paths.itemChecks)),
          existingDossierPath: path.relative(repositoryRoot, path.join(path.resolve(root), row.paths.dossier)),
          existingEvidencePath: path.relative(repositoryRoot, path.join(path.resolve(root), row.paths.evidence)),
          verificationPlanPath: "docs/restaurant-verification-plan.md",
        },
        constraints: {
          exactlyOneRestaurant: true,
          reconcileEveryBaselineItem: true,
          readOnly: true,
          ledgerMutationAllowed: false,
          generatedDataMutationAllowed: false,
        },
      };
      const jobRelativePath = `jobs/${row.restaurantId}.json`;
      await writeJsonAtomic(path.join(paths.base, jobRelativePath), job);
      jobs.push({
        restaurantId: row.restaurantId,
        name: row.name,
        jobPath: jobRelativePath,
        scoutResultPath: `scout-results/${row.restaurantId}.json`,
        scoutRoutePath: `scout-routes/${row.restaurantId}.json`,
        verifierPacketPath: `verifier-packets/${row.restaurantId}.json`,
        resultPath: `results/${row.restaurantId}.json`,
        routePath: `routes/${row.restaurantId}.json`,
        reviewPath: `reviews/${row.restaurantId}.json`,
        reviewValidationPath: `review-validations/${row.restaurantId}.json`,
        status: "planned",
      });
    }

    const manifest = {
      schemaVersion: workerWorkflowSchemaVersion,
      runId,
      createdAt: now,
      updatedAt: now,
      status: "planned",
      models: { scout: lunaModel, verifier: terraModel, reviewer: solModel },
      concurrency: { luna: null, terra: null, sol: null },
      jobs,
    };
    await writeJsonAtomic(paths.manifest, manifest);
    return manifest;
  });
}

export async function runLunaScouts({
  root = defaultVerificationRoot,
  runId,
  concurrency = defaultConcurrency,
  timeoutSeconds = 1800,
  spawnWorker = spawnCodex,
  coordinatorLock = true,
} = {}) {
  if (coordinatorLock) {
    return withCoordinatorLock(root, () => runLunaScouts({
      root,
      runId,
      concurrency,
      timeoutSeconds,
      spawnWorker,
      coordinatorLock: false,
    }));
  }
  assertConcurrency(concurrency);
  assertPositiveInteger(timeoutSeconds, "timeoutSeconds");
  const paths = runPaths(root, requireRunId(runId));
  await mkdir(paths.attemptResults, { recursive: true });
  const manifest = await readJson(paths.manifest);
  const runnableJobs = manifest.jobs.filter((job) =>
    ["planned", "luna_failed", "awaiting_luna_retry"].includes(job.status));
  if (runnableJobs.length === 0) throw new Error(`Run ${runId} has no Luna scout jobs to execute.`);

  manifest.status = "luna_running";
  manifest.systemicFailure = null;
  manifest.updatedAt = new Date().toISOString();
  manifest.concurrency.luna = concurrency;
  await writeJsonAtomic(paths.manifest, manifest);

  const executions = await mapConcurrent(runnableJobs, concurrency, async (job) => {
    const startedAt = new Date().toISOString();
    const jobPath = path.join(paths.base, job.jobPath);
    const canonicalResultPath = path.join(paths.base, job.scoutResultPath);
    const attemptNumber = (job.lunaAttempts?.length ?? 0) + 1;
    const resultPath = path.join(paths.attemptResults, `${job.restaurantId}.luna.attempt-${attemptNumber}.json`);
    const logPath = path.join(paths.logs, `${job.restaurantId}.luna.attempt-${attemptNumber}.log`);
    const priorAttempts = job.lunaAttempts ?? [];
    const writtenAttempts = priorAttempts.filter((attempt) => attempt.result?.written);
    let priorResultAttempt = null;
    let priorResultCoverage = -1;
    for (const attempt of writtenAttempts) {
      const attemptResultPath = path.resolve(repositoryRoot, attempt.result.path);
      if (!existsSync(attemptResultPath)) continue;
      const attemptResult = await readJson(attemptResultPath);
      const coverage = new Set(
        (attemptResult.itemCheckGroups ?? []).flatMap((group) => group.auditItemKeys ?? []),
      ).size;
      if (coverage > priorResultCoverage || (coverage === priorResultCoverage && attempt === writtenAttempts.at(-1))) {
        priorResultAttempt = attempt;
        priorResultCoverage = coverage;
      }
    }
    const latestWrittenAttempt = writtenAttempts.at(-1) ?? null;
    const priorValidationAttempt = priorResultAttempt?.validation?.state === "completed"
      ? priorResultAttempt
      : [...priorAttempts].reverse().find((attempt) => attempt.validation?.state === "completed") ?? null;
    const priorResultPath = priorResultAttempt
      ? path.resolve(repositoryRoot, priorResultAttempt.result.path)
      : null;
    const priorRoutePath = path.join(paths.base, job.scoutRoutePath);
    const priorRoute = existsSync(priorRoutePath) ? await readJson(priorRoutePath) : null;
    await Promise.all([rm(resultPath, { force: true }), rm(canonicalResultPath, { force: true })]);
    const prompt = lunaPrompt({
      jobPath,
      resultPath,
      retryContext: attemptNumber > 1 ? {
        attemptNumber,
        priorResultPath,
        errors: priorValidationAttempt?.validation?.errors ?? [],
        routeReasons: priorResultAttempt && priorResultAttempt !== latestWrittenAttempt
          ? priorValidationAttempt?.validation?.errors ?? []
          : priorRoute?.reasons ?? [],
      } : null,
    });
    const workerJob = await readJson(jobPath);
    const attemptProvenance = await buildAttemptProvenance({
      model: lunaModel,
      schemaPath: workerPaths(root).scoutSchema,
      prompt,
      inputPaths: [
        jobPath,
        path.resolve(repositoryRoot, workerJob.inputs.itemChecksPath),
        path.resolve(repositoryRoot, workerJob.inputs.existingDossierPath),
        path.resolve(repositoryRoot, workerJob.inputs.existingEvidencePath),
        path.resolve(repositoryRoot, workerJob.inputs.verificationPlanPath),
        ...(priorResultPath ? [priorResultPath] : []),
        ...(priorRoute ? [priorRoutePath] : []),
      ],
      resultPath,
      canonicalResultPath,
      logPath,
    });
    const args = codexArguments({
      model: lunaModel,
      schemaPath: workerPaths(root).scoutSchema,
      outputPath: resultPath,
      prompt,
    });
    const execution = await spawnWorker({ args, logPath, timeoutSeconds });
    if (execution.exitCode === 0 && existsSync(resultPath)) await copyFile(resultPath, canonicalResultPath);
    return { job, execution, startedAt, attemptProvenance };
  }, {
    stopWhen: ({ execution }) => Boolean(execution.systemicFailure),
  });

  for (const { job, execution, startedAt, attemptProvenance } of executions) {
    const target = manifest.jobs.find((candidate) => candidate.restaurantId === job.restaurantId);
    const completedAt = new Date().toISOString();
    target.status = execution.exitCode === 0 && existsSync(path.join(paths.base, job.scoutResultPath))
      ? "luna_result_ready"
      : "luna_failed";
    target.lunaExitCode = execution.exitCode;
    target.lunaStartedAt = startedAt;
    target.lunaCompletedAt = completedAt;
    target.lunaError = execution.error
      ?? (execution.systemicFailure ? `Systemic worker failure: ${execution.systemicFailure.message}` : null);
    target.lunaAttempts = [
      ...(target.lunaAttempts ?? []),
      await workerAttemptRecord({ startedAt, completedAt, execution, attemptProvenance }),
    ];
  }

  const systemicExecution = executions.find(({ execution }) => execution.systemicFailure);
  if (systemicExecution) {
    const executedIds = new Set(executions.map(({ job }) => job.restaurantId));
    manifest.systemicFailure = {
      ...systemicExecution.execution.systemicFailure,
      detectedAt: new Date().toISOString(),
    };
    for (const job of runnableJobs) {
      if (executedIds.has(job.restaurantId)) continue;
      const target = manifest.jobs.find((candidate) => candidate.restaurantId === job.restaurantId);
      target.status = "luna_failed";
      target.lunaError = `Circuit breaker: ${systemicExecution.execution.systemicFailure.message}`;
      target.lunaDeferredAt = new Date().toISOString();
    }
  }

  await routeScoutRun({ root, runId, manifest, coordinatorLock: false });
  return readJson(paths.manifest);
}

export async function routeScoutRun({
  root = defaultVerificationRoot,
  runId,
  manifest: suppliedManifest,
  coordinatorLock = true,
} = {}) {
  if (coordinatorLock) {
    return withCoordinatorLock(root, () => routeScoutRun({
      root,
      runId,
      manifest: suppliedManifest,
      coordinatorLock: false,
    }));
  }
  const paths = runPaths(root, requireRunId(runId));
  const manifest = suppliedManifest ?? await readJson(paths.manifest);

  for (const jobEntry of manifest.jobs) {
    if (!["luna_result_ready", "awaiting_luna_retry"].includes(jobEntry.status)) continue;
    if (!existsSync(path.join(paths.base, jobEntry.scoutResultPath))) continue;
    const job = await readJson(path.join(paths.base, jobEntry.jobPath));
    const result = await readJson(path.join(paths.base, jobEntry.scoutResultPath));
    const baselineItems = await readJsonLines(path.resolve(repositoryRoot, job.inputs.itemChecksPath));
    const validation = validateScoutResult({ job, result, baselineItems });
    const risk = evaluateScoutRisk({ job, result, validation });
    finalizeAttemptValidation(jobEntry, "luna", validation);
    const route = validation.valid && !risk.retryRequired
      ? {
          destination: "terra_low",
          effectiveOutcome: result.outcome,
          reasons: [
            "Every valid Luna scout receives an independent Terra verification.",
            ...risk.triggeredGates.map((gateId) => `deterministic gate: ${gateId}`),
            ...validation.warnings,
          ],
        }
      : {
          destination: "luna_retry",
          effectiveOutcome: "invalid_or_incomplete_scout",
          reasons: [...validation.errors, ...risk.triggeredGates.map((gateId) => `deterministic gate: ${gateId}`)],
        };
    await writeJsonAtomic(path.join(paths.base, jobEntry.scoutRoutePath), {
      schemaVersion: workerWorkflowSchemaVersion,
      runId,
      restaurantId: jobEntry.restaurantId,
      stage: "scout_route",
      routedAt: new Date().toISOString(),
      ...route,
      validation,
      risk,
    });
    jobEntry.status = route.destination === "terra_low" ? "awaiting_terra" : "awaiting_luna_retry";
  }

  const statuses = new Set(manifest.jobs.map((job) => job.status));
  manifest.status = statuses.has("awaiting_luna_retry") || statuses.has("luna_failed")
    ? "awaiting_luna_retry"
    : statuses.has("awaiting_terra")
      ? "awaiting_terra"
      : "awaiting_coordinator";
  manifest.updatedAt = new Date().toISOString();
  await writeJsonAtomic(paths.manifest, manifest);
  return manifest;
}

export async function createTerraVerifierPacket({ jobPath, scoutResultPath, scoutRoutePath }) {
  const [job, scout, route] = await Promise.all([
    readJson(jobPath),
    readJson(scoutResultPath),
    readJson(scoutRoutePath),
  ]);
  return {
    schemaVersion: workerWorkflowSchemaVersion,
    runId: job.runId,
    restaurant: job.restaurant,
    scout: {
      resultHash: createHash("sha256").update(JSON.stringify(scout)).digest("hex"),
      model: scout.model,
      outcome: scout.outcome,
      confidence: scout.confidence,
      identity: scout.identity,
      sources: scout.sources,
      sourceAttempts: scout.sourceAttempts,
      menuSurfaces: scout.menuSurfaces,
      currentProducts: scout.currentProducts,
      itemCheckGroups: scout.itemCheckGroups,
      riskSignals: scout.riskSignals,
      findings: scout.findings,
      summary: scout.summary,
      coordinatorNotes: scout.coordinatorNotes,
    },
    deterministicRisk: route.risk,
    routingReasons: route.reasons,
    fullInputs: {
      workerJobPath: path.relative(repositoryRoot, jobPath),
      scoutResultPath: path.relative(repositoryRoot, scoutResultPath),
      frozenItemChecksPath: job.inputs.itemChecksPath,
    },
  };
}

export async function runTerraWorkers({
  root = defaultVerificationRoot,
  runId,
  concurrency = defaultConcurrency,
  timeoutSeconds = 1800,
  spawnWorker = spawnCodex,
  coordinatorLock = true,
} = {}) {
  if (coordinatorLock) {
    return withCoordinatorLock(root, () => runTerraWorkers({
      root,
      runId,
      concurrency,
      timeoutSeconds,
      spawnWorker,
      coordinatorLock: false,
    }));
  }
  assertConcurrency(concurrency);
  assertPositiveInteger(timeoutSeconds, "timeoutSeconds");
  const paths = runPaths(root, requireRunId(runId));
  await mkdir(paths.attemptResults, { recursive: true });
  const manifest = await readJson(paths.manifest);
  const runnableJobs = manifest.jobs.filter((job) =>
    ["awaiting_terra", "terra_failed", "awaiting_terra_retry"].includes(job.status));
  if (runnableJobs.length === 0) return manifest;

  manifest.status = "terra_running";
  manifest.systemicFailure = null;
  manifest.updatedAt = new Date().toISOString();
  manifest.concurrency.terra = concurrency;
  await writeJsonAtomic(paths.manifest, manifest);

  const executions = await mapConcurrent(runnableJobs, concurrency, async (jobEntry) => {
    const startedAt = new Date().toISOString();
    const jobPath = path.join(paths.base, jobEntry.jobPath);
    const scoutResultPath = path.join(paths.base, jobEntry.scoutResultPath);
    const scoutRoutePath = path.join(paths.base, jobEntry.scoutRoutePath);
    const verifierPacketPath = path.join(paths.base, jobEntry.verifierPacketPath);
    const canonicalResultPath = path.join(paths.base, jobEntry.resultPath);
    const attemptNumber = (jobEntry.terraAttempts?.length ?? 0) + 1;
    const resultPath = path.join(paths.attemptResults, `${jobEntry.restaurantId}.terra.attempt-${attemptNumber}.json`);
    const logPath = path.join(paths.logs, `${jobEntry.restaurantId}.terra.attempt-${attemptNumber}.log`);
    const priorAttempts = jobEntry.terraAttempts ?? [];
    const priorResultAttempt = [...priorAttempts].reverse().find((attempt) => attempt.result?.written) ?? null;
    const priorValidationAttempt = [...priorAttempts].reverse().find((attempt) => attempt.validation?.state === "completed") ?? null;
    const priorResultPath = priorResultAttempt ? path.resolve(repositoryRoot, priorResultAttempt.result.path) : null;
    const priorRoutePath = path.join(paths.base, jobEntry.routePath);
    const priorRoute = existsSync(priorRoutePath) ? await readJson(priorRoutePath) : null;
    await Promise.all([rm(resultPath, { force: true }), rm(canonicalResultPath, { force: true })]);
    const packet = await createTerraVerifierPacket({ jobPath, scoutResultPath, scoutRoutePath });
    await writeJsonAtomic(verifierPacketPath, packet);
    const prompt = terraPrompt({
      verifierPacketPath,
      resultPath,
      retryContext: attemptNumber > 1 ? {
        attemptNumber,
        priorResultPath,
        errors: priorValidationAttempt?.validation?.errors ?? [],
        warnings: priorValidationAttempt?.validation?.warnings ?? [],
        routeReasons: priorRoute?.reasons ?? [],
      } : null,
    });
    const attemptProvenance = await buildAttemptProvenance({
      model: terraModel,
      schemaPath: workerPaths(root).workerSchema,
      prompt,
      inputPaths: [
        verifierPacketPath,
        jobPath,
        scoutResultPath,
        scoutRoutePath,
        path.resolve(repositoryRoot, packet.fullInputs.frozenItemChecksPath),
        ...(priorResultPath ? [priorResultPath] : []),
        ...(priorRoute ? [priorRoutePath] : []),
      ],
      resultPath,
      canonicalResultPath,
      logPath,
    });
    const args = codexArguments({
      model: terraModel,
      schemaPath: workerPaths(root).workerSchema,
      outputPath: resultPath,
      prompt,
    });
    const execution = await spawnWorker({ args, logPath, timeoutSeconds });
    if (execution.exitCode === 0 && existsSync(resultPath)) await copyFile(resultPath, canonicalResultPath);
    return { jobEntry, startedAt, attemptProvenance, execution };
  }, {
    stopWhen: ({ execution }) => Boolean(execution.systemicFailure),
  });

  for (const { jobEntry, execution, startedAt, attemptProvenance } of executions) {
    const target = manifest.jobs.find((candidate) => candidate.restaurantId === jobEntry.restaurantId);
    const completedAt = new Date().toISOString();
    target.status = execution.exitCode === 0 && existsSync(path.join(paths.base, jobEntry.resultPath))
      ? "terra_result_ready"
      : "terra_failed";
    target.terraExitCode = execution.exitCode;
    target.terraStartedAt = startedAt;
    target.terraCompletedAt = completedAt;
    target.terraError = execution.error
      ?? (execution.systemicFailure ? `Systemic worker failure: ${execution.systemicFailure.message}` : null);
    target.terraAttempts = [
      ...(target.terraAttempts ?? []),
      await workerAttemptRecord({ startedAt, completedAt, execution, attemptProvenance }),
    ];
  }

  applySystemicCircuitBreaker({ manifest, runnableJobs, executions, stage: "terra", jobKey: "jobEntry" });

  await routeWorkerRun({ root, runId, manifest, coordinatorLock: false });
  return readJson(paths.manifest);
}

export async function routeWorkerRun({
  root = defaultVerificationRoot,
  runId,
  manifest: suppliedManifest,
  coordinatorLock = true,
} = {}) {
  if (coordinatorLock) {
    return withCoordinatorLock(root, () => routeWorkerRun({
      root,
      runId,
      manifest: suppliedManifest,
      coordinatorLock: false,
    }));
  }
  const paths = runPaths(root, requireRunId(runId));
  const manifest = suppliedManifest ?? await readJson(paths.manifest);

  for (const jobEntry of manifest.jobs) {
    if (!["terra_result_ready", "awaiting_terra_retry", "terra_failed"].includes(jobEntry.status)) continue;
    const canonicalResultPath = path.join(paths.base, jobEntry.resultPath);
    if (!existsSync(canonicalResultPath)) {
      const recoverableAttempt = [...(jobEntry.terraAttempts ?? [])]
        .reverse()
        .find((attempt) => attempt.result?.written && existsSync(path.resolve(repositoryRoot, attempt.result.path)));
      if (!recoverableAttempt) continue;
      await copyFile(path.resolve(repositoryRoot, recoverableAttempt.result.path), canonicalResultPath);
    }
    const job = await readJson(path.join(paths.base, jobEntry.jobPath));
    const result = await readJson(canonicalResultPath);
    const verifierPacket = await readJson(path.join(paths.base, jobEntry.verifierPacketPath));
    const baselineItems = await readJsonLines(path.resolve(repositoryRoot, job.inputs.itemChecksPath));
    const validation = validateTerraResult({ job, result, baselineItems, verifierPacket });
    finalizeAttemptValidation(jobEntry, "terra", validation, sha256(await readFile(canonicalResultPath)));
    const route = routeWorkerResult({
      result,
      validation,
      deterministicRisk: verifierPacket.deterministicRisk,
    });
    const routeRecord = {
      schemaVersion: workerWorkflowSchemaVersion,
      runId,
      restaurantId: jobEntry.restaurantId,
      routedAt: new Date().toISOString(),
      ...route,
      validation,
      deterministicRisk: verifierPacket.deterministicRisk,
    };
    await writeJsonAtomic(path.join(paths.base, jobEntry.routePath), routeRecord);
    jobEntry.status = route.destination === "sol_medium"
      ? "awaiting_sol"
      : route.destination === "coordinator"
        ? "awaiting_coordinator"
        : "awaiting_terra_retry";
  }

  const statuses = new Set(manifest.jobs.map((job) => job.status));
  if (statuses.has("awaiting_terra_retry") || statuses.has("terra_failed")) {
    manifest.status = "awaiting_terra_retry";
  } else if (statuses.has("awaiting_sol")) {
    manifest.status = "awaiting_sol";
  } else {
    manifest.status = "awaiting_coordinator";
  }
  manifest.updatedAt = new Date().toISOString();
  await writeJsonAtomic(paths.manifest, manifest);
  return manifest;
}

export function validateWorkerResult({
  job,
  result,
  baselineItems,
  expectedStage = "terra_verification",
  expectedModel = terraModel,
} = {}) {
  const errors = [];
  const warnings = [];
  const expectedKeys = baselineItems.map((item) => item.auditItemKey);
  const expectedKeySet = new Set(expectedKeys);
  const resultKeys = (result.itemCheckGroups ?? []).flatMap((group) => group.auditItemKeys ?? []);
  const resultKeySet = new Set(resultKeys);

  if (result.schemaVersion !== workerWorkflowSchemaVersion) errors.push("Unsupported result schemaVersion.");
  if (result.runId !== job.runId) errors.push("Result runId does not match its job.");
  if (result.stage !== expectedStage) errors.push(`Result stage must be ${expectedStage}.`);
  if (result.model?.id !== expectedModel.id || result.model?.reasoningEffort !== expectedModel.reasoningEffort) {
    errors.push(`Result model provenance is not ${expectedModel.id} ${expectedModel.reasoningEffort}.`);
  }
  if (result.restaurant?.restaurantId !== job.restaurant.restaurantId) errors.push("Result restaurantId does not match its job.");
  if (result.restaurant?.baselineItemFingerprint !== job.restaurant.baselineItemFingerprint) errors.push("Result baseline fingerprint is stale or incorrect.");
  if (result.restaurant?.baselineItemCount !== job.restaurant.baselineItemCount) errors.push("Result baseline item count does not match its job.");
  if (resultKeys.length !== expectedKeys.length || resultKeySet.size !== resultKeys.length) {
    errors.push("Result must reconcile every baseline item exactly once.");
  }
  const missingKeys = expectedKeys.filter((key) => !resultKeySet.has(key));
  const unknownKeys = resultKeys.filter((key) => !expectedKeySet.has(key));
  const duplicateKeys = [...new Set(
    resultKeys.filter((key, index) => resultKeys.indexOf(key) !== index),
  )];
  if (missingKeys.length > 0) {
    errors.push(`Missing ${missingKeys.length} baseline item check(s): ${formatKeyPreview(missingKeys)}.`);
  }
  if (unknownKeys.length > 0) {
    errors.push(`Contains ${unknownKeys.length} unknown item check(s): ${formatKeyPreview(unknownKeys)}.`);
  }
  if (duplicateKeys.length > 0) {
    errors.push(`Contains ${duplicateKeys.length} duplicate item check(s): ${formatKeyPreview(duplicateKeys)}.`);
  }

  const sourceIds = (result.sources ?? []).map((source) => source.evidenceId);
  const sourceIdSet = new Set(sourceIds);
  if (sourceIdSet.size !== sourceIds.length) errors.push("Evidence IDs must be unique.");
  for (const reference of collectEvidenceReferences(result)) {
    if (!sourceIdSet.has(reference)) warnings.push(`Unresolved sourceEvidenceId: ${reference}`);
  }
  for (const source of result.sources ?? []) {
    if (![source.excerpt, source.stableRowId, source.contentHash, source.artifactSuggested].some(Boolean)) {
      warnings.push(`Evidence ${source.evidenceId} has no reproducibility anchor.`);
    }
  }
  if ((result.sources ?? []).length === 0) warnings.push("Result contains no evidence sources.");

  const scores = [
    result.confidence?.overall,
    result.confidence?.menu,
    result.confidence?.allergenSource,
    result.confidence?.extraction,
  ];
  if (scores.some((score) => typeof score !== "number" || score < 0 || score > 1)) {
    errors.push("Confidence scores must be numbers from zero through one.");
  }
  if (result.confidence?.level === "low" && result.outcome !== "low_confidence") {
    warnings.push("Low confidence must be explicitly marked low_confidence.");
  }
  if (result.outcome === "low_confidence" && result.confidence?.level !== "low") {
    warnings.push("A low_confidence outcome must use the low confidence level.");
  }
  if (result.outcome === "blocked_unverifiable") {
    const attemptedKinds = new Set((result.sourceAttempts ?? []).map((attempt) => attempt.kind));
    const missingAttempts = sourceAttemptKinds.filter((kind) => !attemptedKinds.has(kind));
    if (missingAttempts.length > 0) warnings.push(`Blocked result is missing source attempt classes: ${missingAttempts.join(", ")}.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function formatKeyPreview(keys, limit = 10) {
  const preview = keys.slice(0, limit).join(", ");
  const remaining = keys.length - limit;
  return remaining > 0 ? `${preview} (+${remaining} more)` : preview;
}

export function validateScoutResult({ job, result, baselineItems } = {}) {
  const validation = validateWorkerResult({
    job,
    result,
    baselineItems,
    expectedStage: "luna_scout",
    expectedModel: lunaModel,
  });
  const { errors, warnings } = validation;
  const surfaces = result.menuSurfaces ?? [];
  const products = result.currentProducts ?? [];
  const surfaceIds = surfaces.map((surface) => surface.surfaceId);
  const candidateKeys = products.map((product) => product.currentProductKey);
  if (surfaces.length === 0) warnings.push("Scout found no current menu surfaces.");
  if (new Set(surfaceIds).size !== surfaceIds.length) errors.push("Scout menu surface IDs must be unique.");
  if (new Set(candidateKeys).size !== candidateKeys.length) errors.push("Scout current product candidate keys must be unique.");
  const evidenceIds = new Set((result.sources ?? []).map((source) => source.evidenceId));
  const surfaceIdSet = new Set(surfaceIds);
  const referencedProductKeys = new Set([
    ...surfaces.flatMap((surface) => surface.currentProductKeys ?? []),
    ...(result.itemCheckGroups ?? []).flatMap((group) => group.matchedCurrentProductKeys ?? []),
  ]);
  if (candidateKeys.length === 0 && referencedProductKeys.size > 0) {
    errors.push(
      `Scout references ${referencedProductKeys.size} current product key(s) but defines no currentProducts records.`,
    );
  }
  for (const surface of surfaces) {
    for (const evidenceId of surface.sourceEvidenceIds ?? []) {
      if (!evidenceIds.has(evidenceId)) warnings.push(`Unresolved menu surface evidenceId: ${evidenceId}`);
    }
    for (const currentProductKey of surface.currentProductKeys ?? []) {
      if (!candidateKeys.includes(currentProductKey)) warnings.push(`Unresolved surface currentProductKey: ${currentProductKey}`);
    }
  }
  for (const group of result.itemCheckGroups ?? []) {
    for (const currentProductKey of group.matchedCurrentProductKeys ?? []) {
      if (!candidateKeys.includes(currentProductKey)) warnings.push(`Unresolved matched currentProductKey: ${currentProductKey}`);
    }
    validateAllergenEvidenceReferences({ record: group, evidenceIds, sources: result.sources, warnings });
  }
  for (const product of products) {
    for (const surfaceId of product.surfaceIds ?? []) {
      if (!surfaceIdSet.has(surfaceId)) errors.push(`Unresolved current product surfaceId: ${surfaceId}`);
    }
    for (const reference of product.sourceEvidenceIds ?? []) {
      if (!evidenceIds.has(reference)) warnings.push(`Unresolved current product evidenceId: ${reference}`);
    }
    validateAllergenEvidenceReferences({ record: product, evidenceIds, sources: result.sources, warnings });
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validateTerraResult({ job, result, baselineItems, verifierPacket } = {}) {
  const validation = validateWorkerResult({ job, result, baselineItems });
  const { errors, warnings } = validation;
  const scout = verifierPacket?.scout ?? {};
  if (result.scoutProvenance?.runId !== job.runId) errors.push("Terra scout provenance runId is incorrect.");
  if (
    result.scoutProvenance?.model?.id !== lunaModel.id ||
    result.scoutProvenance?.model?.reasoningEffort !== lunaModel.reasoningEffort
  ) errors.push("Terra scout provenance model is not Luna low.");
  if (result.scoutProvenance?.resultHash !== scout.resultHash) errors.push("Terra scout result hash is stale or incorrect.");

  const expectedSurfaceIds = (scout.menuSurfaces ?? []).map((surface) => surface.surfaceId);
  const checkedSurfaceIds = (result.surfaceChecks ?? []).map((surface) => surface.surfaceId);
  validateExactKeyCoverage({ expected: expectedSurfaceIds, actual: checkedSurfaceIds, label: "scout menu surface", errors });

  const expectedProductKeys = (scout.currentProducts ?? []).map((product) => product.currentProductKey);
  const checkedProductKeys = (result.currentProductCheckGroups ?? [])
    .flatMap((group) => group.currentProductKeys ?? []);
  validateExactKeyCoverage({ expected: expectedProductKeys, actual: checkedProductKeys, label: "scout current product", errors });
  const expectedPresentationIds = (scout.currentProducts ?? []).flatMap((product) => product.presentationIds ?? []);
  const checkedPresentationIds = (result.currentProductCheckGroups ?? []).flatMap((group) => group.presentationIds ?? []);
  validateExactKeyCoverage({ expected: expectedPresentationIds, actual: checkedPresentationIds, label: "scout product presentation", errors: warnings });

  const requiredGateIds = (verifierPacket?.deterministicRisk?.triggeredGates ?? [])
    .map((gate) => typeof gate === "string" ? gate : gate.gateId);
  const reviewedGateIds = (result.reviewedRiskGates ?? []).map((gate) => gate.gateId);
  for (const gateId of requiredGateIds) {
    if (!reviewedGateIds.includes(gateId)) warnings.push(`Terra did not review deterministic risk gate: ${gateId}`);
  }
  const evidenceIds = new Set((result.sources ?? []).map((source) => source.evidenceId));
  for (const reference of [
    ...(result.reviewedRiskGates ?? []).flatMap((gate) => gate.sourceEvidenceIds ?? []),
    ...(result.surfaceChecks ?? []).flatMap((surface) => surface.sourceEvidenceIds ?? []),
    ...(result.currentProductCheckGroups ?? []).flatMap((group) => group.sourceEvidenceIds ?? []),
    ...(result.currentProductCheckGroups ?? []).flatMap((group) => group.allergenSourceEvidenceIds ?? []),
  ]) {
    if (!evidenceIds.has(reference)) warnings.push(`Unresolved Terra verification evidenceId: ${reference}`);
  }
  for (const group of result.currentProductCheckGroups ?? []) {
    validateAllergenEvidenceReferences({ record: group, evidenceIds, sources: result.sources, warnings });
  }
  for (const product of result.additionalCurrentProducts ?? []) {
    validateAllergenEvidenceReferences({ record: product, evidenceIds, sources: result.sources, warnings });
  }
  if (result.identity?.verdict !== "verified") warnings.push(`Terra identity verdict is ${result.identity?.verdict ?? "missing"}.`);
  if ((result.surfaceChecks ?? []).some((check) => check.verdict !== "verified")) {
    warnings.push("Terra reported a mismatched or unverifiable menu surface.");
  }
  if ((result.currentProductCheckGroups ?? []).some((group) => group.verdict !== "verified")) {
    warnings.push("Terra reported a mismatched or unverifiable current product.");
  }
  if ((result.reviewedRiskGates ?? []).some((gate) => gate.triggered && ["confirmed", "unresolved"].includes(gate.verdict))) {
    warnings.push("Terra confirmed or left unresolved a deterministic risk gate.");
  }
  if ((result.additionalMenuSurfaces ?? []).length > 0) warnings.push("Terra discovered additional menu surfaces.");
  if ((result.additionalCurrentProducts ?? []).length > 0) warnings.push("Terra discovered additional current products.");
  if ((result.findings ?? []).length > 0) warnings.push("Terra reported findings requiring adjudication.");
  if ((result.itemCheckGroups ?? []).some((group) => group.allergenVerdict === "mismatch")) {
    warnings.push("Terra reported baseline allergen mismatches.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validateAllergenEvidenceReferences({ record, evidenceIds, sources, warnings }) {
  const references = record.allergenSourceEvidenceIds ?? [];
  for (const reference of references) {
    if (!evidenceIds.has(reference)) warnings.push(`Unresolved allergen source evidenceId: ${reference}`);
  }
  const declaredTier = record.allergenAuthorityTier ?? record.adjudicatedAllergenAuthorityTier ?? null;
  if (!declaredTier || references.length === 0) return;
  const sourceById = new Map((sources ?? []).map((source) => [source.evidenceId, source]));
  if (!references.some((reference) => sourceById.get(reference)?.authorityTier === declaredTier)) {
    warnings.push(`Declared allergen authority ${declaredTier} is not supported by its allergen evidence references.`);
  }
}

function validateExactKeyCoverage({ expected, actual, label, errors }) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  if (actual.length !== expected.length || actualSet.size !== actual.length) {
    errors.push(`Terra must verify every ${label} exactly once.`);
  }
  const missing = expected.filter((key) => !actualSet.has(key));
  const unknown = actual.filter((key) => !expectedSet.has(key));
  const duplicates = [...new Set(
    actual.filter((key, index) => actual.indexOf(key) !== index),
  )];
  if (missing.length > 0) {
    errors.push(`Terra missed ${missing.length} ${label}(s): ${formatKeyPreview(missing)}.`);
  }
  if (unknown.length > 0) {
    errors.push(`Terra returned ${unknown.length} unknown ${label}(s): ${formatKeyPreview(unknown)}.`);
  }
  if (duplicates.length > 0) {
    errors.push(`Terra repeated ${duplicates.length} ${label}(s): ${formatKeyPreview(duplicates)}.`);
  }
}

export function routeWorkerResult({ result, validation, deterministicRisk = null }) {
  if (!validation.valid) {
    return {
      destination: "terra_retry",
      effectiveOutcome: "invalid_result",
      reasons: validation.errors,
    };
  }
  if (escalationOutcomes.has(result.outcome)) {
    return {
      destination: "sol_medium",
      effectiveOutcome: result.outcome,
      reasons: [`Terra marked the result ${result.outcome}.`, ...validation.warnings],
    };
  }
  if (result.confidence?.level === "low" || validation.warnings.length > 0) {
    return {
      destination: "sol_medium",
      effectiveOutcome: "low_confidence",
      reasons: validation.warnings.length > 0
        ? validation.warnings
        : ["Terra confidence is low."],
    };
  }
  if (deterministicRisk?.requiresStrongReview) {
    return {
      destination: "sol_medium",
      effectiveOutcome: "low_confidence",
      reasons: [
        "Deterministic scope or semantic gates require strong review even though Terra reported no discrepancy.",
        ...(deterministicRisk.triggeredGates ?? [])
          .map((gate) => typeof gate === "string" ? `deterministic gate: ${gate}` : `${gate.gateId}: ${gate.reason}`),
      ],
    };
  }
  return {
    destination: "coordinator",
    effectiveOutcome: "no_discrepancy",
    reasons: ["Terra found no discrepancy and returned a structurally complete result without evidence warnings."],
  };
}

export async function runSolReviews({
  root = defaultVerificationRoot,
  runId,
  concurrency = 1,
  timeoutSeconds = 1800,
  spawnWorker = spawnCodex,
  coordinatorLock = true,
} = {}) {
  if (coordinatorLock) {
    return withCoordinatorLock(root, () => runSolReviews({
      root,
      runId,
      concurrency,
      timeoutSeconds,
      spawnWorker,
      coordinatorLock: false,
    }));
  }
  assertConcurrency(concurrency);
  const paths = runPaths(root, requireRunId(runId));
  await mkdir(paths.attemptResults, { recursive: true });
  const manifest = await readJson(paths.manifest);
  await recoverCompletedSolOutputs({ root, runId, paths, manifest });
  const reviewJobs = manifest.jobs.filter((job) => ["awaiting_sol", "sol_failed", "awaiting_sol_retry"].includes(job.status));
  if (reviewJobs.length === 0) {
    manifest.status = manifest.jobs.some((job) => ["sol_failed", "awaiting_sol_retry"].includes(job.status))
      ? "awaiting_sol_retry"
      : "awaiting_coordinator";
    manifest.updatedAt = new Date().toISOString();
    await writeJsonAtomic(paths.manifest, manifest);
    return manifest;
  }

  manifest.status = "sol_running";
  manifest.systemicFailure = null;
  manifest.updatedAt = new Date().toISOString();
  manifest.concurrency.sol = concurrency;
  await writeJsonAtomic(paths.manifest, manifest);

  const executions = await mapConcurrent(reviewJobs, concurrency, async (job) => {
    const startedAt = new Date().toISOString();
    const jobPath = path.join(paths.base, job.jobPath);
    const terraResultPath = path.join(paths.base, job.resultPath);
    const routePath = path.join(paths.base, job.routePath);
    const reviewPacketPath = path.join(paths.reviewPackets, `${job.restaurantId}.json`);
    const canonicalReviewPath = path.join(paths.base, job.reviewPath);
    const attemptNumber = (job.solAttempts?.length ?? 0) + 1;
    const reviewPath = path.join(paths.attemptResults, `${job.restaurantId}.sol.attempt-${attemptNumber}.json`);
    const logPath = path.join(paths.logs, `${job.restaurantId}.sol.attempt-${attemptNumber}.log`);
    await Promise.all([rm(reviewPath, { force: true }), rm(canonicalReviewPath, { force: true })]);
    const reviewPacket = await createSolReviewPacket({ jobPath, terraResultPath, routePath });
    await writeJsonAtomic(reviewPacketPath, reviewPacket);
    const prompt = solPrompt({ reviewPacketPath });
    const attemptProvenance = await buildAttemptProvenance({
      model: solModel,
      schemaPath: workerPaths(root).reviewSchema,
      prompt,
      inputPaths: [reviewPacketPath, jobPath, terraResultPath, routePath],
      resultPath: reviewPath,
      canonicalResultPath: canonicalReviewPath,
      logPath,
    });
    const args = codexArguments({
      model: solModel,
      schemaPath: workerPaths(root).reviewSchema,
      outputPath: reviewPath,
      prompt,
    });
    const execution = await spawnWorker({ args, logPath, timeoutSeconds });
    if (execution.exitCode === 0 && existsSync(reviewPath)) await copyFile(reviewPath, canonicalReviewPath);
    return { job, startedAt, attemptProvenance, execution };
  }, {
    stopWhen: ({ execution }) => Boolean(execution.systemicFailure),
  });

  for (const { job, execution, startedAt, attemptProvenance } of executions) {
    const target = manifest.jobs.find((candidate) => candidate.restaurantId === job.restaurantId);
    const completedAt = new Date().toISOString();
    let validation = { valid: false, errors: ["Sol review did not produce a result."], warnings: [], state: "not_run" };
    if (execution.exitCode === 0 && existsSync(path.join(paths.base, job.reviewPath))) {
      try {
        const [workerJob, route, review] = await Promise.all([
          readJson(path.join(paths.base, job.jobPath)),
          readJson(path.join(paths.base, job.routePath)),
          readJson(path.join(paths.base, job.reviewPath)),
        ]);
        validation = { ...validateSolReview({ job: workerJob, route, review }), state: "completed" };
      } catch (error) {
        validation = { valid: false, errors: [error.message], warnings: [], state: "completed" };
      }
    }
    const reviewValidationPath = job.reviewValidationPath ?? `review-validations/${job.restaurantId}.json`;
    job.reviewValidationPath = reviewValidationPath;
    await writeJsonAtomic(path.join(paths.base, reviewValidationPath), {
      schemaVersion: workerWorkflowSchemaVersion,
      runId,
      restaurantId: job.restaurantId,
      validatedAt: completedAt,
      ...validation,
    });
    target.status = execution.exitCode !== 0
      ? "sol_failed"
      : validation.valid
        ? "awaiting_coordinator"
        : "awaiting_sol_retry";
    target.solExitCode = execution.exitCode;
    target.solStartedAt = startedAt;
    target.solCompletedAt = completedAt;
    target.solError = execution.error
      ?? (execution.systemicFailure ? `Systemic worker failure: ${execution.systemicFailure.message}` : null);
    target.solAttempts = [
      ...(target.solAttempts ?? []),
      await workerAttemptRecord({ startedAt, completedAt, execution, attemptProvenance, validation }),
    ];
  }
  applySystemicCircuitBreaker({ manifest, runnableJobs: reviewJobs, executions, stage: "sol", jobKey: "job" });
  manifest.status = manifest.jobs.some((job) => ["sol_failed", "awaiting_sol_retry"].includes(job.status))
    ? "awaiting_sol_retry"
    : "awaiting_coordinator";
  manifest.updatedAt = new Date().toISOString();
  await writeJsonAtomic(paths.manifest, manifest);
  return manifest;
}

async function recoverCompletedSolOutputs({ root, runId, paths, manifest }) {
  for (const job of manifest.jobs) {
    job.reviewValidationPath ??= `review-validations/${job.restaurantId}.json`;
    if (job.solAttempts?.length) continue;
    if (!["awaiting_sol", "sol_running"].includes(job.status)) continue;
    const attemptNumber = 1;
    const resultPath = path.join(paths.attemptResults, `${job.restaurantId}.sol.attempt-${attemptNumber}.json`);
    const canonicalReviewPath = path.join(paths.base, job.reviewPath);
    const logPath = path.join(paths.logs, `${job.restaurantId}.sol.attempt-${attemptNumber}.log`);
    const reviewPacketPath = path.join(paths.reviewPackets, `${job.restaurantId}.json`);
    if (![resultPath, canonicalReviewPath, logPath, reviewPacketPath].every(existsSync)) continue;

    const jobPath = path.join(paths.base, job.jobPath);
    const terraResultPath = path.join(paths.base, job.resultPath);
    const routePath = path.join(paths.base, job.routePath);
    const [workerJob, route, review, logBuffer, resultStats] = await Promise.all([
      readJson(jobPath),
      readJson(routePath),
      readJson(canonicalReviewPath),
      readFile(logPath),
      stat(resultPath),
    ]);
    const validation = { ...validateSolReview({ job: workerJob, route, review }), state: "completed" };
    const completedAt = resultStats.mtime.toISOString();
    const startedAt = resultStats.birthtime.toISOString();
    const prompt = solPrompt({ reviewPacketPath });
    const attemptProvenance = await buildAttemptProvenance({
      model: solModel,
      schemaPath: workerPaths(root).reviewSchema,
      prompt,
      inputPaths: [reviewPacketPath, jobPath, terraResultPath, routePath],
      resultPath,
      canonicalResultPath: canonicalReviewPath,
      logPath,
    });
    const logText = logBuffer.toString();
    const execution = {
      exitCode: 0,
      error: null,
      systemicFailure: null,
      reportedModel: parseReportedModel(logText),
      tokens: parseTokenUsage(logText),
      logSha256: sha256(logBuffer),
    };
    await writeJsonAtomic(path.join(paths.base, job.reviewValidationPath), {
      schemaVersion: workerWorkflowSchemaVersion,
      runId,
      restaurantId: job.restaurantId,
      validatedAt: completedAt,
      ...validation,
    });
    job.status = validation.valid ? "awaiting_coordinator" : "awaiting_sol_retry";
    job.solExitCode = 0;
    job.solStartedAt = startedAt;
    job.solCompletedAt = completedAt;
    job.solError = null;
    job.solRecoveredAt = new Date().toISOString();
    job.solAttempts = [
      await workerAttemptRecord({ startedAt, completedAt, execution, attemptProvenance, validation }),
    ];
  }
}

export function validateSolReview({ job, route, review } = {}) {
  const errors = [];
  const warnings = [];
  if (review?.schemaVersion !== workerWorkflowSchemaVersion) errors.push("Unsupported Sol review schemaVersion.");
  if (review?.runId !== job?.runId) errors.push("Sol review runId does not match its job.");
  if (review?.stage !== "sol_review") errors.push("Sol review stage is invalid.");
  if (review?.model?.id !== solModel.id || review?.model?.reasoningEffort !== solModel.reasoningEffort) {
    errors.push(`Sol review model provenance is not ${solModel.id} ${solModel.reasoningEffort}.`);
  }
  if (review?.restaurantId !== job?.restaurant?.restaurantId) errors.push("Sol review restaurantId does not match its job.");
  if (review?.verifierOutcome !== route?.effectiveOutcome) errors.push("Sol verifierOutcome does not match the routed effective outcome.");
  if (typeof review?.confidence?.score !== "number" || review.confidence.score < 0 || review.confidence.score > 1) {
    errors.push("Sol confidence score must be from zero through one.");
  }
  if (review?.confidence?.level === "low" && review?.recommendation === "return_to_coordinator") {
    warnings.push("Low-confidence Sol review returned to the coordinator for explicit adjudication.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

export async function releaseWorkerRun({ root = defaultVerificationRoot, runId } = {}) {
  return withCoordinatorLock(root, async () => {
    const paths = runPaths(root, requireRunId(runId));
    const manifest = await readJson(paths.manifest);
    manifest.status = "released";
    manifest.updatedAt = new Date().toISOString();
    await writeJsonAtomic(paths.manifest, manifest);
    return manifest;
  });
}

export async function requeueLunaScout({
  root = defaultVerificationRoot,
  runId,
  restaurantId,
  reason = "Coordinator requeued the scout after a downstream contract failure.",
} = {}) {
  return withCoordinatorLock(root, async () => {
    const paths = runPaths(root, requireRunId(runId));
    const manifest = await readJson(paths.manifest);
    const job = manifest.jobs.find((entry) => entry.restaurantId === restaurantId);
    if (!job) throw new Error(`Run ${runId} has no restaurant job: ${restaurantId}`);
    if (!["awaiting_terra_retry", "terra_failed"].includes(job.status)) {
      throw new Error(`Restaurant ${restaurantId} cannot return to Luna from status ${job.status}.`);
    }
    job.status = "awaiting_luna_retry";
    job.lunaRequeues = [
      ...(job.lunaRequeues ?? []),
      {
        requeuedAt: new Date().toISOString(),
        fromStage: "terra",
        reason,
      },
    ];
    manifest.status = "awaiting_luna_retry";
    manifest.updatedAt = new Date().toISOString();
    await writeJsonAtomic(paths.manifest, manifest);
    return manifest;
  });
}

export async function listWorkerRuns({ root = defaultVerificationRoot } = {}) {
  const workflowRoot = workerPaths(root).workflowRoot;
  const entries = await readdir(workflowRoot, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const manifests = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const manifestPath = path.join(workflowRoot, entry.name, "manifest.json");
    if (existsSync(manifestPath)) manifests.push(await readJson(manifestPath));
  }
  return manifests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function codexArguments({ model, schemaPath, outputPath, prompt }) {
  return [
    "-a", "never",
    "--search",
    "exec",
    "--model", model.id,
    "-c", `model_reasoning_effort=${model.reasoningEffort}`,
    "--sandbox", "read-only",
    "--ephemeral",
    "--output-schema", schemaPath,
    "--output-last-message", outputPath,
    "-C", repositoryRoot,
    prompt,
  ];
}

async function spawnCodex({ args, logPath, timeoutSeconds }) {
  await mkdir(path.dirname(logPath), { recursive: true });
  return new Promise((resolve) => {
    const log = createWriteStream(logPath, { flags: "a" });
    const child = spawn("codex", args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let outputTail = "";
    const logHash = createHash("sha256");
    const capture = (chunk) => {
      const text = chunk.toString();
      log.write(text);
      logHash.update(chunk);
      outputTail = `${outputTail}${text}`.slice(-131072);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutSeconds * 1000);
    child.once("error", (error) => {
      clearTimeout(timer);
      log.end();
      resolve({ exitCode: -1, error: error.message });
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      log.end();
      const normalizedExitCode = exitCode ?? -1;
      resolve({
        exitCode: normalizedExitCode,
        error: timedOut ? `Timed out after ${timeoutSeconds} seconds.` : null,
        systemicFailure: classifyWorkerExecutionSystemicFailure({
          exitCode: normalizedExitCode,
          timedOut,
          output: outputTail,
        }),
        reportedModel: parseReportedModel(outputTail),
        tokens: parseTokenUsage(outputTail),
        logSha256: logHash.digest("hex"),
      });
    });
  });
}

export function classifySystemicWorkerFailure(output) {
  const text = String(output ?? "");
  if (/you(?:'|’)ve hit your usage limit/i.test(text)) {
    return { code: "usage_limit", message: "The Codex account usage limit was reached." };
  }
  if (/invalid_json_schema|invalid schema for response_format/i.test(text)) {
    return { code: "invalid_output_schema", message: "Codex rejected the configured structured-output schema." };
  }
  if (/(?:model|deployment).*(?:not found|does not exist|not available)|unsupported model/i.test(text)) {
    return { code: "model_unavailable", message: "The configured worker model is unavailable." };
  }
  return null;
}

export function classifyWorkerExecutionSystemicFailure({ exitCode, timedOut = false, output }) {
  if (exitCode === 0 || timedOut) return null;
  return classifySystemicWorkerFailure(output);
}

async function buildAttemptProvenance({ model, schemaPath, prompt, inputPaths, resultPath, canonicalResultPath, logPath }) {
  return {
    model,
    schema: { path: path.relative(repositoryRoot, schemaPath), sha256: sha256(await readFile(schemaPath)) },
    prompt: { text: prompt, sha256: sha256(prompt) },
    inputs: await Promise.all(inputPaths.map(async (inputPath) => {
      try {
        return {
          path: path.relative(repositoryRoot, inputPath),
          exists: true,
          sha256: sha256(await readFile(inputPath)),
        };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        return { path: path.relative(repositoryRoot, inputPath), exists: false, sha256: null };
      }
    })),
    resultPath,
    canonicalResultPath,
    logPath,
  };
}

async function workerAttemptRecord({ startedAt, completedAt, execution, attemptProvenance, validation = null }) {
  const resultWritten = existsSync(attemptProvenance.resultPath);
  const runtimeModel = execution.reportedModel ?? null;
  return {
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    model: {
      id: attemptProvenance.model.id,
      reasoningEffort: attemptProvenance.model.reasoningEffort,
      runtimeId: runtimeModel?.id ?? null,
      runtimeReasoningEffort: runtimeModel?.reasoningEffort ?? null,
      exact: runtimeModel
        ? runtimeModel.id === attemptProvenance.model.id && runtimeModel.reasoningEffort === attemptProvenance.model.reasoningEffort
        : null,
    },
    schema: attemptProvenance.schema,
    prompt: attemptProvenance.prompt,
    inputs: attemptProvenance.inputs,
    result: {
      path: path.relative(repositoryRoot, attemptProvenance.resultPath),
      canonicalPath: path.relative(repositoryRoot, attemptProvenance.canonicalResultPath),
      written: resultWritten,
      sha256: resultWritten ? sha256(await readFile(attemptProvenance.resultPath)) : null,
    },
    log: {
      path: path.relative(repositoryRoot, attemptProvenance.logPath),
      sha256: execution.logSha256 ?? (existsSync(attemptProvenance.logPath) ? sha256(await readFile(attemptProvenance.logPath)) : null),
    },
    exitCode: execution.exitCode,
    error: execution.error ?? null,
    systemicFailure: execution.systemicFailure ?? null,
    validation: validation
      ? { state: "completed", valid: validation.valid, errors: validation.errors, warnings: validation.warnings }
      : { state: "not_run", valid: null, errors: [], warnings: [] },
    tokens: execution.tokens ?? { available: false, total: null, source: null },
  };
}

function finalizeAttemptValidation(jobEntry, stage, validation, resultSha256 = null) {
  const attempts = jobEntry[`${stage}Attempts`] ?? [];
  const attempt = resultSha256
    ? [...attempts].reverse().find((candidate) => candidate.result?.sha256 === resultSha256)
    : attempts.at(-1);
  if (!attempt) throw new Error(`Cannot attach ${stage} validation without a recorded attempt.`);
  attempt.validation = {
    state: "completed",
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

function parseReportedModel(output) {
  const id = /^model:\s*(\S+)/m.exec(String(output ?? ""))?.[1] ?? null;
  const reasoningEffort = /^reasoning effort:\s*(\S+)/m.exec(String(output ?? ""))?.[1] ?? null;
  return id && reasoningEffort ? { id, reasoningEffort } : null;
}

function parseTokenUsage(output) {
  const matches = [...String(output ?? "").matchAll(/tokens used\s*\n?\s*([\d,]+)/gi)];
  if (matches.length === 0) return { available: false, total: null, source: null };
  return { available: true, total: Number(matches.at(-1)[1].replaceAll(",", "")), source: "runtime_log" };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function applySystemicCircuitBreaker({ manifest, runnableJobs, executions, stage, jobKey }) {
  const systemicExecution = executions.find(({ execution }) => execution.systemicFailure);
  if (!systemicExecution) return;
  const executedIds = new Set(executions.map((entry) => entry[jobKey].restaurantId));
  manifest.systemicFailure = {
    stage,
    ...systemicExecution.execution.systemicFailure,
    detectedAt: new Date().toISOString(),
  };
  for (const job of runnableJobs) {
    if (executedIds.has(job.restaurantId)) continue;
    const target = manifest.jobs.find((candidate) => candidate.restaurantId === job.restaurantId);
    target.status = `${stage}_failed`;
    target[`${stage}Error`] = `Circuit breaker: ${systemicExecution.execution.systemicFailure.message}`;
    target[`${stage}DeferredAt`] = new Date().toISOString();
  }
}

function lunaPrompt({ jobPath, resultPath, retryContext = null }) {
  const structuralOnlyRetry = retryContext?.errors?.length > 0 && retryContext.errors.every(
    (error) => /baseline item|exactly once|runId does not match/i.test(error),
  );
  return [
    "Execute one read-only restaurant discovery and reconciliation scout job.",
    `Job: ${jobPath}`,
    `Required result destination is managed by the coordinator: ${resultPath}`,
    ...(retryContext ? [
      `This is correction attempt ${retryContext.attemptNumber}.`,
      ...(retryContext.priorResultPath ? [`Prior immutable result: ${retryContext.priorResultPath}`] : []),
      `Correct every prior validation error: ${retryContext.errors.join(" | ") || "none recorded"}`,
      `Correct every deterministic retry reason: ${retryContext.routeReasons.join(" | ") || "none recorded"}`,
      ...(structuralOnlyRetry ? [
        "This is a provenance/coverage-only correction. Use the prior immutable result as the base, preserve its research and evidence, and do not restart web research.",
        "The response is a full replacement object, never a sparse patch: copy every prior field and array, retain every prior itemCheckGroup, add or correct only the named auditItemKeys, and emit the complete corrected JSON object.",
        "A response containing only the corrected itemCheckGroups is invalid.",
      ] : []),
      "Do not merely summarize corrections: emit every frozen auditItemKey exactly once, define every referenced currentProductKey in currentProducts, and make every surface/product reference resolve.",
      "If a surface references a currentProductKey you cannot define from evidence, remove that dangling reference and mark the affected surface fullyEnumerated=false with scopeStatus=partial; Terra will independently complete the scope. Never invent allergen data to satisfy a reference.",
    ] : []),
    "Read AGENTS.md and the verification plan named in the job before researching.",
    "Inventory every current food and nonalcoholic menu surface linked by the official homepage, including service-period PDFs, images, ordering vendors, pagination, and location-specific menus.",
    "Enumerate the complete current product catalog across those surfaces, consolidate duplicate presentations explicitly, and map each candidate product to its source surfaces and evidence.",
    "For every current product and every frozen-item group, state the adjudicated contains/may-contain arrays, allergen source type, authority tier, and allergen-specific evidence IDs; use unavailable rather than inferred negatives when disclosure is incomplete.",
    "Read the entire frozen item-check file and reconcile every auditItemKey exactly once.",
    "Group auditItemKeys that share the same disposition, allergen verdict, and evidence IDs; put shared explanations in findings.",
    "Use current public web evidence, prefer restaurant-issued sources, and preserve source authority labels.",
    "Apply source semantics precisely: incomplete restaurant-issued menu descriptions cannot establish allergen absence, complete arrays, or cross-contact status, but explicit positive ingredients and unavoidable named food identities can support narrow positive restaurant-issued ingredient evidence.",
    "Keep culinary formulation assumptions and inferred ingredients separate from direct source-backed positives; never erase an explicit positive merely because the source is not a complete allergen matrix.",
    "Treat your outcome as a candidate only. Never claim that a restaurant is terminally verified or blocked; every valid scout is independently checked by Terra.",
    "Do not edit files, mutate the ledger, or repair data.",
    "Return only the JSON object required by the output schema.",
  ].join("\n");
}

function terraPrompt({ verifierPacketPath, resultPath, retryContext = null }) {
  return [
    "Independently verify one Luna restaurant scout in read-only mode.",
    `Verifier packet: ${verifierPacketPath}`,
    `Required result destination is managed by the coordinator: ${resultPath}`,
    ...(retryContext ? [
      `This is correction attempt ${retryContext.attemptNumber}.`,
      ...(retryContext.priorResultPath ? [`Prior immutable Terra result: ${retryContext.priorResultPath}`] : []),
      `Correct every prior validation error: ${retryContext.errors.join(" | ") || "none recorded"}`,
      `Preserve and reconsider prior warnings: ${retryContext.warnings.join(" | ") || "none recorded"}`,
      `Correct every deterministic retry reason: ${retryContext.routeReasons.join(" | ") || "none recorded"}`,
      "Use the scout's exact currentProductKeys and presentationIds in verification groups; put genuinely new discoveries only in additionalCurrentProducts. Verify every scout surface, product, presentation, risk gate, and frozen auditItemKey exactly once.",
    ] : []),
    "Read AGENTS.md and the verification plan before researching.",
    "Re-open the strongest primary sources. Verify every scout menu surface and every scout current product exactly once, and report any additional surfaces or products Luna missed.",
    "Independently enumerate every scout presentation ID and re-state each checked product group's contains/may-contain arrays, allergen source type, authority tier, and allergen-specific evidence IDs.",
    "Review every deterministic risk gate in the packet. Do not clear a gate based on Luna confidence or summary prose.",
    "Read the full frozen item file and reconcile every auditItemKey exactly once, checking menu scope, allergen source authority, cross-contact semantics, and extraction behavior.",
    "Incomplete menus cannot support negatives, complete arrays, or cross-contact conclusions. Explicit restaurant-issued positives and unavoidable named identities may support narrow positive ingredient evidence.",
    "Preserve linked-vendor and third-party authority; never promote them to restaurant-issued evidence.",
    "Do not edit files, mutate the ledger, implement repairs, or mark a terminal state.",
    "Return only the JSON object required by the output schema.",
  ].join("\n");
}

function solPrompt({ reviewPacketPath }) {
  return [
    "Adjudicate one escalated restaurant verification result in read-only mode.",
    `Compact escalation packet: ${reviewPacketPath}`,
    "Read the effectiveOutcome from the packet and report it as verifierOutcome.",
    "Start with the packet's affected baseline items and reconciliation counts.",
    "Open the full worker result or frozen item file only if a specific unresolved question requires it.",
    "Re-open the strongest primary sources and challenge both the Terra verification and the upstream deterministic risk gates.",
    "Enforce the evidence distinction: an incomplete menu cannot support negatives, a complete allergen array, or cross-contact conclusions, while explicit restaurant-issued positive ingredients and unavoidable named identities may still support narrow positive ingredient evidence.",
    "Reject both over-promotion of culinary assumptions and over-correction that erases valid explicit positives.",
    "Do not edit files, mutate the ledger, implement repairs, or mark codex_verified.",
    "Return only the JSON object required by the output schema.",
  ].join("\n");
}

export async function createSolReviewPacket({ jobPath, terraResultPath, routePath }) {
  const [job, result, route] = await Promise.all([
    readJson(jobPath),
    readJson(terraResultPath),
    readJson(routePath),
  ]);
  const baselineItems = await readJsonLines(path.resolve(repositoryRoot, job.inputs.itemChecksPath));
  const affectedKeys = new Set((result.findings ?? []).flatMap((finding) => finding.affectedAuditItemKeys ?? []));
  const affectedBaselineItems = baselineItems
    .filter((item) => affectedKeys.has(item.auditItemKey))
    .map((item) => ({ auditItemKey: item.auditItemKey, baseline: item.baseline }));
  const sampleBaselineItems = affectedBaselineItems.length === 0
    ? baselineItems.slice(0, 20).map((item) => ({ auditItemKey: item.auditItemKey, baseline: item.baseline }))
    : [];

  return {
    schemaVersion: workerWorkflowSchemaVersion,
    runId: job.runId,
    restaurant: job.restaurant,
    effectiveOutcome: route.effectiveOutcome,
    routingReasons: route.reasons,
    validationWarnings: route.validation?.warnings ?? [],
    deterministicRisk: route.deterministicRisk ?? null,
    verifier: {
      model: result.model,
      outcome: result.outcome,
      confidence: result.confidence,
      identity: result.identity,
      sources: result.sources,
      sourceAttempts: result.sourceAttempts,
      reviewedRiskGates: result.reviewedRiskGates,
      surfaceChecks: result.surfaceChecks,
      currentProductCheckGroups: result.currentProductCheckGroups,
      additionalMenuSurfaces: result.additionalMenuSurfaces,
      additionalCurrentProducts: result.additionalCurrentProducts,
      reconciliationSummary: summarizeReconciliation(result),
      findings: result.findings,
      summary: result.summary,
      coordinatorNotes: result.coordinatorNotes,
    },
    affectedBaselineItems,
    sampleBaselineItems,
    fullInputs: {
      workerJobPath: path.relative(repositoryRoot, jobPath),
      verifierResultPath: path.relative(repositoryRoot, terraResultPath),
      frozenItemChecksPath: job.inputs.itemChecksPath,
    },
  };
}

function summarizeReconciliation(result) {
  const counts = {};
  const groups = result.itemCheckGroups ?? (result.itemChecks ?? []).map((item) => ({
    auditItemKeys: [item.auditItemKey],
    disposition: item.disposition,
    allergenVerdict: item.allergenVerdict,
    sourceEvidenceIds: item.sourceEvidenceIds,
  }));
  for (const group of groups) {
    const key = `${group.disposition}/${group.allergenVerdict}`;
    counts[key] = (counts[key] ?? 0) + (group.auditItemKeys?.length ?? 0);
  }
  return {
    reconciledItemCount: groups.reduce((total, group) => total + (group.auditItemKeys?.length ?? 0), 0),
    counts,
  };
}

function collectEvidenceReferences(result) {
  return [
    ...(result.identity?.sourceEvidenceIds ?? []),
    ...(result.itemChecks ?? []).flatMap((item) => item.sourceEvidenceIds ?? []),
    ...(result.itemCheckGroups ?? []).flatMap((group) => group.sourceEvidenceIds ?? []),
    ...(result.itemCheckGroups ?? []).flatMap((group) => group.allergenSourceEvidenceIds ?? []),
    ...(result.currentProducts ?? []).flatMap((product) => product.allergenSourceEvidenceIds ?? []),
    ...(result.additionalCurrentProducts ?? []).flatMap((product) => product.allergenSourceEvidenceIds ?? []),
    ...(result.findings ?? []).flatMap((finding) => finding.sourceEvidenceIds ?? []),
  ];
}

async function reservedRestaurantIds(workflowRoot) {
  const entries = await readdir(workflowRoot, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const reserved = new Set();
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const manifestPath = path.join(workflowRoot, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = await readJson(manifestPath);
    if (activeRunStatuses.has(manifest.status)) {
      for (const job of manifest.jobs ?? []) reserved.add(job.restaurantId);
    }
  }
  return reserved;
}

async function withCoordinatorLock(root, action) {
  const paths = workerPaths(root);
  await mkdir(paths.workflowRoot, { recursive: true });
  let lock;
  try {
    lock = await open(paths.lock, "wx");
    await lock.writeFile(`${process.pid}\n`);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Another restaurant worker coordinator is active.");
    throw error;
  }
  try {
    return await action();
  } finally {
    await lock.close();
    await rm(paths.lock, { force: true });
  }
}

async function mapConcurrent(values, concurrency, mapper, { stopWhen } = {}) {
  const results = new Array(values.length);
  let nextIndex = 0;
  let stopped = false;
  async function worker() {
    while (!stopped && nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
      if (stopWhen?.(results[index])) stopped = true;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results.filter(Boolean);
}

function createRunId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
}

function candidateSummary(row) {
  return {
    restaurantId: row.restaurantId,
    name: row.name,
    baselineItemCount: row.baseline.itemCount,
    baselineItemFingerprint: row.baseline.itemFingerprint,
  };
}

function requireRunId(runId) {
  if (!runId) throw new Error("A --run=<runId> argument is required.");
  assertSafeRunId(runId);
  return runId;
}

function assertSafeRunId(runId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) throw new Error(`Unsafe run id: ${runId}`);
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
}

function assertConcurrency(value) {
  assertPositiveInteger(value, "concurrency");
  if (value > maximumConcurrency) throw new Error(`concurrency cannot exceed ${maximumConcurrency}.`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonLines(filePath) {
  const value = await readFile(filePath, "utf8");
  return value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function parseArguments(argv) {
  const [command = "status", ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const equals = token.indexOf("=");
    if (equals >= 0) {
      options[token.slice(2, equals)] = token.slice(equals + 1);
    } else if (tokens[index + 1] && !tokens[index + 1].startsWith("--")) {
      options[token.slice(2)] = tokens[++index];
    } else {
      options[token.slice(2)] = true;
    }
  }
  return { command, options };
}

function numericOption(options, key, fallback) {
  if (options[key] === undefined) return fallback;
  const value = Number(options[key]);
  if (!Number.isInteger(value)) throw new Error(`--${key} must be an integer.`);
  return value;
}

async function runCli() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const root = options.root ?? defaultVerificationRoot;
  const limit = numericOption(options, "limit", 3);
  const scoutConcurrency = numericOption(
    options,
    "scout-concurrency",
    numericOption(options, "concurrency", defaultConcurrency),
  );
  const verifierConcurrency = numericOption(options, "verifier-concurrency", defaultConcurrency);
  const reviewConcurrency = numericOption(options, "review-concurrency", 1);
  const timeoutSeconds = numericOption(options, "timeout-seconds", 1800);

  if (command === "plan") {
    console.log(JSON.stringify(await createWorkerRun({ root, limit, runId: options.run, dryRun: Boolean(options["dry-run"]) }), null, 2));
    return;
  }
  if (command === "scout" || command === "run") {
    let runId = options.run;
    if (!runId) runId = (await createWorkerRun({ root, limit })).runId;
    console.log(JSON.stringify(await runLunaScouts({ root, runId, concurrency: scoutConcurrency, timeoutSeconds }), null, 2));
    return;
  }
  if (command === "route") {
    const runId = requireRunId(options.run);
    const manifest = await readJson(runPaths(root, runId).manifest);
    const hasScoutResults = manifest.jobs.some((job) =>
      ["luna_result_ready", "awaiting_luna_retry"].includes(job.status));
    console.log(JSON.stringify(hasScoutResults
      ? await routeScoutRun({ root, runId })
      : await routeWorkerRun({ root, runId }), null, 2));
    return;
  }
  if (command === "verify") {
    console.log(JSON.stringify(await runTerraWorkers({
      root,
      runId: options.run,
      concurrency: verifierConcurrency,
      timeoutSeconds,
    }), null, 2));
    return;
  }
  if (command === "review") {
    console.log(JSON.stringify(await runSolReviews({ root, runId: options.run, concurrency: reviewConcurrency, timeoutSeconds }), null, 2));
    return;
  }
  if (command === "pipeline" || command === "pilot") {
    if (options["allow-legacy-three-tier"] !== true) {
      throw new Error(
        "The mandatory Luna -> Terra -> Sol workflow is retired for the POC. Follow docs/restaurant-verification-plan.md or pass --allow-legacy-three-tier explicitly.",
      );
    }
    const effectiveLimit = command === "pilot" ? 10 : limit;
    const planned = await createWorkerRun({ root, limit: effectiveLimit, runId: options.run });
    await runLunaScouts({ root, runId: planned.runId, concurrency: scoutConcurrency, timeoutSeconds });
    await runTerraWorkers({ root, runId: planned.runId, concurrency: verifierConcurrency, timeoutSeconds });
    console.log(JSON.stringify(await runSolReviews({ root, runId: planned.runId, concurrency: reviewConcurrency, timeoutSeconds }), null, 2));
    return;
  }
  if (command === "release") {
    console.log(JSON.stringify(await releaseWorkerRun({ root, runId: options.run }), null, 2));
    return;
  }
  if (command === "requeue-scout") {
    if (!options.id) throw new Error("A --id=<restaurantId> argument is required.");
    console.log(JSON.stringify(await requeueLunaScout({
      root,
      runId: options.run,
      restaurantId: options.id,
      reason: options.reason,
    }), null, 2));
    return;
  }
  if (command === "status") {
    const runs = await listWorkerRuns({ root });
    console.log(JSON.stringify(runs.map((run) => ({
      runId: run.runId,
      status: run.status,
      createdAt: run.createdAt,
      jobs: run.jobs.map((job) => ({ restaurantId: job.restaurantId, name: job.name, status: job.status })),
    })), null, 2));
    return;
  }
  throw new Error(`Unknown worker command: ${command}`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  runCli().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
