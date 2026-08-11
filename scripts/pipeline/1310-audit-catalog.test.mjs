import assert from "node:assert/strict";
import test from "node:test";

import { build1310AuditSnapshot } from "./1310-audit-catalog.mjs";

test("1310 audit catalog preserves rendered rows and conservative allergen semantics", () => {
  const snapshot = build1310AuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.ok(snapshot.itemCount > 120);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, snapshot.itemCount);
  assert.deepEqual(byName.get("Steel Cut Oatmeal").allergens, []);
  assert.deepEqual(byName.get("Non-Dairy Milk").allergens, []);
  assert.deepEqual(byName.get("Matcha Mango Smoothie").allergens, ["tree-nut"]);
  assert.deepEqual(byName.get("Hoya Blue Smoothie").allergens, ["tree-nut"]);
  assert.deepEqual(byName.get("Chocolate Peanut Butter Smoothie").allergens, [
    "peanut",
    "tree-nut",
  ]);
  assert.equal(byName.get("Vegan Lasagna, 23 oz").allergens.includes("milk"), false);
  assert.equal(byName.get("Ratatouille Lasagna").allergens.includes("milk"), false);
  assert.equal(byName.get("House Made Veggie Burger").allergens.includes("milk"), false);
  assert.equal(byName.get("Miso Tofu"), undefined);
  assert.ok(byName.get("Sesame Seared Tuna").allergens.includes("fish"));
  assert.ok(byName.get("Sesame Seared Tuna").allergens.includes("soy"));
  assert.ok(byName.get("Sesame Seared Tuna").allergens.includes("sesame"));
  assert.ok(byName.get("Hot Turkey Cubano").allergens.includes("milk"));
  assert.ok(byName.get("Hot Turkey Cubano").allergens.includes("mustard"));
  assert.equal(byName.has("SANDWICHES & SALADS"), false);
  assert.equal(byName.has("SIDE ORDERS"), false);
  assert.equal(byName.has("SMOOTHIES"), false);
});
