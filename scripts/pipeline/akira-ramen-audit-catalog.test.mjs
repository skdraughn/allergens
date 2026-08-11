import assert from "node:assert/strict";
import test from "node:test";

import { buildAkiraRamenAuditSnapshot } from "./akira-ramen-audit-catalog.mjs";

const snapshot = buildAkiraRamenAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const named = (name) => snapshot.items.filter((item) => item.name === name);

test("maps the complete public Akira merchant catalog without hidden rows or add-on artifacts", () => {
  assert.equal(snapshot.sourcePublishedRowCount, 83);
  assert.equal(snapshot.excludedModifierCount, 2);
  assert.equal(snapshot.collapsedDuplicateCount, 1);
  assert.equal(snapshot.itemCount, 80);
  assert.equal(snapshot.presentationCount, 80);
  assert.equal(snapshot.categoryCount, 10);
  assert.equal(snapshot.items.some((item) => ["Extra Mayo Sauce", "Extra Wasabi Sauce"].includes(item.name)), false);
  assert.equal(named("Tuna Ikura").length, 1);
  assert.deepEqual(named("Tuna Ikura")[0].merchantRowIds, [2118, 2150]);
  assert.equal(named("King dragon Roll").length, 1);
  assert.equal(named("King Dragon Roll").length, 1);
});

test("restores public products omitted by the frozen generic extraction", () => {
  for (const name of ["Coke", "Diet Coke", "Sprite", "Ginger Ale", "Lunch Special", "Tuesday Combo"]) {
    assert.equal(named(name).length, 1, name);
  }
  assert.equal(named("Lunch Special")[0].isConfigurable, true);
  assert.equal(named("Tuesday Combo")[0].isConfigurable, true);
});

test("maps only fixed published ingredients and defensible named formats", () => {
  assert.deepEqual(named("Okonomiyaki")[0].allergens, ["egg", "wheat", "gluten", "fish", "shellfish"]);
  assert.deepEqual(named("Akira Roll")[0].allergens, ["wheat", "gluten", "fish", "shellfish", "soy", "sesame"]);
  assert.deepEqual(named("Volcano Roll")[0].allergens, ["milk", "egg", "fish"]);
  assert.deepEqual(named("Rainbow Roll")[0].allergens, ["fish"]);
  assert.deepEqual(named("Okinawa Roll")[0].allergens, ["egg", "fish", "shellfish"]);
  assert.deepEqual(named("Tantanmen")[0].allergens, ["egg", "wheat", "gluten", "sesame"]);
  assert.deepEqual(named("Tonkotsu Miso Ramen")[0].allergens, ["egg", "wheat", "gluten", "fish", "soy"]);
  assert.deepEqual(named("Shrimp Temp Ramen")[0].allergens, ["egg", "wheat", "gluten", "fish", "shellfish"]);
  assert.deepEqual(named("Tonkatsu Don")[0].allergens, ["egg", "wheat", "gluten"]);
  assert.deepEqual(named("Oyako Don")[0].allergens, ["egg", "wheat", "gluten"]);
  assert.deepEqual(named("Gyu Don")[0].allergens, ["soy"]);
  assert.deepEqual(named("Lunch Special")[0].allergens, []);
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
});
