import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAkiraRamenAuditSnapshot } from "./akira-ramen-audit-catalog.mjs";
import { reconcileAkiraRamenBaselineItems } from "./akira-ramen-audit-reconciliation.mjs";

const restaurantId = "akira-ramen-and-izakaya-rockville-md-dc-metro";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const snapshot = buildAkiraRamenAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const result = reconcileAkiraRamenBaselineItems(baseline, snapshot);

test("reconciles all 73 frozen Akira rows to the current merchant catalog", () => {
  assert.equal(result.itemChecks.length, 73);
  assert.deepEqual(result.counts.dispositions, { exact_match: 73 });
  assert.deepEqual(result.counts.allergens, { mismatch: 65, accurately_unavailable: 8 });
  assert.equal(result.itemChecks.some((item) => item.disposition === "pending" || item.allergenVerdict === "pending"), false);
});

test("identifies current ingredient signals omitted by the frozen extraction", () => {
  for (const name of ["Okonomiyaki", "Akira Roll", "Volcano Roll", "Tantanmen", "Gyu Don"]) {
    assert.equal(result.itemChecks.find((item) => item.baseline.name === name).allergenVerdict, "mismatch", name);
  }
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Coke"), undefined);
});
