import assert from "node:assert/strict";
import test from "node:test";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "./ingredient-intelligence.mjs";

test("description recovery can recompute intelligence without changing direct allergen fields", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const item = annotateMenuItemWithIngredientIntelligence(
    {
      allergenSourceType: "official-allergen-menu",
      allergens: [],
      category: "Sauces",
      description: "Restaurant honey mustard dipping sauce.",
      id: "honey-mustard",
      mayContain: [],
      name: "Honey Mustard",
      officialAllergenProfileId: "m1",
      sourceType: "pdf-matrix",
    },
    {
      manifest,
      officialAllergenProfiles: { m1: { coveredAllergenIds: ["milk"] } },
      promoteOfficialDisclosures: false,
    },
  );

  assert.deepEqual(item.allergens, []);
  assert.deepEqual(item.mayContain, []);
  assert.equal(
    item.inferredAllergenSignals.some((signal) => signal.id === "mustard"),
    true,
  );
});
