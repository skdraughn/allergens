import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAModoMioBaselineItems } from "./a-modo-mio-audit-reconciliation.mjs";

const restaurantId = "osm-a-modo-mio-207944730";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen A Modo Mio row", () => {
  const result = reconcileAModoMioBaselineItems(baselineChecks, snapshot);

  assert.equal(result.itemChecks.length, 165);
  assert.deepEqual(result.counts.dispositions, {
    exact_match: 113,
    variant_match: 44,
    artifact: 6,
    stale_extra: 2,
  });
  assert.deepEqual(result.counts.allergens, {
    verified: 51,
    mismatch: 106,
    not_applicable: 8,
  });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("removes non-items, unavailable specials, and incorrect allergen claims", () => {
  const result = reconcileAModoMioBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));

  assert.equal(byId.get("call-us-at-703-532-0990-or-book-a-table-through-resy").disposition, "artifact");
  assert.equal(byId.get("pizze-rosse-tomato-sauce").disposition, "artifact");
  assert.equal(byId.get("braised-beef-ravioli-for-1").disposition, "artifact");
  assert.equal(byId.get("butternut-ravioli").disposition, "stale_extra");
  assert.equal(byId.get("pizza-maradona").disposition, "stale_extra");
  assert.equal(byId.get("caprese-cake").allergenVerdict, "mismatch");
  assert.equal(byId.get("torta-caprese").allergenVerdict, "mismatch");
  assert.equal(byId.get("ischitana-df").allergenVerdict, "mismatch");
  assert.equal(byId.get("margherita-personal-12").allergenVerdict, "mismatch");
});
