import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAandJBaselineItems } from "./aandj-audit-reconciliation.mjs";

const restaurantId = "osm-aandj-9382941658";
const [baselineText, snapshotText] = await Promise.all([
  readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"),
  readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
]);
const baselineChecks = baselineText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const snapshot = JSON.parse(snapshotText);

test("reconciles every frozen A&J row", () => {
  const result = reconcileAandJBaselineItems(baselineChecks, snapshot);

  assert.equal(result.itemChecks.length, 217);
  assert.deepEqual(result.counts.dispositions, {
    variant_match: 149,
    artifact: 4,
    exact_match: 61,
    normalized_match: 3,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 71,
    verified: 142,
    not_applicable: 4,
  });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 71 });
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending"));
  assert.ok(result.itemChecks.every((row) => row.allergenVerdict !== "pending"));
});

test("removes flattened headings and the press quote", () => {
  const result = reconcileAandJBaselineItems(baselineChecks, snapshot);
  const byId = new Map(result.itemChecks.map((row) => [row.baseline.itemId, row]));

  assert.equal(byId.get("buns-dumplings-and-breads").disposition, "artifact");
  assert.equal(byId.get("noodles").disposition, "artifact");
  assert.equal(byId.get("rice").disposition, "artifact");
  assert.equal(byId.get("washington-postbest-dim-sum-dumplings-in-washington").disposition, "artifact");
});

test("maps both price-menu copies and restores omitted fixed signals", () => {
  const result = reconcileAandJBaselineItems(baselineChecks, snapshot);
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));

  assert.equal(byName.get("1101. Beef Noodle Soup 红牛麵").allergenVerdict, "mismatch");
  assert.equal(byName.get("1101. 紅燒牛肉麵 Hong Shao Niu Rou Mian").allergenVerdict, "mismatch");
  assert.equal(byName.get("5201. Bean Curd Egg皮蛋豆腐").allergenVerdict, "mismatch");
  assert.equal(byName.get("5202. Chicken Salad雞絲拉皮").allergenVerdict, "mismatch");
  assert.equal(byName.get("6205. Coffee Bubble Tea珍珠咖啡").disposition, "variant_match");
  assert.equal(byName.get("6210. Guava Bubble Tea").disposition, "variant_match");
  assert.equal(byName.get("香菜豆干 Xiang Cai Dou Gan*^^").disposition, "normalized_match");
});
