import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  enrichApplebeesChecksFromFrozenRestaurant,
  reconcileApplebeesBaselineItems,
} from "./applebees-audit-reconciliation.mjs";
import { restaurantIdApplebees } from "./applebees-audit-catalog.mjs";

async function inputs() {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(path.resolve(`data/restaurant-verification/item-checks/${restaurantIdApplebees}.jsonl`), "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${restaurantIdApplebees}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const live = JSON.parse(liveText);
  const restaurant = (Array.isArray(live) ? live : live.restaurants)
    .find((entry) => entry.id === restaurantIdApplebees);
  const checks = enrichApplebeesChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    restaurant,
  );
  return { checks, snapshot: JSON.parse(snapshotText) };
}

test("reconciles all 118 frozen Applebee's rows with no unresolved disposition", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileApplebeesBaselineItems(checks, snapshot);
  assert.equal(result.itemChecks.length, 118);
  assert.deepEqual(result.counts.dispositions, { exact_match: 106, stale_extra: 12 });
  assert.deepEqual(result.counts.allergens, { mismatch: 106, not_applicable: 12 });
  assert.deepEqual(result.counts.menuContent, { verified: 106, not_applicable: 12 });
  assert.equal(result.counts.matchedBaselineItemCount, 106);
  assert.equal(result.counts.matchedCurrentItemCount, 106);
  assert.equal(result.counts.omittedCurrentItemCount, 24);
  assert.equal(result.counts.fixedSignalMismatchCount, 8);
  assert.equal(result.counts.globalCrossContactMismatchCount, 106);
  assert.equal(result.itemChecks.some((entry) => entry.disposition === "pending"), false);
  assert.equal(result.itemChecks.some((entry) => entry.disposition === "missing_from_source"), false);
});

test("classifies expired all-you-can-eat variants and removed products as stale", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileApplebeesBaselineItems(checks, snapshot);
  const stale = new Set(result.itemChecks
    .filter((entry) => entry.disposition === "stale_extra")
    .map((entry) => entry.baseline.name));
  for (const name of [
    "Bacon Cheddar Crispy Chicken Sandwich (with Grilled Chicken)",
    "Boneless Wings, Initial Order",
    "Boneless Wings, Refill Order",
    "Double Crunch Shrimp, Initial Order",
    "Impossible Cheeseburger",
    "Neighborhood Nachos (with Beef)",
    "Riblets, Refill Order",
    "Whole Lotta Bacon Burger",
  ]) {
    assert.equal(stale.has(name), true, name);
  }
});

test("identifies the eight frozen item-matrix omissions separately from global cross-contact", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileApplebeesBaselineItems(checks, snapshot);
  const fixedMismatchNames = result.itemChecks
    .filter((entry) => /Frozen fixed signals/.test(entry.notes ?? ""))
    .map((entry) => entry.baseline.name)
    .sort();
  assert.deepEqual(fixedMismatchNames, [
    "Brownie Bite",
    "Caesar Salad",
    "Caesar Salad (Side)",
    "Caesar Salad (with Grilled Chicken)",
    "Chicken Wonton Tacos",
    "Oriental Chicken Salad (with Crispy Chicken)",
    "Oriental Chicken Salad (with Grilled Chicken)",
    "Sesame Salmon Bowl",
  ].sort());
});
