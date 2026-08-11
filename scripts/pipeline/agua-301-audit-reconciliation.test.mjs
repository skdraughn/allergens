import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reconcileAgua301BaselineItems } from "./agua-301-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/agua-301-restaurant-washington-dc-dc-metro.jsonl", "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const snapshot = JSON.parse(await readFile("data/restaurant-verification/repairs/agua-301-restaurant-washington-dc-dc-metro/corrected-menu.json", "utf8"));

test("reconciles all 195 frozen Agua 301 rows", () => {
  const result = reconcileAgua301BaselineItems(baseline, snapshot);
  assert.equal(result.itemChecks.length, 195);
  assert.equal(result.itemChecks.filter((row) => row.disposition === "artifact").length, 10);
  assert.equal(result.itemChecks.filter((row) => row.disposition === "stale_extra").length, 3);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending" && row.allergenVerdict !== "pending"));
});

test("handles aliases, instructions, beverages, and known allergen corrections", () => {
  const byId = new Map(reconcileAgua301BaselineItems(baseline, snapshot).itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("agua-cheese-quesadilla").disposition, "variant_match");
  assert.equal(byId.get("flautas-lightly-fried-rolled-corn-tortilla-stuffed-with").disposition, "artifact");
  assert.equal(byId.get("tecate-can").disposition, "artifact");
  assert.equal(byId.get("agua-fresca").allergenVerdict, "accurately_unavailable");
  assert.equal(byId.get("grilled-caesar-salad").allergenVerdict, "mismatch");
  assert.equal(byId.get("yucca-fritas").allergenVerdict, "mismatch");
});
