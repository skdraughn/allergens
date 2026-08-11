import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAllocation, maximumDistributedWorkers, nextFollowupAction, resolveCodexInvocation, workerSandboxForPlatform } from "./restaurant-verification-distributed.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "restaurant-distributed-"));
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "manifest.json"), '{"schemaVersion":1}\n');
  const rows = ["a", "b", "c", "d"].map((restaurantId, index) => ({
    restaurantId,
    name: restaurantId.toUpperCase(),
    domain: `${restaurantId}.example`,
    locationId: null,
    status: index === 1 ? "codex_verified" : "pending",
    baseline: { itemCount: index + 1, itemFingerprint: `fp-${restaurantId}` },
    paths: { itemChecks: `item-checks/${restaurantId}.jsonl`, dossier: `restaurants/${restaurantId}.json`, evidence: `evidence/${restaurantId}.json` },
  }));
  await writeFile(path.join(root, "ledger.jsonl"), `${rows.map(JSON.stringify).join("\n")}\n`);
  return root;
}

test("distributed allocations select explicit pending rows from either boundary", async () => {
  const root = await fixture();
  const frontPath = path.join(root, "front.json");
  const backPath = path.join(root, "back.json");
  const front = await createAllocation({ root, direction: "front", count: 2, machineId: "front-machine", outputPath: frontPath, now: "2026-08-10T00:00:00.000Z" });
  const back = await createAllocation({ root, direction: "back", count: 2, machineId: "back-machine", outputPath: backPath, now: "2026-08-10T00:00:00.000Z" });
  assert.deepEqual(front.allocation.entries.map((entry) => entry.restaurantId), ["a", "c"]);
  assert.deepEqual(back.allocation.entries.map((entry) => entry.restaurantId), ["d", "c"]);
  assert.equal(front.allocation.entries.every((entry) => entry.state === "allocated"), true);
  assert.equal(JSON.parse(await readFile(frontPath, "utf8")).allocationSha256, front.allocation.allocationSha256);
});

test("distributed allocations can skip previously researched pending rows", async () => {
  const root = await fixture();
  const outputPath = path.join(root, "back-next.json");
  const result = await createAllocation({ root, direction: "back", count: 1, skip: 2, machineId: "back-machine", outputPath, now: "2026-08-10T00:00:00.000Z" });
  assert.equal(result.allocation.selectionOffset, 2);
  assert.deepEqual(result.allocation.entries.map((entry) => entry.restaurantId), ["a"]);
  assert.equal(JSON.parse(await readFile(outputPath, "utf8")).allocationSha256, result.allocation.allocationSha256);
});

test("distributed worker ceiling reserves one six-slot coordinator position", () => {
  assert.equal(maximumDistributedWorkers, 5);
});

test("distributed workers launch the npm Codex entrypoint directly on Windows", () => {
  const args = ["exec", "prompt with & shell characters"];
  const invocation = resolveCodexInvocation(args, {
    platform: "win32",
    env: { PATH: "C:\\npm;C:\\other" },
    nodeExecutable: "C:\\node.exe",
    fileExists: (candidate) => candidate === path.join("C:\\npm", "node_modules", "@openai", "codex", "bin", "codex.js"),
  });
  assert.deepEqual(invocation, {
    command: "C:\\node.exe",
    args: [path.join("C:\\npm", "node_modules", "@openai", "codex", "bin", "codex.js"), ...args],
  });
});

test("distributed workers bypass a broken native sandbox only on Windows", () => {
  assert.equal(workerSandboxForPlatform("win32"), "danger-full-access");
  assert.equal(workerSandboxForPlatform("linux"), "workspace-write");
  assert.equal(workerSandboxForPlatform("darwin"), "workspace-write");
});

test("distributed followups continue every nonterminal research lane", () => {
  assert.equal(nextFollowupAction("ready_for_verification"), "handoff");
  assert.equal(nextFollowupAction("needs_luna_fix"), "luna");
  assert.equal(nextFollowupAction("needs_research_repair"), "luna");
  assert.equal(nextFollowupAction("needs_research_retry"), "luna");
  assert.equal(nextFollowupAction("needs_sol_review"), "sol");
  assert.equal(nextFollowupAction("blocked_sol_review"), "stop");
  assert.equal(nextFollowupAction("failed"), "stop");
});
