import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { buildRestaurantSearchIndexRows } from "./restaurant-search-index.mjs";

const defaultRepositoryPath = "data/scraped/launch-coverage/final-1200-portfolio-01/repository.json";
const defaultReportPath = "data/scraped/launch-coverage/final-1200-portfolio-01/selection-report.json";
const defaultPrefix = "restaurant-data";

export async function publishFinalLaunchPortfolio(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const bucket = args.bucket || process.env.RESTAURANT_DATA_BUCKET_NAME;
  const tableName = args.searchTable || process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME;
  const prefix = args.prefix || process.env.RESTAURANT_DATA_PREFIX || defaultPrefix;
  const repositoryPath = args.repository || defaultRepositoryPath;
  const reportPath = args.report || defaultReportPath;
  const skipS3 = args.skipS3 === "true";
  const skipSearchIndex = args.skipSearchIndex === "true";
  const skipPreviousS3 = args.skipPreviousS3 === "true";

  if (!skipS3 && !bucket) {
    throw new Error("Pass --bucket or set RESTAURANT_DATA_BUCKET_NAME.");
  }

  if (!skipSearchIndex && !tableName) {
    throw new Error("Pass --searchTable or set RESTAURANT_SEARCH_INDEX_TABLE_NAME.");
  }

  const repository = JSON.parse(await readFile(repositoryPath, "utf8"));
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  validateRepository(repository);

  const s3 = new S3Client({});
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
  const previousRepository = bucket && !skipPreviousS3
    ? await readJsonFromS3(s3, bucket, `${prefix}/latest.json`)
    : null;
  const timestamp = repository.generatedAt.replace(/[:.]/g, "-");
  const previousIndexRows = previousRepository
    ? buildRestaurantSearchIndexRows(previousRepository)
    : [];
  const currentIndexRows = buildRestaurantSearchIndexRows(repository);
  const manifest = {
    generatedAt: repository.generatedAt,
    itemCount: repository.itemCount,
    restaurantCount: repository.restaurantCount,
    restaurantSearchIndexCount: currentIndexRows.length,
    refreshScope: "final-launch-portfolio",
    selectionSummary: {
      ...(report.summary ?? {}),
      restaurantCount: repository.restaurantCount,
      itemCount: repository.itemCount,
      sourceReportPath: reportPath,
    },
    snapshotVersion: repository.snapshotVersion,
  };

  if (!skipS3) {
    await putJson(s3, bucket, `${prefix}/runs/${timestamp}.json`, repository);
    await putJson(s3, bucket, `${prefix}/manifests/${timestamp}.json`, manifest);
    await putJson(s3, bucket, `${prefix}/latest.json`, repository);

    for (const restaurant of repository.restaurants ?? []) {
      await putJson(s3, bucket, `${prefix}/restaurants/${restaurant.id}/latest.json`, restaurant);
    }
  }

  if (!skipSearchIndex) {
    await syncRestaurantSearchIndex({
      currentRows: currentIndexRows,
      dynamo,
      previousRows: previousIndexRows,
      tableName,
    });
  }

  console.log(JSON.stringify({
    bucket,
    manifest,
    prefix,
    restaurantFilesUploaded: skipS3 ? 0 : repository.restaurants?.length ?? 0,
    searchIndexRows: currentIndexRows.length,
    skipS3,
    skipSearchIndex,
    tableName,
  }, null, 2));
}

function validateRepository(repository) {
  const restaurants = repository.restaurants ?? [];
  const ids = new Set();

  if (restaurants.length < 1200 || repository.restaurantCount < 1200) {
    throw new Error(`Expected at least 1200 restaurants, got ${restaurants.length}.`);
  }

  for (const restaurant of restaurants) {
    if (ids.has(restaurant.id)) {
      throw new Error(`Duplicate restaurant id ${restaurant.id}.`);
    }
    ids.add(restaurant.id);

    const isAccommodationOnly =
      (restaurant.items?.length ?? 0) === 0 && restaurant.allergyAccommodationPolicy;

    if ((restaurant.items?.length ?? 0) <= 0 && !isAccommodationOnly) {
      throw new Error(`Restaurant ${restaurant.id} has no menu items.`);
    }

    if (restaurant.officialAllergenStatus === "source-found-unparsed") {
      throw new Error(`Restaurant ${restaurant.id} is source-found-unparsed.`);
    }

    for (const key of ["brandKey", "sourceFamily", "parserProfile", "officialAllergenStatus"]) {
      if (!restaurant[key]) {
        throw new Error(`Restaurant ${restaurant.id} missing ${key}.`);
      }
    }
  }
}

async function readJsonFromS3(s3, bucket, key) {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await response.Body?.transformToString();
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

async function putJson(s3, bucket, key, body) {
  const json = `${JSON.stringify(body)}\n`;
  await s3.send(
    new PutObjectCommand({
      Body: gzipSync(json, { level: 9 }),
      Bucket: bucket,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      Key: key,
    }),
  );
}

async function syncRestaurantSearchIndex({ currentRows, dynamo, previousRows, tableName }) {
  const previousByKey = new Map(previousRows.map((row) => [searchIndexRowKey(row), row]));
  const currentByKey = new Map(currentRows.map((row) => [searchIndexRowKey(row), row]));
  const writes = [];

  for (const [key, row] of previousByKey) {
    if (!currentByKey.has(key)) {
      writes.push({
        DeleteRequest: {
          Key: {
            pk: row.pk,
            sk: row.sk,
          },
        },
      });
    }
  }

  for (const [key, row] of currentByKey) {
    if (stableJson(previousByKey.get(key)) === stableJson(row)) {
      continue;
    }

    writes.push({
      PutRequest: {
        Item: row,
      },
    });
  }

  for (let index = 0; index < writes.length; index += 25) {
    await batchWriteAll(dynamo, tableName, writes.slice(index, index + 25));
  }
}

async function batchWriteAll(dynamo, tableName, requests) {
  let requestItems = {
    [tableName]: requests,
  };

  while (requestItems[tableName]?.length > 0) {
    const response = await dynamo.send(new BatchWriteCommand({ RequestItems: requestItems }));
    requestItems = {
      [tableName]: response.UnprocessedItems?.[tableName] ?? [],
    };
  }
}

function searchIndexRowKey(row) {
  return `${String(row.pk)}:${String(row.sk)}`;
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

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [rawKey, ...rest] = arg.replace(/^--/, "").split("=");
        return [rawKey, rest.join("=") || "true"];
      }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await publishFinalLaunchPortfolio();
}
