import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAmoosAuditSnapshot,
  sourceUrlsAmoos,
} from "./amoos-restaurant-audit-catalog.mjs";

const snapshot = await buildAmoosAuditSnapshot({ retrievedAt: "2026-07-15T02:40:00.000Z" });
const byName = new Map(snapshot.items.map((item) => [item.name, item]));

test("Amoo's current exact-address delivery catalog is complete", () => {
  assert.equal(snapshot.currentStore.name, "Amoo's Restaurant");
  assert.equal(snapshot.currentStore.address, "6271 Old Dominion Dr, McLean, VA 22101");
  assert.equal(snapshot.itemCount, 71);
  assert.equal(snapshot.categoryCount, 13);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 71);
  assert.ok(snapshot.items.every((item) => item.name && item.category));
});

test("Amoo's keeps beverages at the end of the catalog", () => {
  const categories = [...new Set(snapshot.items.map((item) => item.category))];
  assert.equal(categories.at(-1), "Beverages");
  assert.equal(snapshot.items.filter((item) => item.category === "Beverages").length, 7);
});

test("Amoo's current homepage corroborates exactly six formulations", () => {
  assert.equal(snapshot.officialFeaturedCount, 6);
  for (const name of [
    "Koobideh",
    "Family Platter for 2",
    "Saffron Chicken",
    "Chimichurri Chicken",
    "Shirazi Salad",
    "Persian Saffron Ice Cream",
  ]) {
    assert.ok(byName.get(name).sourceUrls.includes(sourceUrlsAmoos.home), name);
  }
});

test("Amoo's limits official positive allergen signals to current first-party wording", () => {
  assert.equal(snapshot.officialIngredientCount, 2);
  assert.equal(snapshot.unavailableAllergenCount, 69);
  assert.deepEqual(byName.get("Family Platter for 2").allergens, ["wheat", "gluten"]);
  assert.deepEqual(byName.get("Persian Saffron Ice Cream").allergens, ["milk", "tree-nut"]);
  assert.equal(byName.get("Saffron Chicken").allergenSourceType, "unavailable");
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
});

test("Amoo's never includes the mislinked Chopped NYC catalog", () => {
  for (const name of ["The Bronx Chop", "The Brooklyn Chop", "Bacon Cheese Fries"] ) {
    assert.ok(!byName.has(name), name);
  }
  assert.ok(byName.has("Fesenjan"));
  assert.ok(byName.has("Pesto Chicken Kabob"));
  assert.ok(byName.has("Branzino Fish"));
});

test("Amoo's keeps third-party descriptions separate as Ingredient Intelligence", () => {
  const pesto = byName.get("Pesto Chicken Kabob");
  assert.equal(pesto.allergenSourceType, "unavailable");
  assert.deepEqual(pesto.inferredAllergenSignals.map((signal) => signal.id).sort(), ["milk", "tree-nut"]);
  const chimichurri = byName.get("Extra Chimichurri Sauce");
  assert.deepEqual(chimichurri.inferredAllergenSignals, []);
  const soup = byName.get("Soupe Jo Kurdi");
  assert.deepEqual(soup.inferredAllergenSignals, [
    { id: "gluten", c: "high", e: ["menu:barley", "ingredient:barley"] },
    { id: "wheat", c: "medium", e: ["menu:noodles", "ingredient:noodles"] },
  ]);
});

test("Amoo's records current-source limitations explicitly", () => {
  assert.match(snapshot.sourceWarning, /download buttons have no links/i);
  assert.match(snapshot.sourceWarning, /Chopped NYC Ann Arbor/i);
  assert.match(snapshot.sourceWarning, /never promoted to official/i);
});
