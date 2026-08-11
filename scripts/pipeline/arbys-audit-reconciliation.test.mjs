import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileArbysBaselineItems } from "./arbys-audit-reconciliation.mjs";

async function inputs() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/arbys.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/arbys/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  return {
    checks: checkText.trim().split(/\r?\n/).map(JSON.parse),
    snapshot: JSON.parse(snapshotText),
  };
}

test("reconciles every frozen Arby's row and exposes the missing consumer catalog", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArbysBaselineItems(checks, snapshot);

  assert.deepEqual(result.counts.dispositions, {
    exact_match: 4,
    artifact: 46,
    normalized_match: 16,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 20);
  assert.equal(result.counts.matchedCurrentItemCount, 14);
  assert.equal(result.counts.artifactItemCount, 46);
  assert.equal(result.counts.omittedCurrentItemCount, 64);
  assert.equal(result.counts.fixedSignalMismatchCount, 0);
  assert.equal(result.counts.crossContactMismatchCount, 8);
  assert.equal(result.counts.provenanceMismatchCount, 0);
  assert.equal(result.counts.menuContentMismatchCount, 15);
});

test("identifies Alliance Kitchen component rows as artifacts, not national products", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArbysBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((item) => [item.baseline.name, item]));

  for (const name of ["Au Jus", "Brioche Bun", "Chicken Fillet", "Slider Bun", "Whipped Topping"]) {
    assert.equal(byName.get(name).disposition, "artifact", name);
    assert.match(byName.get(name).notes, /Alliance Kitchen|component/i, name);
  }
  assert.equal(byName.get("Angus Cheesesteak").allergenVerdict, "verified");
  assert.equal(byName.get("Chocolate Shake – Small").allergenVerdict, "mismatch");
  assert.match(byName.get("Chocolate Shake – Small").notes, /facility/i);
});

test("records representative current products missing from the frozen output", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArbysBaselineItems(checks, snapshot);
  const omitted = new Set(result.omittedCurrentItems.map((item) => item.name));

  for (const name of [
    "Pecan Chicken Salad Sandwich",
    "Classic Beef 'n Cheddar",
    "Crispy Chicken Sandwich",
    "Chicken Tenders 3PC",
    "Crinkle Fries",
    "Bacon, Egg & Cheese Biscuit",
    "Roast Beef Gyro",
  ]) assert.equal(omitted.has(name), true, name);
});
