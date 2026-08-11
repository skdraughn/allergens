import assert from "node:assert/strict";
import test from "node:test";

import { buildArtAndSoulAuditSnapshot } from "./art-and-soul-audit-catalog.mjs";

test("builds the exact current Art and Soul catalog from hashed owner pages", async () => {
  const snapshot = await buildArtAndSoulAuditSnapshot({
    retrievedAt: "2026-07-15T12:00:00.000Z",
  });
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));

  assert.equal(snapshot.restaurantId, "art-and-soul-dc");
  assert.equal(snapshot.presentationCount, 57);
  assert.equal(snapshot.itemCount, 54);
  assert.equal(snapshot.consolidatedPresentationCount, 3);
  assert.equal(snapshot.sourceUrls.length, 4);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 54);
  assert.deepEqual(snapshot.sourceStats.map((source) => source.productCount), [27, 29, 1]);
  assert.equal(snapshot.sourceStats.reduce((sum, source) => sum + source.discardedRowCount, 0), 6);

  for (const id of [
    "crispy-brussels-sprouts-all-day",
    "cinnamon-roll-brunch",
    "fruit-brunch",
    "grits-brunch",
    "breakfast-buffet",
    "angus-burger-all-day",
    "angus-burger-brunch",
    "fried-chicken-sandwich-all-day",
    "fried-chicken-sandwich-brunch",
  ]) assert.ok(byId.has(id), id);

  assert.equal(byId.has("add-ons-all-day"), false);
  assert.equal(byId.has("additions-brunch"), false);
  assert.equal(byId.has("each-brunch"), false);
  assert.equal(byId.has("hot-items-breakfast"), false);
  assert.equal(byId.get("caesar-salad").sourceUrls.length, 2);
  assert.equal(byId.get("wedge-salad").sourceUrls.length, 2);
  assert.equal(byId.get("mac-and-cheese").sourceUrls.length, 2);
  assert.deepEqual(byId.get("breakfast-buffet").allergens.sort(), ["egg", "gluten", "milk", "wheat"]);
  assert.deepEqual(byId.get("capitol-crabcake-all-day").allergens, ["shellfish"]);
  assert.deepEqual(byId.get("spring-bucatini-all-day").allergens.sort(), ["gluten", "milk", "wheat"]);
  assert.deepEqual(byId.get("biscuits-and-gravy-brunch").allergens.sort(), ["egg", "gluten", "wheat"]);
  assert.deepEqual(byId.get("french-toast-brunch").allergens.sort(), ["gluten", "milk", "wheat"]);
});
