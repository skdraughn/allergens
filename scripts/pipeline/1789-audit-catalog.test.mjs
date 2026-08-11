import assert from "node:assert/strict";
import test from "node:test";

import { build1789AuditSnapshot } from "./1789-audit-catalog.mjs";

test("1789 catalog keeps current food rows and conservative direct allergen signals", async () => {
  const snapshot = await build1789AuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.itemCount, 31);
  assert.deepEqual(snapshot.menus, ["Dinner", "Dessert", "Wines of Del Rio"]);
  assert.equal(byName.has("HALF BOTTLES (375ml)"), false);
  assert.equal(byName.has("LOOSE-LEAF TEA"), false);
  assert.equal(byName.has("MOO & BLUE"), false);
  assert.deepEqual(byName.get("Violet Haloed Hamachi Crudo").allergens, ["shellfish", "fish"]);
  assert.deepEqual(byName.get("Soft Shell Crab").allergens, ["shellfish"]);
  assert.deepEqual(byName.get("Hokkaido Scallops").allergens, ["shellfish", "soy"]);
  assert.deepEqual(byName.get("Brioche-Crusted Alaskan Halibut").allergens, [
    "milk", "fish", "mustard", "wheat", "gluten",
  ]);
  assert.deepEqual(byName.get("Milk Fed Veal Tenderloin").allergens, ["milk"]);
  assert.deepEqual(byName.get("Spiced Carrot Cake").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byName.get("Strawberries & Chocolate").allergens, []);
  assert.deepEqual(byName.get("Berry Vacherin Tart").allergens, ["milk", "egg"]);
});
