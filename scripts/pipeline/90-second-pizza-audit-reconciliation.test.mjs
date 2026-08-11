import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcile90SecondPizzaBaselineItems } from "./90-second-pizza-audit-reconciliation.mjs";

const restaurantId = "ninety-second-pizza-georgetown-dc";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen 90 Second Pizza row", () => {
  const result = reconcile90SecondPizzaBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 23);
  assert.deepEqual(result.counts.dispositions, { exact_match: 20, variant_match: 3 });
  assert.deepEqual(result.counts.allergens, { mismatch: 23 });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("captures omitted cross-contact and current naming changes", () => {
  const result = reconcile90SecondPizzaBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));

  assert.equal(byId.get("margherita").allergenVerdict, "mismatch");
  assert.equal(byId.get("boscaiola-vegan").allergenVerdict, "mismatch");
  assert.equal(byId.get("pizza-dough").allergenVerdict, "mismatch");
  assert.equal(byId.get("double-chocolate-mousse").disposition, "variant_match");
  assert.equal(byId.get("tiramisu").disposition, "variant_match");
  assert.equal(byId.get("vegan-pizza").disposition, "variant_match");
});
