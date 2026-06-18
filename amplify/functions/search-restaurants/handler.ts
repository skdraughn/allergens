import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import {
  encodeGeohash,
  nationalLocationId,
  normalizeSearchText,
} from "../../../scripts/restaurant-search-index.mjs";

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

type SearchOperation = "getRestaurantSnapshotPath" | "listNearbyRestaurants" | "searchRestaurants";

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

    return {
      results: await queryRows("POPULAR#GLOBAL", limit),
    };
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
    return {
      results: await queryRows("POPULAR#GLOBAL", limit),
    };
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

  return {
    results: await queryRows("POPULAR#GLOBAL", limit),
  };
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

async function queryRows(pk: string, limit: number) {
  const tableName = getTableName();
  const result = await dynamo.send(
    new QueryCommand({
      ExpressionAttributeValues: {
        ":pk": pk,
      },
      KeyConditionExpression: "pk = :pk",
      Limit: limit,
      TableName: tableName,
    }),
  );

  return result.Items ?? [];
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

function limitFromBody(body: Record<string, unknown>) {
  const value = numberFromBody(body.limit);
  return Math.min(Math.max(value ?? 24, 1), 50);
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
