import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes only the verified current Arena's Georgetown catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === "arenas-georgetown-dc");
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.items.length, 101);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 101);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 10);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T09:20:53.792Z");
  assert.equal(restaurant.sourceFamily, "verified-arenas-georgetown-current-menu");
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length, 69);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "unavailable").length, 32);
  assert.equal(restaurant.items.every((item) => item.mayContain.length === 0), true);

  assert.deepEqual(byName.get("Crab Dip").allergens, ["milk", "shellfish"]);
  assert.deepEqual(byName.get("BLT").allergens, ["egg"]);
  assert.deepEqual(byName.get("California Club").allergens, ["egg", "gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("Rockfish Reuben").allergens, ["fish", "milk"]);
  assert.equal(byName.get("Chicken Nachos").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Chicken Nachos").allergens, []);
  assert.equal(byName.get("Small Caesar Salad").allergenSourceType, "unavailable");

  for (const present of ["Italian Cold Cut", "Honey Chicken Club", "Coca-Cola", "Soup of the Day", "Kids Chicken Tenders"]) {
    assert.equal(byName.has(present), true, present);
  }
  for (const absent of [
    "Chicken Sandwiches",
    "Classic Sandwiches",
    "Veggie Options & Burgers",
    "Large Hot Tots",
    "Small Hot Tots",
    "Mac and Cheese Bites",
  ]) assert.equal(byName.has(absent), false, absent);

  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 82);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 2);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 3);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 3);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 17);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 20);
  assert.equal(restaurant.sourceStatus.frozenProvenanceMismatchCount, 5);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 84);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: rebuilt Arena's Georgetown/.test(repair.note ?? "")
  ).length, 1);
});
