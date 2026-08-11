import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "osm-aroma-banquet-1395623894";

test("publishes only the verified current Aroma Restaurant catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byName = new Map(restaurant.items.map((row) => [row.name, row]));

  assert.equal(restaurant.items.length, 99);
  assert.equal(new Set(restaurant.items.map((row) => row.id)).size, 99);
  assert.equal(new Set(restaurant.items.map((row) => row.category)).size, 15);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T11:05:27.183Z");
  assert.equal(restaurant.sourceFamily, "verified-aroma-banquet-owner-menu");
  assert.equal(restaurant.guideLabel, "Current Aroma dine-in menu");
  assert.equal(
    restaurant.items.filter((row) => row.allergenSourceType === "official-ingredients").length,
    63,
  );
  assert.equal(
    restaurant.items.filter((row) => (row.inferredAllergenSignals ?? []).length > 0).length,
    4,
  );
  assert.equal(restaurant.items.every((row) => row.mayContain.length === 0), true);

  for (const name of [
    "Mint & Coriander",
    "Tamarind",
    "Matter Pulao",
    "Gulab Jamoon",
    "Tandoori Batair",
    "Scallop Balchao Curry",
  ]) assert.equal(byName.has(name), true, name);
  for (const name of [
    "Get More Form Submissions",
    "Beats & Bites",
    "Perfume Making",
    "House Dressings",
    "Chili Rellieno",
    "Salmon en Cilantro",
    "Seekh Kebab Taquitos",
    "Soft Tacos",
    "Spinach & Potato Taquitos",
  ]) assert.equal(byName.has(name), false, name);

  assert.deepEqual(byName.get("Bagara Baigan").allergens, ["peanut", "sesame"]);
  assert.deepEqual(byName.get("Coco Mussel Curry").allergens, ["shellfish"]);
  assert.deepEqual(byName.get("Gajjar Halwa").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byName.get("Hakka Noodles").allergens, ["gluten", "soy", "wheat"]);
  assert.deepEqual(byName.get("Vegetable Biryani").allergens, ["milk"]);
  assert.deepEqual(byName.get("Shrimp Biryani").allergens, ["milk", "shellfish"]);
  assert.deepEqual(byName.get("Sarso Ka Saag").allergens, []);
  assert.equal(byName.get("Sarso Ka Saag").allergenSourceType, "unavailable");
  assert.deepEqual(
    byName.get("Chicken Lolipop").inferredAllergenSignals.map((signal) => signal.id),
    ["wheat", "gluten"],
  );

  assert.equal(restaurant.sourceStatus.sourceMenuCount, 2);
  assert.equal(restaurant.sourceStatus.sourceSectionCount, 30);
  assert.equal(restaurant.sourceStatus.sourceItemCount, 220);
  assert.equal(restaurant.sourceStatus.dineInPresentationCount, 99);
  assert.equal(restaurant.sourceStatus.orderingPresentationCount, 90);
  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 94);
  assert.equal(restaurant.sourceStatus.frozenNormalizedMatchCount, 1);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 10);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 5);
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 95);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 4);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 17);
  assert.equal(restaurant.sourceStatus.frozenProvenanceMismatchCount, 10);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 95);
  assert.equal(restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
    /Verified repair: rebuilt Aroma Restaurant Bar & Banquet/.test(repair.note ?? "")
  ).length, 1);
});
