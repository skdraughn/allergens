import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcile1983BaselineItems } from "./1983-chinese-cuisine-audit-reconciliation.mjs";

const restaurantId = "osm-1983-chinese-cuisine-10746777097";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen row to a terminal item verdict", () => {
  const result = reconcile1983BaselineItems(baselineChecks, snapshot);

  assert.equal(result.itemChecks.length, 94);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 62,
    normalized_match: 31,
    artifact: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 23,
    accurately_unavailable: 53,
    verified: 17,
    not_applicable: 1,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("identifies the concrete user-facing baseline errors", () => {
  const result = reconcile1983BaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));

  assert.equal(byId.get("noodles-and-fried-rice").disposition, "artifact");
  assert.equal(byId.get("coconut-jelly-cake").allergenVerdict, "mismatch");
  assert.equal(byId.get("silk-stocking-milk-tea").allergenVerdict, "mismatch");
  assert.equal(byId.get("sliced-grouper-with-green-sichuan-peppercorn").allergenVerdict, "mismatch");
  assert.equal(byId.get("soy-sauce-yellow-croaker").allergenVerdict, "mismatch");
  assert.equal(byId.get("crispy-jumbo-shrimp-with-fried-garlic").allergenVerdict, "verified");
});
