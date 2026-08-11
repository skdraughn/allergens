import assert from "node:assert/strict";
import test from "node:test";

import { buildAshburnBiryaniGrillAuditSnapshot } from "./ashburn-biryani-grill-audit-catalog.mjs";

test("builds the complete Ashburn-specific catalog without promoting linked-vendor text", async () => {
  const snapshot = await buildAshburnBiryaniGrillAuditSnapshot({ retrievedAt: "2026-07-15T12:42:27.788Z" });
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));

  assert.equal(snapshot.restaurantId, "ashburn-biryani-grill-ashburn-va-dc-metro");
  assert.equal(snapshot.itemCount, 155);
  assert.equal(snapshot.categoryCount, 14);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 155);
  assert.equal(snapshot.officialBrandMenuItemCount, 9);
  assert.equal(snapshot.officialIngredientCount, 5);
  assert.equal(snapshot.unavailableAllergenCount, 150);
  assert.equal(snapshot.soldOutItemCount, 14);
  assert.equal(snapshot.configurableItemCount, 130);
  assert.equal(snapshot.linkedCatalogIngredientArrayCount, 0);
  assert.equal(snapshot.linkedCatalogDietaryPreferenceCount, 0);
  assert.equal(snapshot.categories.at(-1), "Beverages");
  assert.ok(snapshot.items.slice(-14).every((item) => item.category === "Beverages"));

  assert.deepEqual(byId.get("paneer-biryani").allergens, ["milk"]);
  assert.deepEqual(byId.get("paneer-tikka").allergens, ["milk"]);
  assert.deepEqual(byId.get("fish-tikka").allergens, ["fish"]);
  assert.deepEqual(byId.get("hariyali-chicken").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byId.get("lababdar-paneer").allergens, ["milk"]);
  assert.equal(byId.get("paneer-biryani").allergenSourceType, "official-ingredients");

  for (const id of [
    "chicken-tikka-masala",
    "goat-curry",
    "butter-chicken",
    "chilli-shrimp",
    "shrimp-tikka",
  ]) {
    assert.equal(byId.get(id).allergenSourceType, "unavailable", id);
    assert.deepEqual(byId.get(id).allergens, [], id);
  }
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
  assert.ok(byId.get("ambur-mutton-biryani").currentlyOutOfStock);
  assert.ok(byId.has("chicken-sukka"));
  assert.ok(byId.has("bullet-naan"));
  assert.ok(byId.has("kothu-parotta"));
});
