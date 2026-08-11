import assert from "node:assert/strict";
import test from "node:test";

import { buildAirRestaurantAuditSnapshot } from "./air-restaurant-audit-catalog.mjs";

const snapshot = buildAirRestaurantAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });

test("reconstructs all current food formulations without alcohol or layout fragments", () => {
  assert.equal(snapshot.itemCount, 40);
  assert.equal(snapshot.presentationCount, 45);
  assert.equal(snapshot.categoryCount, 11);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 40);
  assert.equal(snapshot.items.some((item) => ["Mimosa Carafe", "Choice of Jerk or Fried", "A Low Country Classic", "Served w/ Mashed Potato & Todays Vegetable"].includes(item.name)), false);
});

test("preserves repeated names only when their current formulations differ", () => {
  assert.equal(snapshot.items.filter((item) => item.name === "Fried Shrimp").length, 2);
  assert.equal(snapshot.items.filter((item) => item.name === "Jerk Wings").length, 2);
  assert.equal(snapshot.items.filter((item) => item.name === "AIR Angus Burger").length, 2);
  assert.equal(snapshot.items.find((item) => item.name === "Grilled Lamb Chops").presentations.length, 2);
  assert.equal(snapshot.items.find((item) => item.name === "Bowtie Pasta").presentations.length, 2);
});

test("keeps positive signals bounded to fixed text and named formats", () => {
  assert.deepEqual(snapshot.items.find((item) => item.name === "Crab Cake").allergens, ["milk", "shellfish"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Chopped Salad").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Bowtie Pasta").allergens, ["milk", "wheat", "gluten"]);
  assert.equal(snapshot.items.find((item) => item.name === "Bowtie Pasta").ingredientsText.includes("Add Shrimp"), false);
  assert.deepEqual(snapshot.items.find((item) => item.category === "Late Night" && item.name === "Caesar Salad").allergens, []);
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
});
