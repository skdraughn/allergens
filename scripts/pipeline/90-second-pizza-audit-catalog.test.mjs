import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { build90SecondPizzaAuditSnapshot } from "./90-second-pizza-audit-catalog.mjs";

const toastMarkdown = await readFile(
  "data/restaurant-verification/artifacts/ninety-second-pizza-georgetown-dc/third-party-toast-render-proxy.txt",
  "utf8",
);

test("builds the complete current Georgetown menu with drinks last", () => {
  const snapshot = build90SecondPizzaAuditSnapshot({ toastMarkdown });
  const counts = Object.fromEntries(
    [...Map.groupBy(snapshot.items, (item) => item.category)].map(([category, items]) => [category, items.length]),
  );

  assert.equal(snapshot.itemCount, 35);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 35);
  assert.deepEqual(counts, {
    Pizza: 14,
    "Vegan Pizza": 7,
    Desserts: 4,
    Miscellaneous: 1,
    Drinks: 9,
  });
  assert.equal(snapshot.items.at(-1).category, "Drinks");
});

test("separates fixed ingredients from the FAQ cross-contact guidance", () => {
  const snapshot = build90SecondPizzaAuditSnapshot({ toastMarkdown });
  const item = (name) => snapshot.items.find((entry) => entry.name === name);

  assert.deepEqual(item("Margherita").allergens, ["milk"]);
  assert.deepEqual(item("Margherita").mayContain, ["peanut", "tree-nut", "gluten"]);
  assert.deepEqual(item("Campania").allergens, ["milk", "fish"]);
  assert.deepEqual(item("Vegan").allergens, []);
  assert.equal(item("Vegan").allergenSourceType, "official-global-cross-contact-note");
  assert.deepEqual(item("Vegan").mayContain, ["peanut", "tree-nut", "gluten"]);
  assert.deepEqual(item("Half and Half").mayContain, ["peanut", "tree-nut", "gluten", "milk", "fish"]);
  assert.equal(item("Half and Half").isConfigurable, true);
  assert.deepEqual(item("Tiramisu Pastry Cup").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Tiramisu Pastry Cup").mayContain, ["peanut", "tree-nut"]);
  assert.deepEqual(item("Authentic Bindi Tiramisu").allergens, []);
  assert.deepEqual(item("Water Bottle").mayContain, []);
  assert.equal(item("Water Bottle").allergenSourceType, "unavailable");
});
