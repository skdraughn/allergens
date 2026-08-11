import assert from "node:assert/strict";
import test from "node:test";

import { buildAcquaBisteccaAuditSnapshot } from "./acqua-bistecca-audit-catalog.mjs";

const snapshot = buildAcquaBisteccaAuditSnapshot();
const get = (category, name) => snapshot.items.find((item) => item.category === category && item.name === name);

test("builds the complete compact current Acqua Bistecca allergen-focused catalog", () => {
  assert.equal(snapshot.itemCount, 76);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, snapshot.itemCount);
  assert.equal(new Set(snapshot.items.map((item) => item.category)).size, 18);
  assert.equal(snapshot.items.some((item) => item.name === "Green Salad"), false);
  assert.equal(snapshot.items.some((item) => item.name === "Grilled Shrimp"), false);
  assert.equal(snapshot.items.some((item) => item.name === "Foie Gras"), false);
  assert.equal(snapshot.items.some((item) => /Cabernet|Negroni 22|Milano Mulo/i.test(item.name)), false);
});

test("preserves current location-specific menu text and corrected names", () => {
  assert.equal(get("Pasta", "Sweet Corn Agnolotti").description, "Maryland blue crab, green onion, summer truffle");
  assert.equal(get("Classics", "Porcini Butter Roasted Chicken").description, "Mushroom-almond crema, asparagus tips");
  assert.equal(get("Sides", "Grilled Asparagus").description, null);
  assert.equal(get("Happy Hour · Food", "Campanelle Verde").description, "Arugula-pistachio pesto, crispy garlic, pecorino di fossa");
  assert.equal(get("Desserts", "Bomba Donuts").description.includes("Ricotta zeppole"), true);
});

test("uses only fixed published ingredient and mandatory-format signals", () => {
  assert.deepEqual(get("For the Table", "House-Made Focaccia").allergens, ["wheat", "gluten"]);
  assert.equal(get("For the Table", "House-Made Focaccia").isConfigurable, true);
  assert.deepEqual(get("Antipasti", "Tuna Tartare").allergens, ["fish", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("Antipasti", "Caviar Cannoli").allergens, ["milk", "fish", "wheat", "gluten"]);
  assert.deepEqual(get("Pasta", "Saffron Rigatoni").allergens, ["shellfish", "fish", "wheat", "gluten"]);
  assert.deepEqual(get("Classics", "Porcini Butter Roasted Chicken").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(get("Happy Hour · Food", "Campanelle Verde").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("Brunch · Antipasti", "Avocado Toast").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.equal(get("Brunch · Antipasti", "Avocado Toast").allergens.includes("egg"), false);
  assert.deepEqual(get("Beverages · Brunch", "High-Performance Living™").allergens, ["tree-nut"]);
});

test("places every beverage after food and dessert", () => {
  const firstBeverage = snapshot.items.findIndex((item) => item.category.startsWith("Beverages ·"));
  assert.ok(firstBeverage > 0);
  assert.ok(snapshot.items.slice(firstBeverage).every((item) => item.category.startsWith("Beverages ·")));
});
