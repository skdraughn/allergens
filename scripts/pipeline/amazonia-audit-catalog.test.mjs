import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAmazoniaAuditSnapshot } from "./amazonia-audit-catalog.mjs";

const restaurantId = "amazonia-dc";
const snapshot = await buildAmazoniaAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds Amazonia's complete current food and nonalcoholic catalog", async () => {
  assert.equal(snapshot.itemCount, 34);
  assert.equal(snapshot.presentationCount, 43);
  assert.equal(snapshot.itemNameFingerprint, "ebb48be7f41dd26a6a5c47163dd35fee56e24ceb42c1f9e2571c91e117131704");
  assert.equal(snapshot.categoryCount, 10);
  assert.equal(snapshot.ingredientSignalCount, 24);
  assert.equal(snapshot.unavailableAllergenCount, 10);

  const expectedHashes = [
    ["official-home.html", "17f52ddb20f1548d91c1c19fac50d593059a40f94186c5515bad52fe0ee21642"],
    ["official-amazonia.html", "1762892ca6ba5b18ccda9d7acce7f2335973a778b21eb3edfa711e57e0de9cd4"],
    ["official-dinner.html", "4a085d0a20a056765fc647ac4ab952483b94aa516009ceaff26bf2f986ce2398"],
    ["official-dessert.html", "0fc795bc65131e7070e6b6c4f144a88cc7eb392f0510361187d9fca2e53fff2b"],
    ["official-drinks.html", "f1f7ca1a137e6266f3d5fba56c29aa848b9da264744a9f1e5902cb47c005f484"],
    ["official-sour-hour.html", "5cb321b937c54f0ea2933fddea306db85abb6ddf70bb8f4d7e8ae5c7baff13cd"],
    ["official-sitemap.xml", "ecb02997c8adcc8bc63cff8bcf7e887e98b5e0495406eefe13e2880c2274f346"],
  ];
  for (const [name, hash] of expectedHashes) {
    const captured = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/${name}`);
    assert.equal(createHash("sha256").update(captured).digest("hex"), hash, name);
  }

  const amazonia = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-amazonia.html`, "utf8");
  for (const route of ["amazonia-dinner", "amazonia-dessert", "amazonia-drinks", "amazonia-sour-hour"]) {
    assert.match(amazonia, new RegExp(route));
  }
  assert.match(amazonia, /upstairs bar, dining room and rooftop hideaway/i);
});

test("parses each menu surface and consolidates shared Sour Hour formulations", () => {
  assert.equal(item("Madurito").presentations.length, 2);
  assert.equal(item("Patacones").presentations.length, 2);
  assert.equal(item("Papas de Huancayo").presentations.length, 2);
  assert.equal(item("Corazón de Res").presentations.length, 2);
  assert.equal(item("Salmon Belly").presentations.length, 2);
  assert.equal(item("Cebiche Clásico").presentations.length, 2);
  assert.equal(item("Cebiche Amazonico").presentations.length, 2);
  for (const name of [
    "Filet Mignon", "Daily Chef's Choice of 5 Anticuchos", "Josper Wagyu Burger",
    "Ungurahui Açaí", "Chocolucuma", "Chazuta", "Chicha Morada", "Inca Kola",
    "Prima Pavé Blanc de Blancs", "Prima Pavé Brut Rosé", "Espresso",
  ]) {
    assert.ok(item(name), name);
  }
  assert.equal(item("Daily Chef's Choice of 5 Anticuchos").isConfigurable, true);
  assert.equal(item("Seasonal Non-Alcoholic Cocktail").isConfigurable, true);
});

test("treats the dietary legend as absence/accommodation metadata, not a contains matrix", () => {
  assert.deepEqual(item("Ensalada de Chonta").allergens, []);
  assert.equal(item("Ensalada de Chonta").allergenSourceType, "unavailable");
  assert.deepEqual(item("Pulpo al Josper").allergens, ["shellfish"]);
  assert.deepEqual(item("Pulpo al Olivo").allergens, ["shellfish"]);
  assert.deepEqual(item("Cebiche Nikkei").allergens, ["fish", "soy"]);
  assert.deepEqual(item("Chaufa Putumayo").allergens, ["egg", "shellfish", "soy", "sesame"]);
  assert.deepEqual(item("Mafalde").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Josper Wagyu Burger").allergens, ["milk", "wheat", "gluten", "sesame"]);
  assert.deepEqual(item("Chocolucuma").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Prima Pavé Brut Rosé").allergens, []);
  assert.deepEqual(item("Coke, Diet Coke, Sprite, or Ginger Ale").allergens, []);
  assert.ok(snapshot.items.every((candidate) => candidate.mayContain.length === 0));
});

test("applies the Anticuchería parent marinade to every published skewer", () => {
  for (const name of ["Corazón de Res", "Filet Mignon", "Chicken Thigh", "Pork Belly", "Carrot", "Mushroom", "Daily Chef's Choice of 5 Anticuchos"]) {
    assert.deepEqual(item(name).allergens, ["soy"], name);
    assert.match(item(name).description, /soy sauce/i, name);
  }
  assert.deepEqual(item("Salmon Belly").allergens, ["fish", "soy"]);
});

test("preserves every adjudicated formulation through the shared quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
});

test("persists the verified snapshot into the generated Amazonia entry", async () => {
  const repository = JSON.parse(await readFile("src/data/generated/restaurants.generated.json", "utf8"));
  const generated = repository.restaurants.find((candidate) => candidate.id === restaurantId);
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
