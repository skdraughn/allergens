import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { build2FiftyAuditSnapshot } from "./2fifty-bbq-audit-catalog.mjs";

const toastMarkdown = await readFile(
  "data/restaurant-verification/artifacts/two-fifty-bbq-dc/third-party-toast-render-proxy.txt",
  "utf8",
);

test("builds the complete current DC Toast menu without merchandise", () => {
  const snapshot = build2FiftyAuditSnapshot({ toastMarkdown });
  const counts = Object.fromEntries(
    [...Map.groupBy(snapshot.items, (item) => item.category)].map(([category, items]) => [category, items.length]),
  );

  assert.equal(snapshot.itemCount, 74);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 74);
  assert.deepEqual(counts, {
    Meats: 12,
    Sides: 11,
    Sandwiches: 4,
    "Daily Special": 4,
    Desserts: 2,
    Catering: 8,
    "Chilled Meats": 6,
    Extras: 8,
    Drinks: 4,
    Alcohol: 15,
  });
  assert.equal(snapshot.items.at(-1).category, "Alcohol");
  assert.equal(snapshot.items.some((item) => /shirt|hoodie|knife|hat/i.test(item.name)), false);
});

test("uses the restaurant guide without inventing wheat or treating coconut as tree nut", () => {
  const snapshot = build2FiftyAuditSnapshot({ toastMarkdown });
  const item = (name) => snapshot.items.find((entry) => entry.name === name);

  assert.deepEqual(item("Prime Brisket").allergens, []);
  assert.equal(item("Prime Brisket").allergenSourceType, "unavailable");
  assert.deepEqual(item("Poblano Sausage Link").allergens, ["milk"]);
  assert.deepEqual(item("Corn bread").allergens, ["egg", "milk", "gluten"]);
  assert.deepEqual(item("Bun").allergens, ["egg", "milk", "soy", "gluten"]);
  assert.deepEqual(item("Chopped Beef Sandwich").allergens, ["egg", "milk", "soy", "gluten"]);
  assert.deepEqual(item("Rice & Beans").allergens, []);
  assert.equal(item("Rice & Beans").allergenSourceType, "official-ingredients");
  assert.deepEqual(item("Chimichurri Sauce").allergens, ["milk", "mustard", "tree-nut"]);
  assert.deepEqual(item("Tray of Esquites").allergens, ["egg", "milk", "gluten"]);
  assert.deepEqual(item("Azimut Cava Brut Nature").allergens, []);
  assert.equal(item("Azimut Cava Brut Nature").allergenSourceType, "unavailable");
  assert.deepEqual(item("Beef Rub").allergens, []);
  assert.equal(item("Beef Rub").allergenSourceType, "official-ingredients");
  assert.deepEqual(item("2 Brisket Tamales").allergens, []);
  assert.equal(snapshot.items.some((entry) => entry.allergens.includes("wheat")), false);
});
