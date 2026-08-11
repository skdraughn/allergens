import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAriakeRestonBaselineItems } from "./ariake-reston-audit-reconciliation.mjs";

async function inputs() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/ariake-japanese-restaurant-reston-va-dc-metro.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/ariake-japanese-restaurant-reston-va-dc-metro/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  return {
    checks: checkText.trim().split(/\r?\n/).map(JSON.parse),
    snapshot: JSON.parse(snapshotText),
  };
}

test("accounts for every frozen row and current Reston product", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAriakeRestonBaselineItems(checks, snapshot);

  assert.deepEqual(result.counts.dispositions, {
    location_mismatch: 10,
    exact_match: 117,
    normalized_match: 55,
    artifact: 6,
    variant_match: 2,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 174);
  assert.equal(result.counts.matchedCurrentItemCount, 168);
  assert.equal(result.counts.artifactItemCount, 6);
  assert.equal(result.counts.locationMismatchItemCount, 10);
  assert.equal(result.counts.staleItemCount, 0);
  assert.equal(result.counts.omittedCurrentItemCount, 67);
  assert.equal(result.counts.fixedSignalMismatchCount, 141);
  assert.equal(result.counts.provenanceMismatchCount, 141);
  assert.equal(result.counts.menuContentMismatchCount, 150);
});

test("separates Fairfax rows and nested options from Reston products", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAriakeRestonBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [`${row.baseline.category}::${row.baseline.name}`, row]));

  for (const name of ["Albacore Tataki", "Shishito Peppers", "Alaskan Salmon Roll", "15. Tendon", "Saba", "20. Salmon Sashimi Lunch"]) {
    const row = result.itemChecks.find((entry) => entry.baseline.name === name);
    assert.equal(row.disposition, "location_mismatch", name);
  }
  assert.equal(byName.get("Sushi::FAIRFAX ONLINE ORDERING HOURS:").disposition, "artifact");
  assert.equal(byName.get("Sushi Lunch::a) with 6 pcs California Roll OR").disposition, "artifact");
  assert.equal(byName.get("DINNER BENTO BOX (BOXED MEAL)::Spinach goma ae (sesame sauce)").disposition, "artifact");
  assert.equal(byName.get("DINNER BENTO BOX (BOXED MEAL)::Chicken Tsukune").disposition, "artifact");
});

test("maps split variants and records newly restored products", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileAriakeRestonBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  const omitted = new Set(result.omittedCurrentItems.map((row) => row.name));

  assert.equal(byName.get("12. Tekka or Salmon Don").disposition, "variant_match");
  assert.equal(byName.get("Tuna or Salmon Tataki Salad").disposition, "variant_match");
  assert.equal(byName.get("Fried Ice Cream").disposition, "normalized_match");
  assert.equal(byName.get("Miso Nabayaki Udon").disposition, "normalized_match");
  for (const name of ["Dinner Bento Box", "Hire Katsu", "Takoyaki", "Spicy Volcano Roll", "Aji", "Zuwaigani"]) {
    assert.equal(omitted.has(name), true, name);
  }
});
