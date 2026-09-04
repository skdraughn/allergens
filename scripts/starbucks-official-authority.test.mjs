import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = JSON.parse(
  readFileSync("src/data/generated/restaurants.generated.json", "utf8"),
);
const fixture = JSON.parse(
  readFileSync("data/fixtures/starbucks-official-nutrition-snapshot.json", "utf8"),
);
const starbucks = repository.restaurants.find((entry) => entry.id === "starbucks");

test("Starbucks preserves explicit official allergen sections and analyzes ingredient-only rows", () => {
  assert.ok(starbucks);
  assert.equal(starbucks.items.length, 154);

  const explicit = starbucks.items.filter(
    (item) => item.allergenSourceType === "official-product-allergen-section",
  );
  const ingredientOnly = starbucks.items.filter(
    (item) => item.allergenSourceType === "ingredient_intelligence",
  );

  assert.equal(explicit.length, 48);
  assert.equal(ingredientOnly.length, 106);
  assert.equal(starbucks.allergenDataStatus.officialItemCount, 48);
  assert.equal(starbucks.allergenDataStatus.totalItemCount, 154);
  assert.ok(
    ingredientOnly.every((item) =>
      typeof item.ingredientsText === "string" && item.ingredientsText.length > 0
    ),
  );
  assert.ok(
    ingredientOnly.every((item) => Array.isArray(item.inferredAllergenSignals)),
  );

  const fixtureByName = new Map(fixture.items.map((item) => [item.name, item]));
  for (const item of explicit) {
    const reference = fixtureByName.get(item.name);
    assert.equal(reference?.allergenSourceType, "official-product-allergen-section");
    assert.deepEqual(item.allergens, reference.allergens);
  }
});
