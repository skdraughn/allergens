import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  reconcileAracosiaBaselineItems,
  staleAracosiaFrozenNames,
} from "./aracosia-audit-reconciliation.mjs";

async function reconciliation() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(
      new URL(
        "../../data/restaurant-verification/item-checks/osm-aracosia-3584164912.jsonl",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../data/restaurant-verification/repairs/osm-aracosia-3584164912/corrected-menu.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  return reconcileAracosiaBaselineItems(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
}

test("reconciles every frozen Aracosia row against the current owner catalog", async () => {
  const result = await reconciliation();

  assert.deepEqual(result.counts.dispositions, {
    exact_match: 98,
    stale_extra: 23,
    variant_match: 18,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 33,
    not_applicable: 23,
    verified: 83,
  });
  assert.deepEqual(result.counts.menuContent, {
    mismatch: 99,
    not_applicable: 23,
    verified: 17,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 116);
  assert.equal(result.counts.matchedCurrentItemCount, 98);
  assert.equal(result.counts.omittedCurrentItemCount, 9);
  assert.equal(result.counts.fixedSignalMismatchCount, 7);
  assert.equal(result.counts.inferenceMismatchCount, 32);
  assert.equal(result.counts.provenanceMismatchCount, 5);
  assert.equal(
    result.itemChecks.some((check) =>
      check.disposition === "pending" || check.allergenVerdict === "pending"
    ),
    false,
  );
});

test("classifies the exact hidden products as stale", async () => {
  const result = await reconciliation();
  const stale = result.itemChecks
    .filter((check) => check.disposition === "stale_extra")
    .map((check) => check.baseline.name)
    .sort();
  assert.deepEqual(stale, [...staleAracosiaFrozenNames].sort());
  assert.equal(
    result.itemChecks.find((check) => check.baseline.name === "Bistro Signature Mix Grill Mazza")
      .disposition,
    "variant_match",
  );
});

test("identifies all nine source-backed current omissions", async () => {
  const result = await reconciliation();
  assert.deepEqual(
    result.omittedCurrentItems.map((item) => item.name),
    [
      "Firni",
      "Marinated Beef Tenderloin (1lb) - READY TO GRILL, BBQ, COOK.",
      "Marinated Chicken Breast (1lb) - READY TO GRILL, BBQ, COOK.",
      "Marinated Chicken Thigh (1lb) READY TO GRILL, BBQ, COOK.",
      "Marinated Frenched Rack of Lamb (1lb) - READY TO GRILL, BBQ, COOK",
      "Marinated Ground Beef (1lb) - READY TO GRILL, BBQ, COOK",
      "Marinated Salmon (1lb) - READY TO GRILL, BBQ, COOK",
      "Marinated Lamb Shoulder Chops (1lb) READY TO GRILL, BBQ, COOK",
      "Marinated Lamb Tenderloin (1lb) - READY TO GRILL, BBQ, COOK",
    ],
  );
});

test("separates explicit ingredients from prior format and mustard-green inferences", async () => {
  const result = await reconciliation();
  const byName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));

  assert.equal(byName.get("Bistro Signature Lentil Soup").allergenVerdict, "mismatch");
  assert.match(byName.get("Bistro Signature Lentil Soup").notes, /owner-named signals \[milk\]/);
  assert.match(byName.get("Bistro Burger").notes, /reviewed owner-named signals \[none\]/);
  assert.match(byName.get("Bistro Burger").notes, /Ingredient Intelligence \[egg, gluten, milk, wheat\]/);
  assert.match(byName.get("Sabzi").notes, /reviewed Ingredient Intelligence \[none\]/);
  assert.match(byName.get("Quroti").notes, /owner-named signals \[milk\]/);
  assert.match(byName.get("Quroti").notes, /Ingredient Intelligence \[gluten, wheat\]/);
});
