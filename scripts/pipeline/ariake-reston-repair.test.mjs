import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the verified current Ariake Reston catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((row) => row.id === "ariake-japanese-restaurant-reston-va-dc-metro");
  const byName = new Map(restaurant.items.map((row) => [row.name, row]));

  assert.equal(restaurant.items.length, 235);
  assert.equal(new Set(restaurant.items.map((row) => row.id)).size, 235);
  assert.equal(new Set(restaurant.items.map((row) => row.category)).size, 23);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T10:06:39.227Z");
  assert.equal(restaurant.sourceFamily, "verified-ariake-reston-current-menu");
  assert.equal(restaurant.items.filter((row) => row.allergenSourceType === "official-ingredients").length, 186);
  assert.equal(restaurant.items.filter((row) => row.allergenSourceType === "unavailable").length, 49);
  assert.equal(restaurant.items.every((row) => row.mayContain.length === 0), true);

  assert.deepEqual(byName.get("Hire Katsu").allergens, ["milk"]);
  assert.deepEqual(byName.get("Kani").allergens, ["fish"]);
  assert.deepEqual(byName.get("Cashew Shrimp Tempura Roll").allergens, ["shellfish", "tree-nut"]);
  assert.deepEqual(byName.get("Dinner Bento Box").allergens, ["fish", "sesame", "shellfish"]);
  for (const name of ["Ton Katsu", "Sukiyaki (SEASONAL)", "Dinner Bento Box", "Takoyaki", "Aji", "Zuwaigani"]) {
    assert.equal(byName.has(name), true, name);
  }
  for (const name of ["FAIRFAX ONLINE ORDERING HOURS:", "Albacore Tataki", "Alaskan Salmon Roll", "Miller Light", "Wanna Roll Youth Medium"]) {
    assert.equal(byName.has(name), false, name);
  }

  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 117);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 55);
  assert.equal(restaurant.sourceStatus.frozenVariantMatchCount, 2);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 6);
  assert.equal(restaurant.sourceStatus.frozenLocationMismatchCount, 10);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 67);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 141);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 150);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: rebuilt Ariake Reston/.test(repair.note ?? "")
  ).length, 1);
});
