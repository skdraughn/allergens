import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "osm-anthony-s-7464874523";

test("publishes only the verified Anthony's Falls Church snapshot", async () => {
  const repository = JSON.parse(
    await readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  );
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.items.length, 175);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 175);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 20);
  assert.equal(
    restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    129,
  );
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T06:48:00.000Z");
  assert.equal(restaurant.displayAddress, "3000 Annandale Rd, Falls Church, VA 22042");
  assert.deepEqual(restaurant.sourceUrls, [
    "https://anthonysrestaurantva.com/",
    "https://anthonysrestaurantva.com/menu",
  ]);
  assert.ok(!restaurant.items.some((item) => item.name === "KIDS"));
  assert.ok(!restaurant.items.some((item) => item.name === "Broccoli"));
  assert.ok(!restaurant.items.some((item) => item.name === "Thousand Island"));
  assert.ok(byName.has("WITH MEAT SAUCE"));
  assert.ok(byName.has("CHICKEN 6oz"));
  assert.deepEqual(byName.get("NEW YORK STEAK 10oz").allergens, []);
  assert.ok(byName.get("TILAPIA ALMANDINE").allergens.includes("tree-nut"));
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 18);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 9);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 80);
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Anthony's Falls Church/.test(repair.note ?? "")
    ).length,
    1,
  );
});
