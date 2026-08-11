import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  enrichAnnabelleChecksFromFrozenRestaurant,
  reconcileAnnabelleBaselineItems,
} from "./annabelle-audit-reconciliation.mjs";

test("reconciles all 26 frozen Annabelle rows", async () => {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/annabelle-dc.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/annabelle-dc/corrected-menu.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const restaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants).find((row) => row.id === "annabelle-dc");
  const checks = enrichAnnabelleChecksFromFrozenRestaurant(checkText.trim().split(/\r?\n/).map(JSON.parse), restaurant);
  const result = reconcileAnnabelleBaselineItems(checks, JSON.parse(snapshotText));
  assert.equal(result.itemChecks.length, 26);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(result.counts.matchedCurrentItemCount + result.counts.omittedCurrentItemCount, 33);
  assert.equal(result.itemChecks.find((row) => row.baseline.name === "Tentsuyu Sauce").disposition, "artifact");
  assert.equal(result.itemChecks.find((row) => row.baseline.name.startsWith("Prime Angus")).allergenVerdict, "mismatch");
  assert.equal(result.itemChecks.find((row) => row.baseline.name === "Snapper").allergenVerdict, "mismatch");
});
