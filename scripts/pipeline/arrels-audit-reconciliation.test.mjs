import assert from "node:assert/strict";
import test from "node:test";

import { buildArrelsAuditSnapshot } from "./arrels-audit-catalog.mjs";
import { reconcileArrelsBaselineItems } from "./arrels-audit-reconciliation.mjs";

function baselineCheck(auditItemKey, name, allergenSourceType) {
  return {
    schemaVersion: 1,
    auditItemKey,
    baseline: { name, allergenSourceType },
    disposition: "pending",
    allergenVerdict: "pending",
    sourceEvidenceIds: [],
    notes: null,
  };
}

test("marks every frozen Restaurant Week row stale after permanent closure", () => {
  const result = reconcileArrelsBaselineItems(
    [
      baselineCheck("1:esqueixada", "Esqueixada", "official-allergen-menu"),
      baselineCheck("2:goat-milk-chocolate-cremeux", "Goat Milk Chocolate Cremeux", "official-allergen-menu"),
      baselineCheck("3:iberico-presa", "Iberico Presa", "unavailable"),
      baselineCheck("4:squid-ink-fideua", "Squid Ink Fideua", "official-allergen-menu"),
      baselineCheck("5:torta-de-camarones", "Torta de Camarones", "official-allergen-menu"),
    ],
    buildArrelsAuditSnapshot(),
  );

  assert.deepEqual(result.counts.dispositions, { stale_extra: 5 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 5 });
  assert.equal(result.counts.mismatchKinds.promoted_third_party_provenance, 4);
  assert.ok(result.itemChecks.every((row) => row.disposition === "stale_extra"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict === "not_applicable"));
  assert.ok(
    result.itemChecks.every((row) =>
      row.sourceEvidenceIds.includes("official-arlo-current-restaurant-page"),
    ),
  );
});

test("rejects an open or replacement-menu snapshot", () => {
  assert.throws(
    () => reconcileArrelsBaselineItems([], { locationStatus: "open", replacementStatus: "none", items: [] }),
    /not terminal/,
  );
  assert.throws(
    () => reconcileArrelsBaselineItems([], {
      locationStatus: "permanently_closed",
      replacementStatus: "transitional_breakfast_service",
      items: [{ name: "Replacement breakfast" }],
    }),
    /not terminal/,
  );
});
