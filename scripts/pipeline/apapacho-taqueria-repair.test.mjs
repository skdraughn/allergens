import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "replacement-apapacho-taqueria-washington-dc";

test("publishes only the verified current Apapacho catalog", async () => {
  const repository = JSON.parse(
    await readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  );
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.name, "Apapacho Taqueria");
  assert.equal(restaurant.displayAddress, "1280 4th Street Northeast, Washington, DC 20002");
  assert.equal(restaurant.items.length, 40);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 40);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 7);
  assert.equal(restaurant.items.at(-1).category, "Non-Alcoholic Drinks");
  assert.equal(
    restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    14,
  );
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T07:44:59.987Z");
  assert.deepEqual(restaurant.sourceUrls, [
    "https://www.apapachotaqueria.com/",
    "https://www.apapachotaqueria.com/menu",
    "https://www.apapachotaqueria.com/s/order",
    "https://www.apapachotaqueria.com/app/store/api/v28/editor/users/149682741/sites/916428179789760537/products?page=1&per_page=200&include=images,media_files,discounts",
    "https://www.apapachotaqueria.com/uploads/b/7b001730-3593-11ef-a80d-fb22eb17238f/3a960d90-f595-11f0-9cc0-1bb54b8fbc87.pdf",
  ]);

  assert.deepEqual(byName.get("Tacos de Mushrooms").allergens, []);
  assert.deepEqual(byName.get("Fried Corn Quesadilla").allergens, ["milk"]);
  assert.deepEqual(byName.get("Chicken Milanesa").allergens, ["egg", "gluten", "wheat"]);
  assert.deepEqual(byName.get("Tacos de Baja Shrimp").allergens, [
    "egg",
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.deepEqual(byName.get("Kids Quesadilla").allergens, ["gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("Arroz con Leche").allergens, ["milk"]);
  assert.ok(byName.has("Chilaquiles"));
  assert.ok(byName.has("Seasonal Popsicle"));
  assert.ok(byName.has("Bottled Water"));
  assert.ok(byName.has("Sangria Señorial"));

  for (const rejectedName of [
    "8 course Tasting Dinner - Las Quince Letras X Apapacho",
    "Champurrado 1qt",
    "Cubetazo Tecate /Modelo",
    "Dia de Muertos Brunch",
    "PREPARE BEFORE I ARRIVE",
    "Tamal",
    "To go Modelo",
    "Tostada Reyna",
  ]) {
    assert.ok(!byName.has(rejectedName), rejectedName);
  }

  assert.equal(restaurant.sourceStatus.sourceInventoryProductCount, 80);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 16);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 6);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 7);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 35);
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Apapacho Taqueria/.test(repair.note ?? "")
    ).length,
    1,
  );
});
