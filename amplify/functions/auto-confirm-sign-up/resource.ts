import { defineFunction } from "@aws-amplify/backend";

export const autoConfirmSignUp = defineFunction({
  name: "allergy-auto-confirm-sign-up",
  entry: "./handler.ts",
  resourceGroupName: "auth",
  timeoutSeconds: 5,
});
