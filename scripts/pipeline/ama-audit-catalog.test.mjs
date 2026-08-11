import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAmaAuditSnapshot } from "./ama-audit-catalog.mjs";

const restaurantId = "ama-dc";
const snapshot = await buildAmaAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds Ama's complete current food and nonalcoholic catalog", async () => {
  assert.equal(snapshot.itemCount, 84);
  assert.equal(snapshot.presentationCount, 100);
  assert.equal(snapshot.itemNameFingerprint, "4ebdb0c7e19bd68159f6eb9c891d664c9bc70b22524752e5d1f1d50f7d92aa3a");
  assert.equal(snapshot.categoryCount, 18);
  assert.equal(snapshot.ingredientSignalCount, 57);
  assert.equal(snapshot.unavailableAllergenCount, 27);

  const expectedHashes = [
    ["official-home.html", "040657ec82ae7dff2d3635af44f2acb2ae31196c6c7bd5d8db30bd7def149f8e"],
    ["official-caffe-menu.html", "8fee7184aac46b59d59a9825820f3e678711e124790183552904eeead89486cb"],
    ["official-lunch-dinner-menu.html", "40416c05ead768d48426050a51bf8db828ecdeed4a51a67963af2eeb6a90c16f"],
    ["official-brunch-menu.html", "dc2ef2bcc3be97707a710df8aa285e43a1c26c2dec28e854183bb9d459625e71"],
    ["official-aperitivo.html", "6452af170d63c364ca190c4bdad83916a771363da6572a12aa79f1f04bb558ba"],
    ["official-sitemap.xml", "e40ad625a750f1950efce260bcf6ee2661ed6b0519a96d3ba924cba3546b9fd6"],
    ["official-menu-sitemap.xml", "2d516a17117607ab0d259bb7ffc26b01bd42845c5f7c51e9a55b3631d23ad307"],
  ];
  for (const [name, hash] of expectedHashes) {
    const captured = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/${name}`);
    assert.equal(createHash("sha256").update(captured).digest("hex"), hash, name);
  }

  const home = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-home.html`, "utf8");
  assert.match(home, /885 New Jersey Ave SE, Washington, DC 20003/);
  for (const route of ["caffe-menu", "lunchanddinner", "ama-brunch", "aperitivo-hour"]) {
    assert.match(home, new RegExp(route));
  }
  const sitemap = await readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-menu-sitemap.xml`, "utf8");
  assert.match(sitemap, /menu\?menu=dinner-menu/);
  assert.match(sitemap, /menu\?menu=dolci-menu/);
  assert.match(sitemap, /menu\?menu=caff%C3%A9-menu/);
});

test("consolidates service presentations while preserving distinct formulations", () => {
  assert.equal(item("Farinata").presentations.length, 3);
  assert.equal(item("Fügassa").presentations.length, 3);
  assert.deepEqual(item("Fügassa").aliases, ["Focaccia Genovese"]);
  assert.equal(item("Insalata Verde").presentations.length, 2);
  assert.equal(item("Torta del Giorno").presentations.length, 2);
  assert.equal(item("Rösti (Lunch & Dinner)").presentations.length, 1);
  assert.equal(item("Rösti (Brunch)").presentations.length, 1);
  assert.equal(item("Bistecca (Lunch & Dinner)").presentations.length, 1);
  assert.equal(item("Bistecca (Brunch)").presentations.length, 1);
  assert.equal(item("Fügassa").isConfigurable, true);
  assert.equal(item("Ancient Grain Sourdough Crostini").isConfigurable, true);
  for (const excluded of ["Caffè Corretto", "Protein Add on", "Can Also be served on", "ZP Libations"]) {
    assert.equal(item(excluded), undefined, excluded);
  }
  for (const zeroProof of ["Ama Cola", "Lacto Fermented Lemon Ginger Ale", "Whey Lemonade", "Elderberry Gazzoza"]) {
    assert.ok(item(zeroProof), zeroProof);
  }
});

test("limits allergen claims to fixed first-party wording", () => {
  assert.deepEqual(item("Cioccolato Caldo").allergens, []);
  assert.equal(item("Cioccolato Caldo").allergenSourceType, "unavailable");
  assert.deepEqual(item("Autonomy Smart Matcha Latte").allergens, ["tree-nut"]);
  assert.deepEqual(item("Whey Lemonade").allergens, ["milk"]);
  assert.deepEqual(item("Fügassa").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Fior di Zucca").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(item("Paccheri con Sugo di Mare").allergens, ["wheat", "gluten", "fish", "shellfish"]);
  assert.deepEqual(item("Mondeghili Polpette").allergens, ["tree-nut"]);
  assert.deepEqual(item("Mortadella").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Vitello alla Milanese").allergens, []);
  assert.equal(item("Vitello alla Milanese").allergenSourceType, "unavailable");
  assert.deepEqual(item("Gelato").allergens, []);
});

test("preserves every adjudicated formulation through the shared quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
});

test("persists the verified snapshot and corrected Navy Yard identity", async () => {
  const repository = JSON.parse(await readFile("src/data/generated/restaurants.generated.json", "utf8"));
  const generated = repository.restaurants.find((candidate) => candidate.id === restaurantId);
  assert.ok(generated);
  assert.equal(generated.brandKey, "amarestaurant");
  assert.equal(generated.domain, "amarestaurant.bar");
  assert.equal(generated.locationId, "navy-yard-dc");
  assert.equal(generated.displayAddress, "885 New Jersey Ave SE, Washington, DC 20003");
  assert.equal(generated.guideUrl, "https://www.amarestaurant.bar/lunchanddinner");
  assert.equal(generated.items.length, snapshot.itemCount);
  assert.equal(generated.itemCount, snapshot.itemCount);
  assert.equal(generated.menuItemCount, snapshot.itemCount);
  assert.equal(generated.totalItemCount, snapshot.itemCount);
  const generatedByName = new Map(generated.items.map((candidate) => [candidate.name, candidate]));
  for (const expected of snapshot.items) {
    const actual = generatedByName.get(expected.name);
    assert.ok(actual, expected.name);
    assert.equal(actual.category, expected.category, expected.name);
    assert.equal(actual.allergenSourceType, expected.allergenSourceType, expected.name);
    assert.deepEqual([...actual.allergens].sort(), [...expected.allergens].sort(), expected.name);
    assert.deepEqual([...actual.mayContain].sort(), [...expected.mayContain].sort(), expected.name);
    assert.deepEqual(actual.sourceUrls, expected.sourceUrls, expected.name);
    assert.equal(actual.isConfigurable, expected.isConfigurable, expected.name);
  }
});
