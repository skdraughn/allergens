import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAfghaniaBaselineItems } from "./afghania-audit-reconciliation.mjs";

const restaurantId = "replacement-afghania-washington-dc";
const [baselineText, snapshotText, sisterSnapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
  readFile("data/restaurant-verification/repairs/afghan-bistro-springfield-va-dc-metro/corrected-menu.json", "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);
const sisterSnapshot = JSON.parse(sisterSnapshotText);

test("reconciles all 152 frozen Afghania rows", () => {
  const result = reconcileAfghaniaBaselineItems(baselineChecks, snapshot, sisterSnapshot);
  assert.equal(result.itemChecks.length, 152);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
  assert.equal(Object.values(result.counts.dispositions).reduce((sum, count) => sum + count, 0), 152);
  assert.equal(Object.values(result.counts.allergens).reduce((sum, count) => sum + count, 0), 152);
});

test("separates sister-location contamination from stale Afghania products", () => {
  const result = reconcileAfghaniaBaselineItems(baselineChecks, snapshot, sisterSnapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("bistro-burger").disposition, "location_mismatch");
  assert.equal(byId.get("aushak-entree").disposition, "location_mismatch");
  assert.equal(byId.get("afghania-kabob").disposition, "stale_extra");
  assert.equal(byId.get("qaburgha").disposition, "stale_extra");
  assert.equal(result.itemChecks.filter((row) => row.disposition === "location_mismatch").length, 73);
  assert.equal(result.itemChecks.filter((row) => row.disposition === "stale_extra").length, 6);
});

test("flags collapsed current formulations and source-bounded omissions", () => {
  const result = reconcileAfghaniaBaselineItems(baselineChecks, snapshot, sisterSnapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("leek-and-scallion-dumplingsaushak").disposition, "variant_match");
  assert.equal(byId.get("leek-and-scallion-dumplingsaushak").allergenVerdict, "mismatch");
  assert.equal(byId.get("afghania-salad").allergenVerdict, "mismatch");
  assert.equal(byId.get("dinner-for-two-with-wine").allergenVerdict, "mismatch");
  assert.equal(byId.get("afghania-burger").allergenVerdict, "verified");
});

test("the corrected catalog restores omitted raw meats and presentation identity", () => {
  assert.equal(snapshot.items.filter((item) => item.category === "RAW MARINATED MEATS").length, 9);
  assert.equal(snapshot.items.filter((item) => item.name === "PUMPKIN DUMPLINGS").length, 4);
  assert.equal(snapshot.items.some((item) => item.name === "Bistro Burger"), false);
});
