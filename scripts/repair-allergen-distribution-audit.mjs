import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { suspiciousMenuRows } from "./launch-coverage-quality.mjs";
import {
  officialAllergenDistributionSummary,
  officialAllergenStatuses,
  remediationBuckets,
} from "./restaurant-source-classification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(
  projectRoot,
  args.input ?? "src/data/generated/restaurants.generated.json",
);
const outputPath = path.resolve(projectRoot, args.output ?? "src/data/generated/restaurants.generated.json");
const reportPath = path.resolve(
  projectRoot,
  args.report ??
    `data/scraped/audits/allergen-distribution-repair-${timestampForFile(new Date())}.json`,
);
const publishS3 = args["publish-s3"] === true || args["publish-s3"] === "true";
const bucket =
  args.bucket ??
  process.env.RESTAURANT_DATA_BUCKET ??
  "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const prefix = args.prefix ?? process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data";

const repository = JSON.parse(await readFile(inputPath, "utf8"));
const report = {
  generatedAt: new Date().toISOString(),
  inputPath,
  outputPath,
  directSmearRepairs: [],
  removedArtifactRows: [],
  reviewedSupportedCrossContact: [],
  reviewedLowOfficialCoverage: [],
  changedRestaurantIds: [],
};
const changedRestaurantIds = new Set();

repository.restaurants = await Promise.all(
  (repository.restaurants ?? []).map(async (restaurant) => {
    let next = restaurant;
    const distribution = officialAllergenDistributionSummary(next);

    if (distribution.supportedBroadCrossContact) {
      report.reviewedSupportedCrossContact.push({
        id: next.id,
        name: next.name,
        officialItemCount: distribution.officialItemCount,
        dominantCrossContactSet: distribution.crossContact.dominantSet,
        decision: "preserved-source-supported-may-contain",
      });
    }

    if (distribution.likelyDirectSmear || hasPreviousDirectSmearRepair(next)) {
      const repaired = stripWeakDirectSmear(next);

      if (repaired.changed) {
        next = repaired.restaurant;
        changedRestaurantIds.add(next.id);
        report.directSmearRepairs.push({
          id: next.id,
          name: next.name,
          strippedItemCount: repaired.strippedItemCount,
          reason:
            "Weak Nutritionix/filter-derived direct allergen pattern covered most official items; official direct claims were removed and Ingredient Intelligence was recomputed.",
        });
      }
    }

    const artifactRows = suspiciousMenuRows(next.items ?? []).filter((row) =>
      (row.reasons ?? []).includes("artifact-text"),
    );

    if (artifactRows.length > 0) {
      const artifactIds = new Set(artifactRows.map((row) => row.id));
      const beforeCount = next.items?.length ?? 0;
      next = {
        ...next,
        items: (next.items ?? []).filter((item) => !artifactIds.has(item.id)),
      };
      changedRestaurantIds.add(next.id);
      report.removedArtifactRows.push({
        id: next.id,
        name: next.name,
        removedCount: beforeCount - next.items.length,
        rows: artifactRows,
      });
    }

    const lowCoverage = officialItemCountForRestaurant(next) > 0 && officialCoverageRatio(next) < 0.2;

    if (lowCoverage) {
      report.reviewedLowOfficialCoverage.push({
        id: next.id,
        name: next.name,
        officialItemCount: officialItemCountForRestaurant(next),
        totalItemCount: next.items?.length ?? 0,
        officialCoverageRatio: round(officialCoverageRatio(next)),
        decision: "kept-as-partial-official-evidence",
        reason:
          "Restaurant has limited item-level official allergen/ingredient statements, not a complete official allergen matrix. Menu remains published with partial official evidence plus Ingredient Intelligence where official data is unavailable.",
      });
    }

    if (changedRestaurantIds.has(next.id)) {
      next = await annotateRestaurantWithIngredientIntelligence(refreshRestaurantCounts(next));
    }

    return refreshRestaurantCounts(next);
  }),
);

repository.generatedAt = new Date().toISOString();
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce(
  (count, restaurant) => count + (restaurant.items?.length ?? 0),
  0,
);
report.changedRestaurantIds = [...changedRestaurantIds].sort();
report.changedRestaurantCount = report.changedRestaurantIds.length;
report.itemCount = repository.itemCount;
report.restaurantCount = repository.restaurantCount;

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(repository, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (publishS3) {
  const s3 = new S3Client({});
  await putJson(s3, bucket, `${prefix}/latest.json`, repository);

  for (const restaurantId of report.changedRestaurantIds) {
    const restaurant = repository.restaurants.find((candidate) => candidate.id === restaurantId);
    if (restaurant) {
      await putJson(s3, bucket, `${prefix}/restaurants/${restaurant.id}/latest.json`, restaurant);
    }
  }
}

console.log(
  JSON.stringify(
    {
      reportPath,
      changedRestaurantCount: report.changedRestaurantCount,
      directSmearRepairs: report.directSmearRepairs.length,
      removedArtifactRestaurants: report.removedArtifactRows.length,
      removedArtifactRowCount: report.removedArtifactRows.reduce(
        (count, entry) => count + entry.removedCount,
        0,
      ),
      reviewedSupportedCrossContact: report.reviewedSupportedCrossContact.length,
      reviewedLowOfficialCoverage: report.reviewedLowOfficialCoverage.length,
      publishedS3: publishS3,
    },
    null,
    2,
  ),
);

function stripWeakDirectSmear(restaurant) {
  let strippedItemCount = 0;
  const items = (restaurant.items ?? []).map((item) => {
    if (!isWeakDirectSmearItem(item)) {
      return item;
    }

    strippedItemCount += 1;
    const {
      extractedIngredientMentions: _extractedIngredientMentions,
      inferredIngredients: _inferredIngredients,
      inferredAllergenSignals: _inferredAllergenSignals,
      inferenceQuestions: _inferenceQuestions,
      inferenceSummary: _inferenceSummary,
      inferenceVersion: _inferenceVersion,
      officialSource: _officialSource,
      ...cleanItem
    } = item;
    const evidence = (cleanItem.evidence ?? []).filter((entry) => !isWeakNutritionixEvidence(entry));
    const description = isWeakNutritionixText(cleanItem.description) ? null : cleanItem.description;

    return {
      ...cleanItem,
      allergenSourceType: "unavailable",
      allergens: [],
      description,
      evidence,
      mayContain: [],
    };
  });

  if (strippedItemCount === 0) {
    return { changed: false, restaurant, strippedItemCount };
  }

  return {
    changed: true,
    strippedItemCount,
    restaurant: {
      ...restaurant,
      officialAllergenStatus: officialAllergenStatuses.sourceFoundUnparsed,
      officialAllergenRemediationBucket: remediationBuckets.buildSharedParser,
      allergenDataStatus: {
        ...(restaurant.allergenDataStatus ?? {}),
        officialItemCount: 0,
      },
      sourceStatus: {
        ...(restaurant.sourceStatus ?? {}),
        officialAllergenDistributionReview: {
          classification: "likely-direct-smear",
          reviewedAt: new Date().toISOString(),
          decision: "removed-weak-direct-allergen-claims",
        },
      },
      items,
    },
  };
}

function isWeakDirectSmearItem(item) {
  if ((item?.mayContain?.length ?? 0) > 0) {
    return false;
  }

  if (!/official/i.test(item?.allergenSourceType ?? "")) {
    return false;
  }

  return isWeakNutritionixText([
    item?.description,
    item?.sourceKind,
    item?.sourceUrl,
    ...(item?.sourceUrls ?? []),
    ...(item?.evidence ?? []).flatMap((entry) => [
      entry?.sourceKind,
      entry?.sourceUrl,
      entry?.text,
    ]),
  ].join(" "));
}

function hasPreviousDirectSmearRepair(restaurant) {
  return (
    restaurant?.sourceStatus?.officialAllergenDistributionReview?.classification ===
      "likely-direct-smear" ||
    restaurant?.officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed
  );
}

function isWeakNutritionixEvidence(entry) {
  return isWeakNutritionixText(`${entry?.sourceKind ?? ""} ${entry?.sourceUrl ?? ""} ${entry?.text ?? ""}`);
}

function isWeakNutritionixText(value) {
  const text = String(value ?? "");
  return (
    /nutritionix|allergenTags|allergenFree|online nutrition (?:and allergen )?guide|official-api/i.test(
      text,
    ) && !/\b(?:pdf-matrix|allergen matrix|allergen guide row parsed|row parsed|table cell|spreadsheet|official .* row)\b/i.test(text)
  );
}

function refreshRestaurantCounts(restaurant) {
  const officialItemCount = officialItemCountForRestaurant(restaurant);

  return {
    ...restaurant,
    itemCount: restaurant.items?.length ?? 0,
    allergenDataStatus: {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount,
    },
  };
}

function officialItemCountForRestaurant(restaurant) {
  return (restaurant?.items ?? []).filter((item) => /official/i.test(item?.allergenSourceType ?? "")).length;
}

function officialCoverageRatio(restaurant) {
  const total = restaurant?.items?.length ?? 0;
  return total > 0 ? officialItemCountForRestaurant(restaurant) / total : 0;
}

function round(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

async function putJson(s3, Bucket, Key, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: `${JSON.stringify(body, null, 2)}\n`,
      ContentType: "application/json",
    }),
  );
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = value.slice(2).split("=");
    parsed[key] = inlineValue ?? values[index + 1] ?? true;
    if (inlineValue === undefined && values[index + 1] && !values[index + 1].startsWith("--")) {
      index += 1;
    }
  }

  return parsed;
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
