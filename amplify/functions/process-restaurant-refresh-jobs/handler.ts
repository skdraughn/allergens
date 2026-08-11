import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { EventBridgeHandler } from "aws-lambda";

import { buildRestaurantRepository } from "../../../scripts/pipeline/build-repository.mjs";
import {
  buildRestaurantSearchIndexRows,
  nationalLocationId,
} from "../../../scripts/restaurant-search-index.mjs";
import { nextRetryAt } from "../../../scripts/restaurant-refresh-policy.mjs";
import { restaurantSources } from "../../../scripts/restaurant-sources.mjs";

type RefreshJob = {
  attemptCount?: number;
  guideUrl?: string;
  jobId: string;
  locationId?: string;
  restaurantId?: string;
  snapshotPath?: string;
  sourceUrls?: string[];
  status?: string;
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
  if (process.env.DISABLE_RESTAURANT_REFRESH_JOB_PROCESSING !== "false") {
    console.log(
      JSON.stringify({
        disabled: true,
        processed: 0,
        reason: "automatic-refresh-disabled",
      }),
    );
    return;
  }

  const jobs = await getDueJobs();
  const results = [];

  for (const job of jobs) {
    results.push(await processJob(job));
  }

  console.log(
    JSON.stringify({
      processed: results.length,
      results,
    }),
  );
};

async function getDueJobs() {
  const now = new Date().toISOString();
  const tableName = getRefreshJobsTableName();
  const batchSize = getBatchSize();
  const result = await dynamo.send(
    new QueryCommand({
      ExpressionAttributeValues: {
        ":now": now,
        ":queued": "queued",
      },
      IndexName: "StatusNextRunAtIndex",
      KeyConditionExpression: "#status = :queued AND nextRunAt <= :now",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      Limit: batchSize,
      ScanIndexForward: true,
      TableName: tableName,
    }),
  );

  return (result.Items ?? []) as RefreshJob[];
}

async function processJob(job: RefreshJob) {
  const now = new Date().toISOString();
  const jobId = job.jobId;
  const restaurantId = job.restaurantId ?? jobId.split("#")[0];
  const locationId = job.locationId ?? jobId.split("#")[1] ?? nationalLocationId;
  const attemptCount = Number(job.attemptCount ?? 0);

  if (!restaurantId) {
    return { jobId, status: "skipped", reason: "missing-restaurant-id" };
  }

  const locked = await markRunning(jobId, now);

  if (!locked) {
    return { jobId, status: "skipped", reason: "already-claimed" };
  }

  try {
    const meta = await getRestaurantMeta(restaurantId, locationId);

    if (!meta) {
      await markJobManualReview({
        attemptCount,
        jobId,
        lastError: "Restaurant search metadata row was not found.",
        now,
        restaurantId,
        locationId,
      });
      return { jobId, restaurantId, status: "manual-review", reason: "missing-meta" };
    }

    const sourceUrls = Array.isArray(meta.sourceUrls)
      ? meta.sourceUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    const hasSource = Boolean(meta.guideUrl || sourceUrls.length > 0);

    if (!hasSource) {
      await markJobManualReview({
        attemptCount,
        jobId,
        lastError: "No official source URL is stored for automated local refresh.",
        now,
        restaurantId,
        locationId,
      });
      return { jobId, restaurantId, status: "manual-review", reason: "needs-source" };
    }

    if (!hasConfiguredAdapter(restaurantId)) {
      await markJobManualReview({
        attemptCount,
        jobId,
        lastError:
          "Official source exists, but automated local restaurant source adapters are not configured yet.",
        now,
        restaurantId,
        locationId,
      });
      return { jobId, restaurantId, status: "manual-review", reason: "adapter-needed" };
    }

    const refreshed = await refreshConfiguredRestaurant({
      locationId,
      meta,
      now,
      restaurantId,
    });

    await markJobSucceeded({
      itemCount: refreshed.itemCount,
      jobId,
      locationId,
      now,
      restaurantId,
      snapshotPath: refreshed.snapshotPath,
    });
    return {
      itemCount: refreshed.itemCount,
      jobId,
      restaurantId,
      snapshotPath: refreshed.snapshotPath,
      status: "succeeded",
    };
  } catch (error) {
    const lastError = error instanceof Error ? error.message : "Unable to process refresh job.";
    await markJobFailed({
      attemptCount,
      jobId,
      lastError,
      now,
      restaurantId,
      locationId,
    });
    return { jobId, restaurantId, status: "failed", reason: lastError };
  }
}

async function refreshConfiguredRestaurant({
  locationId,
  meta,
  now,
  restaurantId,
}: {
  locationId: string;
  meta: Record<string, unknown>;
  now: string;
  restaurantId: string;
}) {
  const bucket = getRestaurantDataBucketName();
  const snapshotPath =
    typeof meta.snapshotPath === "string" && meta.snapshotPath.trim()
      ? meta.snapshotPath.trim()
      : `${prefix}/restaurants/${restaurantId}/latest.json`;
  const previousRestaurant = await readJsonFromS3(snapshotPath, bucket);
  const previousRepository = previousRestaurant
    ? {
        generatedAt: String(previousRestaurant.sourceUpdatedAt ?? now),
        restaurants: [previousRestaurant],
        snapshotVersion: Number(previousRestaurant.snapshotVersion ?? 1),
      }
    : null;
  const { repository } = await buildRestaurantRepository({
    args: {
      source: "restaurant-refresh-job",
      restaurantId,
      locationId,
    },
    chainFilter: [restaurantId],
    previousRepository,
  });
  const restaurant = repository.restaurants?.find((entry: { id?: string }) => entry.id === restaurantId);

  if (!restaurant || !Array.isArray(restaurant.items) || restaurant.items.length === 0) {
    throw new Error("Configured adapter did not return a publishable restaurant snapshot.");
  }

  const refreshedRestaurant = {
    ...restaurant,
    address: meta.address ?? restaurant.address,
    city: meta.city ?? restaurant.city,
    country: meta.country ?? restaurant.country,
    displayAddress: meta.displayAddress ?? restaurant.displayAddress,
    lastRefreshedAt: now,
    lat: typeof meta.lat === "number" ? meta.lat : restaurant.lat,
    lng: typeof meta.lng === "number" ? meta.lng : restaurant.lng,
    locationId,
    nextEligibleRefreshAt: null,
    openedCount: meta.openedCount ?? restaurant.openedCount,
    refreshStatus: "succeeded",
    refreshTier: meta.refreshTier ?? restaurant.refreshTier,
    region: meta.region ?? restaurant.region,
    snapshotPath,
    type: meta.type ?? restaurant.type,
  };
  const previousRows = previousRestaurant
    ? buildRestaurantSearchIndexRows({
        generatedAt: String(previousRestaurant.sourceUpdatedAt ?? now),
        restaurants: [previousRestaurant],
      })
    : [];
  const currentRows = buildRestaurantSearchIndexRows({
    generatedAt: now,
    restaurants: [refreshedRestaurant],
  });

  await Promise.all([
    putJson(snapshotPath, refreshedRestaurant, bucket),
    syncRestaurantSearchIndexForRestaurant(previousRows, currentRows, restaurantId, locationId),
  ]);

  return {
    itemCount: refreshedRestaurant.items.length,
    snapshotPath,
  };
}

async function markRunning(jobId: string, now: string) {
  try {
    await dynamo.send(
      new UpdateCommand({
        ConditionExpression: "#status = :queued",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":now": now,
          ":queued": "queued",
          ":running": "running",
        },
        Key: { jobId },
        TableName: getRefreshJobsTableName(),
        UpdateExpression: "SET #status = :running, lastRunAt = :now, updatedAt = :now",
      }),
    );
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return false;
    }

    throw error;
  }
}

async function getRestaurantMeta(restaurantId: string, locationId: string) {
  const result = await dynamo.send(
    new GetCommand({
      Key: {
        pk: `META#${restaurantId}#${locationId}`,
        sk: "METADATA",
      },
      TableName: getSearchIndexTableName(),
    }),
  );

  return result.Item ?? null;
}

async function markJobManualReview({
  attemptCount,
  jobId,
  lastError,
  locationId,
  now,
  restaurantId,
}: {
  attemptCount: number;
  jobId: string;
  lastError: string;
  locationId: string;
  now: string;
  restaurantId: string;
}) {
  const nextEligibleRefreshAt = "9999-12-31T23:59:59.999Z";

  await Promise.all([
    dynamo.send(
      new UpdateCommand({
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":attemptCount": attemptCount + 1,
          ":lastError": lastError,
          ":nextRunAt": nextEligibleRefreshAt,
          ":now": now,
          ":status": "manual-review",
        },
        Key: { jobId },
        TableName: getRefreshJobsTableName(),
        UpdateExpression:
          "SET #status = :status, attemptCount = :attemptCount, lastError = :lastError, lastFailedAt = :now, nextRunAt = :nextRunAt, updatedAt = :now",
      }),
    ),
    updateRestaurantRefreshStatus({
      lastError,
      locationId,
      nextEligibleRefreshAt,
      now,
      restaurantId,
      status: "manual-review",
    }),
  ]);
}

async function markJobFailed({
  attemptCount,
  jobId,
  lastError,
  locationId,
  now,
  restaurantId,
}: {
  attemptCount: number;
  jobId: string;
  lastError: string;
  locationId: string;
  now: string;
  restaurantId: string;
}) {
  const nextRunAt = nextRetryAt(attemptCount, now);

  await Promise.all([
    dynamo.send(
      new UpdateCommand({
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":attemptCount": attemptCount + 1,
          ":lastError": lastError,
          ":nextRunAt": nextRunAt,
          ":now": now,
          ":status": "queued",
        },
        Key: { jobId },
        TableName: getRefreshJobsTableName(),
        UpdateExpression:
          "SET #status = :status, attemptCount = :attemptCount, lastError = :lastError, lastFailedAt = :now, nextRunAt = :nextRunAt, updatedAt = :now",
      }),
    ),
    updateRestaurantRefreshStatus({
      lastError,
      locationId,
      nextEligibleRefreshAt: nextRunAt,
      now,
      restaurantId,
      status: "failed",
    }),
  ]);
}

async function markJobSucceeded({
  itemCount,
  jobId,
  locationId,
  now,
  restaurantId,
  snapshotPath,
}: {
  itemCount: number;
  jobId: string;
  locationId: string;
  now: string;
  restaurantId: string;
  snapshotPath: string;
}) {
  const nextEligibleRefreshAt = new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString();

  await Promise.all([
    dynamo.send(
      new UpdateCommand({
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":attemptCount": 0,
          ":itemCount": itemCount,
          ":nextRunAt": nextEligibleRefreshAt,
          ":now": now,
          ":snapshotPath": snapshotPath,
          ":status": "succeeded",
        },
        Key: { jobId },
        TableName: getRefreshJobsTableName(),
        UpdateExpression:
          "SET #status = :status, attemptCount = :attemptCount, lastSucceededAt = :now, lastRunAt = :now, nextRunAt = :nextRunAt, snapshotPath = :snapshotPath, itemCount = :itemCount, updatedAt = :now REMOVE lastError",
      }),
    ),
    dynamo.send(
      new UpdateCommand({
        ExpressionAttributeNames: {
          "#refreshStatus": "refreshStatus",
        },
        ExpressionAttributeValues: {
          ":lastRefreshedAt": now,
          ":nextEligibleRefreshAt": nextEligibleRefreshAt,
          ":snapshotPath": snapshotPath,
          ":status": "succeeded",
        },
        Key: {
          pk: `META#${restaurantId}#${locationId}`,
          sk: "METADATA",
        },
        TableName: getSearchIndexTableName(),
        UpdateExpression:
          "SET #refreshStatus = :status, lastRefreshedAt = :lastRefreshedAt, nextEligibleRefreshAt = :nextEligibleRefreshAt, snapshotPath = :snapshotPath REMOVE lastRefreshError",
      }),
    ),
  ]);
}

async function updateRestaurantRefreshStatus({
  lastError,
  locationId,
  nextEligibleRefreshAt,
  now,
  restaurantId,
  status,
}: {
  lastError: string;
  locationId: string;
  nextEligibleRefreshAt: string;
  now: string;
  restaurantId: string;
  status: string;
}) {
  await dynamo.send(
    new UpdateCommand({
      ExpressionAttributeNames: {
        "#refreshStatus": "refreshStatus",
      },
      ExpressionAttributeValues: {
        ":lastError": lastError,
        ":nextEligibleRefreshAt": nextEligibleRefreshAt,
        ":now": now,
        ":status": status,
      },
      Key: {
        pk: `META#${restaurantId}#${locationId}`,
        sk: "METADATA",
      },
      TableName: getSearchIndexTableName(),
      UpdateExpression:
        "SET #refreshStatus = :status, lastRefreshError = :lastError, lastFailedAt = :now, nextEligibleRefreshAt = :nextEligibleRefreshAt",
    }),
  );
}

function getBatchSize() {
  const parsed = Number(process.env.RESTAURANT_REFRESH_JOB_BATCH_SIZE);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 25)) : 10;
}

function getRefreshJobsTableName() {
  const tableName = process.env.RESTAURANT_REFRESH_JOBS_TABLE_NAME;

  if (!tableName) {
    throw new Error("RESTAURANT_REFRESH_JOBS_TABLE_NAME is not configured.");
  }

  return tableName;
}

function getSearchIndexTableName() {
  const tableName = process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME;

  if (!tableName) {
    throw new Error("RESTAURANT_SEARCH_INDEX_TABLE_NAME is not configured.");
  }

  return tableName;
}

async function readJsonFromS3(key: string, bucket: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await response.Body?.transformToString();
    return body ? (JSON.parse(body) as Record<string, unknown>) : null;
  } catch {
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

async function syncRestaurantSearchIndexForRestaurant(
  previousRows: Record<string, unknown>[],
  currentRows: Record<string, unknown>[],
  restaurantId: string,
  locationId: string,
) {
  const tableName = getSearchIndexTableName();
  const previousScopedRows = previousRows.filter((row) =>
    isRestaurantRow(row, restaurantId, locationId),
  );
  const currentScopedRows = currentRows.filter((row) => isRestaurantRow(row, restaurantId, locationId));
  const previousByKey = new Map(previousScopedRows.map((row) => [`${row.pk}:${row.sk}`, row]));
  const currentByKey = new Map(currentScopedRows.map((row) => [`${row.pk}:${row.sk}`, row]));
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

  for (const row of currentScopedRows) {
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
  if (requests.length === 0) {
    return;
  }

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

function isRestaurantRow(row: Record<string, unknown>, restaurantId: string, locationId: string) {
  return row.restaurantId === restaurantId && (row.locationId ?? nationalLocationId) === locationId;
}

function hasConfiguredAdapter(restaurantId: string) {
  return restaurantSources.some((source) => source.id === restaurantId);
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
