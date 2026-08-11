import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAkenoAuditSnapshot } from "./akeno-audit-catalog.mjs";
import { reconcileAkenoBaselineItems } from "./akeno-audit-reconciliation.mjs";

const restaurantId = "osm-akeno-sushi-thai-11475736769";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAkenoBaselineItems(baseline, buildAkenoAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }));

test("reconciles all 224 frozen Akeno rows without pending dispositions", () => {
  assert.equal(result.itemChecks.length, 224);
  assert.equal(result.itemChecks.some((item) => item.disposition === "pending" || item.allergenVerdict === "pending"), false);
  assert.equal(result.counts.dispositions.artifact, 4);
  assert.equal(result.counts.dispositions.exact_match, 209);
  assert.equal(result.counts.dispositions.stale_extra, 3);
  assert.equal(result.counts.dispositions.variant_match, 8);
  assert.deepEqual(result.counts.allergens, {
    mismatch: 98,
    verified: 64,
    accurately_unavailable: 55,
    not_applicable: 7,
  });
  assert.deepEqual(result.counts.mismatchKinds, {
    underreported: 79,
    mixed: 9,
    overreported: 10,
  });
});

test("handles category fragments, stale rows, renames, and key allergen corrections", () => {
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Rice Outside").disposition, "artifact");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Salmon Onigiri").disposition, "stale_extra");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Sashimi Tasting").disposition, "variant_match");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Ika Karaage").allergenVerdict, "mismatch");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Grilled Saba").allergenVerdict, "mismatch");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Crab Rangoon").allergenVerdict, "mismatch");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Panang Curry").allergenVerdict, "mismatch");
});
