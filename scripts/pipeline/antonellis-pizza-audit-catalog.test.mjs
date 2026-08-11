import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAntonellisPizzaAuditSnapshot,
  directAllergensAntonellisPizza,
  stripOptionalAddOns,
} from "./antonellis-pizza-audit-catalog.mjs";

const artifact = new URL(
  "../../data/restaurant-verification/artifacts/replacement-antonelli-s-pizza-lorton-va/official-antonellis-menu.html",
  import.meta.url,
);

test("parses Antonelli's complete top-level menu and rejects stale/helper rows", async () => {
  const snapshot = buildAntonellisPizzaAuditSnapshot({
    html: await readFile(artifact, "utf8"),
    retrievedAt: "2026-07-15T07:07:51.896Z",
  });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.rawPriceListRowCount, 97);
  assert.equal(snapshot.itemCount, 80);
  assert.equal(snapshot.categoryCount, 15);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 80);
  assert.equal(snapshot.excludedAlcoholPresentationCount, 12);
  assert.equal(snapshot.stalePlainCheesePriceRows.length, 1);
  assert.deepEqual(byName.get("PLAIN CHEESE").prices, [
    "Small 10-inch 9.99",
    "Medium 12-inch 13.99",
    "Large 16-inch 17.99",
  ]);
  assert.equal(snapshot.items.at(-1).category, "Beverages");
  assert.ok(byName.has("NY Style Cheesecake"));
  assert.ok(byName.has("PENNE ALLA VODKA"));
  assert.ok(!byName.has("DRESSINGS:"));
  assert.ok(!byName.has("CRUSTS"));
  assert.ok(!byName.has("Beer Bottle"));
});

test("maps positive ingredient signals without smearing optional additions", () => {
  assert.deepEqual(
    directAllergensAntonellisPizza("Gourmet Specialty Pizzas MARGHERITA PIZZA mozzarella").sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.deepEqual(
    directAllergensAntonellisPizza("Cold Subs TUNA SALAD SUB tuna salad mayo").sort(),
    ["egg", "fish", "gluten", "wheat"],
  );
  assert.deepEqual(
    directAllergensAntonellisPizza("Salads GREEK CHICKEN SALAD Greek salad topped with grilled chicken and pita bread").sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(stripOptionalAddOns("GRILLED CHICKEN SUB mayo. Add cheese 1.00").includes("cheese"), false);
  assert.deepEqual(
    directAllergensAntonellisPizza(stripOptionalAddOns("Hot Subs GRILLED CHICKEN SUB mayo. Add cheese 1.00")).sort(),
    ["egg", "gluten", "wheat"],
  );
  assert.deepEqual(directAllergensAntonellisPizza("Beverages BOTTLED WATER"), []);
});
