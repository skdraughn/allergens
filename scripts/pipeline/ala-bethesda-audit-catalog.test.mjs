import assert from "node:assert/strict";
import test from "node:test";

import { buildAlaBethesdaAuditSnapshot } from "./ala-bethesda-audit-catalog.mjs";

const snapshot = buildAlaBethesdaAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((row) => row.name === name);

test("matches all 35 current Toast products across four real sections", () => {
  assert.equal(snapshot.itemCount, 35);
  assert.equal(snapshot.presentationCount, 35);
  assert.equal(snapshot.categoryCount, 4);
  assert.deepEqual([...new Set(snapshot.items.map((row) => row.category))], ["COLD MEZZE", "HOT MEZZE", "LARGE PLATES", "SWEETS"]);
  assert.ok(item("LAYALI LUBNAN"));
  assert.equal(snapshot.items.some((row) => row.category === "Mediterranean"), false);
});

test("restores fixed signals omitted by the flattened Toast extraction", () => {
  assert.deepEqual(item("ZA'ATAR LABNEH").allergens, ["milk"]);
  assert.deepEqual(item("DUCK PROSCIUTTO").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("TUNA TARTARE DOLMADES").allergens, ["milk", "fish", "mustard"]);
  assert.deepEqual(item("SALMON KIBBEH NAYAH").allergens, ["wheat", "gluten", "fish"]);
  assert.deepEqual(item("MANTI").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("ADANA KEBAB").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("ANTEP BAKLAVA").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("LAYALI LUBNAN").allergens, ["tree-nut", "wheat", "gluten"]);
});

test("does not convert dietary labels or absent recipes into negative or fixed claims", () => {
  assert.deepEqual(item("HUMMUS").allergens, []);
  assert.deepEqual(item("FALAFEL").allergens, []);
  assert.deepEqual(item("MUSHROOM SHISH KEBAB").allergens, []);
  assert.equal(item("LAYALI LUBNAN").allergens.includes("milk"), false);
  assert.ok(snapshot.items.every((row) => row.mayContain.length === 0));
});
