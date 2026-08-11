import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "replacement-apero-washington-dc";

test("publishes only the verified current Apéro catalog", async () => {
  const repository = JSON.parse(
    await readFile(new URL("../../src/data/generated/restaurants.generated.json", import.meta.url), "utf8"),
  );
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const byName = new Map(restaurant.items.map((entry) => [entry.name, entry]));

  assert.equal(restaurant.name, "Apéro");
  assert.equal(restaurant.displayAddress, "2622 P Street NW, Washington, DC 20007");
  assert.equal(restaurant.items.length, 53);
  assert.equal(new Set(restaurant.items.map((entry) => entry.id)).size, 53);
  assert.equal(new Set(restaurant.items.map((entry) => entry.category)).size, 7);
  assert.equal(restaurant.items.at(-1).category, "Caviar Hour");
  assert.equal(
    restaurant.items.filter((entry) => entry.allergenSourceType === "official-ingredients").length,
    49,
  );
  assert.equal(restaurant.sourceUpdatedAt, "2026-07-15T08:04:57.441Z");

  const caviar = restaurant.items.filter((entry) => entry.category === "Caviar Selections");
  assert.equal(caviar.length, 15);
  assert.equal(caviar.every((entry) => entry.isConfigurable), true);
  assert.equal(caviar.every((entry) => sameSet(entry.allergens, ["fish", "milk"])), true);
  assert.ok(byName.has("Osetra — Lyna Polska Classic"));
  assert.ok(byName.has("Siberian Sturgeon — Lyna Polska Classic"));
  assert.ok(byName.has("Beluga Hybrid — Beluga-Bester"));

  assert.deepEqual(byName.get("Fresh Fruit and Yogurt Parfait").allergens, ["milk"]);
  assert.deepEqual(byName.get("Steamed PEI Mussels").allergens, ["shellfish"]);
  assert.deepEqual(byName.get("Apéro Burger").allergens, ["milk", "mustard"]);
  assert.equal(byName.get("Escargot Tartine").allergens.includes("shellfish"), true);
  assert.equal(byName.get("Potato Chips").allergens.includes("soy"), true);
  assert.equal(byName.get("Petit-Déjeuner Français").sourceType.includes("ingredient-intelligence"), true);
  assert.equal(byName.get("Petit-Déjeuner Français").sourceUrls.some((url) => /nutella\.com/.test(url)), true);
  assert.equal(restaurant.items.every((entry) => entry.mayContain.length === 0), true);

  for (const rejectedName of [
    "10g $82 /",
    "Absinthe Service",
    "Beluga Hybrid",
    "Crab Benedict",
    "Insulated Caviar To-Go Bag",
    "Mother of Pearl Caviar spoons (set of 2)",
    "Osetra",
    "Side One Over Easy Egg",
    "Side Salad",
    "Side Toast",
    "Siberian Sturgeon",
    "White Sturgeon",
  ]) {
    assert.equal(byName.has(rejectedName), false, rejectedName);
  }

  assert.equal(restaurant.sourceStatus.frozenMatchedPresentationCount, 37);
  assert.equal(restaurant.sourceStatus.frozenMatchedCurrentProductCount, 30);
  assert.equal(restaurant.sourceStatus.frozenArtifactCount, 5);
  assert.equal(restaurant.sourceStatus.frozenStaleOrOutOfScopeCount, 7);
  assert.equal(restaurant.sourceStatus.restoredCurrentProductCount, 23);
  assert.equal(restaurant.sourceStatus.frozenAllergenMismatchCount, 21);
  assert.equal(restaurant.sourceStatus.frozenMenuContentMismatchCount, 37);
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: rebuilt Apéro/.test(repair.note ?? "")
    ).length,
    1,
  );
});

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
