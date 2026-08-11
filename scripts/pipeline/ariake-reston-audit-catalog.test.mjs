import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAriakeRestonCatalog,
  extractAriakeOwnerMenu,
  extractAriakeToastTransport,
} from "./ariake-reston-audit-catalog.mjs";

const artifactRoot = new URL("../../data/restaurant-verification/artifacts/ariake-japanese-restaurant-reston-va-dc-metro/", import.meta.url);

async function sources() {
  const [ownerHtml, toastText] = await Promise.all([
    readFile(new URL("official-ariake-reston-menu.html", artifactRoot), "utf8"),
    readFile(new URL("ariake-toast-jina-transport.txt", artifactRoot), "utf8"),
  ]);
  return { ownerHtml, toastText };
}

test("extracts the contracted current Reston source surfaces", async () => {
  const { ownerHtml, toastText } = await sources();
  const owner = extractAriakeOwnerMenu(ownerHtml);
  const toast = extractAriakeToastTransport(toastText, owner.allNames);

  assert.equal(owner.foodPresentationCount, 194);
  assert.equal(owner.lunch.length, 36);
  assert.equal(owner.happyHour.length, 12);
  assert.equal(owner.nigiri.length, 25);
  assert.equal(toast.rawProductCount, 195);
  assert.equal(toast.excludedAlcoholCount, 29);
  assert.equal(toast.excludedMerchandiseCount, 7);
  assert.equal(toast.items.length, 159);
});

test("builds the Reston-only current union without alcohol, merchandise, or helpers", async () => {
  const snapshot = await buildAriakeRestonCatalog(await sources());
  const names = new Set(snapshot.items.map((row) => row.name));

  assert.equal(snapshot.itemCount, 235);
  assert.equal(snapshot.categoryCount, 23);
  assert.equal(snapshot.liveToastFoodProductCount, 159);
  assert.equal(snapshot.ownerLunchSupplementCount, 34);
  assert.equal(snapshot.ownerHappyHourSupplementCount, 12);
  assert.equal(snapshot.ownerNigiriSupplementCount, 25);
  assert.equal(snapshot.ownerDinnerSupplementCount, 5);
  assert.equal(snapshot.excludedOwnerHelperCount, 2);
  assert.equal(new Set(snapshot.items.map((row) => row.id)).size, 235);

  for (const present of [
    "11. Veggie Tempura, Steamed Veggies, & Veggie Roll",
    "Dinner Bento Box",
    "Hire Katsu",
    "Ton Katsu",
    "Sukiyaki (SEASONAL)",
    "Kani",
    "Spicy Volcano Roll",
    "Aji",
    "Zuwaigani",
    "Black Sesame Ice Cream",
  ]) assert.equal(names.has(present), true, present);
  for (const absent of [
    "FAIRFAX ONLINE ORDERING HOURS:",
    "a) with 6 pcs California Roll OR",
    "(spicy chirashi & Korean style chirashi available)",
    "Wanna Roll Youth Medium",
    "Miller Light",
    "Dassai 39 300ml",
  ]) assert.equal(names.has(absent), false, absent);
});

test("keeps explicit positives and imitation-crab semantics precise", async () => {
  const snapshot = await buildAriakeRestonCatalog(await sources());
  const byName = new Map(snapshot.items.map((row) => [row.name, row]));

  assert.equal(snapshot.officialIngredientCount, 186);
  assert.equal(snapshot.unavailableAllergenCount, 49);
  assert.equal(snapshot.items.every((row) => row.mayContain.length === 0), true);
  assert.deepEqual(byName.get("Hire Katsu").allergens, ["milk"]);
  assert.deepEqual(byName.get("Kani").allergens, ["fish"]);
  assert.deepEqual(byName.get("Alaskan Roll").allergens, ["fish"]);
  assert.deepEqual(byName.get("Fried Soft Shell Crabs").allergens, ["shellfish"]);
  assert.deepEqual(byName.get("Cashew Shrimp Tempura Roll").allergens, ["shellfish", "tree-nut"]);
  assert.deepEqual(byName.get("Miso Nabeyaki Udon").allergens, ["egg", "fish", "shellfish", "soy"]);
  assert.deepEqual(byName.get("Dinner Bento Box").allergens, ["fish", "sesame", "shellfish"]);
  assert.deepEqual(byName.get("Goma Ae (spinach or asparagus) (Happy Hour)").allergens, ["sesame"]);
  assert.deepEqual(byName.get("Aji").allergens, ["fish"]);
  assert.deepEqual(byName.get("Mukimi Hotate").allergens, ["shellfish"]);
});
