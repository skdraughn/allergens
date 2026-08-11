import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildArtAndSoulAuditSnapshot } from "./art-and-soul-audit-catalog.mjs";
import { reconcileArtAndSoulBaselineItems } from "./art-and-soul-audit-reconciliation.mjs";

test("reconciles all 52 frozen Art and Soul rows against 54 current products", async () => {
  const baselineText = await readFile(
    new URL("../../data/restaurant-verification/item-checks/art-and-soul-dc.jsonl", import.meta.url),
    "utf8",
  );
  const baselineChecks = baselineText.trim().split(/\r?\n/).map(JSON.parse).map((check) => ({
    ...check,
    disposition: "pending",
    allergenVerdict: "pending",
    sourceEvidenceIds: [],
    notes: null,
  }));
  const result = reconcileArtAndSoulBaselineItems(
    baselineChecks,
    await buildArtAndSoulAuditSnapshot(),
  );

  assert.equal(result.itemChecks.length, 52);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 43,
    normalized_match: 3,
    variant_match: 3,
    artifact: 3,
  });
  assert.equal(result.counts.current.itemCount, 54);
  assert.equal(result.counts.current.matchedItemCount, 50);
  assert.deepEqual(result.counts.current.missingItemIds, [
    "crispy-brussels-sprouts-all-day",
    "cinnamon-roll-brunch",
    "fruit-brunch",
    "grits-brunch",
  ]);
  assert.equal(result.counts.mismatchKinds.buffet_heading_artifact, 3);
  assert.equal(result.counts.mismatchKinds.service_variant_collapse, 3);
  assert.ok(result.counts.mismatchKinds.allergen_or_provenance_mismatch > 0);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("fails closed if the current product boundary changes", async () => {
  const snapshot = await buildArtAndSoulAuditSnapshot();
  assert.throws(
    () => reconcileArtAndSoulBaselineItems([], { ...snapshot, itemCount: 53 }),
    /54-product contract/,
  );
});
