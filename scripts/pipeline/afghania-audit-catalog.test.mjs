import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAfghaniaAuditSnapshot, parseAfghaniaMenuPage, sourceUrlsAfghania } from "./afghania-audit-catalog.mjs";

const restaurantId = "replacement-afghania-washington-dc";
const artifactRoot = `data/restaurant-verification/artifacts/${restaurantId}`;
const [dinnerHtml, rawMeatsHtml] = await Promise.all([
  readFile(`${artifactRoot}/official-dinner-menu.html`, "utf8"),
  readFile(`${artifactRoot}/official-raw-meats-menu.html`, "utf8"),
]);
const snapshot = buildAfghaniaAuditSnapshot({ dinnerHtml, rawMeatsHtml });
const get = (category, name) => snapshot.items.find((item) =>
  item.category === category && item.name === name
);

test("parses every current official section-level presentation", () => {
  assert.equal(parseAfghaniaMenuPage(dinnerHtml, {
    surface: "Dinner",
    sourceUrl: sourceUrlsAfghania.dinner,
  }).length, 94);
  assert.equal(parseAfghaniaMenuPage(rawMeatsHtml, {
    surface: "Raw Marinated Meats",
    sourceUrl: sourceUrlsAfghania.rawMeats,
  }).length, 9);
  assert.equal(snapshot.itemCount, 103);
  assert.equal(snapshot.categoryCount, 12);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 103);
});

test("keeps current Afghania presentations and removes sister-location contamination", () => {
  assert.equal(snapshot.items.some((item) => item.name === "Bistro Burger"), false);
  assert.equal(snapshot.items.some((item) => item.name === "Bistro Signature Kabob"), false);
  assert.ok(get("CHOPS AND KABOBS", "AFGHANIA BURGER"));
  assert.ok(get("QORMAS & ENTREES", "DOPIAZA"));
  assert.ok(get("RAW MARINATED MEATS", "Raw Salmon-1lb"));
});

test("keeps regular and vegan same-name presentations allergen-distinct", () => {
  assert.deepEqual(get("MAZZA (APPETIZERS)", "BAADENJAAN OR KADOO BOURANEE").allergens, ["milk"]);
  assert.deepEqual(get("VEGAN APPETIZERS", "BAADENJAAN OR KADOO BOURANEE").allergens, []);
  assert.deepEqual(get("DUMPLINGS", "LEEK & SCALLION DUMPLINGS (AUSHAK)").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("VEGAN APPETIZERS", "LEEK & SCALLION DUMPLINGS (AUSHAK)").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("QORMAS & ENTREES", "SABZI LAWAAN").allergens, ["milk"]);
  assert.deepEqual(get("VEGAN QORMAS (SLOW COOKED STEWS)", "SABZI LAWAAN").allergens, []);
});

test("does not turn an explicit non-dairy yogurt description into a milk signal", () => {
  const pumpkin = snapshot.items.find((item) =>
    item.category === "DUMPLINGS" && item.name === "PUMPKIN DUMPLINGS"
  );
  assert.ok(pumpkin);
  assert.equal(pumpkin.description.includes("non-dairy yogurt"), true);
  assert.equal(pumpkin.allergens.includes("milk"), false);
});

test("maps current fixed signals without eggplant or mustard-greens false positives", () => {
  assert.deepEqual(get("SOUP & SALADS", "AUSH").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("SOUP & SALADS", "AFGHANIA SALAD").allergens, ["tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("MAZZA (APPETIZERS)", "QUROTI").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("CHOPS AND KABOBS", "SALMON").allergens, ["fish"]);
  assert.deepEqual(get("RAW MARINATED MEATS", "Raw Salmon-1lb").allergens, ["fish"]);
  assert.ok(snapshot.items.every((item) => !item.allergens.includes("egg")));
  assert.ok(snapshot.items.every((item) => !item.allergens.includes("mustard")));
});

test("preserves fixed family-feast signals and gluten-free-label consistency", () => {
  assert.deepEqual(get("LIMITED TIME TO-GO SPECIALS", "Dinner for Two with Wine").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("LIMITED TIME TO-GO SPECIALS", "Family Feast (3-4 people)").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  const glutenFree = snapshot.items.filter((item) =>
    item.officialLabels.some((label) => /^gluten free$/i.test(label))
  );
  assert.ok(glutenFree.length > 0);
  assert.ok(glutenFree.every((item) =>
    !item.allergens.includes("wheat") && !item.allergens.includes("gluten")
  ));
});

test("places raw marinated meats at the end", () => {
  const firstRaw = snapshot.items.findIndex((item) => item.category === "RAW MARINATED MEATS");
  assert.ok(firstRaw > 0);
  assert.ok(snapshot.items.slice(firstRaw).every((item) => item.category === "RAW MARINATED MEATS"));
  assert.equal(snapshot.items.slice(firstRaw).length, 9);
});
