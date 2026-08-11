import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "ashburn-biryani-grill-ashburn-va-dc-metro";

test("publishes only the verified complete Ashburn catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const byId = new Map(restaurant.items.map((item) => [item.id, item]));

  assert.equal(restaurant.items.length, 155);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 155);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 14);
  assert.ok(restaurant.items.slice(-14).every((item) => item.category === "Beverages"));
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length, 5);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "unavailable").length, 150);
  assert.ok(restaurant.items.every((item) => item.mayContain.length === 0));

  assert.deepEqual(byId.get("paneer-biryani").allergens, ["milk"]);
  assert.deepEqual(byId.get("hariyali-chicken").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byId.get("fish-tikka").allergens, ["fish"]);
  assert.equal(byId.get("chicken-tikka-masala").allergenSourceType, "unavailable");
  assert.equal(byId.get("butter-chicken").allergenSourceType, "unavailable");
  assert.equal(byId.get("chilli-shrimp").allergenSourceType, "unavailable");
  assert.ok(byId.has("chicken-sukka"));
  assert.ok(byId.has("bullet-naan"));
  assert.ok(byId.has("kothu-parotta"));
  assert.ok(byId.has("ambur-mutton-biryani"));

  assert.equal(restaurant.sourceStatus.canonicalProductCount, 155);
  assert.equal(restaurant.sourceStatus.consumerCategoryCount, 14);
  assert.equal(restaurant.sourceStatus.explicitOfficialIngredientCount, 5);
  assert.equal(restaurant.sourceStatus.unavailableAllergenCount, 150);
  assert.equal(restaurant.sourceStatus.currentlySoldOutProductCount, 14);
  assert.equal(restaurant.sourceStatus.linkedCatalogIngredientArrayCount, 0);
  assert.equal(restaurant.sourceStatus.linkedCatalogDietaryPreferenceCount, 0);
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 11);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 144);
  assert.equal(restaurant.sourceStatus.frozenAllergenOrProvenanceMismatchCount, 0);
  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.launchQualityStatus, "published");
  assert.equal(restaurant.launchRemediationBucket, "none");
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: replaced Ashburn Biryani Grill/.test(repair.note ?? "")
    ).length,
    1,
  );
});
