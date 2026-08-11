import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAgua301AuditSnapshot } from "./agua-301-audit-catalog.mjs";

const [html, drinkHtml] = await Promise.all([
  readFile("data/restaurant-verification/artifacts/agua-301-restaurant-washington-dc-dc-metro/official-food-menu.html", "utf8"),
  readFile("data/restaurant-verification/artifacts/agua-301-restaurant-washington-dc-dc-metro/official-drink-menu.html", "utf8"),
]);
const snapshot = buildAgua301AuditSnapshot({ html, drinkHtml, retrievedAt: "2026-07-14T00:00:00.000Z" });
const byName = (name) => snapshot.items.filter((item) => item.name === name);

test("parses all current Agua 301 surfaces without package headings", () => {
  assert.equal(snapshot.presentationCount, 403);
  assert.equal(snapshot.itemCount, 301);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 301);
  assert.equal(snapshot.items.some((item) => /^(?:First Course|Dessert:|Add Ons:|Bocaditos:)$/i.test(item.name)), false);
});

test("keeps current non-alcoholic beverages last and excludes alcohol", () => {
  assert.deepEqual(snapshot.items.slice(-3).map((item) => item.name), ["Agua Fresca", "Jarritos Soft Drinks", "Mexican Coca Cola"]);
  assert.equal(snapshot.items.some((item) => item.name === "Tecate Can"), false);
});

test("keeps changed formulations while consolidating exact repeats", () => {
  assert.ok(byName("Chicken Flautas").length > 1);
  assert.ok(snapshot.items.some((item) => item.presentations.length > 1));
  assert.ok(snapshot.items.some((item) => item.category.startsWith("Breakfast Meetings Menu —")));
});

test("maps fixed signals and excludes optional proteins", () => {
  const lunchCaesar = byName("Grilled Caesar Salad").find((item) => item.category.startsWith("Lunch —"));
  assert.ok(["milk", "wheat", "gluten", "fish"].every((value) => lunchCaesar.allergens.includes(value)));
  assert.equal(lunchCaesar.allergens.includes("shellfish"), false);
  const chilango = byName("Chilango Salad").find((item) => item.category.startsWith("Lunch —"));
  assert.deepEqual(chilango.allergens, ["milk"]);
  const familyTaco = byName("Family Taco Meal (pick up & delivery only)")[0];
  assert.deepEqual(familyTaco.allergens, ["milk"]);
  const fajitas = byName("Fajitas for 2 (pick up & delivery only)")[0];
  assert.ok(["milk", "wheat", "gluten", "shellfish"].every((value) => fajitas.allergens.includes(value)));
});

test("avoids known substring and generic-warning false positives", () => {
  assert.equal(byName("Empanada de Calabaza")[0].allergens.includes("egg"), false);
  assert.equal(byName("Yucca Fritas")[0].allergens.includes("egg"), false);
  assert.equal(byName("Coconut Shrimp")[0].allergens.includes("tree-nut"), false);
  assert.ok(byName("Pollo Con Mole Poblano")[0].allergens.includes("tree-nut"));
});
