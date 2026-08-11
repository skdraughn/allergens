import assert from "node:assert/strict";
import test from "node:test";

import { buildAlbiAuditSnapshot } from "./albi-audit-catalog.mjs";
import { classifyMenuItemRow } from "../menu-item-quality.mjs";

const snapshot = buildAlbiAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds every visually reviewed current Albi formulation", () => {
  assert.equal(snapshot.itemCount, 41);
  assert.equal(snapshot.presentationCount, 41);
  assert.equal(snapshot.categoryCount, 11);
  assert.equal(snapshot.ingredientSignalCount, 31);
  assert.equal(snapshot.crossContactOnlyCount, 10);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 41);
  assert.equal(snapshot.items.some((candidate) => candidate.name === "KHUBZ +"), false);
  assert.equal(snapshot.items.some((candidate) => candidate.name === "GRILLED BONE-IN STRIP"), false);
});

test("maps only fixed published signals and mandatory named formats", () => {
  assert.deepEqual(item("OYSTER").allergens, ["milk", "fish", "shellfish"]);
  assert.deepEqual(item("CRISPY KIBBEH").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("MUSHROOMS LIGHTLY SMOKED").allergens, ["egg", "wheat", "gluten"]);
  assert.deepEqual(item("SALATA ARABIYA").allergens, ["milk", "sesame"]);
  assert.deepEqual(item("TROUT STEAMED IN GRAPE LEAVES").allergens, ["fish", "shellfish"]);
  assert.deepEqual(item("KNAFEH").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("STRAWBERRY").allergens, []);
  assert.deepEqual(item("HERBAL TEA (CAFFEINE FREE)").allergens, []);
  assert.equal(item("HERBAL TEA (CAFFEINE FREE)").isConfigurable, true);
});

test("keeps the FAQ's sesame limitation global and narrow", () => {
  assert.ok(snapshot.items.every((candidate) => JSON.stringify(candidate.mayContain) === JSON.stringify(["sesame"])));
  assert.equal(item("SOFRA").allergenSourceType, "official-global-cross-contact-note");
  assert.equal(item("BLACK TEA").allergenSourceType, "official-global-cross-contact-note");
  assert.match(snapshot.sourceWarning, /not expanded into invented may-contain claims for every allergen/);
});

test("the shared quality classifier retains Albi's rose and arak desserts", () => {
  for (const name of ["STRAWBERRY", "Ma’amoul", "Qatayef"]) {
    assert.equal(classifyMenuItemRow(item(name)).kind, "menu-item", name);
  }
});
