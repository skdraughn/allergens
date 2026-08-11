import { defineFunction } from "@aws-amplify/backend";

export const searchRestaurants = defineFunction({
  name: "search-restaurants",
  entry: "./handler.ts",
  timeoutSeconds: 10,
  memoryMB: 512,
  runtime: 22,
  environment: {
    DISABLE_RESTAURANT_REFRESH_JOBS: "true",
    RESTAURANT_DATA_PREFIX: "restaurant-data",
  },
});
