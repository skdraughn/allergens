import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes only the verified current Arby's consumer catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === "arbys");
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.items.length, 78);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 78);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 12);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T09:00:04.402Z");
  assert.equal(restaurant.sourceFamily, "verified-arbys-current-menu-allergen");
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-allergen-menu").length, 77);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "unavailable").length, 1);
  assert.equal(restaurant.items.filter((item) => item.mayContain.length > 0).length, 27);

  assert.deepEqual(byName.get("Classic Roast Beef").allergens, ["sesame", "soy", "wheat"]);
  assert.deepEqual(byName.get("Classic Roast Beef").mayContain, []);
  assert.deepEqual(byName.get("Crispy Chicken Sandwich").allergens, ["egg", "wheat"]);
  assert.deepEqual(byName.get("Crispy Chicken Sandwich").mayContain, ["fish", "milk", "sesame", "soy"]);
  assert.deepEqual(byName.get("Crinkle Fries").allergens, []);
  assert.deepEqual(byName.get("Crinkle Fries").mayContain, ["egg", "fish", "milk", "soy", "wheat"]);
  assert.deepEqual(byName.get("Jamocha Shake").allergens, ["milk"]);
  assert.deepEqual(byName.get("Jamocha Shake").mayContain, ["peanut", "tree-nut"]);
  assert.equal(byName.get("Orange Cream Shake").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Orange Cream Shake").allergens, []);
  assert.deepEqual(byName.get("Orange Cream Shake").mayContain, []);

  for (const present of [
    "Pecan Chicken Salad Sandwich",
    "Classic Beef 'n Cheddar",
    "Chicken Tenders 3PC",
    "Bacon, Egg & Cheese Biscuit",
    "Roast Beef Gyro",
  ]) assert.equal(byName.has(present), true, present);
  for (const absent of [
    "Brioche Bun",
    "Au Jus",
    "Crispy Onions",
    "Bacon- 3 half strips",
    "Whipped Topping",
  ]) assert.equal(byName.has(absent), false, absent);

  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 4);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 16);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 46);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 64);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 8);
  assert.equal(restaurant.sourceStatus.frozenFixedAllergenMismatchCount, 0);
  assert.equal(restaurant.sourceStatus.frozenCrossContactMismatchCount, 8);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 15);
  assert.equal(restaurant.sourceStatus.excludedComponentGlossary, true);
  assert.equal(restaurant.sourceStatus.publishedConfigurableShellCount, 25);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: rebuilt Arby's/.test(repair.note ?? "")
  ).length, 1);
});
