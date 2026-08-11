import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAdyarBaselineItems } from "./adyar-audit-reconciliation.mjs";

const restaurantId = "osm-adyar-ananda-bhavan-638589103";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen Adyar row", () => {
  const result = reconcileAdyarBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 167);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    artifact: 23,
    variant_match: 22,
    exact_match: 121,
    stale_extra: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 24,
    mismatch: 57,
    verified: 32,
    accurately_unavailable: 54,
  });
  assert.deepEqual(result.counts.mismatchKinds, {
    overreported: 22,
    fixed_to_may_contain: 5,
    underreported: 30,
  });
});

test("identifies description fragments, stale Badhusha, and facility-scope errors", () => {
  const result = reconcileAdyarBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("accompaniments").disposition, "artifact");
  assert.equal(byId.get("deep-fried-sweet-dumplings-stewed-in-sugar-syrup").disposition, "artifact");
  assert.equal(byId.get("badhusha").disposition, "stale_extra");
  assert.equal(byId.get("athirasam").allergenVerdict, "mismatch");
  assert.equal(byId.get("cashewnut-halwa").allergenVerdict, "mismatch");
  assert.equal(byId.get("seedai").allergenVerdict, "mismatch");
});
