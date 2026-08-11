import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAwakeningBaselineItems } from "./awakening-audit-reconciliation.mjs";

const restaurantId = "replacement-awakening-bar-and-grill-washington-dc";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = JSON.parse(snapshotText);

test("reconciles all frozen Awakening rows exactly once", () => {
  const result = reconcileAwakeningBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 48);
  assert.equal(new Set(result.itemChecks.map((row) => row.auditItemKey)).size, 48);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 42,
    variant_match: 1,
    artifact: 5,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 24,
    mismatch: 19,
    not_applicable: 5,
  });
});

test("separates the mixed service row and removes non-products", () => {
  const result = reconcileAwakeningBaselineItems(baselineChecks, snapshot);
  const byKey = new Map(result.itemChecks.map((row) => [row.auditItemKey, row]));
  assert.equal(byKey.get("15:chicken-and-waffles").disposition, "variant_match");
  assert.equal(byKey.get("15:chicken-and-waffles").allergenVerdict, "mismatch");
  assert.equal(byKey.get("28:we-are-hiring").disposition, "artifact");
  assert.equal(
    byKey.get("38:rich-bread-pudding-with-bourbon-glaze-whole-9in-pan").disposition,
    "artifact",
  );
  assert.match(
    byKey.get("38:rich-bread-pudding-with-bourbon-glaze-whole-9in-pan").notes,
    /Bourbon Bread Pudding/,
  );
});
