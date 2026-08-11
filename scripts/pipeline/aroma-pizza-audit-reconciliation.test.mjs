import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAromaPizzaBaselineItems } from "./aroma-pizza-audit-reconciliation.mjs";

async function inputs() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/aroma-pizza-lorton-dc-metro.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/aroma-pizza-lorton-dc-metro/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  return {
    checks: checkText.trim().split(/\r?\n/).map(JSON.parse),
    snapshot: JSON.parse(snapshotText),
  };
}

test("accounts for every frozen row and current product", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAromaPizzaBaselineItems(checks, snapshot);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 163,
    normalized_match: 7,
    artifact: 8,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 170);
  assert.equal(result.counts.matchedCurrentItemCount, 170);
  assert.equal(result.counts.artifactItemCount, 8);
  assert.equal(result.counts.omittedCurrentItemCount, 29);
  assert.equal(result.counts.fixedSignalMismatchCount, 109);
  assert.equal(result.counts.provenanceMismatchCount, 109);
  assert.equal(result.counts.menuContentMismatchCount, 170);
});

test("separates headings and repairs normalized product identities", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAromaPizzaBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  for (const name of [
    "Wings",
    "Soup & Salad",
    "Cheese Pizzas make your own",
    "Baked Pastas",
    "Chicken pastas",
    "Chicken Pizza",
    "Seafood Pasta",
  ]) assert.equal(byName.get(name).disposition, "artifact", name);
  for (const name of [
    "Baked Fries & Cheese",
    "Chicken Philly& Cheese Sub",
    "Garlic knots(40-45 PCs)",
    "Turkey Ham & cheese Sub",
  ]) assert.equal(byName.get(name).disposition, "normalized_match", name);
  assert.deepEqual(byName.get("Chicken Pizza").currentItemIds, []);
});

test("records every current omission from the frozen catalog", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAromaPizzaBaselineItems(checks, snapshot);
  const omitted = new Set(result.omittedCurrentItems.map((row) => row.name));
  for (const name of [
    "10'' Philly Steak Pizza",
    "Fries",
    "Steamed Broccoli",
    "Pirouline Choc Hazelnut",
    "Family deal 2 Large 1 topping pizzas, 10 wings & mozzarella sticks",
    "Can Soda",
    "AleoVera drink",
  ]) assert.equal(omitted.has(name), true, name);
});
