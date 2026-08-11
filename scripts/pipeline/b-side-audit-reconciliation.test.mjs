import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildBSideAuditSnapshot } from "./b-side-audit-catalog.mjs";
import { reconcileBSide } from "./b-side-audit-reconciliation.mjs";

test("reconciles all 25 frozen B Side rows", async () => {
  const checks = (await readFile(
    "data/restaurant-verification/item-checks/b-side-mosaic-fairfax-va.jsonl",
    "utf8",
  )).trim().split(/\r?\n/).map(JSON.parse);
  const result = reconcileBSide(checks, await buildBSideAuditSnapshot());
  assert.deepEqual(result.counts.dispositions, { exact_match: 25 });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 15,
    accurately_unavailable: 10,
  });
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.deepEqual(byId.get("b-side-smashburger")?.sourceEvidenceIds, [
    "official-dinner-menu-current",
    "official-brunch-menu-current",
    "linked-order-menu-current",
  ]);
  assert.deepEqual(byId.get("sour-cream-and-onion-chicharrones")?.sourceEvidenceIds, [
    "official-dinner-menu-current",
    "linked-order-menu-current",
  ]);
});
