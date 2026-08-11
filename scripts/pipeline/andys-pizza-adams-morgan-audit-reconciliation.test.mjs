import assert from "node:assert/strict";
import test from "node:test";

import { reconcileAndysPizzaAdamsMorganBaselineItems } from "./andys-pizza-adams-morgan-audit-reconciliation.mjs";

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
    { id: "kale", name: "Kale Salad", category: "Starters + Salads", allergens: ["milk"], mayContain: [], allergenSourceType: "official-ingredients" },
    { id: "pepperoni", name: "Pepperoni", category: "Standard Pies & Slices", allergens: ["milk", "wheat", "gluten"], mayContain: [], allergenSourceType: "official-ingredients" },
  ],
  otherLocationItemLocations: {
    "Buffalo Crispy Chicken": ["Tysons Galleria", "Fairfax"],
  },
};

test("reconciles exact products, location bleed, modifier artifacts, and crust allergens", () => {
  const result = reconcileAndysPizzaAdamsMorganBaselineItems([
    check("1:kale", "Kale Salad", "Starters + Salads", ["milk"]),
    check("2:pepperoni", "Pepperoni", "Standard Pies & Slices", ["milk"]),
    check("3:buffalo", "Buffalo Crispy Chicken", "Specialty Pies", ["milk"]),
    check("4:toppings", "Whole Pie Toppings:", "Standard Pies & Slices"),
  ], snapshot);

  assert.deepEqual(result.counts.dispositions, {
    exact_match: 2,
    artifact: 1,
    location_mismatch: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 1,
    mismatch: 1,
    not_applicable: 2,
  });
  assert.equal(result.itemChecks[1].allergenVerdict, "mismatch");
  assert.deepEqual(result.itemChecks[2].otherLocationNames, ["Tysons Galleria", "Fairfax"]);
  assert.equal(result.itemChecks[3].disposition, "artifact");
  assert.equal(result.counts.omittedCurrentItemCount, 0);
});
