import assert from "node:assert/strict";
import test from "node:test";

import { buildArthaRiniAuditSnapshot } from "./artha-rini-audit-catalog.mjs";

test("builds the exact current Artha Rini catalog from all hashed owner PDFs", async () => {
  const snapshot = await buildArthaRiniAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));

  assert.equal(snapshot.restaurantId, "osm-artha-rini-45808686");
  assert.equal(snapshot.itemCount, 160);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 160);
  assert.deepEqual(snapshot.sourceStats.map((source) => source.productCount), [75, 6, 5, 3, 12, 17, 2, 40]);
  assert.equal(snapshot.officialIngredientCount, 113);
  assert.equal(snapshot.globalCrossContactOnlyCount, 47);
  assert.deepEqual(snapshot.globalCrossContactAllergens, [
    "peanut", "tree-nut", "wheat", "gluten", "milk", "egg", "soy", "fish", "shellfish", "sesame",
  ]);
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 10));

  for (const id of [
    "pempek-kapal-selam-main", "rice-platter-padang-style-main", "liwetan-liwetan",
    "nasi-gudeg-gudeg", "rijsttafel-menu-a-rijsttafel", "steam-siomay-foodstall",
    "paket-nasi-bakar-ricebox", "tumpeng-with-7-selections-tumpeng",
    "kue-sus-chicken-ragout-jajanan",
  ]) assert.ok(byId.has(id), id);

  assert.deepEqual(byId.get("tilapia-saus-padang-main").allergens, ["fish", "shellfish"]);
  assert.deepEqual(byId.get("bihun-goreng-main").allergens, ["egg", "soy", "sesame"]);
  assert.deepEqual(byId.get("es-campur-main").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(byId.get("rempeyek-peyek-main").allergens, ["wheat", "gluten", "peanut", "fish", "shellfish"]);
  assert.deepEqual(byId.get("coconut-rice-main").allergens, []);
  assert.deepEqual(byId.get("emping-main").allergens, []);
  assert.equal(byId.get("tumpeng-with-5-selections-tumpeng").isConfigurable, true);

  const categories = snapshot.items.map((item) => item.category);
  assert.ok(categories.lastIndexOf("Main Menu · Beverages & Desserts") > categories.lastIndexOf("Main Menu · Sides & Crackers"));
});

