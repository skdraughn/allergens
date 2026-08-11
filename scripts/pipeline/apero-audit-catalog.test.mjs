import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildAperoAuditSnapshot,
  restaurantIdApero,
} from "./apero-audit-catalog.mjs";

const artifactRoot = path.resolve(`data/restaurant-verification/artifacts/${restaurantIdApero}`);

async function inputs() {
  const [homeHtml, brunchText, lunchText, dinnerText, caviarHourText, toastText, nutellaText] =
    await Promise.all([
      readFile(path.join(artifactRoot, "official-apero-home.html"), "utf8"),
      readFile(path.join(artifactRoot, "official-apero-brunch-june-2026.txt"), "utf8"),
      readFile(path.join(artifactRoot, "official-apero-lunch-june-2026.txt"), "utf8"),
      readFile(path.join(artifactRoot, "official-apero-dinner-june-2026.txt"), "utf8"),
      readFile(path.join(artifactRoot, "official-apero-caviar-hour.txt"), "utf8"),
      readFile(path.join(artifactRoot, "apero-toast-readable-proxy.txt"), "utf8"),
      readFile(path.join(artifactRoot, "nutella-official-product-label.html"), "utf8"),
    ]);
  return { homeHtml, brunchText, lunchText, dinnerText, caviarHourText, toastText, nutellaText };
}

test("builds the reviewed 53-item Apéro catalog from current captured sources", async () => {
  const snapshot = buildAperoAuditSnapshot(await inputs());
  assert.equal(snapshot.itemCount, 53);
  assert.equal(snapshot.categoryCount, 7);
  assert.equal(snapshot.caviarSelectionCount, 15);
  assert.equal(snapshot.officialIngredientCount, 49);
  assert.equal(snapshot.unavailableAllergenCount, 4);
  assert.equal(new Set(snapshot.items.map((entry) => entry.id)).size, 53);
  assert.deepEqual(
    [...new Set(snapshot.items.map((entry) => entry.category))],
    [
      "Caviar Selections",
      "Small Plates",
      "Soups & Salads",
      "Large Plates",
      "Desserts",
      "Brunch Features",
      "Caviar Hour",
    ],
  );
});

test("does not retain headings, price fragments, alcohol, merchandise, or POS controls", async () => {
  const snapshot = buildAperoAuditSnapshot(await inputs());
  const names = new Set(snapshot.items.map((entry) => entry.name));
  for (const excluded of [
    "10g $82 /",
    "Beluga Hybrid",
    "Osetra",
    "Siberian Sturgeon",
    "White Sturgeon",
    "Absinthe Service",
    "Insulated Caviar To-Go Bag",
    "Mother of Pearl Caviar spoons (set of 2)",
    "Side One Over Easy Egg",
    "Side Salad",
    "Side Toast",
  ]) {
    assert.equal(names.has(excluded), false, excluded);
  }
});

test("keeps caviar selections distinct and limits them to supported fish and milk signals", async () => {
  const snapshot = buildAperoAuditSnapshot(await inputs());
  const caviar = snapshot.items.filter((entry) => entry.category === "Caviar Selections");
  assert.equal(caviar.length, 15);
  assert.equal(caviar.every((entry) => entry.isConfigurable), true);
  assert.equal(caviar.every((entry) => sameSet(entry.allergens, ["fish", "milk"])), true);
  assert.equal(caviar.some((entry) => entry.name === "Osetra — Lyna Polska Classic"), true);
  assert.equal(caviar.some((entry) => entry.name === "Siberian Sturgeon — Lyna Polska Classic"), true);
  assert.equal(caviar.some((entry) => entry.name === "Beluga Hybrid — Beluga-Bester"), true);
});

test("corrects reviewed allergen semantics without inventing negative assurances", async () => {
  const snapshot = buildAperoAuditSnapshot(await inputs());
  const byName = new Map(snapshot.items.map((entry) => [entry.name, entry]));
  assert.deepEqual(byName.get("Fresh Fruit and Yogurt Parfait").allergens, ["milk"]);
  assert.deepEqual(byName.get("Steamed PEI Mussels").allergens, ["shellfish"]);
  assert.equal(byName.get("Escargot Tartine").allergens.includes("shellfish"), true);
  assert.equal(byName.get("Escargot Tartine").allergens.includes("wheat"), true);
  assert.deepEqual(byName.get("Apéro Burger").allergens, ["milk", "mustard"]);
  assert.equal(byName.get("Potato Chips").allergens.includes("soy"), true);
  assert.equal(byName.get("Smoked Salmon Tartine").allergens.includes("milk"), true);
  assert.equal(byName.get("Pan Seared Scallops").allergens.includes("milk"), true);
  assert.equal(byName.get("Petit-Déjeuner Français").sourceType.includes("ingredient-intelligence"), true);
  assert.equal(byName.get("Petit-Déjeuner Français").sourceUrls.some((url) => /nutella\.com/.test(url)), true);
  assert.equal(snapshot.items.every((entry) => entry.mayContain.length === 0), true);
});

test("fails closed when a reviewed source anchor or manufacturer label disappears", async () => {
  const current = await inputs();
  assert.throws(
    () => buildAperoAuditSnapshot({ ...current, dinnerText: current.dinnerText.replace("Braised Rabbit Leg", "") }),
    /Braised Rabbit Leg/,
  );
  assert.throws(
    () => buildAperoAuditSnapshot({ ...current, nutellaText: "" }),
    /Nutella manufacturer label changed/,
  );
});

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
