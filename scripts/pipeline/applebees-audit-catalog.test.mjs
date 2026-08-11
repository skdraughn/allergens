import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildApplebeesAuditSnapshot,
  globalMayContainApplebees,
  restaurantIdApplebees,
} from "./applebees-audit-catalog.mjs";

const artifactRoot = path.resolve(`data/restaurant-verification/artifacts/${restaurantIdApplebees}`);

async function inputs() {
  const [menuHtml, nutritionText, interactiveText, nutritionixLandingHtml, nutritionixDataText] =
    await Promise.all([
      readFile(path.join(artifactRoot, "official-applebees-menu.html"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-nutrition-readable-proxy.txt"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-interactive-nutrition-readable-proxy.txt"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-linked-nutritionix-landing.html"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-linked-nutritionix-menu.json"), "utf8"),
    ]);
  return {
    menuHtml,
    nutritionText,
    interactiveText,
    nutritionixLandingHtml,
    nutritionixData: JSON.parse(nutritionixDataText),
  };
}

test("builds the July 13 Applebee's consumer catalog from the current linked dataset", async () => {
  const snapshot = buildApplebeesAuditSnapshot(await inputs());
  assert.equal(snapshot.sourceGeneratedAt, "2026-07-13T14:23:29+00:00");
  assert.equal(snapshot.itemCount, 130);
  assert.equal(snapshot.categoryCount, 16);
  assert.equal(snapshot.officialAllergenMenuCount, 119);
  assert.equal(snapshot.globalCrossContactOnlyCount, 11);
  assert.equal(snapshot.globalCrossContactAppliedCount, 130);
  assert.equal(snapshot.excludedCateringItemCount, 84);
  assert.equal(snapshot.excludedPreviewOnlyItemCount, 44);
  assert.equal(new Set(snapshot.items.map((entry) => entry.id)).size, 130);
  assert.equal(snapshot.items.at(-1).category, "Beverages");
  assert.equal(snapshot.items.every((entry) => entry.isConfigurable), true);
});

test("uses the linked item matrix for positive signals", async () => {
  const snapshot = buildApplebeesAuditSnapshot(await inputs());
  const byName = new Map(snapshot.items.map((entry) => [entry.name, entry]));
  assert.deepEqual(byName.get("Brownie Bite").allergens, [
    "gluten",
    "milk",
    "egg",
    "tree-nut",
    "wheat",
    "soy",
  ]);
  assert.deepEqual(byName.get("Caesar Salad").allergens, [
    "gluten",
    "milk",
    "egg",
    "fish",
    "wheat",
  ]);
  assert.equal(byName.get("Chicken Wonton Tacos").allergens.includes("sesame"), true);
  assert.equal(byName.get("Sesame Salmon Bowl").allergens.includes("fish"), true);
  assert.equal(byName.get("Sesame Salmon Bowl").allergens.includes("tree-nut"), true);
  assert.equal(byName.get("Classic Fries (Side)").allergenSourceType, "official-allergen-menu");
  assert.deepEqual(byName.get("Classic Fries (Side)").allergens, []);
});

test("preserves Applebee's global shared-prep warning without treating zeroes as safety", async () => {
  const snapshot = buildApplebeesAuditSnapshot(await inputs());
  assert.equal(
    snapshot.items.every((entry) => sameSet(entry.mayContain, globalMayContainApplebees)),
    true,
  );
  const shells = snapshot.items.filter((entry) =>
    entry.allergenSourceType === "official-global-cross-contact-note"
  );
  assert.equal(shells.length, 11);
  assert.equal(shells.some((entry) => entry.name === "Appetizer Trio Dips"), true);
  assert.equal(shells.some((entry) => entry.name === "Kids Shakes"), true);
  assert.equal(shells.some((entry) => entry.name === "Fountain Drinks"), true);
});

test("includes current sampler, kids, and beverage rows while excluding internal categories", async () => {
  const snapshot = buildApplebeesAuditSnapshot(await inputs());
  const byName = new Map(snapshot.items.map((entry) => [entry.name, entry]));
  assert.ok(byName.has("Bacon Cheeseburger Wonton Tacos"));
  assert.ok(byName.has("Build Your Appetizer Sampler (Choose 3)") === false);
  assert.ok(byName.has("Chicken Wonton Tacos - Sampler"));
  assert.ok(byName.has("Kids Kraft® Macaroni & Cheese"));
  assert.ok(byName.has("Coffee & Hot Tea"));
  assert.equal(snapshot.items.some((entry) => /INM Only|Catering/i.test(entry.category)), false);
  assert.equal(snapshot.items.some((entry) => entry.name === "Whole Lotta Bacon Burger"), false);
});

test("fails closed when owner policy or source shape changes", async () => {
  const current = await inputs();
  assert.throws(
    () => buildApplebeesAuditSnapshot({ ...current, nutritionText: "" }),
    /global allergen\/gluten warning changed/,
  );
  assert.throws(
    () => buildApplebeesAuditSnapshot({
      ...current,
      nutritionixData: { ...current.nutritionixData, generatedAt: "changed" },
    }),
    /Nutritionix generation changed/,
  );
});

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
