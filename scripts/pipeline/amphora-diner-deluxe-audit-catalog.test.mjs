import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAmphoraAuditSnapshot,
  extractFastOrderMenu,
} from "./amphora-diner-deluxe-audit-catalog.mjs";

const snapshot = await buildAmphoraAuditSnapshot({ retrievedAt: "2026-07-15T04:00:00.000Z" });
const byName = new Map(snapshot.items.map((item) => [item.name, item]));

test("Amphora parses the complete live exact-address FastOrder catalog", () => {
  assert.equal(snapshot.currentStore.vendorCode, "amphoradeluxe");
  assert.equal(snapshot.currentStore.name, "Amphora Diner");
  assert.equal(snapshot.currentStore.address, "1151 Elden Street, Herndon, VA");
  assert.equal(snapshot.currentStore.phone, "703-925-0900");
  assert.equal(snapshot.sourceCategoryCount, 27);
  assert.equal(snapshot.currentOrderingPresentationCount, 296);
  assert.equal(snapshot.currentOfficialOnlyPresentationCount, 24);
  assert.equal(snapshot.currentPresentationCount, 320);
  assert.equal(snapshot.currentSoldOutPresentationCount, 6);
  assert.equal(snapshot.configurablePresentationCount, 174);
});

test("Amphora consolidates duplicate live presentations without losing provenance", () => {
  assert.equal(snapshot.itemCount, 300);
  assert.equal(snapshot.duplicatePresentationCount, 20);
  assert.equal(snapshot.categoryCount, 28);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 300);
  assert.equal(snapshot.items.reduce((sum, item) => sum + item.presentationCount, 0), 320);
  for (const name of [
    "Crispy Southern Fried Chicken and Waffles",
    "Tomato Florentine Soup",
    "Chicken Fajita Salad",
    "Strawberry Shortcake",
    "Cappuccino",
    "Lavazza Coffee",
  ]) {
    assert.equal(byName.get(name).presentationCount, 2, name);
  }
});

test("Amphora places beverage formulations after every food and bakery category", () => {
  const categories = [...new Set(snapshot.items.map((item) => item.category))];
  assert.deepEqual(categories.slice(-3), [
    "Shakes and Sundaes",
    "Breakfast Beverages",
    "Beverages",
  ]);
  assert.equal(categories.at(-1), "Beverages");
});

test("Amphora records the current official PDF as a menu, never an allergen matrix", () => {
  assert.equal(snapshot.officialPdfPageCount, 33);
  assert.equal(snapshot.officialPdfMetadata.creationDate, "D:20251109170930-05'00'");
  assert.equal(snapshot.officialPdfMetadata.modificationDate, "D:20251109171106-05'00'");
  assert.equal(snapshot.officialPdfMatchedItemCount, 271);
  assert.equal(snapshot.officialIngredientCount, 174);
  assert.equal(snapshot.unavailableAllergenCount, 126);
  assert.ok(snapshot.items.every((item) => item.allergenSourceType !== "official-allergen-menu"));
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
  assert.ok(snapshot.items.every((item) =>
    !item.evidence.some((entry) => /food borne illness/i.test(entry.text)),
  ));
});

test("Amphora limits official signals to direct positive terms", () => {
  assert.deepEqual(byName.get("Milk").allergens, ["milk"]);
  assert.deepEqual(byName.get("Eggs Benedict").allergens, ["milk", "egg"]);
  assert.deepEqual(byName.get("Greek Salad").allergens, ["milk", "fish"]);
  assert.deepEqual(byName.get("Golden Fried Calamari").allergens, ["shellfish"]);
  assert.deepEqual(byName.get("Spicy Thai Steak & Peach Salad").allergens, ["soy"]);
  assert.deepEqual(byName.get("Peanut Butter Pancakes").allergens, ["milk", "peanut"]);
  assert.deepEqual(byName.get("Bananas Foster French Toast").allergens, ["tree-nut"]);
  assert.deepEqual(byName.get("Elden").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Truffle Cake Balls ~ Nut Collection").allergens, ["peanut"]);
});

test("Amphora does not invent allergens from cooking conventions or the raw-food advisory", () => {
  for (const name of [
    "Crispy Southern Fried Chicken and Waffles",
    "Caesar Salad",
    "Chicken Noodle Soup",
    "Spaghetti Marinara",
    "Shrimp Scampi",
    "Bourbon Citrus Honey Glazed Ham",
  ]) {
    const item = byName.get(name);
    if (name === "Shrimp Scampi") assert.deepEqual(item.allergens, ["shellfish"]);
    else assert.deepEqual(item.allergens, [], name);
  }
  assert.ok(!byName.get("Shrimp Scampi").allergens.includes("sulfites"));
  assert.deepEqual(byName.get("Tex Mex Egg Rolls").allergens, ["milk"]);
  assert.deepEqual(byName.get("Chicken Salad Sandwich").allergens, []);
  assert.deepEqual(byName.get("Chicken Salad and Bacon Club").allergens, []);
  assert.deepEqual(byName.get("Tuna Salad and Bacon Club").allergens, ["fish"]);
});

test("Amphora separates fixed formulation signals from optional configurator choices", () => {
  assert.equal(byName.get("Create Your Own Omelet").isConfigurable, true);
  assert.deepEqual(byName.get("Create Your Own Omelet").allergens, ["egg"]);
  for (const name of ["One Meat", "Two Meats", "Three Meats"]) {
    assert.equal(byName.get(name).isConfigurable, true);
    assert.deepEqual(byName.get(name).allergens, [], name);
  }
  const burgerOptions = byName.get("Build Your Favorite Burger").presentations[0].options;
  assert.equal(burgerOptions.find((option) => option.name === "Build a Burger Style").required, true);
  assert.equal(burgerOptions.find((option) => option.name === "Cheese Choice").required, false);
});

test("Amphora removes frozen parser artifacts and preserves real current items", () => {
  for (const artifact of [
    "ADDITIONAL TOPPINGS",
    "Amphora Classics",
    "Sandwiches & Favorites",
    "SPECIALTY PASTA",
    "Substitute Cholesterol Free Egg Beaters or Egg Whites",
    "Amphora’s Diner Deluxe",
  ]) {
    assert.ok(!byName.has(artifact), artifact);
  }
  for (const current of [
    "Thanksgiving Roast Turkey Dinner",
    "Create Your Own Omelet",
    "Amphora Special",
    "Pan Seared Salmon Filet with an Artichoke Cream Sauce",
    "Truffle Cake Balls ~ Nut Collection",
    "Bottle Spring Water",
    "Baklava Pancakes",
    "Breakfast Panini",
    "Goat Cheese and Sun Dried Tomato Omelet",
    "Carrot Cake",
    "Candy Sundae",
  ]) {
    assert.ok(byName.has(current), current);
  }
});

test("Amphora retains current official-PDF items that are not orderable online", () => {
  for (const name of [
    "Baklava Pancakes",
    "Goat Cheese and Sun Dried Tomato Omelet",
    "Breakfast Panini",
    "Amphora's Greek Nacho Platter",
    "New York Strip Sandwich Platter",
    "Carrot Cake",
    "Classic Banana Split",
    "Candy Sundae",
    "Irish Coffee",
  ]) {
    const item = byName.get(name);
    assert.equal(item.sourceType, "reviewed-current-official-pdf-menu", name);
    assert.ok(!item.sourceUrls.some((url) => /fastordernow\.com/i.test(url)), name);
  }
});

test("Amphora retains the official PDF-only Pick 2 combo", () => {
  const item = snapshot.items.find((entry) => entry.name === "Amphora’s Pick 2");
  assert.ok(item);
  assert.equal(item.category, "Soups and Combos");
  assert.equal(item.price, 15.25);
  assert.equal(item.description, "Half triple-decker sandwich with a cup of soup or a side garden salad.");
  assert.equal(item.isConfigurable, true);
  assert.equal(item.presentations[0].options.length, 2);
  assert.equal(item.allergenSourceType, "unavailable");
  assert.deepEqual(item.allergens, []);
  assert.equal(item.evidence[0].pageNumber, 14);
  assert.match(item.evidence[0].text, /Amphora’s Pick 2/);
});

test("Amphora FastOrder parser preserves all option groups and vendor IDs", () => {
  const html = readFileSync(
    "data/restaurant-verification/artifacts/osm-amphora-diner-deluxe-152763392/fast-order-current-menu.html",
    "utf8",
  );
  const parsed = extractFastOrderMenu(html);
  assert.equal(new Set(parsed.presentations.map((item) => item.presentationId)).size, 296);
  const omelet = parsed.presentations.find((item) => item.presentationId === "2261");
  assert.equal(omelet.options.length, 7);
  assert.equal(omelet.options.find((option) => option.name === "Breakfast Toast Selection").required, true);
  assert.equal(omelet.options.find((option) => option.name === "Cheese Additions").required, false);
});

test("Amphora generated app rows exactly match the reviewed snapshot", () => {
  const repository = JSON.parse(readFileSync("src/data/generated/restaurants.generated.json", "utf8"));
  const generated = repository.restaurants.find((restaurant) => restaurant.id === snapshot.restaurantId);
  assert.ok(generated);
  assert.deepEqual(generated.items.map(appFacing), snapshot.items.map(appFacing));
});

function appFacing(item) {
  return Object.fromEntries([
    "id",
    "name",
    "category",
    "description",
    "ingredientsText",
    "imageUrl",
    "isConfigurable",
    "allergenSourceType",
    "allergens",
    "mayContain",
    "sourceType",
    "sourceUrls",
    "sourceSummary",
    "evidence",
    "extractedIngredientMentions",
    "inferredIngredients",
    "inferredAllergenSignals",
    "inferenceQuestions",
    "inferenceSummary",
    "inferenceVersion",
  ].map((key) => [
    key,
    ["allergens", "mayContain"].includes(key) ? [...(item[key] ?? [])].sort() : item[key],
  ]));
}
