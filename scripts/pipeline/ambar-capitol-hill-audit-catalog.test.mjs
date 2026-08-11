import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAmbarCapitolHillAuditSnapshot,
  restaurantIdAmbarCapitolHill,
  sourceUrlsAmbarCapitolHill,
} from "./ambar-capitol-hill-audit-catalog.mjs";

const snapshot = buildAmbarCapitolHillAuditSnapshot({ retrievedAt: "2026-07-15T01:00:00.000Z" });
const byName = new Map(snapshot.items.map((item) => [item.name, item]));

test("AMBAR Capitol Hill snapshot freezes the complete current food and nonalcoholic catalog", () => {
  assert.equal(snapshot.restaurantId, restaurantIdAmbarCapitolHill);
  assert.equal(snapshot.itemCount, 104);
  assert.equal(snapshot.presentationCount, 267);
  assert.equal(snapshot.categoryCount, 22);
  assert.equal(snapshot.ingredientSignalCount, 72);
  assert.equal(snapshot.unavailableAllergenCount, 32);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 104);
  assert.equal(snapshot.itemNameFingerprint.length, 64);
  assert.match(snapshot.sourceWarning, /free-from\/accommodation guides, not contains matrices/i);
  assert.match(snapshot.sourceWarning, /Missing free-from icons are not inverted/i);
});

test("AMBAR current source set is location-specific and uses the linked 2026 documents", () => {
  assert.equal(sourceUrlsAmbarCapitolHill.location, "https://ambarrestaurant.com/ambarcapitolhill");
  assert.equal(sourceUrlsAmbarCapitolHill.online, "https://ambarrestaurant.com/menu/ambarcapitolhill");
  assert.match(sourceUrlsAmbarCapitolHill.aLaCarte, /^https:\/\/static-content\.owner\.com\/document\/.+\.pdf$/);
  assert.match(sourceUrlsAmbarCapitolHill.allergyLunchDinner, /^https:\/\/static-content\.owner\.com\/document\/.+\.pdf$/);
  assert.ok(!snapshot.items.some((item) => ["Krempita", "Lamb Pizza", "Balkan Style Rice", "Mixed Meat"].includes(item.name)));
  assert.ok(!snapshot.items.some((item) => /wine|rakia|mimosa|sangria|old fashioned|margarita/i.test(item.name)));
});

test("AMBAR direct ingredient and visually reviewed guide semantics fix the frozen allergen defects", () => {
  assert.deepEqual(byName.get("Kajmak").allergens, ["milk"]);
  assert.deepEqual(byName.get("Fried Chicken").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Cheese Pie").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Cauliflower").allergens, ["tree-nut", "sesame"]);
  assert.deepEqual(byName.get("Tomato Soup").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byName.get("Hanger Steak").allergens, ["mustard"]);
  assert.deepEqual(byName.get("Olivier Spread").allergens, ["egg", "mustard"]);
  assert.deepEqual(byName.get("Mushroom Flatbread").allergens, ["milk", "wheat", "gluten"]);
  assert.ok(!byName.get("Mushroom Flatbread").allergens.includes("shellfish"));
});

test("AMBAR free-from symbols do not create unsupported fixed contains or may-contain claims", () => {
  assert.deepEqual(byName.get("Ajvar").allergens, []);
  assert.deepEqual(byName.get("Ajvar").mayContain, []);
  assert.equal(byName.get("Ajvar").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Handcut Fries").allergens, []);
  assert.equal(byName.get("Handcut Fries").allergenSourceType, "unavailable");
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
});

test("AMBAR same-name service variants remain auditable", () => {
  const roastedLamb = byName.get("Roasted Lamb");
  assert.deepEqual(roastedLamb.allergens, ["milk"]);
  assert.ok(roastedLamb.sourceUrls.includes(sourceUrlsAmbarCapitolHill.online));
  assert.ok(roastedLamb.sourceUrls.includes(sourceUrlsAmbarCapitolHill.aLaCarte));
  assert.ok(roastedLamb.presentations.length >= 4);

  const atHome = byName.get("Seafood From the Grill");
  assert.equal(atHome.isConfigurable, true);
  assert.deepEqual(atHome.allergens, ["wheat", "gluten", "fish", "shellfish"]);
});
