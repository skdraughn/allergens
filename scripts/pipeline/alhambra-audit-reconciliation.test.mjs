import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAlhambraAuditSnapshot } from "./alhambra-audit-catalog.mjs";
import { reconcileAlhambraBaselineItems } from "./alhambra-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/replacement-alhambra-washington-dc.jsonl", "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAlhambraBaselineItems(
  baseline,
  buildAlhambraAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles all 113 frozen Alhambra rows", () => {
  assert.equal(result.itemChecks.length, 113);
  assert.deepEqual(result.counts.dispositions, { exact_match: 101, variant_match: 7, artifact: 5 });
  assert.deepEqual(result.counts.allergens, { verified: 34, mismatch: 46, accurately_unavailable: 28, not_applicable: 5 });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 35, overreported: 9, mixed: 2 });
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending" || candidate.allergenVerdict === "pending"), false);
});

test("separates CMS fragments and alcohol-only rows from real products", () => {
  for (const name of ["Choice of entree:", "Seasonal Fruit", "One Freshly Baked Breakfast Pastry", "BOTTOMLESS MIMOSA", "THE CAPITOL MARY"]) {
    const check = result.itemChecks.find((candidate) => candidate.baseline.name === name);
    assert.equal(check.disposition, "artifact", name);
    assert.equal(check.allergenVerdict, "not_applicable", name);
  }
  assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === "Three Courses:").disposition, "variant_match");
});

test("documents optional-choice overclaims and missing fixed allergens", () => {
  for (const name of ["ALHAMBRA PLATTER", "AVACADO TOAST", "ORGANIC ACAI BOWL"]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === name).allergenVerdict, "mismatch", name);
  }
  for (const name of ["BELGIAN WAFFLE", "BLACKENED OCTOPUS", "LOCAL ROCKFISH TAGINE", "WILD MUSHROOM AND TRUFFLE"]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === name).allergenVerdict, "mismatch", name);
  }
});
