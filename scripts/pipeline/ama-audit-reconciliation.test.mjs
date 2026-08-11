import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAmaAuditSnapshot } from "./ama-audit-catalog.mjs";
import { reconcileAmaBaselineItems } from "./ama-audit-reconciliation.mjs";

const restaurantId = "ama-dc";
const baselineText = await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8");
const baseline = baselineText.trim().split(/\r?\n/).map(JSON.parse);
const snapshot = await buildAmaAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const result = reconcileAmaBaselineItems(baseline, snapshot);

test("reconciles all 36 frozen Ama rows to terminal dispositions", () => {
  assert.equal(result.itemChecks.length, 36);
  assert.deepEqual(result.counts.dispositions, {
    normalized_match: 13,
    exact_match: 15,
    variant_match: 6,
    stale_extra: 2,
  });
  assert.deepEqual(result.counts.allergens, {
    mismatch: 17,
    verified: 14,
    accurately_unavailable: 3,
    not_applicable: 2,
  });
  assert.deepEqual(result.counts.mismatchKinds, { overreported: 14, mixed: 1, underreported: 2 });
  assert.equal(result.itemChecks.filter((row) => row.disposition === "pending").length, 0);
  assert.equal(result.itemChecks.filter((row) => row.allergenVerdict === "pending").length, 0);
});

test("separates stale standalone rows and restores omitted current formulations", () => {
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  assert.equal(byName.get("Pesto").disposition, "stale_extra");
  assert.equal(byName.get("Rice Bowl").disposition, "stale_extra");
  assert.equal(result.counts.matchedCurrentFormulations, 29);
  assert.equal(result.counts.omittedCurrentFormulations, 55);
  for (const name of ["Cappuccino", "Fritto Misto", "Paccheri con Sugo di Mare", "Bistecca (Brunch)", "Tiramisu"]) {
    assert.ok(result.omittedCurrentItems.includes(name), name);
  }
});

test("checks configurable Fügassa flavors without smearing optional milk onto the parent", () => {
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  for (const name of ["Caffe Focaccia Classico", "Classico Fugassa", "Onion Fugassa"]) {
    assert.equal(byName.get(name).allergenVerdict, "verified", name);
  }
  for (const name of ["Caffe Focaccia Pizzata", "Pizzata Fugassa"]) {
    assert.equal(byName.get(name).allergenVerdict, "verified", name);
    assert.match(byName.get(name).notes, /flavor-specific fixed ingredients/);
  }
  assert.deepEqual(snapshot.items.find((item) => item.name === "Fügassa").allergens, ["wheat", "gluten"]);
});

test("documents concrete frozen allergen corrections", () => {
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));
  for (const name of [
    "Ama’s Signature Bone Broth (16oz Glass Jar)", "Erbe in Padella", "Finocchio",
    "Fior Di Zucca", "Knodel Mit Krautsalat", "Mortadella Sandwich", "Pollo Arrosto",
    "Raviolini Al Tocco", "Tartare Di Salmone", "Trenette Pesto", "Trofie Con Pesto",
  ]) {
    assert.equal(byName.get(name).allergenVerdict, "mismatch", name);
  }
  assert.equal(byName.get("Polpette Mondeghili").allergenVerdict, "mismatch");
  assert.match(byName.get("Polpette Mondeghili").notes, /tree-nut/);
  assert.equal(byName.get("Sbriciolona, Alta Badia, Tomato Sandwich").allergenVerdict, "mismatch");
  assert.match(byName.get("Sbriciolona, Alta Badia, Tomato Sandwich").notes, /gluten/);
});
