import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAlTiramisuAuditSnapshot } from "./al-tiramisu-audit-catalog.mjs";
import { reconcileAlTiramisuBaselineItems } from "./al-tiramisu-audit-reconciliation.mjs";

const restaurantId = "replacement-al-tiramisu-washington-dc";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAlTiramisuBaselineItems(
  baseline,
  buildAlTiramisuAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles every frozen Al Tiramisu row and rejects five headings as products", () => {
  assert.equal(result.itemChecks.length, 30);
  assert.deepEqual(result.counts.dispositions, { exact_match: 25, artifact: 5 });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 11,
    verified: 9,
    accurately_unavailable: 5,
    not_applicable: 5,
  });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 8, mixed: 1, overreported: 2 });
  assert.equal(result.itemChecks.some((item) => item.disposition === "pending" || item.allergenVerdict === "pending"), false);
});

test("captures key frozen underreporting and overreporting defects", () => {
  for (const name of ["Burrata", "Spiedini", "Fettuccine", "Vongole", "Calamari", "Tiramisu classico", "Affogato"]) {
    assert.equal(result.itemChecks.find((item) => item.baseline.name === name).allergenVerdict, "mismatch", name);
  }
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "LE PASTE").disposition, "artifact");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Torta Caprese").allergenVerdict, "mismatch");
  assert.equal(result.itemChecks.find((item) => item.baseline.name === "Gelato artigianale").allergenVerdict, "mismatch");
});
