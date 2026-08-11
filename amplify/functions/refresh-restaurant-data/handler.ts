import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  type BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { EventBridgeHandler } from "aws-lambda";

import { buildRestaurantSearchIndexRows } from "../../../scripts/restaurant-search-index.mjs";
import { buildRestaurantRepository } from "../../../scripts/pipeline/build-repository.mjs";

type JsonRecord = Record<string, unknown>;
type RestaurantSnapshot = {
  id: string;
  items?: unknown[];
  locationId?: string;
  type?: string;
};
type RestaurantRepositorySnapshot = {
  generatedAt: string;
  inferenceVersion?: string;
  itemCount?: number;
  restaurantCount?: number;
  restaurants: RestaurantSnapshot[];
  snapshotVersion: number;
};
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
  if (process.env.DISABLE_RESTAURANT_FULL_REFRESH !== "false") {
    console.log(
      JSON.stringify({
        disabled: true,
        processed: 0,
        reason: "automatic-full-refresh-disabled",
      }),
    );
    return;
  }

  const bucket = getRestaurantDataBucketName();
  const previousRepository = await readJsonFromS3(`${prefix}/latest.json`, bucket);
  const { repository, run } = await buildRestaurantRepository({
    args: {
      source: "scheduled-lambda",
      seedFallback: previousRepository ? "s3-latest" : "none",
    },
    previousRepository: previousRepository ?? undefined,
  });
  const typedRepository = repository as RestaurantRepositorySnapshot;
  const publishedRepository: RestaurantRepositorySnapshot = {
    ...typedRepository,
    itemCount: (typedRepository.restaurants ?? []).reduce(
      (sum, restaurant) => sum + (restaurant.items?.length ?? 0),
      0,
    ),
    restaurantCount: (typedRepository.restaurants ?? []).length,
    restaurants: typedRepository.restaurants ?? [],
  };
  const timestamp = publishedRepository.generatedAt.replace(/[:.]/g, "-");
  const previousIndexRows = buildRestaurantSearchIndexRows(previousRepository);
  const currentIndexRows = buildRestaurantSearchIndexRows(publishedRepository);
  const manifest = {
    generatedAt: publishedRepository.generatedAt,
    coverageGate: run.coverageGate,
    failedCount: run.failedCount,
    itemCount: publishedRepository.itemCount,
    inferenceVersion: publishedRepository.inferenceVersion,
    okCount: run.okCount,
    restaurantCount: publishedRepository.restaurantCount,
    restaurantSearchIndexCount: currentIndexRows.length,
    refreshScope: "full-repository",
    scopedRestaurantCount: publishedRepository.restaurantCount,
    snapshotVersion: publishedRepository.snapshotVersion,
    sourceCount: run.sourceCount,
  };

  await Promise.all([
    putJson(`${prefix}/runs/${timestamp}.json`, publishedRepository, bucket),
    putJson(`${prefix}/manifests/${timestamp}.json`, manifest, bucket),
    putJson(`${prefix}/latest.json`, publishedRepository, bucket),
    ...(publishedRepository.restaurants ?? []).map((restaurant: { id: string }) =>
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

  const previousByKey = new Map(previousRows.map((row) => [searchIndexRowKey(row), row]));
  const currentByKey = new Map(currentRows.map((row) => [searchIndexRowKey(row), row]));
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
    await batchWriteAll(tableName, writes.slice(index, index + 25));
  }
}

function searchIndexRowKey(row: Record<string, unknown>) {
  return `${String(row.pk)}:${String(row.sk)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nextValue]) => `${JSON.stringify(key)}:${stableJson(nextValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
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
