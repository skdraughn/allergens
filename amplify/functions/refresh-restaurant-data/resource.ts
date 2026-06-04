import { defineFunction } from "@aws-amplify/backend";

export const refreshRestaurantData = defineFunction({
  name: "refresh-restaurant-data",
  entry: "./handler.ts",
  timeoutSeconds: 900,
  memoryMB: 2048,
  ephemeralStorageSizeMB: 1024,
  runtime: 22,
  schedule: {
    cron: "17 8 * * ? *",
    timezone: "UTC",
    description: "Refresh official restaurant menu and allergen snapshots daily.",
  },
  environment: {
    RESTAURANT_DATA_PREFIX: "restaurant-data",
  },
});
