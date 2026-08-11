import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAlaBethesdaAuditSnapshot } from "./ala-bethesda-audit-catalog.mjs";
import { reconcileAlaBethesdaBaselineItems } from "./ala-bethesda-audit-reconciliation.mjs";

const restaurantId = "ala-bethesda-dc-metro";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAlaBethesdaBaselineItems(
  baseline,
  buildAlaBethesdaAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles every frozen ala Bethesda row to the current Toast menu", () => {
  assert.equal(result.itemChecks.length, 34);
  assert.deepEqual(result.counts.dispositions, { exact_match: 34 });
  assert.deepEqual(result.counts.allergens, { mismatch: 15, verified: 11, accurately_unavailable: 8 });
  assert.equal(result.itemChecks.some((item) => item.disposition === "pending" || item.allergenVerdict === "pending"), false);
});

test("captures category-loss and key underreported allergen cases", () => {
  for (const name of ["ZA'ATAR LABNEH", "DUCK PROSCIUTTO", "TUNA TARTARE DOLMADES", "SALMON KIBBEH NAYAH", "MANTI", "ADANA KEBAB", "ANTEP BAKLAVA"]) {
    assert.equal(result.itemChecks.find((item) => item.baseline.name === name).allergenVerdict, "mismatch", name);
  }
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "TARKHUN LAVRAKI").allergenVerdict, "verified");
});
