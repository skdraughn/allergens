import { defineFunction, secret } from "@aws-amplify/backend";

export const notifyCommunitySubmission = defineFunction({
  name: "notify-community-submission",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  runtime: 22,
  environment: {
    DISCORD_WEBHOOK_URL: secret("DISCORD_WEBHOOK_URL"),
  },
});
