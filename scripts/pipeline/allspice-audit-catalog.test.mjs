import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAllSpiceAuditSnapshot } from "./allspice-audit-catalog.mjs";

const restaurantId = "osm-allspice-catering-3397462219";
const snapshot = await buildAllSpiceAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds the complete current AllSpice food and product catalogs", async () => {
  assert.equal(snapshot.itemCount, 209);
  assert.equal(snapshot.presentationCount, 396);
  assert.equal(snapshot.itemNameFingerprint, "2d40dc833caa996a726af15558280c96efc54d333b7eb2169ab9eef0f93f53b5");
  assert.equal(snapshot.categoryCount, 24);
  assert.equal(snapshot.ingredientSignalCount, 165);
  assert.equal(snapshot.unavailableAllergenCount, 44);

  const expectedHashes = [
    ["official-home.html", "0aef1beb0752ed8d36ded20812879e2e2bab4dae8d3999305dea2047223f5380"],
    ["official-catering-menu-index.html", "f9d2291d5538e919f91089fcf32d943417951f5a2b9d832e00331ba7c6127b12"],
    ["official-gather-dine-menu.html", "1ffb3f72afa55e8867625d2cc12f313640e5e4beef300943692c38a869aa6ca0"],
    ["official-takeout-category.html", "96fc309c213713988b5d471f60a96d6bae0404e7b0a26c3f3554197ea7b380b5"],
    ["official-food-api-p1.json", "ff6804045776153109ea4768e5e75d2e7b7b347ef3a5560ea3d388b2eb7e7e0f"],
    ["official-food-api-p2.json", "00ae8345b6b24285c5d955f6e8fab9d89cf426d9db3b76389689f5676e8ed2f9"],
    ["official-food-api-p3.json", "592a7a71783d920396a58e1939361505fde07631311723778e5932845fa1bd9b"],
    ["official-product-api-p1.json", "526ff75e122b4fb3ddd52849b5dd1b55f2f44d4e7f01f57516d4c8cd0df0f2b9"],
    ["official-product-api-p2.json", "2197c6b6a491b31634daadc3a61c22af0acf51057966617c2819b3f1e230ab84"],
    ["official-food-categories.json", "695cceba106c166b65bd878a51a9f0fee215f439f04676a92c3d10036dd56fba"],
    ["official-product-categories.json", "1f9ce76b63a3d8d1be57ac5c4613ec2b9fed77637cdddef5dbf702f33ead1175"],
    ["official-sitemap-index.xml", "b3ca6a647cde0d1f4dc04c0812ea8f2aa87aecbd2d71888ee317abbc4a18947a"],
  ];
  for (const [name, hash] of expectedHashes) {
    const captured = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/${name}`);
    assert.equal(createHash("sha256").update(captured).digest("hex"), hash, name);
  }
});

test("consolidates duplicate surfaces and excludes non-food commerce rows", () => {
  assert.equal(item("Greek Salad").presentations.length, 4);
  assert.equal(item("Chef Salad").presentations.length, 3);
  assert.deepEqual(item("Bags of Chips").aliases, ["5 Bags of Chips"]);
  assert.deepEqual(item("Bags of Pretzels").aliases, ["5 Bags of Pretzels"]);
  assert.deepEqual(item("Whole Fruits").aliases, ["5 Whole Fruits"]);
  assert.equal(item("Maryland Crab Boil").sourceType, "restaurant-issued-woocommerce-product-api");
  assert.equal(item("Sushi").allergenSourceType, "unavailable");
  assert.deepEqual(
    snapshot.items.filter((candidate) => ["Set of Disposable Utensils Per Guest", "Crab Mallet", "Gift Certificate"].includes(candidate.name)),
    [],
  );
});

test("uses published ingredient terms without promoting variable sauces or selectable components", () => {
  assert.deepEqual(item("Chicken Caesar Salad").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Mini Crab Cakes with Remoulade").allergens, ["shellfish"]);
  assert.deepEqual(item("Buffalo Chicken Bowl").allergens, ["milk"]);
  assert.deepEqual(item("Edamame Falafel Bowl").allergens, ["soy"]);
  assert.deepEqual(item("Prime Rib of Beef Dinner").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("The Basic Holiday Dinner").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Mediterranean Sampler").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Seven Layer Mexican Dip & Tortilla Chips").allergens, []);
  assert.deepEqual(item("Sushi").allergens, []);
});

test("cleans repeated CMS option blocks without dropping the real menu wording", () => {
  assert.equal(
    item("Assorted Crostini with Various Toppings").description,
    "Assortment: Pesto & Chevre. Mushroom Ragout. Olive Tapenade. Arugula, Goat Cheese & Prosciutto. Rosemary & White Bean. Roasted Red Pepper.",
  );
  assert.match(item("Chicken Piccata").description, /Sides Choice: Garlic Mashed Potatoes Angel Hair Pasta$/);
  assert.equal((item("Chicken Piccata").description.match(/Garlic Mashed Potatoes/g) ?? []).length, 1);
  assert.equal((item("Hoisin Ginger Pork Tenderloin").description.match(/Minted Couscous/g) ?? []).length, 1);
});

test("preserves every adjudicated formulation through the quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
  assert.equal(classifyMenuItemRow(item("Rosemary-Merlot Flank Steak")).kind, "menu-item");
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
