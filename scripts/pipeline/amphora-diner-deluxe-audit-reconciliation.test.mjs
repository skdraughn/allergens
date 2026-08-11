import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAmphoraAuditSnapshot } from "./amphora-diner-deluxe-audit-catalog.mjs";
import {
  reconcileAmphoraBaselineItems,
  restaurantIdAmphoraHerndon,
} from "./amphora-diner-deluxe-audit-reconciliation.mjs";

const id = "osm-amphora-diner-deluxe-152763392";
const checks = readFileSync(`data/restaurant-verification/item-checks/${id}.jsonl`, "utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
const snapshot = await buildAmphoraAuditSnapshot({ retrievedAt: "2026-07-15T04:00:00.000Z" });
const result = reconcileAmphoraBaselineItems(checks, snapshot);
const byBaselineName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));

test("Amphora reconciles every one of the 100 frozen rows", () => {
  assert.equal(result.itemChecks.length, 100);
  assert.ok(result.itemChecks.every((check) => check.disposition !== "pending"));
  assert.ok(result.itemChecks.every((check) => check.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    artifact: 16,
    exact_match: 35,
    variant_match: 9,
    normalized_match: 40,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 16,
    mismatch: 45,
    verified: 26,
    accurately_unavailable: 13,
  });
});

test("Amphora removes headings, modifier rows, fragments, captions, and the promo card", () => {
  for (const name of [
    "ADDITIONAL TOPPINGS",
    "Amphora Classics",
    "Amphora’s Diner Deluxe",
    "Bagel with Cream Cheese",
    "Beef Tenderloin Medallions Sautéed with Mushrooms",
    "Cheese Vegetables Meats etc",
    "Coleslaw & Pickle",
    "Cream Sauce",
    "Eggs & Omelets",
    "Fresh Catch",
    "GROUND LAMB KEBABS",
    "Heavenly Hollandaise",
    "Honey Drizzle",
    "Sandwiches & Favorites",
    "SPECIALTY PASTA",
    "Substitute Cholesterol Free Egg Beaters or Egg Whites",
  ]) {
    const check = byBaselineName.get(name);
    assert.equal(check.disposition, "artifact", name);
    assert.equal(check.allergenVerdict, "not_applicable", name);
  }
});

test("Amphora maps current renamed and corrected formulations", () => {
  for (const [baselineName, currentName] of [
    ["Amphora’s Beef Chili", "Amphora’s Beef Chili (Cup)"],
    ["Assorted Hot Tea", "Assorted Hot Teas"],
    ["Flaky Biscuits with Sausage Gravy*", "Country Style Biscuits with Sausage Gravy"],
    ["Lavazza Coffee (Regular & Decaf)", "Lavazza Coffee"],
    ["Mediterranean Vegetable Hash and Eggs", "Vegetable Hash and Eggs"],
    ["New York Sirloin Steak", "Broiled New York Sirloin Steak 10 oz"],
    ["Pan Seared Salmon Filet", "Pan Seared Salmon Filet with an Artichoke Cream Sauce"],
    ["Roast Turkey Dinner", "Roast Turkey"],
    ["Truffle Cake Balls Nut Collectio", "Truffle Cake Balls ~ Nut Collection"],
  ]) {
    const check = byBaselineName.get(baselineName);
    assert.equal(check.disposition, "variant_match", baselineName);
    assert.match(check.notes, new RegExp(currentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Amphora keeps current official-only rows instead of treating online-order absence as staleness", () => {
  for (const name of ["Baklava Pancakes", "Candy Sundae", "Carrot Cake", "Hot Fudge Sundae", "S'mores Sundae", "Triple Chocolate Split"]) {
    const check = byBaselineName.get(name);
    assert.notEqual(check.disposition, "artifact", name);
    assert.notEqual(check.disposition, "stale_extra", name);
    assert.ok(check.sourceEvidenceIds.includes("official-current-menu-pdf"), name);
  }
});

test("Amphora identifies the frozen adjacency and advisory allergen smears", () => {
  for (const name of [
    "Glazed Salmon Salad*",
    "Grilled Salmon Filet with Ratatouille*",
    "New York Sirloin Steak",
    "Shrimp Salad Sandwich",
    "Spinach Ravioli",
    "Turkey Burger Deluxe*",
  ]) {
    assert.equal(byBaselineName.get(name).allergenVerdict, "mismatch", name);
  }
  assert.match(byBaselineName.get("Glazed Salmon Salad*").notes, /contains \[fish\]/);
  assert.match(byBaselineName.get("New York Sirloin Steak").notes, /uses unavailable/);
});

test("Amphora frozen record omitted 217 current formulations", () => {
  assert.equal(result.counts.matchedBaselineRows, 84);
  assert.equal(result.counts.matchedCurrentFormulations, 83);
  assert.equal(result.counts.omittedCurrentFormulations, 217);
  for (const name of [
    "Amphora’s Pick 2",
    "Beef Burgundy",
    "Create Your Own Omelet",
    "Breakfast Panini",
    "Golden Fried Calamari",
    "Build Your Favorite Burger",
    "Classic Banana Split",
    "Irish Coffee",
    "Bottle Spring Water",
  ]) {
    assert.ok(result.omittedCurrentItems.includes(name), name);
  }
});

test("Amphora item checks cite only retained reproducible evidence IDs", () => {
  const allowed = new Set([
    "official-current-page",
    "official-current-menu-pdf",
    "fast-order-current-menu",
  ]);
  assert.ok(result.itemChecks.every((check) => check.sourceEvidenceIds.length > 0));
  assert.ok(result.itemChecks.every((check) =>
    check.sourceEvidenceIds.every((sourceId) => allowed.has(sourceId)),
  ));
});

test("the second frozen Herndon record reconciles independently to the same current catalog", () => {
  const duplicateChecks = readFileSync(
    `data/restaurant-verification/item-checks/${restaurantIdAmphoraHerndon}.jsonl`,
    "utf8",
  ).trim().split(/\r?\n/).map(JSON.parse);
  const duplicateResult = reconcileAmphoraBaselineItems(duplicateChecks, snapshot, {
    restaurantId: restaurantIdAmphoraHerndon,
  });
  assert.equal(duplicateResult.restaurantId, restaurantIdAmphoraHerndon);
  assert.equal(duplicateResult.itemChecks.length, 101);
  assert.deepEqual(duplicateResult.counts.dispositions, {
    artifact: 16,
    exact_match: 35,
    variant_match: 10,
    normalized_match: 40,
  });
  assert.deepEqual(duplicateResult.counts.allergens, {
    not_applicable: 16,
    mismatch: 45,
    accurately_unavailable: 14,
    verified: 26,
  });
  assert.equal(duplicateResult.counts.matchedBaselineRows, 85);
  assert.equal(duplicateResult.counts.matchedCurrentFormulations, 84);
  assert.equal(duplicateResult.counts.omittedCurrentFormulations, 216);
  const pick = duplicateResult.itemChecks.find((check) => check.baseline.name === "Amphora’s Pick");
  assert.equal(pick.disposition, "variant_match");
  assert.equal(pick.allergenVerdict, "accurately_unavailable");
  assert.match(pick.notes, /Amphora’s Pick 2/);
});
