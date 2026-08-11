import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { arepaZoneLocationSources, buildArepaZoneCatalog } from "./arepa-zone-audit-catalog.mjs";

async function capturedSource() {
  const directory = new URL("../../data/restaurant-verification/artifacts/arepa-zone-dc/", import.meta.url);
  const productsByLocation = Object.fromEntries(await Promise.all(arepaZoneLocationSources.map(
    async ([locationName, , fileName]) => [locationName, JSON.parse(await readFile(new URL(fileName, directory), "utf8"))],
  )));
  const shopifyProducts = JSON.parse(await readFile(
    new URL("official-arepa-zone-shopify-products-api.json", directory),
    "utf8",
  ));
  return { productsByLocation, shopifyProducts };
}

test("builds the deduplicated current union of the three live DC menus", async () => {
  const snapshot = buildArepaZoneCatalog(await capturedSource(), { retrievedAt: "2026-07-15T09:41:45.995Z" });
  const names = new Set(snapshot.items.map((item) => item.name));

  assert.equal(snapshot.itemCount, 75);
  assert.equal(snapshot.categoryCount, 14);
  assert.deepEqual(snapshot.currentProductCountByLocation, {
    Mosaico: 47,
    "14th Street": 56,
    "Western Market": 52,
  });
  assert.equal(snapshot.locationLimitedProductCount, 47);
  assert.equal(new Set(snapshot.items.map((item) => item.sourceProductId)).size, 75);
  for (const present of [
    "Cruzado de Res y Pollo (Sopa)",
    "Sifrina Arepa",
    "Pabellón Bowl Beef",
    "Clásica Cachapa",
    "Tequeños de Queso",
    "Tostones Trio",
    "Ovomaltina",
  ]) assert.equal(names.has(present), true, present);
  for (const absent of ["Albina", "Camarón", "Golfeados", "Quesillo", "Yucca Fritters"]) {
    assert.equal(names.has(absent), false, absent);
  }
  assert.deepEqual(snapshot.items.find((item) => item.name === "Pepito Fondue").locationNames, ["Mosaico"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Sifrina Arepa").locationNames, ["Mosaico", "14th Street", "Western Market"]);
  assert.equal(
    snapshot.items.findIndex((item) => item.category === "Beverages") > snapshot.items.map((item) => item.category).lastIndexOf("Sides"),
    true,
  );
});

test("transcribes matrix dots and keeps the facility statement separate", async () => {
  const snapshot = buildArepaZoneCatalog(await capturedSource());
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.matrixPublishedRowCount, 71);
  assert.equal(snapshot.matrixMatchedCurrentProductCount, 34);
  assert.equal(snapshot.officialMatrixCount, 33);
  assert.equal(snapshot.globalContactOnlyCount, 1);
  assert.equal(snapshot.unavailableAllergenCount, 41);
  assert.equal(snapshot.matrixFacilityScopeCount, 34);
  assert.equal(snapshot.nonRedundantFacilityContactCount, 30);

  assert.deepEqual(byName.get("Tequeños de Queso").allergens, ["milk", "egg", "wheat", "soy", "gluten"]);
  assert.deepEqual(byName.get("Tequeños de Queso").mayContain, []);
  assert.deepEqual(byName.get("Pernil Arepa").allergens, ["milk", "fish", "soy"]);
  assert.deepEqual(byName.get("Pernil Arepa").mayContain, ["egg", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Carne Mechada Arepa").allergens, []);
  assert.deepEqual(byName.get("Carne Mechada Arepa").mayContain, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Pabellón Empanada").allergens, ["milk", "wheat", "soy", "gluten"]);
  assert.deepEqual(byName.get("Pabellón Empanada").mayContain, ["egg"]);
});

test("does not promote contradictory or linked-only metadata to fixed official claims", async () => {
  const snapshot = buildArepaZoneCatalog(await capturedSource());
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(byName.get("Viuda Arepa").allergenSourceType, "official-global-cross-contact-note");
  assert.deepEqual(byName.get("Viuda Arepa").allergens, []);
  assert.deepEqual(byName.get("Viuda Arepa").mayContain, ["milk", "egg", "wheat", "gluten"]);
  assert.match(byName.get("Viuda Arepa").sourceSummary, /contradictory/i);
  assert.equal(byName.get("Cruzado de Res y Pollo (Sopa)").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Cruzado de Res y Pollo (Sopa)").allergens, []);
  assert.match(byName.get("Cruzado de Res y Pollo (Sopa)").sourceSummary, /celery/i);
  assert.equal(byName.get("Tostones Trio").allergenSourceType, "unavailable");
});

test("fails closed when a captured DC location catalog changes size", async () => {
  const source = await capturedSource();
  source.productsByLocation.Mosaico.products.pop();
  assert.throws(() => buildArepaZoneCatalog(source), /Mosaico expected 47 current products/);
});
