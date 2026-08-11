import assert from "node:assert/strict";
import test from "node:test";

import { build2941AuditSnapshot } from "./2941-audit-catalog.mjs";

test("builds every current official 2941 menu surface", () => {
  const snapshot = build2941AuditSnapshot({ retrievedAt: "2026-07-14T18:09:41.268Z" });
  const counts = Object.fromEntries(
    [...Map.groupBy(snapshot.items, (item) => item.category)].map(([category, items]) => [category, items.length]),
  );

  assert.equal(snapshot.itemCount, 51);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 51);
  assert.deepEqual(counts, {
    Appetizers: 6,
    Specials: 2,
    Entrées: 6,
    Sides: 3,
    "Cheese Selection": 5,
    "Prix Fixe · Appetizers": 1,
    "Prix Fixe · Entrées": 2,
    "July Tasting · First Course": 2,
    "July Tasting · Second Course": 2,
    "July Tasting · Third Course": 2,
    "July Tasting · Fourth Course": 2,
    "July Tasting · Fifth Course": 2,
    Desserts: 4,
    Cocktails: 8,
    "Zero Proof": 4,
  });
  assert.equal(snapshot.items.at(-1).category, "Zero Proof");
});

test("maps only explicit menu terms and avoids culinary-name false positives", () => {
  const snapshot = build2941AuditSnapshot();
  const item = (name) => snapshot.items.find((entry) => entry.name === name);

  assert.deepEqual(item("American Wagyu Tartare").allergens, ["egg", "soy", "wheat", "gluten"]);
  assert.deepEqual(item("White Asparagus Velouté").allergens, ["egg", "soy"]);
  assert.deepEqual(item("Oyster Mushrooms").allergens, ["milk"]);
  assert.deepEqual(item("East Coast Oysters").allergens, ["shellfish"]);
  assert.deepEqual(item("Kaviari Baenki Caviar").allergens, ["egg", "fish", "wheat", "gluten"]);
  assert.deepEqual(item("Goot Essa Der Alpen, Howard, Pennsylvania").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(item("Fairview Oasis").allergens, ["tree-nut"]);
  assert.deepEqual(item("Passion-Rita").allergens, []);
});
