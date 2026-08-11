import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAracosiaCatalog,
  currentAracosiaMenuNames,
} from "./aracosia-audit-catalog.mjs";

async function capturedCatalog() {
  const directory = new URL(
    "../../data/restaurant-verification/artifacts/osm-aracosia-3584164912/",
    import.meta.url,
  );
  const [menus, sections, items] = await Promise.all([
    readFile(new URL("official-aracosia-wix-menus.json", directory), "utf8").then(JSON.parse),
    readFile(new URL("official-aracosia-wix-sections.json", directory), "utf8").then(JSON.parse),
    readFile(new URL("official-aracosia-wix-items.json", directory), "utf8").then(JSON.parse),
  ]);
  return { menus, sections, items };
}

test("builds the current published Aracosia catalog from official Wix relationships", async () => {
  const source = await capturedCatalog();
  const snapshot = buildAracosiaCatalog(source, { retrievedAt: "2026-07-15T08:39:21.866Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.sourceMenuCount, 8);
  assert.equal(snapshot.sourceSectionCount, 40);
  assert.equal(snapshot.sourceItemCount, 334);
  assert.equal(snapshot.visibleMenuCount, 4);
  assert.equal(snapshot.visiblePresentationCount, 194);
  assert.equal(snapshot.visibleUniqueNameCount, 124);
  assert.equal(snapshot.itemCount, 107);
  assert.equal(snapshot.categoryCount, 12);
  assert.deepEqual(
    source.menus.menus.filter((menu) => menu.visible !== false).map((menu) => menu.name),
    currentAracosiaMenuNames,
  );
  assert.equal(byName.get("Afghania Chicken").category, "Qormas");
  assert.equal(byName.get("Baadenjaan").category, "Sides");
  assert.equal(byName.get("Firni").category, "Desserts");
  assert.equal(byName.get("Marinated Salmon (1lb) - READY TO GRILL, BBQ, COOK").category, "Marinated Meats & Vegetables");
  assert.equal(byName.get("Avocado, Cilantro, and Yogurt Chutney.[16oz]").category, "Chutneys");
});

test("excludes hidden catalogs and consolidates meal-period copies", async () => {
  const snapshot = buildAracosiaCatalog(await capturedCatalog());
  const names = new Set(snapshot.items.map((item) => item.name));

  for (const hidden of [
    "Kids Beef Bistro Burger",
    "Saffron Chicken",
    "Mother's Day Special",
    "Billecart Salmon, Rosé, Champagne, NV",
  ]) {
    assert.equal(names.has(hidden), false, hidden);
  }
  for (const current of [
    "Firni",
    "Marinated Beef Tenderloin (1lb) - READY TO GRILL, BBQ, COOK.",
    "Marinated Chicken Breast (1lb) - READY TO GRILL, BBQ, COOK.",
    "Marinated Salmon (1lb) - READY TO GRILL, BBQ, COOK",
  ]) {
    assert.equal(names.has(current), true, current);
  }
  assert.equal(names.has("Mixed Green Salad"), false);
  assert.equal(names.has("Beef Tenderloin & Chicken"), false);
  assert.equal(names.has("Salmon Kabob"), false);
  assert.equal(names.has("Mantu Entree"), false);
});

test("keeps owner-named ingredients separate from Ingredient Intelligence", async () => {
  const snapshot = buildAracosiaCatalog(await capturedCatalog());
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.deepEqual(byName.get("Bistro Signature Lentil Soup").allergens, ["milk"]);
  assert.deepEqual(byName.get("Bistro Salad").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byName.get("Firni").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byName.get("Marinated Salmon (1lb) - READY TO GRILL, BBQ, COOK").allergens, ["fish"]);
  assert.deepEqual(byName.get("Bistro Burger").allergens, []);
  assert.deepEqual(
    byName.get("Bistro Burger").inferredAllergenSignals.map((signal) => signal.id),
    ["gluten", "wheat", "egg", "milk"],
  );
  assert.deepEqual(
    byName.get("Leek & Scallion Dumplings (Aushak) Entree").allergens,
    ["milk"],
  );
  assert.deepEqual(
    byName.get("Leek & Scallion Dumplings (Aushak) Entree").inferredAllergenSignals.map((signal) => signal.id),
    ["gluten", "wheat"],
  );
  assert.deepEqual(byName.get("Avocado, Cilantro, and Yogurt Chutney.[16oz]").inferredAllergenSignals, []);
  assert.equal(snapshot.items.every((item) => item.mayContain.length === 0), true);
});

test("fails closed when the visible menu contract changes", async () => {
  const source = await capturedCatalog();
  source.menus.menus.find((menu) => menu.name === "CHUTNEYS").visible = false;
  assert.throws(
    () => buildAracosiaCatalog(source),
    /visible menus changed/i,
  );
});
