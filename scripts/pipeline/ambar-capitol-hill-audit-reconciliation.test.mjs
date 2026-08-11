import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAmbarCapitolHillAuditSnapshot } from "./ambar-capitol-hill-audit-catalog.mjs";
import { reconcileAmbarCapitolHillBaselineItems } from "./ambar-capitol-hill-audit-reconciliation.mjs";

const restaurantId = "ambar-restaurant-capitol-hill-washington-dc-dc-metro";
const baselineText = await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8");
const checks = baselineText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = buildAmbarCapitolHillAuditSnapshot({ retrievedAt: "2026-07-15T01:00:00.000Z" });
const result = reconcileAmbarCapitolHillBaselineItems(checks, snapshot);
const byFrozenName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));

test("AMBAR reconciles every one of the 39 frozen rows", () => {
  assert.equal(result.restaurantId, restaurantId);
  assert.equal(result.itemChecks.length, 39);
  assert.ok(result.itemChecks.every((check) => check.disposition !== "pending"));
  assert.ok(result.itemChecks.every((check) => check.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    variant_match: 5,
    artifact: 1,
    exact_match: 15,
    normalized_match: 15,
    stale_extra: 3,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 12,
    not_applicable: 4,
    mismatch: 15,
    accurately_unavailable: 8,
  });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 14, mixed: 1 });
  assert.equal(result.counts.matchedCurrentFormulations, 35);
  assert.equal(result.counts.omittedCurrentFormulations, 69);
});

test("AMBAR adjudicates stale and parser-artifact rows without inventing replacements", () => {
  assert.equal(byFrozenName.get("Mixed Meat").disposition, "artifact");
  assert.equal(byFrozenName.get("Krempita").disposition, "stale_extra");
  assert.equal(byFrozenName.get("Balkan Style Rice").disposition, "stale_extra");
  assert.equal(byFrozenName.get("Lamb Pizza").disposition, "stale_extra");
  for (const name of ["Mixed Meat", "Krempita", "Balkan Style Rice", "Lamb Pizza"]) {
    assert.equal(byFrozenName.get(name).allergenVerdict, "not_applicable");
  }
});

test("AMBAR normalizes current names and repairs the liability-relevant defects", () => {
  assert.equal(byFrozenName.get("Grilled Mixed Meat Platter").disposition, "variant_match");
  assert.equal(byFrozenName.get("Pistachio Baklava").disposition, "normalized_match");
  assert.equal(byFrozenName.get("Mushroom Pizza").disposition, "normalized_match");
  assert.equal(byFrozenName.get("Mushroom Pizza").allergenVerdict, "mismatch");
  assert.match(byFrozenName.get("Mushroom Pizza").notes, /contains milk, wheat, gluten/);
  assert.doesNotMatch(byFrozenName.get("Mushroom Pizza").notes.split("Frozen:")[0], /shellfish/);
  assert.equal(byFrozenName.get("Kajmak").allergenVerdict, "mismatch");
  assert.equal(byFrozenName.get("Cauliflower").allergenVerdict, "mismatch");
  assert.equal(byFrozenName.get("Cheese Pie").allergenVerdict, "mismatch");
  assert.equal(byFrozenName.get("Veal Soup").allergenVerdict, "mismatch");
});

test("AMBAR item checks retain reproducible first-party evidence ids", () => {
  for (const check of result.itemChecks) {
    assert.ok(check.sourceEvidenceIds.length > 0, check.baseline.name);
  }
  assert.ok(byFrozenName.get("Tomato Soup").sourceEvidenceIds.includes("official-allergy-lunch-dinner-pdf"));
  assert.ok(byFrozenName.get("4 oz Hanger Steak").sourceEvidenceIds.includes("official-unlimited-brunch-pdf"));
  assert.ok(byFrozenName.get("Pistachio Baklava").sourceEvidenceIds.includes("official-desserts-pdf"));
});
