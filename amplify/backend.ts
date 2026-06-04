import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.ts";
import { data } from "./data/resource.ts";
import { refreshRestaurantData } from "./functions/refresh-restaurant-data/resource.ts";
import { storage } from "./storage/resource.ts";

defineBackend({
  auth,
  data,
  refreshRestaurantData,
  storage,
});
