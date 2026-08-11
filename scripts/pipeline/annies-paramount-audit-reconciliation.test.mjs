import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  enrichAnniesParamountChecksFromFrozenRestaurant,
  reconcileAnniesParamountBaselineItems,
} from "./annies-paramount-audit-reconciliation.mjs";

const restaurantId = "annie-s-paramount-steak-house-washington-dc-dc-metro";

test("reconciles every frozen Annie's row and accounts for every current product", async () => {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(new URL(`../../data/restaurant-verification/item-checks/${restaurantId}.jsonl`, import.meta.url), "utf8"),
    readFile(new URL(`../../data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, import.meta.url), "utf8"),
    readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants)
    .find((row) => row.id === restaurantId);
  const checks = enrichAnniesParamountChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileAnniesParamountBaselineItems(checks, JSON.parse(snapshotText));

  assert.equal(result.itemChecks.length, 121);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(result.counts.dispositions.missing_from_source ?? 0, 0);
  assert.equal(
    result.counts.matchedCurrentItemCount + result.counts.omittedCurrentItemCount,
    112,
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "ENTRÉE SALADS").disposition,
    "artifact",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Rainbow Trout").disposition,
    "stale_extra",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Basil-Pine Nut Pesto Pasta").allergenVerdict,
    "mismatch",
  );
  assert.equal(
    result.itemChecks.find((row) => row.baseline.name === "Feta Bacon Omelet").allergenVerdict,
    "mismatch",
  );
});
