import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "osm-aracosia-3584164912";

test("publishes only the verified current Aracosia catalog", async () => {
  const repository = JSON.parse(
    await readFile(
      new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
      "utf8",
    ),
  );
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const byName = new Map(restaurant.items.map((item) => [item.name, item]));

  assert.equal(restaurant.items.length, 107);
  assert.equal(new Set(restaurant.items.map((item) => item.id)).size, 107);
  assert.equal(new Set(restaurant.items.map((item) => item.category)).size, 12);
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T08:52:19.828Z");
  assert.equal(restaurant.sourceFamily, "verified-aracosia-wix-menu");
  assert.equal(
    restaurant.items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    57,
  );
  assert.equal(
    restaurant.items.filter((item) => item.inferredAllergenSignals?.length > 0).length,
    27,
  );
  assert.equal(restaurant.items.every((item) => item.mayContain.length === 0), true);

  assert.equal(byName.get("Afghania Chicken").category, "Qormas");
  assert.equal(byName.get("Baadenjaan").category, "Sides");
  assert.equal(byName.get("Firni").category, "Desserts");
  assert.deepEqual(byName.get("Firni").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(
    byName.get("Marinated Salmon (1lb) - READY TO GRILL, BBQ, COOK").allergens,
    ["fish"],
  );
  assert.deepEqual(byName.get("Bistro Signature Lentil Soup").allergens, ["milk"]);
  assert.deepEqual(byName.get("Bistro Burger").allergens, []);
  assert.deepEqual(
    byName.get("Bistro Burger").inferredAllergenSignals.map((signal) => signal.id),
    ["gluten", "wheat", "egg", "milk"],
  );
  assert.deepEqual(byName.get("Shorwa Watanee").allergens, []);
  assert.deepEqual(
    byName.get("Shorwa Watanee").inferredAllergenSignals.map((signal) => signal.id),
    ["gluten", "wheat"],
  );
  assert.equal(
    (byName.get("Sabzi").inferredAllergenSignals ?? []).some((signal) => signal.id === "mustard"),
    false,
  );

  for (const present of [
    "Firni",
    "Marinated Beef Tenderloin (1lb) - READY TO GRILL, BBQ, COOK.",
    "Marinated Chicken Breast (1lb) - READY TO GRILL, BBQ, COOK.",
    "Marinated Salmon (1lb) - READY TO GRILL, BBQ, COOK",
  ]) {
    assert.equal(byName.has(present), true, present);
  }
  for (const absent of [
    "Kids Beef Bistro Burger",
    "Kids Chicken Lawaan",
    "Saffron Chicken",
    "Kichir-e-Quroot",
    "Mother's Day Special",
    "Billecart Salmon, Rosé, Champagne, NV",
  ]) {
    assert.equal(byName.has(absent), false, absent);
  }

  assert.equal(restaurant.sourceStatus.sourceMenuCount, 8);
  assert.equal(restaurant.sourceStatus.sourceSectionCount, 40);
  assert.equal(restaurant.sourceStatus.sourceItemCount, 334);
  assert.equal(restaurant.sourceStatus.visibleMenuCount, 4);
  assert.equal(restaurant.sourceStatus.visiblePresentationCount, 194);
  assert.equal(restaurant.sourceStatus.visibleUniqueNameCount, 124);
  assert.equal(restaurant.sourceStatus.frozenExactMatchCount, 98);
  assert.equal(restaurant.sourceStatus.frozenVariantMatchCount, 18);
  assert.equal(restaurant.sourceStatus.frozenStaleProductCount, 23);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 9);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 33);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 99);
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Aracosia/.test(repair.note ?? "")
    ).length,
    1,
  );
});
