import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  reconcile1310Baseline,
  reconciliationRuleCount1310,
} from "./1310-audit-reconciliation.mjs";

test("1310 reconciliation adjudicates every frozen baseline row", async () => {
  const checks = (await readFile(
    "data/restaurant-verification/item-checks/replacement-1310-kitchen-and-bar-washington-dc.jsonl",
    "utf8",
  ))
    .trim()
    .split("\n")
    .map(JSON.parse);
  const updates = reconcile1310Baseline(checks);

  assert.equal(reconciliationRuleCount1310, 87);
  assert.equal(updates.length, 87);
  assert.equal(updates.some((update) => update.disposition === "pending"), false);
  assert.equal(updates.some((update) => update.allergenVerdict === "pending"), false);
  assert.equal(new Set(updates.map((update) => update.auditItemKey)).size, 87);
  assert.ok(updates.filter((update) => update.disposition === "artifact").length >= 10);
  assert.ok(updates.filter((update) => update.disposition === "stale_extra").length >= 10);
  assert.ok(updates.filter((update) => update.allergenVerdict === "mismatch").length >= 15);
});
