import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "osm-artha-rini-45808686";

test("publishes only the verified current Artha Rini catalog", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);
  const byId = new Map(restaurant.items.map((row) => [row.id, row]));

  assert.equal(restaurant.items.length, 160);
  assert.equal(new Set(restaurant.items.map((row) => row.id)).size, 160);
  assert.equal(restaurant.sourceStatus.canonicalProductCount, 160);
  assert.deepEqual(restaurant.sourceStatus.sourceProductCounts, {
    main: 75, liwetan: 6, gudeg: 5, rijsttafel: 3, foodstall: 12, ricebox: 17, tumpeng: 2, jajanan: 40,
  });
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 49);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 111);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 12);
  assert.equal(restaurant.sourceStatus.frozenAllergenOrProvenanceMismatchCount, 50);
  assert.equal(restaurant.items.filter((row) => row.allergenSourceType === "official-ingredients").length, 113);
  assert.equal(restaurant.items.filter((row) => row.allergenSourceType === "official-global-cross-contact-note").length, 47);
  assert.ok(restaurant.items.every((row) => row.mayContain.length === 10));

  for (const id of [
    "pempek-kapal-selam-main", "rice-platter-padang-style-main", "nasi-gudeg-gudeg",
    "rijsttafel-menu-a-rijsttafel", "paket-nasi-bakar-ricebox",
    "tumpeng-with-7-selections-tumpeng", "kue-sus-chicken-ragout-jajanan",
  ]) assert.ok(byId.has(id), id);
  for (const name of [
    "Minimum order for dine-in: 4 portion", "Soup (16oz)", "Beverages/Desserts",
    "Indonesian Restaurant", "Regular Menu/Entrees", "Rice Platters", "Soups", "START FROM",
    "SUBSTITUTE SHRIMP NO HEAD (PEELED)", "WITHOUT RICE",
  ]) assert.equal(restaurant.items.some((row) => row.name === name), false, name);

  assert.deepEqual(byId.get("coconut-rice-main").allergens, []);
  assert.deepEqual(byId.get("emping-main").allergens, []);
  assert.deepEqual(byId.get("tilapia-saus-padang-main").allergens, ["fish", "shellfish"]);
  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.launchQualityStatus, "published");
  assert.equal(restaurant.launchRemediationBucket, "none");
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Artha Rini/.test(repair.note ?? "")
    ).length,
    1,
  );
});
