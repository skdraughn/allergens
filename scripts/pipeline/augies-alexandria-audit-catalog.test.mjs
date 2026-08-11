import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { dcMetroExpansionSources } from "../dc-metro-expansion-sources.mjs";
import {
  buildAugiesAlexandriaAuditSnapshot,
  restaurantIdAugiesAlexandria,
  sourceUrlsAugiesAlexandria,
} from "./augies-alexandria-audit-catalog.mjs";

const snapshot = await buildAugiesAlexandriaAuditSnapshot({
  retrievedAt: "2026-07-15T17:10:00.000Z",
});
const item = (id) => snapshot.items.find((candidate) => candidate.id === id);

test("pins the complete current Augie's Alexandria catalog and evidence", async () => {
  assert.equal(snapshot.itemCount, 122);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 122);
  assert.equal(snapshot.itemNameFingerprint, "ba670bc946459f730c88682aee659f12aac9aa0c09ff0bfe2a3a9b84fbac5481");
  assert.deepEqual(snapshot.categoryCounts, {
    "Mussels & Clams": 12,
    Appetizers: 17,
    "Soup & Salad": 9,
    Sandwiches: 11,
    Mains: 10,
    Sides: 24,
    "Side Proteins": 11,
    Kids: 7,
    Brunch: 11,
    "Late Night": 1,
    Desserts: 5,
    Mocktails: 4,
  });
  assert.equal(snapshot.sectionOrder.at(-1), "Mocktails");

  const ownerArtifact = await readFile(
    `data/restaurant-verification/artifacts/${restaurantIdAugiesAlexandria}/alexandria-current-menu.html`,
  );
  assert.equal(
    createHash("sha256").update(ownerArtifact).digest("hex"),
    "0c7f553216680ff0f24b3717829a002ce4b6c6e9bbf1701879650c44abbb4a33",
  );
});

test("keeps the Alexandria source config location-scoped", () => {
  const source = dcMetroExpansionSources.find(
    (candidate) => candidate.id === restaurantIdAugiesAlexandria,
  );
  assert.ok(source);
  assert.deepEqual(source.menuUrls, [sourceUrlsAugiesAlexandria.ownerMenu]);
  assert.equal(source.menuUrls.some((url) => /annapolis/i.test(url)), false);
});

test("removes frozen fragments and Annapolis-only products", () => {
  for (const removedId of [
    "smoked-salmon-and-spinach-2-steak-and-asparagus",
    "smoked-salmon-and-spinach-2-steak-and-asparagus-5-crab-cake",
    "croutons-red-onion-herb-vinaigrette",
    "horseradish-provolone-crispy-onions",
    "single-or-double",
    "upgrades",
    "augies-burger",
    "jumbo-lump-maryland-crab-cake-sandwich",
    "maryland-crab-dip",
    "maryland-crab-soup",
    "mason-fried-chicken",
    "potato-skins",
    "shrimp-po-boy",
    "pancake-shot",
    "sober-rockfish-fishbowl",
  ]) {
    assert.equal(item(removedId), undefined, removedId);
  }
});

test("preserves partial Toast labels without calling them official", () => {
  assert.deepEqual(item("cheese-fries").allergens, ["gluten", "milk"]);
  assert.deepEqual(item("fried-mozzarella").allergens, ["gluten", "milk"]);
  assert.deepEqual(item("steak-and-cheese-egg-rolls").allergens, ["gluten", "milk"]);
  assert.deepEqual(item("tuna-tartare").allergens, [
    "egg",
    "fish",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual(item("hummus-dip").allergens, ["milk", "sesame", "tree-nut"]);
  assert.equal(item("cheese-fries").allergens.includes("wheat"), false);
  assert.equal(item("steak-and-cheese-egg-rolls").allergens.includes("egg"), false);
  assert.equal(item("cheese-fries").allergenSourceType, "restaurant-linked-product-allergen-section");
  assert.match(item("cheese-fries").sourceSummary, /restaurant-linked/i);
  assert.ok(item("cheese-fries").evidence.some((row) =>
    row.sourceKind === "restaurant-linked-vendor-allergen-section"
  ));
});

test("does not smear optional choices and restores fixed formulation signals", () => {
  assert.deepEqual(item("augies-big-bag-o-nachos").allergens, []);
  assert.deepEqual(item("buffalo-cauliflower").allergens, []);
  assert.deepEqual(item("buffalo-shrimp").allergens, ["shellfish"]);
  assert.deepEqual(item("buffalo-combo").allergens, ["shellfish"]);
  assert.deepEqual(item("salmon").allergens, ["fish", "gluten", "wheat"]);
  assert.deepEqual(item("frites").allergens, []);
  assert.deepEqual(item("rockfish").allergens, ["fish"]);
  assert.ok(item("spicy-nduja-prawn-linguini").allergens.includes("shellfish"));
  assert.ok(snapshot.items.filter((candidate) => candidate.category === "Mussels & Clams")
    .filter((candidate) => candidate.id !== "paws-mussel")
    .every((candidate) => candidate.allergens.includes("shellfish")));
});

test("separates owner, restaurant-linked, cross-contact-only, and unavailable semantics", () => {
  assert.deepEqual(snapshot.sourceTypeCounts, {
    "official-ingredients": 68,
    unavailable: 28,
    "official-global-cross-contact-note": 14,
    "restaurant-linked-product-allergen-section": 7,
    "restaurant-linked-menu-ingredients": 5,
  });
  assert.ok(snapshot.items.every((candidate) =>
    candidate.mayContain.length === 1 && candidate.mayContain[0] === "gluten"
  ));
  assert.equal(item("side-grilled-shrimp").allergenSourceType, "restaurant-linked-menu-ingredients");
  assert.deepEqual(item("side-grilled-shrimp").allergens, ["shellfish"]);
  assert.equal(item("american-sliced").allergenSourceType, "unavailable");
  assert.equal(item("paloma-mocktail").allergenSourceType, "official-global-cross-contact-note");
  assert.equal(item("paloma-mocktail").allergens.length, 0);
});
