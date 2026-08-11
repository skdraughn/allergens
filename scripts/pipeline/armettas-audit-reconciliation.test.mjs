import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileArmettasBaselineItems } from "./armettas-audit-reconciliation.mjs";

async function inputs() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/osm-armetta-s-italian-pizzeria-3935138350.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/osm-armetta-s-italian-pizzeria-3935138350/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  return {
    checks: checkText.trim().split(/\r?\n/).map(JSON.parse),
    snapshot: JSON.parse(snapshotText),
  };
}

test("accounts for every frozen row and current product", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArmettasBaselineItems(checks, snapshot);

  assert.deepEqual(result.counts.dispositions, {
    exact_match: 186,
    artifact: 47,
    normalized_match: 5,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 191);
  assert.equal(result.counts.matchedCurrentItemCount, 191);
  assert.equal(result.counts.artifactItemCount, 47);
  assert.equal(result.counts.omittedCurrentItemCount, 34);
  assert.equal(result.counts.fixedSignalMismatchCount, 142);
  assert.equal(result.counts.provenanceMismatchCount, 29);
  assert.equal(result.counts.menuContentMismatchCount, 80);
});

test("separates structured modifiers from standalone products", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArmettasBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));

  for (const name of [
    "All Drums",
    "Feta",
    "Spinach",
    "9\" Extra Meat",
    "Shrimp (5)",
    "4 Oz. Cup Specialty Sauce",
  ]) assert.equal(byName.get(name).disposition, "artifact", name);
  assert.equal(byName.get("3 Pcs Meatballs").disposition, "normalized_match");
  assert.equal(byName.get("Gnocchi Capri").disposition, "normalized_match");
  assert.equal(byName.get("Shrimp Fra Diavolo").disposition, "normalized_match");
  assert.equal(byName.get("Small Fries").disposition, "normalized_match");
  assert.equal(byName.get("Kids Create Your Own Pasta").disposition, "normalized_match");
});

test("records every current omission from the frozen catalog", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArmettasBaselineItems(checks, snapshot);
  const omitted = new Set(result.omittedCurrentItems.map((row) => row.name));

  for (const name of [
    "Lunch Rigatoni Vodka",
    "Onion Rings",
    "Small Vodka Pizza",
    "Rigatoni Vodka",
    "Linguini Clams White Sauce",
    "Tiramisu",
    "Oreo cake",
    "Honey Mustard",
    "Coca-Cola, 2 Liters",
  ]) assert.equal(omitted.has(name), true, name);
});
