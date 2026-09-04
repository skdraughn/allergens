import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repository = JSON.parse(fs.readFileSync("src/data/generated/restaurants.generated.json", "utf8"));

test("populated menus are never classified as accommodation-only shells", () => {
  const invalid = repository.restaurants.filter(
    (restaurant) =>
      (restaurant.items?.length ?? 0) > 0 &&
      (restaurant.sourceStatus?.accommodationOnly === true ||
        restaurant.parserProfile === "accommodation-policy-shell"),
  );
  assert.deepEqual(invalid.map(({ id }) => id), []);
});

test("Kyojin publishes one consolidated current identity with clean menu provenance", () => {
  const matches = repository.restaurants.filter((restaurant) => restaurant.domain === "kyojindc.com");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "kyojin-dc");
  assert.equal(matches[0].items.length, 75);
  assert.ok(matches[0].items.filter((item) => item.description).length >= 66);
  assert.equal(new Set(matches[0].items.map((item) => item.name.toLowerCase())).size, 75);
  assert.ok(matches[0].items.every((item) => item.allergenSourceType !== "restaurant_linked_vendor"));
  assert.ok(matches[0].items.every((item) => !/\s\d+(?:\.\d{1,2})?\s*(?:GF|\*{1,2})?$/i.test(item.name)));
});

test("canonically closed restaurants do not appear in the consumer projection", () => {
  assert.equal(repository.restaurants.some((restaurant) => restaurant.id === "cranes-dc"), false);
});
