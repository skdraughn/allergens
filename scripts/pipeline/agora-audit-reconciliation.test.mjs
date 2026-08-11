import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAgoraBaselineItems } from "./agora-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/agora-dc.jsonl", "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const snapshot = JSON.parse(await readFile("data/restaurant-verification/repairs/agora-dc/corrected-menu.json", "utf8"));

test("reconciles all frozen Agora rows", () => {
  const result = reconcileAgoraBaselineItems(baseline, snapshot);
  assert.equal(result.itemChecks.length, 63);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending" && row.allergenVerdict !== "pending"));
  assert.equal(result.itemChecks.filter((row) => row.disposition === "artifact").length, 10);
  assert.equal(result.itemChecks.filter((row) => row.disposition === "stale_extra").length, 5);
});

test("identifies column shifts and corrected sentinels", () => {
  const result = reconcileAgoraBaselineItems(baseline, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("for-the-table").disposition, "artifact");
  assert.equal(byId.get("chicken-thighs-yogurt-sauce").disposition, "artifact");
  assert.equal(byId.get("cilbir").disposition, "stale_extra");
  assert.equal(byId.get("agora-fries").allergenVerdict, "mismatch");
  assert.equal(byId.get("falafel").allergenVerdict, "mismatch");
  assert.equal(byId.get("mixed-green-salad").allergenVerdict, "mismatch");
});
