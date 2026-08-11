import assert from "node:assert/strict";
import test from "node:test";

import { buildAsiaGardenAuditSnapshot } from "./asia-garden-audit-catalog.mjs";

test("builds Asia Garden from real menu-item names and excludes vendor AI descriptions", async () => {
  const snapshot = await buildAsiaGardenAuditSnapshot({ retrievedAt: "2026-07-15T12:57:00.000Z" });
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));

  assert.equal(snapshot.restaurantId, "osm-asia-garden-11366360044");
  assert.equal(snapshot.itemCount, 242);
  assert.equal(snapshot.lunchPresentationCount, 36);
  assert.equal(snapshot.allDayPresentationCount, 206);
  assert.equal(snapshot.categoryCount, 21);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 242);
  assert.equal(snapshot.rawDescriptionCount, 46);
  assert.equal(snapshot.ignoredCachedAIDescriptionCount, 154);
  assert.equal(snapshot.officialItemCount, 0);
  assert.equal(snapshot.unavailableAllergenCount, 242);
  assert.equal(snapshot.configurableItemCount, 180);
  assert.deepEqual(snapshot.categories.slice(-2), ["Beverages", "Soda"]);
  assert.ok(snapshot.items.slice(-13).every((item) => ["Beverages", "Soda"].includes(item.category)));

  assert.ok(byId.has("chicken-with-broccoli-lunch-special"));
  assert.equal(byId.get("chicken-with-broccoli-lunch-special").description, null);
  assert.equal(byId.get("egg-foo-young-lunch-special").description, "Choice of chicken, beef, shrimp, pork or vegetable");
  assert.ok(byId.has("coke-beverages"));
  assert.ok(byId.has("coke-soda"));
  assert.ok(byId.has("general-tso-s-chicken-chef-s-specialties"));
  assert.ok(byId.has("general-tso-s-chicken-party-tray"));

  for (const id of [
    "fried-jumbo-shrimp-4",
    "chicken-with-cashew-nut",
    "kung-pao-chicken",
    "shrimp-with-lobster-sauce",
    "crab-rangoon-6",
  ]) {
    assert.equal(byId.get(id).allergenSourceType, "unavailable", id);
    assert.deepEqual(byId.get(id).allergens, [], id);
  }
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
  for (const artifactName of [
    "Crispy fried jumbo shrimp served hot and golden",
    "Tender beef and steamed broccoli in a flavorful sauce",
    "OFTEN LIKED",
    "POPULAR",
  ]) assert.equal(snapshot.items.some((item) => item.name === artifactName), false, artifactName);
});
