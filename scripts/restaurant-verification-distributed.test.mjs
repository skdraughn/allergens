import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAllocation, maximumDistributedWorkers } from "./restaurant-verification-distributed.mjs";

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

test("distributed worker ceiling reserves one six-slot coordinator position", () => {
  assert.equal(maximumDistributedWorkers, 5);
});
