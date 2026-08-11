import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAztecaCollegeParkAuditSnapshot } from "./azteca-college-park-audit-catalog.mjs";
import { reconcileAztecaCollegePark } from "./azteca-college-park-audit-reconciliation.mjs";

test("reconciles all three frozen Azteca rows into the full current menu", async () => {
  const checks = (await readFile(
    "data/restaurant-verification/item-checks/azteca-restaurant-college-park-md-dc-metro.jsonl",
    "utf8",
  )).trim().split(/\r?\n/).map(JSON.parse);
  const result = reconcileAztecaCollegePark(
    checks,
    await buildAztecaCollegeParkAuditSnapshot(),
  );
  assert.deepEqual(result.counts.dispositions, { exact_match: 2, variant_match: 1 });
  assert.deepEqual(result.counts.allergens, { mismatch: 3 });
});
