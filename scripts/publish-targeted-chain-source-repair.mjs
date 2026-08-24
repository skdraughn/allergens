#!/usr/bin/env node

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs";
import { gzipSync } from "node:zlib";

import { buildVersionedRestaurantCatalog } from "./versioned-restaurant-catalog.mjs";

const apply = process.argv.includes("--apply");
const bucket =
  process.env.RESTAURANT_DATA_BUCKET_NAME ??
  "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const prefix = process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data";
const repository = readJson("src/data/generated/restaurants.generated.json");
const summary = readJson(
  "src/data/generated/restaurants.summary.generated.json",
);
const reportPath = argumentValue("report") ??
  "data/restaurant-verification/reports/targeted-chain-source-repair.json";
const report = readJson(reportPath);
const changedIds = new Set(
  report.repairs.map((repair) => repair.restaurantId),
);
const changedRestaurants = repository.restaurants.filter((restaurant) =>
  changedIds.has(restaurant.id),
);
const timestamp = repository.generatedAt.replace(/[:.]/g, "-");
const refreshScope = argumentValue("scope") ?? "targeted-chain-source-repair";
const versionedCatalog = buildVersionedRestaurantCatalog(
  repository,
  summary,
  prefix,
);
const manifest = {
  catalogPath: versionedCatalog.catalogPath,
  catalogVersion: versionedCatalog.catalogVersion,
  generatedAt: repository.generatedAt,
  itemCount: repository.itemCount,
  repairedRestaurantCount: changedRestaurants.length,
  restaurantCount: repository.restaurantCount,
  repairs: report.repairs,
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
  await putJson(
    s3,
    versionedCatalog.catalogPath,
    versionedCatalog.versionedSummary,
    { immutable: true },
  );

  let publishedDetailCount = 0;
  for (const restaurant of versionedCatalog.versionedRepository.restaurants) {
    await putJson(
      s3,
      versionedCatalog.detailPathForRestaurant(restaurant.id),
      restaurant,
      { immutable: true },
    );
    publishedDetailCount += 1;
    if (publishedDetailCount % 100 === 0) {
      console.log(
        JSON.stringify({ publishedDetailCount, total: repository.restaurantCount }),
      );
    }
  }

  await putJson(s3, `${prefix}/latest.json`, summary);
  await putJson(s3, `${prefix}/runs/${timestamp}-${refreshScope}.json`, summary);
  await putJson(
    s3,
    `${prefix}/manifests/${timestamp}-${refreshScope}.json`,
    manifest,
  );

  for (const restaurant of changedRestaurants) {
    await putJson(
      s3,
      `${prefix}/restaurants/${restaurant.id}/latest.json`,
      restaurant,
    );
  }
}

console.log(
  JSON.stringify(
    {
      apply,
      bucket,
      catalogPath: versionedCatalog.catalogPath,
      catalogVersion: versionedCatalog.catalogVersion,
      changedRestaurantCount: changedRestaurants.length,
      manifest,
      prefix,
    },
    null,
    2,
  ),
);

async function putJson(s3, key, value, options = {}) {
  try {
    await s3.send(
      new PutObjectCommand({
        Body: gzipSync(`${JSON.stringify(value)}\n`, { level: 9 }),
        Bucket: bucket,
        ContentEncoding: "gzip",
        ContentType: "application/json",
        ...(options.immutable
          ? {
              CacheControl: "public, max-age=31536000, immutable",
              IfNoneMatch: "*",
            }
          : {}),
        Key: key,
      }),
    );
  } catch (error) {
    if (
      options.immutable &&
      (error?.$metadata?.httpStatusCode === 412 ||
        error?.name === "PreconditionFailed")
    ) {
      return;
    }
    throw error;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function argumentValue(name) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
}
