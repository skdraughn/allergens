import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the verified current Arepa Zone DC catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === "arepa-zone-dc");
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.items.length, 75);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 75);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 14);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T09:41:45.995Z");
  assert.equal(restaurant.sourceFamily, "verified-arepa-zone-dc-current-menu-allergen");
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-allergen-menu").length, 33);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length, 1);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "unavailable").length, 41);
  assert.equal(restaurant.items.filter((item) => item.mayContain.length > 0).length, 30);

  assert.deepEqual(byName.get("Tequeños de Queso").allergens, ["egg", "gluten", "milk", "soy", "wheat"]);
  assert.deepEqual(byName.get("Tequeños de Queso").mayContain, []);
  assert.deepEqual(byName.get("Pernil Arepa").allergens, ["fish", "milk", "soy"]);
  assert.deepEqual(byName.get("Pernil Arepa").mayContain, ["egg", "gluten", "wheat"]);
  assert.deepEqual(byName.get("Carne Mechada Arepa").allergens, []);
  assert.deepEqual(byName.get("Carne Mechada Arepa").mayContain, ["egg", "gluten", "milk", "wheat"]);
  assert.equal(byName.get("Viuda Arepa").allergenSourceType, "official-global-cross-contact-note");
  assert.deepEqual(byName.get("Viuda Arepa").allergens, []);
  assert.deepEqual(byName.get("Viuda Arepa").mayContain, ["egg", "gluten", "milk", "wheat"]);
  assert.equal(byName.get("Cruzado de Res y Pollo (Sopa)").allergenSourceType, "unavailable");
  assert.equal(byName.get("Pepito Fondue").variantGroup, "Mosaico");
  assert.equal(byName.get("Sifrina Arepa").variantGroup, "Mosaico / 14th Street / Western Market");

  for (const present of ["Pabellón Bowl Beef", "Clásica Cachapa", "Tostones Trio", "Ovomaltina"]) {
    assert.equal(byName.has(present), true, present);
  }
  for (const absent of ["Albina", "Camarón", "Golfeados", "Patacón Viudo Tres Leches", "Perro Caraqueño Pepito Fondue"]) {
    assert.equal(byName.has(absent), false, absent);
  }

  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 2);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 15);
  assert.equal(restaurant.sourceStatus.frozenVariantMatchCount, 4);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 3);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 25);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 51);
  assert.equal(restaurant.sourceStatus.frozenFixedAllergenMismatchCount, 18);
  assert.equal(restaurant.sourceStatus.frozenCrossContactMismatchCount, 21);
  assert.equal(restaurant.sourceStatus.locationLimitedProductCount, 47);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: rebuilt Arepa Zone's DC-metro/.test(repair.note ?? "")
  ).length, 1);
});
