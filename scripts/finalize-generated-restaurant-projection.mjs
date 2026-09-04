#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import {
  annotateRestaurantWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "./ingredient-intelligence.mjs";
import { officialEvidenceClassification } from "./menu-item-quality.mjs";

const repositoryPath = path.resolve(
  process.env.RESTAURANT_REPOSITORY_PATH ??
    "src/data/generated/restaurants.generated.json",
);
const repository = JSON.parse(await fs.readFile(repositoryPath, "utf8"));
const manifest = await getDefaultIngredientIntelligenceManifest();

const restaurants = [];
for (const restaurant of repository.restaurants ?? []) {
  // Source authority is finalized by the canonical repair/reclassification
  // layers. Ingredient Intelligence may enrich unavailable rows, but it must
  // never promote or replace that authority here.
  const annotated = await annotateRestaurantWithIngredientIntelligence(restaurant, {
    manifest,
    promoteOfficialDisclosures: false,
  });
  const officialEvidence = officialEvidenceClassification(annotated);
  const totalItemCount = annotated.items?.length ?? 0;
  const officialItemCount = officialEvidence.officialTotal;
  const coverageBucket =
    officialItemCount === totalItemCount &&
    officialEvidence.officialFullMatrixOrApi >= Math.max(1, Math.ceil(totalItemCount * 0.7))
      ? "official-full"
      : officialEvidence.bucket;

  restaurants.push({
    ...annotated,
    officialAllergenStatus:
      officialItemCount > 0 ? "extracted" : annotated.officialAllergenStatus,
    totalItemCount,
    allergenDataStatus: {
      ...(annotated.allergenDataStatus ?? {}),
      itemCount: totalItemCount,
      officialItemCount,
      officialEvidence,
      officialTotal: officialItemCount,
      totalItemCount,
      totalOfficialItemCount: officialItemCount,
      unavailableItemCount: totalItemCount - officialItemCount,
      officialCoverageRatio:
        totalItemCount === 0
          ? 0
          : Number((officialItemCount / totalItemCount).toFixed(4)),
      bucket: coverageBucket,
    },
    sourceStatus: {
      ...(annotated.sourceStatus ?? {}),
      extractedFoodItemCount: totalItemCount,
      officialEvidenceBucket: coverageBucket,
      officialItemCount,
    },
  });
}

const generatedAt = new Date().toISOString();
const finalized = {
  ...repository,
  generatedAt,
  inferenceVersion: manifest.version,
  restaurantCount: restaurants.length,
  itemCount: restaurants.reduce(
    (total, restaurant) => total + (restaurant.items?.length ?? 0),
    0,
  ),
  restaurants,
};

const temporaryPath = `${repositoryPath}.tmp`;
await fs.writeFile(temporaryPath, `${JSON.stringify(finalized)}\n`);
await fs.rename(temporaryPath, repositoryPath);

console.log(
  JSON.stringify(
    {
      repositoryPath,
      generatedAt,
      inferenceVersion: manifest.version,
      restaurantCount: finalized.restaurantCount,
      itemCount: finalized.itemCount,
      promoteOfficialDisclosures: false,
    },
    null,
    2,
  ),
);
