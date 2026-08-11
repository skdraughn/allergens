import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  arbysCategorySources,
  buildArbysCatalog,
  canonicalArbysNameKey,
  parseArbysMenuIngredients,
  parseArbysNutritionGuide,
} from "./arbys-audit-catalog.mjs";

async function capturedSource() {
  const directory = new URL("../../data/restaurant-verification/artifacts/arbys/", import.meta.url);
  const categoryHtmlBySlug = Object.fromEntries(await Promise.all(
    arbysCategorySources.map(async ([slug]) => [
      slug,
      await readFile(new URL(`official-arbys-menu-${slug}.html`, directory), "utf8"),
    ]),
  ));
  const [nutritionText, ingredientsText] = await Promise.all([
    readFile(new URL("official-arbys-nutrition-allergen-aug-2026.txt", directory), "utf8"),
    readFile(new URL("official-arbys-ingredients-aug-2026.txt", directory), "utf8"),
  ]);
  return { categoryHtmlBySlug, nutritionText, ingredientsText };
}

test("builds a current Arby's consumer catalog without component-glossary rows", async () => {
  const snapshot = buildArbysCatalog(await capturedSource(), { retrievedAt: "2026-07-15T09:00:04.402Z" });
  const names = new Set(snapshot.items.map((item) => item.name));

  assert.equal(snapshot.itemCount, 78);
  assert.equal(snapshot.categoryCount, 12);
  assert.equal(snapshot.publishedPresentationCount, 84);
  assert.equal(snapshot.publishedShellCount, 25);
  assert.equal(snapshot.officialAllergenCount, 77);
  assert.equal(snapshot.unavailableAllergenCount, 1);
  assert.equal(snapshot.commonFryerSignalCount, 27);
  for (const product of [
    "Classic Beef 'n Cheddar",
    "Orange Cream Shake",
    "Chicken Tenders 2PC",
    "Sausage Gravy Biscuit-Double",
    "Simply Orange® Juice",
    "Roast Beef Gyro",
  ]) assert.equal(names.has(product), true, product);
  for (const component of ["Brioche Bun", "Au Jus", "Crispy Onions", "Cheddar Cheese Sauce"]) {
    assert.equal(names.has(component), false, component);
  }
});

test("keeps fixed allergens separate from common-fryer and facility signals", async () => {
  const snapshot = buildArbysCatalog(await capturedSource());
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.deepEqual(byName.get("Classic Roast Beef").allergens, ["soy", "wheat", "sesame"]);
  assert.deepEqual(byName.get("Classic Roast Beef").mayContain, []);
  assert.deepEqual(byName.get("Crispy Chicken Sandwich").allergens, ["egg", "wheat"]);
  assert.deepEqual(byName.get("Crispy Chicken Sandwich").mayContain, ["sesame", "milk", "soy", "fish"]);
  assert.deepEqual(byName.get("Crinkle Fries").allergens, []);
  assert.deepEqual(byName.get("Crinkle Fries").mayContain, ["egg", "milk", "soy", "wheat", "fish"]);
  assert.deepEqual(byName.get("Jamocha Shake").allergens, ["milk"]);
  assert.deepEqual(byName.get("Jamocha Shake").mayContain, ["peanut", "tree-nut"]);
  assert.deepEqual(byName.get("Pecan Chicken Salad Sandwich").allergens, ["wheat", "egg", "soy", "tree-nut"]);
  assert.equal(byName.get("Orange Cream Shake").allergenSourceType, "unavailable");
});

test("parses only product assembly text from the first two ingredient pages", async () => {
  const { ingredientsText } = await capturedSource();
  const rows = parseArbysMenuIngredients(ingredientsText);

  assert.equal(rows.get(canonicalArbysNameKey("Classic French Dip & Swiss")), "Roast Beef, Au Jus, Swiss Cheese (Processed Slice), Sub Roll.");
  assert.equal(rows.get(canonicalArbysNameKey("Roast Turkey Ranch & Bacon Sandwich")).includes("Honey Wheat Bread"), true);
  assert.equal(rows.has(canonicalArbysNameKey("Brioche Bun")), false);
  assert.equal(rows.has(canonicalArbysNameKey("Au Jus")), false);
});

test("parses the official July 2026 guide product boundary and aliases", async () => {
  const { nutritionText } = await capturedSource();
  const rows = parseArbysNutritionGuide(nutritionText);

  assert.equal(rows.size, 74);
  assert.equal(rows.has(canonicalArbysNameKey("Chicken Tenders 3PC")), true);
  assert.equal(rows.has(canonicalArbysNameKey("Mozzarella Sticks")), true);
  assert.equal(rows.has(canonicalArbysNameKey("Potato Cakes")), true);
  assert.equal(rows.has(canonicalArbysNameKey("Brioche Bun")), false);
  assert.equal(rows.has(canonicalArbysNameKey("Crispy Onions")), false);
});
