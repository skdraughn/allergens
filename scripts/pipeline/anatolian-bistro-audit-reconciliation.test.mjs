import assert from "node:assert/strict";
import test from "node:test";

import { reconcileAnatolianBistroBaselineItems } from "./anatolian-bistro-audit-reconciliation.mjs";

function check(key, name, allergens = []) {
  return {
    schemaVersion: 1,
    auditItemKey: key,
    baseline: { name, category: "turkish", allergens, mayContain: [] },
    disposition: "pending",
    allergenVerdict: "pending",
    sourceEvidenceIds: [],
    notes: null,
  };
}

const snapshot = {
  items: [
    { id: "lunch-adana", name: "Adana Kebab", category: "Entrees (Lunch)", allergens: ["milk", "wheat", "gluten"], mayContain: [], allergenSourceType: "official-ingredients", description: "One skewer" },
    { id: "dinner-adana", name: "Adana Kebab", category: "Entrees (Dinner)", allergens: ["milk", "wheat", "gluten"], mayContain: [], allergenSourceType: "official-ingredients", description: "Two skewers" },
    { id: "mucver", name: "Mucver", category: "Hot Appetizers", allergens: [], mayContain: [], allergenSourceType: "unavailable", description: "Freshly homemade pan-seared zucchini cakes." },
    { id: "lamb-chops", name: "Lamb Chops (GF)", category: "Entrees (Dinner)", allergens: [], mayContain: [], allergenSourceType: "unavailable", description: "Marinated lamb chops" },
    { id: "coffee", name: "American Coffee", category: "Beverages", allergens: [], mayContain: [], allergenSourceType: "unavailable", description: null },
  ],
};

test("reconciles meal-period splits, description artifacts, stale duplicates, and allergens", () => {
  const result = reconcileAnatolianBistroBaselineItems([
    check("1:adana", "Adana Kebab", ["milk", "wheat", "gluten"]),
    check("2:mucver", "Mucver"),
    check("3:description", "Freshly homemade pan-seared zucchini cakes.", ["egg"]),
    check("4:lamb-old", "LAMB CHOPS", ["milk", "wheat", "gluten"]),
    check("5:lamb-gf", "Lamb Chops (GF)"),
    check("6:coffee", "American Coffee", ["milk"]),
    check("7:yelp", "Yelp"),
    check("8:caesar", "Caesar Salad", ["wheat", "gluten"]),
  ], snapshot);

  assert.deepEqual(result.counts.dispositions, {
    variant_match: 4,
    stale_extra: 2,
    artifact: 2,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 1,
    accurately_unavailable: 2,
    mismatch: 1,
    not_applicable: 4,
  });
  assert.deepEqual(result.itemChecks[0].currentItemIds, ["lunch-adana", "dinner-adana"]);
  assert.equal(result.itemChecks[2].disposition, "artifact");
  assert.deepEqual(result.itemChecks[2].artifactOfCurrentItemIds, ["mucver"]);
  assert.equal(result.itemChecks[3].disposition, "stale_extra");
  assert.equal(result.itemChecks[5].allergenVerdict, "mismatch");
  assert.equal(result.counts.omittedCurrentItemCount, 0);
});
