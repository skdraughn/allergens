import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAleroDupontAuditSnapshot } from "./alero-dupont-audit-catalog.mjs";
import { reconcileAleroDupontBaselineItems } from "./alero-dupont-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/alero-dupont-dc.jsonl", "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAleroDupontBaselineItems(baseline, buildAleroDupontAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }));

test("reconciles all 42 frozen Alero rows", () => {
  assert.equal(result.itemChecks.length, 42);
  assert.deepEqual(result.counts.dispositions, { exact_match: 42 });
  assert.deepEqual(result.counts.allergens, { mismatch: 10, accurately_unavailable: 26, verified: 6 });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 10 });
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending" || candidate.allergenVerdict === "pending"), false);
});

test("documents adjacency-derived variant corruption on every frozen row", () => {
  assert.ok(result.itemChecks.every((candidate) => /adjacent product or section label/.test(candidate.notes)));
  for (const name of ["Alero Pork Ribs", "Apple Almond Salad", "Caesar Salad", "Fish Tacos", "Salmon Mexicano", "Seafood Salad", "Seafood Soup", "Taco \"Salad\""]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === name).allergenVerdict, "mismatch", name);
  }
});
