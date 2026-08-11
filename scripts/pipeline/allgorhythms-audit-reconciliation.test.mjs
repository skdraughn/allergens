import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAllGoRhythmsBaselineItems } from "./allgorhythms-audit-reconciliation.mjs";

const restaurantId = "osm-allgorhythms-12234974276";
const [checksText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const result = reconcileAllGoRhythmsBaselineItems(
  checksText.trim().split(/\r?\n/).map(JSON.parse),
  JSON.parse(snapshotText),
);
const check = (name) => result.itemChecks.find((candidate) => candidate.baseline.name === name);

test("reconciles every frozen AllGoRhythms row", () => {
  assert.equal(result.itemChecks.length, 82);
  assert.deepEqual(result.counts, {
    dispositions: { artifact: 8, exact_match: 72, variant_match: 2 },
    allergens: { not_applicable: 8, mismatch: 26, accurately_unavailable: 25, verified: 23 },
    mismatchKinds: { underreported: 16, overreported: 10 },
  });
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending"), false);
  assert.equal(result.itemChecks.some((candidate) => candidate.allergenVerdict === "pending"), false);
});

test("separates homepage and menu-shell artifacts from current food formulations", () => {
  for (const name of [
    "🔥 Main Plates & Entrees",
    "$14.00/Veg",
    "$16.00/Chicken",
    "INSPIRED COCKTAILS",
    "make some memories",
    "Lamb Chops or Grilled Sea Bass Fish",
  ]) {
    assert.equal(check(name).disposition, "artifact", name);
    assert.equal(check(name).allergenVerdict, "not_applicable", name);
  }
});

test("records the material frozen allergen corrections", () => {
  for (const name of ["Baklava", "Blast Naan", "Pasta Prelude", "Personal Pizza", "Veggie Delight Wrap"]) {
    assert.equal(check(name).allergenVerdict, "mismatch", name);
  }
  for (const name of ["Bold Chilli Bites", "Boom Boom Cauli Bites (Cauliflower Bites)", "Pop Start Poppers"]) {
    assert.equal(check(name).allergenVerdict, "mismatch", name);
  }
  assert.equal(check("Crispy Spice").disposition, "variant_match");
  assert.equal(check("Signature Kabob Sizzle").disposition, "variant_match");
});
