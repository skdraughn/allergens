import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAfghanBistroBaselineItems } from "./afghan-bistro-audit-reconciliation.mjs";

const restaurantId = "afghan-bistro-springfield-va-dc-metro";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen Afghan Bistro row", () => {
  const result = reconcileAfghanBistroBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 116);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 114,
    artifact: 2,
  });
  assert.deepEqual(result.counts.allergens, {
    accurately_unavailable: 45,
    verified: 43,
    mismatch: 26,
    not_applicable: 2,
  });
  assert.deepEqual(result.counts.mismatchKinds, {
    underreported: 26,
  });
});

test("identifies heading artifacts and missed published signals", () => {
  const result = reconcileAfghanBistroBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("chops-and-kabobs").disposition, "artifact");
  assert.equal(byId.get("soups-and-salads").disposition, "artifact");
  assert.equal(byId.get("bistro-salad").allergenVerdict, "mismatch");
  assert.equal(byId.get("mixed-green-salad").allergenVerdict, "mismatch");
  assert.equal(byId.get("cake").allergenVerdict, "mismatch");
});
