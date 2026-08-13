#!/usr/bin/env node

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { buildRestaurantSearchIndexRows } from "./restaurant-search-index.mjs";

const bucket = process.env.RESTAURANT_DATA_BUCKET_NAME ?? "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const tableName = process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME ?? "amplify-d39boort611uk4-main-branch-f900642bee-restaurantsearch100B3E26-11LCY3VENGR5E-RestaurantSearchIndexF3E7EB02-GBPQ0CLQO1DY";
const prefix = process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data";
const repository = JSON.parse(fs.readFileSync("src/data/generated/restaurants.generated.json", "utf8"));
const runsRoot = "data/restaurant-verification/distributed-runs";
const machineBIds = new Set();
for (const runId of fs.readdirSync(runsRoot).filter((name) => name.startsWith("distributed-machine-b-"))) {
  const manifestPath = path.join(runsRoot, runId, "manifest.json");
  if (!fs.existsSync(manifestPath)) continue;
  for (const job of JSON.parse(fs.readFileSync(manifestPath, "utf8")).jobs ?? []) machineBIds.add(job.restaurantId);
}
const publishCatalogRepairs = process.env.PUBLISH_CATALOG_REPAIRS === "1";
const publishAllDetails = process.env.PUBLISH_ALL_DETAILS === "1";
const catalogRepairReasons = new Set([
  "distributed_aggregate_catalog_serialization",
  "legacy_aggregate_placeholder_removal",
  "official_itemized_menu_refresh_after_aggregate_collapse",
  "official_itemized_menu_refresh_after_low_count_failure",
]);
const detailIds = publishCatalogRepairs ? new Set() : machineBIds;
if (publishCatalogRepairs) {
  const dossiersRoot = "data/restaurant-verification/restaurants";
  for (const file of fs.readdirSync(dossiersRoot).filter((name) => name.endsWith(".json"))) {
    const dossier = JSON.parse(fs.readFileSync(path.join(dossiersRoot, file), "utf8"));
    if (catalogRepairReasons.has(dossier.adjudication?.mappingRepair?.reason)) detailIds.add(file.slice(0, -5));
  }
}
if (publishAllDetails) {
  for (const restaurant of repository.restaurants ?? []) detailIds.add(restaurant.id);
}
const publishLabel = publishCatalogRepairs ? "catalog-mapping-repair" : "machine-b-mapping-repair";

const summary = {
  generatedAt: repository.generatedAt,
  itemCount: repository.itemCount,
  restaurantCount: repository.restaurantCount,
  snapshotVersion: repository.snapshotVersion,
  restaurants: repository.restaurants.map((restaurant) => ({
    address: restaurant.address,
    addressLine1: restaurant.addressLine1,
    addressLine2: restaurant.addressLine2,
    allergenDataStatus: restaurant.allergenDataStatus,
    allergyAccommodationPolicy: restaurant.allergyAccommodationPolicy,
    brandKey: restaurant.brandKey,
    category: restaurant.category,
    city: restaurant.city,
    country: restaurant.country,
    coveragePercent: restaurant.coveragePercent,
    coverageStatus: restaurant.coverageStatus,
    displayAddress: restaurant.displayAddress,
    domain: restaurant.domain,
    guideLabel: restaurant.guideLabel,
    guideUrl: restaurant.guideUrl,
    id: restaurant.id,
    lastKnownGoodAt: restaurant.lastKnownGoodAt,
    lat: restaurant.lat,
    lng: restaurant.lng,
    locationId: restaurant.locationId,
    logoAspectRatio: restaurant.logoAspectRatio,
    logoMonogram: restaurant.logoMonogram,
    logoSvgUrl: restaurant.logoSvgUrl,
    logoUrl: restaurant.logoUrl,
    name: restaurant.name,
    officialAllergenStatus: restaurant.officialAllergenStatus,
    parserProfile: restaurant.parserProfile,
    postalCode: restaurant.postalCode,
    rank: restaurant.rank,
    region: restaurant.region,
    regionalScope: restaurant.regionalScope,
    snapshotPath: restaurant.snapshotPath ?? `${prefix}/restaurants/${restaurant.id}/latest.json`,
    sourceFamily: restaurant.sourceFamily,
    sourceStatus: restaurant.sourceStatus,
    sourceUpdatedAt: restaurant.sourceUpdatedAt,
    sourceUrls: restaurant.sourceUrls,
    totalItemCount: restaurant.items?.length ?? restaurant.totalItemCount ?? 0,
    type: restaurant.type,
    updated: restaurant.updated,
  })),
};

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const previous = await readJson(`${prefix}/latest.json`);
const timestamp = repository.generatedAt.replace(/[:.]/g, "-");
await putJson(`${prefix}/latest.json`, summary);
await putJson(`${prefix}/runs/${timestamp}-${publishLabel}.json`, summary);
await putJson(`${prefix}/manifests/${timestamp}-${publishLabel}.json`, {
  generatedAt: repository.generatedAt,
  itemCount: repository.itemCount,
  restaurantCount: repository.restaurantCount,
  repairedRestaurantCount: detailIds.size,
  refreshScope: publishCatalogRepairs ? "catalog-mapping-integrity-repair" : "machine-b-mapping-integrity-repair",
  snapshotVersion: repository.snapshotVersion,
});

let uploadedDetails = 0;
for (const restaurant of repository.restaurants) {
  if (!detailIds.has(restaurant.id)) continue;
  await putJson(`${prefix}/restaurants/${restaurant.id}/latest.json`, restaurant);
  uploadedDetails += 1;
}

const oldRows = buildRestaurantSearchIndexRows(previous ?? { restaurants: [] });
// Search compatibility is item-derived. Build Dynamo rows from the full repository,
// while keeping the lightweight summary as the mobile discovery payload.
const newRows = buildRestaurantSearchIndexRows(repository);
const oldByKey = new Map(oldRows.map((row) => [`${row.pk}\u0000${row.sk}`, row]));
const newByKey = new Map(newRows.map((row) => [`${row.pk}\u0000${row.sk}`, row]));
const writes = [];
for (const [key, row] of oldByKey) if (!newByKey.has(key)) writes.push({ DeleteRequest: { Key: { pk: row.pk, sk: row.sk } } });
for (const [key, row] of newByKey) {
  if (JSON.stringify(oldByKey.get(key)) !== JSON.stringify(row)) writes.push({ PutRequest: { Item: row } });
}
for (let index = 0; index < writes.length; index += 25) {
  let pending = writes.slice(index, index + 25);
  while (pending.length) {
    const response = await dynamo.send(new BatchWriteCommand({ RequestItems: { [tableName]: pending } }));
    pending = response.UnprocessedItems?.[tableName] ?? [];
  }
}

console.log(JSON.stringify({
  bucket,
  generatedAt: repository.generatedAt,
  indexBytes: Buffer.byteLength(JSON.stringify(summary)),
  itemCount: repository.itemCount,
  repairedRestaurants: detailIds.size,
  restaurantCount: repository.restaurantCount,
  searchIndexWrites: writes.length,
  tableName,
  uploadedDetails,
}, null, 2));

async function readJson(key) {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await response.Body.transformToString();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function putJson(key, value) {
  const body = gzipSync(`${JSON.stringify(value)}\n`, { level: 9 });
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/json", ContentEncoding: "gzip" }));
}
