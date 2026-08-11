import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildALitteriAuditSnapshot,
  parseALitteriFoodBookingMenu,
} from "./a-litteri-audit-catalog.mjs";

const foodbookingMenu = await readFile(
  "data/restaurant-verification/artifacts/a-litteri-dc/linked-foodbooking-menu.json",
  "utf8",
);
const snapshot = buildALitteriAuditSnapshot({ foodbookingMenu });

test("combines every current linked-ordering and official catering product", () => {
  assert.equal(parseALitteriFoodBookingMenu(foodbookingMenu).length, 21);
  assert.equal(snapshot.itemCount, 42);
  assert.equal(snapshot.items.filter((item) => item.sourceType === "restaurant-linked-vendor-menu").length, 21);
  assert.equal(snapshot.items.filter((item) => item.sourceType === "restaurant-issued-image-menu").length, 21);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 42);
  assert.ok(snapshot.items.every((item) => item.isAvailable));
});

test("does not flatten modifier groups into standalone products", () => {
  const names = new Set(snapshot.items.map((item) => item.name));
  assert.equal(names.has("Cheese (limit 2)"), false);
  assert.equal(names.has("Meats (limit 2)"), false);
  assert.equal(names.has("Condiments"), false);
  assert.equal(names.has("BUILD YOUR OWN"), true);
  assert.equal(snapshot.items.find((item) => item.category === "Cold Sandwiches" && item.name === "BUILD YOUR OWN").isConfigurable, true);
});

test("derives only fixed restaurant-published allergen signals", () => {
  const get = (category, name) => snapshot.items.find((item) => item.category === category && item.name === name);

  assert.deepEqual(get("Cold Sandwiches", "ITALIAN CLASSIC (No substitutions)").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("Cold Sandwiches", "BUILD YOUR OWN").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("Cold Sandwiches", "CHICKEN SALAD").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("Cold Sandwiches", "TUNA SALAD").allergens, ["fish", "wheat", "gluten"]);
  assert.deepEqual(get("Hot Sandwiches", "SAUSAGE AND PEPPERS").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("Salads", "BUILD YOUR OWN").allergens, []);
  assert.deepEqual(get("Pasta & Soup", "MARYLAND CRAB SOUP").allergens, ["shellfish"]);
  assert.deepEqual(get("Catering · Trays & Platters", "Cookie Platter").allergens, []);
  assert.deepEqual(get("Catering · Trays & Platters", "Caesar Salad").allergens, ["milk", "wheat", "gluten"]);
});
