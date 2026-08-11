import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAuntieAnnesBaselineItems } from "./auntie-annes-audit-reconciliation.mjs";

const restaurantId = "auntie-annes";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen Auntie Anne's row exactly once", async () => {
  const result = await reconcileAuntieAnnesBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 37);
  assert.equal(new Set(result.itemChecks.map((row) => row.auditItemKey)).size, 37);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    variant_match: 16,
    exact_match: 3,
    stale_extra: 11,
    artifact: 5,
    normalized_match: 2,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 21,
    not_applicable: 16,
  });
});

test("distinguishes current variants from stale products and process artifacts", async () => {
  const result = await reconcileAuntieAnnesBaselineItems(baselineChecks, snapshot);
  const byKey = new Map(result.itemChecks.map((row) => [row.auditItemKey, row]));
  assert.equal(byKey.get("4:caramel").disposition, "exact_match");
  assert.equal(byKey.get("13:hot-salsa-cheese-sauce").disposition, "normalized_match");
  assert.equal(byKey.get("1:almond").disposition, "variant_match");
  assert.equal(byKey.get("8:clarified-butter").disposition, "artifact");
  assert.equal(byKey.get("5:cheddar-cheese-stuffed-nuggets").disposition, "stale_extra");
  assert.equal(byKey.get("9:coke-products").allergenVerdict, "mismatch");
  assert.match(byKey.get("9:coke-products").notes, /Coca-Cola/);
});
