import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileApapachoBaselineItems } from "./apapacho-taqueria-audit-reconciliation.mjs";

const restaurantId = "replacement-apapacho-taqueria-washington-dc";
const [checkText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const checks = checkText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = JSON.parse(snapshotText);

test("reconciles all 51 frozen Apapacho rows and all 40 current products", () => {
  const result = reconcileApapachoBaselineItems(checks, snapshot);

  assert.equal(result.itemChecks.length, 51);
  assert.equal(result.counts.matchedBaselineItemCount, 35);
  assert.equal(result.counts.matchedCurrentItemCount, 34);
  assert.equal(result.counts.omittedCurrentItemCount, 6);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 28,
    normalized_match: 4,
    variant_match: 3,
    stale_extra: 16,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 28,
    mismatch: 7,
    not_applicable: 16,
  });
  assert.deepEqual(result.counts.menuContent, {
    mismatch: 35,
    not_applicable: 16,
  });
  assert.deepEqual(result.omittedCurrentItems.map((item) => item.name), [
    "Chilaquiles",
    "Seasonal Popsicle",
    "Bottled Water",
    "Mexican Coke",
    "Diet Coke",
    "Sangria Señorial",
  ]);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("records the frozen false positives and missing breading signals", () => {
  const result = reconcileApapachoBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));

  assert.equal(byName.get("Tacos de Mushrooms").allergenVerdict, "mismatch");
  assert.match(byName.get("Tacos de Mushrooms").notes, /supported current signals \[none\]/);
  assert.equal(byName.get("Fried Corn Quesadilla").allergenVerdict, "mismatch");
  assert.match(byName.get("Fried Corn Quesadilla").notes, /supported current signals \[milk\]/);
  assert.equal(byName.get("Chicken Milanesa").allergenVerdict, "mismatch");
  assert.match(byName.get("Chicken Milanesa").notes, /gluten, wheat/);
  assert.equal(byName.get("Tacos de Baja Shrimp").allergenVerdict, "mismatch");
  assert.equal(byName.get("Arroz con Leche").allergenVerdict, "mismatch");
  assert.equal(byName.get("Oaxacan Chocolate cookie").allergenVerdict, "mismatch");
});

test("classifies historical Square inventory and duplicate happy-hour presentations", () => {
  const result = reconcileApapachoBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));

  for (const name of [
    "8 course Tasting Dinner - Las Quince Letras X Apapacho",
    "Champurrado 1qt",
    "Chocolate tamal",
    "Tamal",
    "Tamaliza ( Pack of 5 tamales)",
    "To go Modelo",
    "Tostada Reyna",
  ]) {
    assert.equal(byName.get(name).disposition, "stale_extra", name);
  }
  assert.equal(byName.get("Milanesa HH").disposition, "variant_match");
  assert.deepEqual(byName.get("Milanesa HH").currentItemIds, ["chicken-milanesa"]);
  assert.equal(byName.get("Taco Beef stew & Cactus").disposition, "variant_match");
  assert.deepEqual(byName.get("Taco Beef stew & Cactus").currentItemIds, [
    "beef-stew-with-nopalitos",
  ]);
});
