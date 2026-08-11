import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAfghanBistroAuditSnapshot,
  parseAfghanBistroMenuPage,
  sourceUrlsAfghanBistro,
} from "./afghan-bistro-audit-catalog.mjs";

const restaurantId = "afghan-bistro-springfield-va-dc-metro";
const artifactRoot = `data/restaurant-verification/artifacts/${restaurantId}`;
const [lunchHtml, dinnerHtml, chutneysHtml, rawMeatsHtml] = await Promise.all([
  readFile(`${artifactRoot}/official-menu.html`, "utf8"),
  readFile(`${artifactRoot}/official-dinner-menu.html`, "utf8"),
  readFile(`${artifactRoot}/official-chutneys-menu.html`, "utf8"),
  readFile(`${artifactRoot}/official-raw-meats-menu.html`, "utf8"),
]);
const snapshot = buildAfghanBistroAuditSnapshot({
  lunchHtml,
  dinnerHtml,
  chutneysHtml,
  rawMeatsHtml,
});
const get = (name) => snapshot.items.find((item) => item.name === name);

test("parses all four current official menu surfaces", () => {
  assert.equal(parseAfghanBistroMenuPage(lunchHtml, {
    mealPeriod: "Lunch",
    sourceUrl: sourceUrlsAfghanBistro.lunch,
  }).length, 96);
  assert.equal(parseAfghanBistroMenuPage(dinnerHtml, {
    mealPeriod: "Dinner",
    sourceUrl: sourceUrlsAfghanBistro.dinner,
  }).length, 93);
  assert.equal(parseAfghanBistroMenuPage(chutneysHtml, {
    mealPeriod: "Chutneys",
    sourceUrl: sourceUrlsAfghanBistro.chutneys,
  }).length, 4);
  assert.equal(parseAfghanBistroMenuPage(rawMeatsHtml, {
    mealPeriod: "Raw Marinated Meats",
    sourceUrl: sourceUrlsAfghanBistro.rawMeats,
  }).length, 9);
});

test("builds 117 distinct products in the eleven real categories", () => {
  assert.equal(snapshot.presentationCount, 202);
  assert.equal(snapshot.itemCount, 117);
  assert.equal(snapshot.categoryCount, 11);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 117);
  assert.equal(snapshot.items.some((item) => item.name === "CHOPS AND KABOBS"), false);
  assert.equal(snapshot.items.some((item) => item.name === "SOUPS & SALADS"), false);
  assert.ok(get("Nakhoud & Mushroom Sabzi Lawaan"));
  assert.ok(get("Firni"));
  assert.ok(get("Raw Shoulder Chops-1lb"));
});

test("consolidates exact meal-period duplicates without hiding changed descriptions", () => {
  assert.deepEqual(get("Bistro Salad").mealPeriods, ["Lunch", "Dinner"]);
  assert.match(get("Kadoo Turnovers").description, /^Lunch: /);
  assert.match(get("Kadoo Turnovers").description, /Dinner: /);
  assert.equal(snapshot.items.filter((item) => item.name === "Kabob-E-Samarooq").length, 1);
});

test("maps fixed current ingredients and formats while excluding optional proteins", () => {
  assert.deepEqual(get("Bistro Salad").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.equal(get("Bistro Salad").allergens.includes("fish"), false);
  assert.deepEqual(get("Mixed Green Salad").allergens, ["wheat", "gluten"]);
  assert.equal(get("Mixed Green Salad").allergens.includes("fish"), false);
  assert.deepEqual(get("Mix Grill Mazza").allergens, ["milk", "fish"]);
  assert.deepEqual(get("Raw Salmon-1lb").allergens, ["fish"]);
  assert.deepEqual(get("Firni").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(get("Saffron Sheer Birinj").allergens, ["milk", "tree-nut"]);
  assert.deepEqual(get("Avocado, Cilantro, and Yogurt Chutney [16oz]").allergens, ["milk"]);
});

test("uses common cake flavor evidence and keeps optional flavor-specific nuts off the base", () => {
  assert.deepEqual(get("Cake").allergens, ["wheat", "gluten", "egg", "milk"]);
  assert.equal(get("Cake").allergens.includes("tree-nut"), false);
  assert.equal(get("Cake").isConfigurable, true);
});

test("does not contradict item-specific gluten-free labels", () => {
  const labeledGlutenFree = snapshot.items.filter((item) =>
    item.officialLabels.some((label) => /^gluten free$/i.test(label))
  );
  assert.ok(labeledGlutenFree.length > 0);
  assert.ok(labeledGlutenFree.every((item) =>
    !item.allergens.includes("wheat") && !item.allergens.includes("gluten")
  ));
});
