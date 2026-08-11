import assert from "node:assert/strict";
import test from "node:test";

import { buildAmbarClarendonAuditSnapshot, restaurantIdAmbarClarendon, sourceUrlsAmbarClarendon } from "./ambar-clarendon-audit-catalog.mjs";

const snapshot = buildAmbarClarendonAuditSnapshot({ retrievedAt: "2026-07-15T02:00:00.000Z" });
const byName = new Map(snapshot.items.map((item) => [item.name, item]));

test("AMBAR Clarendon snapshot freezes the complete current food and nonalcoholic catalog", () => {
  assert.equal(snapshot.restaurantId, restaurantIdAmbarClarendon);
  assert.equal(snapshot.itemCount, 98);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 98);
  assert.equal(snapshot.itemNameFingerprint.length, 64);
  assert.match(snapshot.sourceWarning, /D=dairy, G=gluten, N=nuts, SF=shellfish, E=eggs, and S=sesame/i);
  assert.match(snapshot.sourceWarning, /asterisk means that labeled allergen can be modified/i);
  assert.match(snapshot.sourceWarning, /titled Allergy Capitol and Clarendon - Lunch and Dinner/i);
});

test("AMBAR Clarendon uses its own current linked documents and location-specific online menu", () => {
  assert.equal(sourceUrlsAmbarClarendon.location, "https://ambarrestaurant.com/ambarclarendon");
  assert.equal(sourceUrlsAmbarClarendon.online, "https://ambarrestaurant.com/menu/ambarclarendon");
  assert.match(sourceUrlsAmbarClarendon.aLaCarte, /^https:\/\/static-content\.owner\.com\/document\/.+\.pdf$/);
  assert.ok(!snapshot.items.some((item) => ["Krempita", "Lamb Pizza", "Balkan Style Rice", "Mixed Meat", "Forest Mushroom Crepe"].includes(item.name)));
  assert.ok(!snapshot.items.some((item) => /wine|rakia|mimosa|sangria|old fashioned|margarita/i.test(item.name)));
});

test("AMBAR Clarendon preserves direct item allergen labels and narrow ingredient inferences", () => {
  assert.deepEqual(byName.get("Kajmak").allergens, ["milk", "egg", "wheat", "gluten", "sesame"]);
  assert.deepEqual(byName.get("Chicken Skewers").allergens, ["wheat", "gluten", "sesame"]);
  assert.deepEqual(byName.get("Fried Chicken").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Cheese Pie").allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Cauliflower").allergens, ["milk", "tree-nut", "gluten", "sesame"]);
  assert.deepEqual(byName.get("Tomato Soup").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byName.get("Hanger Steak").allergens, ["mustard"]);
  assert.deepEqual(byName.get("Mushroom Flatbread").allergens, ["milk", "wheat", "gluten"]);
  assert.ok(!byName.get("Mushroom Flatbread").allergens.includes("shellfish"));
});

test("AMBAR Clarendon distinguishes bare gluten codes from supported wheat formulations", () => {
  assert.deepEqual(byName.get("Veal Soup").allergens, ["milk", "gluten"]);
  assert.deepEqual(byName.get("Chicken Stroganoff").allergens, ["milk", "gluten", "mustard"]);
  assert.deepEqual(byName.get("Beef Goulash").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Pan-Seared Trout").allergens, ["fish", "shellfish"]);
  assert.deepEqual(byName.get("Heineken N/A").allergens, []);
  assert.equal(byName.get("Heineken N/A").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Heineken N/A").inferredAllergenSignals.map((signal) => signal.id), ["gluten"]);
  assert.ok(!byName.get("Heineken N/A").inferredAllergenSignals.some((signal) => signal.id === "wheat"));
  assert.match(byName.get("Heineken N/A").sourceSummary, /Ingredient Intelligence/i);
  assert.match(byName.get("Heineken N/A").sourceSummary, /not promoted to restaurant-issued/i);
  assert.equal(byName.get("Heineken N/A").evidence[0].sourceKind, "manufacturer-product-ingredients");
  assert.ok(byName.get("Heineken N/A").sourceUrls.includes(sourceUrlsAmbarClarendon.heinekenProduct));
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
});

test("AMBAR Clarendon retains current service variants and configurable packages", () => {
  const balkanKebab = byName.get("Balkan Kebab");
  assert.ok(balkanKebab.sourceUrls.includes(sourceUrlsAmbarClarendon.aLaCarte));
  assert.ok(balkanKebab.sourceUrls.includes(sourceUrlsAmbarClarendon.online));
  assert.ok(balkanKebab.presentations.length >= 5);
  const seafood = byName.get("Seafood From the Grill");
  assert.equal(seafood.isConfigurable, true);
  assert.deepEqual(seafood.allergens, ["fish", "shellfish", "wheat", "gluten"]);
});
