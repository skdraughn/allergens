import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the verified current Aroma Pizza catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find(
    (row) => row.id === "aroma-pizza-lorton-dc-metro",
  );
  const byName = new Map(restaurant.items.map((row) => [row.name, row]));

  assert.equal(restaurant.items.length, 199);
  assert.equal(new Set(restaurant.items.map((row) => row.id)).size, 199);
  assert.equal(new Set(restaurant.items.map((row) => row.category)).size, 16);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T10:40:29.922Z");
  assert.equal(restaurant.sourceFamily, "verified-aroma-pizza-current-toast-menu");
  assert.equal(restaurant.guideLabel, "Current restaurant-linked Toast menu");
  assert.equal(restaurant.items.every((row) => row.allergenSourceType === "unavailable"), true);
  assert.equal(restaurant.items.every((row) => row.allergens.length === 0), true);
  assert.equal(restaurant.items.every((row) => row.mayContain.length === 0), true);
  assert.equal(restaurant.items.at(-1).category, "Drinks");

  for (const name of [
    "Chicken",
    "10'' Philly Steak Pizza",
    "Fries",
    "Steamed Broccoli",
    "Family deal 2 Large 1 topping pizzas, 10 wings & mozzarella sticks",
    "Can Soda",
    "AleoVera drink",
  ]) assert.equal(byName.has(name), true, name);
  for (const name of [
    "Wings",
    "Soup & Salad",
    "Baked Pastas",
    "Chicken pastas",
    "Chicken Pizza",
  ]) assert.equal(byName.has(name), false, name);

  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 163);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 7);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 8);
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 170);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 29);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 109);
  assert.equal(restaurant.sourceStatus.frozenProvenanceMismatchCount, 109);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 170);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: rebuilt Aroma Pizza Company Lorton's/.test(repair.note ?? "")
  ).length, 1);
});
