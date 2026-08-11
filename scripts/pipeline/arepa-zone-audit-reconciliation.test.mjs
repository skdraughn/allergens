import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileArepaZoneBaselineItems } from "./arepa-zone-audit-reconciliation.mjs";

async function inputs() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/arepa-zone-dc.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/arepa-zone-dc/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  return {
    checks: checkText.trim().split(/\r?\n/).map(JSON.parse),
    snapshot: JSON.parse(snapshotText),
  };
}

test("accounts for every frozen row and current DC product", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArepaZoneBaselineItems(checks, snapshot);

  assert.deepEqual(result.counts.dispositions, {
    stale_extra: 25,
    normalized_match: 15,
    variant_match: 4,
    exact_match: 2,
    artifact: 3,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 21);
  assert.equal(result.counts.matchedCurrentItemCount, 24);
  assert.equal(result.counts.artifactItemCount, 3);
  assert.equal(result.counts.staleItemCount, 25);
  assert.equal(result.counts.omittedCurrentItemCount, 51);
  assert.equal(result.counts.fixedSignalMismatchCount, 18);
  assert.equal(result.counts.crossContactMismatchCount, 21);
  assert.equal(result.counts.provenanceMismatchCount, 2);
  assert.equal(result.counts.menuContentMismatchCount, 21);
});

test("identifies concatenated PDF rows and ambiguous duplicate names", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArepaZoneBaselineItems(checks, snapshot);
  const byName = new Map(result.itemChecks.map((item) => [item.baseline.name, item]));

  for (const name of ["Patacón Viudo Tres Leches", "Perro Caraqueño Pepito Fondue", "Salsa Picante Pepito Mosaico"]) {
    assert.equal(byName.get(name).disposition, "artifact", name);
    assert.match(byName.get(name).notes, /concatenated|adjacent/i, name);
  }
  assert.equal(byName.get("Carne Mechada").disposition, "variant_match");
  assert.deepEqual(byName.get("Carne Mechada").currentItemIds, ["carne-mechada-arepa", "carne-mechada-empanada"]);
  assert.equal(byName.get("Pollo Mechado").disposition, "variant_match");
});

test("records representative current products omitted from the frozen output", async () => {
  const { checks, snapshot } = await inputs();
  const result = reconcileArepaZoneBaselineItems(checks, snapshot);
  const omitted = new Set(result.omittedCurrentItems.map((item) => item.name));

  for (const name of [
    "Cruzado de Res y Pollo (Sopa)",
    "Pabellón Bowl Beef",
    "Clásica Cachapa",
    "Tequeños de Queso",
    "Viuda Arepa",
    "Coke",
    "Ovomaltina",
  ]) assert.equal(omitted.has(name), true, name);
});
