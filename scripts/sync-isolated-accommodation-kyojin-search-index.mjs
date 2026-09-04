#!/usr/bin/env node

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { gunzipSync } from "node:zlib";
import { buildRestaurantSearchIndexRows } from "./restaurant-search-index.mjs";

const apply = process.argv.includes("--apply");
const bucket = process.env.RESTAURANT_DATA_BUCKET_NAME ?? "amplify-d39boort611uk4-ma-restaurantdatabucketd365-zw4uxrr7t88r";
const tableName = process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME ?? "amplify-d39boort611uk4-main-branch-f900642bee-restaurantsearch100B3E26-11LCY3VENGR5E-RestaurantSearchIndexF3E7EB02-GBPQ0CLQO1DY";
const sourcePath = "restaurant-data/catalogs/v1-cb2ab9cd80451a42c42d/summary.json";
const targetPath = "restaurant-data/catalogs/v1-afe3de81acf6246b643b/summary.json";
const ids = new Set([
  "imperfecto-dc", "kyojin-dc", "shoto-dc", "little-pearl-dc", "inn-at-little-washington-va", "xiquet-dc", "el-taller-del-xiquet-dc", "bresca-dc", "elcielo-dc", "sushi-taro-dc", "lavant-garde-dc", "elizabeths-gone-raw-dc", "wildfire-mclean-va-dc-metro", "tatte-reston-va", "providencia-dc", "green-almond-pantry-dc", "cranes-dc", "kyojin-sushi-washington-dc-dc-metro",
]);

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const sourceSummary = await readJson(sourcePath);
const targetSummary = await readJson(targetPath);
const sourceDetails = await readDetails(sourceSummary);
const targetDetails = await readDetails(targetSummary);
const oldRows = buildRestaurantSearchIndexRows({ generatedAt: sourceSummary.generatedAt, restaurants: sourceDetails });
const newRows = buildRestaurantSearchIndexRows({ generatedAt: targetSummary.generatedAt, restaurants: targetDetails });
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

console.log(JSON.stringify({ apply, tableName, sourceRowCount: oldRows.length, targetRowCount: newRows.length, writeCount: writes.length, removedIndexedIds: [...ids].filter((id) => sourceDetails.some((restaurant) => restaurant.id === id) && !targetDetails.some((restaurant) => restaurant.id === id)) }, null, 2));

async function readDetails(summary) {
  const rows = summary.restaurants.filter((restaurant) => ids.has(restaurant.id));
  return Promise.all(rows.map((restaurant) => readJson(restaurant.snapshotPath)));
}

async function readJson(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  const body = response.ContentEncoding === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b) ? gunzipSync(bytes) : bytes;
  return JSON.parse(body.toString("utf8"));
}
