import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAdasRiverBaselineItems } from "./adas-river-audit-reconciliation.mjs";

const restaurantId = "ada-s-on-the-river-alexandria-va-dc-metro";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen Ada's row", () => {
  const result = reconcileAdasRiverBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 49);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(result.counts.dispositions.stale_extra, 3);
  assert.equal(result.counts.dispositions.artifact, 1);
  assert.equal(result.counts.allergens.not_applicable, 4);
});

test("identifies stale kids rows, the modifier artifact, and shifted allergen output", () => {
  const result = reconcileAdasRiverBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("house-steak-sauce").disposition, "artifact");
  assert.equal(byId.get("kids-chicken-sandwich").disposition, "stale_extra");
  assert.equal(byId.get("coal-roasted-asparagus").allergenVerdict, "mismatch");
  assert.equal(byId.get("smoked-ricotta-gnocchi").allergenVerdict, "mismatch");
  assert.equal(byId.get("peanut-butter-smores-cake").allergenVerdict, "mismatch");
});
