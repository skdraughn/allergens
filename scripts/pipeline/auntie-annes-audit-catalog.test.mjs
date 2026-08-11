import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAuntieAnnesAuditSnapshot } from "./auntie-annes-audit-catalog.mjs";

const snapshot = await buildAuntieAnnesAuditSnapshot({
  retrievedAt: "2026-07-15T17:24:03.314Z",
});
const item = (id) => snapshot.items.find((candidate) => candidate.id === id);

test("pins the current Auntie Anne's U.S. guide and complete product catalog", async () => {
  assert.equal(snapshot.itemCount, 46);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 46);
  assert.equal(snapshot.itemNameFingerprint, "7f835a29c213a4b9c5b8e254e6dbc225f28c4801a1abc8c8d93a73bab43baaaa");
  assert.deepEqual(snapshot.sourceTypeCounts, {
    "official-allergen-menu": 39,
    "official-global-cross-contact-note": 7,
  });
  assert.equal(snapshot.sectionOrder.at(-1), "Fountain Drinks");
  const artifact = await readFile(
    "data/restaurant-verification/artifacts/auntie-annes/official-us-nutrition-guide-2025.pdf",
  );
  assert.equal(createHash("sha256").update(artifact).digest("hex"),
    "b97ecac61de57a815b711d16988f3c4fc7edd397d7dd6dbd2736d24ffbd16a02");
});

test("applies the exact global warning without inventing gluten", () => {
  const expected = ["egg", "fish", "milk", "peanut", "sesame", "shellfish", "soy", "tree-nut", "wheat"];
  assert.ok(snapshot.items.every((candidate) =>
    JSON.stringify(candidate.mayContain) === JSON.stringify(expected)
  ));
  assert.ok(snapshot.items.every((candidate) =>
    !candidate.allergens.includes("gluten") && !candidate.mayContain.includes("gluten")
  ));
});

test("preserves direct matrix semantics and current variants", () => {
  assert.deepEqual(item("sweet-almond-pretzel").allergens, ["milk", "soy", "tree-nut", "wheat"]);
  assert.equal(item("sweet-almond-pretzel").allergens.includes("peanut"), false);
  assert.deepEqual(item("honey-mustard").allergens, ["egg"]);
  assert.deepEqual(item("ranch").allergens, ["egg", "milk", "soy"]);
  assert.deepEqual(item("marinara").allergens, []);
  assert.deepEqual(item("sweet-glaze").allergens, []);
  assert.deepEqual(item("egg-and-cheese-sandwich").allergens, ["egg", "milk", "soy", "wheat"]);
  assert.ok(item("mini-pretzel-dogs"));
  assert.ok(item("pepperoni-nuggets"));
  assert.ok(item("blue-raspberry-spritz"));
  assert.ok(item("strawberry-banana-smoothie"));
});

test("keeps fountain nutrition rows global-note-only", () => {
  const fountain = snapshot.items.filter((candidate) => candidate.category === "Fountain Drinks");
  assert.equal(fountain.length, 7);
  assert.ok(fountain.every((candidate) => candidate.allergens.length === 0));
  assert.ok(fountain.every((candidate) =>
    candidate.allergenSourceType === "official-global-cross-contact-note"
  ));
  assert.deepEqual(fountain.map((candidate) => candidate.name), [
    "Coca-Cola",
    "Diet Coke",
    "Dr Pepper",
    "Fanta Orange",
    "Root Beer",
    "Sprite",
    "Cherry Coke",
  ]);
});
