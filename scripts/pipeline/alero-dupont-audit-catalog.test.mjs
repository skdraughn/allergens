import assert from "node:assert/strict";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAleroDupontAuditSnapshot } from "./alero-dupont-audit-catalog.mjs";

const snapshot = buildAleroDupontAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds every current Alero food and nonalcoholic product", () => {
  assert.equal(snapshot.itemCount, 126);
  assert.equal(snapshot.presentationCount, 193);
  assert.equal(snapshot.categoryCount, 8);
  assert.equal(snapshot.ingredientSignalCount, 64);
  assert.equal(snapshot.unavailableAllergenCount, 62);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 126);
  for (const rejected of ["Bag Fee", "------Appetizer------", "Mexican Coffe", "Irish Coffe"]) {
    assert.equal(item(rejected), undefined, rejected);
  }
  assert.equal(snapshot.items.filter((candidate) => candidate.name === "Quesadilla").length, 1);
  assert.equal(snapshot.items.filter((candidate) => candidate.name === "Enchiladas").length, 1);
  assert.equal(item("Fried Calamari").presentations.length, 1);
  assert.equal(item("Alero Salad").presentations.length, 3);
});

test("maps fixed published components without promoting configurable proteins", () => {
  assert.deepEqual(item("Camarones Mexicanos").allergens, ["milk", "wheat", "gluten", "shellfish"]);
  assert.deepEqual(item("Salmon Mexicano").allergens, ["milk", "fish", "shellfish"]);
  assert.deepEqual(item("Fish Tacos").allergens, ["milk", "wheat", "gluten", "fish"]);
  assert.deepEqual(item("Chaufa Mexicano").allergens, ["egg", "shellfish", "soy"]);
  assert.deepEqual(item("Fajitas").allergens, ["milk", "wheat", "gluten"]);
  assert.equal(item("Fajitas").allergens.includes("shellfish"), false);
  assert.equal(item("Fajitas").isConfigurable, true);
  assert.deepEqual(item("Guadalajara Fajita Platter").allergens, []);
  assert.equal(item("Guadalajara Fajita Platter").allergenSourceType, "unavailable");
});

test("preserves every manually adjudicated live product through the quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
  assert.equal(classifyMenuItemRow(item("Queso Dip With")).kind, "menu-item");
});
