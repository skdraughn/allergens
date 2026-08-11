import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAmparoAuditSnapshot,
  extractToastMirrorMenu,
} from "./amparo-fondita-audit-catalog.mjs";

const snapshot = await buildAmparoAuditSnapshot({ retrievedAt: "2026-07-15T03:00:00.000Z" });
const byName = new Map(snapshot.items.map((item) => [item.name, item]));

test("Amparo parses the complete current exact-address linked Toast catalog", async () => {
  assert.equal(snapshot.currentStore.name, "Amparo Fondita");
  assert.equal(snapshot.currentStore.address, "2002 P Street Northwest, Washington, DC 20036");
  assert.equal(snapshot.currentMenuCount, 3);
  assert.equal(snapshot.toastPresentationCount, 91);
  assert.equal(snapshot.orphanTextBlocks.length, 3);
  assert.deepEqual(snapshot.orphanTextBlocks.map((block) => block.category), [
    "Ensaladas",
    "Postres",
    "Amparo's Masa",
  ]);
});

test("Amparo consolidates every current ordering and tasting presentation", () => {
  assert.equal(snapshot.currentPresentationCount, 97);
  assert.equal(snapshot.itemCount, 88);
  assert.equal(snapshot.categoryCount, 13);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 88);
  assert.ok(snapshot.items.every((item) => item.name && item.category));
  for (const [name, count] of [
    ["Escabeche", 2],
    ["Totopos", 2],
    ["La Picosa (Spicy Marg)", 2],
    ["NA Amparo's Margarita", 2],
    ["Mezcal Negroni", 2],
    ["El Santo", 2],
    ["Naranjas de Invierno", 2],
    ["Hongos con Shishito", 2],
    ["Tres Leches", 2],
  ]) {
    assert.equal(byName.get(name).presentationCount, count, name);
  }
});

test("Amparo keeps beverage categories at the end", () => {
  const categories = [...new Set(snapshot.items.map((item) => item.category))];
  assert.deepEqual(categories.slice(-3), ["Bebidas", "Sake", "Cocktails"]);
});

test("Amparo limits official allergen evidence to six current on-page tasting courses", () => {
  assert.equal(snapshot.officialIngredientCount, 6);
  assert.equal(snapshot.unavailableAllergenCount, 82);
  assert.deepEqual(byName.get("Tostaditas de Atún").allergens, ["fish"]);
  assert.deepEqual(byName.get("Naranjas de Invierno").allergens, ["mustard"]);
  assert.deepEqual(byName.get("Sopesitos").allergens, ["milk"]);
  assert.deepEqual(byName.get("Hongos con Shishito").allergens, ["milk"]);
  assert.deepEqual(byName.get("Camarones en Mole Coloradito").allergens, ["shellfish"]);
  assert.deepEqual(new Set(byName.get("Tres Leches").allergens), new Set(["egg", "gluten", "milk", "wheat"]));
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
});

test("Amparo never promotes linked Toast descriptions to official allergen claims", () => {
  for (const name of [
    "Camarones A La Plancha",
    "Queso Frito",
    "Chile Relleno",
    "Flan de Cafe",
    "Quesadilla de Maiz",
  ]) {
    assert.equal(byName.get(name).allergenSourceType, "unavailable", name);
    assert.deepEqual(byName.get(name).allergens, [], name);
  }
  assert.deepEqual(byName.get("Chile Relleno").inferredAllergenSignals.map((signal) => signal.id), ["egg", "milk"]);
  assert.deepEqual(byName.get("Quesadilla de Maiz").inferredAllergenSignals.map((signal) => signal.id), ["milk"]);
});

test("Amparo corrects known Ingredient Intelligence traps and Spanish seafood names", () => {
  assert.deepEqual(byName.get("Arrachera en Mole Coloradito").inferredAllergenSignals, []);
  assert.deepEqual(byName.get("Horchata").inferredAllergenSignals, []);
  assert.deepEqual(byName.get("Queso Frito").inferredAllergenSignals.map((signal) => signal.id), ["milk", "wheat", "gluten"]);
  for (const name of ["Lenguado Verde", "Pescadillas", "Cuello de Jurel"]) {
    assert.deepEqual(byName.get(name).inferredAllergenSignals.map((signal) => signal.id), ["fish"], name);
  }
  for (const name of ["Tostada de Callo de Hacha", "Jaiba Tacos"]) {
    assert.deepEqual(byName.get(name).inferredAllergenSignals.map((signal) => signal.id), ["shellfish"], name);
  }
});

test("Amparo quarantines the contradictory stale PDF and hidden sample menu", () => {
  assert.match(snapshot.sourceWarning, /older, visually contradictory six-course PDF/i);
  assert.match(snapshot.sourceWarning, /unlinked \/menu page/i);
  assert.match(snapshot.sourceWarning, /never promoted to official/i);
  assert.ok(!byName.has("Aguachile de Naranja"));
  assert.ok(!byName.has("Palmiitos con Chayote"));
  assert.ok(!byName.has("Halibut en Mole Coloradito"));
});

test("Amparo Toast parser preserves source names, stock state, prices, and descriptions", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("data/restaurant-verification/artifacts/amparo-fondita-dc/toast-current-menu-mirror.txt", "utf8")
  );
  const parsed = extractToastMirrorMenu(source);
  const queso = parsed.presentations.find((item) => item.name === "Queso Frito");
  assert.equal(queso.description, "anko-crusted, flash-fried oaxaca cheese curds, crema verde");
  assert.equal(queso.price, "$18.00");
  assert.equal(queso.outOfStock, true);
  assert.equal(parsed.presentations.find((item) => item.name === "Sagrado Corazón").price, "$17.00");
});

test("Amparo generated app rows exactly match the reviewed snapshot", () => {
  const repository = JSON.parse(readFileSync("src/data/generated/restaurants.generated.json", "utf8"));
  const generated = repository.restaurants.find((restaurant) => restaurant.id === "amparo-fondita-dc");
  assert.ok(generated);
  assert.deepEqual(generated.items.map(appFacing), snapshot.items.map(appFacing));
});

function appFacing(item) {
  return Object.fromEntries([
    "id",
    "name",
    "category",
    "description",
    "ingredientsText",
    "imageUrl",
    "isConfigurable",
    "allergenSourceType",
    "allergens",
    "mayContain",
    "sourceType",
    "sourceUrls",
    "sourceSummary",
    "evidence",
    "extractedIngredientMentions",
    "inferredIngredients",
    "inferredAllergenSignals",
    "inferenceQuestions",
    "inferenceSummary",
    "inferenceVersion",
  ].map((key) => [
    key,
    ["allergens", "mayContain"].includes(key) ? [...(item[key] ?? [])].sort() : item[key],
  ]));
}
