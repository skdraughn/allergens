import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAfghanKabobBaselineItems } from "./afghan-kabob-audit-reconciliation.mjs";

const restaurantId = "osm-afghan-kabob-3359956639";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen Afghan Kabob row", () => {
  const result = reconcileAfghanKabobBaselineItems(baselineChecks, snapshot);
  assert.equal(result.itemChecks.length, 12);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    variant_match: 3,
    exact_match: 5,
    artifact: 4,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 4,
    accurately_unavailable: 1,
    not_applicable: 4,
    verified: 3,
  });
  assert.deepEqual(result.counts.mismatchKinds, {
    overreported: 2,
    underreported: 2,
  });
});

test("identifies fragments and corrected source-bounded signals", () => {
  const result = reconcileAfghanKabobBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("our-office").disposition, "artifact");
  assert.equal(byId.get("fried-eggplant-served-with-yogurt-and-afghan-tandoori-bread").disposition, "artifact");
  assert.equal(byId.get("aushak-app").allergenVerdict, "mismatch");
  assert.equal(byId.get("hummus").allergenVerdict, "mismatch");
  assert.equal(byId.get("mashawa-soup").allergenVerdict, "mismatch");
  assert.equal(byId.get("sambosay-goshtee").allergenVerdict, "verified");
});
