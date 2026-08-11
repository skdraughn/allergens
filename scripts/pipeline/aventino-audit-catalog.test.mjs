import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAventinoAuditSnapshot } from "./aventino-audit-catalog.mjs";

const snapshot = await buildAventinoAuditSnapshot({
  retrievedAt: "2026-07-15T17:49:24.697Z",
});
const item = (id) => snapshot.items.find((candidate) => candidate.id === id);

test("pins the current 52-formulation Aventino catalog", async () => {
  assert.equal(snapshot.itemCount, 52);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 52);
  assert.equal(snapshot.officialIngredientCount, 27);
  assert.equal(snapshot.linkedPositiveCount, 12);
  assert.equal(snapshot.positiveDisclosureCount, 39);
  assert.equal(snapshot.unavailableAllergenCount, 13);
  assert.ok(snapshot.items.every((candidate) => candidate.mayContain.length === 0));

  const captured = await readFile(
    "data/restaurant-verification/artifacts/aventino-bethesda/official-menus-current.html",
  );
  assert.equal(
    createHash("sha256").update(captured).digest("hex"),
    "214ec4d2dc2b5e00833fc140c40cf53b16719461d5d25ec6561d0de772e4262f",
  );
});

test("preserves materially different service and linked formulations", () => {
  assert.deepEqual(item("rigatoni")?.allergens, ["milk"]);
  assert.deepEqual(item("rigatoni-carbonara")?.allergens, ["milk", "egg", "wheat", "gluten"]);
  assert.deepEqual(item("prosciutto")?.allergens, ["milk"]);
  assert.deepEqual(item("prosciutto-antipasti")?.allergens, []);
  assert.deepEqual(item("prosciutto-panino")?.allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.equal(item("prosciutto-panino")?.presentations.length, 2);
  assert.deepEqual(item("aventino-burger")?.allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("aventino-burger-happy-hour")?.allergens, ["milk"]);
  assert.deepEqual(item("pesce-secondi")?.allergens, ["fish"]);
  assert.deepEqual(item("pesce-pranzo")?.allergens, ["fish"]);
  assert.deepEqual(item("pesce-online-ordering")?.allergens, ["milk", "tree-nut", "fish"]);
  assert.equal(
    item("pesce-online-ordering")?.allergenSourceType,
    "restaurant-linked-product-allergen-section",
  );
});

test("corrects stale and unsupported frozen allergen outcomes", () => {
  assert.deepEqual(item("acciughe-e-burro")?.allergens, ["milk", "wheat", "gluten", "fish"]);
  assert.deepEqual(item("chocolate-nemesis")?.allergens, ["milk", "tree-nut"]);
  assert.deepEqual(item("chocolate-nemesis-cake")?.allergens, ["milk", "tree-nut"]);
  assert.deepEqual(item("angel-food-cake")?.allergens, ["milk"]);
  assert.deepEqual(item("mascarpone-cheesecake")?.allergens, ["milk", "tree-nut"]);
  assert.deepEqual(item("cookie-plate")?.allergens, []);
  assert.deepEqual(item("chocolate-chip-cookies")?.allergens, []);
  assert.deepEqual(item("sourdough-bread")?.allergens, []);
  assert.deepEqual(item("pappardelle")?.allergens, ["mustard"]);
  assert.deepEqual(item("milanese")?.allergens, ["milk", "egg", "wheat", "gluten", "fish"]);
});

test("excludes stale products, alcohol bleed, and non-dish links", () => {
  for (const removedId of [
    "asparagi",
    "carciofo",
    "rhubarb-coffee-cake",
    "bordiga-bianco",
    "carpano-antica",
    "cocchi-americano",
    "cocchi-dopo-teatro",
    "cocchi-torino",
    "montanaro-extra-dry",
    "punt",
    "aventino-pasta-club",
    "the-washington-posts-best-new-restaurants",
  ]) {
    assert.equal(item(removedId), undefined, removedId);
  }
  assert.equal(item("blueberry-coffee-cake")?.name, "Blueberry Coffee Cake");
  assert.ok(item("caprese"));
  assert.ok(item("fritto"));
  assert.ok(item("brasato"));
  assert.equal(item("pasta-al-zozzone")?.isConfigurable, true);
  assert.equal(item("pasta-al-zozzone")?.sourceType, "restaurant-issued-json-ld-menu");
  assert.deepEqual(item("pasta-al-zozzone")?.sourceUrls, [
    "https://aventinocucina.com/menus/",
  ]);
  assert.equal(item("pasta-al-zozzone")?.presentations.length, 1);
  assert.match(item("pasta-al-zozzone")?.variantGroup ?? "", /Happy Hour.*A\.S\.A\.P\. Hour/);
  assert.ok(item("pasta-al-zozzone")?.evidence.length > 0);
});
