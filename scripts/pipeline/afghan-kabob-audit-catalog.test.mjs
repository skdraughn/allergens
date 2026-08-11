import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAfghanKabobAuditSnapshot,
  parseAfghanKabobRepasMenu,
} from "./afghan-kabob-audit-catalog.mjs";

const restaurantId = "osm-afghan-kabob-3359956639";
const menuPayload = JSON.parse(await readFile(
  `data/restaurant-verification/artifacts/${restaurantId}/restaurant-linked-repas-menu.json`,
  "utf8",
));
const snapshot = buildAfghanKabobAuditSnapshot({ menuPayload });
const get = (name) => snapshot.items.find((item) => item.name === name);

test("parses the complete current linked catalog", () => {
  assert.equal(parseAfghanKabobRepasMenu(menuPayload).length, 58);
  assert.equal(snapshot.itemCount, 58);
  assert.equal(snapshot.categoryCount, 9);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 58);
});

test("removes page fragments and restores current categories and products", () => {
  assert.equal(snapshot.items.some((item) => item.name === "Our office"), false);
  assert.equal(snapshot.items.some((item) => item.name === "Fried eggplant served with yogurt and Afghan tandoori bread"), false);
  assert.ok(get("BOOLAWNEE"));
  assert.ok(get("TILAPIA FISH KABOB"));
  assert.ok(get("CHICKEN LUNCH SPECIAL"));
  assert.ok(get("BOTTLE WATER"));
});

test("maps fixed linked ingredients and mandatory formats without inventing egg", () => {
  assert.deepEqual(get("AUSHAK (6 PIECES)").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("BORANI BANJAN").allergens, ["milk"]);
  assert.deepEqual(get("HUMMUS").allergens, ["sesame"]);
  assert.deepEqual(get("MASHAWA SOUP").allergens, ["milk"]);
  assert.deepEqual(get("TILAPIA FISH KABOB").allergens, ["fish"]);
  assert.ok(snapshot.items.every((item) => !item.allergens.includes("egg")));
});

test("keeps optional bread choices off fixed signals and preserves fixed bread", () => {
  assert.deepEqual(get("FLAME KABOB").allergens, []);
  assert.deepEqual(get("AFGHAN GYRO").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("VEGETARIAN CURRY").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("NAN").allergens, ["wheat", "gluten"]);
});

test("maps dessert signals conservatively", () => {
  assert.deepEqual(get("BAQLAWA").allergens, ["tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("FIRNEE").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(get("JELEBEE").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("CREAM ROLL").allergens, ["milk", "wheat", "gluten"]);
});

test("places beverages after every food category", () => {
  const firstBeverage = snapshot.items.findIndex((item) => item.category === "BEVERAGES");
  assert.ok(firstBeverage > 0);
  assert.ok(snapshot.items.slice(firstBeverage).every((item) => item.category === "BEVERAGES"));
  assert.equal(snapshot.items.slice(firstBeverage).length, 2);
});
