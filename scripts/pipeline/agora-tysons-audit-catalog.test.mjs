import assert from "node:assert/strict";
import test from "node:test";

import { buildAgoraTysonsAuditSnapshot } from "./agora-tysons-audit-catalog.mjs";

const snapshot = buildAgoraTysonsAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });

test("preserves all independently rendered Tysons menu presentations", () => {
  assert.equal(snapshot.itemCount, 83);
  assert.equal(snapshot.categoryCount, 18);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 83);
  assert.ok(snapshot.sourceUrls.every((url) => /TYSONS/i.test(url)));
});

test("keeps Tysons-specific brunch identities and shared allergen semantics", () => {
  const brunch = snapshot.items.filter((item) => item.category === "Brunch — Eggs & Proteins");
  assert.ok(brunch.some((item) => item.name === "LAMB SHOULDER" && item.allergens.includes("wheat") && item.allergens.includes("milk")));
  assert.ok(brunch.some((item) => item.name === "SIS TAVUK" && item.allergens.length === 1 && item.allergens[0] === "milk"));
  assert.equal(brunch.some((item) => item.name === "LAMB SHOULDER & WHEAT RICE"), false);
  assert.deepEqual(snapshot.items.find((item) => item.name === "AGORA FRIES").allergens, ["mustard"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "VEGGIE SAUTE").allergens, []);
});
