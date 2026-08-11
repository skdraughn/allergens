import assert from "node:assert/strict";
import test from "node:test";

import { build9292AuditSnapshot } from "./9292-korean-bbq-audit-catalog.mjs";

test("rebuilds the photographed Annandale menu without scraper artifacts", () => {
  const snapshot = build9292AuditSnapshot();
  const counts = Object.fromEntries(
    [...Map.groupBy(snapshot.items, (item) => item.category)].map(([category, items]) => [category, items.length]),
  );

  assert.equal(snapshot.itemCount, 100);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 100);
  assert.deepEqual(counts, {
    Beef: 10,
    Chicken: 5,
    Pork: 9,
    Seafood: 2,
    Combinations: 4,
    Unlimited: 2,
    Specials: 2,
    Dinner: 13,
    "Lunch - Bibimbap": 5,
    "Lunch - Soup & Stir-Fry": 11,
    "Lunch Box": 4,
    "Lunch - Noodles": 3,
    "Lunch Combos": 5,
    "Gopchang Combinations": 4,
    "Stir-Fried, Stewed & Braised": 5,
    Gopchang: 4,
    "Alcohol - Soju & Wine": 5,
    "Alcohol - Flavored Soju": 1,
    "Alcohol - Beer": 3,
    "Non-Alcoholic Drinks": 3,
  });
  assert.ok(!snapshot.items.some((item) => item.name === "Own this place?"));
  assert.ok(!snapshot.items.some((item) => /\bPer person US$/i.test(item.name)));
  assert.ok(!snapshot.items.some((item) => item.name === "Chicken" || item.name === "Seafood"));
  assert.deepEqual(snapshot.items.slice(-3).map((item) => item.category), [
    "Non-Alcoholic Drinks",
    "Non-Alcoholic Drinks",
    "Non-Alcoholic Drinks",
  ]);
});

test("does not promote photographed menu text to restaurant-issued allergen data", () => {
  const snapshot = build9292AuditSnapshot();

  assert.equal(snapshot.officialAllergenItemCount, 0);
  assert.equal(snapshot.unavailableAllergenCount, 100);
  assert.ok(snapshot.items.every((item) => item.allergenSourceType === "unavailable"));
  assert.ok(snapshot.items.every((item) => item.allergens.length === 0));
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
  assert.ok(snapshot.items.every((item) => item.sourceType === "reviewed-third-party-menu-photo"));
});
