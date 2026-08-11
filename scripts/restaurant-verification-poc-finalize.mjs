import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [batchId, restaurantId, status = "codex_verified", reviewPath] = process.argv.slice(2);
if (!/^poc-batch-\d{3}-2026-08-(?:01|04)$/.test(batchId ?? "") || !/^[a-z0-9-]+$/.test(restaurantId ?? "")) {
  throw new Error("Usage: node scripts/restaurant-verification-poc-finalize.mjs RUN_ID RESTAURANT_ID [STATUS] [REVIEW_PATH]");
}

function run(script, args, { quiet = true } = {}) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${script} failed`);
  return result.stdout;
}

async function sha(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

const base = path.join(root, "data/restaurant-verification");
const runRoot = path.join(base, "worker-runs", batchId);
const files = [
  path.join(root, "src/data/generated/restaurants.generated.json"),
  path.join(base, "restaurants", `${restaurantId}.json`),
  path.join(base, "evidence", `${restaurantId}.json`),
  path.join(runRoot, "apply-results", `${restaurantId}.json`),
];

run("restaurant-verification-poc-result.mjs", [
  path.join(runRoot, "jobs", `${restaurantId}.json`),
  path.join(runRoot, "results", `${restaurantId}.json`),
]);
run("apply-batch40-poc.mjs", [batchId, restaurantId]);
const before = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await sha(file)])));
run("apply-batch40-poc.mjs", [batchId, restaurantId]);
for (const file of files) if (before[file] !== await sha(file)) throw new Error(`Non-idempotent apply: ${file}`);

const closeoutArgs = [
  "--job", path.join(runRoot, "jobs", `${restaurantId}.json`),
  "--result", path.join(runRoot, "results", `${restaurantId}.json`),
  "--apply", path.join(runRoot, "apply-results", `${restaurantId}.json`),
  "--dossier", path.join(base, "restaurants", `${restaurantId}.json`),
  "--evidence", path.join(base, "evidence", `${restaurantId}.json`),
  "--itemChecks", path.join(base, "item-checks", `${restaurantId}.jsonl`),
  "--output", path.join(runRoot, `${restaurantId}.closeout.json`),
];
if (reviewPath) closeoutArgs.push("--review", path.resolve(root, reviewPath));
run("restaurant-verification-poc-closeout.mjs", closeoutArgs);
run("restaurant-verification-ledger.mjs", ["record", `--id=${restaurantId}`, `--input=${path.join(runRoot, `${restaurantId}.closeout.json`)}`]);
run("restaurant-verification-ledger.mjs", ["complete", `--id=${restaurantId}`, `--status=${status}`]);
console.log(JSON.stringify({ batchId, restaurantId, status, idempotent: true }));
