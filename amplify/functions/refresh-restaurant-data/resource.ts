import { defineFunction } from "@aws-amplify/backend";

export const refreshRestaurantData = defineFunction({
  name: "refresh-restaurant-data",
  entry: "./handler.ts",
  timeoutSeconds: 900,
  memoryMB: 2048,
  ephemeralStorageSizeMB: 1024,
  runtime: 22,
  environment: {
    DISABLE_RESTAURANT_FULL_REFRESH: "true",
    RESTAURANT_DATA_PREFIX: "restaurant-data",
  },
});
