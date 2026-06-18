import assert from "node:assert/strict";
import test from "node:test";

import {
  addCoverageMetadata,
  applyCoverageGate,
  combinePreviousKnownGoodRepositories,
  validateRestaurantRepository,
} from "./coverage-gate.mjs";
import { brandAdapters } from "./restaurant-adapters.mjs";
import {
  buildRestaurantSearchIndexRows,
  compatibilitySummaryForRestaurant,
  searchTokensForRestaurant,
} from "./restaurant-search-index.mjs";
import { restaurantSources } from "./restaurant-sources.mjs";

test("defines one BrandAdapter for every configured restaurant", () => {
  assert.equal(brandAdapters.length, restaurantSources.length);
  assert.deepEqual(
    brandAdapters.map((adapter) => adapter.id).sort(),
    restaurantSources.map((source) => source.id).sort(),
  );
});

test("coverage gate publishes complete restaurants", () => {
  const generatedAt = "2026-06-03T08:17:00.000Z";
  const repository = {
    generatedAt,
    restaurants: [
      {
        id: "complete",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [{ name: "Item", allergens: [] }],
      },
    ],
    snapshotVersion: 1,
  };

  const gated = applyCoverageGate(repository);

  assert.equal(gated.manifest.published.length, 1);
  assert.equal(gated.repository.restaurants[0].coverageStatus, "complete");
});

test("coverage gate keeps previous complete chain when refresh is incomplete", () => {
  const previous = {
    restaurants: [
      {
        id: "chain",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [{ name: "Known Good", allergens: [] }],
        sourceUpdatedAt: "2026-06-02T08:17:00.000Z",
      },
    ],
  };
  const repository = {
    generatedAt: "2026-06-03T08:17:00.000Z",
    restaurants: [
      {
        id: "chain",
        coveragePercent: 50,
        coverageStatus: "blocked",
        items: [{ name: "Partial", allergens: [] }],
      },
    ],
    snapshotVersion: 1,
  };

  const gated = applyCoverageGate(repository, previous);

  assert.equal(gated.manifest.keptPrevious.length, 1);
  assert.equal(gated.repository.restaurants[0].coverageStatus, "kept-previous");
  assert.equal(gated.repository.restaurants[0].items[0].name, "Known Good");
});

test("coverage gate can seed previous known-good chains from bundled data", () => {
  const bundledSeed = {
    restaurants: [
      {
        id: "olive-garden",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [{ name: "Known Good Pasta", allergens: ["wheat"] }],
      },
    ],
  };
  const s3Previous = {
    restaurants: [
      {
        id: "olive-garden",
        coveragePercent: 0,
        coverageStatus: "blocked",
        items: [],
      },
    ],
  };
  const repository = {
    generatedAt: "2026-06-03T08:17:00.000Z",
    restaurants: [
      {
        id: "olive-garden",
        coveragePercent: 0,
        coverageStatus: "blocked",
        items: [],
      },
    ],
    snapshotVersion: 1,
  };

  const previous = combinePreviousKnownGoodRepositories(bundledSeed, s3Previous);
  const gated = applyCoverageGate(repository, previous);

  assert.equal(gated.manifest.keptPrevious.length, 1);
  assert.equal(gated.repository.restaurants[0].coverageStatus, "kept-previous");
  assert.equal(gated.repository.restaurants[0].items[0].name, "Known Good Pasta");
});

test("coverage metadata stores only the non-derived official item count", () => {
  const restaurant = addCoverageMetadata(
    {
      id: "chain",
      items: [
        { allergenSourceType: "official-allergen-menu" },
        { allergenSourceType: "unavailable" },
      ],
    },
    { id: "chain", minOfficialItemCount: 1 },
    "2026-06-03T08:17:00.000Z",
  );

  assert.deepEqual(restaurant.allergenDataStatus, { officialItemCount: 1 });
});

test("snapshot validator rejects missing snapshot version", () => {
  assert.equal(validateRestaurantRepository({ restaurants: [] }), false);
});

test("restaurant search tokens include aliases and normalized prefixes", () => {
  const tokens = searchTokensForRestaurant({
    category: "Burgers",
    id: "mcdonalds",
    name: "McDonald's",
  });

  assert.equal(tokens.includes("mcd"), true);
  assert.equal(tokens.includes("mcdonalds"), true);
  assert.equal(tokens.includes("mickey d"), true);
});

test("restaurant search index emits metadata, popularity, token, and geo rows", () => {
  const rows = buildRestaurantSearchIndexRows({
    generatedAt: "2026-06-18T08:17:00.000Z",
    restaurants: [
      {
        id: "local-test",
        items: [{ allergens: [], name: "Soup" }],
        lat: 35.2271,
        lng: -80.8431,
        name: "Local Test Cafe",
        rank: 42,
      },
    ],
  });

  assert.equal(rows.some((row) => row.pk === "META#local-test#national"), true);
  assert.equal(rows.some((row) => row.pk === "POPULAR#GLOBAL"), true);
  assert.equal(rows.some((row) => row.pk === "TOKEN#local"), true);
  assert.equal(rows.some((row) => String(row.pk).startsWith("GEO#")), true);
  assert.equal(rows.some((row) => String(row.pk).includes("SCAN")), false);
});

test("restaurant compatibility summary stores exact item indexes", () => {
  const summary = compatibilitySummaryForRestaurant({
    items: [
      { allergens: ["wheat", "milk"], name: "Mac" },
      { allergens: ["wheat"], mayContain: ["soy"], name: "Bread" },
      { allergenSourceType: "unavailable", allergens: [], name: "Mystery" },
    ],
  });

  assert.deepEqual(summary.directAllergenItemCounts.wheat, 2);
  assert.deepEqual(summary.directAllergenItemIndexes.wheat, [0, 1]);
  assert.deepEqual(summary.mayContainAllergenItemIndexes.soy, [1]);
  assert.deepEqual(summary.unavailableItemIndexes, [2]);
});
