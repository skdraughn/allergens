import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  type UpdateCommandOutput,
} from "@aws-sdk/lib-dynamodb";

type DynamoDbAttribute =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { M: Record<string, DynamoDbAttribute> }
  | { L: DynamoDbAttribute[] }
  | { SS: string[] }
  | { NS: string[] };

type DynamoDbStreamRecord = {
  dynamodb?: {
    NewImage?: Record<string, DynamoDbAttribute>;
    OldImage?: Record<string, DynamoDbAttribute>;
  };
  eventName?: "INSERT" | "MODIFY" | "REMOVE" | string;
};

type DynamoDbStreamEvent = {
  Records?: DynamoDbStreamRecord[];
};

type ReviewRecord = {
  rating?: number;
  restaurantId?: string;
  status?: string;
};

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const handler = async (event: DynamoDbStreamEvent) => {
  const tableName = getSummaryTableName();
  let updated = 0;

  for (const record of event.Records ?? []) {
    const before = decodeReview(record.dynamodb?.OldImage);
    const after = decodeReview(record.dynamodb?.NewImage);
    const restaurantId = after.restaurantId ?? before.restaurantId;

    if (!restaurantId) {
      continue;
    }

    const beforeContribution = approvedContribution(before);
    const afterContribution = approvedContribution(after);
    const countDelta = afterContribution.count - beforeContribution.count;
    const ratingTotalDelta = afterContribution.ratingTotal - beforeContribution.ratingTotal;

    if (countDelta === 0 && ratingTotalDelta === 0) {
      continue;
    }

    const result = await addSummaryDeltas(tableName, restaurantId, countDelta, ratingTotalDelta);
    await normalizeSummary(tableName, restaurantId, result);
    updated += 1;
  }

  return { ok: true, updated };
};

function decodeReview(image?: Record<string, DynamoDbAttribute>): ReviewRecord {
  if (!image) {
    return {};
  }

  const decoded = decodeImage(image) as Record<string, unknown>;
  const rating = Number(decoded.rating);

  return {
    rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : undefined,
    restaurantId: typeof decoded.restaurantId === "string" ? decoded.restaurantId : undefined,
    status: typeof decoded.status === "string" ? decoded.status : undefined,
  };
}

function approvedContribution(record: ReviewRecord) {
  if (record.status !== "approved" || !record.rating) {
    return { count: 0, ratingTotal: 0 };
  }

  return { count: 1, ratingTotal: record.rating };
}

async function addSummaryDeltas(
  tableName: string,
  restaurantId: string,
  reviewCountDelta: number,
  ratingTotalDelta: number,
) {
  return dynamo.send(
    new UpdateCommand({
      ExpressionAttributeNames: {
        "#averageRating": "averageRating",
        "#ratingTotal": "ratingTotal",
        "#restaurantId": "restaurantId",
        "#reviewCount": "reviewCount",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":averageRating": null,
        ":now": new Date().toISOString(),
        ":one": 1,
        ":ratingTotalDelta": ratingTotalDelta,
        ":restaurantId": restaurantId,
        ":reviewCountDelta": reviewCountDelta,
        ":zero": 0,
      },
      Key: { restaurantId },
      ReturnValues: "ALL_NEW",
      TableName: tableName,
      UpdateExpression:
        "SET #restaurantId = :restaurantId, #updatedAt = :now, #averageRating = if_not_exists(#averageRating, :averageRating) ADD #reviewCount :reviewCountDelta, #ratingTotal :ratingTotalDelta",
    }),
  );
}

async function normalizeSummary(
  tableName: string,
  restaurantId: string,
  result: UpdateCommandOutput,
) {
  const reviewCount = Math.max(0, Number(result.Attributes?.reviewCount ?? 0));
  const ratingTotal = Math.max(0, Number(result.Attributes?.ratingTotal ?? 0));
  const averageRating = reviewCount > 0 ? Math.round((ratingTotal / reviewCount) * 10) / 10 : null;

  await dynamo.send(
    new UpdateCommand({
      ExpressionAttributeNames: {
        "#averageRating": "averageRating",
        "#ratingTotal": "ratingTotal",
        "#reviewCount": "reviewCount",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":averageRating": averageRating,
        ":now": new Date().toISOString(),
        ":ratingTotal": ratingTotal,
        ":reviewCount": reviewCount,
      },
      Key: { restaurantId },
      TableName: tableName,
      UpdateExpression:
        "SET #averageRating = :averageRating, #reviewCount = :reviewCount, #ratingTotal = :ratingTotal, #updatedAt = :now",
    }),
  );
}

function decodeImage(image: Record<string, DynamoDbAttribute>) {
  return Object.fromEntries(
    Object.entries(image).map(([key, value]) => [key, decodeAttribute(value)]),
  );
}

function decodeAttribute(attribute: DynamoDbAttribute): unknown {
  if ("S" in attribute) {
    return attribute.S;
  }

  if ("N" in attribute) {
    return Number(attribute.N);
  }

  if ("BOOL" in attribute) {
    return attribute.BOOL;
  }

  if ("NULL" in attribute) {
    return null;
  }

  if ("M" in attribute) {
    return decodeImage(attribute.M);
  }

  if ("L" in attribute) {
    return attribute.L.map(decodeAttribute);
  }

  if ("SS" in attribute) {
    return attribute.SS;
  }

  if ("NS" in attribute) {
    return attribute.NS.map(Number);
  }

  return null;
}

function getSummaryTableName() {
  const tableName = process.env.RESTAURANT_ALLERGY_RATING_SUMMARY_TABLE_NAME;

  if (!tableName) {
    throw new Error("Missing RESTAURANT_ALLERGY_RATING_SUMMARY_TABLE_NAME");
  }

  return tableName;
}
