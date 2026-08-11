import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  enrichAntonellisPizzaChecksFromFrozenRestaurant,
  reconcileAntonellisPizzaBaselineItems,
} from "./antonellis-pizza-audit-reconciliation.mjs";

const restaurantId = "replacement-antonelli-s-pizza-lorton-va";

test("reconciles every frozen Antonelli's row and accounts for the current catalog", async () => {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(new URL(`../../data/restaurant-verification/item-checks/${restaurantId}.jsonl`, import.meta.url), "utf8"),
    readFile(new URL(`../../data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, import.meta.url), "utf8"),
    readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants)
    .find((row) => row.id === restaurantId);
  const checks = enrichAntonellisPizzaChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileAntonellisPizzaBaselineItems(checks, JSON.parse(snapshotText));

  assert.equal(result.itemChecks.length, 100);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(result.counts.dispositions.missing_from_source ?? 0, 0);
  assert.equal(result.counts.dispositions.artifact, 37);
  assert.equal(result.counts.matchedCurrentItemCount, 63);
  assert.equal(result.counts.omittedCurrentItemCount, 17);
  assert.equal(
    result.counts.matchedCurrentItemCount + result.counts.omittedCurrentItemCount,
    80,
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Coupons").disposition,
    "artifact",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "THE COLD").disposition,
    "variant_match",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "PLAIN CHEESE").allergenVerdict,
    "mismatch",
  );
  assert.ok(result.omittedCurrentItems.some((item) => item.name === "NY Style Cheesecake"));
  assert.ok(result.omittedCurrentItems.some((item) => item.name === "BAKED ZITI"));
});
