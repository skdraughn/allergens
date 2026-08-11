import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the reviewed Arepas Capitol catalog without official allergen overclaiming", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === "osm-arepas-capitol-12316378227");
  const byName = new Map(restaurant.items.map((entry) => [entry.name, entry]));

  assert.equal(restaurant.items.length, 85);
  assert.equal(new Set(restaurant.items.map((entry) => entry.id)).size, 85);
  assert.equal(new Set(restaurant.items.map((entry) => entry.category)).size, 13);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T09:56:29.610Z");
  assert.equal(restaurant.sourceFamily, "verified-arepas-capitol-reviewed-current-menu");
  assert.equal(restaurant.items.every((entry) => entry.allergenSourceType === "unavailable"), true);
  assert.equal(restaurant.items.every((entry) => entry.allergens.length === 0 && entry.mayContain.length === 0), true);
  assert.equal(restaurant.items.filter((entry) => entry.name === "8 Tostones").length, 1);

  assert.deepEqual(byName.get("Venezuelan Empanada - Queso").inferredAllergenSignals.map((signal) => signal.id), ["milk"]);
  assert.deepEqual(byName.get("Malta Polar (Venezuelan Malt)").inferredAllergenSignals.map((signal) => signal.id), ["gluten"]);
  assert.deepEqual(byName.get("Parrilla Mar Y Tierra").inferredAllergenSignals.map((signal) => signal.id), ["shellfish"]);
  for (const present of ["4 Tequeños", "Pabellon Criollo", "La Sifrina Burger", "Chicha (Cooked Rice with Milk Cream)"]) {
    assert.equal(byName.has(present), true, present);
  }
  for (const absent of ["Cachapa", "Cakes", "Empanadas", "Fresh Juices", "Pepito"]) {
    assert.equal(byName.has(absent), false, absent);
  }

  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 1);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 3);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 5);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 81);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 1);
  assert.equal(restaurant.sourceStatus.frozenProvenanceMismatchCount, 1);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 4);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: replaced Arepas Capitol's nine corrupted homepage tiles/.test(repair.note ?? "")
  ).length, 1);
});
