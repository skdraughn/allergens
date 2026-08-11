import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAmbassadorAuditSnapshot } from "./ambassador-restaurant-audit-catalog.mjs";
import { reconcileAmbassadorBaselineItems } from "./ambassador-restaurant-audit-reconciliation.mjs";

const id = "replacement-ambassador-restaurant-washington-dc";
const checks = readFileSync(`data/restaurant-verification/item-checks/${id}.jsonl`, "utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
const snapshot = buildAmbassadorAuditSnapshot({ retrievedAt: "2026-07-15T02:05:00.000Z" });
const result = reconcileAmbassadorBaselineItems(checks, snapshot);

test("Ambassador reconciles all 19 frozen rows", () => {
  assert.equal(result.itemChecks.length, 19);
  assert.deepEqual(result.counts.dispositions, { artifact: 12, exact_match: 7 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 12, accurately_unavailable: 7 });
  assert.equal(result.counts.matchedCurrentFormulations, 7);
  assert.equal(result.counts.omittedCurrentFormulations, 19);
});

test("Ambassador rejects page chrome and marketing rows", () => {
  const byName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));
  for (const name of [
    "Call Us Now",
    "Current listed hours",
    "4.8 star",
    "Find us on 9th Street NW",
    "Plan dishes that travel well",
  ]) {
    assert.equal(byName.get(name).disposition, "artifact");
    assert.equal(byName.get(name).allergenVerdict, "not_applicable");
  }
});

test("Ambassador keeps current first-party favorites", () => {
  const byName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));
  for (const name of ["Beets", "Cabbage", "Chicken", "Espresso", "Ethiopian Stew", "Lettuce", "Spinach"]) {
    assert.equal(byName.get(name).disposition, "exact_match");
    assert.equal(byName.get(name).allergenVerdict, "accurately_unavailable");
  }
});

test("Ambassador item checks retain evidence authority boundaries", () => {
  const chicken = result.itemChecks.find((check) => check.baseline.name === "Chicken");
  assert.ok(chicken.sourceEvidenceIds.includes("official-menu"));
  assert.ok(chicken.sourceEvidenceIds.includes("uber-eats-menu-browser-review"));
  assert.match(chicken.notes, /not promoted to official/i);
  assert.ok(result.itemChecks.every((check) => check.sourceEvidenceIds.length > 0));
});
