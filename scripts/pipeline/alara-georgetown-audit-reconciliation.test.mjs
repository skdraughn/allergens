import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAlaraGeorgetownAuditSnapshot } from "./alara-georgetown-audit-catalog.mjs";
import { reconcileAlaraGeorgetownBaselineItems } from "./alara-georgetown-audit-reconciliation.mjs";

const restaurantId = "alara-georgetown-dc";
const baseline = (await readFile(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`, "utf8"))
  .trim().split(/\r?\n/).map(JSON.parse);
const result = reconcileAlaraGeorgetownBaselineItems(
  baseline,
  buildAlaraGeorgetownAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" }),
);

test("reconciles every frozen Alara row and removes only documented parser or scope artifacts", () => {
  assert.equal(result.itemChecks.length, 104);
  assert.equal(result.itemChecks.some((candidate) => candidate.disposition === "pending" || candidate.allergenVerdict === "pending"), false);
  assert.equal(result.counts.dispositions.artifact, 10);
  assert.equal(result.counts.dispositions.variant_match, 5);
  assert.equal(result.counts.dispositions.exact_match, 89);
  assert.equal(Object.values(result.counts.dispositions).reduce((sum, count) => sum + count, 0), 104);
});

test("classifies structural fusions, course headings, and isolated alcohol ingestion explicitly", () => {
  for (const name of ["(Humus, Tzatziki, Muhammara)", "First Course", "Second Course", "Third Course", "Fourth Course", "Homemade Ice Cream Kunafa", "Lentil Soup", "MiMi en Provence (France)", "Plomari", "Razzouk"]) {
    const check = result.itemChecks.find((candidate) => candidate.baseline.name === name);
    assert.equal(check.disposition, "artifact", name);
    assert.equal(check.allergenVerdict, "not_applicable", name);
  }
  for (const name of ["Tray of Adana Kebabs", "Tray of Baklava", "Tray of Falafel", "Tray of Kibbeh", "Tray of Lamb Chops"]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === name).disposition, "variant_match", name);
  }
});

test("captures representative frozen allergen omissions and inventions", () => {
  for (const name of ["Beef Pide", "Bulgur Pilav", "Cappuccino / Latte", "Fattoush Salad", "Falafel", "Soujouk Omelet", "Sutlac", "Tahini Crème Brûlée", "Turkish Coffee Tiramisu"]) {
    assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === name).allergenVerdict, "mismatch", name);
  }
  assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === "Egg White Frittata").allergenVerdict, "verified");
  assert.equal(result.itemChecks.find((candidate) => candidate.baseline.name === "Shepherd Salad").allergenVerdict, "verified");
});
