import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnniesParamountAuditSnapshot,
  directAllergensAnniesParamount,
  sourceUrlsAnniesParamount,
} from "./annies-paramount-audit-catalog.mjs";

test("transcribes and canonicalizes Annie's current dated food menus", () => {
  const snapshot = buildAnniesParamountAuditSnapshot({
    retrievedAt: "2026-07-15T06:28:14.628Z",
  });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.itemCount, 112);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 112);
  assert.equal(snapshot.dinnerItemCount, 81);
  assert.equal(snapshot.lunchItemCount, 92);
  assert.equal(snapshot.brunchItemCount, 90);
  assert.equal(snapshot.happyHourItemCount, 9);
  assert.equal(snapshot.categoryCount, 16);
  assert.equal(snapshot.officialIngredientCount + snapshot.unavailableAllergenCount, 112);

  assert.deepEqual(byName.get("Basil-Pine Nut Pesto Pasta").allergens.sort(), [
    "gluten", "milk", "tree-nut", "wheat",
  ]);
  assert.ok(!byName.get("Basil-Pine Nut Pesto Pasta").allergens.includes("shellfish"));
  assert.deepEqual(byName.get("Country Chicken Salad").allergens.sort(), [
    "gluten", "milk", "wheat",
  ]);
  assert.ok(!byName.get("Country Chicken Salad").allergens.includes("shellfish"));
  assert.deepEqual(byName.get("Grilled Atlantic Salmon").allergens, ["fish"]);
  assert.deepEqual(byName.get("Feta Bacon Omelet").allergens.sort(), [
    "egg", "gluten", "milk", "wheat",
  ]);
  assert.ok(!byName.get("Coconut Cream Pie").allergens.includes("tree-nut"));
  assert.ok(byName.get("Fried Shrimp").sourceUrls.includes(sourceUrlsAnniesParamount.happyHour));
  assert.equal(byName.get("Bull in the Pan").sourceUrls.length, 3);
  assert.ok(!snapshot.items.some((item) => item.name === "Heineken Zero"));
  assert.ok(!snapshot.items.some((item) => item.name === "ENTRÉE SALADS"));
});

test("does not smear optional proteins or coconut onto base products", () => {
  assert.deepEqual(
    directAllergensAnniesParamount(
      "Basil-Pine Nut Pesto Pasta penne parmesan add grilled chicken or shrimp coconut",
    ).sort(),
    ["gluten", "milk", "tree-nut", "wheat"],
  );
  assert.deepEqual(
    directAllergensAnniesParamount(
      "Country Chicken Salad cheddar croutons ranch with grilled shrimp",
    ).sort(),
    ["gluten", "milk", "wheat"],
  );
});
