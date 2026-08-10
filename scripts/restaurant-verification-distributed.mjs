#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const verificationRoot = path.join(repositoryRoot, "data/restaurant-verification");
const defaultAllocationRoot = path.join(verificationRoot, "allocations");
const defaultRunRoot = path.join(verificationRoot, "distributed-runs");
const defaultImportRoot = path.join(verificationRoot, "distributed-imports");
export const maximumDistributedWorkers = 5;

export async function createAllocation({
  direction,
  count,
  machineId,
  outputPath,
  now = new Date().toISOString(),
  root = verificationRoot,
} = {}) {
  if (!["front", "back"].includes(direction)) throw new Error("direction must be front or back.");
  assertPositiveInteger(count, "count");
  assertSafe(machineId, "machineId");
  const ledgerPath = path.join(root, "ledger.jsonl");
  const manifestPath = path.join(root, "manifest.json");
  const [ledgerBytes, manifestBytes] = await Promise.all([readFile(ledgerPath), readFile(manifestPath)]);
  const rows = parseJsonLines(ledgerBytes.toString("utf8"));
  const pending = rows.filter((row) => row.status === "pending");
  const ordered = direction === "back" ? [...pending].reverse() : pending;
  if (ordered.length < count) throw new Error(`Only ${ordered.length} pending rows are available.`);
  const allocation = {
    schemaVersion: 1,
    kind: "restaurant_verification_distributed_allocation",
    allocationId: `${machineId}-${direction}-${now.replace(/[^0-9]/g, "").slice(0, 14)}`,
    machineId,
    direction,
    createdAt: now,
    base: {
      ledgerSha256: sha256(ledgerBytes),
      verificationManifestSha256: sha256(manifestBytes),
      restaurantCount: rows.length,
    },
    entries: ordered.slice(0, count).map((row, index) => ({
      ordinal: index + 1,
      restaurantId: row.restaurantId,
      name: row.name,
      domain: row.domain ?? null,
      locationId: row.locationId ?? null,
      baselineItemCount: row.baseline.itemCount,
      baselineFingerprint: row.baseline.itemFingerprint,
      itemChecksPath: path.posix.join("data/restaurant-verification", row.paths.itemChecks),
      dossierPath: path.posix.join("data/restaurant-verification", row.paths.dossier),
      evidencePath: path.posix.join("data/restaurant-verification", row.paths.evidence),
      state: "allocated",
      runId: null,
    })),
  };
  allocation.allocationSha256 = allocationDigest(allocation);
  const destination = path.resolve(outputPath ?? path.join(defaultAllocationRoot, `${allocation.allocationId}.json`));
  await writeJson(destination, allocation);
  return { allocation, outputPath: destination };
}

export async function prepareResearchRun({
  allocationPath,
  workers = maximumDistributedWorkers,
  runId,
  now = new Date().toISOString(),
} = {}) {
  assertWorkerCount(workers);
  const allocation = await readAllocation(allocationPath);
  const selected = allocation.entries.filter((entry) => entry.state === "allocated").slice(0, workers);
  if (selected.length === 0) throw new Error("Allocation has no unstarted entries.");
  const effectiveRunId = runId ?? `distributed-${allocation.machineId}-${allocation.direction}-${now.replace(/[^0-9]/g, "").slice(0, 14)}`;
  assertSafe(effectiveRunId, "runId");
  const runRoot = path.join(defaultRunRoot, effectiveRunId);
  if (existsSync(runRoot)) throw new Error(`Distributed run already exists: ${effectiveRunId}`);
  await Promise.all([
    mkdir(path.join(runRoot, "jobs"), { recursive: true }),
    mkdir(path.join(runRoot, "results"), { recursive: true }),
    mkdir(path.join(runRoot, "logs"), { recursive: true }),
    mkdir(path.join(runRoot, "status"), { recursive: true }),
  ]);
  const jobs = [];
  for (const entry of selected) {
    await assertFrozenEntry(entry);
    const resultPath = path.join(runRoot, "results", `${entry.restaurantId}.json`);
    const job = {
      schemaVersion: 1,
      batchId: effectiveRunId,
      restaurantId: entry.restaurantId,
      name: entry.name,
      locationId: entry.locationId,
      domain: entry.domain,
      baselineItemCount: entry.baselineItemCount,
      baselineFingerprint: entry.baselineFingerprint,
      ledgerStatus: "pending",
      dossierPath: entry.dossierPath,
      evidencePath: entry.evidencePath,
      itemChecksPath: entry.itemChecksPath,
      resultPath: path.relative(repositoryRoot, resultPath),
      requiredMatrixSearches: ["official_site", "official_documents", "linked_vendor", "targeted_web_search"],
      distributedResearchOnly: true,
      allocationId: allocation.allocationId,
    };
    const jobPath = path.join(runRoot, "jobs", `${entry.restaurantId}.json`);
    await writeJson(jobPath, job);
    entry.state = "prepared";
    entry.runId = effectiveRunId;
    const statusPath = path.join(runRoot, "status", `${entry.restaurantId}.json`);
    await writeJson(statusPath, workerStatus(entry.restaurantId, "prepared", now));
    jobs.push({ restaurantId: entry.restaurantId, jobPath, resultPath, statusPath, status: "prepared" });
  }
  allocation.allocationSha256 = allocationDigest(allocation);
  await writeJson(path.resolve(allocationPath), allocation);
  const manifest = {
    schemaVersion: 1,
    kind: "restaurant_verification_distributed_research_run",
    runId: effectiveRunId,
    allocationId: allocation.allocationId,
    machineId: allocation.machineId,
    direction: allocation.direction,
    createdAt: now,
    updatedAt: now,
    status: "prepared",
    researchOnly: true,
    workers,
    jobs: jobs.map((job) => ({
      restaurantId: job.restaurantId,
      jobPath: path.relative(runRoot, job.jobPath),
      resultPath: path.relative(runRoot, job.resultPath),
      logPath: `logs/${job.restaurantId}.log`,
      statusPath: `status/${job.restaurantId}.json`,
      status: "prepared",
    })),
  };
  await writeJson(path.join(runRoot, "manifest.json"), manifest);
  return { runRoot, manifest, allocation, jobs };
}

export async function runResearch({ allocationPath, workers = maximumDistributedWorkers, timeoutSeconds = 3600, runId } = {}) {
  assertWorkerCount(workers);
  assertPositiveInteger(timeoutSeconds, "timeoutSeconds");
  const prepared = await prepareResearchRun({ allocationPath, workers, runId });
  const protectedBefore = await protectedHashes(prepared.jobs.map((job) => job.restaurantId));
  const manifestPath = path.join(prepared.runRoot, "manifest.json");
  const manifest = prepared.manifest;
  manifest.status = "running";
  manifest.updatedAt = new Date().toISOString();
  await writeJson(manifestPath, manifest);
  console.error(`[distributed] ${manifest.runId}: starting ${prepared.jobs.length} restaurant workers`);
  const reporter = startProgressReporter(prepared.runRoot, prepared.jobs);
  const executions = await mapConcurrent(prepared.jobs, workers, async (job) => {
    const logPath = path.join(prepared.runRoot, "logs", `${job.restaurantId}.log`);
    const startedAt = new Date().toISOString();
    await writeJson(job.statusPath, workerStatus(job.restaurantId, "researching", startedAt, { milestone: "worker_started" }));
    console.error(`[distributed] ${job.restaurantId}: worker started`);
    const prompt = researchPrompt({ jobPath: job.jobPath, resultPath: job.resultPath, statusPath: job.statusPath });
    const args = [
      "-a", "never", "--search", "exec", "--model", "gpt-5.6-luna",
      "-c", "model_reasoning_effort=low", "--sandbox", "workspace-write", "--ephemeral",
      "-C", repositoryRoot, prompt,
    ];
    const execution = await spawnCodex({ args, logPath, timeoutSeconds });
    const resultExists = existsSync(job.resultPath);
    const validation = resultExists ? await validateResult(job.jobPath, job.resultPath) : null;
    const quality = resultExists ? await assessResearchQuality(job.resultPath, validation) : null;
    const completedAt = new Date().toISOString();
    const status = execution.exitCode !== 0 || validation?.valid !== true ? "failed" :
      validation.route?.lane !== "verify" ? `needs_${validation.route?.lane ?? "review"}` :
      quality?.thoroughEnoughForNextLane !== true ? "needs_research_repair" : "ready_for_verification";
    await writeJson(job.statusPath, workerStatus(job.restaurantId, status, startedAt, {
      milestone: "coordinator_validated", completedAt,
      durationSeconds: Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000),
      exitCode: execution.exitCode, validation, quality,
    }));
    console.error(`[distributed] ${job.restaurantId}: ${status} (${validation?.currentProductCount ?? 0} products, ${validation?.sourceCount ?? 0} sources, route ${validation?.route?.lane ?? "unknown"})`);
    return { ...job, execution, resultExists, validation, quality, startedAt, completedAt, status };
  });
  clearInterval(reporter);
  const protectedAfter = await protectedHashes(prepared.jobs.map((job) => job.restaurantId));
  const protectedChanges = changedHashes(protectedBefore, protectedAfter);
  if (protectedChanges.length > 0) {
    throw new Error(`Research-only worker modified protected paths: ${protectedChanges.join(", ")}`);
  }
  for (const execution of executions) {
    const target = manifest.jobs.find((job) => job.restaurantId === execution.restaurantId);
    target.status = execution.status;
    target.startedAt = execution.startedAt;
    target.completedAt = execution.completedAt;
    target.durationSeconds = Math.round((Date.parse(execution.completedAt) - Date.parse(execution.startedAt)) / 1000);
    target.exitCode = execution.execution.exitCode;
    target.validation = execution.validation;
    target.quality = execution.quality;
  }
  manifest.summary = summarizeJobs(manifest.jobs);
  manifest.status = manifest.jobs.some((job) => job.status === "failed") ? "failed" :
    manifest.jobs.every((job) => job.status === "ready_for_verification") ? "completed" : "completed_with_followup";
  manifest.updatedAt = new Date().toISOString();
  await writeJson(manifestPath, manifest);
  const allocation = await readAllocation(allocationPath);
  for (const job of manifest.jobs) {
    const entry = allocation.entries.find((candidate) => candidate.restaurantId === job.restaurantId);
    if (entry) entry.state = job.status === "failed" ? "failed" : "completed";
  }
  allocation.allocationSha256 = allocationDigest(allocation);
  await writeJson(path.resolve(allocationPath), allocation);
  return { runRoot: prepared.runRoot, manifest };
}

export async function exportRun({ allocationPath, runId, outputPath } = {}) {
  const allocation = await readAllocation(allocationPath);
  assertSafe(runId, "runId");
  const sourceRoot = path.join(defaultRunRoot, runId);
  const manifest = await readJson(path.join(sourceRoot, "manifest.json"));
  if (!["completed", "completed_with_followup"].includes(manifest.status)) throw new Error("Only completed distributed runs can be exported.");
  if (manifest.allocationId !== allocation.allocationId) throw new Error("Run/allocation mismatch.");
  const destination = path.resolve(outputPath ?? path.join(repositoryRoot, "tmp", `${runId}-export`));
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(sourceRoot, path.join(destination, "run"), { recursive: true });
  await copyFile(path.resolve(allocationPath), path.join(destination, "allocation.json"));
  const files = await listFiles(destination);
  const receipt = {
    schemaVersion: 1,
    kind: "restaurant_verification_distributed_export",
    runId,
    allocationId: allocation.allocationId,
    createdAt: new Date().toISOString(),
    files: await Promise.all(files.map(async (file) => ({
      path: path.relative(destination, file),
      sha256: sha256(await readFile(file)),
    }))),
  };
  receipt.bundleSha256 = sha256(JSON.stringify(receipt.files));
  await writeJson(path.join(destination, "export-receipt.json"), receipt);
  return { outputPath: destination, receipt };
}

export async function importRun({ bundlePath, write = false } = {}) {
  const bundleRoot = path.resolve(bundlePath);
  const [allocation, receipt, manifest] = await Promise.all([
    readJson(path.join(bundleRoot, "allocation.json")),
    readJson(path.join(bundleRoot, "export-receipt.json")),
    readJson(path.join(bundleRoot, "run/manifest.json")),
  ]);
  if (allocation.allocationSha256 !== allocationDigest(allocation)) throw new Error("Allocation digest mismatch.");
  if (receipt.bundleSha256 !== sha256(JSON.stringify(receipt.files))) throw new Error("Bundle receipt digest mismatch.");
  for (const file of receipt.files) {
    const bytes = await readFile(path.join(bundleRoot, file.path));
    if (sha256(bytes) !== file.sha256) throw new Error(`Bundle file hash mismatch: ${file.path}`);
  }
  if (!["completed", "completed_with_followup"].includes(manifest.status) || manifest.researchOnly !== true) throw new Error("Bundle is not a completed research-only run.");
  const ledger = parseJsonLines((await readFile(path.join(verificationRoot, "ledger.jsonl"), "utf8")));
  const ledgerById = new Map(ledger.map((row) => [row.restaurantId, row]));
  const validations = [];
  for (const jobEntry of manifest.jobs) {
    const allocationEntry = allocation.entries.find((entry) => entry.restaurantId === jobEntry.restaurantId);
    const row = ledgerById.get(jobEntry.restaurantId);
    if (!allocationEntry || !row) throw new Error(`Unallocated restaurant in bundle: ${jobEntry.restaurantId}`);
    if (row.status !== "pending") throw new Error(`${jobEntry.restaurantId} is no longer pending (${row.status}).`);
    if (row.baseline.itemFingerprint !== allocationEntry.baselineFingerprint) throw new Error(`${jobEntry.restaurantId} baseline is stale.`);
    const jobPath = path.join(bundleRoot, "run", jobEntry.jobPath);
    const resultPath = path.join(bundleRoot, "run", jobEntry.resultPath);
    const validation = await validateResult(jobPath, resultPath);
    if (!validation.valid) throw new Error(`${jobEntry.restaurantId} result is invalid: ${(validation.errors ?? []).join("; ")}`);
    validations.push({ restaurantId: jobEntry.restaurantId, validation });
  }
  let importedPath = null;
  if (write) {
    importedPath = path.join(defaultImportRoot, manifest.runId);
    if (existsSync(importedPath)) throw new Error(`Distributed import already exists: ${manifest.runId}`);
    await mkdir(defaultImportRoot, { recursive: true });
    await cp(bundleRoot, importedPath, { recursive: true });
  }
  return { valid: true, write, importedPath, runId: manifest.runId, validations };
}

function researchPrompt({ jobPath, resultPath, statusPath }) {
  const status = path.relative(repositoryRoot, statusPath);
  return `You are one of five isolated Luna-low restaurant research workers. Read docs/restaurant-verification-plan.md completely, then read ${path.relative(repositoryRoot, jobPath)} and its entire itemChecksPath. Perform only POC Phase A research for that one restaurant: verify the exact baseline count/fingerprint, identity/location, every current food and nonalcoholic menu surface, complete current product boundary, all four official allergen searches, conservative direct allergen and cross-contact evidence, and reconcile every frozen audit key exactly once. Write a small JSON progress update to ${status} after each milestone: packet_validated, identity_verified, menu_surfaces_inventoried, matrix_search_completed, products_reconciled, and validator_passed. Each update must preserve restaurantId and startedAt and set updatedAt, status:"researching", milestone, and a concise details object with counts. Write the canonical schemaVersion 1 POC result to ${path.relative(repositoryRoot, resultPath)}. Run node scripts/restaurant-verification-poc-result.mjs ${path.relative(repositoryRoot, jobPath)} ${path.relative(repositoryRoot, resultPath)} and keep correcting only the isolated result until its JSON says valid:true. RESEARCH ONLY: do not modify the ledger, generated projection, canonical restaurants/evidence/item-checks, apply scripts, or any file outside the named result, named status file, and your process log.`;
}

export async function auditRun({ runId } = {}) {
  assertSafe(runId, "runId");
  const runRoot = path.join(defaultRunRoot, runId);
  const manifest = await readJson(path.join(runRoot, "manifest.json"));
  const jobs = [];
  for (const job of manifest.jobs) {
    const jobPath = path.join(runRoot, job.jobPath);
    const resultPath = path.join(runRoot, job.resultPath);
    const validation = existsSync(resultPath) ? await validateResult(jobPath, resultPath) : null;
    const quality = existsSync(resultPath) ? await assessResearchQuality(resultPath, validation) : null;
    jobs.push({ restaurantId: job.restaurantId, status: job.status, validation, quality });
  }
  return { runId, manifestStatus: manifest.status, summary: summarizeJobs(jobs.map((job) => ({ status: classifyValidatedJob(job.validation, job.quality) }))), jobs };
}

async function assessResearchQuality(resultPath, validation) {
  const result = await readJson(resultPath);
  const attempts = result.matrixSearch?.attempts ?? [];
  const weakAttempts = attempts.filter((attempt) =>
    !(attempt.queryOrLocation || attempt.query) ||
    (!(attempt.urls?.length) && !(attempt.sourceEvidenceIds?.length)));
  const warnings = [...(validation?.warnings ?? [])];
  if (attempts.length < 4) warnings.push(`Only ${attempts.length} matrix-search attempt records were supplied.`);
  if (weakAttempts.length) warnings.push(`${weakAttempts.length} matrix-search attempt(s) lack a query/location or inspectable URL/evidence reference.`);
  return {
    sourceCount: result.sources?.length ?? 0,
    menuSurfaceCount: result.menuSurfaces?.length ?? 0,
    matrixAttemptCount: attempts.length,
    inspectedUrlCount: attempts.flatMap((attempt) => attempt.urls ?? []).length,
    matrixEvidenceReferenceCount: attempts.flatMap((attempt) => attempt.sourceEvidenceIds ?? []).length,
    warnings,
    thoroughEnoughForNextLane: validation?.valid === true && attempts.length >= 4 && weakAttempts.length === 0,
  };
}

function classifyValidatedJob(validation, quality) {
  if (validation?.valid !== true) return "failed";
  if (validation.route?.lane !== "verify") return `needs_${validation.route?.lane ?? "review"}`;
  return quality?.thoroughEnoughForNextLane === true ? "ready_for_verification" : "needs_research_repair";
}

function workerStatus(restaurantId, status, startedAt, extra = {}) {
  return { schemaVersion: 1, restaurantId, status, startedAt, updatedAt: new Date().toISOString(), ...extra };
}

function summarizeJobs(jobs) {
  const counts = {};
  for (const job of jobs) counts[job.status] = (counts[job.status] ?? 0) + 1;
  return { total: jobs.length, counts };
}

function startProgressReporter(runRoot, jobs) {
  const last = new Map();
  return setInterval(async () => {
    for (const job of jobs) {
      try {
        const status = await readJson(job.statusPath);
        const logPath = path.join(runRoot, "logs", `${job.restaurantId}.log`);
        const logBytes = existsSync(logPath) ? (await stat(logPath)).size : 0;
        const signature = `${status.milestone}:${status.updatedAt}:${logBytes}`;
        if (last.get(job.restaurantId) !== signature) {
          last.set(job.restaurantId, signature);
          console.error(`[progress] ${job.restaurantId}: ${status.milestone ?? status.status}; log ${Math.round(logBytes / 1024)} KiB`);
        }
      } catch { /* The coordinator's final validation remains authoritative. */ }
    }
  }, 15_000);
}

async function validateResult(jobPath, resultPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDirectory, "restaurant-verification-poc-result.mjs"), jobPath, resultPath], { cwd: repositoryRoot });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", () => {
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(stderr || `Validator returned invalid JSON for ${resultPath}.`)); }
    });
  });
}

async function assertFrozenEntry(entry) {
  const checks = parseJsonLines(await readFile(path.join(repositoryRoot, entry.itemChecksPath), "utf8"));
  const fingerprint = sha256(JSON.stringify(checks.map((row) => row.baseline)));
  if (checks.length !== entry.baselineItemCount || fingerprint !== entry.baselineFingerprint) {
    throw new Error(`${entry.restaurantId} frozen packet does not match its allocation.`);
  }
}

async function protectedHashes(ids) {
  const paths = [
    path.join(verificationRoot, "ledger.jsonl"),
    path.join(repositoryRoot, "src/data/generated/restaurants.generated.json"),
    path.join(repositoryRoot, "scripts/apply-batch40-poc.mjs"),
    ...ids.flatMap((id) => [
      path.join(verificationRoot, "restaurants", `${id}.json`),
      path.join(verificationRoot, "evidence", `${id}.json`),
      path.join(verificationRoot, "item-checks", `${id}.jsonl`),
    ]),
  ];
  const result = {};
  for (const file of paths) result[file] = existsSync(file) ? sha256(await readFile(file)) : null;
  return result;
}

function changedHashes(before, after) {
  return Object.keys(before).filter((key) => before[key] !== after[key]);
}

async function spawnCodex({ args, logPath, timeoutSeconds }) {
  await mkdir(path.dirname(logPath), { recursive: true });
  return new Promise((resolve) => {
    const log = createWriteStream(logPath, { flags: "a" });
    const child = spawn("codex", args, { cwd: repositoryRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log); child.stderr.pipe(log);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutSeconds * 1000);
    child.once("error", (error) => { clearTimeout(timer); log.end(); resolve({ exitCode: -1, error: error.message }); });
    child.once("close", (code) => { clearTimeout(timer); log.end(); resolve({ exitCode: code ?? -1, error: timedOut ? "timeout" : null }); });
  });
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) { const index = next++; results[index] = await mapper(values[index], index); }
  }));
  return results;
}

async function readAllocation(file) {
  const allocation = await readJson(path.resolve(file));
  if (allocation.kind !== "restaurant_verification_distributed_allocation" || allocation.schemaVersion !== 1) throw new Error("Unsupported allocation file.");
  if (allocation.allocationSha256 !== allocationDigest(allocation)) throw new Error("Allocation digest mismatch.");
  return allocation;
}

function allocationDigest(allocation) {
  const copy = structuredClone(allocation); delete copy.allocationSha256;
  return sha256(JSON.stringify(copy));
}

async function listFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(target)); else if (entry.isFile()) files.push(target);
  }
  return files.sort();
}

async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }
async function writeJson(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }
function parseJsonLines(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertPositiveInteger(value, label) { if (!Number.isInteger(Number(value)) || Number(value) < 1) throw new Error(`${label} must be a positive integer.`); }
function assertWorkerCount(value) { assertPositiveInteger(value, "workers"); if (Number(value) > maximumDistributedWorkers) throw new Error(`workers cannot exceed ${maximumDistributedWorkers}.`); }
function assertSafe(value, label) { if (!/^[A-Za-z0-9._-]+$/.test(value ?? "")) throw new Error(`${label} contains unsafe characters.`); }

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv; const options = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]; if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const eq = token.indexOf("=");
    if (eq > 0) options[token.slice(2, eq)] = token.slice(eq + 1);
    else options[token.slice(2)] = tokens[i + 1] && !tokens[i + 1].startsWith("--") ? tokens[++i] : true;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const workers = Number(options.workers ?? maximumDistributedWorkers);
  if (command === "allocate") {
    console.log(JSON.stringify(await createAllocation({ direction: options.direction, count: Number(options.count ?? 100), machineId: options.machine, outputPath: options.output }), null, 2)); return;
  }
  if (command === "prepare") {
    console.log(JSON.stringify(await prepareResearchRun({ allocationPath: options.allocation, workers, runId: options.run }), null, 2)); return;
  }
  if (command === "run") {
    console.log(JSON.stringify(await runResearch({ allocationPath: options.allocation, workers, runId: options.run, timeoutSeconds: Number(options["timeout-seconds"] ?? 3600) }), null, 2)); return;
  }
  if (command === "start-back" || command === "start-front") {
    const direction = command === "start-back" ? "back" : "front";
    const output = path.resolve(options.allocation ?? path.join(defaultAllocationRoot, `${options.machine}-${direction}.json`));
    if (!existsSync(output)) await createAllocation({ direction, count: Number(options.count ?? 100), machineId: options.machine, outputPath: output });
    console.log(JSON.stringify(await runResearch({ allocationPath: output, workers, runId: options.run, timeoutSeconds: Number(options["timeout-seconds"] ?? 3600) }), null, 2)); return;
  }
  if (command === "export") {
    console.log(JSON.stringify(await exportRun({ allocationPath: options.allocation, runId: options.run, outputPath: options.output }), null, 2)); return;
  }
  if (command === "import" || command === "verify-import") {
    console.log(JSON.stringify(await importRun({ bundlePath: options.bundle, write: command === "import" }), null, 2)); return;
  }
  if (command === "audit" || command === "status") {
    console.log(JSON.stringify(await auditRun({ runId: options.run }), null, 2)); return;
  }
  console.log("Commands: allocate, prepare, run, start-front, start-back, audit, status, export, verify-import, import");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
