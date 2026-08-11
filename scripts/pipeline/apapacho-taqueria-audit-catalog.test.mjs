import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildApapachoTaqueriaAuditSnapshot,
  directAllergensApapachoTaqueria,
  extractApapachoSquareBootstrap,
} from "./apapacho-taqueria-audit-catalog.mjs";

const artifactRoot =
  "data/restaurant-verification/artifacts/replacement-apapacho-taqueria-washington-dc";
const [orderHtml, productsResponse, pdfText] = await Promise.all([
  readFile(`${artifactRoot}/official-apapacho-order-page.html`, "utf8"),
  readFile(`${artifactRoot}/official-apapacho-square-products.json`, "utf8").then(JSON.parse),
  readFile(`${artifactRoot}/official-apapacho-winter-specials-pdf.txt`, "utf8"),
]);

test("rebuilds Apapacho from the current PDF plus live Square category additions", () => {
  const bootstrap = extractApapachoSquareBootstrap(orderHtml);
  const snapshot = buildApapachoTaqueriaAuditSnapshot({
    orderHtml,
    productsResponse,
    pdfText,
  });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(productsResponse.data.length, 80);
  assert.equal(Object.keys(bootstrap.commerceLinks.categories).length, 14);
  assert.equal(snapshot.itemCount, 40);
  assert.equal(snapshot.categoryCount, 7);
  assert.equal(snapshot.pdfOnlyItemCount, 1);
  assert.equal(snapshot.apiOnlyCurrentItemCount, 6);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 40);
  assert.equal(snapshot.items.at(-1).category, "Non-Alcoholic Drinks");
  assert.ok(byName.has("Chilaquiles"));
  assert.ok(byName.has("Grilled Chicken Taco"));
  assert.ok(byName.has("Choripapa Taco"));
  assert.ok(byName.has("Seasonal Popsicle"));
});

test("rejects expired inventory, events, service controls, alcohol, and duplicate promotions", () => {
  const snapshot = buildApapachoTaqueriaAuditSnapshot({
    orderHtml,
    productsResponse,
    pdfText,
  });
  const names = new Set(snapshot.items.map((item) => item.name));

  for (const rejectedName of [
    "Conchas St Valentines",
    "Dia de Muertos Brunch",
    "Pan de Muerto",
    "Rosca de Reyes",
    "8 course Tasting Dinner - Las Quince Letras X Apapacho",
    "Tamal",
    "Tamaliza ( Pack of 5 tamales)",
    "PREPARE BEFORE I ARRIVE",
    "To go Modelo",
    "Cubetazo Tecate /Modelo",
    "Milanesa HH",
  ]) {
    assert.ok(!names.has(rejectedName), rejectedName);
  }
  assert.equal(snapshot.excludedHistoricalInventoryCount, 41);
});

test("maps only fixed positive signals and handles the two frozen false positives", () => {
  const snapshot = buildApapachoTaqueriaAuditSnapshot({
    orderHtml,
    productsResponse,
    pdfText,
  });
  const item = (name) => snapshot.items.find((entry) => entry.name === name);

  assert.deepEqual(item("Tacos de Mushrooms").allergens, []);
  assert.deepEqual(item("Fried Corn Quesadilla").allergens, ["milk"]);
  assert.deepEqual(item("Kids Quesadilla").allergens.sort(), ["gluten", "milk", "wheat"]);
  assert.deepEqual(item("Chicken Milanesa").allergens.sort(), ["egg", "gluten", "wheat"]);
  assert.deepEqual(
    item("Tacos de Baja Shrimp").allergens.sort(),
    ["egg", "gluten", "shellfish", "wheat"],
  );
  assert.deepEqual(item("Arroz con Leche").allergens, ["milk"]);
  assert.deepEqual(item("Chilaquiles").allergens, ["milk"]);
  assert.deepEqual(item("Oaxacan Chocolate Cookie").allergens, []);
  assert.deepEqual(directAllergensApapachoTaqueria("fried oyster mushrooms"), []);
  assert.deepEqual(
    directAllergensApapachoTaqueria("corn masa, Chihuahua cheese, queso fresco, crema"),
    ["milk"],
  );
});
