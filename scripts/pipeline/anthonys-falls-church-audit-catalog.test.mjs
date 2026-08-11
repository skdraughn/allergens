import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAnthonysFallsChurchAuditSnapshot,
  directAllergensAnthonysFallsChurch,
} from "./anthonys-falls-church-audit-catalog.mjs";

const artifact = new URL(
  "../../data/restaurant-verification/artifacts/osm-anthony-s-7464874523/jina-anthonys-menu.md",
  import.meta.url,
);

test("parses Anthony's complete current Owner menu and canonicalizes true repeats", async () => {
  const snapshot = buildAnthonysFallsChurchAuditSnapshot({
    markdown: await readFile(artifact, "utf8"),
    retrievedAt: "2026-07-15T06:48:00.000Z",
  });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.presentationCount, 178);
  assert.equal(snapshot.itemCount, 175);
  assert.equal(snapshot.categoryCount, 20);
  assert.equal(snapshot.duplicatePresentationCount, 3);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 175);
  assert.equal(snapshot.officialIngredientCount + snapshot.unavailableAllergenCount, 175);
  assert.equal(byName.get("GARIDOMAKARONADA").sourcePresentationCount, 2);
  assert.equal(byName.get("GARIDOMAKARONADA").category, "PASTA");
  assert.ok(byName.get("GARIDOMAKARONADA").allergens.includes("shellfish"));
  assert.ok(byName.get("GARIDOMAKARONADA").allergens.includes("milk"));
  assert.ok(byName.get("TILAPIA ALMANDINE").allergens.includes("tree-nut"));
  assert.equal(byName.get("GREEK FRIES").sourcePresentationCount, 2);
  assert.equal(byName.get("MEATBALL").sourcePresentationCount, 2);
  assert.ok(byName.has("CHICKEN 6oz"));
  assert.ok(byName.has("GRAPE LEAVES Dinner"));
  assert.ok(byName.has("KIDS HOT DOG"));
  assert.ok(!byName.has("Broccoli"));
  assert.ok(!byName.has("KIDS"));
  assert.ok(!byName.has("Thousand Island"));
});

test("keeps the raw-food warning and absent terms out of allergen claims", () => {
  assert.deepEqual(
    directAllergensAnthonysFallsChurch(
      "NEW YORK STEAK consuming raw meats poultry seafood shellfish or eggs may increase risk",
    ),
    [],
  );
  assert.deepEqual(
    directAllergensAnthonysFallsChurch("GARIDOMAKARONADA shrimp spaghetti feta").sort(),
    ["gluten", "milk", "shellfish", "wheat"],
  );
  assert.deepEqual(directAllergensAnthonysFallsChurch("CAULIFLOWER PIZZA"), []);
});
