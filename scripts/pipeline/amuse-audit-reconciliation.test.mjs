import assert from "node:assert/strict";
import test from "node:test";

import { buildAmuseAuditSnapshot } from "./amuse-audit-catalog.mjs";
import { reconcileAmuseBaselineItems } from "./amuse-audit-reconciliation.mjs";

function baselineCheck(auditItemKey, name) {
  return {
    schemaVersion: 1,
    auditItemKey,
    baseline: { name },
    disposition: "pending",
    allergenVerdict: "pending",
    sourceEvidenceIds: [],
    notes: null,
  };
}

test("separates cross-location food rows from non-menu artifacts", () => {
  const result = reconcileAmuseBaselineItems(
    [
      baselineCheck("1:apple-crisp-bowl", "apple crisp bowl"),
      baselineCheck("2:cajun-shrimp-salad", "Cajun shrimp salad"),
      baselineCheck("3:categories", "Categories Bars Italian Pizza Lunch"),
      baselineCheck("4:pumpkin-spice-chai", "pumpkin spice chai"),
      baselineCheck("5:oh", "OH:"),
    ],
    buildAmuseAuditSnapshot(),
  );

  assert.deepEqual(result.counts.dispositions, {
    artifact: 2,
    location_mismatch: 3,
  });
  assert.equal(result.counts.allergens.not_applicable, 5);
  assert.deepEqual(
    result.itemChecks.map((row) => row.disposition),
    ["location_mismatch", "location_mismatch", "artifact", "location_mismatch", "artifact"],
  );
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict === "not_applicable"));
  assert.ok(
    result.itemChecks.every((row) =>
      row.sourceEvidenceIds.includes("official-marriott-dining"),
    ),
  );
});

test("rejects a non-closure snapshot", () => {
  assert.throws(
    () =>
      reconcileAmuseBaselineItems([], {
        locationStatus: "open",
        items: [],
      }),
    /not terminal/,
  );
});
