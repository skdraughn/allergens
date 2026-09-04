import assert from "node:assert/strict";
import test from "node:test";

import {
  applyIngredientDerivedAllergenReclassificationPlan,
  buildExplicitOfficialAllergenDisclosurePlan,
  buildIngredientDerivedAllergenReclassificationPlan,
  explicitOfficialAllergenDisclosure,
  promoteExplicitOfficialAllergenDisclosure,
  reclassifyIngredientDerivedItem,
} from "./ingredient-derived-allergen-reclassification.mjs";

test("ingredient descriptions become title-description Ingredient Intelligence", () => {
  const item = {
    id: "crab-cake",
    name: "Crab Cake",
    description: "Crab, herbs, and remoulade.",
    allergens: ["shellfish", "egg"],
    mayContain: [],
    allergenSourceType: "restaurant_ingredients",
    allergenAuthorityTier: "restaurant_issued",
    officialAllergenProfileId: "wrong-profile",
  };

  assert.equal(reclassifyIngredientDerivedItem(item), true);
  assert.deepEqual(item.allergens, []);
  assert.equal(item.allergenSourceType, "ingredient_intelligence");
  assert.equal(item.allergenAuthorityTier, "ingredient_intelligence");
  assert.equal(item.ingredientIntelligenceBasis, "title-description");
  assert.equal("officialAllergenProfileId" in item, false);
});

test("title-only ingredient claims become title-only Ingredient Intelligence", () => {
  const repository = {
    restaurants: [
      {
        id: "example",
        items: [
          {
            id: "scrambled-eggs",
            name: "Scrambled Eggs",
            allergens: ["egg"],
            mayContain: [],
            allergenSourceType: "restaurant_issued_product_name",
          },
        ],
      },
    ],
  };
  const plan = buildIngredientDerivedAllergenReclassificationPlan(repository);

  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].basis, "title");
  applyIngredientDerivedAllergenReclassificationPlan(repository, plan);
  assert.equal(repository.restaurants[0].items[0].ingredientIntelligenceBasis, "title");
  assert.deepEqual(repository.restaurants[0].items[0].allergens, []);
});

test("items without official allergen data still enter the title-only intelligence lane", () => {
  const item = {
    id: "mystery-soup",
    name: "Mystery Soup",
    allergens: [],
    mayContain: [],
    allergenSourceType: "unavailable",
  };

  assert.equal(reclassifyIngredientDerivedItem(item), true);
  assert.equal(item.allergenSourceType, "ingredient_intelligence");
  assert.equal(item.ingredientIntelligenceBasis, "title");
});

test("exhaustive official allergen rows are never reclassified", () => {
  const item = {
    id: "official-row",
    name: "Official Row",
    allergens: ["milk"],
    mayContain: [],
    allergenSourceType: "official-allergen-menu",
  };

  assert.equal(reclassifyIngredientDerivedItem(item), false);
  assert.deepEqual(item.allergens, ["milk"]);
  assert.equal(item.allergenSourceType, "official-allergen-menu");
});

test("positive-only official allergen rows are never reclassified", () => {
  const item = {
    id: "positive-row",
    name: "Positive Row",
    allergens: ["milk"],
    mayContain: [],
    allergenSourceType: "restaurant_issued_positive",
  };

  assert.equal(reclassifyIngredientDerivedItem(item), false);
  assert.deepEqual(item.allergens, ["milk"]);
});

test("an explicit Contains block is official allergen data", () => {
  const item = {
    id: "cookie",
    name: "Cookie",
    description: "Flour, butter and eggs. Contains: Wheat, Milk, Egg, Soy.",
    allergenSourceType: "ingredient_intelligence",
    allergens: [],
    mayContain: [],
    ingredientIntelligenceBasis: "title-description",
    inferredAllergenSignals: [{ id: "wheat", c: "high", e: ["menu:wheat"] }],
  };
  const disclosure = explicitOfficialAllergenDisclosure(item);

  assert.deepEqual(disclosure, {
    allergens: ["egg", "milk", "soy", "wheat"],
    mayContain: [],
    sourceType: "official-product-allergen-section",
    authorityTier: "restaurant_issued",
  });
  promoteExplicitOfficialAllergenDisclosure(item, disclosure);
  assert.equal(item.allergenSourceType, "official-product-allergen-section");
  assert.deepEqual(item.allergens, ["egg", "milk", "soy", "wheat"]);
  assert.equal(item.inferredAllergenSignals, undefined);
});

test("ordinary ingredient prose is not promoted to official allergen data", () => {
  const repository = {
    restaurants: [{
      id: "example",
      items: [{
        id: "crab-cake",
        name: "Crab Cake",
        description: "Crab, herbs and breadcrumbs.",
        allergenSourceType: "ingredient_intelligence",
      }],
    }],
  };

  assert.deepEqual(buildExplicitOfficialAllergenDisclosurePlan(repository).actions, []);
});

test("linked-vendor allergy alerts keep direct allergens separate from fryer cross-contact", () => {
  const repository = {
    restaurants: [{
      id: "example",
      items: [{
        id: "fried-shrimp",
        name: "Fried Shrimp",
        allergenSourceType: "restaurant_linked_vendor",
        allergens: [],
        mayContain: ["egg", "shellfish", "soy", "sesame"],
        sourceUrls: ["https://order.example.com/menu"],
        evidence: [{
          sourceKind: "linked-vendor-products",
          sourceUrl: "https://order.example.com/menu",
          text: "ALLERGY ALERT: Egg, Shellfish. Cross-contamination from fryer: Sesame, Soy.",
        }],
      }],
    }],
  };

  const plan = buildExplicitOfficialAllergenDisclosurePlan(repository);

  assert.equal(plan.actions.length, 1);
  assert.deepEqual(plan.actions[0].allergens, ["egg", "shellfish"]);
  assert.deepEqual(plan.actions[0].mayContain, ["sesame", "soy"]);
  assert.equal(plan.actions[0].sourceType, "restaurant-linked-product-allergen-section");
});

test("free-from wording adjacent to an allergy alert is not promoted as a positive", () => {
  const disclosure = explicitOfficialAllergenDisclosure({
    evidence: [{ text: "ALLERGY ALERT: Garlic, Onion. Vegan and gluten-free." }],
  });

  assert.equal(disclosure, null);
});

test("free-from wording inside an allergy-alert clause is not promoted as a positive", () => {
  const disclosure = explicitOfficialAllergenDisclosure({
    evidence: [{ text: "ALLERGY ALERT: Garlic, Onion (Vegan, gluten-free)." }],
  });

  assert.equal(disclosure, null);
});
