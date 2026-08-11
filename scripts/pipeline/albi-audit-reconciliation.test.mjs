import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAlbiAuditSnapshot } from "./albi-audit-catalog.mjs";
import { reconcileAlbiBaselineItems } from "./albi-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/albi-dc.jsonl", "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAlbiBaselineItems(baseline, buildAlbiAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }));

test("reconciles every frozen Albi row", () => {
  assert.equal(result.itemChecks.length, 29);
  assert.deepEqual(result.counts.dispositions, { exact_match: 17, variant_match: 3, stale_extra: 2, artifact: 2, normalized_match: 5 });
  assert.deepEqual(result.counts.allergens, { mismatch: 25, not_applicable: 4 });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 24, cross_contact_scope_added: 1 });
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending" || candidate.allergenVerdict === "pending"), false);
});

test("separates stale dishes from parser artifacts", () => {
  for (const id of ["grilled-bone-in-strip", "cucumber-and-green-strawberry"]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.itemId === id).disposition, "stale_extra");
  }
  for (const id of ["khubz", "mahalabiya-dollarand"]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.itemId === id).disposition, "artifact");
  }
});

test("captures the missing global sesame caution on every current frozen formulation", () => {
  for (const check of result.itemChecks.filter((candidate) => !["artifact", "stale_extra"].includes(candidate.disposition))) {
    assert.equal(check.allergenVerdict, "mismatch", check.baseline.name);
    assert.match(check.notes, /may contain sesame/, check.baseline.name);
    assert.ok(check.sourceEvidenceIds.includes("official-faq"), check.baseline.name);
  }
});
