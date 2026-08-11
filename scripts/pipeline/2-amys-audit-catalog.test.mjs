import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildTwoAmysAuditSnapshot,
  extractTwoAmysBootstrap,
} from "./2-amys-audit-catalog.mjs";

const artifactRoot = "data/restaurant-verification/artifacts/2-amys-washington-dc-dc-metro";
const squareHtml = await readFile(`${artifactRoot}/linked-square-home.html`, "utf8");
const productPages = await Promise.all(
  Array.from({ length: 6 }, async (_value, index) => {
    const page = index + 1;
    const filename = page === 1
      ? "linked-square-products.json"
      : `linked-square-products-page-${page}.json`;
    return JSON.parse(await readFile(`${artifactRoot}/${filename}`, "utf8"));
  }),
);

test("uses current Square category links across the complete six-page catalog", () => {
  const bootstrap = extractTwoAmysBootstrap(squareHtml);
  const snapshot = buildTwoAmysAuditSnapshot({ squareHtml, productPages });

  assert.equal(productPages.reduce((count, page) => count + page.data.length, 0), 1104);
  assert.equal(Object.keys(bootstrap.commerceLinks.categories).length, 20);
  assert.equal(snapshot.itemCount, 64);
  assert.equal(new Set(snapshot.items.map((item) => item.productId)).size, 64);
  assert.ok(snapshot.items.every((item) => item.category !== "swag"));
  assert.ok(!snapshot.items.some((item) => /t-?shirt/i.test(item.name)));
});

test("restores real menu sections and places alcoholic beverages last", () => {
  const snapshot = buildTwoAmysAuditSnapshot({ squareHtml, productPages });
  const counts = Object.fromEntries(
    [...Map.groupBy(snapshot.items, (item) => item.category)].map(([category, items]) => [category, items.length]),
  );

  assert.deepEqual(counts, {
    "Small Plates": 5,
    "Wine Bar Food": 7,
    Salads: 4,
    Pizza: 12,
    "Stuffed Pizza": 3,
    Sides: 8,
    Desserts: 4,
    "Sparkling Wine": 2,
    "White Wine": 5,
    "Red Wine": 7,
    "Beer & Cider": 7,
  });
  assert.equal(snapshot.items.at(-1).category, "Beer & Cider");
});

test("keeps only explicit item-text allergen evidence", () => {
  const snapshot = buildTwoAmysAuditSnapshot({ squareHtml, productPages });
  const item = (name) => snapshot.items.find((entry) => entry.name === name);

  assert.deepEqual(item("Vongole 1.0").allergens, ["shellfish", "milk"]);
  assert.deepEqual(item("Little Gem").allergens, ["egg", "fish", "wheat", "gluten"]);
  assert.deepEqual(item("Bloomsday").allergens, ["milk"]);
  assert.deepEqual(item("Bloomsday").mayContain, ["tree-nut"]);
  assert.deepEqual(item("Pio Tosini 100g").allergens, ["wheat", "gluten"]);
  assert.deepEqual(item("Marinara").allergens, []);
  assert.deepEqual(item("NoAmys").allergens, []);
});
