import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcile2FiftyBaselineItems } from "./2fifty-bbq-audit-reconciliation.mjs";

const restaurantId = "two-fifty-bbq-dc";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen 2Fifty row", () => {
  const result = reconcile2FiftyBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 62);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 49,
    variant_match: 4,
    stale_extra: 9,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 49,
    verified: 4,
    not_applicable: 9,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("captures the broad gluten smear and stale frozen rows", () => {
  const result = reconcile2FiftyBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));

  assert.equal(byId.get("1-lb-smoked-prime-brisket-chilled").allergenVerdict, "mismatch");
  assert.equal(byId.get("2-brisket-tamales").allergenVerdict, "mismatch");
  assert.equal(byId.get("beef-rub").allergenVerdict, "mismatch");
  assert.equal(byId.get("rice-and-beans").allergenVerdict, "mismatch");
  assert.equal(byId.get("chimichurri-sauce").allergenVerdict, "verified");
  assert.equal(byId.get("turkey").disposition, "variant_match");
  assert.equal(byId.get("4-slices-of-texas-toast").disposition, "stale_extra");
  assert.equal(byId.get("key-lime-pie").disposition, "stale_extra");
  assert.equal(byId.get("whole-chilled-wagyu-brisket").disposition, "stale_extra");
});
