import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AppSyncResolverHandler } from "aws-lambda";

type DeleteAccountResult = boolean;
type DeleteWriteRequest = { DeleteRequest: { Key: { id: string } } };

const cognito = new CognitoIdentityProviderClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const ownedTableEnvironmentKeys = [
  "ALLERGY_PROFILE_TABLE_NAME",
  "RESTAURANT_REQUEST_TABLE_NAME",
  "COMMUNITY_MENU_ITEM_TABLE_NAME",
  "MENU_ITEM_REPORT_TABLE_NAME",
  "COMMUNITY_COMMENT_TABLE_NAME",
  "COMMUNITY_ALLERGY_REVIEW_TABLE_NAME",
  "COMMUNITY_REVIEW_REPORT_TABLE_NAME",
  "BLOCKED_COMMUNITY_USER_TABLE_NAME",
] as const;

export const handler: AppSyncResolverHandler<Record<string, never>, DeleteAccountResult> = async (event) => {
  const identity = event.identity;

  if (!identity || !("sub" in identity) || !("username" in identity)) {
    throw new Error("You must be signed in to delete your account.");
  }

  const sub = String(identity.sub ?? "").trim();
  const username = String(identity.username ?? "").trim();
  const userPoolId = requiredEnvironment("COGNITO_USER_POOL_ID");

  if (!sub || !username) {
    throw new Error("The signed-in account could not be identified.");
  }

  for (const environmentKey of ownedTableEnvironmentKeys) {
    await deleteOwnedRecords(requiredEnvironment(environmentKey), sub, username);
  }

  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }),
  );

  return true;
};

async function deleteOwnedRecords(tableName: string, sub: string, username: string) {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(
      new ScanCommand({
        ExclusiveStartKey: exclusiveStartKey,
        ExpressionAttributeNames: {
          "#createdBy": "createdBy",
          "#id": "id",
          "#owner": "owner",
        },
        ExpressionAttributeValues: {
          ":sub": sub,
          ":username": username,
          ":owner": `${sub}::${username}`,
        },
        FilterExpression:
          "#createdBy = :sub OR #createdBy = :username OR #owner = :sub OR #owner = :username OR #owner = :owner",
        ProjectionExpression: "#id",
        TableName: tableName,
      }),
    );

    const requests = (result.Items ?? [])
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string" && Boolean(id))
      .map((id) => ({ DeleteRequest: { Key: { id } } }));

    await writeAll(tableName, requests);
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
}

async function writeAll(tableName: string, requests: DeleteWriteRequest[]) {
  for (let offset = 0; offset < requests.length; offset += 25) {
    let pending = requests.slice(offset, offset + 25);

    do {
      const result = await dynamo.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: pending } }),
      );
      pending = (result.UnprocessedItems?.[tableName] ?? []) as DeleteWriteRequest[];
    } while (pending.length > 0);
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Account deletion is missing ${name}.`);
  }

  return value;
}
