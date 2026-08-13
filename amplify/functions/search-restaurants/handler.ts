import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  encodeGeohash,
  nationalLocationId,
  normalizeSearchText,
} from "../../../scripts/restaurant-search-index.mjs";
import { evaluateRestaurantRefresh } from "../../../scripts/restaurant-refresh-policy.mjs";

type LambdaEvent = {
  body?: string | Record<string, unknown> | null;
  httpMethod?: string;
  isBase64Encoded?: boolean;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
};

type SearchOperation =
  | "getRestaurantSnapshotPath"
  | "listNearbyRestaurants"
  | "recordRestaurantVisit"
  | "searchRestaurants";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const handler = async (event: LambdaEvent) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod;

  if (method === "OPTIONS") {
    return response(200, {});
  }

  if (method && method !== "POST") {
    return response(405, { message: "Method not allowed." });
  }

  try {
    const body = getJsonBody(event);
    const operation = operationFromBody(body);

    if (operation === "getRestaurantSnapshotPath") {
      return response(200, await getRestaurantSnapshotPath(body));
    }

    if (operation === "listNearbyRestaurants") {
      return response(200, await listNearbyRestaurants(body));
    }

    if (operation === "recordRestaurantVisit") {
      return response(200, await recordRestaurantVisit(body));
    }

    return response(200, await searchRestaurants(body));
  } catch (error) {
    console.error(error);
    return response(500, {
      message: error instanceof Error ? error.message : "Unable to search restaurants.",
    });
  }
};

async function searchRestaurants(body: Record<string, unknown>) {
  const query = normalizeSearchText(body.query);
  const limit = limitFromBody(body);
  const lat = numberFromBody(body.lat);
  const lng = numberFromBody(body.lng);

  if (!query) {
    if (lat !== null && lng !== null) {
      return listNearbyRestaurants(body);
    }

    return queryPage("POPULAR#GLOBAL", limit, pageTokenFromBody(body));
  }

  const tokens = tokensForQuery(query);
  const seen = new Set<string>();
  const results = [];

  for (const token of tokens) {
    const rows = await queryRows(`TOKEN#${token}`, limit * 2);

    for (const row of rows) {
      const key = `${row.restaurantId}:${row.locationId}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(withDistance(row, lat, lng));

      if (results.length >= limit) {
        return { results };
      }
    }
  }

  return { results };
}

async function listNearbyRestaurants(body: Record<string, unknown>) {
  const lat = numberFromBody(body.lat);
  const lng = numberFromBody(body.lng);
  const limit = limitFromBody(body);

  if (lat === null || lng === null) {
    return queryPage("POPULAR#GLOBAL", limit, pageTokenFromBody(body));
  }

  const geohashes = nearbyGeohashes(lat, lng);
  const seen = new Set<string>();
  const results = [];

  for (const geohash of geohashes) {
    const rows = await queryRows(`GEO#${geohash}`, limit * 2);

    for (const row of rows) {
      const key = `${row.restaurantId}:${row.locationId}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(withDistance(row, lat, lng));
    }
  }

  results.sort((left, right) => {
    const leftDistance = typeof left.distanceMiles === "number" ? left.distanceMiles : Infinity;
    const rightDistance = typeof right.distanceMiles === "number" ? right.distanceMiles : Infinity;
    return leftDistance - rightDistance || Number(left.rank ?? 9999) - Number(right.rank ?? 9999);
  });

  if (results.length > 0) {
    return { results: results.slice(0, limit) };
  }

  return queryPage("POPULAR#GLOBAL", limit, pageTokenFromBody(body));
}

async function getRestaurantSnapshotPath(body: Record<string, unknown>) {
  const restaurantId = stringFromBody(body.restaurantId);
  const locationId = stringFromBody(body.locationId) ?? nationalLocationId;

  if (!restaurantId) {
    throw new Error("restaurantId is required.");
  }

  const tableName = getTableName();
  const result = await dynamo.send(
    new GetCommand({
      Key: {
        pk: `META#${restaurantId}#${locationId}`,
        sk: "METADATA",
      },
      TableName: tableName,
    }),
  );

  if (!result.Item) {
    return {
      locationId,
      restaurantId,
      snapshotPath: `${process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data"}/restaurants/${restaurantId}/latest.json`,
    };
  }

  return {
    locationId,
    restaurantId,
    snapshotPath: result.Item.snapshotPath,
  };
}

async function recordRestaurantVisit(body: Record<string, unknown>) {
  const restaurantId = stringFromBody(body.restaurantId);
  const locationId = stringFromBody(body.locationId) ?? nationalLocationId;

  if (!restaurantId) {
    throw new Error("restaurantId is required.");
  }

  const tableName = getTableName();
  const now = new Date().toISOString();
  const key = {
    pk: `META#${restaurantId}#${locationId}`,
    sk: "METADATA",
  };
  const metaResult = await dynamo.send(
    new GetCommand({
      Key: key,
      TableName: tableName,
    }),
  );

  if (!metaResult.Item) {
    return {
      locationId,
      queued: false,
      reason: "missing-meta",
      restaurantId,
      snapshotPath: `${process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data"}/restaurants/${restaurantId}/latest.json`,
      stale: false,
    };
  }

  const evaluation = evaluateRestaurantRefresh(metaResult.Item, now);

  await dynamo.send(
    new UpdateCommand({
      ExpressionAttributeNames: {
        "#lastOpenedAt": "lastOpenedAt",
        "#openedCount": "openedCount",
      },
      ExpressionAttributeValues: {
        ":increment": 1,
        ":now": now,
        ":zero": 0,
      },
      Key: key,
      TableName: tableName,
      UpdateExpression:
        "SET #lastOpenedAt = :now, #openedCount = if_not_exists(#openedCount, :zero) + :increment",
    }),
  );

  const refreshJobsDisabled = process.env.DISABLE_RESTAURANT_REFRESH_JOBS !== "false";

  if (evaluation.shouldQueue && !refreshJobsDisabled) {
    await upsertRefreshJob({
      locationId,
      meta: metaResult.Item,
      now,
      reason: evaluation.reason,
      restaurantId,
    });
  }

  return {
    locationId,
    queued: evaluation.shouldQueue && !refreshJobsDisabled,
    reason: refreshJobsDisabled && evaluation.shouldQueue ? "automatic-refresh-disabled" : evaluation.reason,
    restaurantId,
    snapshotPath: evaluation.snapshotPath ?? metaResult.Item.snapshotPath,
    stale: evaluation.stale,
  };
}

async function upsertRefreshJob({
  locationId,
  meta,
  now,
  reason,
  restaurantId,
}: {
  locationId: string;
  meta: Record<string, unknown>;
  now: string;
  reason: string;
  restaurantId: string;
}) {
  const tableName = getRefreshJobsTableName();
  const jobId = `${restaurantId}#${locationId}`;
  const sourceUrls = Array.isArray(meta.sourceUrls)
    ? meta.sourceUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
  const status = reason === "needs-source" ? "manual-review" : "queued";
  const nextRunAt = status === "queued" ? now : "9999-12-31T23:59:59.999Z";

  try {
    await dynamo.send(
      new PutCommand({
        ConditionExpression:
          "attribute_not_exists(jobId) OR #status IN (:succeeded, :failed, :skipped)",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":failed": "failed",
          ":skipped": "skipped",
          ":succeeded": "succeeded",
        },
        Item: {
          attemptCount: Number(meta.attemptCount ?? 0),
          createdAt: now,
          guideUrl: meta.guideUrl ?? null,
          jobId,
          lastRefreshedAt: meta.lastRefreshedAt ?? null,
          locationId,
          nextRunAt,
          priority: reason === "needs-source" ? 20 : 50,
          reason,
          restaurantId,
          restaurantName: meta.name ?? null,
          snapshotPath:
            meta.snapshotPath ??
            `${process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data"}/restaurants/${restaurantId}/latest.json`,
          sourceUrls,
          status,
          type: meta.type ?? "local",
          updatedAt: now,
        },
        TableName: tableName,
      }),
    );
    await dynamo.send(
      new UpdateCommand({
        ExpressionAttributeNames: {
          "#refreshStatus": "refreshStatus",
        },
        ExpressionAttributeValues: {
          ":nextEligibleRefreshAt": nextRunAt,
          ":now": now,
          ":status": status,
        },
        Key: {
          pk: `META#${restaurantId}#${locationId}`,
          sk: "METADATA",
        },
        TableName: getTableName(),
        UpdateExpression:
          "SET #refreshStatus = :status, refreshQueuedAt = :now, nextEligibleRefreshAt = :nextEligibleRefreshAt",
      }),
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return;
    }

    throw error;
  }
}

async function queryRows(pk: string, limit: number) {
  const page = await queryPage(pk, limit);
  return page.results;
}

async function queryPage(pk: string, limit: number, nextToken?: string | null) {
  const tableName = getTableName();
  const result = await dynamo.send(
    new QueryCommand({
      ExclusiveStartKey: decodePageToken(nextToken),
      ExpressionAttributeValues: {
        ":pk": pk,
      },
      KeyConditionExpression: "pk = :pk",
      Limit: limit,
      TableName: tableName,
    }),
  );

  return {
    nextToken: encodePageToken(result.LastEvaluatedKey),
    results: await hydrateRestaurantRows(result.Items ?? []),
  };
}

async function hydrateRestaurantRows(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return [];
  }

  const tableName = getTableName();
  const keysById = new Map<string, { pk: string; sk: string }>();

  for (const row of rows) {
    const restaurantId = stringFromBody(row.restaurantId);
    const locationId = stringFromBody(row.locationId) ?? nationalLocationId;

    if (!restaurantId) {
      continue;
    }

    keysById.set(`${restaurantId}\u0000${locationId}`, {
      pk: `META#${restaurantId}#${locationId}`,
      sk: "METADATA",
    });
  }

  const metadataRows = await batchGetAll(tableName, Array.from(keysById.values()));
  const metadataById = new Map(
    metadataRows.map((row) => [
      `${String(row.restaurantId)}\u0000${String(row.locationId ?? nationalLocationId)}`,
      row,
    ]),
  );

  return rows.flatMap((row) => {
    const restaurantId = stringFromBody(row.restaurantId);
    const locationId = stringFromBody(row.locationId) ?? nationalLocationId;
    const metadata = restaurantId
      ? metadataById.get(`${restaurantId}\u0000${locationId}`)
      : undefined;

    if (metadata) {
      return [metadata];
    }

    // Full legacy lookup rows remain valid during a rolling index migration.
    return typeof row.name === "string" ? [row] : [];
  });
}

async function batchGetAll(tableName: string, keys: { pk: string; sk: string }[]) {
  const items: Record<string, unknown>[] = [];

  for (let index = 0; index < keys.length; index += 100) {
    let pending = keys.slice(index, index + 100);

    while (pending.length > 0) {
      const result = await dynamo.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: pending,
            },
          },
        }),
      );
      items.push(...(result.Responses?.[tableName] ?? []));
      pending = (result.UnprocessedKeys?.[tableName]?.Keys ?? []) as {
        pk: string;
        sk: string;
      }[];
    }
  }

  return items;
}

function nearbyGeohashes(lat: number, lng: number) {
  const delta = 0.03;
  const hashes = new Set<string>();

  for (const nextLat of [lat - delta, lat, lat + delta]) {
    for (const nextLng of [lng - delta, lng, lng + delta]) {
      hashes.add(encodeGeohash(nextLat, nextLng, 6));
    }
  }

  return Array.from(hashes);
}

function tokensForQuery(query: string) {
  const compact = query.replace(/\s+/g, "");
  return Array.from(new Set([query, compact].filter(Boolean)));
}

function withDistance(row: Record<string, unknown>, lat: number | null, lng: number | null) {
  const rowLat = numberFromValue(row.lat);
  const rowLng = numberFromValue(row.lng);

  if (lat === null || lng === null || rowLat === null || rowLng === null) {
    return row;
  }

  return {
    ...row,
    distanceMiles: distanceMiles(lat, lng, rowLat, rowLng),
  };
}

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return Math.round(radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getJsonBody(event: LambdaEvent) {
  if (!event.body) {
    return {} as Record<string, unknown>;
  }

  if (typeof event.body === "object") {
    return event.body;
  }

  const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function response(statusCode: number, payload: Record<string, unknown>) {
  return {
    body: JSON.stringify(payload),
    headers: {
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "OPTIONS,POST",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    statusCode,
  };
}

function operationFromBody(body: Record<string, unknown>): SearchOperation {
  return body.operation === "getRestaurantSnapshotPath" ||
    body.operation === "listNearbyRestaurants" ||
    body.operation === "recordRestaurantVisit" ||
    body.operation === "searchRestaurants"
    ? body.operation
    : "searchRestaurants";
}

function getTableName() {
  const tableName = process.env.RESTAURANT_SEARCH_INDEX_TABLE_NAME;

  if (!tableName) {
    throw new Error("RESTAURANT_SEARCH_INDEX_TABLE_NAME is not configured.");
  }

  return tableName;
}

function getRefreshJobsTableName() {
  const tableName = process.env.RESTAURANT_REFRESH_JOBS_TABLE_NAME;

  if (!tableName) {
    throw new Error("RESTAURANT_REFRESH_JOBS_TABLE_NAME is not configured.");
  }

  return tableName;
}

function limitFromBody(body: Record<string, unknown>) {
  const value = numberFromBody(body.limit);
  return Math.min(Math.max(value ?? 24, 1), 100);
}

function pageTokenFromBody(body: Record<string, unknown>) {
  return stringFromBody(body.nextToken);
}

function encodePageToken(key: Record<string, unknown> | undefined) {
  if (!key) {
    return null;
  }

  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodePageToken(token?: string | null) {
  if (!token) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function numberFromBody(value: unknown) {
  return numberFromValue(value);
}

function numberFromValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFromBody(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
