#!/usr/bin/env node

import { CopyObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const apply = process.argv.includes("--apply");
const bucket = process.env.RESTAURANT_DATA_BUCKET_NAME ?? "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const sourcePath = argumentValue("source") ?? "restaurant-data/catalogs/v1-cb2ab9cd80451a42c42d/summary.json";
const repository = JSON.parse(fs.readFileSync("src/data/generated/restaurants.generated.json", "utf8"));
const changedIds = new Set([
  "imperfecto-dc",
  "kyojin-dc",
  "shoto-dc",
  "little-pearl-dc",
  "inn-at-little-washington-va",
  "xiquet-dc",
  "el-taller-del-xiquet-dc",
  "bresca-dc",
  "elcielo-dc",
  "sushi-taro-dc",
  "lavant-garde-dc",
  "elizabeths-gone-raw-dc",
  "wildfire-mclean-va-dc-metro",
  "tatte-reston-va",
  "providencia-dc",
  "green-almond-pantry-dc",
]);
const removedIds = new Set(["cranes-dc", "kyojin-sushi-washington-dc-dc-metro"]);
const localById = new Map(repository.restaurants.map((restaurant) => [restaurant.id, restaurant]));
for (const id of changedIds) if (!localById.has(id)) throw new Error(`Missing changed local restaurant ${id}.`);
for (const id of removedIds) if (localById.has(id)) throw new Error(`Removed identity still exists locally: ${id}.`);

const s3 = new S3Client({});
const sourceSummary = await readJson(sourcePath);
if (!sourceSummary?.restaurants?.length) throw new Error(`Could not read source catalog ${sourcePath}.`);
const sourceById = new Map(sourceSummary.restaurants.map((restaurant) => [restaurant.id, restaurant]));
for (const id of [...changedIds, ...removedIds]) if (!sourceById.has(id)) throw new Error(`Source catalog is missing ${id}.`);

const digestInput = {
  sourcePath,
  changed: [...changedIds].sort().map((id) => [id, sha256(localById.get(id))]),
  removed: [...removedIds].sort(),
};
const catalogVersion = `v1-${sha256(digestInput).slice(0, 20)}`;
const catalogPrefix = `restaurant-data/catalogs/${catalogVersion}`;
const detailPath = (id) => `${catalogPrefix}/restaurants/${id}.json`;

const summaryRows = sourceSummary.restaurants
  .filter((restaurant) => !removedIds.has(restaurant.id))
  .map((restaurant) => {
    const value = changedIds.has(restaurant.id) ? buildSummaryRow(localById.get(restaurant.id)) : { ...restaurant };
    return { ...value, snapshotPath: detailPath(restaurant.id) };
  });
const summary = {
  ...sourceSummary,
  catalogVersion,
  generatedAt: "2026-08-31T00:00:00.000Z",
  restaurantCount: summaryRows.length,
  itemCount: sourceSummary.itemCount - [...changedIds, ...removedIds].reduce((sum, id) => sum + (sourceById.get(id)?.totalItemCount ?? 0), 0) + [...changedIds].reduce((sum, id) => sum + (localById.get(id)?.items?.length ?? 0), 0),
  restaurants: summaryRows,
};

if (summary.restaurantCount !== 1493 || summary.itemCount !== 112511) {
  throw new Error(`Unexpected isolated catalog totals ${summary.restaurantCount}/${summary.itemCount}.`);
}

if (apply) {
  const unchanged = sourceSummary.restaurants.filter((restaurant) => !changedIds.has(restaurant.id) && !removedIds.has(restaurant.id));
  await parallelMap(unchanged, 24, async (restaurant) => {
    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${restaurant.snapshotPath}`,
      Key: detailPath(restaurant.id),
      CacheControl: "public, max-age=31536000, immutable",
      MetadataDirective: "COPY",
    }));
  });
  await parallelMap([...changedIds], 12, async (id) => putJson(detailPath(id), { ...localById.get(id), snapshotPath: detailPath(id) }));
  await putJson(`${catalogPrefix}/summary.json`, summary);

  const verified = await readJson(`${catalogPrefix}/summary.json`);
  const kyojin = await readJson(detailPath("kyojin-dc"));
  if (verified.catalogVersion !== catalogVersion || verified.restaurantCount !== 1493) throw new Error("Published summary verification failed.");
  if (kyojin.items?.length !== 75 || kyojin.sourceStatus?.accommodationOnly === true) throw new Error("Published Kyojin verification failed.");
}

console.log(JSON.stringify({ apply, bucket, sourcePath, catalogPath: `${catalogPrefix}/summary.json`, catalogVersion, changedRestaurantCount: changedIds.size, removedRestaurantIds: [...removedIds], restaurantCount: summary.restaurantCount, itemCount: summary.itemCount }, null, 2));

function buildSummaryRow(restaurant) {
  const keys = ["address", "addressLine1", "addressLine2", "allergenDataStatus", "allergyAccommodationPolicy", "brandKey", "category", "city", "country", "coveragePercent", "coverageStatus", "displayAddress", "domain", "guideLabel", "guideUrl", "id", "lastKnownGoodAt", "lat", "lng", "locationId", "logoAspectRatio", "logoMonogram", "logoSvgUrl", "logoUrl", "name", "officialAllergenStatus", "parserProfile", "postalCode", "rank", "region", "regionalScope", "sourceFamily", "sourceStatus", "sourceUpdatedAt", "sourceUrls", "type", "updated"];
  const row = Object.fromEntries(keys.filter((key) => restaurant[key] !== undefined).map((key) => [key, restaurant[key]]));
  row.totalItemCount = restaurant.items?.length ?? restaurant.totalItemCount ?? 0;
  return row;
}

async function readJson(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  const body = response.ContentEncoding === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b)
    ? gunzipSync(bytes)
    : bytes;
  return JSON.parse(body.toString("utf8"));
}

async function putJson(key, value) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: gzipSync(`${JSON.stringify(value)}\n`, { level: 9 }), ContentEncoding: "gzip", ContentType: "application/json", CacheControl: "public, max-age=31536000, immutable", IfNoneMatch: "*" })).catch((error) => {
    if (error?.$metadata?.httpStatusCode !== 412 && error?.name !== "PreconditionFailed") throw error;
  });
}

async function parallelMap(values, concurrency, work) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      await work(values[index], index);
    }
  }));
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function argumentValue(name) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
}
