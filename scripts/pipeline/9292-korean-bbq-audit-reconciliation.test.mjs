import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcile9292BaselineItems } from "./9292-korean-bbq-audit-reconciliation.mjs";

const restaurantId = "replacement-9292-korean-bbq-annandale-va";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen 9292 row against the photographed menu", () => {
  const result = reconcile9292BaselineItems(baselineChecks, snapshot);

  assert.equal(result.itemChecks.length, 73);
  assert.deepEqual(result.counts.dispositions, {
    artifact: 20,
    exact_match: 41,
    stale_extra: 2,
    variant_match: 10,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 22,
    accurately_unavailable: 49,
    mismatch: 2,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("identifies listing artifacts and false official allergen coverage", () => {
  const result = reconcile9292BaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));

  assert.equal(byId.get("own-this-place").disposition, "artifact");
  assert.equal(byId.get("beef-prime-rib-eye-us").disposition, "artifact");
  assert.equal(
    byId.get("unlimited-9292-a-beef-bulgogi-per-person-us").disposition,
    "artifact",
  );
  assert.equal(byId.get("prime-filet-mignon").disposition, "stale_extra");
  assert.equal(byId.get("pork-short-ribs").disposition, "stale_extra");
  assert.equal(byId.get("grilled-squid").allergenVerdict, "mismatch");
  assert.equal(byId.get("soy-sauce-marinated-chicken").allergenVerdict, "mismatch");
});
