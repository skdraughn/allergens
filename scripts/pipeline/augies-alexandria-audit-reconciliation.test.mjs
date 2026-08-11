import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAugiesAlexandriaBaselineItems } from
  "./augies-alexandria-audit-reconciliation.mjs";

const restaurantId = "augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen Augie's Alexandria row exactly once", () => {
  const result = reconcileAugiesAlexandriaBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 69);
  assert.equal(new Set(result.itemChecks.map((row) => row.auditItemKey)).size, 69);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    artifact: 6,
    exact_match: 43,
    normalized_match: 3,
    location_mismatch: 9,
    variant_match: 8,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 15,
    mismatch: 54,
  });
});

test("identifies source contamination, fragments, and consolidated presentations", () => {
  const result = reconcileAugiesAlexandriaBaselineItems(baselineChecks, snapshot);
  const byKey = new Map(result.itemChecks.map((row) => [row.auditItemKey, row]));
  assert.equal(byKey.get("1:smoked-salmon-and-spinach-2-steak-and-asparagus").disposition, "artifact");
  assert.equal(byKey.get("6:augies-burger").disposition, "location_mismatch");
  assert.equal(byKey.get("4:12oz-ribeye").disposition, "normalized_match");
  assert.equal(byKey.get("13:buffalo").disposition, "variant_match");
  assert.equal(byKey.get("47:steak-and-cheese-egg-rolls").disposition, "exact_match");
  assert.equal(byKey.get("66:steak-and-cheese-eggrolls").disposition, "variant_match");
  assert.equal(byKey.get("69:wings").disposition, "exact_match");
  assert.ok(result.itemChecks.filter((row) => row.allergenVerdict === "mismatch")
    .every((row) => row.notes.includes("gluten cross-contact warning")));
});
