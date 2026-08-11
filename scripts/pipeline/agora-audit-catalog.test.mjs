import assert from "node:assert/strict";
import test from "node:test";

import { buildAgoraAuditSnapshot } from "./agora-audit-catalog.mjs";

const snapshot = buildAgoraAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });

test("preserves the rendered Agora meal-period structure", () => {
  assert.equal(snapshot.itemCount, 83);
  assert.equal(snapshot.categoryCount, 18);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 83);
  assert.equal(snapshot.items.some((item) => item.name === "For the table"), false);
  assert.equal(snapshot.items.some((item) => item.name === "G F"), false);
});

test("maps fixed ingredients without column or substring contamination", () => {
  const find = (category, name) => snapshot.items.find((item) => item.category === category && item.name === name);
  assert.deepEqual(find("Brunch — Sides", "AGORA FRIES").allergens, ["mustard"]);
  assert.deepEqual(find("Brunch — Sides", "VEGGIE SAUTE").allergens, []);
  assert.deepEqual(find("Dinner — Hot Mezzes", "FALAFEL").allergens, ["sesame"]);
  assert.deepEqual(find("Dinner — Hot Mezzes", "KİBBEH").allergens, ["milk", "wheat", "gluten", "tree-nut"]);
  assert.deepEqual(find("Dinner — Seafood Selection", "BRANZINO").allergens, ["fish"]);
});

test("keeps divergent meal-period formulations separate", () => {
  const mixedGreen = snapshot.items.filter((item) => item.name === "MIXED GREEN SALAD");
  const sisTavuk = snapshot.items.filter((item) => item.name === "ŞİŞ TAVUK");
  assert.equal(mixedGreen.length, 2);
  assert.deepEqual(mixedGreen.map((item) => item.allergens), [[], ["milk"]]);
  assert.equal(sisTavuk.length, 2);
  assert.deepEqual(sisTavuk.map((item) => item.allergens), [["milk", "wheat", "gluten"], ["milk"]]);
});

