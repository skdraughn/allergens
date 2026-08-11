import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAmparoAuditSnapshot } from "./amparo-fondita-audit-catalog.mjs";
import { reconcileAmparoBaselineItems } from "./amparo-fondita-audit-reconciliation.mjs";

const id = "amparo-fondita-dc";
const checks = readFileSync(`data/restaurant-verification/item-checks/${id}.jsonl`, "utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
const snapshot = await buildAmparoAuditSnapshot({ retrievedAt: "2026-07-15T03:00:00.000Z" });
const result = reconcileAmparoBaselineItems(checks, snapshot);
const byName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));

test("Amparo reconciles all six frozen rows", () => {
  assert.equal(result.itemChecks.length, 6);
  assert.ok(result.itemChecks.every((check) => check.disposition !== "pending"));
  assert.ok(result.itemChecks.every((check) => check.allergenVerdict !== "pending"));
  assert.deepEqual(result.counts.dispositions, { stale_extra: 3, exact_match: 3 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 3, mismatch: 3 });
});

test("Amparo identifies all three rows from the stale tasting PDF", () => {
  for (const name of ["Aguachile de Naranja", "Palmiitos con Chayote", "Halibut en Mole Coloradito"]) {
    assert.equal(byName.get(name).disposition, "stale_extra", name);
    assert.equal(byName.get(name).allergenVerdict, "not_applicable", name);
    assert.match(byName.get(name).notes, /old linked PDF/i);
  }
});

test("Amparo retains three formulations but corrects their source semantics", () => {
  for (const name of ["Sopesitos", "Hongos con Shishito", "Tres Leches"]) {
    assert.equal(byName.get(name).disposition, "exact_match", name);
    assert.equal(byName.get(name).allergenVerdict, "mismatch", name);
    assert.match(byName.get(name).notes, /not allergen matrices/i);
    assert.match(byName.get(name).notes, /official-ingredients/i);
  }
});

test("Amparo frozen record omitted 85 current formulations", () => {
  assert.equal(result.counts.matchedCurrentFormulations, 3);
  assert.equal(result.counts.omittedCurrentFormulations, 85);
  for (const name of [
    "Tostaditas de Atún",
    "Camarones en Mole Coloradito",
    "Chile Relleno",
    "Quesadilla de Maiz",
    "Horchata",
  ]) {
    assert.ok(result.omittedCurrentItems.includes(name), name);
  }
});

test("Amparo item checks cite only recorded evidence ids", () => {
  const allowed = new Set([
    "official-tasting-pdf",
    "official-tasting-menu",
    "official-tasting-image",
    "toast-browser-review",
    "toast-current-menu-mirror",
  ]);
  assert.ok(result.itemChecks.every((check) => check.sourceEvidenceIds.length > 0));
  assert.ok(result.itemChecks.every((check) =>
    check.sourceEvidenceIds.every((sourceId) => allowed.has(sourceId)),
  ));
});
