import { defineBackend } from "@aws-amplify/backend";
import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { FunctionUrlAuthType, HttpMethod, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

import { auth } from "./auth/resource.ts";
import { data } from "./data/resource.ts";
import { autoConfirmSignUp } from "./functions/auto-confirm-sign-up/resource.ts";
import { refreshRestaurantData } from "./functions/refresh-restaurant-data/resource.ts";
import { processRestaurantRefreshJobs } from "./functions/process-restaurant-refresh-jobs/resource.ts";
import { notifyCommunitySubmission } from "./functions/notify-community-submission/resource.ts";
import { searchRestaurants } from "./functions/search-restaurants/resource.ts";
import { socialAuthNative } from "./functions/social-auth-native/resource.ts";
import { storage } from "./storage/resource.ts";
import { updateAllergyRatingSummary } from "./functions/update-allergy-rating-summary/resource.ts";

const backend = defineBackend({
  auth,
  autoConfirmSignUp,
  data,
  notifyCommunitySubmission,
  processRestaurantRefreshJobs,
  refreshRestaurantData,
  searchRestaurants,
  socialAuthNative,
  storage,
  updateAllergyRatingSummary,
});

const restaurantSearchStack = backend.createStack("restaurant-search");
const restaurantSearchIndexTable = new Table(
  restaurantSearchStack,
  "RestaurantSearchIndex",
  {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: "pk", type: AttributeType.STRING },
    pointInTimeRecoverySpecification: {
      pointInTimeRecoveryEnabled: true,
    },
    removalPolicy: RemovalPolicy.RETAIN,
    sortKey: { name: "sk", type: AttributeType.STRING },
  },
);
const restaurantRefreshJobsTable = new Table(
  restaurantSearchStack,
  "RestaurantRefreshJobs",
  {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: "jobId", type: AttributeType.STRING },
    pointInTimeRecoverySpecification: {
      pointInTimeRecoveryEnabled: true,
    },
    removalPolicy: RemovalPolicy.RETAIN,
  },
);

restaurantRefreshJobsTable.addGlobalSecondaryIndex({
  indexName: "StatusNextRunAtIndex",
  partitionKey: { name: "status", type: AttributeType.STRING },
  sortKey: { name: "nextRunAt", type: AttributeType.STRING },
});

backend.refreshRestaurantData.addEnvironment(
  "RESTAURANT_SEARCH_INDEX_TABLE_NAME",
  restaurantSearchIndexTable.tableName,
);
backend.searchRestaurants.addEnvironment(
  "RESTAURANT_SEARCH_INDEX_TABLE_NAME",
  restaurantSearchIndexTable.tableName,
);
backend.searchRestaurants.addEnvironment(
  "RESTAURANT_REFRESH_JOBS_TABLE_NAME",
  restaurantRefreshJobsTable.tableName,
);
backend.processRestaurantRefreshJobs.addEnvironment(
  "RESTAURANT_SEARCH_INDEX_TABLE_NAME",
  restaurantSearchIndexTable.tableName,
);
backend.processRestaurantRefreshJobs.addEnvironment(
  "RESTAURANT_REFRESH_JOBS_TABLE_NAME",
  restaurantRefreshJobsTable.tableName,
);
restaurantSearchIndexTable.grantReadWriteData(backend.refreshRestaurantData.resources.lambda);
restaurantSearchIndexTable.grantReadWriteData(backend.searchRestaurants.resources.lambda);
restaurantSearchIndexTable.grantReadWriteData(
  backend.processRestaurantRefreshJobs.resources.lambda,
);
restaurantRefreshJobsTable.grantReadWriteData(backend.searchRestaurants.resources.lambda);
restaurantRefreshJobsTable.grantReadWriteData(
  backend.processRestaurantRefreshJobs.resources.lambda,
);

const communitySubmissionTables = [
  backend.data.resources.tables.MenuItemReport,
  backend.data.resources.tables.RestaurantRequest,
];

for (const table of communitySubmissionTables) {
  table.grantStreamRead(backend.notifyCommunitySubmission.resources.lambda);
  backend.notifyCommunitySubmission.resources.lambda.addEventSource(
    new DynamoEventSource(table, {
      batchSize: 10,
      bisectBatchOnError: true,
      retryAttempts: 2,
      startingPosition: StartingPosition.LATEST,
    }),
  );
}

backend.updateAllergyRatingSummary.addEnvironment(
  "RESTAURANT_ALLERGY_RATING_SUMMARY_TABLE_NAME",
  backend.data.resources.tables.RestaurantAllergyRatingSummary.tableName,
);
backend.data.resources.tables.RestaurantAllergyRatingSummary.grantReadWriteData(
  backend.updateAllergyRatingSummary.resources.lambda,
);
backend.data.resources.tables.CommunityAllergyReview.grantStreamRead(
  backend.updateAllergyRatingSummary.resources.lambda,
);
backend.updateAllergyRatingSummary.resources.lambda.addEventSource(
  new DynamoEventSource(backend.data.resources.tables.CommunityAllergyReview, {
    batchSize: 10,
    bisectBatchOnError: true,
    retryAttempts: 2,
    startingPosition: StartingPosition.LATEST,
  }),
);

const { cfnUserPool, cfnUserPoolClient } = backend.auth.resources.cfnResources;

cfnUserPool.usernameAttributes = undefined;
cfnUserPool.schema = [
  {
    mutable: true,
    name: "email",
    required: false,
  },
];
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 8,
    requireLowercase: false,
    requireNumbers: false,
    requireSymbols: false,
    requireUppercase: false,
  },
};
cfnUserPool.lambdaConfig = {
  preSignUp: backend.autoConfirmSignUp.resources.lambda.functionArn,
};

cfnUserPoolClient.explicitAuthFlows = [
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_USER_SRP_AUTH",
  "ALLOW_REFRESH_TOKEN_AUTH",
  "ALLOW_CUSTOM_AUTH",
];

backend.autoConfirmSignUp.resources.lambda.addPermission("CognitoPreSignUpInvoke", {
  action: "lambda:InvokeFunction",
  principal: new ServicePrincipal("cognito-idp.amazonaws.com"),
  sourceArn: cfnUserPool.attrArn,
});

backend.socialAuthNative.addEnvironment("COGNITO_USER_POOL_ID", cfnUserPool.ref);
backend.socialAuthNative.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminUpdateUserAttributes",
    ],
    resources: [cfnUserPool.attrArn],
  }),
);

const socialAuthEndpoint = backend.socialAuthNative.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedHeaders: ["content-type", "authorization"],
    allowedMethods: [HttpMethod.POST],
    allowedOrigins: ["*"],
  },
});

const restaurantSearchEndpoint = backend.searchRestaurants.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedHeaders: ["content-type", "authorization"],
    allowedMethods: [HttpMethod.POST],
    allowedOrigins: ["*"],
  },
});

backend.addOutput({
  custom: {
    restaurantSearchEndpoint: restaurantSearchEndpoint.url,
    socialAuthEndpoint: socialAuthEndpoint.url,
  },
});
