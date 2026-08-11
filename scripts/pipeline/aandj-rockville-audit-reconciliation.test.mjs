import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAandJRockvilleBaselineItems } from "./aandj-rockville-audit-reconciliation.mjs";

const restaurantId = "osm-aandj-s-northern-chinese-dim-sum-633639009";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen A&J Rockville row", () => {
  const result = reconcileAandJRockvilleBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 65);
  assert.deepEqual(result.counts.dispositions, {
    artifact: 1,
    exact_match: 61,
    normalized_match: 3,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 1,
    mismatch: 42,
    verified: 22,
  });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 42 });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("removes the press quote and restores omitted fixed signals", () => {
  const result = reconcileAandJRockvilleBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  assert.equal(byId.get("washington-postbest-dim-sum-dumplings-in-washington").disposition, "artifact");
  assert.equal(byName.get("擔擔麵 Dan Dan Mian**^^").allergenVerdict, "mismatch");
  assert.equal(byName.get("雞絲拉皮 Ji Si La Pi").allergenVerdict, "mismatch");
  assert.equal(byName.get("香菜豆干 Xiang Cai Dou Gan*^^").disposition, "normalized_match");
});
