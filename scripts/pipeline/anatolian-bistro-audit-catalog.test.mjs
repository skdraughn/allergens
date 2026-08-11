import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAnatolianBistroAuditSnapshot,
  parseAnatolianMenuPage,
  parseAnatolianOrderProductIds,
  sourceUrlsAnatolianBistro,
} from "./anatolian-bistro-audit-catalog.mjs";

const artifactRoot =
  "data/restaurant-verification/artifacts/osm-anatolian-bistro-6230019077";
const [lunchHtml, dinnerHtml, orderHtml] = await Promise.all([
  readFile(`${artifactRoot}/official-anatolian-lunch.html`, "utf8"),
  readFile(`${artifactRoot}/official-anatolian-dinner.html`, "utf8"),
  readFile(`${artifactRoot}/official-anatolian-order.html`, "utf8"),
]);

function item(snapshot, name, category) {
  const match = snapshot.items.find((row) => row.name === name && row.category === category);
  assert.ok(match, `Missing ${category}/${name}`);
  return match;
}

test("parses every current first-party lunch and dinner presentation", () => {
  const lunch = parseAnatolianMenuPage(lunchHtml, {
    mealPeriod: "Lunch",
    sourceUrl: sourceUrlsAnatolianBistro.lunch,
  });
  const dinner = parseAnatolianMenuPage(dinnerHtml, {
    mealPeriod: "Dinner",
    sourceUrl: sourceUrlsAnatolianBistro.dinner,
  });
  assert.equal(lunch.length, 77);
  assert.equal(dinner.length, 81);
  assert.equal(new Set([...lunch, ...dinner].map((row) => row.sourceItemId)).size, 105);
  assert.equal(parseAnatolianOrderProductIds(orderHtml).length, 100);
});

test("builds 105 unique products with beverages last and current availability retained", () => {
  const snapshot = buildAnatolianBistroAuditSnapshot({
    lunchHtml,
    dinnerHtml,
    orderHtml,
    retrievedAt: "2026-07-15T00:00:00.000Z",
  });
  assert.equal(snapshot.presentationCount, 158);
  assert.equal(snapshot.itemCount, 105);
  assert.equal(snapshot.categoryCount, 13);
  assert.equal(snapshot.orderPageCorroboratingItemCount, 100);
  assert.equal(new Set(snapshot.items.map((row) => row.id)).size, 105);
  assert.equal(snapshot.items.at(-1).category, "Beverages");
  assert.equal(snapshot.soldOutCount, 1);
  assert.equal(item(snapshot, "Kabak Tatlisi (GF)", "Desserts").isAvailable, false);
});

test("keeps direct positive signals separate from unsupported recipe inference", () => {
  const snapshot = buildAnatolianBistroAuditSnapshot({ lunchHtml, dinnerHtml, orderHtml });

  assert.deepEqual(item(snapshot, "Yayla Soup", "Soup & Salads").allergens, ["milk"]);
  assert.deepEqual(
    [...item(snapshot, "Anatolian Mixed Appetizer Plate For 1", "Appetizers").allergens].sort(),
    ["gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(item(snapshot, "Trio Meze Platter", "Appetizers").isConfigurable, true);
  assert.deepEqual(item(snapshot, "Trio Meze Platter", "Appetizers").allergens, []);
  assert.deepEqual(item(snapshot, "Mucver", "Hot Appetizers").allergens, []);
  assert.deepEqual(item(snapshot, "Falafel (GF)", "Hot Appetizers").allergens, ["sesame"]);

  assert.deepEqual(
    [...item(snapshot, "Doner Kebab", "Entrees (Dinner)").allergens].sort(),
    ["gluten", "wheat"],
  );
  assert.deepEqual(item(snapshot, "Lamb Chops (GF)", "Entrees (Dinner)").allergens, []);
  assert.deepEqual(item(snapshot, "Salmon (GF)", "Seafood (Dinner)").allergens, ["fish"]);
  assert.deepEqual(item(snapshot, "Shrimp Shish Kebap (GF)", "Seafood (Dinner)").allergens, ["shellfish"]);

  assert.deepEqual(
    [...item(snapshot, "Kabak Tatlisi (GF)", "Desserts").allergens].sort(),
    ["milk", "tree-nut"],
  );
  assert.ok(!item(snapshot, "Kabak Tatlisi (GF)", "Desserts").allergens.includes("sesame"));
  assert.deepEqual(item(snapshot, "Baklava", "Desserts").allergens, []);
  assert.deepEqual(item(snapshot, "Chocolate Soufflé", "Desserts").allergens, []);
  assert.deepEqual(item(snapshot, "American Coffee", "Beverages").allergens, []);
  assert.deepEqual(item(snapshot, "Ayran (Salty Yogurt Drink)", "Beverages").allergens, ["milk"]);
  assert.ok(snapshot.items.every((row) => row.mayContain.length === 0));
});
