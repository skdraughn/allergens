#!/usr/bin/env node

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs";
import { gzipSync } from "node:zlib";

const apply = process.argv.includes("--apply");
const promotionRepair = process.argv.includes("--promotion");
const bucket =
  process.env.RESTAURANT_DATA_BUCKET_NAME ??
  "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const prefix = process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data";
const repository = JSON.parse(
  fs.readFileSync("src/data/generated/restaurants.generated.json", "utf8"),
);
const summary = JSON.parse(
  fs.readFileSync("src/data/generated/restaurants.summary.generated.json", "utf8"),
);
const report = JSON.parse(
  fs.readFileSync(
    promotionRepair
      ? "data/restaurant-verification/reports/official-text-allergen-promotion-repair.json"
      : "data/restaurant-verification/reports/official-allergen-negative-coverage-repair.json",
    "utf8",
  ),
);
const changedIds = new Set(report.restaurants.map((restaurant) => restaurant.restaurantId));
const changedRestaurants = repository.restaurants.filter((restaurant) =>
  changedIds.has(restaurant.id),
);
const timestamp = repository.generatedAt.replace(/[:.]/g, "-");
const refreshScope = promotionRepair
  ? "official-text-allergen-promotion-repair"
  : "official-allergen-negative-coverage-repair";
const manifest = promotionRepair ? {
  generatedAt: repository.generatedAt,
  itemCount: repository.itemCount,
  promotedDirectCount: report.promotedDirectCount,
  promotedMayContainCount: report.promotedMayContainCount,
  repairedItemCount: report.changedItemCount,
  repairedRestaurantCount: report.changedRestaurantCount,
  restaurantCount: repository.restaurantCount,
  refreshScope,
  snapshotVersion: repository.snapshotVersion,
} : {
  generatedAt: repository.generatedAt,
  itemCount: repository.itemCount,
  officialNegativeProfiledCount: report.officialNegativeProfiledCount,
  officialPositiveProfiledCount: report.officialPositiveProfiledCount,
  profiledItemCount: report.profiledItemCount,
  profileCount: report.profileCount,
  repairedRestaurantCount: report.restaurantCount,
  restaurantCount: repository.restaurantCount,
  refreshScope,
  snapshotVersion: repository.snapshotVersion,
};

if (changedRestaurants.length !== changedIds.size) {
  throw new Error(
    `Repair report names ${changedIds.size} restaurants but repository contains ${changedRestaurants.length}.`,
  );
}

if (summary.generatedAt !== repository.generatedAt) {
  throw new Error("Mobile summary is stale relative to the canonical repository.");
}

if (apply) {
  const s3 = new S3Client({});
  await putJson(s3, `${prefix}/latest.json`, summary);
  await putJson(s3, `${prefix}/runs/${timestamp}-${refreshScope}.json`, summary);
  await putJson(
    s3,
    `${prefix}/manifests/${timestamp}-${refreshScope}.json`,
    manifest,
  );

  for (const restaurant of changedRestaurants) {
    await putJson(s3, `${prefix}/restaurants/${restaurant.id}/latest.json`, restaurant);
  }
}

console.log(
  JSON.stringify(
    {
      apply,
      bucket,
      changedRestaurantCount: changedRestaurants.length,
      manifest,
      prefix,
    },
    null,
    2,
  ),
);

async function putJson(s3, key, value) {
  await s3.send(
    new PutObjectCommand({
      Body: gzipSync(`${JSON.stringify(value)}\n`, { level: 9 }),
      Bucket: bucket,
      ContentEncoding: "gzip",
      ContentType: "application/json",
      Key: key,
    }),
  );
}
