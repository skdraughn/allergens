import assert from "node:assert/strict";
import test from "node:test";

import { buildAlaraGeorgetownAuditSnapshot } from "./alara-georgetown-audit-catalog.mjs";

const snapshot = buildAlaraGeorgetownAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("represents all current Alara food and nonalcoholic menu surfaces without flattening meal periods", () => {
  assert.equal(snapshot.itemCount, 100);
  assert.equal(snapshot.presentationCount, 156);
  assert.equal(snapshot.categoryCount, 25);
  assert.equal(item("Alara Burger").presentations.length, 2);
  assert.equal(item("Classic Hummus").presentations.length, 3);
  assert.equal(item("Tzatziki").presentations.length, 2);
  assert.equal(item("Tzatziki Dip").presentations.length, 1);
  assert.equal(item("Beef Pide").presentations.length, 1);
  assert.equal(item("Ground Beef Pide").presentations.length, 2);
  assert.equal(snapshot.items.some((candidate) => candidate.name === "First Course"), false);
  assert.equal(snapshot.items.some((candidate) => candidate.name === "Plomari"), false);
});

test("adds every current formulation that the frozen parser missed", () => {
  for (const name of [
    "Taste of Alara for the Entire Party", "Fries", "Coffee", "Matmazel", "Alara Blush", "Stella Artois 0.0 Non-Alcoholic",
  ]) {
    assert.ok(item(name), name);
  }
  assert.equal(item("Taste of Alara for the Entire Party").isConfigurable, true);
  assert.equal(item("Tray of Cold Mezze").isConfigurable, true);
});

test("maps only positive fixed ingredient signals and preserves unavailable semantics", () => {
  assert.deepEqual(item("Classic Hummus").allergens, ["milk", "sesame"]);
  assert.deepEqual(item("Spicy Bulgur Bites").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Vegetarian Stuffed Eggplant").allergens, ["tree-nut"]);
  assert.deepEqual(item("Butter Shrimp").allergens, ["milk", "shellfish"]);
  assert.deepEqual(item("Moussaka").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Falafel").allergens, ["milk", "sesame"]);
  assert.deepEqual(item("Mezze Trio").allergens, ["milk", "tree-nut", "sesame"]);
  assert.deepEqual(item("Soujouk Omelet").allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(item("Tahini Crème Brûlée").allergens, ["milk", "egg", "sesame"]);
  assert.deepEqual(item("Kunefe").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("Cappuccino / Latte").allergens, ["milk"]);
  assert.deepEqual(item("Stella Artois 0.0 Non-Alcoholic").allergens, []);
  assert.equal(item("Stella Artois 0.0 Non-Alcoholic").allergenSourceType, "unavailable");
  assert.ok(snapshot.items.every((candidate) => candidate.mayContain.length === 0));
});
