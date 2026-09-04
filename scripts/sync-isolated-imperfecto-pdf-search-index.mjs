#!/usr/bin/env node

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { buildRestaurantSearchIndexRows } from "./restaurant-search-index.mjs";

const apply = process.argv.includes("--apply");
const bucket = process.env.RESTAURANT_DATA_BUCKET_NAME ?? "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const tableName = process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME ?? "amplify-d39boort611uk4-main-branch-f900642bee-restaurantsearch100B3E26-11LCY3VENGR5E-RestaurantSearchIndexF3E7EB02-GBPQ0CLQO1DY";
const sourcePath = process.argv.find((value) => value.startsWith("--source="))?.slice(9) ??
  "restaurant-data/catalogs/v1-afe3de81acf6246b643b/summary.json";
const targetPath = process.argv.find((value) => value.startsWith("--target="))?.slice(9);
if (!targetPath) throw new Error("Pass --target=<new summary path>.");
const idsFile = process.argv.find((value) => value.startsWith("--ids-file="))?.slice(11);
const ids = new Set(idsFile
  ? JSON.parse(fs.readFileSync(idsFile, "utf8"))
  : ["imperfecto-dc", "replacement-la-fiamma-italian-kitchen-alexandria-va"]);

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const sourceSummary = await readJson(sourcePath);
const targetSummary = await readJson(targetPath);
const oldRows = buildRestaurantSearchIndexRows({ generatedAt: sourceSummary.generatedAt, restaurants: await readDetails(sourceSummary) });
const newRows = buildRestaurantSearchIndexRows({ generatedAt: targetSummary.generatedAt, restaurants: await readDetails(targetSummary) });
const oldByKey = new Map(oldRows.map((row) => [`${row.pk}\0${row.sk}`, row]));
const newByKey = new Map(newRows.map((row) => [`${row.pk}\0${row.sk}`, row]));
const writes = [];
for (const [key, row] of oldByKey) if (!newByKey.has(key)) writes.push({ DeleteRequest: { Key: { pk: row.pk, sk: row.sk } } });
for (const [key, row] of newByKey) if (JSON.stringify(oldByKey.get(key)) !== JSON.stringify(row)) writes.push({ PutRequest: { Item: row } });
if (apply) {
  for (let index = 0; index < writes.length; index += 25) {
    let pending = writes.slice(index, index + 25);
    while (pending.length) {
      const response = await dynamo.send(new BatchWriteCommand({ RequestItems: { [tableName]: pending } }));
      pending = response.UnprocessedItems?.[tableName] ?? [];
    }
  }
}
console.log(JSON.stringify({ apply, tableName, sourcePath, targetPath, sourceRowCount: oldRows.length, targetRowCount: newRows.length, writeCount: writes.length }, null, 2));

async function readDetails(summary) { return Promise.all(summary.restaurants.filter((restaurant) => ids.has(restaurant.id)).map((restaurant) => readJson(restaurant.snapshotPath))); }
async function readJson(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  const body = response.ContentEncoding === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b) ? gunzipSync(bytes) : bytes;
  return JSON.parse(body.toString("utf8"));
}
