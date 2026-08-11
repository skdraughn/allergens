import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "applebees";
const globalMayContain = [
  "egg",
  "fish",
  "gluten",
  "milk",
  "peanut",
  "sesame",
  "shellfish",
  "soy",
  "tree-nut",
  "wheat",
];

test("publishes only the verified current Applebee's consumer catalog", async () => {
  const repository = JSON.parse(
    await readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  );
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const byName = new Map(restaurant.items.map((entry) => [entry.name, entry]));

  assert.equal(restaurant.items.length, 130);
  assert.equal(new Set(restaurant.items.map((entry) => entry.id)).size, 130);
  assert.equal(new Set(restaurant.items.map((entry) => entry.category)).size, 16);
  assert.equal(restaurant.items.at(-1).category, "Beverages");
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T08:23:51.208Z");
  assert.equal(
    restaurant.items.filter((entry) => entry.allergenSourceType === "official-allergen-menu").length,
    119,
  );
  assert.equal(
    restaurant.items.filter((entry) =>
      entry.allergenSourceType === "official-global-cross-contact-note"
    ).length,
    11,
  );
  assert.equal(
    restaurant.items.every((entry) => sameSet(entry.mayContain, globalMayContain)),
    true,
  );

  assert.deepEqual(byName.get("Brownie Bite").allergens, [
    "egg",
    "gluten",
    "milk",
    "soy",
    "tree-nut",
    "wheat",
  ]);
  assert.equal(byName.get("Chicken Wonton Tacos").allergens.includes("sesame"), true);
  assert.equal(byName.get("Sesame Salmon Bowl").allergens.includes("fish"), true);
  assert.ok(byName.has("Bacon Cheeseburger Wonton Tacos"));
  assert.ok(byName.has("Chicken Wonton Tacos - Sampler"));
  assert.ok(byName.has("Kids Kraft® Macaroni & Cheese"));
  assert.ok(byName.has("Coffee & Hot Tea"));

  for (const rejectedName of [
    "Bacon Cheddar Crispy Chicken Sandwich (with Grilled Chicken)",
    "Boneless Wings, Initial Order",
    "Boneless Wings, Refill Order",
    "Double Crunch Shrimp, Refill Order",
    "Impossible Cheeseburger",
    "Neighborhood Nachos (with Beef)",
    "Riblets, Refill Order",
    "Whole Lotta Bacon Burger",
  ]) {
    assert.equal(byName.has(rejectedName), false, rejectedName);
  }

  assert.equal(restaurant.sourceStatus.sourceItemCount, 513);
  assert.equal(restaurant.sourceStatus.itemAllergenMatrixCount, 119);
  assert.equal(restaurant.sourceStatus.globalCrossContactAppliedCount, 130);
  assert.equal(restaurant.sourceStatus.excludedCateringItemCount, 84);
  assert.equal(restaurant.sourceStatus.excludedPreviewOnlyItemCount, 44);
  assert.equal(restaurant.sourceStatus.frozenMatchedProductCount, 106);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 12);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 24);
  assert.equal(restaurant.sourceStatus.frozenFixedAllergenMismatchCount, 8);
  assert.equal(restaurant.sourceStatus.frozenGlobalCrossContactMismatchCount, 106);
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Applebee's/.test(repair.note ?? "")
    ).length,
    1,
  );
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.some((repair) =>
      /removed Applebee's internal-only, beverage, sampler-option/.test(repair.note ?? "")
    ),
    false,
  );
});

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
