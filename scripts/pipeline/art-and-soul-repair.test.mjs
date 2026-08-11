import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "art-and-soul-dc";

test("publishes only the verified current Art and Soul catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byId = new Map(restaurant.items.map((row) => [row.id, row]));

  assert.equal(restaurant.items.length, 54);
  assert.equal(new Set(restaurant.items.map((row) => row.id)).size, 54);
  assert.equal(restaurant.sourceStatus.allDayProductCount, 27);
  assert.equal(restaurant.sourceStatus.brunchProductCount, 29);
  assert.equal(restaurant.sourceStatus.breakfastProductCount, 1);
  assert.equal(restaurant.sourceStatus.sourcePresentationCount, 57);
  assert.equal(restaurant.sourceStatus.consolidatedPresentationCount, 3);
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 50);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 4);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 10);
  assert.equal(
    restaurant.items.filter((row) => row.allergenSourceType === "official-ingredients").length,
    37,
  );
  assert.equal(restaurant.items.every((row) => row.mayContain.length === 0), true);

  for (const id of [
    "breakfast-buffet",
    "crispy-brussels-sprouts-all-day",
    "cinnamon-roll-brunch",
    "fruit-brunch",
    "grits-brunch",
    "angus-burger-all-day",
    "angus-burger-brunch",
    "fried-chicken-sandwich-all-day",
    "fried-chicken-sandwich-brunch",
  ]) assert.ok(byId.has(id), id);
  for (const name of ["Adult", "HOT ITEMS", "BAKED ITEMS", "COLD ITEMS", "add ons", "ADDITIONS", "Each | 9"]) {
    assert.equal(restaurant.items.some((row) => row.name === name), false, name);
  }

  assert.deepEqual(byId.get("breakfast-buffet").allergens, ["egg", "gluten", "milk", "wheat"]);
  assert.deepEqual(byId.get("capitol-crabcake-all-day").allergens, ["shellfish"]);
  assert.deepEqual(byId.get("crabcake-minis-all-day").allergens, ["shellfish"]);
  assert.deepEqual(byId.get("biscuits-and-gravy-brunch").allergens, ["egg", "gluten", "wheat"]);
  assert.deepEqual(byId.get("spring-bucatini-all-day").allergens, ["gluten", "milk", "wheat"]);
  assert.deepEqual(byId.get("seared-salmon-all-day").allergens, ["fish"]);
  assert.deepEqual(byId.get("chocolate-lava-cake-all-day").allergens, ["milk"]);
  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.launchQualityStatus, "published");
  assert.equal(restaurant.launchRemediationBucket, "none");
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Art and Soul/.test(repair.note ?? "")
    ).length,
    1,
  );
});
