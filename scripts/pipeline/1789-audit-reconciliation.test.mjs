import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcile1789Baseline } from "./1789-audit-reconciliation.mjs";

test("1789 reconciliation adjudicates all 39 frozen rows", async () => {
  const itemChecks = (await readFile(
    "data/restaurant-verification/item-checks/restaurant-1789-dc.jsonl",
    "utf8",
  )).trim().split("\n").map(JSON.parse);
  const updates = await reconcile1789Baseline(itemChecks);
  const counts = (field) => Object.fromEntries(
    [...new Set(updates.map((update) => update[field]))]
      .map((value) => [value, updates.filter((update) => update[field] === value).length]),
  );

  assert.equal(updates.length, 39);
  assert.equal(new Set(updates.map((update) => update.auditItemKey)).size, 39);
  assert.deepEqual(counts("disposition"), {
    artifact: 4,
    exact_match: 30,
    stale_extra: 5,
  });
  assert.ok(counts("allergenVerdict").mismatch >= 10);
  assert.equal(updates.some((update) => update.allergenVerdict === "pending"), false);
});
