import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "artie-s-fairfax-va-dc-metro";

test("publishes only the verified current Artie's catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const byId = new Map(restaurant.items.map((item) => [item.id, item]));

  assert.equal(restaurant.items.length, 60);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 60);
  assert.equal(restaurant.sourceStatus.canonicalProductCount, 60);
  assert.equal(restaurant.sourceStatus.sourcePresentationCount, 170);
  assert.deepEqual(restaurant.sourceStatus.sourcePresentationCounts, {
    site: 0,
    lunch: 53,
    dinner: 52,
    gsLunch: 32,
    gsDinner: 33,
  });
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 52);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 8);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 4);
  assert.equal(restaurant.sourceStatus.frozenStaleExtraCount, 3);
  assert.equal(restaurant.sourceStatus.frozenAllergenOrProvenanceMismatchCount, 45);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length, 49);
  assert.equal(restaurant.items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length, 11);
  assert.equal(restaurant.items.filter((item) => item.mayContain.includes("gluten")).length, 37);

  for (const id of [
    "community-bread-basket",
    "field-greens",
    "gluten-free-penne-pasta-red-sauce",
    "simply-grilled-absolutely-fresh-fish",
    "low-country-beef-back-ribs",
    "filet-mignon-bearnaise",
    "blackened-prime-rib",
  ]) assert.ok(byId.has(id), id);

  for (const name of [
    "4 Ozzie rolls with Honey Butter",
    "Cole Slaw",
    "Crumb fried & tossed with thin beans & spicy pepper jelly",
    "hot off the wood grill with Reggiano parmesan & fresh garlic croutons",
    "lettuce, mayo, pickles, mustard & fries",
    "Ozzie Rolls",
    "remoulade sauce, fries & cole slaw",
  ]) assert.equal(restaurant.items.some((item) => item.name === name), false, name);

  assert.deepEqual(byId.get("brunch-burger").allergens, ["egg", "gluten", "milk", "wheat"]);
  assert.deepEqual(byId.get("pecan-crusted-trout").allergens, ["fish", "tree-nut"]);
  assert.deepEqual(byId.get("gluten-free-penne-pasta-red-sauce").mayContain, ["gluten"]);
  assert.deepEqual(byId.get("community-bread-basket").mayContain, []);
  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.launchQualityStatus, "published");
  assert.equal(restaurant.launchRemediationBucket, "none");
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Artie's/.test(repair.note ?? "")
    ).length,
    1,
  );
});
