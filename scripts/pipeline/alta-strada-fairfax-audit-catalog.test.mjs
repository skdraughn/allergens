import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAltaStradaFairfaxAuditSnapshot } from "./alta-strada-fairfax-audit-catalog.mjs";

const restaurantId = "replacement-alta-strada-fairfax-va-fairfax-va";
const snapshot = await buildAltaStradaFairfaxAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds the complete current Mosaic/Fairfax menu catalog", async () => {
  assert.equal(snapshot.itemCount, 37);
  assert.equal(snapshot.presentationCount, 62);
  assert.equal(snapshot.itemNameFingerprint, "ffbe1e1faf4b11a72e0be606fae55d7d3cdcac21345db4836d868182e6e4fb0b");
  assert.equal(snapshot.categoryCount, 5);
  assert.equal(snapshot.ingredientSignalCount, 33);
  assert.equal(snapshot.unavailableAllergenCount, 4);

  const expectedHashes = [
    ["official-home.html", "682a6ddbb67d22ce012ca8b8183dfa72be6eef854fe53ea50c21e1580a85b024"],
    ["official-locations.html", "9456cda64f0f7c907536106eb06c9ff8b864112de2e1af1b524eb113e6a9e549"],
    ["official-mosaic-menu-index.html", "34b7015dd790db37e0c3b18f4229b4bc64760ae110c31d394fe0075859652409"],
    ["official-mosaic-lunch.html", "3d7d4492badb9ab916a0924b15291d29fc4da42152650e26e3fe307dc89a49ef"],
    ["official-mosaic-dinner.html", "4dca1f0879d76d46f26c68127c2cdbca82c6a1e24e611be93de41ccb63f1bae7"],
    ["official-mosaic-brunch.html", "43dfa6b16f5ba5286f8c07da6636f90da52cb54863ca9d434cc63a839b1c61bd"],
    ["official-mosaic-happy-hour.html", "5c9f7f8116ac5686fcb00a79233c5570049e9c41c9377f881bcd68c9795c5b75"],
    ["official-order-index.html", "907d8ff60e295d9d0e02458270d318a149f3ef911231b65c69b1a5b17d55ed0b"],
    ["official-sitemap.xml", "6f06c5eccf983a82305b3c9772fe335b6a7ab682d0a3e3ae85b3427fb5133c51"],
    ["official-mosaic-winter-restaurant-week.html", "5dbebd5c61e237a2d1e4f4ce10d9420a5bdd12b3a3145dd5e5046f61a5c0ab2a"],
    ["official-other-location-wellesley.html", "2fef13d0869c557583d0171bc02fd909188846de4c87f9e4fb0767367e9439dc"],
    ["official-other-location-foxwoods.html", "9df0e7c9832b396ef084d046193cf6c185459f8be0dd72fbc25c9f7580cb2685"],
  ];
  for (const [name, hash] of expectedHashes) {
    const captured = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/${name}`);
    assert.equal(createHash("sha256").update(captured).digest("hex"), hash, name);
  }

  const locations = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-locations.html`, "utf8");
  assert.match(locations, /2911 DISTRICT AVE UNIT 150, FAIRFAX, VA 22031/);
  const menuIndex = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-mosaic-menu-index.html`, "utf8");
  for (const route of ["mosaic-district-lunch-menu", "mosaic-district-dinner-menu", "mosaic-district-brunch-menu", "mosaic-district-happy-hour-menu"]) {
    assert.match(menuIndex, new RegExp(route));
  }
  const winterRestaurantWeek = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-mosaic-winter-restaurant-week.html`, "utf8");
  assert.match(winterRestaurantWeek, /ASM-RW-Lunch-menu-WINTER-2026\.pdf/);
  assert.match(winterRestaurantWeek, /ASM-RW-Dinner-Menu-WINTER-2026\.pdf/);
  assert.match(winterRestaurantWeek, /ASM-RW-Brunch-menu-WINTER-2026\.pdf/);
});

test("consolidates current service-period display variants without mixing locations", () => {
  assert.equal(item("Whipped Ricotta").presentations.length, 3);
  assert.equal(item("Spaghetti AOP").presentations.length, 3);
  assert.deepEqual(item("Organic Romaine Hearts").aliases, ["Caesar Salad"]);
  assert.deepEqual(item("Fried Calamari").aliases, ["Crispy Calamari"]);
  assert.deepEqual(item("Alta Strada Smashburger").aliases, ["The Strada Burger"]);
  assert.deepEqual(item("Chicken Milanese or Parmigiano").aliases, ["Chicken Milanese"]);
  assert.equal(item("Chicken Milanese or Parmigiano").isConfigurable, true);
  for (const staleName of ["Grilled Filet Branzino", "Mussels Fra Diavlo", "Veal Piccata", "Prime Filet Mignon* (8oz)"]) {
    assert.equal(item(staleName), undefined, staleName);
  }
});

test("keeps fixed menu wording separate from variable preparation assumptions", () => {
  assert.deepEqual(item("Whipped Ricotta").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Fried Calamari").allergens, ["shellfish"]);
  assert.deepEqual(item("Chicken Milanese or Parmigiano").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Rockfish Picatta").allergens, ["milk", "fish"]);
  assert.deepEqual(item("Cacio e Pepe").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Crab Cake Benedict").allergens, ["egg", "wheat", "gluten", "shellfish"]);
  assert.deepEqual(item("Grilled NY Strip").allergens, []);
  assert.equal(item("Grilled NY Strip").allergenSourceType, "unavailable");
});

test("preserves every adjudicated Fairfax formulation through the quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
});

test("persists the verified snapshot into the audited generated entry", async () => {
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
