import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileArenasBaselineItems } from "./arenas-georgetown-audit-reconciliation.mjs";

async function inputs() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/arenas-georgetown-dc.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/arenas-georgetown-dc/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  return {
    checks: checkText.trim().split(/\r?\n/).map(JSON.parse),
    snapshot: JSON.parse(snapshotText),
  };
}

test("accounts for every frozen Arena's row and every current product", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArenasBaselineItems(checks, snapshot);

  assert.deepEqual(result.counts.dispositions, {
    exact_match: 82,
    artifact: 3,
    normalized_match: 2,
    stale_extra: 3,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 84);
  assert.equal(result.counts.matchedCurrentItemCount, 84);
  assert.equal(result.counts.artifactItemCount, 3);
  assert.equal(result.counts.staleItemCount, 3);
  assert.equal(result.counts.omittedCurrentItemCount, 17);
  assert.equal(result.counts.fixedSignalMismatchCount, 20);
  assert.equal(result.counts.provenanceMismatchCount, 5);
  assert.equal(result.counts.menuContentMismatchCount, 84);
});

test("separates frozen headings and stale products from current food", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArenasBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((item) => [item.baseline.name, item]));

  for (const name of ["Chicken Sandwiches", "Classic Sandwiches", "Veggie Options & Burgers"]) {
    assert.equal(byName.get(name).disposition, "artifact", name);
  }
  for (const name of ["Large Hot Tots", "Small Hot Tots", "Mac and Cheese Bites"]) {
    assert.equal(byName.get(name).disposition, "stale_extra", name);
  }
  assert.equal(byName.get("Mozzarella Sticks").disposition, "normalized_match");
  assert.deepEqual(byName.get("Mozzarella Sticks").currentItemIds, ["big-mozzarella-sticks"]);
  assert.equal(byName.get("California Club").allergenVerdict, "verified");
});

test("records representative products omitted by the frozen output", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArenasBaselineItems(checks, snapshot);
  const omitted = new Set(result.omittedCurrentItems.map((item) => item.name));

  for (const name of [
    "Nachos",
    "Italian Cold Cut",
    "Honey Chicken Club",
    "Coca-Cola",
    "Soup of the Day",
    "Avocado",
  ]) assert.equal(omitted.has(name), true, name);
});
