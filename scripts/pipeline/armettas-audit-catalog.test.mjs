import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildArmettasCatalog,
  extractArmettasOwnerMenu,
} from "./armettas-audit-catalog.mjs";

const artifactUrl = new URL(
  "../../data/restaurant-verification/artifacts/osm-armetta-s-italian-pizzeria-3935138350/armettas-current-menu-jina-transport.txt",
  import.meta.url,
);

test("extracts the current owner-menu product boundary", async () => {
  const extracted = extractArmettasOwnerMenu(await readFile(artifactUrl, "utf8"));
  assert.equal(extracted.items.length, 225);
  assert.equal(extracted.categoryCount, 19);
  assert.equal(new Set(extracted.items.map((row) => row.sourceUrl)).size, 225);
  assert.deepEqual(
    extracted.items.filter((row) => row.category === "To Go Drinks").map((row) => row.name).slice(0, 3),
    ["Coca-Cola, 2 Liters", "Coca-Cola, Bottle", "Diet Coke, Bottle"],
  );
});

test("keeps only standalone current products and places beverages last", async () => {
  const snapshot = await buildArmettasCatalog();
  const names = new Set(snapshot.items.map((row) => row.name));
  assert.equal(snapshot.itemCount, 225);
  assert.equal(snapshot.categoryCount, 19);
  assert.equal(snapshot.officialIngredientCount, 191);
  assert.equal(snapshot.unavailableAllergenCount, 34);
  assert.equal(snapshot.configurableItemCount, 42);
  assert.equal(new Set(snapshot.items.map((row) => row.id)).size, 225);
  for (const present of [
    "Arancini",
    "Lunch Rigatoni Vodka",
    "Onion Rings",
    "Oreo cake",
    "Sicilian Soda",
    "Side Alfredo Sauce 4oz",
  ]) assert.equal(names.has(present), true, present);
  for (const absent of [
    "All Drums",
    "Feta",
    "Spinach",
    "9\" Extra Meat",
    "Chef Salad",
    "Broccoli Cheese Balls",
    "Tartufo",
    "Medium Half/Half Specialty",
  ]) assert.equal(names.has(absent), false, absent);
  assert.equal(snapshot.items.at(-1).category, "To Go Drinks");
});

test("represents direct positives without turning options into fixed claims", async () => {
  const snapshot = await buildArmettasCatalog();
  const byName = new Map(snapshot.items.map((row) => [row.name, row]));

  assert.deepEqual(byName.get("Lunch Create Your Own Pasta").allergens, []);
  assert.equal(byName.get("Lunch Create Your Own Pasta").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Kids Create Your Own Pasta*").allergens, ["gluten", "wheat"]);
  assert.deepEqual(byName.get("Arancini").allergens, ["gluten", "wheat"]);
  assert.deepEqual(byName.get("Chicken Wings").allergens, ["gluten", "wheat"]);
  assert.deepEqual(byName.get("Cheeseburger").allergens, ["gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("Lunch Ham and Cheese").allergens, ["gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("Onion Rings").allergens, ["gluten", "wheat"]);
  assert.deepEqual(byName.get("Seafood Gnocchi").allergens, ["milk", "shellfish"]);
  assert.deepEqual(byName.get("Chicken Champagne").allergens, ["egg", "milk"]);
  assert.deepEqual(byName.get("Tiramisu").allergens, ["gluten", "milk", "wheat"]);
  assert.deepEqual(byName.get("Blue Cheese").allergens, ["milk"]);
  assert.deepEqual(byName.get("Honey Mustard").allergens, ["mustard"]);
  assert.equal(byName.get("Caesar Dressing").allergenSourceType, "unavailable");
  assert.equal(snapshot.items.every((row) => row.mayContain.length === 0), true);
});
