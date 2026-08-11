import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAmbarClarendonAuditSnapshot } from "./ambar-clarendon-audit-catalog.mjs";
import { reconcileAmbarClarendonBaselineItems } from "./ambar-clarendon-audit-reconciliation.mjs";

const restaurantId = "ambar-restaurant-clarendon-arlington-va-dc-metro";
const baselineText = await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8");
const checks = baselineText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = buildAmbarClarendonAuditSnapshot({ retrievedAt: "2026-07-15T02:00:00.000Z" });
const result = reconcileAmbarClarendonBaselineItems(checks, snapshot);
const byFrozenName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));

test("AMBAR Clarendon reconciles every one of the 39 frozen rows", () => {
  assert.equal(result.restaurantId, restaurantId);
  assert.equal(result.itemChecks.length, 39);
  assert.ok(result.itemChecks.every((check) => check.disposition !== "pending"));
  assert.ok(result.itemChecks.every((check) => check.allergenVerdict !== "pending"));
  assert.equal(result.counts.matchedCurrentFormulations + result.counts.omittedCurrentFormulations, snapshot.itemCount);
});

test("AMBAR Clarendon adjudicates stale and parser-artifact rows without inventing replacements", () => {
  assert.equal(byFrozenName.get("Mixed Meat").disposition, "artifact");
  for (const name of ["Krempita", "Slow Cooked Pork Shoulder", "Coke (Can", "Balkan Style Rice", "Lamb Pizza"]) {
    assert.equal(byFrozenName.get(name).disposition, "stale_extra", name);
    assert.equal(byFrozenName.get(name).allergenVerdict, "not_applicable", name);
  }
});

test("AMBAR Clarendon repairs the location-specific liability-relevant defects", () => {
  assert.equal(byFrozenName.get("Pistachio Baklava").disposition, "normalized_match");
  assert.equal(byFrozenName.get("Mushroom Pizza").disposition, "normalized_match");
  assert.equal(byFrozenName.get("Mushroom Pizza").allergenVerdict, "mismatch");
  assert.match(byFrozenName.get("Mushroom Pizza").notes, /contains milk, wheat, gluten/);
  assert.doesNotMatch(byFrozenName.get("Mushroom Pizza").notes.split("Frozen:")[0], /shellfish/);
  assert.equal(byFrozenName.get("Chicken Skewers").allergenVerdict, "mismatch");
  assert.match(byFrozenName.get("Chicken Skewers").notes, /contains wheat, gluten, sesame/);
  assert.equal(byFrozenName.get("Kajmak").allergenVerdict, "mismatch");
  assert.equal(byFrozenName.get("Cauliflower").allergenVerdict, "mismatch");
  assert.equal(byFrozenName.get("Cheese Pie").allergenVerdict, "mismatch");
  assert.equal(byFrozenName.get("Veal Soup").allergenVerdict, "mismatch");
});

test("AMBAR Clarendon item checks retain reproducible first-party evidence ids", () => {
  for (const check of result.itemChecks) assert.ok(check.sourceEvidenceIds.length > 0, check.baseline.name);
  assert.ok(byFrozenName.get("Tomato Soup").sourceEvidenceIds.includes("official-a-la-carte-pdf"));
  assert.ok(byFrozenName.get("4 oz Hanger Steak").sourceEvidenceIds.includes("official-unlimited-brunch-pdf"));
  assert.ok(byFrozenName.get("Pistachio Baklava").sourceEvidenceIds.includes("official-desserts-pdf"));
});
