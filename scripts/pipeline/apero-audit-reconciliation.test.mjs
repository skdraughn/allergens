import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  enrichAperoChecksFromFrozenRestaurant,
  reconcileAperoBaselineItems,
} from "./apero-audit-reconciliation.mjs";
import { restaurantIdApero } from "./apero-audit-catalog.mjs";

async function inputs() {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(path.resolve(`data/restaurant-verification/item-checks/${restaurantIdApero}.jsonl`), "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${restaurantIdApero}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const live = JSON.parse(liveText);
  const restaurant = (Array.isArray(live) ? live : live.restaurants)
    .find((entry) => entry.id === restaurantIdApero);
  const checks = enrichAperoChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    restaurant,
  );
  return { checks, snapshot: JSON.parse(snapshotText) };
}

test("reconciles all 49 frozen Apéro rows with no unresolved disposition", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAperoBaselineItems(checks, snapshot);
  assert.equal(result.itemChecks.length, 49);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 14,
    variant_match: 23,
    stale_extra: 7,
    artifact: 5,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 16,
    mismatch: 21,
    not_applicable: 12,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 37);
  assert.equal(result.counts.matchedCurrentItemCount, 30);
  assert.equal(result.counts.omittedCurrentItemCount, 23);
  assert.equal(result.itemChecks.some((entry) => entry.disposition === "pending"), false);
  assert.equal(result.itemChecks.some((entry) => entry.disposition === "missing_from_source"), false);
  assert.equal(result.itemChecks.some((entry) => entry.allergenVerdict === "pending"), false);
});

test("classifies PDF headings and price fragments as artifacts", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAperoBaselineItems(checks, snapshot);
  const artifacts = result.itemChecks
    .filter((entry) => entry.disposition === "artifact")
    .map((entry) => entry.baseline.name)
    .sort();
  assert.deepEqual(artifacts, [
    "10g $82 /",
    "Beluga Hybrid",
    "Osetra",
    "Siberian Sturgeon",
    "White Sturgeon",
  ].sort());
});

test("classifies merchandise, alcohol, and obsolete POS sides as stale extras", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAperoBaselineItems(checks, snapshot);
  const stale = new Set(result.itemChecks
    .filter((entry) => entry.disposition === "stale_extra")
    .map((entry) => entry.baseline.name));
  for (const name of [
    "Absinthe Service",
    "Crab Benedict",
    "Insulated Caviar To-Go Bag",
    "Mother of Pearl Caviar spoons (set of 2)",
    "Side One Over Easy Egg",
    "Side Salad",
    "Side Toast",
  ]) {
    assert.equal(stale.has(name), true, name);
  }
});

test("maps duplicate and malformed frozen presentations to one current item", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAperoBaselineItems(checks, snapshot);
  const currentIds = (baselineNames) => result.itemChecks
    .filter((entry) => baselineNames.includes(entry.baseline.name))
    .flatMap((entry) => entry.currentItemIds);
  assert.deepEqual(new Set(currentIds([
    "Deviled Eggs",
    "Deviled Eggs bacon & chives (add caviar 35)",
  ])).size, 1);
  assert.deepEqual(new Set(currentIds([
    "Black Truffle Gougeres",
    "Gougères black truffle & gruyère cheese",
    "Gougères black truffle, gruyere cheese",
  ])).size, 1);
  assert.deepEqual(new Set(currentIds([
    "Mushroom Cigarettes parmesan crème",
    "Mushroom Cigerettes",
  ])).size, 1);
});
