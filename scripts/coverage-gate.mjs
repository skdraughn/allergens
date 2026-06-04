import { coverageStatuses, snapshotVersion } from "./restaurant-adapters.mjs";

export function addCoverageMetadata(restaurant, adapter, generatedAt) {
  const totalOfficialItemCount = restaurant.items.length;
  const officialItemCount = restaurant.items.filter(
    (item) => item.allergenSourceType && item.allergenSourceType !== "unavailable",
  ).length;
  const coveragePercent =
    totalOfficialItemCount > 0
      ? Math.round((officialItemCount / totalOfficialItemCount) * 100)
      : 0;
  const meetsMinimumItemCount = totalOfficialItemCount >= (adapter.minOfficialItemCount ?? 1);
  const complete =
    totalOfficialItemCount > 0 &&
    meetsMinimumItemCount &&
    coveragePercent >= (adapter.coverageRequiredPercent ?? 100);

  return {
    ...restaurant,
    coveragePercent,
    coverageStatus: complete ? coverageStatuses.complete : coverageStatuses.blocked,
    lastKnownGoodAt: complete ? generatedAt : restaurant.lastKnownGoodAt ?? null,
    regionalScope: adapter.regionalScope,
    snapshotVersion,
    sourceUpdatedAt: generatedAt,
    allergenDataStatus: {
      ...restaurant.allergenDataStatus,
      itemCount: totalOfficialItemCount,
      officialItemCount,
      totalOfficialItemCount,
      unavailableItemCount: totalOfficialItemCount - officialItemCount,
    },
  };
}

export function applyCoverageGate(repository, previousRepository = null) {
  const previousById = new Map(
    (previousRepository?.restaurants ?? [])
      .filter((restaurant) => isEligiblePreviousKnownGood(restaurant))
      .map((restaurant) => [restaurant.id, restaurant]),
  );
  const manifest = {
    blocked: [],
    keptPrevious: [],
    published: [],
  };

  const restaurants = repository.restaurants.map((restaurant) => {
    if (restaurant.coverageStatus === coverageStatuses.complete) {
      manifest.published.push({
        id: restaurant.id,
        coveragePercent: restaurant.coveragePercent,
        itemCount: restaurant.items.length,
      });
      return restaurant;
    }

    const previous = previousById.get(restaurant.id);

    if (previous) {
      manifest.keptPrevious.push({
        id: restaurant.id,
        attemptedCoveragePercent: restaurant.coveragePercent,
        keptSnapshotGeneratedAt: previous.sourceUpdatedAt ?? previous.lastKnownGoodAt,
      });

      return {
        ...previous,
        coverageStatus: coverageStatuses.keptPrevious,
        failedRefresh: {
          attemptedAt: repository.generatedAt,
          attemptedCoveragePercent: restaurant.coveragePercent,
          attemptedItemCount: restaurant.items.length,
          reason: "Refresh did not meet 100% official coverage.",
        },
      };
    }

    manifest.blocked.push({
      id: restaurant.id,
      coveragePercent: restaurant.coveragePercent,
      itemCount: restaurant.items.length,
      reason: "No previous 100% official snapshot exists.",
    });

    return restaurant;
  });

  return {
    manifest,
    repository: {
      ...repository,
      itemCount: restaurants.reduce((count, restaurant) => count + restaurant.items.length, 0),
      restaurants,
      snapshotVersion,
    },
  };
}

function isEligiblePreviousKnownGood(restaurant) {
  if (
    restaurant.coverageStatus !== coverageStatuses.complete &&
    restaurant.coverageStatus !== coverageStatuses.keptPrevious
  ) {
    return false;
  }

  if (restaurant.id === "starbucks" && (restaurant.items?.length ?? 0) < 50) {
    return false;
  }

  return true;
}

export function validateRestaurantRepository(repository) {
  if (!repository || typeof repository !== "object") {
    return false;
  }

  if (repository.snapshotVersion !== snapshotVersion || !Array.isArray(repository.restaurants)) {
    return false;
  }

  return repository.restaurants.every(
    (restaurant) =>
      typeof restaurant.id === "string" &&
      typeof restaurant.coveragePercent === "number" &&
      typeof restaurant.coverageStatus === "string" &&
      Array.isArray(restaurant.items),
  );
}
