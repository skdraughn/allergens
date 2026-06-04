import assert from "node:assert/strict";
import test from "node:test";

import { applyCoverageGate, validateRestaurantRepository } from "./coverage-gate.mjs";
import { brandAdapters } from "./restaurant-adapters.mjs";
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

test("snapshot validator rejects missing snapshot version", () => {
  assert.equal(validateRestaurantRepository({ restaurants: [] }), false);
});
