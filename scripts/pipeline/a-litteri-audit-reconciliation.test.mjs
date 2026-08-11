import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileALitteriBaselineItems } from "./a-litteri-audit-reconciliation.mjs";

const restaurantId = "a-litteri-dc";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen A. Litteri row", () => {
  const result = reconcileALitteriBaselineItems(baselineChecks, snapshot);

  assert.equal(result.itemChecks.length, 18);
  assert.deepEqual(result.counts.dispositions, {
    stale_extra: 4,
    variant_match: 8,
    exact_match: 3,
    artifact: 3,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 7,
    verified: 6,
    mismatch: 5,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("identifies modifier artifacts, stale products, and changed allergen signals", () => {
  const result = reconcileALitteriBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));

  assert.equal(byId.get("cheese-limit-2").disposition, "artifact");
  assert.equal(byId.get("condiments").disposition, "artifact");
  assert.equal(byId.get("7-personal-pizza").disposition, "stale_extra");
  assert.equal(byId.get("traditional-platter").disposition, "stale_extra");
  assert.equal(byId.get("chicken-salad").allergenVerdict, "mismatch");
  assert.equal(byId.get("italian-sausage").allergenVerdict, "mismatch");
  assert.equal(byId.get("cookie-trays-any-size").allergenVerdict, "mismatch");
  assert.equal(byId.get("assortimente-platter").allergenVerdict, "verified");
});
