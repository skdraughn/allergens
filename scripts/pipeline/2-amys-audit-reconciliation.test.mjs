import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileTwoAmysBaselineItems } from "./2-amys-audit-reconciliation.mjs";

const restaurantId = "2-amys-washington-dc-dc-metro";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen 2 Amys row", () => {
  const result = reconcileTwoAmysBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 130);
  assert.deepEqual(result.counts.dispositions, {
    stale_extra: 122,
    exact_match: 5,
    variant_match: 2,
    artifact: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 123,
    verified: 5,
    mismatch: 1,
    accurately_unavailable: 1,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("distinguishes current, renamed, stale, and placeholder rows", () => {
  const result = reconcileTwoAmysBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("bread").disposition, "exact_match");
  assert.equal(byId.get("pio-tosini").disposition, "variant_match");
  assert.equal(byId.get("carmen-peppers-and-anchovies").allergenVerdict, "mismatch");
  assert.equal(byId.get("38oz-ribeye").disposition, "stale_extra");
  assert.equal(byId.get("your-custom-text-here").disposition, "artifact");
});
