import assert from "node:assert/strict";
import test from "node:test";

import { buildVersionedRestaurantCatalog } from "./versioned-restaurant-catalog.mjs";

test("builds a deterministic immutable catalog with versioned detail paths", () => {
  const repository = {
    generatedAt: "2026-08-15T00:00:00.000Z",
    snapshotVersion: 1,
    restaurants: [
      { id: "alpha", items: [{ id: "one" }] },
      { id: "beta", items: [{ id: "two" }] },
    ],
  };
  const summary = {
    generatedAt: repository.generatedAt,
    snapshotVersion: 1,
    restaurants: repository.restaurants.map(({ id }) => ({ id })),
  };

  const first = buildVersionedRestaurantCatalog(repository, summary);
  const second = buildVersionedRestaurantCatalog(repository, summary);

  assert.equal(first.catalogVersion, second.catalogVersion);
  assert.match(
    first.catalogPath,
    /^restaurant-data\/catalogs\/v1-[a-f0-9]{20}\/summary\.json$/,
  );
  assert.equal(
    first.versionedSummary.restaurants[0].snapshotPath,
    `${first.catalogPrefix}/restaurants/alpha.json`,
  );
  assert.equal(
    first.versionedRepository.restaurants[1].snapshotPath,
    `${first.catalogPrefix}/restaurants/beta.json`,
  );
  assert.equal(repository.restaurants[0].snapshotPath, undefined);
});

test("changes the catalog version when canonical content changes", () => {
  const summary = { restaurants: [{ id: "alpha" }], snapshotVersion: 1 };
  const first = buildVersionedRestaurantCatalog(
    { restaurants: [{ id: "alpha", items: [] }], snapshotVersion: 1 },
    summary,
  );
  const second = buildVersionedRestaurantCatalog(
    { restaurants: [{ id: "alpha", items: [{ id: "changed" }] }], snapshotVersion: 1 },
    summary,
  );

  assert.notEqual(first.catalogVersion, second.catalogVersion);
});
