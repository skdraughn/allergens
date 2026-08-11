import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  enrichAnthonysFallsChurchChecksFromFrozenRestaurant,
  reconcileAnthonysFallsChurchBaselineItems,
} from "./anthonys-falls-church-audit-reconciliation.mjs";

const restaurantId = "osm-anthony-s-7464874523";

test("reconciles every frozen Anthony's row and accounts for the current catalog", async () => {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(new URL(`../../data/restaurant-verification/item-checks/${restaurantId}.jsonl`, import.meta.url), "utf8"),
    readFile(new URL(`../../data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, import.meta.url), "utf8"),
    readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants)
    .find((row) => row.id === restaurantId);
  const checks = enrichAnthonysFallsChurchChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileAnthonysFallsChurchBaselineItems(checks, JSON.parse(snapshotText));

  assert.equal(result.itemChecks.length, 184);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(result.counts.dispositions.missing_from_source ?? 0, 0);
  assert.equal(
    result.counts.matchedCurrentItemCount + result.counts.omittedCurrentItemCount,
    175,
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "KIDS").disposition,
    "artifact",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Broccoli").disposition,
    "artifact",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "CLASSIC MARGHERITA PIZZA (Large)").disposition,
    "variant_match",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "GARIDOMAKARONADA").allergenVerdict,
    "mismatch",
  );
});
