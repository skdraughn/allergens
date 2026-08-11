import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "osm-asia-garden-11366360044";

test("publishes only Asia Garden's real current menu presentations", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const byId = new Map(restaurant.items.map((item) => [item.id, item]));

  assert.equal(restaurant.items.length, 242);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 242);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 21);
  assert.ok(restaurant.items.slice(-13).every((item) => ["Beverages", "Soda"].includes(item.category)));
  assert.ok(restaurant.items.every((item) => item.allergenSourceType === "unavailable"));
  assert.ok(restaurant.items.every((item) => item.allergens.length === 0));
  assert.ok(restaurant.items.every((item) => item.mayContain.length === 0));

  assert.ok(byId.has("chicken-with-broccoli-lunch-special"));
  assert.ok(byId.has("chicken-with-broccoli"));
  assert.ok(byId.has("chicken-with-broccoli-dinner-combo"));
  assert.ok(byId.has("general-tso-s-chicken-party-tray"));
  assert.ok(byId.has("coke-beverages"));
  assert.ok(byId.has("coke-soda"));
  assert.equal(byId.get("fried-jumbo-shrimp-4").allergenSourceType, "unavailable");
  assert.equal(byId.get("chicken-with-cashew-nut").allergenSourceType, "unavailable");

  for (const artifactName of [
    "Choice of chicken, beef, shrimp, pork",
    "Crispy fried chicken tossed in a sweet and spicy sesame sauce",
    "Crispy fried jumbo shrimp served hot and golden",
    "OFTEN LIKED",
    "POPULAR",
    "Tender beef and steamed broccoli in a flavorful sauce",
  ]) assert.equal(restaurant.items.some((item) => item.name === artifactName), false, artifactName);

  assert.equal(restaurant.sourceStatus.canonicalProductCount, 242);
  assert.equal(restaurant.sourceStatus.sourcePresentationCount, 242);
  assert.equal(restaurant.sourceStatus.consumerCategoryCount, 21);
  assert.equal(restaurant.sourceStatus.lunchPresentationCount, 36);
  assert.equal(restaurant.sourceStatus.allDayPresentationCount, 206);
  assert.equal(restaurant.sourceStatus.rawOrderingDescriptionCount, 46);
  assert.equal(restaurant.sourceStatus.ignoredCachedAIDescriptionCount, 154);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 22);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 242);
  assert.equal(restaurant.sourceStatus.frozenSpuriousOfficialIngredientArtifactCount, 7);
  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.launchQualityStatus, "published");
  assert.equal(restaurant.launchRemediationBucket, "none");
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Asia Garden/.test(repair.note ?? "")
    ).length,
    1,
  );
});
