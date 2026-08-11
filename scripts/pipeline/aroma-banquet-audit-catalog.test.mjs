import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aromaBanquetDineInMenuName,
  aromaBanquetOrderingMenuName,
  buildAromaBanquetCatalog,
  dineInOnlyProductNames,
} from "./aroma-banquet-audit-catalog.mjs";

async function capturedCatalog() {
  const directory = new URL(
    "../../data/restaurant-verification/artifacts/osm-aroma-banquet-1395623894/",
    import.meta.url,
  );
  const [menus, sections, items] = await Promise.all([
    readFile(new URL("official-aroma-banquet-wix-menus.json", directory), "utf8").then(JSON.parse),
    readFile(new URL("official-aroma-banquet-wix-sections.json", directory), "utf8").then(JSON.parse),
    readFile(new URL("official-aroma-banquet-wix-items.json", directory), "utf8").then(JSON.parse),
  ]);
  return { menus, sections, items };
}

test("builds the current 99-product Aroma dine-in catalog and 90-product ordering subset", async () => {
  const source = await capturedCatalog();
  const snapshot = buildAromaBanquetCatalog(source, { retrievedAt: "2026-07-15T10:59:45.368Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.sourceMenuCount, 2);
  assert.equal(snapshot.sourceSectionCount, 30);
  assert.equal(snapshot.sourceItemCount, 220);
  assert.equal(snapshot.dineInPresentationCount, 99);
  assert.equal(snapshot.orderingPresentationCount, 90);
  assert.equal(snapshot.itemCount, 99);
  assert.equal(snapshot.categoryCount, 15);
  assert.equal(snapshot.officialIngredientCount, 63);
  assert.equal(snapshot.unavailableAllergenCount, 36);
  assert.equal(snapshot.dineInOnlyProductCount, 9);
  assert.equal(snapshot.excludedHeadingCount, 1);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 99);

  assert.equal(source.menus.menus.find((menu) => menu.name === aromaBanquetDineInMenuName).visible, false);
  assert.notEqual(source.menus.menus.find((menu) => menu.name === aromaBanquetOrderingMenuName).visible, false);
  assert.equal(byName.get("Kebab Platter").category, "Starters");
  assert.equal(byName.get("Cauliflower Rice").category, "Sides");
  assert.equal(byName.get("Gulab Jamoon").category, "Desserts");
  assert.deepEqual(byName.get("Gulab Jamoon").aliases, ["Gulab Jamun"]);
});

test("uses the owner-linked PDF to retain the nine dine-in-only products", async () => {
  const snapshot = buildAromaBanquetCatalog(await capturedCatalog());
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.deepEqual(
    snapshot.items.filter((item) => item.presentations.length === 1).map((item) => item.name).sort(),
    [...dineInOnlyProductNames].sort(),
  );
  for (const name of dineInOnlyProductNames) {
    assert.equal(byName.get(name).sourceType, "restaurant-issued-pdf-menu", name);
  }
  assert.equal(byName.get("Kebab Platter").presentations.length, 2);
  assert.equal(byName.get("Kebab Platter").sourceType, "restaurant-issued-pdf-and-wix-ordering-menu");
});

test("excludes headings and superseded Wix-only products", async () => {
  const snapshot = buildAromaBanquetCatalog(await capturedCatalog());
  const names = new Set(snapshot.items.map((item) => item.name));

  for (const excluded of [
    "House Dressings",
    "Chili Rellieno",
    "Salmon en Cilantro",
    "Seekh Kebab Taquitos",
    "Soft Tacos",
    "Spinach & Potato Taquitos",
  ]) assert.equal(names.has(excluded), false, excluded);
  for (const current of [
    "Mint & Coriander",
    "Tamarind",
    "Matter Pulao",
    "Chicken 65",
    "Gulab Jamoon",
  ]) assert.equal(names.has(current), true, current);
});

test("maps only supported fixed allergen semantics and preserves unknown cross-contact", async () => {
  const snapshot = buildAromaBanquetCatalog(await capturedCatalog());
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.deepEqual(byName.get("Bagara Baigan").allergens, ["peanut", "sesame"]);
  assert.deepEqual(byName.get("Coco Mussel Curry").allergens, ["shellfish"]);
  assert.deepEqual(byName.get("Sarso Ka Saag").allergens, []);
  assert.deepEqual(byName.get("Chicken Mugulai").allergens, ["tree-nut"]);
  assert.deepEqual(byName.get("Gajjar Halwa").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byName.get("Hakka Noodles").allergens, ["wheat", "gluten", "soy"]);
  assert.deepEqual(byName.get("Samosa").allergens, ["wheat", "gluten"]);
  assert.deepEqual(byName.get("Pudina Paratha").allergens, ["wheat", "gluten"]);
  assert.deepEqual(byName.get("Vegetable Biryani").allergens, ["milk"]);
  assert.deepEqual(byName.get("Shrimp Biryani").allergens, ["milk", "shellfish"]);
  assert.deepEqual(byName.get("Kashmiri Nan").inferredAllergenSignals.map((signal) => signal.id), ["tree-nut"]);
  assert.deepEqual(byName.get("Chicken Lolipop").inferredAllergenSignals.map((signal) => signal.id), ["wheat", "gluten"]);
  assert.equal(snapshot.items.every((item) => item.mayContain.length === 0), true);
  assert.equal(snapshot.items.every((item) => !item.allergens.includes("mustard")), true);
});

test("pins the captured official source bytes", async () => {
  const directory = new URL(
    "../../data/restaurant-verification/artifacts/osm-aroma-banquet-1395623894/",
    import.meta.url,
  );
  const expected = [
    ["official-aroma-banquet-dine-in-menu-pdf.pdf", "74977f27c4717e91f87394eacd99a0a52c90f43029d6c5bf121798411f6e12f6"],
    ["official-aroma-banquet-wix-menus.json", "472f3ed9cdef29acb90f00054e4594c13ca3d81e09bfd79d6fa155eabae26870"],
    ["official-aroma-banquet-wix-sections.json", "d46c061c2c47ee2eba5cd7b639ebe964b51337842773b0f664ac14e41359d20f"],
    ["official-aroma-banquet-wix-items.json", "94e18c200df6597098281156b3d4c78cff0afca9e92b392af78889d4ea6fda9b"],
  ];
  for (const [filename, hash] of expected) {
    const bytes = await readFile(new URL(filename, directory));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, filename);
  }
});

test("fails closed when the menu visibility contract changes", async () => {
  const source = await capturedCatalog();
  source.menus.menus.find((menu) => menu.name === aromaBanquetDineInMenuName).visible = true;
  assert.throws(
    () => buildAromaBanquetCatalog(source),
    /visibility contract changed/i,
  );
});
