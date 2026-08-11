import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAllGoRhythmsAuditSnapshot } from "./allgorhythms-audit-catalog.mjs";

const snapshot = await buildAllGoRhythmsAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds the current AllGoRhythms main and event food catalog", async () => {
  assert.equal(snapshot.itemCount, 76);
  assert.equal(snapshot.presentationCount, 171);
  assert.equal(snapshot.categoryCount, 9);
  assert.equal(snapshot.ingredientSignalCount, 45);
  assert.equal(snapshot.unavailableAllergenCount, 31);

  assert.equal(item("Signature Kabob Sizzler").presentations.length, 4);
  assert.deepEqual(item("Signature Kabob Sizzler").aliases, ["Signature Kabob Sizzle"]);
  assert.equal(item("Taco Twist").presentations.length, 4);
  assert.equal(item("Boom Boom Cauli Bites (Cauliflower Bites)").presentations.length, 3);
  assert.deepEqual(item("Crispy Spice 65").aliases, ["Crispy Spice"]);
  assert.equal(item("Fries").presentations.length, 1);
  assert.equal(item("Quesadilla").presentations.length, 1);

  const expectedHashes = [
    ["official-home.html", "48a2fed8e759569c5dfc79184b205ff60ea4b0e38c868490683a8ee3626a1cc2"],
    ["official-food-menu.html", "631468a3c09dbda4d2d807b23988f40f467a627344605124ff7ba6df1915551c"],
    ["official-about.html", "1ca4fb8182be0775757ea72ca5e4063263315e86da45c6d25aac236646755dba"],
    ["linked-spotapps-ordering.html", "ad6d4f32cb8ebdc196822a0705d3b18e4d80d2d4c8ad3754cff80a45e6917834"],
  ];
  for (const [name, hash] of expectedHashes) {
    const captured = await readFile(`data/restaurant-verification/artifacts/osm-allgorhythms-12234974276/${name}`);
    assert.equal(createHash("sha256").update(captured).digest("hex"), hash, name);
  }
});

test("uses only fixed published ingredients and unavoidable named formats", () => {
  assert.deepEqual(item("Personal Pizza").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Pasta Prelude").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Hummus Harmony").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Baklava").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("Fish and Chips").allergens, ["wheat", "gluten", "fish"]);
  assert.deepEqual(item("Dumpling Dance").allergens, ["wheat", "gluten", "soy"]);
});

test("does not promote selectable or merely descriptive ingredients into fixed claims", () => {
  assert.deepEqual(item("Bold Chilli Bites").allergens, []);
  assert.deepEqual(item("Crispy Spice 65").allergens, []);
  assert.deepEqual(item("Lettuce Wraps").allergens, []);
  assert.deepEqual(item("Chips and Chords(Chips)").allergens, []);
  assert.deepEqual(item("Cashew Curry").allergens, ["tree-nut"]);
  assert.deepEqual(item("Mango Chia Seed Pudding").allergens, ["tree-nut"]);
  assert.deepEqual(item("Naan/ Bread").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Waffle Waltz").allergens, []);
});

test("preserves every adjudicated product through the quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
  assert.equal(classifyMenuItemRow(item("Gulab Groove")).kind, "menu-item");
});

test("persists the verified snapshot into only the audited generated entry", async () => {
  const repository = JSON.parse(await readFile("src/data/generated/restaurants.generated.json", "utf8"));
  const generated = repository.restaurants.find((candidate) => candidate.id === snapshot.restaurantId);
  assert.ok(generated);
  assert.equal(generated.items.length, snapshot.itemCount);
  assert.equal(generated.itemCount, snapshot.itemCount);
  assert.equal(generated.menuItemCount, snapshot.itemCount);
  assert.equal(generated.totalItemCount, snapshot.itemCount);

  const generatedByName = new Map(generated.items.map((candidate) => [candidate.name, candidate]));
  for (const expected of snapshot.items) {
    const actual = generatedByName.get(expected.name);
    assert.ok(actual, expected.name);
    assert.equal(actual.category, expected.category, expected.name);
    assert.equal(actual.allergenSourceType, expected.allergenSourceType, expected.name);
    assert.deepEqual([...actual.allergens].sort(), [...expected.allergens].sort(), expected.name);
    assert.deepEqual([...actual.mayContain].sort(), [...expected.mayContain].sort(), expected.name);
    assert.deepEqual(actual.sourceUrls, expected.sourceUrls, expected.name);
    assert.equal(actual.isConfigurable, expected.isConfigurable, expected.name);
  }
});
