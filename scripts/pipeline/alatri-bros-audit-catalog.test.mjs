import assert from "node:assert/strict";
import test from "node:test";

import { buildAlatriBrosAuditSnapshot } from "./alatri-bros-audit-catalog.mjs";

const snapshot = buildAlatriBrosAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds every current Alatri formulation and channel presentation", () => {
  assert.equal(snapshot.itemCount, 84);
  assert.equal(snapshot.presentationCount, 202);
  assert.equal(snapshot.categoryCount, 23);
  assert.equal(item("Salsiccia").presentations.length, 3);
  assert.equal(item("Strawberry Gelato").presentations.length, 1);
  assert.equal(item("3 Scoops Gelato").presentations.length, 1);
  assert.equal(snapshot.items.some((candidate) => candidate.name === "Hungry?"), false);
  assert.equal(snapshot.items.some((candidate) => candidate.name === "Shrimp Parmesan over Fresh Made Fettuccine"), false);
});

test("preserves official-site aliases and current configurable choices", () => {
  assert.ok(item("Crab Cake App").aliases.includes("Crab Cake"));
  assert.ok(item("Burrata Pizza").aliases.includes("Burrata"));
  assert.ok(item("Multi Carne").aliases.includes("Multi Carni"));
  assert.equal(item("Mussels").isConfigurable, true);
  assert.equal(item("Cheese Calzone").isConfigurable, true);
  assert.equal(item("Pasta Meatballs").isConfigurable, true);
});

test("separates fixed ingredients from Alatri's global gluten and nut caution", () => {
  assert.deepEqual(item("Blackened trout").allergens, ["fish"]);
  assert.deepEqual(item("Carmellina Sandwich").allergens, ["milk", "egg", "wheat", "gluten", "mustard"]);
  assert.deepEqual(item("Truffle Arancini").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Roasted Edamame").allergens, ["soy"]);
  assert.deepEqual(item("Caesar Salad").allergens, ["wheat", "gluten", "fish"]);
  assert.deepEqual(item("Shrimp Parmesan").allergens, ["milk", "wheat", "gluten", "shellfish"]);
  assert.deepEqual(item("Roasted Salmon").allergens, ["milk", "fish"]);
  assert.deepEqual(item("TMP - Pepperoni").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Nutella Pizza").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("Mini Fruit Plate").allergens, []);
  assert.equal(item("Mini Fruit Plate").allergenSourceType, "official-global-cross-contact-note");
  assert.ok(snapshot.items.every((candidate) => JSON.stringify(candidate.mayContain) === JSON.stringify(["peanut", "tree-nut", "gluten"])));
});
