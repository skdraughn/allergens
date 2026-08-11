import { defineStorage } from "@aws-amplify/backend";

import { processRestaurantRefreshJobs } from "../functions/process-restaurant-refresh-jobs/resource.ts";
import { refreshRestaurantData } from "../functions/refresh-restaurant-data/resource.ts";

export const storage = defineStorage({
  name: "restaurantData",
  access: (allow) => ({
    "restaurant-data/*": [
      allow.authenticated.to(["read"]),
      allow.guest.to(["read"]),
      allow.resource(processRestaurantRefreshJobs).to(["read", "write"]),
      allow.resource(refreshRestaurantData).to(["read", "write"]),
    ],
  }),
});
