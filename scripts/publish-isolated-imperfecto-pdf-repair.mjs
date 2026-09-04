#!/usr/bin/env node

import { CopyObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const apply = process.argv.includes("--apply");
const bucket = process.env.RESTAURANT_DATA_BUCKET_NAME ?? "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const sourcePath = argumentValue("source") ?? "restaurant-data/catalogs/v1-afe3de81acf6246b643b/summary.json";
const repository = JSON.parse(fs.readFileSync("src/data/generated/restaurants.generated.json", "utf8"));
const idsFile = argumentValue("ids-file");
const changedIds = new Set(idsFile
  ? JSON.parse(fs.readFileSync(idsFile, "utf8"))
  : ["imperfecto-dc", "replacement-la-fiamma-italian-kitchen-alexandria-va"]);
const localById = new Map(repository.restaurants.map((restaurant) => [restaurant.id, restaurant]));
for (const id of changedIds) if (!localById.has(id)) throw new Error(`Missing changed local restaurant ${id}.`);

const s3 = new S3Client({});
const sourceSummary = await readJson(sourcePath);
const sourceById = new Map(sourceSummary.restaurants.map((restaurant) => [restaurant.id, restaurant]));
for (const id of changedIds) if (!sourceById.has(id)) throw new Error(`Source catalog is missing ${id}.`);

const digestInput = {
  sourcePath,
  changed: [...changedIds].sort().map((id) => [id, sha256(localById.get(id))]),
};
const catalogVersion = `v1-${sha256(digestInput).slice(0, 20)}`;
const catalogPrefix = `restaurant-data/catalogs/${catalogVersion}`;
const detailPath = (id) => `${catalogPrefix}/restaurants/${id}.json`;
const summaryRows = sourceSummary.restaurants.map((restaurant) => ({
  ...(changedIds.has(restaurant.id) ? buildSummaryRow(localById.get(restaurant.id)) : restaurant),
  snapshotPath: detailPath(restaurant.id),
}));
const priorChangedCount = [...changedIds].reduce((sum, id) => sum + (sourceById.get(id)?.totalItemCount ?? 0), 0);
const nextChangedCount = [...changedIds].reduce((sum, id) => sum + (localById.get(id)?.items?.length ?? 0), 0);
const summary = {
  ...sourceSummary,
  catalogVersion,
  generatedAt: "2026-08-31T00:00:00.000Z",
  restaurantCount: summaryRows.length,
  itemCount: sourceSummary.itemCount - priorChangedCount + nextChangedCount,
  restaurants: summaryRows,
};

if (summary.restaurantCount !== sourceSummary.restaurantCount || summary.itemCount !== sourceSummary.itemCount - priorChangedCount + nextChangedCount) {
  throw new Error(`Unexpected isolated catalog totals ${summary.restaurantCount}/${summary.itemCount}.`);
}

if (apply) {
  const unchanged = sourceSummary.restaurants.filter((restaurant) => !changedIds.has(restaurant.id));
  await parallelMap(unchanged, 24, async (restaurant) => {
    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${restaurant.snapshotPath}`,
      Key: detailPath(restaurant.id),
      CacheControl: "public, max-age=31536000, immutable",
      MetadataDirective: "COPY",
    }));
  });
  await parallelMap([...changedIds], 2, async (id) => putJson(detailPath(id), { ...localById.get(id), snapshotPath: detailPath(id) }));
  await putJson(`${catalogPrefix}/summary.json`, summary);

  const verified = await readJson(`${catalogPrefix}/summary.json`);
  const imperfecto = await readJson(detailPath("imperfecto-dc"));
  const laFiamma = await readJson(detailPath("replacement-la-fiamma-italian-kitchen-alexandria-va"));
  if (verified.catalogVersion !== catalogVersion || verified.restaurantCount !== summary.restaurantCount || verified.itemCount !== summary.itemCount) throw new Error("Published summary verification failed.");
  if (changedIds.has("imperfecto-dc") && (imperfecto.items?.length !== 53 || imperfecto.items.find((item) => item.id === "caesar-augustus-salad")?.description !== "Gem lettuce, hearts of palm, dressing, anchovy vinaigrette, and whitefish roe.")) throw new Error("Published Imperfecto verification failed.");
  if (changedIds.has("replacement-la-fiamma-italian-kitchen-alexandria-va") && laFiamma.items?.some((item) => item.id === "chicken-or-sausage-dollar24-shrimp")) throw new Error("Published La Fiamma verification failed.");
}

console.log(JSON.stringify({ apply, bucket, sourcePath, catalogPath: `${catalogPrefix}/summary.json`, catalogVersion, changedRestaurantIds: [...changedIds], restaurantCount: summary.restaurantCount, itemCount: summary.itemCount }, null, 2));

function buildSummaryRow(restaurant) {
  const keys = ["address", "addressLine1", "addressLine2", "allergenDataStatus", "allergyAccommodationPolicy", "brandKey", "category", "city", "country", "coveragePercent", "coverageStatus", "displayAddress", "domain", "guideLabel", "guideUrl", "id", "lastKnownGoodAt", "lat", "lng", "locationId", "logoAspectRatio", "logoMonogram", "logoSvgUrl", "logoUrl", "name", "officialAllergenStatus", "parserProfile", "postalCode", "rank", "region", "regionalScope", "sourceFamily", "sourceStatus", "sourceUpdatedAt", "sourceUrls", "type", "updated"];
  const row = Object.fromEntries(keys.filter((key) => restaurant[key] !== undefined).map((key) => [key, restaurant[key]]));
  row.totalItemCount = restaurant.items?.length ?? restaurant.totalItemCount ?? 0;
  return row;
}

async function readJson(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  const body = response.ContentEncoding === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b) ? gunzipSync(bytes) : bytes;
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
    while (cursor < values.length) await work(values[cursor++]);
  }));
}

function sha256(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function argumentValue(name) { const argument = process.argv.find((value) => value.startsWith(`--${name}=`)); return argument ? argument.slice(name.length + 3) : null; }
