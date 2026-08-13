import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verificationRoot = path.join(root, "data/restaurant-verification");
const allocationsRoot = path.join(verificationRoot, "allocations");
const runsRoot = path.join(verificationRoot, "distributed-runs");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const portablePath = (file) => String(file).replaceAll("\\", "/");
const run = (script, args) => execFileSync(process.execPath, [path.join(root, "scripts", script), ...args], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

function ledgerById() {
  return new Map(readFileSync(path.join(verificationRoot, "ledger.jsonl"), "utf8")
    .split(/\r?\n/).filter(Boolean).map(JSON.parse).map((row) => [row.restaurantId, row]));
}

const allocationFiles = readdirSync(allocationsRoot)
  .filter((name) => /^machine-[ab]-(?:front|back)(?:-\d+)?\.json$/.test(name))
  .sort();
const allocated = new Map();
for (const name of allocationFiles) {
  const allocation = readJson(path.join(allocationsRoot, name));
  for (const entry of allocation.entries ?? []) allocated.set(entry.restaurantId, entry);
}

const manifests = new Map();
for (const name of readdirSync(runsRoot)) {
  const manifestPath = path.join(runsRoot, name, "manifest.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  for (const job of manifest.jobs ?? []) {
    if (job.status === "awaiting_serialized_apply" && job.finalResultPath) {
      manifests.set(job.restaurantId, { runRoot: path.dirname(manifestPath), runId: manifest.runId, job });
    }
  }
}

const initialLedger = ledgerById();
const candidates = [...allocated.keys()]
  .map((id) => initialLedger.get(id))
  .filter((row) => ["pending", "in_progress"].includes(row?.status) && manifests.has(row.restaurantId))
  .sort((a, b) => a.rank - b.rank);
const missing = [...allocated.keys()].filter((id) => initialLedger.get(id)?.status === "pending" && !manifests.has(id));

console.log(JSON.stringify({ allocated: allocated.size, candidates: candidates.length, missingBundles: missing.length }));
let completed = 0;
const failures = [];
for (const row of candidates) {
  const id = row.restaurantId;
  const { runRoot, runId, job } = manifests.get(id);
  const jobPath = path.join(runRoot, portablePath(job.jobPath));
  const resultPath = path.join(runRoot, portablePath(job.resultPath));
  const finalResultPath = path.join(runRoot, portablePath(job.finalResultPath));
  const applyPath = path.join(runRoot, "apply-results", `${id}.json`);
  const dossierPath = path.join(verificationRoot, "restaurants", `${id}.json`);
  const evidencePath = path.join(verificationRoot, "evidence", `${id}.json`);
  const checksPath = path.join(verificationRoot, "item-checks", `${id}.jsonl`);
  const closeoutPath = path.join(runRoot, `${id}.closeout.json`);
  const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");

  try {
    copyFileSync(finalResultPath, resultPath);
    run("restaurant-verification-poc-result.mjs", [jobPath, resultPath]);
    run("apply-batch40-poc.mjs", [runId, id]);
    const first = [generatedPath, dossierPath, evidencePath, applyPath].map(sha256);
    run("apply-batch40-poc.mjs", [runId, id]);
    const second = [generatedPath, dossierPath, evidencePath, applyPath].map(sha256);
    if (first.some((hash, index) => hash !== second[index])) throw new Error("second APPLY was not byte-identical");
    run("restaurant-verification-poc-closeout.mjs", [
      "--job", jobPath, "--result", resultPath, "--apply", applyPath,
      "--dossier", dossierPath, "--evidence", evidencePath,
      "--itemChecks", checksPath, "--output", closeoutPath,
    ]);
    if (ledgerById().get(id)?.status === "pending") {
      run("restaurant-verification-ledger.mjs", ["claim", `--id=${id}`]);
    }
    run("restaurant-verification-ledger.mjs", ["record", `--id=${id}`, `--input=${closeoutPath}`]);
    run("restaurant-verification-ledger.mjs", ["complete", `--id=${id}`, "--status=codex_verified"]);
    completed += 1;
    console.log(`[${completed}/${candidates.length}] completed ${id} (${runId})`);
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    const message = stderr || error.message;
    failures.push({ restaurantId: id, runId, message: message.split("\n")[0] });
    console.error(`FAILED ${id} (${runId}): ${message}`);
  }
}

const finalLedger = ledgerById();
const summary = {};
for (const row of finalLedger.values()) summary[row.status] = (summary[row.status] ?? 0) + 1;
console.log(JSON.stringify({ completedThisRun: completed, failures, missingBundleIds: missing, ledger: summary }, null, 2));
run("restaurant-verification-ledger.mjs", ["validate"]);
if (failures.length) process.exitCode = 2;
