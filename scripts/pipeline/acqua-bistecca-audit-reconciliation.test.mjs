import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAcquaBisteccaBaselineItems } from "./acqua-bistecca-audit-reconciliation.mjs";

const restaurantId = "acqua-bistecca-washington-dc-dc-metro";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen Acqua Bistecca row", () => {
  const result = reconcileAcquaBisteccaBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 25);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 18,
    variant_match: 4,
    stale_extra: 1,
    normalized_match: 2,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 12,
    mismatch: 12,
    not_applicable: 1,
  });
  assert.deepEqual(result.counts.mismatchKinds, {
    underreported: 11,
    overreported: 1,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("removes the stale salad, repairs shifted names, and corrects signal direction", () => {
  const result = reconcileAcquaBisteccaBaselineItems(baselineChecks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  assert.equal(byName.get("Green Salad").disposition, "stale_extra");
  assert.equal(byName.get("Asparagus").disposition, "variant_match");
  assert.equal(byName.get("Polenta and Meatballs").disposition, "variant_match");
  assert.equal(byName.get("Porcnin Butter Roasted Chicken").disposition, "variant_match");
  assert.equal(byName.get("Caviar Cannoli").allergenVerdict, "mismatch");
  assert.match(byName.get("Caviar Cannoli").notes, /fish, gluten, milk, wheat/);
  assert.equal(byName.get("Il Limone").allergenVerdict, "mismatch");
  assert.match(byName.get("Il Limone").notes, /Baseline contains: egg, gluten, wheat; current published signals: gluten, wheat/);
});
