import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAyseAuditSnapshot } from "./ayse-audit-catalog.mjs";
import { reconcileAyse } from "./ayse-audit-reconciliation.mjs";

test("AYŞE reconciles every frozen row without treating missing terms as negatives", async () => {
  const baseline = (await readFile("data/restaurant-verification/item-checks/osm-ay-e-meze-lounge-13134929927.jsonl", "utf8"))
    .trim().split(/\r?\n/).map(JSON.parse);
  const result = reconcileAyse(baseline, await buildAyseAuditSnapshot({ retrievedAt: "test" }));
  assert.deepEqual(result.counts.dispositions, { exact_match: 94, artifact: 3, stale_extra: 7, normalized_match: 2 });
  assert.deepEqual(result.counts.allergens, { verified: 30, accurately_unavailable: 18, mismatch: 48, not_applicable: 10 });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending" && row.allergenVerdict !== "pending"));
  assert.equal(result.itemChecks.find((row) => row.auditItemKey === "93:soup-of-the-day").disposition, "normalized_match");
  assert.equal(result.itemChecks.find((row) => row.auditItemKey === "18:caesar-salad-hummus-bowl").disposition, "artifact");
});
