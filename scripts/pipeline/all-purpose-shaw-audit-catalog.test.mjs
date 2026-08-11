import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAllPurposeShawAuditSnapshot } from "./all-purpose-shaw-audit-catalog.mjs";

const snapshot = buildAllPurposeShawAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds the current All-Purpose Shaw food and nonalcoholic catalog", async () => {
  assert.equal(snapshot.itemCount, 57);
  assert.equal(snapshot.presentationCount, 82);
  assert.equal(snapshot.categoryCount, 9);
  assert.equal(snapshot.ingredientSignalCount, 39);
  assert.equal(snapshot.unavailableAllergenCount, 18);
  assert.equal(item("The Standard").presentations.length, 3);
  assert.deepEqual(item("The Standard").aliases, ["Standard", "Standard Pizza"]);
  assert.equal(item("Focaccia Garlic Breadsticks").presentations.length, 2);
  assert.equal(item("Roasted Garlic Knots"), undefined);

  const expectedHashes = [
    ["official-location-and-faq.html", "47b8f1134a1ea5987e3e17033f9b5fad6d3b40d10e447bfc6ae025a7bf38ae79"],
    ["official-brunch-pdf.pdf", "7769712ed8f05e18c5b6bea58eece6d274d00663be52d5ac308aada8b3a7057c"],
    ["official-dinner-pdf.pdf", "6603d9bddf11702f8a236fe1fb3802d9df04855c6d3b989fed96c0b79cf8a90e"],
    ["official-drinks-pdf.pdf", "496f1c28c85f6f4a8d52ed739abb5dc67232ba39c892f4622821d193ea07fec2"],
    ["official-happy-hour-pdf.pdf", "ec4c2a7d646c236307cc6d2ecfad11e34cf253c3988e7a227fd2e1473ee185b0"],
  ];
  for (const [name, hash] of expectedHashes) {
    const captured = await readFile(`data/restaurant-verification/artifacts/all-purpose-shaw-dc/${name}`);
    assert.equal(createHash("sha256").update(captured).digest("hex"), hash, name);
  }
});

test("uses the current fixed ingredient descriptions", () => {
  assert.deepEqual(item("AP Caesar Salad").allergens, ["milk", "wheat", "gluten", "fish"]);
  assert.deepEqual(item("Chicken Parmesan").allergens, ["milk", "wheat", "gluten", "sesame"]);
  assert.deepEqual(item("Calamari 'Fritto'").allergens, ["egg", "shellfish"]);
  assert.deepEqual(item("Italian Rainbow Cake").allergens, ["milk", "egg", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("The Marinara").allergens, ["milk", "wheat", "gluten"]);
});

test("keeps optional proteins and unsupported nonalcoholic claims out of fixed allergens", () => {
  assert.deepEqual(item("Italian Hash Browns").allergens, ["milk"]);
  assert.equal(item("Italian Hash Browns").allergens.includes("fish"), false);
  assert.deepEqual(item("The Breakfast Sandwich").allergens, ["milk", "egg", "wheat", "gluten", "sesame"]);
  assert.equal(item("The Breakfast Sandwich").allergens.includes("fish"), false);
  assert.deepEqual(item("Run Wild").allergens, []);
  assert.equal(item("Run Wild").allergenSourceType, "unavailable");
});

test("preserves every adjudicated product through the quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
});
