import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileArtiesBaselineItems } from "./arties-audit-reconciliation.mjs";

test("reconciles every frozen Artie's row against the current owner catalog", async () => {
  const [checksText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/artie-s-fairfax-va-dc-metro.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/artie-s-fairfax-va-dc-metro/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  const result = reconcileArtiesBaselineItems(
    checksText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );

  assert.equal(result.itemChecks.length, 59);
  assert.ok(result.itemChecks.every((item) => item.disposition !== "pending"));
  assert.ok(result.itemChecks.every((item) => item.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, {
    stale_extra: 3,
    exact_match: 40,
    artifact: 4,
    normalized_match: 11,
    variant_match: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 7,
    mismatch: 45,
    verified: 7,
  });
  assert.deepEqual(result.counts.current, {
    itemCount: 60,
    matchedItemCount: 52,
    missingItemCount: 8,
    missingItemIds: [
      "community-bread-basket",
      "field-greens",
      "grilled-short-smoked-salmon",
      "gluten-free-penne-pasta-red-sauce",
      "simply-grilled-absolutely-fresh-fish",
      "low-country-beef-back-ribs",
      "filet-mignon-bearnaise",
      "blackened-prime-rib",
    ],
  });

  const byBaselineName = new Map(result.itemChecks.map((item) => [item.baseline.name, item]));
  assert.equal(byBaselineName.get("Crumb fried & tossed with thin beans & spicy pepper jelly").disposition, "artifact");
  assert.equal(byBaselineName.get("Cole Slaw").disposition, "stale_extra");
  assert.equal(byBaselineName.get("Filet Mignon").disposition, "normalized_match");
  assert.equal(byBaselineName.get("Vanilla Ice Cream").disposition, "variant_match");
  assert.equal(byBaselineName.get("Penne Primavera").allergenVerdict, "mismatch");
});
