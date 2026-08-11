import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAltaStradaFairfaxAuditSnapshot } from "./alta-strada-fairfax-audit-catalog.mjs";
import { reconcileAltaStradaFairfaxBaselineItems } from "./alta-strada-fairfax-audit-reconciliation.mjs";

const restaurantId = "replacement-alta-strada-fairfax-va-fairfax-va";
const baselineText = await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8");
const baseline = baselineText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = await buildAltaStradaFairfaxAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const result = reconcileAltaStradaFairfaxBaselineItems(baseline, snapshot);

test("reconciles every frozen Fairfax row to a terminal item disposition", () => {
  assert.equal(result.itemChecks.length, 29);
  assert.deepEqual(result.counts.dispositions, {
    location_mismatch: 22,
    artifact: 2,
    exact_match: 2,
    variant_match: 3,
  });
  assert.deepEqual(result.counts.allergens, { not_applicable: 24, verified: 2, mismatch: 3 });
  assert.deepEqual(result.counts.mismatchKinds, { mixed: 2, underreported: 1 });
  assert.equal(result.itemChecks.filter((row) => row.disposition === "pending").length, 0);
  assert.equal(result.itemChecks.filter((row) => row.allergenVerdict === "pending").length, 0);
});

test("separates genuine other-location products from price-concatenation artifacts", () => {
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  for (const name of ["Grilled Filet Branzino", "Mussels Fra Diavlo", "Veal Piccata", "Prime Filet Mignon* (8oz)"]) {
    assert.equal(byName.get(name).disposition, "location_mismatch", name);
    assert.match(byName.get(name).notes, /Wellesley or Foxwoods/);
  }
  for (const name of ["37Grilled Filet Branzino", "61Prime Flat Iron Steak* (8 oz)"]) {
    assert.equal(byName.get(name).disposition, "artifact", name);
    assert.match(byName.get(name).notes, /concatenates an adjacent Wellesley price/);
  }
});

test("consolidates surviving Fairfax formulations and records their allergen corrections", () => {
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  assert.equal(byName.get("Baby Arugula Salad").allergenVerdict, "verified");
  assert.equal(byName.get("Our World Famous Garlic Bread").allergenVerdict, "verified");
  assert.equal(byName.get("Chicken Milanese").allergenVerdict, "mismatch");
  assert.match(byName.get("Chicken Milanese").notes, /contains wheat, gluten/);
  assert.equal(byName.get("Chicken Parm").disposition, "variant_match");
  assert.equal(byName.get("Spaghetti AOP").allergenVerdict, "mismatch");
});

test("documents that the cross-location crawl omitted 33 current Fairfax formulations", () => {
  const matchedCurrentNames = new Set(["Baby Arugula Salad", "Chicken Milanese or Parmigiano", "Spaghetti AOP", "Alta Strada World Famous Garlic Bread"]);
  const omitted = snapshot.items.filter((candidate) => !matchedCurrentNames.has(candidate.name));
  assert.equal(omitted.length, 33);
  for (const name of ["Whipped Ricotta", "Alta Strada Smashburger", "Potato Gnocchi", "Crab Cake Benedict", "Cacio e Pepe"]) {
    assert.ok(omitted.some((candidate) => candidate.name === name), name);
  }
});
