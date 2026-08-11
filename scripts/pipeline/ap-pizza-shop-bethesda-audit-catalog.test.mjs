import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildApPizzaShopBethesdaAuditSnapshot,
  directAllergensApPizzaShopBethesda,
} from "./ap-pizza-shop-bethesda-audit-catalog.mjs";

const artifact = new URL(
  "../../data/restaurant-verification/artifacts/ap-pizza-shop-bethesda-dc-metro/third-party-jina-toast-transport.txt",
  import.meta.url,
);

test("builds AP Pizza Shop's complete current lunch/dinner union", async () => {
  const snapshot = buildApPizzaShopBethesdaAuditSnapshot({
    markdown: await readFile(artifact, "utf8"),
    retrievedAt: "2026-07-15T07:26:50.728Z",
  });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.equal(snapshot.lunchItemCount, 46);
  assert.equal(snapshot.dinnerItemCount, 35);
  assert.equal(snapshot.dinnerOnlyItemCount, 3);
  assert.equal(snapshot.itemCount, 49);
  assert.equal(snapshot.categoryCount, 7);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 49);
  assert.ok(byName.has("Garlic 'Knots'"));
  assert.ok(byName.has("Calabrese Slice"));
  assert.ok(byName.has("18\" Calabrese"));
  assert.deepEqual(byName.get("18\" Calabrese").allergens, ["milk", "wheat", "gluten"]);
  assert.ok(byName.has("Duke #7"));
  assert.ok(byName.has("Pizza Kit"));
  assert.ok(byName.has("Pizza Dough"));
  assert.ok(!byName.has("Il Supremo"));
  assert.ok(!byName.has("Supremo Slice"));
  assert.ok(snapshot.items.every((item) => !item.sourceUrls.some((url) => /r\.jina\.ai/.test(url))));
});

test("maps direct AP Pizza Shop signals, including neonata as fish", () => {
  assert.deepEqual(
    directAllergensApPizzaShopBethesda("Pizza The Tripper tomato mozz ricotta meatball neonata").sort(),
    ["fish", "gluten", "milk", "wheat"],
  );
  assert.deepEqual(
    directAllergensApPizzaShopBethesda("Fossette Focacceria Mortazza stracciatella pistachio crema").sort(),
    ["gluten", "milk", "tree-nut", "wheat"],
  );
  assert.deepEqual(
    directAllergensApPizzaShopBethesda("Snacks AP Caesar Parmesan breadcrumbs anchovy dressing").sort(),
    ["fish", "gluten", "milk", "wheat"],
  );
  assert.deepEqual(directAllergensApPizzaShopBethesda("House-made Giardiniera vegetables"), []);
});
