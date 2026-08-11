import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAndysPizzaAdamsMorganAuditSnapshot,
  parseAndysPizzaAllLocations,
  parseAndysPizzaStructuredMenu,
} from "./andys-pizza-adams-morgan-audit-catalog.mjs";

const artifactRoot = "data/restaurant-verification/artifacts/andys-pizza-dc";
const [menuHtml, allMenusHtml] = await Promise.all([
  readFile(`${artifactRoot}/official-andys-adams-morgan-menu.html`, "utf8"),
  readFile(`${artifactRoot}/official-andys-all-menus.html`, "utf8"),
]);

function item(snapshot, name) {
  const match = snapshot.items.find((row) => row.name === name);
  assert.ok(match, `Missing ${name}`);
  return match;
}

test("isolates the exact 16-row Adams Morgan structured menu from ten location menus", () => {
  const exact = parseAndysPizzaStructuredMenu(menuHtml, { expectedMenuName: "Adams Morgan" });
  const locations = parseAndysPizzaAllLocations(allMenusHtml);
  assert.equal(exact.length, 16);
  assert.equal(locations.length, 10);
  assert.equal(locations.find((row) => row.locationName === "Adams Morgan").items.length, 16);
  assert.ok(!exact.some((row) => row.name === "Buffalo Crispy Chicken"));
  assert.ok(locations.some((location) => location.items.some((row) => row.name === "Buffalo Crispy Chicken")));
});

test("retains 15 products and excludes Whole Pie Toppings as a modifier group", () => {
  const snapshot = buildAndysPizzaAdamsMorganAuditSnapshot({
    menuHtml,
    allMenusHtml,
    retrievedAt: "2026-07-15T00:00:00.000Z",
  });
  assert.equal(snapshot.publishedStructuredRowCount, 16);
  assert.equal(snapshot.itemCount, 15);
  assert.equal(snapshot.modifierGroupCount, 1);
  assert.equal(snapshot.categoryCount, 3);
  assert.equal(snapshot.officialIngredientCount, 15);
  assert.equal(snapshot.unavailableAllergenCount, 0);
  assert.ok(!snapshot.items.some((row) => row.name === "Whole Pie Toppings:"));
  assert.deepEqual(snapshot.excludedModifierGroups.map((row) => row.name), ["Whole Pie Toppings:"]);
});

test("applies the published sourdough crust only to pizzas and preserves plant-based semantics", () => {
  const snapshot = buildAndysPizzaAdamsMorganAuditSnapshot({ menuHtml, allMenusHtml });
  assert.deepEqual(
    [...item(snapshot, "Oven Roasted Broccolini").allergens].sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.deepEqual(item(snapshot, "Kale Salad").allergens, ["milk"]);
  assert.deepEqual(
    [...item(snapshot, "Miller Time (Plant Based)").allergens].sort(),
    ["gluten", "wheat"],
  );
  assert.ok(!item(snapshot, "Miller Time (Plant Based)").allergens.includes("milk"));
  assert.deepEqual(
    [...item(snapshot, "8 Makes a Pie").allergens].sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(item(snapshot, "8 Makes a Pie").isConfigurable, true);
  assert.ok(snapshot.items.every((row) => row.mayContain.length === 0));
});
