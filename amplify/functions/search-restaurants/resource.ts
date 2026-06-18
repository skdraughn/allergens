import { defineFunction } from "@aws-amplify/backend";

export const searchRestaurants = defineFunction({
  name: "search-restaurants",
  entry: "./handler.ts",
  timeoutSeconds: 10,
  memoryMB: 512,
  runtime: 22,
  environment: {
    RESTAURANT_DATA_PREFIX: "restaurant-data",
  },
});
