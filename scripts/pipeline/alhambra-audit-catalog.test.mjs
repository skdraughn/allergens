import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAlhambraAuditSnapshot } from "./alhambra-audit-catalog.mjs";

const snapshot = buildAlhambraAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds every current Alhambra food and nonalcoholic formulation", async () => {
  assert.equal(snapshot.itemCount, 107);
  assert.equal(snapshot.presentationCount, 130);
  assert.equal(snapshot.categoryCount, 24);
  assert.equal(snapshot.ingredientSignalCount, 75);
  assert.equal(snapshot.unavailableAllergenCount, 32);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 107);
  assert.equal(item("Avocado & Shrimp Salad").presentations.length, 2);
  assert.equal(item("Alhambra Trio").presentations.length, 2);
  assert.equal(item("Executive Lunch — Three Courses").presentations.length, 1);

  for (const rejected of [
    "Bottomless Mimosa",
    "Bottomless Bloody Mary",
    "The Red Snapper",
    "The Capitol Mary",
    "Continental Copy Copy Copy Copy",
    "Choice of entree:",
    "ADD ONS:",
  ]) {
    assert.equal(item(rejected), undefined, rejected);
  }

  const captured = await readFile("data/restaurant-verification/artifacts/replacement-alhambra-washington-dc/official-current-menus.html");
  assert.equal(createHash("sha256").update(captured).digest("hex"), "5eca44a82a4617915dce48574a5f4c9ad1b69088a822a582ab42a0fca03ce6fc");
});

test("keeps configurable choices out of fixed allergen claims", () => {
  assert.deepEqual(item("Alhambra Platter").allergens, []);
  assert.equal(item("Alhambra Platter").allergenSourceType, "unavailable");
  assert.deepEqual(item("Organic Quinoa Salad").allergens, ["milk", "tree-nut"]);
  assert.equal(item("Organic Quinoa Salad").allergens.includes("fish"), false);
  assert.equal(item("Organic Quinoa Salad").allergens.includes("shellfish"), false);
  assert.deepEqual(item("Avocado Toast").allergens, ["wheat", "gluten"]);
  assert.equal(item("Avocado Toast").allergens.includes("fish"), false);
  assert.deepEqual(item("Executive Lunch — Three Courses").allergens, ["milk", "egg", "tree-nut", "wheat", "gluten"]);
});

test("maps explicit ingredients and unavoidable named formats", () => {
  assert.deepEqual(item("Belgian Waffle").allergens, ["milk", "egg", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("St. Regis Omelet").allergens, ["milk", "egg", "fish", "shellfish"]);
  assert.deepEqual(item("Blackened Octopus").allergens, ["shellfish"]);
  assert.deepEqual(item("12 Ounce Prime Ribeye").allergens, ["mustard"]);
  assert.deepEqual(item("Peanut Butter & Banana Smoothie").allergens, ["peanut", "tree-nut"]);
  assert.deepEqual(item("Coconut Chia Parfait").allergens, ["tree-nut"]);
});

test("preserves every adjudicated product through the quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
});
