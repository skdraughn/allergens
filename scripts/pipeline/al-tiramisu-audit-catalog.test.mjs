import assert from "node:assert/strict";
import test from "node:test";

import { buildAlTiramisuAuditSnapshot } from "./al-tiramisu-audit-catalog.mjs";

const snapshot = buildAlTiramisuAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((row) => row.name === name);

test("extracts all 25 current products from the four rendered official sections", () => {
  assert.equal(snapshot.itemCount, 25);
  assert.equal(snapshot.presentationCount, 25);
  assert.equal(snapshot.categoryCount, 4);
  assert.deepEqual([...new Set(snapshot.items.map((row) => row.category))], [
    "INSALATE, ANTIPASTI e ZUPPE", "LE PASTE", "SECONDI", "Dolci",
  ]);
  assert.equal(snapshot.items.some((row) => ["Menu Advisory", "LE PASTE", "SECONDI", "Dolci"].includes(row.name)), false);
});

test("maps fixed savory ingredients without inventing complete recipes", () => {
  assert.deepEqual(item("Burrata").allergens, ["milk"]);
  assert.deepEqual(item("Spiedini").allergens, ["wheat", "gluten", "shellfish"]);
  assert.deepEqual(item("Fettuccine").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Ravioli").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Vongole").allergens, ["wheat", "gluten", "shellfish"]);
  assert.deepEqual(item("Calamari").allergens, ["shellfish"]);
  assert.deepEqual(item("Pollo").allergens, []);
});

test("keeps dessert choice and composite-ingredient semantics conservative", () => {
  assert.deepEqual(item("Tiramisu classico").allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(item("Torta Caprese").allergens, ["tree-nut"]);
  assert.deepEqual(item("Tartufo al cioccolato").allergens, ["milk", "egg", "tree-nut"]);
  assert.deepEqual(item("Gelato artigianale").allergens, ["milk"]);
  assert.equal(item("Gelato artigianale").isConfigurable, true);
  assert.deepEqual(item("Affogato").allergens, ["milk"]);
  assert.ok(snapshot.items.every((row) => row.mayContain.length === 0));
});
