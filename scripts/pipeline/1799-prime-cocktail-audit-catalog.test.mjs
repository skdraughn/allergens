import assert from "node:assert/strict";
import test from "node:test";

import { build1799PrimeCocktailAuditSnapshot } from "./1799-prime-cocktail-audit-catalog.mjs";

test("broader 1799 record includes the current cocktail menu after other beverages", () => {
  const snapshot = build1799PrimeCocktailAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.itemCount, 98);
  assert.equal(snapshot.ingredientSignalCount, 51);
  assert.equal(snapshot.crossContactOnlyCount, 16);
  assert.equal(snapshot.unavailableAllergenCount, 31);
  assert.deepEqual(byName.get("Lena Marie").allergens, []);
  assert.deepEqual(byName.get("Cloud Nine").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Matcha Made Me Do It").allergens, ["milk"]);
  assert.deepEqual(byName.get("Skywalker").allergens, []);
  assert.equal(snapshot.items.at(-1).category, "Beverages · Cocktails");
});
