import assert from "node:assert/strict";
import test from "node:test";

import { buildArepasCapitolCatalog } from "./arepas-capitol-audit-catalog.mjs";

test("builds the current exact-address Arepas Capitol catalog", async () => {
  const snapshot = await buildArepasCapitolCatalog();
  const byName = new Map(snapshot.items.map((entry) => [entry.name, entry]));

  assert.equal(snapshot.itemCount, 85);
  assert.equal(snapshot.sourcePresentationCount, 86);
  assert.equal(snapshot.categoryCount, 13);
  assert.equal(new Set(snapshot.items.map((entry) => entry.id)).size, 85);
  assert.equal(snapshot.items.every((entry) => entry.allergenSourceType === "unavailable"), true);
  assert.equal(snapshot.items.every((entry) => entry.allergens.length === 0 && entry.mayContain.length === 0), true);
  assert.equal(snapshot.items.filter((entry) => entry.name === "8 Tostones").length, 1);
  assert.equal(byName.get("8 Tostones").category, "Extra Sides");
  assert.equal(snapshot.items.at(-1).category, "Natural Juices");

  for (const name of [
    "4 Tequeños",
    "Pabellon Criollo",
    "Venezuelan Empanada - Queso",
    "Jamon Y Queso (Ham and Cheese)",
    "La Sifrina Burger",
    "Parrilla Mar Y Tierra",
    "Tres Leches",
    "Malta Polar (Venezuelan Malt)",
    "Chicha (Cooked Rice with Milk Cream)",
  ]) assert.equal(byName.has(name), true, name);

  for (const name of ["Cachapa", "Cakes", "Empanadas", "Fresh Juices", "Pepito"]) {
    assert.equal(byName.has(name), false, name);
  }
});

test("keeps third-party wording as Ingredient Intelligence rather than official claims", async () => {
  const snapshot = await buildArepasCapitolCatalog();
  const byName = new Map(snapshot.items.map((entry) => [entry.name, entry]));
  const inferred = (name) => byName.get(name).inferredAllergenSignals.map((signal) => signal.id);

  assert.deepEqual(inferred("Venezuelan Empanada - Queso"), ["milk"]);
  assert.deepEqual(inferred("Catira (Chicken and Cheese)"), ["milk"]);
  assert.deepEqual(inferred("Malta Polar (Venezuelan Malt)"), ["gluten"]);
  assert.deepEqual(inferred("Parrilla Mar Y Tierra"), ["shellfish"]);
  assert.deepEqual(inferred("Grilled Salmon"), ["fish"]);
  assert.deepEqual(inferred("Chicha (Cooked Rice with Milk Cream)"), ["milk"]);
  assert.match(byName.get("Catira (Chicken and Cheese)").inferenceSummary, /cornmeal|corn-flour/i);
  assert.match(byName.get("4 Tequeños").sourceSummary, /third-party/i);
});
