import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  enrichAnjuChecksFromFrozenRestaurant,
  reconcileAnjuBaselineItems,
} from "./anju-audit-reconciliation.mjs";

test("reconciles all 45 frozen Anju rows and identifies every current omission", async () => {
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/anju-dc.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/anju-dc/corrected-menu.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const frozenRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants)
    .find((row) => row.id === "anju-dc");
  const checks = enrichAnjuChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    frozenRestaurant,
  );
  const result = reconcileAnjuBaselineItems(
    checks,
    JSON.parse(snapshotText),
  );

  assert.equal(result.itemChecks.length, 45);
  assert.ok(result.itemChecks.every((row) => !Object.hasOwn(row.baseline, "description")));
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(result.counts.matchedCurrentItemCount + result.counts.omittedCurrentItemCount, 49);

  const optional = result.itemChecks.find((row) => row.baseline.name === "(OPTIONAL sub impossible meat)");
  assert.equal(optional.disposition, "artifact");
  const blackSesame = result.itemChecks.find((row) => row.baseline.name === "Black Sesame Bungeoppang");
  assert.equal(blackSesame.disposition, "stale_extra");
  const palace = result.itemChecks.find((row) => row.baseline.name === "Palace Ddukbokgi");
  assert.equal(palace.allergenVerdict, "mismatch");
  const mandu = result.itemChecks.find((row) => row.baseline.name === "Mandu");
  assert.equal(mandu.allergenVerdict, "mismatch");
  assert.ok(mandu.sourceEvidenceIds.includes("linked-anju-toast-order"));
  const grilledKalbi = result.itemChecks.find((row) => row.baseline.name === "Grilled Kalbi & Eggs|");
  assert.equal(grilledKalbi.disposition, "normalized_match");
});
