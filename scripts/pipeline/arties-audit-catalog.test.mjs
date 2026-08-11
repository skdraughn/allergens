import assert from "node:assert/strict";
import test from "node:test";

import { buildArtiesAuditSnapshot } from "./arties-audit-catalog.mjs";

test("builds the exact current Artie's catalog from the hashed owner menus", async () => {
  const snapshot = await buildArtiesAuditSnapshot({ retrievedAt: "2026-07-15T12:11:20.000Z" });
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));

  assert.equal(snapshot.restaurantId, "artie-s-fairfax-va-dc-metro");
  assert.equal(snapshot.itemCount, 60);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 60);
  assert.deepEqual(snapshot.sourceStats.map((source) => source.presentationCount), [0, 53, 52, 32, 33]);
  assert.equal(snapshot.presentationCount, 170);
  assert.equal(snapshot.officialIngredientCount, 49);
  assert.equal(snapshot.glutenCrossContactOnlyCount, 11);
  assert.equal(snapshot.unavailableAllergenCount, 0);
  assert.equal(snapshot.glutenCrossContactItemCount, 37);

  assert.deepEqual(byId.get("firecracker-shrimp").allergens, ["wheat", "gluten", "shellfish"]);
  assert.deepEqual(byId.get("brunch-burger").allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(byId.get("grilled-tuna-field-greens").allergens, ["wheat", "gluten", "tree-nut", "fish", "sesame"]);
  assert.deepEqual(byId.get("penne-primavera").allergens, ["milk", "wheat", "gluten", "shellfish"]);
  assert.deepEqual(byId.get("pecan-crusted-trout").allergens, ["tree-nut", "fish"]);
  assert.deepEqual(byId.get("low-country-beef-back-ribs").allergens, ["mustard"]);
  assert.deepEqual(byId.get("gluten-free-penne-pasta-red-sauce").allergens, ["milk"]);
  assert.deepEqual(byId.get("gluten-free-penne-pasta-red-sauce").mayContain, ["gluten"]);

  assert.equal(byId.get("field-greens").isConfigurable, true);
  assert.equal(byId.get("drunken-rib-eye").isConfigurable, true);
  assert.equal(byId.get("mashed-potatoes").allergenSourceType, "official-global-cross-contact-note");
  assert.equal(byId.get("mashed-potatoes").mayContain[0], "gluten");
  assert.equal(byId.get("community-bread-basket").mayContain.length, 0);

  for (const artifactName of [
    "4 Ozzie rolls with Honey Butter",
    "Crumb fried & tossed with thin beans & spicy pepper jelly",
    "hot off the wood grill with Reggiano parmesan & fresh garlic croutons",
    "lettuce, mayo, pickles, mustard & fries",
    "remoulade sauce, fries & cole slaw",
    "Cole Slaw",
  ]) assert.equal(snapshot.items.some((item) => item.name === artifactName), false, artifactName);
});
