import { defineFunction } from "@aws-amplify/backend";

export const deleteAccount = defineFunction({
  name: "delete-my-account",
  entry: "./handler.ts",
  memoryMB: 512,
  resourceGroupName: "data",
  runtime: 22,
  timeoutSeconds: 60,
});
