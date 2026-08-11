import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "osm-asia-nine-1236156059";

test("publishes only Asia Nine's verified current owner-menu catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const byId = new Map(restaurant.items.map((item) => [item.id, item]));

  assert.equal(restaurant.items.length, 161);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 161);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 16);
  assert.ok(restaurant.items.slice(-7).every((item) => item.category === "Beverages"));
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length, 99);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "unavailable").length, 62);
  assert.ok(restaurant.items.every((item) => item.mayContain.length === 0));

  assert.deepEqual(byId.get("green-curry").allergens, []);
  assert.deepEqual(byId.get("yellow-curry").allergens, []);
  assert.deepEqual(byId.get("tom-kha").allergens, []);
  assert.deepEqual(byId.get("tom-yum").allergens, []);
  assert.deepEqual(byId.get("crab-stick-kani").allergens, []);
  assert.deepEqual(byId.get("crab-stick-kani").inferredAllergenSignals.map((signal) => signal.id), ["fish"]);
  assert.deepEqual(byId.get("crab-wonton").allergens, ["milk", "shellfish"]);
  assert.deepEqual(byId.get("crab-wonton").inferredAllergenSignals.map((signal) => signal.id), ["wheat", "gluten", "fish"]);
  assert.deepEqual(byId.get("tempura-udon-soup").allergens, ["egg", "fish", "soy"]);
  assert.deepEqual(byId.get("universe-tempura-roll-8pcs").allergens, ["fish", "milk"]);

  for (const id of [
    "edamame",
    "fried-calamari",
    "yellowtail-hamachi",
    "eel-avocado-roll-8pcs",
    "add-crunchy",
    "can-of-soda",
  ]) assert.ok(byId.has(id), id);
  for (const artifactName of [
    "Custom style",
    "Customize font",
    "Manage your customer reviews",
    "Respond to reviews",
    "Sell more with social proof",
    "Unlimited reviews",
  ]) assert.equal(restaurant.items.some((item) => item.name === artifactName), false, artifactName);

  assert.equal(restaurant.sourceStatus.canonicalProductCount, 161);
  assert.equal(restaurant.sourceStatus.consumerCategoryCount, 16);
  assert.equal(restaurant.sourceStatus.explicitOfficialIngredientCount, 99);
  assert.equal(restaurant.sourceStatus.unavailableAllergenCount, 62);
  assert.equal(restaurant.sourceStatus.ingredientIntelligenceRiskCount, 31);
  assert.equal(restaurant.sourceStatus.wixDemoCatalogItemCount, 21);
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 126);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 35);
  assert.equal(restaurant.sourceStatus.frozenAllergenOrProvenanceMismatchCount, 33);
  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.launchQualityStatus, "published");
  assert.equal(restaurant.launchRemediationBucket, "none");
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Asia Nine/.test(repair.note ?? "")
    ).length,
    1,
  );
});
