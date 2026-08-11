import assert from "node:assert/strict";
import test from "node:test";

import { buildAztecaCollegeParkAuditSnapshot } from "./azteca-college-park-audit-catalog.mjs";

const snapshot = await buildAztecaCollegeParkAuditSnapshot({
  retrievedAt: "2026-07-15T18:15:54.927Z",
});
const item = (id) => snapshot.items.find((candidate) => candidate.id === id);

test("pins the complete current College Park ordering catalog", () => {
  assert.equal(snapshot.rawPresentationCount, 103);
  assert.equal(snapshot.uniqueVendorProductCount, 95);
  assert.equal(snapshot.itemCount, 94);
  assert.equal(snapshot.categoryCount, 19);
  assert.equal(snapshot.linkedIngredientCount, 65);
  assert.equal(snapshot.unavailableAllergenCount, 29);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 94);
  assert.ok(snapshot.items.every((candidate) => candidate.mayContain.length === 0));
});

test("deduplicates vendor repetitions and the repeated Picadera presentation", () => {
  assert.equal(snapshot.items.filter((candidate) => candidate.name === "Paella Marinera").length, 1);
  assert.equal(snapshot.items.filter((candidate) => candidate.name === "Fajitas Azteca").length, 1);
  assert.equal(snapshot.items.filter((candidate) => candidate.name === "Plato Picadera Especial").length, 1);
  assert.equal(item("plato-picadera-especial")?.presentations.length, 2);
  assert.equal(item("plato-picadera-especial")?.category, "Plato Picadera Especial");
});

test("retains narrow positives without promoting flour tortillas to wheat or gluten", () => {
  assert.deepEqual(item("ceviche-mixto-peruano")?.allergens, ["fish", "shellfish"]);
  assert.deepEqual(item("grilled-chicken-quesadilla")?.allergens, ["milk"]);
  assert.equal(
    item("grilled-chicken-quesadilla")?.allergenSourceType,
    "restaurant-linked-menu-ingredients",
  );
  assert.deepEqual(item("crab-quesadilla")?.allergens, ["milk", "shellfish"]);
  assert.deepEqual(item("sopa-de-mariscos")?.allergens, ["egg", "fish", "shellfish"]);
  assert.deepEqual(item("mariscada-soup")?.allergens, ["egg", "fish", "shellfish"]);
  assert.deepEqual(item("fajitas-de-pollo")?.allergens, ["milk"]);
  assert.deepEqual(item("chicken-ceasar-salad")?.allergens, []);
  assert.ok(snapshot.items.every((candidate) => !candidate.allergens.includes("wheat")));
  assert.ok(snapshot.items.every((candidate) => !candidate.allergens.includes("gluten")));
});
