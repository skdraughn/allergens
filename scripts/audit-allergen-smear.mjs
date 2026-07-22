import { readFileSync } from "node:fs";

import {
  officialAllergenSmearSummary,
  officialItemCountForRestaurant,
} from "./restaurant-source-classification.mjs";

const repositoryPath = process.argv[2] ?? "src/data/generated/restaurants.generated.json";
const repository = JSON.parse(readFileSync(repositoryPath, "utf8"));

const rows = (repository.restaurants ?? [])
  .map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    officialAllergenStatus: restaurant.officialAllergenStatus ?? "",
    officialItemCount: officialItemCountForRestaurant(restaurant),
    sourceFamily: restaurant.sourceFamily ?? "",
    parserProfile: restaurant.parserProfile ?? "",
    ...officialAllergenSmearSummary(restaurant),
  }))
  .filter((row) => row.suspected)
  .sort(
    (left, right) =>
      right.dominantRatio - left.dominantRatio ||
      right.averageAllergenCount - left.averageAllergenCount,
  );

console.log(
  JSON.stringify(
    {
      repositoryPath,
      suspectedCount: rows.length,
      rows,
    },
    null,
    2,
  ),
);
