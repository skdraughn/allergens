import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  enrichApPizzaShopBethesdaChecksFromFrozenRestaurant,
  reconcileApPizzaShopBethesdaBaselineItems,
} from "./ap-pizza-shop-bethesda-audit-reconciliation.mjs";

const restaurantId = "ap-pizza-shop-bethesda-dc-metro";

test("reconciles every frozen AP Pizza Shop row and accounts for the current union", async () => {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(new URL(`../../data/restaurant-verification/item-checks/${restaurantId}.jsonl`, import.meta.url), "utf8"),
    readFile(new URL(`../../data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, import.meta.url), "utf8"),
    readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants)
    .find((row) => row.id === restaurantId);
  const checks = enrichApPizzaShopBethesdaChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileApPizzaShopBethesdaBaselineItems(checks, JSON.parse(snapshotText));

  assert.equal(result.itemChecks.length, 47);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(result.counts.dispositions.missing_from_source ?? 0, 0);
  assert.equal(result.counts.dispositions.artifact, 2);
  assert.equal(result.counts.dispositions.stale_extra, 7);
  assert.equal(result.counts.matchedCurrentItemCount, 38);
  assert.equal(result.counts.omittedCurrentItemCount, 11);
  assert.equal(
    result.counts.matchedCurrentItemCount + result.counts.omittedCurrentItemCount,
    49,
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Lunch Pies").disposition,
    "artifact",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Il Supremo").disposition,
    "stale_extra",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Sicilian Marinara").disposition,
    "variant_match",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "The Tripper").allergenVerdict,
    "mismatch",
  );
  assert.ok(result.omittedCurrentItems.some((item) => item.name === "Duke #7"));
  assert.ok(result.omittedCurrentItems.some((item) => item.name === "Pizza Dough"));
});
