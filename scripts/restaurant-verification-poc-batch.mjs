import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claimRestaurant, terminalStatuses } from "./restaurant-verification-ledger.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verificationRoot = path.join(repositoryRoot, "data/restaurant-verification");
const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
const runDate = "2026-08-04";

async function readRows() {
  return (await readFile(ledgerPath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function runIdFor(batch) {
  if (!Number.isInteger(batch) || batch < 141 || batch > 160) throw new Error("Batch must be an integer from 141 through 160.");
  return `poc-batch-${String(batch).padStart(3, "0")}-${runDate}`;
}

async function assertPreviousComplete(batch, rows) {
  const previousPrefix = `poc-batch-${String(batch - 1).padStart(3, "0")}-`;
  const previousRunId = (await readdir(path.join(verificationRoot, "worker-runs")))
    .filter((name) => name.startsWith(previousPrefix))
    .sort()
    .at(-1);
  if (!previousRunId) throw new Error(`No completed run found for batch ${batch - 1}.`);
  const previousRoot = path.join(verificationRoot, "worker-runs", previousRunId);
  const manifest = JSON.parse(await readFile(path.join(previousRoot, "manifest.json"), "utf8"));
  if (manifest.status !== "completed" || manifest.jobs.length !== 3) throw new Error(`${previousRunId} is not completed.`);
  for (const job of manifest.jobs) {
    const row = rows.find((candidate) => candidate.restaurantId === job.restaurantId);
    if (!terminalStatuses.includes(row?.status)) throw new Error(`${job.restaurantId} is not terminal.`);
    await readFile(path.join(previousRoot, "results", `${job.restaurantId}.json`), "utf8");
    await readFile(path.join(previousRoot, `${job.restaurantId}.closeout.json`), "utf8");
  }
}

async function prepare(batch) {
  const runId = runIdFor(batch);
  let rows = await readRows();
  await assertPreviousComplete(batch, rows);
  if (rows.some((row) => row.status === "in_progress" || row.status === "repair_in_progress")) {
    throw new Error("A nonterminal claim already exists.");
  }
  const targets = rows.filter((row) => row.status === "pending").slice(0, 3);
  if (targets.length !== 3) throw new Error("Fewer than three pending rows remain.");
  const runRoot = path.join(verificationRoot, "worker-runs", runId);
  await mkdir(path.join(runRoot, "jobs"), { recursive: true });
  await mkdir(path.join(runRoot, "results"), { recursive: true });
  const now = new Date().toISOString();
  const jobs = [];
  for (const target of targets) {
    const claimed = await claimRestaurant({ restaurantId: target.restaurantId, root: verificationRoot });
    const row = claimed.row;
    const packet = {
      schemaVersion: 1,
      batchId: runId,
      restaurantId: row.restaurantId,
      name: row.name,
      locationId: row.locationId,
      domain: row.domain,
      baselineItemCount: row.baseline.itemCount,
      baselineFingerprint: row.baseline.itemFingerprint,
      ledgerStatus: "in_progress",
      dossierPath: `data/restaurant-verification/restaurants/${row.restaurantId}.json`,
      evidencePath: `data/restaurant-verification/evidence/${row.restaurantId}.json`,
      itemChecksPath: `data/restaurant-verification/item-checks/${row.restaurantId}.jsonl`,
      resultPath: `data/restaurant-verification/worker-runs/${runId}/results/${row.restaurantId}.json`,
      requiredMatrixSearches: ["official_site", "official_documents", "linked_vendor", "targeted_web_search"],
    };
    await writeFile(path.join(runRoot, "jobs", `${row.restaurantId}.json`), `${JSON.stringify(packet)}\n`);
    jobs.push({
      restaurantId: row.restaurantId,
      name: row.name,
      status: "claimed",
      agentId: `luna_${row.restaurantId.replace(/[^a-z0-9]+/g, "_")}`,
      jobPath: `jobs/${row.restaurantId}.json`,
      resultPath: `results/${row.restaurantId}.json`,
      applyAgentId: "coordinator",
      lunaAttempts: 1,
      completedAt: null,
    });
  }
  const manifest = {
    schemaVersion: 3,
    workflow: "safeplate_poc",
    runId,
    createdAt: now,
    updatedAt: now,
    status: "running",
    models: {
      worker: { id: "gpt-5.6-luna", reasoningEffort: "low" },
      reviewer: { id: "gpt-5.6-sol", reasoningEffort: "medium", onDemand: true },
    },
    concurrency: { luna: 3, terra: 0, sol: 0 },
    jobs,
  };
  await writeFile(path.join(runRoot, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  console.log(JSON.stringify({ runId, targets: jobs.map(({ restaurantId, name }) => ({ restaurantId, name })) }, null, 2));
}

async function complete(batch) {
  const runId = runIdFor(batch);
  const runRoot = path.join(verificationRoot, "worker-runs", runId);
  const manifestPath = path.join(runRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const rows = await readRows();
  for (const job of manifest.jobs) {
    const row = rows.find((candidate) => candidate.restaurantId === job.restaurantId);
    if (!terminalStatuses.includes(row?.status)) throw new Error(`${job.restaurantId} is not terminal.`);
    await readFile(path.join(runRoot, "results", `${job.restaurantId}.json`), "utf8");
    await readFile(path.join(runRoot, `${job.restaurantId}.closeout.json`), "utf8");
    job.status = "completed";
    job.completedAt = row.completedAt;
  }
  manifest.status = "completed";
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const files = await readdir(runRoot);
  console.log(JSON.stringify({ runId, status: manifest.status, closeouts: files.filter((name) => name.endsWith(".closeout.json")).length }));
}

const [command, rawBatch] = process.argv.slice(2);
const batch = Number(rawBatch);
if (command === "prepare") await prepare(batch);
else if (command === "complete") await complete(batch);
else throw new Error("Usage: node scripts/restaurant-verification-poc-batch.mjs prepare|complete N");
