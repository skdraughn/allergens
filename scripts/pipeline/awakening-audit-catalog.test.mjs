import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAwakeningAuditSnapshot } from "./awakening-audit-catalog.mjs";

const snapshot = await buildAwakeningAuditSnapshot({
  retrievedAt: "2026-07-15T17:39:59.033Z",
});
const item = (id) => snapshot.items.find((candidate) => candidate.id === id);

test("rebuilds every current Awakening menu presentation", async () => {
  assert.equal(snapshot.rawCardCount, 51);
  assert.equal(snapshot.excludedPromotionCount, 1);
  assert.equal(snapshot.itemCount, 50);
  assert.equal(new Set(snapshot.items.map((candidate) => candidate.id)).size, 50);
  assert.equal(snapshot.ingredientSignalCount, 31);
  assert.equal(snapshot.unavailableAllergenCount, 19);
  assert.equal(snapshot.items.at(-2).name, "Select Draft Beers");
  assert.equal(snapshot.items.at(-1).name, "House Mixed Drinks");

  const captured = await readFile(
    "data/restaurant-verification/artifacts/replacement-awakening-bar-and-grill-washington-dc/official-food-menu-current.html",
  );
  assert.equal(
    createHash("sha256").update(captured).digest("hex"),
    "c349af839932075804471e5c8b90cd8ea6ba4ffff5dfe204cd4aa154dfbecb0a",
  );
});

test("preserves service-specific products without promoting formulation assumptions", () => {
  assert.equal(item("chicken-waffles").category, "Mains");
  assert.deepEqual(item("chicken-waffles").allergens, ["milk"]);
  assert.equal(item("chicken-waffles-brunch").category, "Brunch");
  assert.equal(item("chicken-waffles-brunch").sourceItemId, "5469994");
  assert.deepEqual(item("chicken-waffles-brunch").allergens, []);
  assert.equal(item("crispy-green-beans-happy-hour").category, "Happy Hour");
  assert.deepEqual(item("crispy-green-beans-happy-hour").allergens, []);
  assert.equal(item("candied-bacon-deviled-eggs-happy-hour").category, "Happy Hour");
  assert.deepEqual(item("candied-bacon-deviled-eggs-happy-hour").allergens, ["egg"]);
});

test("keeps explicit positives separate from unavailable and cross-contact evidence", () => {
  assert.deepEqual(item("crab-rolls").allergens, ["shellfish"]);
  assert.deepEqual(item("cream-of-crab-soup").allergens, ["milk", "shellfish"]);
  assert.deepEqual(item("blackened-salmon").allergens, ["fish"]);
  assert.deepEqual(item("candied-bacon-deviled-eggs").allergens, ["egg"]);
  assert.deepEqual(item("rasta-pasta").allergens, []);
  assert.deepEqual(item("bourbon-bread-pudding").allergens, []);
  assert.ok(snapshot.items.every((candidate) => candidate.mayContain.length === 0));
  assert.ok(snapshot.items.every((candidate) => !candidate.allergens.includes("wheat")));
  assert.ok(snapshot.items.every((candidate) => !candidate.allergens.includes("gluten")));
});

test("removes frozen website and description artifacts", () => {
  for (const removedId of [
    "we-are-hiring",
    "a-place-where-flavors-come-together-in-the-best-style",
    "book-your-next-party-with-us",
    "rich-bread-pudding-with-bourbon-glaze-whole-9in-pan",
    "start-your-next-adventure-with-us",
    "all-bar-bites-and-specialty-cocktails",
  ]) {
    assert.equal(item(removedId), undefined, removedId);
  }
  assert.equal(item("bourbon-bread-pudding").description, "Rich bread pudding with bourbon glaze • Whole 9in pan");
});
