import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAllSetAuditSnapshot } from "./all-set-audit-catalog.mjs";
import { reconcileAllSetBaselineItems } from "./all-set-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/all-set-restaurant-and-bar-silver-spring-md-dc-metro.jsonl", "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAllSetBaselineItems(
  baseline,
  buildAllSetAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles all 101 frozen All Set rows", () => {
  assert.equal(result.itemChecks.length, 101);
  assert.deepEqual(result.counts.dispositions, { exact_match: 54, artifact: 13, variant_match: 34 });
  assert.deepEqual(result.counts.allergens, { mismatch: 37, not_applicable: 13, accurately_unavailable: 23, verified: 28 });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 27, overreported: 6, mixed: 4 });
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending" || candidate.allergenVerdict === "pending"), false);
});

test("removes nested modifiers and the truncated platter fragment", () => {
  for (const name of [
    "Blue Cheese & Ranch",
    "Extra Mussel Bread",
    "Extra Tempura Batter Fish Taco",
    "Extra Cotija Cheese",
    "Make it a platter with French Fries &",
  ]) {
    const check = result.itemChecks.find((candidate) => candidate.baseline.name === name);
    assert.equal(check.disposition, "artifact", name);
    assert.equal(check.allergenVerdict, "not_applicable", name);
  }
});

test("documents ingredient omissions and lexical false positives", () => {
  for (const name of [
    "½ LB Fried Oysters",
    "Roasted Cauliflower",
    "Trout Crab Meunière",
    "Kids Chicken Tenders",
    "Pepperoni Pizza",
  ]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === name).allergenVerdict, "mismatch", name);
  }
  for (const name of [
    "Crispy Skin Salmon (GF)",
    "Blackened Salmon BLT",
    "Wild Mushroom Pizza",
    "Smashburger",
  ]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === name).allergenVerdict, "mismatch", name);
  }
});
