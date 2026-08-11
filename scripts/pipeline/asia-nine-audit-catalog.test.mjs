import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  auditAsiaNineWixApiBoundary,
  buildAsiaNineAuditSnapshot,
  directAllergensAsiaNine,
  inferredRisksAsiaNine,
} from "./asia-nine-audit-catalog.mjs";

test("builds Asia Nine's complete owner-published Thai and sushi catalog", async () => {
  const snapshot = await buildAsiaNineAuditSnapshot({ retrievedAt: "2026-07-15T13:11:42.908Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.restaurantId, "osm-asia-nine-1236156059");
  assert.equal(snapshot.sourceMenuCount, 2);
  assert.equal(snapshot.sourceSectionCount, 16);
  assert.equal(snapshot.itemCount, 161);
  assert.equal(snapshot.thaiItemCount, 81);
  assert.equal(snapshot.sushiItemCount, 80);
  assert.equal(snapshot.configurableItemCount, 30);
  assert.equal(snapshot.officialIngredientCount, 99);
  assert.equal(snapshot.unavailableAllergenCount, 62);
  assert.equal(snapshot.inferredRiskCount, 31);
  assert.equal(snapshot.globalCrossContactCount, 0);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 161);
  assert.ok(snapshot.items.slice(-7).every((item) => item.category === "Beverages"));

  assert.deepEqual(byName.get("Crab Meat Fried Rice").allergens, ["egg", "shellfish"]);
  assert.deepEqual(byName.get("Grilled Salmon Salad").allergens, ["tree-nut", "fish", "sesame"]);
  assert.deepEqual(byName.get("Tempura Udon Soup").allergens, ["egg", "fish", "soy"]);
  assert.deepEqual(byName.get("Tempura Udon Soup").inferredAllergenSignals.map((signal) => signal.id), ["wheat", "gluten"]);
  assert.deepEqual(byName.get("Universe tempura roll (8pcs)").allergens, ["milk", "fish"]);
  assert.deepEqual(byName.get("Universe tempura roll (8pcs)").inferredAllergenSignals.map((signal) => signal.id), ["egg", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Crab Stick (Kani)**").allergens, []);
  assert.deepEqual(byName.get("Crab Stick (Kani)**").inferredAllergenSignals.map((signal) => signal.id), ["fish"]);

  for (const name of ["Green Curry", "Yellow Curry", "Tom Kha", "Coconut Ice Cream"]) {
    assert.equal(byName.get(name).allergens.includes("tree-nut"), false, name);
  }
  for (const name of ["Tom Yum", "Tom Kha"]) {
    assert.deepEqual(byName.get(name).allergens, [], `${name} selectable shrimp is not fixed`);
  }
  for (const name of ["Wonton Soup", "Crab Wonton", "Shrimp Tempura** (5pcs)"]) {
    assert.equal(byName.get(name).allergens.includes("wheat"), false, name);
    assert.equal(byName.get(name).allergens.includes("gluten"), false, name);
    assert.ok(byName.get(name).inferredAllergenSignals.some((signal) => signal.id === "wheat"), name);
  }
  assert.deepEqual(byName.get("Eel Sauce").allergens, []);
  assert.deepEqual(byName.get("Add Eel Sauce").allergens, []);

  for (const artifactName of [
    "Custom style",
    "Customize font",
    "Manage your customer reviews",
    "Respond to reviews",
    "Sell more with social proof",
    "Unlimited reviews",
  ]) assert.equal(byName.has(artifactName), false, artifactName);
});

test("excludes the 21 visible Wix demo products that are absent from the published menu graph", async () => {
  const directory = new URL("../../data/restaurant-verification/artifacts/osm-asia-nine-1236156059/", import.meta.url);
  const [menus, sections, items] = await Promise.all([
    readFile(new URL("official-wix-menus.json", directory), "utf8").then(JSON.parse),
    readFile(new URL("official-wix-sections.json", directory), "utf8").then(JSON.parse),
    readFile(new URL("official-wix-items.json", directory), "utf8").then(JSON.parse),
  ]);
  const boundary = auditAsiaNineWixApiBoundary({ menus, sections, items });
  assert.deepEqual(
    {
      menuCount: boundary.menuCount,
      sectionCount: boundary.sectionCount,
      publishedItemCount: boundary.publishedItemCount,
      rawVisibleItemCount: boundary.rawVisibleItemCount,
      demoItemCount: boundary.demoItemCount,
    },
    { menuCount: 2, sectionCount: 16, publishedItemCount: 161, rawVisibleItemCount: 182, demoItemCount: 21 },
  );
  for (const name of ["Tofu skewers", "Classic burger", "Classic cheesecake"]) {
    assert.ok(boundary.demoItemNames.includes(name), name);
  }
});

test("keeps formulation intelligence separate from direct restaurant-issued signals", () => {
  assert.deepEqual(directAllergensAsiaNine("Yellow Curry", "yellow curry coconut sauce"), []);
  assert.deepEqual(directAllergensAsiaNine("Tom Kha", "Choice of Chicken, Shrimp, or Veggie"), []);
  assert.deepEqual(directAllergensAsiaNine("Crab Stick (Kani)", null), []);
  assert.deepEqual(directAllergensAsiaNine("Add Eel Sauce", null), []);
  assert.deepEqual(directAllergensAsiaNine("Crab Wonton", "Crab meat, crab stick, cream cheese"), ["milk", "shellfish"]);
  assert.deepEqual(
    inferredRisksAsiaNine("Crab Wonton", "Crab meat, crab stick, cream cheese", ["milk", "shellfish"]).signals.map((signal) => signal.id),
    ["wheat", "gluten", "fish"],
  );
});
