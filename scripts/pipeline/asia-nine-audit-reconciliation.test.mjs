import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAsiaNineBaselineItems } from "./asia-nine-audit-reconciliation.mjs";

test("reconciles every frozen Asia Nine row and identifies omitted current products", async () => {
  const baselineChecks = (await readFile(
    new URL("../../data/restaurant-verification/item-checks/osm-asia-nine-1236156059.jsonl", import.meta.url),
    "utf8",
  )).trim().split(/\r?\n/).map(JSON.parse);
  const snapshot = JSON.parse(await readFile(
    new URL("../../data/restaurant-verification/repairs/osm-asia-nine-1236156059/corrected-menu.json", import.meta.url),
    "utf8",
  ));
  const result = reconcileAsiaNineBaselineItems(baselineChecks, snapshot);

  assert.deepEqual(result.counts.dispositions, {
    exact_match: 121,
    normalized_match: 5,
    artifact: 6,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 33,
    verified: 57,
    accurately_unavailable: 36,
    not_applicable: 6,
  });
  assert.equal(result.counts.current.itemCount, 161);
  assert.equal(result.counts.current.matchedItemCount, 126);
  assert.equal(result.counts.current.missingItemCount, 35);
  for (const id of [
    "edamame",
    "fried-calamari",
    "yellowtail-hamachi",
    "eel-avocado-roll-8pcs",
    "add-crunchy",
    "can-of-soda",
  ]) assert.ok(result.counts.current.missingItemIds.includes(id), id);

  const byName = new Map(result.itemChecks.map((item) => [item.baseline.name, item]));
  assert.equal(byName.get("Custom style").disposition, "artifact");
  assert.equal(byName.get("Crab Stick (Kani)").disposition, "normalized_match");
  assert.equal(byName.get("Crab Stick (Kani)").allergenVerdict, "mismatch");
  assert.equal(byName.get("Green Curry").allergenVerdict, "mismatch");
  assert.equal(byName.get("Wonton Soup").allergenVerdict, "mismatch");
  assert.equal(byName.get("Korean Sizzling Beef").allergenVerdict, "verified");
  assert.equal(byName.get("Brown Rice").allergenVerdict, "accurately_unavailable");
});
