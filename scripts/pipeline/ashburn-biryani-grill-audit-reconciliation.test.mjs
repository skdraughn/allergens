import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAshburnBiryaniGrillBaselineItems } from "./ashburn-biryani-grill-audit-reconciliation.mjs";

test("reconciles all 11 frozen Ashburn rows against the complete current catalog", async () => {
  const [checksText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/ashburn-biryani-grill-ashburn-va-dc-metro.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/ashburn-biryani-grill-ashburn-va-dc-metro/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  const result = reconcileAshburnBiryaniGrillBaselineItems(
    checksText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );

  assert.equal(result.itemChecks.length, 11);
  assert.ok(result.itemChecks.every((item) => item.disposition !== "pending"));
  assert.ok(result.itemChecks.every((item) => item.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, { exact_match: 9, normalized_match: 2 });
  assert.deepEqual(result.counts.allergens, { verified: 11 });
  assert.equal(result.counts.current.itemCount, 155);
  assert.equal(result.counts.current.matchedItemCount, 11);
  assert.equal(result.counts.current.missingItemCount, 144);
  assert.equal(result.counts.mismatchKinds.allergenOrProvenance, 0);

  const byBaselineName = new Map(result.itemChecks.map((item) => [item.baseline.name, item]));
  assert.equal(byBaselineName.get("Mutton Biryani").disposition, "normalized_match");
  assert.equal(byBaselineName.get("Veg Dum Biryani").disposition, "normalized_match");
  assert.equal(byBaselineName.get("Chicken Dum Biryani").allergenVerdict, "verified");
  assert.ok(result.counts.current.missingItemIds.includes("paneer-biryani"));
  assert.ok(result.counts.current.missingItemIds.includes("ambur-mutton-biryani"));
});
