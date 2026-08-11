import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAmelieDcAuditSnapshot } from "./amelie-dc-audit-catalog.mjs";
import { reconcileAmelieDcBaselineItems } from "./amelie-dc-audit-reconciliation.mjs";

const id = "replacement-amelie-dc-bistro-and-wine-bar-washington-dc";
const checks = readFileSync(`data/restaurant-verification/item-checks/${id}.jsonl`, "utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
const snapshot = await buildAmelieDcAuditSnapshot({ retrievedAt: "2026-07-15T02:15:00.000Z" });
const result = reconcileAmelieDcBaselineItems(checks, snapshot);
const byName = new Map(result.itemChecks.map((check) => [check.baseline.name, check]));

test("Amélie reconciles all 48 frozen rows", () => {
  assert.equal(result.itemChecks.length, 48);
  assert.ok(result.itemChecks.every((check) => check.disposition !== "pending"));
  assert.ok(result.itemChecks.every((check) => check.allergenVerdict !== "pending"));
  assert.equal(result.counts.omittedCurrentFormulations, 6);
});

test("Amélie identifies stale replaced fish and octopus rows", () => {
  assert.equal(byName.get("Crispy Octopus").disposition, "stale_extra");
  assert.equal(byName.get("Maryland Rockfish").disposition, "stale_extra");
  assert.equal(byName.get("Grilled Octopus").disposition, "exact_match");
  assert.ok(result.omittedCurrentItems.includes("Maryland Seared Monkfish"));
});

test("Amélie catches liability-relevant frozen allergen omissions", () => {
  for (const name of [
    "Baked Camembert de Normandie",
    "Burratta",
    "Croque Madame à l'Américaine",
    "Eggs Benedict",
    "French Breakfast",
    "Maryland Rockfish",
    "Parisian Omelette",
    "Ravioles du Royans",
    "Salade Amélie",
  ]) {
    assert.ok(["mismatch", "not_applicable"].includes(byName.get(name).allergenVerdict), name);
  }
});

test("Amélie removes the unsupported creamy-equals-dairy inference", () => {
  const octopus = byName.get("Grilled Octopus");
  assert.equal(octopus.allergenVerdict, "mismatch");
  assert.match(octopus.notes, /contains shellfish/);
  assert.doesNotMatch(octopus.notes.split("Frozen:")[0], /milk/);
});

test("Amélie item checks point only to captured first-party surfaces", () => {
  const allowed = new Set(["official-lunch", "official-dinner", "official-brunch", "official-happy-hour"]);
  assert.ok(result.itemChecks.every((check) => check.sourceEvidenceIds.length > 0));
  assert.ok(result.itemChecks.every((check) => check.sourceEvidenceIds.every((id) => allowed.has(id))));
});
