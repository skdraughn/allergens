import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "replacement-antonelli-s-pizza-lorton-va";

test("publishes only the verified Antonelli's Pizza & Subs snapshot", async () => {
  const repository = JSON.parse(
    await readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  );
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.name, "Antonelli's Pizza & Subs");
  assert.equal(restaurant.items.length, 80);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 80);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 15);
  assert.equal(
    restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    73,
  );
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T07:07:51.896Z");
  assert.equal(restaurant.displayAddress, "8212 Gunston Corner Lane, Lorton, VA 22079");
  assert.deepEqual(restaurant.sourceUrls, [
    "https://antonellis-pizza.com/",
    "https://antonellis-pizza.com/menu/",
    "https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf",
  ]);
  assert.equal(restaurant.items.at(-1).category, "Beverages");
  assert.ok(!restaurant.items.some((item) => item.name === "Coupons"));
  assert.ok(!restaurant.items.some((item) => item.name === "GOURMET SPECIALTY PIZZAS"));
  assert.ok(!restaurant.items.some((item) => item.name === "Beer Bottle"));
  assert.ok(byName.has("NY Style Cheesecake"));
  assert.ok(byName.has("BAKED ZITI"));
  assert.deepEqual(byName.get("PLAIN CHEESE").allergens, ["gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("GRILLED CHICKEN SUB").allergens, ["egg", "gluten", "wheat"]);
  assert.deepEqual(byName.get("BOTTLED WATER").allergens, []);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 37);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 17);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 45);
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Antonelli's Pizza & Subs/.test(repair.note ?? "")
    ).length,
    1,
  );
});
