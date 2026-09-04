import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repository = JSON.parse(
  fs.readFileSync(new URL("../src/data/generated/restaurants.generated.json", import.meta.url)),
);

const expectations = {
  "longhorn-steakhouse": {
    "lobster-tail-where-available": ["milk", "shellfish"],
    "redrock-grilled-shrimp": ["milk", "shellfish", "soy"],
    "renegade-sirloin-and-red-rock-grilled-shrimp": ["milk", "shellfish", "soy"],
    "wild-west-shrimp": ["gluten", "milk", "shellfish", "soy", "wheat"],
  },
  "red-lobster": {
    "baked-shrimp": ["shellfish"],
    "live-maine-lobster-steamed": ["milk", "shellfish"],
  },
  "yard-house": {
    "firecracker-shrimp": ["egg", "gluten", "shellfish", "soy", "wheat"],
    "grilled-salmon": ["fish"],
  },
};

for (const [restaurantId, items] of Object.entries(expectations)) {
  test(`${restaurantId} preserves direct matrix positives separately from cross-contact`, () => {
    const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
    assert.ok(restaurant, `Missing ${restaurantId}`);

    for (const [itemId, expectedDirect] of Object.entries(items)) {
      const item = restaurant.items.find((entry) => entry.id === itemId);
      assert.ok(item, `Missing ${restaurantId}/${itemId}`);
      assert.deepEqual([...(item.allergens ?? [])].sort(), expectedDirect);
      assert.equal(item.allergenSourceType, "official-allergen-menu");
      assert.equal(
        (item.mayContain ?? []).some((allergen) => expectedDirect.includes(allergen)),
        false,
        `${restaurantId}/${itemId} duplicates a direct allergen as cross-contact`,
      );
    }
  });
}
