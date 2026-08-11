import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileArepasCapitolBaselineItems } from "./arepas-capitol-audit-reconciliation.mjs";

async function inputs() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/osm-arepas-capitol-12316378227.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/osm-arepas-capitol-12316378227/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  return {
    checks: checkText.trim().split(/\r?\n/).map(JSON.parse),
    snapshot: JSON.parse(snapshotText),
  };
}

test("accounts for every frozen tile and current product", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArepasCapitolBaselineItems(checks, snapshot);

  assert.deepEqual(result.counts.dispositions, { artifact: 5, normalized_match: 3, exact_match: 1 });
  assert.equal(result.counts.matchedBaselineItemCount, 4);
  assert.equal(result.counts.matchedCurrentItemCount, 4);
  assert.equal(result.counts.artifactItemCount, 5);
  assert.equal(result.counts.omittedCurrentItemCount, 81);
  assert.equal(result.counts.fixedSignalMismatchCount, 1);
  assert.equal(result.counts.provenanceMismatchCount, 1);
  assert.equal(result.counts.menuContentMismatchCount, 4);
});

test("rejects homepage categories and removes the unsupported milk claim", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArepasCapitolBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((entry) => [entry.baseline.name, entry]));

  for (const name of ["Cachapa", "Cakes", "Empanadas", "Fresh Juices", "Pepito"]) {
    assert.equal(byName.get(name).disposition, "artifact", name);
    assert.match(byName.get(name).notes, /category|promotional tile/i, name);
  }
  assert.equal(byName.get("Ham & Cheese Arepa").disposition, "normalized_match");
  assert.equal(byName.get("Ham & Cheese Arepa").allergenVerdict, "mismatch");
  assert.match(byName.get("Ham & Cheese Arepa").notes, /no current restaurant-issued allergen disclosure/i);
  assert.equal(byName.get("La Sifrina Burger").disposition, "exact_match");
});

test("records representative current products omitted from the frozen shell", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArepasCapitolBaselineItems(checks, snapshot);
  const omitted = new Set(result.omittedCurrentItems.map((entry) => entry.name));
  for (const name of [
    "Pabellon Criollo",
    "Venezuelan Empanada - Queso",
    "Parrilla Mar Y Tierra",
    "Tres Leches",
    "Malta Polar (Venezuelan Malt)",
    "Chicha (Cooked Rice with Milk Cream)",
  ]) assert.equal(omitted.has(name), true, name);
});
