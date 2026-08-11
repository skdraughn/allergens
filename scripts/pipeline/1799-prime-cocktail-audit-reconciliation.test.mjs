import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { build1799PrimeCocktailAuditSnapshot } from "./1799-prime-cocktail-audit-catalog.mjs";
import { reconcile1799PrimeBaseline } from "./1799-prime-audit-reconciliation.mjs";

test("broader 1799 record reconciles all frozen rows including Lena Marie", async () => {
  const itemChecks = (await readFile(
    "data/restaurant-verification/item-checks/1799-prime-steak-and-seafood-alexandria-va-dc-metro.jsonl",
    "utf8",
  )).trim().split("\n").map(JSON.parse);
  const snapshot = build1799PrimeCocktailAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
  const updates = reconcile1799PrimeBaseline(itemChecks, { snapshot });

  assert.equal(updates.length, 53);
  assert.equal(new Set(updates.map((update) => update.auditItemKey)).size, 53);
  assert.equal(updates.filter((update) => update.disposition === "artifact").length, 11);
  assert.equal(updates.filter((update) => update.disposition === "stale_extra").length, 6);
  assert.ok(updates.filter((update) => update.allergenVerdict === "mismatch").length >= 20);
  const lena = updates.find((update) =>
    itemChecks.find((check) => check.auditItemKey === update.auditItemKey)?.baseline.itemId === "lena-marie"
  );
  assert.equal(lena?.allergenVerdict, "accurately_unavailable");
  assert.deepEqual(lena?.sourceEvidenceIds, ["official-cocktail-june-2026"]);
});
