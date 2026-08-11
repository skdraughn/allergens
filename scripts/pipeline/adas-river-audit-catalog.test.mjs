import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAdasRiverAuditSnapshot } from "./adas-river-audit-catalog.mjs";

const restaurantId = "ada-s-on-the-river-alexandria-va-dc-metro";
const officialMenus = await readFile(
  `data/restaurant-verification/artifacts/${restaurantId}/official-structured-menus.json`,
  "utf8",
);
const snapshot = buildAdasRiverAuditSnapshot({ officialMenus });
const get = (name) => snapshot.items.find((item) => item.name === name);

test("builds Ada's complete compact current allergen-focused catalog", () => {
  assert.equal(snapshot.rawScopedItemCount, 155);
  assert.equal(snapshot.itemCount, 99);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, snapshot.itemCount);
  assert.equal(snapshot.items.some((item) => item.name === "House Steak Sauce"), false);
  assert.equal(snapshot.items.some((item) => /^Kids /i.test(item.name)), false);
  assert.equal(snapshot.items.some((item) => /Old Fashioned|Pinot Noir|Cabernet/i.test(item.name)), false);
});

test("consolidates duplicate meal presentations without losing source context", () => {
  assert.equal(snapshot.items.filter((item) => /Grilled Shrimp & Avocado/i.test(item.name)).length, 1);
  assert.equal(snapshot.items.filter((item) => /Seasonal Cheese Plate|Artisan Cheese Plate/i.test(item.name)).length, 1);
  assert.equal(get("14 oz, 75 Day Aged, NY Strip").sourceContexts.length, 2);
  assert.match(get("14 oz, 75 Day Aged, NY Strip").ingredientsText, /maître d' butter/i);
});

test("uses fixed positive evidence and ignores legends and optional add-ons", () => {
  assert.deepEqual(get("Coal-Roasted Asparagus").allergens, ["milk", "egg"]);
  assert.equal(get("Coal-Roasted Asparagus").allergens.includes("tree-nut"), false);
  assert.deepEqual(get("Grilled Shrimp & Avocado").allergens, ["shellfish", "tree-nut"]);
  assert.deepEqual(get("Artisan Cheese Plate").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(get("Hash Brown Pave").allergens, ["egg"]);
  assert.deepEqual(get("14 oz, 75 Day Aged, NY Strip").allergens, ["milk"]);
  assert.deepEqual(get("Seasonal Fruit & Yogurt").allergens, ["milk"]);
  assert.equal(get("Thick Cut Bacon").allergens.length, 0);
});

test("corrects mandatory-format and explicit ingredient signals", () => {
  assert.deepEqual(get("Beef Tartare").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("Tuna Tartare").allergens, ["milk", "fish", "wheat", "gluten"]);
  assert.deepEqual(get("Vanilla-Chai Creme Brulee").allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(get("Peanut Butter S'mores Cake").allergens, ["milk", "peanut", "wheat", "gluten"]);
  assert.equal(get("Peanut Butter S'mores Cake").allergens.includes("egg"), false);
  assert.deepEqual(get("Valrhona Chocolate Soufflé").allergens, ["milk", "egg"]);
});

test("keeps retained nonalcoholic beverages last", () => {
  const firstBeverage = snapshot.items.findIndex((item) => item.category.startsWith("Beverages ·"));
  assert.ok(firstBeverage > 0);
  assert.ok(snapshot.items.slice(firstBeverage).every((item) => item.category.startsWith("Beverages ·")));
  assert.equal(snapshot.items.slice(firstBeverage).length, 7);
  assert.ok(get("Heineken, 0.0, Lager, Nl, 0.0% Abv").allergens.includes("gluten"));
  assert.equal(get("Yuzu Jalapeño Mule").allergens.length, 0);
});
