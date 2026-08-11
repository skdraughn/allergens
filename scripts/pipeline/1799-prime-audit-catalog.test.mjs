import assert from "node:assert/strict";
import test from "node:test";

import { build1799PrimeAuditSnapshot } from "./1799-prime-audit-catalog.mjs";

test("1799 Prime catalog preserves current menu rows and GF cross-contact semantics", () => {
  const snapshot = build1799PrimeAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.itemCount, 86);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 86);
  assert.deepEqual(byName.get("Blackened Whiskey Shrimp").allergens, [
    "shellfish", "milk", "mustard", "wheat", "gluten",
  ]);
  assert.deepEqual(byName.get("Shrimp Ceviche (GF)").allergens, ["shellfish"]);
  assert.deepEqual(byName.get("Shrimp Ceviche (GF)").mayContain, ["gluten"]);
  assert.deepEqual(byName.get("Chicken Scarpariello (GF)").allergens, []);
  assert.equal(
    byName.get("Chicken Scarpariello (GF)").allergenSourceType,
    "official-global-cross-contact-note",
  );
  assert.deepEqual(byName.get("Soup Du Jour").allergens, []);
  assert.deepEqual(byName.get("Featured Entree").allergens, []);
  assert.deepEqual(byName.get("Soft Shell Crab"), undefined);
  assert.deepEqual(byName.get("Fish & Chips").allergens, ["egg", "fish", "wheat", "gluten"]);
  assert.deepEqual(byName.get("Prime French Dip Sandwich").allergens, [
    "milk", "egg", "wheat", "gluten",
  ]);
  assert.deepEqual(byName.get("Crab & Oyster Rockefeller").allergens, [
    "shellfish", "milk", "wheat", "gluten",
  ]);
  assert.equal(snapshot.items.at(-1).category, "Beverages · Coffee");
});
