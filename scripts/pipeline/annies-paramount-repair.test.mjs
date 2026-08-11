import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "annie-s-paramount-steak-house-washington-dc-dc-metro";

test("publishes only the verified Annie's Paramount snapshot", async () => {
  const repository = JSON.parse(
    await readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  );
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.items.length, 112);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 112);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 16);
  assert.equal(
    restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    88,
  );
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T06:28:14.628Z");
  assert.equal(restaurant.displayAddress, "1609 17th Street NW, Washington, DC 20009");
  assert.ok(!restaurant.items.some((item) => item.name === "ENTRÉE SALADS"));
  assert.ok(!restaurant.items.some((item) => item.name === "Rainbow Trout"));
  assert.ok(!restaurant.items.some((item) => item.name === "Heineken Zero"));
  assert.ok(!byName.get("Basil-Pine Nut Pesto Pasta").allergens.includes("shellfish"));
  assert.ok(!byName.get("Country Chicken Salad").allergens.includes("shellfish"));
  assert.deepEqual(byName.get("Grilled Atlantic Salmon").allergens, ["fish"]);
  assert.ok(!byName.get("Coconut Cream Pie").allergens.includes("tree-nut"));
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 9);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 17);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 29);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 59);
});
