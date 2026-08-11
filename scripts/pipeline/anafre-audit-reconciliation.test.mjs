import assert from "node:assert/strict";
import test from "node:test";

import { reconcileAnafreBaselineItems } from "./anafre-audit-reconciliation.mjs";

function check(key, name, category, allergens = []) {
  return {
    schemaVersion: 1,
    auditItemKey: key,
    baseline: { name, category, allergens, mayContain: [] },
    disposition: "pending",
    allergenVerdict: "pending",
    sourceEvidenceIds: [],
    notes: null,
  };
}

const snapshot = {
  items: [
    { id: "oysters", name: "Oysters al Carbon con Crab Meat", category: "Appetizers", allergens: ["shellfish", "milk", "wheat", "gluten"], mayContain: [], allergenSourceType: "official-ingredients" },
    { id: "queso", name: "Queso Fundido en Hoja de Platano", category: "Appetizers", allergens: ["milk"], mayContain: [], allergenSourceType: "official-ingredients" },
    { id: "churrasco", name: "Churrasco à la Carbon", category: "Entrées", allergens: [], mayContain: [], allergenSourceType: "unavailable" },
    { id: "diet-coke", name: "Diet Coke", category: "Beverages", allergens: [], mayContain: [], allergenSourceType: "unavailable" },
  ],
};

test("reconciles positive ingredient corrections, spelling, category moves, and artifacts", () => {
  const result = reconcileAnafreBaselineItems(
    [
      check("1:oysters", "Oysters al Carbon con Crab Meat", "Appetizers"),
      check("2:queso", "Queso Fundindo en Hoja de Platano", "Appetizers"),
      check("3:churrasco", "Churrasco à la Carbon", "Pizzas"),
      check("4:chicken-sandwich", "Chicken Sandwich", "Sandwiches"),
    ],
    snapshot,
  );
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 1,
    variant_match: 2,
    stale_extra: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    accurately_unavailable: 1,
    mismatch: 2,
    not_applicable: 1,
  });
  assert.equal(result.counts.omittedCurrentItemCount, 1);
  assert.equal(result.itemChecks[0].allergenVerdict, "mismatch");
  assert.equal(result.itemChecks[2].disposition, "variant_match");
  assert.equal(result.itemChecks[3].disposition, "stale_extra");
});
