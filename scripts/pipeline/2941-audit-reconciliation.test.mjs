import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcile2941BaselineItems } from "./2941-audit-reconciliation.mjs";

const restaurantId = "2941-restaurant-falls-church-va-dc-metro";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen 2941 row", () => {
  const result = reconcile2941BaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 25);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 22,
    variant_match: 2,
    stale_extra: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 22,
    accurately_unavailable: 2,
    not_applicable: 1,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("captures seasonal and allergen accuracy changes", () => {
  const result = reconcile2941BaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("appalachian-meadow-creek-virginia").disposition, "stale_extra");
  assert.equal(byId.get("creekstone-braised-beef-cheeks").disposition, "variant_match");
  assert.equal(byId.get("kaviari-ossetra-caviar").disposition, "variant_match");
  assert.equal(byId.get("american-wagyu-tartare").allergenVerdict, "mismatch");
  assert.equal(byId.get("asparagus-and-bacon").allergenVerdict, "accurately_unavailable");
});
