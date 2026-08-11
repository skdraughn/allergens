import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAllPurposeShawAuditSnapshot } from "./all-purpose-shaw-audit-catalog.mjs";
import { reconcileAllPurposeShawBaselineItems } from "./all-purpose-shaw-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/all-purpose-shaw-dc.jsonl", "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAllPurposeShawBaselineItems(
  baseline,
  buildAllPurposeShawAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles all 39 frozen All-Purpose Shaw rows", () => {
  assert.equal(result.itemChecks.length, 39);
  assert.deepEqual(result.counts.dispositions, { exact_match: 26, variant_match: 12, stale_extra: 1 });
  assert.deepEqual(result.counts.allergens, { verified: 31, accurately_unavailable: 4, mismatch: 3, not_applicable: 1 });
  assert.deepEqual(result.counts.mismatchKinds, { overreported: 3 });
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending" || candidate.allergenVerdict === "pending"), false);
});

test("removes the stale garlic knots without conflating the new focaccia formulation", () => {
  const stale = result.itemChecks.find((candidate) => candidate.baseline.name === "Roasted Garlic Knots");
  assert.equal(stale.disposition, "stale_extra");
  assert.equal(stale.allergenVerdict, "not_applicable");
  assert.match(stale.notes, /Focaccia Garlic Breadsticks/);
});

test("removes unsupported and optional fish from current brunch items", () => {
  for (const name of ["Breakfast Sandwich", "Italian Hash Browns"]) {
    const check = result.itemChecks.find((candidate) => candidate.baseline.name === name);
    assert.equal(check.allergenVerdict, "mismatch", name);
    assert.match(check.notes, /contains milk/);
  }
  assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === "Arancini 'Donatello'").allergenVerdict, "mismatch");
});
