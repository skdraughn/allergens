import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAmoosAuditSnapshot } from "./amoos-restaurant-audit-catalog.mjs";
import { reconcileAmoosBaselineItems } from "./amoos-restaurant-audit-reconciliation.mjs";

const id = "amoo-s-restaurant-mclean-va-dc-metro";
const checks = readFileSync(`data/restaurant-verification/item-checks/${id}.jsonl`, "utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
const snapshot = await buildAmoosAuditSnapshot({ retrievedAt: "2026-07-15T02:40:00.000Z" });
const result = reconcileAmoosBaselineItems(checks, snapshot);
const byName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));

test("Amoo's reconciles all 19 frozen rows", () => {
  assert.equal(result.itemChecks.length, 19);
  assert.ok(result.itemChecks.every((check) => check.disposition !== "pending"));
  assert.ok(result.itemChecks.every((check) => check.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, { location_mismatch: 16, exact_match: 3 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 16, accurately_unavailable: 3 });
});

test("Amoo's identifies every Chopped NYC row as a location mismatch", () => {
  for (const name of [
    "Bacon Cheese Fries",
    "The Bronx Chop",
    "The New York Chop",
    "The Uptown Chop",
    "Waffle Fries",
  ]) {
    assert.equal(byName.get(name).disposition, "location_mismatch", name);
    assert.match(byName.get(name).notes, /Ann Arbor/);
  }
  assert.equal(result.counts.foreignFrozenRows, 16);
});

test("Amoo's retains its three actual frozen formulations", () => {
  for (const name of ["Chimichurri Chicken", "Saffron Chicken", "Shirazi Salad"]) {
    assert.equal(byName.get(name).disposition, "exact_match", name);
    assert.equal(byName.get(name).allergenVerdict, "accurately_unavailable", name);
    assert.deepEqual(byName.get(name).sourceEvidenceIds, ["official-home", "orderspoon-current-menu"]);
  }
});

test("Amoo's frozen record omitted 68 current formulations", () => {
  assert.equal(result.counts.matchedCurrentFormulations, 3);
  assert.equal(result.counts.omittedCurrentFormulations, 68);
  for (const name of [
    "Family Platter for 2",
    "Persian Saffron Ice Cream",
    "Fesenjan",
    "Pesto Chicken Kabob",
    "Branzino Fish",
  ]) {
    assert.ok(result.omittedCurrentItems.includes(name), name);
  }
});

test("Amoo's item checks use only recorded evidence ids", () => {
  const allowed = new Set([
    "official-home",
    "orderspoon-current-menu",
    "mislinked-chopped-nyc-ann-arbor",
  ]);
  assert.ok(result.itemChecks.every((check) => check.sourceEvidenceIds.length > 0));
  assert.ok(result.itemChecks.every((check) =>
    check.sourceEvidenceIds.every((sourceId) => allowed.has(sourceId)),
  ));
});
