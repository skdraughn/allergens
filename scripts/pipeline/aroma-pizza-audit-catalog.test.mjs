import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAromaPizzaCatalog,
  extractAromaPizzaToastMenu,
} from "./aroma-pizza-audit-catalog.mjs";

const artifactUrl = new URL(
  "../../data/restaurant-verification/artifacts/aroma-pizza-lorton-dc-metro/aroma-toast-jina-transport.txt",
  import.meta.url,
);
const checkUrl = new URL(
  "../../data/restaurant-verification/item-checks/aroma-pizza-lorton-dc-metro.jsonl",
  import.meta.url,
);

test("extracts the current readable Toast product boundary", async () => {
  const checks = (await readFile(checkUrl, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  const baselineNames = new Map(checks.map((row) => [row.baseline.itemId, row.baseline.name]));
  const extracted = extractAromaPizzaToastMenu(await readFile(artifactUrl, "utf8"), { baselineNames });
  assert.equal(extracted.items.length, 181);
  assert.equal(extracted.categoryCount, 13);
  assert.equal(new Set(extracted.items.map((row) => row.sourceProductId)).size, 181);
  assert.equal(extracted.items.some((row) => row.name === "Wings"), false);
  assert.equal(extracted.items.some((row) => row.name === "Soup & Salad"), false);
});

test("unions all current products and places beverages last", async () => {
  const snapshot = await buildAromaPizzaCatalog();
  const names = new Set(snapshot.items.map((row) => row.name));
  assert.equal(snapshot.itemCount, 199);
  assert.equal(snapshot.categoryCount, 16);
  assert.equal(new Set(snapshot.items.map((row) => row.id)).size, 199);
  assert.equal(new Set(snapshot.items.map((row) => row.sourceProductId)).size, 199);
  assert.equal(snapshot.items.at(-1).category, "Drinks");
  for (const name of [
    "5 PC Wings",
    "House bread",
    "Small cheese pizza 10''",
    "Family deal 2 Large 1 topping pizzas, 10 wings & mozzarella sticks",
    "AleoVera drink",
    "Half tray shrimp Alfredo pasta",
  ]) assert.equal(names.has(name), true, name);
});

test("does not promote vendor menu wording to official allergens", async () => {
  const snapshot = await buildAromaPizzaCatalog();
  assert.equal(snapshot.officialIngredientCount, 0);
  assert.equal(snapshot.unavailableAllergenCount, 199);
  assert.equal(snapshot.items.every((row) => row.allergenSourceType === "unavailable"), true);
  assert.equal(snapshot.items.every((row) => row.allergens.length === 0), true);
  assert.equal(snapshot.items.every((row) => row.mayContain.length === 0), true);
  assert.equal(snapshot.items.every((row) => row.sourceType === "restaurant-linked-toast-menu-text"), true);
  const shrimp = snapshot.items.find((row) => row.name === "Shrimp Alfredo Pasta");
  assert.deepEqual(shrimp.allergens, []);
  assert.equal(shrimp.inferredAllergenSignals.some((signal) => signal.id === "shellfish"), true);
});
