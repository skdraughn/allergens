import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  type BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { EventBridgeHandler } from "aws-lambda";

import bundledRestaurantRepository from "../../../src/data/generated/restaurants.generated.json";
import { combinePreviousKnownGoodRepositories } from "../../../scripts/coverage-gate.mjs";
import { buildRestaurantSearchIndexRows } from "../../../scripts/restaurant-search-index.mjs";
import { buildRestaurantRepository } from "../../../scripts/scrape-restaurants.mjs";

type JsonRecord = Record<string, unknown>;
type SearchIndexWriteRequest = NonNullable<
  NonNullable<BatchWriteCommandInput["RequestItems"]>[string]
>[number];

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const prefix = process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data";

export const handler: EventBridgeHandler<"Scheduled Event", null, void> = async () => {
  const bucket = getRestaurantDataBucketName();
  const previousRepository = combinePreviousKnownGoodRepositories(
    bundledRestaurantRepository,
    await readJsonFromS3(`${prefix}/latest.json`, bucket),
  );
  const { repository, run } = await buildRestaurantRepository({
    args: {
      source: "scheduled-lambda",
      seedFallback: "bundled-generated",
    },
    previousRepository,
  });
  const timestamp = repository.generatedAt.replace(/[:.]/g, "-");
  const previousIndexRows = buildRestaurantSearchIndexRows(previousRepository);
  const currentIndexRows = buildRestaurantSearchIndexRows(repository);
  const manifest = {
    generatedAt: repository.generatedAt,
    coverageGate: run.coverageGate,
    failedCount: run.failedCount,
    itemCount: repository.itemCount,
    okCount: run.okCount,
    restaurantCount: repository.restaurantCount,
    restaurantSearchIndexCount: currentIndexRows.length,
    snapshotVersion: repository.snapshotVersion,
    sourceCount: run.sourceCount,
  };

  await Promise.all([
    putJson(`${prefix}/runs/${timestamp}.json`, repository, bucket),
    putJson(`${prefix}/manifests/${timestamp}.json`, manifest, bucket),
    putJson(`${prefix}/latest.json`, repository, bucket),
    ...repository.restaurants.map((restaurant: { id: string }) =>
      putJson(`${prefix}/restaurants/${restaurant.id}/latest.json`, restaurant, bucket),
    ),
    syncRestaurantSearchIndex(previousIndexRows, currentIndexRows),
  ]);

  console.log(JSON.stringify(manifest));
};

async function readJsonFromS3(key: string, bucket: string): Promise<JsonRecord | null> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await response.Body?.transformToString();
    return body ? (JSON.parse(body) as JsonRecord) : null;
  } catch (error) {
    console.warn(`No previous restaurant snapshot found at ${key}`, error);
    return null;
  }
}

async function putJson(key: string, body: unknown, bucket: string) {
  await s3.send(
    new PutObjectCommand({
      Body: `${JSON.stringify(body, null, 2)}\n`,
      Bucket: bucket,
      ContentType: "application/json",
      Key: key,
    }),
  );
}

async function syncRestaurantSearchIndex(
  previousRows: Record<string, unknown>[],
  currentRows: Record<string, unknown>[],
) {
  const tableName = process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME;

  if (!tableName) {
    throw new Error("Missing RESTAURANT_SEARCH_INDEX_TABLE_NAME.");
  }

  const previousByKey = new Map(previousRows.map((row) => [`${row.pk}:${row.sk}`, row]));
  const currentByKey = new Map(currentRows.map((row) => [`${row.pk}:${row.sk}`, row]));
  const writes: SearchIndexWriteRequest[] = [];

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

  for (const row of currentRows) {
    writes.push({
      PutRequest: {
        Item: row,
      },
    });
  }

  for (let index = 0; index < writes.length; index += 25) {
    await batchWriteAll(tableName, writes.slice(index, index + 25));
  }
}

async function batchWriteAll(tableName: string, requests: SearchIndexWriteRequest[]) {
  let requestItems: NonNullable<BatchWriteCommandInput["RequestItems"]> = {
    [tableName]: requests,
  };

  while (requestItems[tableName]?.length > 0) {
    const response = await dynamo.send(new BatchWriteCommand({ RequestItems: requestItems }));
    requestItems = {
      [tableName]: response.UnprocessedItems?.[tableName] ?? [],
    };
  }
}

function getRestaurantDataBucketName() {
  const explicit = process.env.RESTAURANT_DATA_BUCKET_NAME;

  if (explicit) {
    return explicit;
  }

  const generatedEntry = Object.entries(process.env).find(
    ([key, value]) => key.endsWith("_BUCKET_NAME") && key.includes("RESTAURANT") && value,
  );

  if (generatedEntry?.[1]) {
    return generatedEntry[1];
  }

  throw new Error("Missing restaurant data bucket environment variable.");
}
