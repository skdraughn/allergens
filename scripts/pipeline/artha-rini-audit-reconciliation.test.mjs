import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildArthaRiniAuditSnapshot } from "./artha-rini-audit-catalog.mjs";
import { reconcileArthaRiniBaselineItems } from "./artha-rini-audit-reconciliation.mjs";

test("reconciles all 62 frozen Artha Rini rows against 160 current products", async () => {
  const baselineText = await readFile(
    new URL("../../data/restaurant-verification/item-checks/osm-artha-rini-45808686.jsonl", import.meta.url),
    "utf8",
  );
  const baselineChecks = baselineText.trim().split(/\r?\n/).map(JSON.parse).map((check) => ({
    ...check, disposition: "pending", allergenVerdict: "pending", sourceEvidenceIds: [], notes: null,
  }));
  const result = reconcileArthaRiniBaselineItems(baselineChecks, await buildArthaRiniAuditSnapshot());

  assert.equal(result.itemChecks.length, 62);
  assert.deepEqual(result.counts.dispositions, { normalized_match: 29, artifact: 12, exact_match: 21 });
  assert.deepEqual(result.counts.allergens, { mismatch: 50, not_applicable: 12 });
  assert.equal(result.counts.current.itemCount, 160);
  assert.equal(result.counts.current.matchedItemCount, 49);
  assert.equal(result.counts.current.missingItemCount, 111);
  assert.ok(result.counts.current.missingItemIds.includes("siomay-main"));
  assert.ok(result.counts.current.missingItemIds.includes("arem-arem-jajanan"));
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("fails closed if the Artha Rini product boundary changes", async () => {
  const snapshot = await buildArthaRiniAuditSnapshot();
  assert.throws(
    () => reconcileArthaRiniBaselineItems([], { ...snapshot, itemCount: 159 }),
    /160-product contract/,
  );
});

