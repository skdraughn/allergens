import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAllSpiceAuditSnapshot } from "./allspice-audit-catalog.mjs";
import { reconcileAllSpiceBaselineItems } from "./allspice-audit-reconciliation.mjs";

const restaurantId = "osm-allspice-catering-3397462219";
const baselineText = await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8");
const baseline = baselineText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = await buildAllSpiceAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const result = reconcileAllSpiceBaselineItems(baseline, snapshot);

test("reconciles every frozen AllSpice row to a terminal item disposition", () => {
  assert.equal(result.itemChecks.length, 108);
  assert.deepEqual(result.counts.dispositions, { artifact: 57, exact_match: 51 });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 57,
    verified: 12,
    mismatch: 36,
    accurately_unavailable: 3,
  });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 35, mixed: 1 });
  assert.equal(result.itemChecks.filter((row) => row.disposition === "pending").length, 0);
  assert.equal(result.itemChecks.filter((row) => row.allergenVerdict === "pending").length, 0);
});

test("rejects navigation, category, and nested component rows as structural artifacts", () => {
  for (const name of [
    "Featured Menus",
    "Hot Entrees",
    "Ham & Cheese",
    "Mac-N-Cheese",
    "2 sides of fries",
    "Food tags",
    "Planning an Event?",
  ]) {
    const check = result.itemChecks.find((row) => row.baseline.name === name);
    assert.equal(check?.disposition, "artifact", name);
    assert.equal(check?.allergenVerdict, "not_applicable", name);
    assert.equal(check?.sourceEvidenceIds.length, 5, name);
  }
});

test("records retained-row allergen corrections against the complete official catalog", () => {
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  assert.equal(byName.get("Buffalo Chicken Bowl").allergenVerdict, "mismatch");
  assert.match(byName.get("Buffalo Chicken Bowl").notes, /contains milk/);
  assert.equal(byName.get("Classic Quiche Lorraine").allergenVerdict, "mismatch");
  assert.match(byName.get("Classic Quiche Lorraine").notes, /contains milk, egg/);
  assert.equal(byName.get("Aztec Quinoa & Avocado Salad").allergenVerdict, "accurately_unavailable");
  assert.equal(byName.get("2nd Assortment of Signature Sandwiches").allergenVerdict, "mismatch");
});

test("documents that the partial crawl omitted 158 current formulations", () => {
  const retainedNames = new Set(result.itemChecks
    .filter((row) => row.disposition !== "artifact")
    .map((row) => row.baseline.name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()));
  const omitted = snapshot.items.filter((candidate) =>
    !retainedNames.has(candidate.name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()));
  assert.equal(omitted.length, 158);
  for (const name of ["Bagel Tray", "Maryland Crab Boil", "Sushi", "Rosemary-Merlot Flank Steak"]) {
    assert.ok(omitted.some((candidate) => candidate.name === name), name);
  }
});
