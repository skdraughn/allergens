import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAmelieDcAuditSnapshot,
  restaurantIdAmelieDc,
  sourceUrlsAmelieDc,
} from "./amelie-dc-audit-catalog.mjs";

const snapshot = await buildAmelieDcAuditSnapshot({ retrievedAt: "2026-07-15T02:15:00.000Z" });
const byName = new Map(snapshot.items.map((item) => [item.name, item]));

test("Amélie snapshot covers every current food presentation", () => {
  assert.equal(snapshot.restaurantId, restaurantIdAmelieDc);
  assert.equal(snapshot.itemCount, 43);
  assert.equal(snapshot.presentationCount, 99);
  assert.equal(snapshot.categoryCount, 7);
  assert.equal(snapshot.officialIngredientCount + snapshot.unavailableAllergenCount, 43);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 43);
  assert.match(snapshot.sourceWarning, /99 food presentations/i);
});

test("Amélie excludes alcohol-only menu sections but keeps food bundles consolidated", () => {
  assert.ok(!snapshot.items.some((item) => /martini|old fashioned|sangria|negroni|wine of the day|armagnac|calvados|campari/i.test(item.name)));
  assert.equal(byName.get("Amélie Burger").presentations.length, 5);
  assert.equal(byName.get("Moules-Frites").presentations.length, 5);
  assert.ok(byName.get("Amélie Burger").sourceUrls.includes(sourceUrlsAmelieDc.happyHour));
});

test("Amélie consolidates duplicate surface spelling and pricing variants", () => {
  assert.ok(!byName.has("Amélie Burger (+5)"));
  assert.ok(!byName.has("Cheeseburger"));
  assert.ok(!byName.has("Burratta"));
  assert.ok(!byName.has("Salade Niçoise (+8)"));
  assert.ok(!byName.has("Truffle Fries Truffle Oil, parmesan cheese"));
  assert.equal(byName.get("Burrata").presentations.length, 3);
});

test("Amélie restores direct allergens missed by the frozen extraction", () => {
  assert.deepEqual(byName.get("Baked Camembert").allergens, ["milk"]);
  assert.deepEqual(byName.get("Salade Amélie").allergens, ["milk"]);
  assert.deepEqual(byName.get("Maryland Seared Monkfish").allergens, ["fish"]);
  assert.deepEqual(byName.get("Parisian Omelette").allergens, ["milk", "egg"]);
  assert.deepEqual(byName.get("Moules-Frites").allergens, ["milk", "shellfish", "sulfites"]);
});

test("Amélie avoids unsupported contains and cross-contact claims", () => {
  assert.deepEqual(byName.get("Grilled Octopus").allergens, ["shellfish"]);
  assert.ok(!byName.get("Grilled Octopus").allergens.includes("milk"));
  assert.equal(byName.get("Roasted Cauliflower").allergenSourceType, "unavailable");
  assert.deepEqual(byName.get("Roasted Cauliflower").allergens, []);
  assert.ok(snapshot.items.every((item) => item.mayContain.length === 0));
  assert.match(snapshot.sourceWarning, /alert a server is not/i);
});

test("Amélie captures current menu replacements", () => {
  assert.ok(byName.has("Maryland Seared Monkfish"));
  assert.ok(byName.has("Roasted Lemon Chicken"));
  assert.ok(!byName.has("Maryland Rockfish"));
  assert.ok(!byName.has("Local Roasted Chicken"));
});
