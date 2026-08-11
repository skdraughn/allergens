import assert from "node:assert/strict";
import test from "node:test";

import { buildBSideAuditSnapshot, bSideSourceUrls } from "./b-side-audit-catalog.mjs";

const snapshot = await buildBSideAuditSnapshot({ retrievedAt: "2026-07-15T18:16:08.774Z" });
const item = (id) => snapshot.items.find((candidate) => candidate.id === id);

test("pins all four current owner PDFs and the 58-product B Side boundary", () => {
  assert.equal(snapshot.itemCount, 58);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 58);
  assert.equal(snapshot.rawPresentationCount, 66);
  assert.equal(snapshot.collapsedPresentationCount, 8);
  assert.equal(snapshot.categoryCount, 11);
  assert.equal(snapshot.officialIngredientCount, 30);
  assert.equal(snapshot.linkedIngredientCount, 2);
  assert.equal(snapshot.linkedProductCount, 2);
  assert.equal(snapshot.linkedPositiveCount, 4);
  assert.equal(snapshot.unavailableAllergenCount, 24);
  assert.deepEqual(snapshot.sourceUrls, Object.values(bSideSourceUrls));
});

test("preserves the complete rendered dinner boundary and column geometry", () => {
  assert.deepEqual(snapshot.items.slice(0, 31).map((candidate) => candidate.category), [
    ...Array(17).fill("Small Plates"),
    ...Array(5).fill("Snacks"),
    ...Array(4).fill("Big Plates"),
    "Mixtape",
    "Samples",
    ...Array(3).fill("Sweets"),
  ]);
  for (const id of [
    "48-hour-fermented-focaccia",
    "grilled-shishitos",
    "trio-of-the-above-3-snacks",
    "mixtape",
    "samples",
    "lemon-ricotta-donuts",
  ]) assert.ok(item(id), id);
  for (const id of [
    "swedish-meatballs",
    "smoked-wings",
    "crispy-chesapeake-oysters",
    "spam",
    "lettuce-wraps",
    "ahi-tuna-poke",
  ]) assert.equal(item(id)?.category, "Small Plates", id);
  assert.equal(item("mixtape")?.isConfigurable, true);
  assert.equal(item("samples")?.isConfigurable, true);
});

test("merges six brunch repeats and the happy-hour fries presentation", () => {
  assert.equal(item("smoked-pimento-cheese")?.presentations.length, 2);
  assert.equal(item("brussels-sprouts")?.presentations.length, 2);
  assert.equal(item("caesar-salad")?.presentations.length, 2);
  assert.equal(item("heirloom-tomato-salad")?.presentations.length, 2);
  assert.equal(item("b-side-smashburger")?.presentations.length, 2);
  assert.equal(item("beef-fat-fries")?.presentations.length, 3);
  assert.equal(item("breakfast-poutine")?.presentations.length, 2);
  assert.deepEqual(
    item("breakfast-poutine")?.presentations.map((presentation) => presentation.layoutOccurrence),
    [1, 2],
  );
});

test("retains brunch, kids, happy-hour, and beverage products", () => {
  for (const id of [
    "wedge-salad",
    "smoked-salmon-eggs-benedict",
    "buttermilk-pancakes",
    "breakfast-poutine",
    "pancake-burger",
    "fried-chicken-sandwich",
    "egg-and-cheese-sandwich",
    "breakfast-burrito",
    "chicken-and-waffle",
    "home-fries",
    "two-eggs",
    "bacon",
    "sourdough-toast",
    "breakfast-sausage-slice",
    "kids-quesadilla",
    "mac-and-cheese",
    "grilled-cheese",
    "kids-taco",
    "hi-fries",
    "pig-wings",
  ]) assert.ok(item(id), id);
  assert.deepEqual(snapshot.items.slice(-7).map((candidate) => candidate.id), [
    "french-press-coffee",
    "hot-tea",
    "martinellis-apple-juice",
    "topo-chico-mineral-12-oz",
    "canned-soda",
    "orange-juice",
    "whole-milk",
  ]);
  assert.ok(snapshot.items.slice(-7).every(
    (candidate) => candidate.category === "Nonalcoholic Beverages",
  ));
});

test("preserves narrow owner and linked-vendor allergen authority", () => {
  assert.deepEqual(item("charred-asparagus")?.allergens, ["milk", "sesame"]);
  assert.deepEqual(item("sicilian-anchovies")?.allergens, ["milk", "fish"]);
  assert.deepEqual(item("caesar-salad")?.allergens, ["milk", "fish"]);
  assert.equal(item("caesar-salad")?.allergenSourceType, "restaurant-linked-menu-ingredients");
  assert.deepEqual(item("b-side-smashburger")?.allergens, ["milk"]);
  assert.equal(
    item("b-side-smashburger")?.allergenSourceType,
    "restaurant-linked-menu-ingredients",
  );
  assert.deepEqual(item("rambos-spice-bag")?.allergens, ["milk", "gluten", "soy", "sesame"]);
  assert.equal(
    item("rambos-spice-bag")?.allergenSourceType,
    "restaurant-linked-product-allergen-section",
  );
  assert.deepEqual(item("sour-cream-and-onion-chicharrones")?.allergens, ["milk"]);
  assert.deepEqual(
    item("sour-cream-and-onion-chicharrones")?.mayContain,
    ["milk", "gluten"],
  );
  assert.equal(
    item("sour-cream-and-onion-chicharrones")?.allergenSourceType,
    "restaurant-linked-product-allergen-section",
  );
  assert.deepEqual(item("beef-fat-fries")?.allergens, []);
  assert.deepEqual(item("flourless-brownie")?.allergens, []);
});
