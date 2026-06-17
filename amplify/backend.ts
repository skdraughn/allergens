import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { FunctionUrlAuthType, HttpMethod } from "aws-cdk-lib/aws-lambda";

import { auth } from "./auth/resource.ts";
import { data } from "./data/resource.ts";
import { autoConfirmSignUp } from "./functions/auto-confirm-sign-up/resource.ts";
import { refreshRestaurantData } from "./functions/refresh-restaurant-data/resource.ts";
import { socialAuthNative } from "./functions/social-auth-native/resource.ts";
import { storage } from "./storage/resource.ts";

const backend = defineBackend({
  auth,
  autoConfirmSignUp,
  data,
  refreshRestaurantData,
  socialAuthNative,
  storage,
});

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

backend.addOutput({
  custom: {
    socialAuthEndpoint: socialAuthEndpoint.url,
  },
});
