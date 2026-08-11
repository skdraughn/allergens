import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAhsoAuditSnapshot } from "./ahso-audit-catalog.mjs";
import { reconcileAhsoBaselineItems } from "./ahso-audit-reconciliation.mjs";

const restaurantId = "replacement-ahso-restaurant-brambleton-va";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAhsoBaselineItems(baseline, buildAhsoAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }));

test("reconciles all 22 frozen Ahso rows as sister-location contamination", () => {
  assert.equal(result.itemChecks.length, 22);
  assert.deepEqual(result.counts.dispositions, { location_mismatch: 22 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 22 });
  assert.equal(result.counts.currentExactNameOverlaps, 1);
  assert.ok(result.itemChecks.every((item) => item.sourceEvidenceIds.includes("sister-toast-baseline-source")));
});

test("does not validate a contaminated row merely because Ahso Restaurant now has the same name", () => {
  const burger = result.itemChecks.find((item) => item.baseline.name === "Ahso Burger");
  assert.equal(burger.disposition, "location_mismatch");
  assert.match(burger.notes, /same-name Ahso Restaurant formulation currently exists/i);
  const breadBoard = result.itemChecks.find((item) => item.baseline.name === "Bread Board");
  assert.match(breadBoard.notes, /No exact same-name formulation/i);
});
