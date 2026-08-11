import assert from "node:assert/strict";
import test from "node:test";

import { buildAhsoAuditSnapshot, sourceUrlsAhso } from "./ahso-audit-catalog.mjs";

const snapshot = buildAhsoAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });

test("uses the actual Ahso Restaurant surfaces and excludes Ahso Cellars", () => {
  assert.equal(snapshot.itemCount, 42);
  assert.equal(snapshot.presentationCount, 43);
  assert.equal(snapshot.categoryCount, 11);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 42);
  assert.ok(snapshot.sourceUrls.includes(sourceUrlsAhso.dinner));
  assert.ok(snapshot.sourceUrls.includes(sourceUrlsAhso.directOrder));
  assert.equal(snapshot.sourceUrls.some((url) => /ahso-cellars|#105/i.test(url)), false);
  assert.equal(snapshot.items.some((item) => ["Bread Board", "Fruit, Yogurt, & Granola", "Brunch Toast", "Steak Frites"].includes(item.name)), false);
});

test("preserves differing restaurant-issued and direct-order formulations", () => {
  const ribs = snapshot.items.filter((item) => item.name === "Crispy Pork Ribs");
  assert.equal(ribs.length, 2);
  assert.deepEqual(ribs.map((item) => item.allergens), [[], ["soy"]]);
  const charcuterie = snapshot.items.filter((item) => item.name === "Charcuterie and Cheese Board");
  assert.equal(charcuterie.length, 1);
  assert.equal(charcuterie[0].presentations.length, 2);
  assert.equal(charcuterie[0].sourceUrls.length, 2);
});

test("excludes standalone add-ons and alcohol while retaining recurring food menus", () => {
  assert.equal(snapshot.items.some((item) => /^Add (?:Shrimp|Braised Short Rib)/i.test(item.name)), false);
  assert.equal(snapshot.items.some((item) => ["Tokyo Nights", "Watermelon Marg"].includes(item.name)), false);
  assert.ok(snapshot.items.some((item) => item.name === "The O.G. Ramen" && item.category.includes("Mondays")));
  assert.ok(snapshot.items.some((item) => item.name === "Burger - Click to choose add ons!" && item.category.includes("Wednesdays")));
});

test("keeps positive signals source-bounded and general FAQ claims out", () => {
  assert.deepEqual(snapshot.items.find((item) => item.name === "Mediterranean Tomato & Red Pepper Dip").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Yellow Fin Tuna Tartare").allergens, ["fish", "egg"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Ricotta Gnocchi").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Fried Brussels Sprouts").allergens, []);
  assert.deepEqual(snapshot.items.find((item) => item.name === "Side Of Kimchi").allergens, []);
  assert.equal(snapshot.items.every((item) => item.mayContain.length === 0), true);
});
