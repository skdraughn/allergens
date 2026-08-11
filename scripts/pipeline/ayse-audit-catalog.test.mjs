import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ayseSourceManifest, buildAyseAuditSnapshot } from "./ayse-audit-catalog.mjs";

test("AYŞE catalog pins current service boundary and source authority", async () => {
  const snapshot = await buildAyseAuditSnapshot({ retrievedAt: "test" });
  assert.equal(snapshot.itemCount, 151);
  assert.equal(snapshot.officialIngredientCount, 109);
  assert.equal(snapshot.linkedPositiveCount, 4);
  assert.equal(snapshot.linkedIngredientCount, 1);
  assert.equal(snapshot.unavailableAllergenCount, 37);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 151);
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  assert.deepEqual(byId.get("fried-green-tomatoes").allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(byId.get("baklava").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.equal(byId.get("baklava").allergenSourceType, "restaurant-linked-product-allergen-section");
  assert.equal(byId.get("strawberry-sundae").allergenSourceType, "restaurant-linked-menu-ingredients");
  assert.deepEqual(byId.get("kids-cheese-pizza").sourceUrls, ["https://aysemeze.com/wp-content/uploads/2026/03/KIDS-MENU.pdf"]);
  assert.deepEqual(byId.get("side-ayse-aioli").sourceUrls, ["https://order.toasttab.com/online/ayse"]);
  assert.deepEqual(byId.get("todays-lunch-feature").allergens, []);
  assert.equal(byId.get("todays-lunch-feature").isConfigurable, true);
  assert.ok(!byId.has("crabcake-fritters"));
  assert.ok(!byId.has("new-york-strip-steak"));
  assert.ok(!byId.has("salad-add-ons-chicken-dollar7-gulf-shrimp-dollar11-faroe-islands-salmon-dollar16-white-anchovies"));
});

test("AYŞE captured owner PDFs remain hash pinned", async () => {
  for (const [file, expected] of [
    ["data/restaurant-verification/artifacts/osm-ay-e-meze-lounge-13134929927/official-main-menu-current.pdf", ayseSourceManifest.main],
    ["data/restaurant-verification/artifacts/osm-ay-e-meze-lounge-13134929927/official-kids-menu-current.pdf", ayseSourceManifest.kids],
  ]) {
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), expected);
  }
});
