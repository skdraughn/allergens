import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildArenasGeorgetownCatalog,
  parseArenasToastMarkdown,
} from "./arenas-georgetown-audit-catalog.mjs";

async function capturedSource() {
  const directory = new URL("../../data/restaurant-verification/artifacts/arenas-georgetown-dc/", import.meta.url);
  const [toastMarkdown, mainMenuText, kidsMenuText] = await Promise.all([
    readFile(new URL("arenas-toast-readable-proxy.txt", directory), "utf8"),
    readFile(new URL("official-arenas-georgetown-july-2026-menu.txt", directory), "utf8"),
    readFile(new URL("official-arenas-kids-menu.txt", directory), "utf8"),
  ]);
  return { toastMarkdown, mainMenuText, kidsMenuText };
}

test("builds Arena's current consumer catalog from the owner and linked menus", async () => {
  const source = await capturedSource();
  const snapshot = buildArenasGeorgetownCatalog(source, { retrievedAt: "2026-07-15T09:20:53.792Z" });
  const names = new Set(snapshot.items.map((item) => item.name));

  assert.equal(snapshot.itemCount, 101);
  assert.equal(snapshot.categoryCount, 10);
  assert.equal(snapshot.toastPresentationCount, 89);
  assert.equal(snapshot.toastUniqueProductCount, 86);
  assert.equal(snapshot.ownerSupplementalProductCount, 15);
  assert.equal(snapshot.linkedOnlyProductCount, 17);
  for (const present of [
    "Italian Cold Cut",
    "Honey Chicken Club",
    "Soup of the Day",
    "Avocado",
    "Kids Chicken Tenders",
    "Small Caesar Salad",
  ]) assert.equal(names.has(present), true, present);
  for (const absent of [
    "Chicken Sandwiches",
    "Classic Sandwiches",
    "Veggie Options & Burgers",
    "Large Hot Tots",
    "Small Hot Tots",
    "Mac and Cheese Bites",
  ]) assert.equal(names.has(absent), false, absent);
});

test("limits fixed signals to ingredients expressly named by Arena's owner menu", async () => {
  const snapshot = buildArenasGeorgetownCatalog(await capturedSource());
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.deepEqual(byName.get("Crab Dip").allergens, ["milk", "shellfish"]);
  assert.deepEqual(byName.get("BLT").allergens, ["egg"]);
  assert.deepEqual(byName.get("California Club").allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Rockfish Reuben").allergens, ["milk", "fish"]);
  assert.deepEqual(byName.get("Kids Fried Shrimp").allergens, ["shellfish"]);
  assert.equal(byName.get("Chicken Nachos").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Chicken Nachos").allergens, []);
  assert.equal(byName.get("Small Caesar Salad").allergenSourceType, "unavailable");
  assert.equal(snapshot.items.every((item) => item.mayContain.length === 0), true);
});

test("rejects an incomplete or changed Toast capture instead of silently truncating it", async () => {
  const { toastMarkdown } = await capturedSource();
  const withoutNachos = toastMarkdown.replace(/^.*order\.toasttab\.com\/online\/arenas-georgetown\/item-nachos_.*$/gm, "");
  assert.notEqual(withoutNachos, toastMarkdown);
  assert.throws(
    () => parseArenasToastMarkdown(withoutNachos),
    /expected 86 unique products/,
  );
});
