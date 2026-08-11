import assert from "node:assert/strict";
import test from "node:test";

import { buildAkenoAuditSnapshot } from "./akeno-audit-catalog.mjs";

const snapshot = buildAkenoAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });

test("matches the complete current Annandale menu manifest", () => {
  assert.equal(snapshot.itemCount, 234);
  assert.equal(snapshot.presentationCount, 235);
  assert.equal(snapshot.categoryCount, 28);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 234);
  assert.equal(snapshot.items.filter((item) => item.category === "Sauce").length, 11);
  assert.equal(snapshot.items.filter((item) => item.category === "Hosomaki (Seaweed Outside)").length, 11);
  assert.equal(snapshot.items.filter((item) => item.category === "Non-Alcoholic").length, 14);
  assert.equal(snapshot.items.filter((item) => item.category === "Juices").length, 4);
  assert.equal(snapshot.items.find((item) => item.name === "Lemonade").presentations.length, 2);
});

test("removes stale products and restores current products and categories", () => {
  assert.equal(snapshot.items.some((item) => ["Salmon Onigiri", "Extra Mushroom", "Ramune Strawberry", "Rice Outside", "Sweet Chili", "Ponzu", "Sweet & Sour"].includes(item.name)), false);
  for (const name of ["Crispy Rice Crab Tartare", "Wasa-Sake", "Sake", "Sake Toro", "Sake Roll", "Coca-Cola", "Orange Juice"]) {
    assert.ok(snapshot.items.some((item) => item.name === name), name);
  }
  assert.equal(snapshot.items.find((item) => item.name === "Chili Oil").category, "Sauce");
  assert.equal(snapshot.items.find((item) => item.name === "Eel Sauce").category, "Sauce");
});

test("corrects source-bounded fish, shellfish, and imitation-crab semantics", () => {
  assert.deepEqual(snapshot.items.find((item) => item.name === "Ika Karaage").allergens, ["egg", "shellfish"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Grilled Saba").allergens, ["fish"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Niku-Udon").allergens, ["wheat", "gluten", "fish", "soy"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Crab Rangoon").allergens, ["milk", "wheat", "gluten", "fish"]);
  assert.equal(snapshot.items.find((item) => item.name === "Crab Rangoon").allergens.includes("shellfish"), false);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Kanikama").allergens, ["fish"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Gyu-Don").allergens, ["egg", "soy"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Gyu-Don (L)").allergens, ["egg", "soy", "sesame"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Eel Sauce").allergens, []);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Dumpling Sauce").allergens, []);
});

test("does not promote optional choices or coconut into fixed allergens", () => {
  assert.deepEqual(snapshot.items.find((item) => item.name === "Crunchy Spicy Roll").allergens, ["egg", "wheat", "gluten"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Panang Curry").allergens, []);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Tom Kha Kai").allergens, []);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Mango Sticky Rice").allergens, ["sesame"]);
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
});
