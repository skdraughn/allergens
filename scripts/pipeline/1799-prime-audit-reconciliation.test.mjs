import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  reconcile1799PrimeBaseline,
  reconciliationRuleCount1799Prime,
} from "./1799-prime-audit-reconciliation.mjs";

test("1799 Prime reconciliation adjudicates every frozen row", async () => {
  const itemChecks = (await readFile(
    "data/restaurant-verification/item-checks/osm-1799-prime-204629784.jsonl",
    "utf8",
  )).trim().split("\n").map(JSON.parse);
  const updates = reconcile1799PrimeBaseline(itemChecks);
  const count = (field, value) => updates.filter((update) => update[field] === value).length;

  assert.equal(reconciliationRuleCount1799Prime, 54);
  assert.equal(updates.length, 53);
  assert.equal(new Set(updates.map((update) => update.auditItemKey)).size, 53);
  assert.equal(count("disposition", "artifact"), 11);
  assert.equal(count("disposition", "stale_extra"), 6);
  assert.equal(count("disposition", "normalized_match") + count("disposition", "variant_match"), 36);
  assert.ok(count("allergenVerdict", "mismatch") >= 20);
  assert.equal(updates.some((update) => update.allergenVerdict === "pending"), false);
});
