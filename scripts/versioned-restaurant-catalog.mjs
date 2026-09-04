import { createHash } from "node:crypto";
import { buildIngredientDerivedAllergenReclassificationPlan } from "./ingredient-derived-allergen-reclassification.mjs";

export function buildVersionedRestaurantCatalog(repository, summary, prefix = "restaurant-data") {
  const sourceReclassification =
    buildIngredientDerivedAllergenReclassificationPlan(repository);

  if (sourceReclassification.actions.length > 0) {
    throw new Error(
      `Restaurant catalog has ${sourceReclassification.actions.length} ingredient-derived claims that have not been reclassified as Ingredient Intelligence.`,
    );
  }

  const repositoryDigest = createHash("sha256")
    .update(JSON.stringify(repository))
    .digest("hex");
  const catalogVersion = `v${repository.snapshotVersion ?? 1}-${repositoryDigest.slice(0, 20)}`;
  const catalogPrefix = `${prefix}/catalogs/${catalogVersion}`;
  const detailPathForRestaurant = (restaurantId) =>
    `${catalogPrefix}/restaurants/${restaurantId}.json`;
  const versionedRepository = {
    ...repository,
    catalogVersion,
    restaurants: (repository.restaurants ?? []).map((restaurant) => ({
      ...restaurant,
      snapshotPath: detailPathForRestaurant(restaurant.id),
    })),
  };
  const versionedSummary = {
    ...summary,
    catalogVersion,
    restaurants: (summary.restaurants ?? []).map((restaurant) => ({
      ...restaurant,
      snapshotPath: detailPathForRestaurant(restaurant.id),
    })),
  };

  if (versionedRepository.restaurants.length !== versionedSummary.restaurants.length) {
    throw new Error("Restaurant repository and summary counts do not match.");
  }

  return {
    catalogPath: `${catalogPrefix}/summary.json`,
    catalogPrefix,
    catalogVersion,
    detailPathForRestaurant,
    repositoryDigest,
    versionedRepository,
    versionedSummary,
  };
}
