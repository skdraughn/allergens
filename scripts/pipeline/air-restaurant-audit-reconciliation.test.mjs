import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAirRestaurantAuditSnapshot } from "./air-restaurant-audit-catalog.mjs";
import { reconcileAirRestaurantBaselineItems } from "./air-restaurant-audit-reconciliation.mjs";

const restaurantId = "air-restaurant-washington-dc-dc-metro";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAirRestaurantBaselineItems(baseline, buildAirRestaurantAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }));

test("reconciles every frozen Air Restaurant row", () => {
  assert.equal(result.itemChecks.length, 30);
  assert.deepEqual(result.counts.dispositions, { artifact: 6, exact_match: 22, variant_match: 1, stale_extra: 1 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 7, mismatch: 10, accurately_unavailable: 12, verified: 1 });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 9, overreported: 1 });
});

test("handles promoted descriptions, alcohol, aliases, and key allergen corrections", () => {
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "A Low Country Classic").disposition, "artifact");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Mimosa Carafe").allergenVerdict, "not_applicable");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Chicken Wings").disposition, "variant_match");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Crab Cake").allergenVerdict, "verified");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Bowtie Pasta").allergenVerdict, "mismatch");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Blackened Salmon").allergenVerdict, "mismatch");
});
