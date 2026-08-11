import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAllAboutBurgerGloverParkAuditSnapshot } from "./all-about-burger-glover-park-audit-catalog.mjs";
import { reconcileAllAboutBurgerGloverParkBaselineItems } from "./all-about-burger-glover-park-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/all-about-burger-glover-park-dc.jsonl", "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAllAboutBurgerGloverParkBaselineItems(
  baseline,
  buildAllAboutBurgerGloverParkAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles all 59 historical Toast rows as stale", () => {
  assert.equal(result.itemChecks.length, 59);
  assert.deepEqual(result.counts.dispositions, { stale_extra: 59 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 59 });
  assert.ok(result.itemChecks.every((check) => check.sourceEvidenceIds.length === 3));
  assert.equal(result.itemChecks.some((check) => check.disposition === "pending" || check.allergenVerdict === "pending"), false);
});

test("does not preserve historical official-ingredient labels after closure", () => {
  for (const name of ["Bacon Cheese Burger", "Birthday Cake Milkshake", "Chicken Sandwich", "Sausage Egg & Chez Sandwitch"]) {
    const check = result.itemChecks.find((candidate) => candidate.baseline.name === name);
    assert.equal(check.disposition, "stale_extra", name);
    assert.equal(check.allergenVerdict, "not_applicable", name);
  }
});
