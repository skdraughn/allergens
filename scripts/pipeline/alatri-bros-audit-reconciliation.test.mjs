import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAlatriBrosAuditSnapshot } from "./alatri-bros-audit-catalog.mjs";
import { reconcileAlatriBrosBaselineItems } from "./alatri-bros-audit-reconciliation.mjs";

const restaurantId = "alatri-bros-bethesda-md";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAlatriBrosBaselineItems(
  baseline,
  buildAlatriBrosAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles all 66 frozen Alatri rows and removes four documented nonproducts", () => {
  assert.equal(result.itemChecks.length, 66);
  assert.deepEqual(result.counts.dispositions, { exact_match: 61, artifact: 4, normalized_match: 1 });
  assert.deepEqual(result.counts.allergens, { mismatch: 62, not_applicable: 4 });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 62 });
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending" || candidate.allergenVerdict === "pending"), false);
});

test("classifies page copy, headings, and the promoted Shrimp Parmesan description", () => {
  for (const name of ["Good, we’re here to serve you", "Hungry?", "crostini on our housemade foccacia", "Shrimp Parmesan over Fresh Made Fettuccine"]) {
    const check = result.itemChecks.find((candidate) => candidate.baseline.name === name);
    assert.equal(check.disposition, "artifact", name);
    assert.equal(check.allergenVerdict, "not_applicable", name);
  }
  assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === "cheese Calzone").disposition, "normalized_match");
});

test("captures both fixed omissions and the missing global cross-contact semantics", () => {
  for (const name of ["Alsace", "Blackened trout", "Carmellina Sandwich", "Caesar Salad", "Formaggio", "Roasted Salmon", "Short Rib Fettuccine", "Truffle Arancini"]) {
    const check = result.itemChecks.find((candidate) => candidate.baseline.name === name);
    assert.equal(check.allergenVerdict, "mismatch", name);
    assert.ok(check.notes.includes("may contain peanut, tree-nut, gluten"), name);
  }
});
