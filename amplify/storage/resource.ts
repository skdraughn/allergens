import { defineStorage } from "@aws-amplify/backend";

import { refreshRestaurantData } from "../functions/refresh-restaurant-data/resource.ts";

export const storage = defineStorage({
  name: "restaurantData",
  access: (allow) => ({
    "restaurant-data/*": [
      allow.authenticated.to(["read"]),
      allow.guest.to(["read"]),
      allow.resource(refreshRestaurantData).to(["read", "write"]),
    ],
  }),
});
