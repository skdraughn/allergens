import { defineFunction } from "@aws-amplify/backend";

export const processRestaurantRefreshJobs = defineFunction({
  name: "process-restaurant-refresh-jobs",
  entry: "./handler.ts",
  timeoutSeconds: 300,
  memoryMB: 1024,
  runtime: 22,
  environment: {
    DISABLE_RESTAURANT_REFRESH_JOB_PROCESSING: "true",
    RESTAURANT_DATA_PREFIX: "restaurant-data",
    RESTAURANT_REFRESH_JOB_BATCH_SIZE: "10",
  },
});
