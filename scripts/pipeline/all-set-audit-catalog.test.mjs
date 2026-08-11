import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyMenuItemRow } from "../menu-item-quality.mjs";
import { buildAllSetAuditSnapshot } from "./all-set-audit-catalog.mjs";

const snapshot = buildAllSetAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
const item = (name) => snapshot.items.find((candidate) => candidate.name === name);

test("rebuilds the current All Set food and nonalcoholic catalog", async () => {
  assert.equal(snapshot.itemCount, 104);
  assert.equal(snapshot.presentationCount, 131);
  assert.equal(snapshot.categoryCount, 17);
  assert.equal(snapshot.ingredientSignalCount, 66);
  assert.equal(snapshot.unavailableAllergenCount, 38);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 104);
  assert.equal(item("½ LB Fried Shrimp").presentations.length, 3);
  assert.deepEqual(item("½ LB Fried Shrimp").aliases, ["½ Lb Gulf Shrimp"]);
  assert.equal(item("Maine Lobster Roll").presentations.length, 3);
  assert.equal(item("Slow Smoked Chicken Wings (7)").presentations.length, 2);

  for (const rejected of [
    "Blue Cheese & Ranch",
    "Extra Mussel Bread",
    "Extra Tempura Batter Fish Taco",
    "Make it a platter with French Fries &",
  ]) {
    assert.equal(item(rejected), undefined, rejected);
  }

  const expectedHashes = [
    ["latest.json", "2988eac86d41b45fb5e74f975744ce47abedbb0d1ce593dd4d87f8cd60c3a928"],
    ["official-menu-pdf-01.pdf", "8a243330fc9f69f6c8e6a9f198cdc3c370cb7546d122b0b8e8b8507815132a31"],
    ["official-menu-pdf-02.pdf", "f0ed1d54a86528af75630544970661ef638774da3a31001862a23d05b0122f16"],
    ["official-menu-pdf-03.pdf", "75a2140de80285b06ccf8733aeb4d71061c776b6f32b50c2a4db06d97306d67c"],
    ["official-menu-pdf-04.pdf", "50f1479838a0c9e23b91dfff849dadb60bd23995f431c878acf57c124555f80e"],
    ["official-menu-pdf-05.pdf", "336fb963b3e08c7428eb60313af62fcdecddc2cd451de7431edfea781c316cb0"],
    ["official-menu-pdf-06.pdf", "a11ee0d92f400bd677f73c35162991f91ddfb7846c32a87f10e291a917f58a4b"],
    ["official-menu-pdf-07.pdf", "35444830f6c9889dfa3b4a7f6306996c8aac857af9f6bcec3360a832f6715694"],
    ["official-menu-pdf-08.pdf", "674c5138c0addd6d23441f4d5535aaef29fc72e8df939d1454920fc0df9411d8"],
    ["official-menu-pdf-09.pdf", "480c6e3fe888c6e808a8f7e5fadd7a11485dfcaa488f9c26f54bc4d58ee30a3e"],
  ];
  for (const [name, hash] of expectedHashes) {
    const path = name === "latest.json"
      ? "data/scraped/launch-coverage/final-1200-portfolio-01/s3-sync/restaurant-data/restaurants/all-set-restaurant-and-bar-silver-spring-md-dc-metro/latest.json"
      : `data/restaurant-verification/artifacts/all-set-restaurant-and-bar-silver-spring-md-dc-metro/${name}`;
    const captured = await readFile(path);
    assert.equal(createHash("sha256").update(captured).digest("hex"), hash, name);
  }
});

test("uses only fixed, restaurant-published ingredient signals", () => {
  assert.deepEqual(item("Crab Cake").allergens, ["milk", "shellfish"]);
  assert.deepEqual(item("Crab Mac & Cheese").allergens, ["milk", "wheat", "gluten", "shellfish"]);
  assert.deepEqual(item("Crispy Skin Salmon").allergens, ["milk", "fish"]);
  assert.deepEqual(item("Maine Lobster Roll").allergens, ["milk", "wheat", "gluten", "shellfish"]);
  assert.deepEqual(item("Trout Crab Meunière").allergens, ["milk", "fish", "shellfish"]);
  assert.deepEqual(item("Wild Mushroom Pizza").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(item("Smashburger").allergens, ["milk", "wheat", "gluten"]);
});

test("does not promote optional choices or unexplained names into fixed claims", () => {
  assert.deepEqual(item("Old Bay Chicken Wings (7)").allergens, []);
  assert.deepEqual(item("Slow Smoked Chicken Wings (7)").allergens, []);
  assert.deepEqual(item("Perfect Hideout").allergens, []);
  assert.deepEqual(item("Soft Drinks").allergens, []);
  assert.equal(item("Old Bay Chicken Wings (7)").allergenSourceType, "unavailable");
  assert.equal(item("Soft Drinks").allergenSourceType, "unavailable");
});

test("preserves adjudicated nonalcoholic products through the quality classifier", () => {
  const rejected = snapshot.items.filter((candidate) => classifyMenuItemRow(candidate).kind !== "menu-item");
  assert.deepEqual(rejected.map((candidate) => candidate.name), []);
});
