import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "ap-pizza-shop-bethesda-dc-metro";

test("publishes only the verified AP Pizza Shop Bethesda snapshot", async () => {
  const repository = JSON.parse(
    await readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  );
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.name, "AP Pizza Shop");
  assert.equal(restaurant.items.length, 49);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 49);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 7);
  assert.equal(
    restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    46,
  );
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T07:26:50.728Z");
  assert.equal(restaurant.displayAddress, "4747 Bethesda Avenue, Bethesda, MD 20814");
  assert.deepEqual(restaurant.sourceUrls, [
    "https://allpurposedc.com/",
    "https://order.toasttab.com/online/ap-pizza-shop-bethesda",
  ]);
  assert.ok(!restaurant.items.some((item) => item.name === "Deck-Oven Slices"));
  assert.ok(!restaurant.items.some((item) => item.name === "Il Supremo"));
  assert.ok(!restaurant.items.some((item) => item.name === "Supremo Slice"));
  assert.ok(!restaurant.sourceUrls.some((url) => /r\.jina\.ai/.test(url)));
  assert.ok(byName.has("Duke #7"));
  assert.ok(byName.has("Pizza Kit"));
  assert.ok(byName.has("Pizza Dough"));
  assert.deepEqual(byName.get("The Tripper").allergens, ["fish", "gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("AP Caesar").allergens, ["fish", "gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("Pizza Dough").allergens, ["gluten", "wheat"]);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 2);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 7);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 11);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 27);
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt AP Pizza Shop Bethesda/.test(repair.note ?? "")
    ).length,
    1,
  );
});
