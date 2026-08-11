import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the verified current Armetta's catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find(
    (row) => row.id === "osm-armetta-s-italian-pizzeria-3935138350",
  );
  const byName = new Map(restaurant.items.map((row) => [row.name, row]));

  assert.equal(restaurant.items.length, 225);
  assert.equal(new Set(restaurant.items.map((row) => row.id)).size, 225);
  assert.equal(new Set(restaurant.items.map((row) => row.category)).size, 19);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T10:27:30.497Z");
  assert.equal(restaurant.sourceFamily, "verified-armettas-current-owner-menu");
  assert.equal(restaurant.items.filter((row) => row.allergenSourceType === "official-ingredients").length, 191);
  assert.equal(restaurant.items.filter((row) => row.allergenSourceType === "unavailable").length, 34);
  assert.equal(restaurant.items.filter((row) => row.isConfigurable).length, 42);
  assert.equal(restaurant.items.every((row) => row.mayContain.length === 0), true);
  assert.equal(restaurant.items.at(-1).category, "To Go Drinks");

  assert.deepEqual(byName.get("Lunch Create Your Own Pasta").allergens, []);
  assert.deepEqual(byName.get("Arancini").allergens, ["gluten", "wheat"]);
  assert.deepEqual(byName.get("Chicken Wings").allergens, ["gluten", "wheat"]);
  assert.deepEqual(byName.get("Cheeseburger").allergens, ["gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("Onion Rings").allergens, ["gluten", "wheat"]);
  assert.deepEqual(byName.get("Seafood Gnocchi").allergens, ["milk", "shellfish"]);
  assert.deepEqual(byName.get("Honey Mustard").allergens, ["mustard"]);
  assert.equal(byName.get("Caesar Dressing").allergenSourceType, "unavailable");
  for (const name of ["Lunch Rigatoni Vodka", "Oreo cake", "Sicilian Soda", "Side Alfredo Sauce 4oz"]) {
    assert.equal(byName.has(name), true, name);
  }
  for (const name of ["All Drums", "Feta", "Spinach", "Chef Salad", "Tartufo"]) {
    assert.equal(byName.has(name), false, name);
  }

  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 186);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 5);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 47);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 34);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 142);
  assert.equal(restaurant.sourceStatus.frozenProvenanceMismatchCount, 29);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 80);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: rebuilt Armetta's current owner menu/.test(repair.note ?? "")
  ).length, 1);
});
