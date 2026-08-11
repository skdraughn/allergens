import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAmazoniaAuditSnapshot } from "./amazonia-audit-catalog.mjs";
import { reconcileAmazoniaBaselineItems } from "./amazonia-audit-reconciliation.mjs";

const restaurantId = "amazonia-dc";
const baselineText = await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8");
const baseline = baselineText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = await buildAmazoniaAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const result = reconcileAmazoniaBaselineItems(baseline, snapshot);

test("reconciles all 20 frozen Amazonia rows to terminal dispositions", () => {
  assert.equal(result.itemChecks.length, 20);
  assert.deepEqual(result.counts.dispositions, { exact_match: 20 });
  assert.deepEqual(result.counts.allergens, { mismatch: 7, verified: 12, accurately_unavailable: 1 });
  assert.deepEqual(result.counts.mismatchKinds, { underreported: 7 });
  assert.equal(result.itemChecks.filter((row) => row.disposition === "pending").length, 0);
  assert.equal(result.itemChecks.filter((row) => row.allergenVerdict === "pending").length, 0);
});

test("documents every underreported current allergen signal", () => {
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  for (const name of ["carrot", "chicken thigh", "mushroom", "pork belly"]) {
    assert.equal(byName.get(name).allergenVerdict, "mismatch", name);
    assert.match(byName.get(name).notes, /soy-sauce marinade/i, name);
  }
  assert.equal(byName.get("salmon belly").allergenVerdict, "mismatch");
  assert.match(byName.get("salmon belly").notes, /contains fish, soy/);
  for (const name of ["Pulpo al Josper", "Pulpo al Olivo"]) {
    assert.equal(byName.get(name).allergenVerdict, "mismatch", name);
    assert.match(byName.get(name).notes, /shellfish/, name);
  }
});

test("keeps a detailed ingredient row without a supported positive allergen accurately unavailable", () => {
  const row = result.itemChecks.find((candidate) => candidate.baseline.name === "Ensalada de Chonta");
  assert.equal(row.allergenVerdict, "accurately_unavailable");
  assert.match(row.notes, /absence or accommodation codes/);
});

test("restores 14 current formulations omitted by the frozen dinner-only extraction", () => {
  assert.equal(result.counts.matchedCurrentFormulations, 20);
  assert.equal(result.counts.omittedCurrentFormulations, 14);
  for (const name of [
    "Corazón de Res", "Filet Mignon", "Daily Chef's Choice of 5 Anticuchos",
    "Josper Wagyu Burger", "Ungurahui Açaí", "Chocolucuma", "Chazuta",
    "Chicha Morada", "Prima Pavé Brut Rosé", "Espresso",
  ]) {
    assert.ok(result.omittedCurrentItems.includes(name), name);
  }
});
