#!/usr/bin/env node

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";

import { buildRestaurantSearchIndexRows } from "./restaurant-search-index.mjs";

const apply = process.argv.includes("--apply");
const tableName =
  process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME ??
  "amplify-d39boort611uk4-main-branch-f900642bee-restaurantsearch100B3E26-11LCY3VENGR5E-RestaurantSearchIndexF3E7EB02-GBPQ0CLQO1DY";
const repositoryPath =
  process.env.RESTAURANT_REPOSITORY_PATH ??
  "src/data/generated/restaurants.generated.json";
const repository = JSON.parse(fs.readFileSync(repositoryPath, "utf8"));
const catalogDetailPrefix = process.env.RESTAURANT_CATALOG_DETAIL_PREFIX?.replace(/\/$/, "");
if (catalogDetailPrefix) {
  repository.restaurants = (repository.restaurants ?? []).map((restaurant) => ({
    ...restaurant,
    snapshotPath: `${catalogDetailPrefix}/${restaurant.id}.json`,
  }));
}
const canonicalRows = buildRestaurantSearchIndexRows(repository);
const canonicalByKey = new Map(canonicalRows.map((row) => [rowKey(row), row]));
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const liveRows = await scanAllRows();
const liveByKey = new Map(liveRows.map((row) => [rowKey(row), row]));
const writes = [];
let deletes = 0;
let puts = 0;

for (const [key, row] of liveByKey) {
  if (!canonicalByKey.has(key) && isRestaurantIndexRow(row)) {
    writes.push({ DeleteRequest: { Key: { pk: row.pk, sk: row.sk } } });
    deletes += 1;
  }
}

for (const [key, canonicalRow] of canonicalByKey) {
  const liveRow = liveByKey.get(key);
  const nextRow = preserveLiveTelemetry(canonicalRow, liveRow);

  if (stableJson(liveRow) !== stableJson(nextRow)) {
    writes.push({ PutRequest: { Item: nextRow } });
    puts += 1;
  }
}

const report = {
  apply,
  canonicalIndexRows: canonicalRows.length,
  canonicalRestaurantCount: new Set(
    canonicalRows
      .filter((row) => row.pk === "POPULAR#GLOBAL")
      .map((row) => row.restaurantId),
  ).size,
  deletes,
  generatedAt: repository.generatedAt,
  catalogDetailPrefix: catalogDetailPrefix ?? null,
  liveIndexRows: liveRows.filter(isRestaurantIndexRow).length,
  puts,
  tableName,
  totalWrites: writes.length,
};

console.log(JSON.stringify(report, null, 2));

if (apply) {
  for (let index = 0; index < writes.length; index += 25) {
    await batchWriteAll(writes.slice(index, index + 25));

    if ((index + 25) % 2500 === 0 || index + 25 >= writes.length) {
      console.error(
        JSON.stringify({
          applied: Math.min(index + 25, writes.length),
          total: writes.length,
        }),
      );
    }
  }
}

async function scanAllRows() {
  const rows = [];
  let exclusiveStartKey;

  do {
    const response = await dynamo.send(
      new ScanCommand({
        ExclusiveStartKey: exclusiveStartKey,
        TableName: tableName,
      }),
    );
    rows.push(...(response.Items ?? []));
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return rows;
}

async function batchWriteAll(requests) {
  let pending = requests;

  while (pending.length > 0) {
    const response = await dynamo.send(
      new BatchWriteCommand({
        RequestItems: { [tableName]: pending },
      }),
    );
    pending = response.UnprocessedItems?.[tableName] ?? [];
  }
}

function preserveLiveTelemetry(canonicalRow, liveRow) {
  if (!liveRow || !String(canonicalRow.pk).startsWith("META#")) {
    return canonicalRow;
  }

  const nextRow = { ...canonicalRow };

  for (const key of ["lastOpenedAt", "openedCount", "refreshQueuedAt"]) {
    if (key in liveRow) {
      nextRow[key] = liveRow[key];
    }
  }

  return nextRow;
}

function isRestaurantIndexRow(row) {
  const pk = String(row?.pk ?? "");
  return (
    pk === "POPULAR#GLOBAL" ||
    pk.startsWith("META#") ||
    pk.startsWith("TOKEN#") ||
    pk.startsWith("GEO#")
  );
}

function rowKey(row) {
  return `${String(row.pk)}\u0000${String(row.sk)}`;
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nextValue]) => `${JSON.stringify(key)}:${stableJson(nextValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
