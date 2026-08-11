import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAgoraTysonsBaselineItems } from "./agora-tysons-audit-reconciliation.mjs";

const baseline = (await readFile("data/restaurant-verification/item-checks/agora-tysons-va.jsonl", "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const snapshot = JSON.parse(await readFile("data/restaurant-verification/repairs/agora-tysons-va/corrected-menu.json", "utf8"));

test("reconciles every frozen Tysons row", () => {
  const result = reconcileAgoraTysonsBaselineItems(baseline, snapshot);
  assert.equal(result.itemChecks.length, 54);
  assert.equal(result.itemChecks.filter((row) => row.disposition === "artifact").length, 7);
  assert.ok(result.itemChecks.every((row) => row.disposition !== "pending" && row.allergenVerdict !== "pending"));
});

test("separates the two real Sis Tavuk presentations from the merged fragment", () => {
  const byId = new Map(reconcileAgoraTysonsBaselineItems(baseline, snapshot).itemChecks.map((row) => [row.baseline.itemId, row]));
  assert.equal(byId.get("sistavukorgfornf-chicken-thighs-yogurt-sauce").disposition, "artifact");
  assert.equal(byId.get("sistavuk").allergenVerdict, "verified");
  assert.equal(byId.get("sis-tavuk").allergenVerdict, "mismatch");
  assert.equal(byId.get("veggie-saute").allergenVerdict, "mismatch");
  assert.equal(byId.get("agora-fries").allergenVerdict, "mismatch");
});
