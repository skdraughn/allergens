import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAmbassadorAuditSnapshot,
  restaurantIdAmbassador,
  sourceUrlsAmbassador,
} from "./ambassador-restaurant-audit-catalog.mjs";

const snapshot = buildAmbassadorAuditSnapshot({ retrievedAt: "2026-07-15T02:05:00.000Z" });
const byName = new Map(snapshot.items.map((item) => [item.name, item]));

test("Ambassador snapshot keeps only menu formulations", () => {
  assert.equal(snapshot.restaurantId, restaurantIdAmbassador);
  assert.equal(snapshot.itemCount, 26);
  assert.equal(snapshot.presentationCount, 27);
  assert.equal(snapshot.categoryCount, 5);
  assert.equal(snapshot.officialAllergenCount, 0);
  assert.equal(snapshot.unavailableAllergenCount, 26);
  assert.ok(!snapshot.items.some((item) => /call us|current listed hours|star|options|plan around|find us/i.test(item.name)));
});

test("Ambassador distinguishes first-party favorites from reviewed delivery rows", () => {
  assert.deepEqual(byName.get("Espresso").sourceUrls, [sourceUrlsAmbassador.officialMenu]);
  assert.ok(byName.get("Chicken").sourceUrls.includes(sourceUrlsAmbassador.officialMenu));
  assert.ok(byName.get("Chicken").sourceUrls.includes(sourceUrlsAmbassador.uberMenu));
  assert.match(byName.get("Jambo Fatta").sourceType, /reviewed-restaurant-linked/);
  assert.match(snapshot.sourceWarning, /closed May 5, 2026/i);
  assert.match(snapshot.sourceWarning, /never promoted/i);
});

test("Ambassador keeps ingredient signals non-official", () => {
  assert.ok(snapshot.items.every((item) => item.allergenSourceType === "unavailable"));
  assert.ok(snapshot.items.every((item) => item.allergens.length === 0));
  assert.deepEqual(byName.get("Fuul").inferredAllergenSignals.map((signal) => signal.id), ["milk"]);
  assert.deepEqual(byName.get("Egg Frittata").inferredAllergenSignals.map((signal) => signal.id), ["egg", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Fish").inferredAllergenSignals.map((signal) => signal.id), ["fish", "wheat", "gluten"]);
});

test("Ambassador does not misclassify barley as wheat", () => {
  const kitcha = byName.get("Kitcha Fitfit");
  assert.deepEqual(kitcha.inferredAllergenSignals.map((signal) => signal.id), ["milk", "gluten"]);
  assert.ok(!kitcha.inferredAllergenSignals.some((signal) => signal.id === "wheat"));
});

test("Ambassador preserves the corrupt Chicken Tibsi description as a source warning, not ingredients", () => {
  const chickenTibsi = byName.get("Chicken Tibsi");
  assert.match(chickenTibsi.description, /internally corrupted/i);
  assert.deepEqual(chickenTibsi.inferredAllergenSignals, []);
  assert.deepEqual(chickenTibsi.allergens, []);
});
