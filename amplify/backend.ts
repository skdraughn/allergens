import { defineBackend } from "@aws-amplify/backend";
import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { FunctionUrlAuthType, HttpMethod } from "aws-cdk-lib/aws-lambda";

import { auth } from "./auth/resource.ts";
import { data } from "./data/resource.ts";
import { autoConfirmSignUp } from "./functions/auto-confirm-sign-up/resource.ts";
import { refreshRestaurantData } from "./functions/refresh-restaurant-data/resource.ts";
import { searchRestaurants } from "./functions/search-restaurants/resource.ts";
import { socialAuthNative } from "./functions/social-auth-native/resource.ts";
import { storage } from "./storage/resource.ts";

const backend = defineBackend({
  auth,
  autoConfirmSignUp,
  data,
  refreshRestaurantData,
  searchRestaurants,
  socialAuthNative,
  storage,
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

backend.refreshRestaurantData.addEnvironment(
  "RESTAURANT_SEARCH_INDEX_TABLE_NAME",
  restaurantSearchIndexTable.tableName,
);
backend.searchRestaurants.addEnvironment(
  "RESTAURANT_SEARCH_INDEX_TABLE_NAME",
  restaurantSearchIndexTable.tableName,
);
restaurantSearchIndexTable.grantReadWriteData(backend.refreshRestaurantData.resources.lambda);
restaurantSearchIndexTable.grantReadData(backend.searchRestaurants.resources.lambda);

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
