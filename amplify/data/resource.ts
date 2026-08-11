import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  AllergyProfile: a
    .model({
      displayName: a.string(),
      allergies: a.string().array(),
      notes: a.string(),
      emergencyContact: a.string(),
    })
    .authorization((allow) => [allow.owner()]),
  RestaurantRequest: a
    .model({
      addressLine1: a.string(),
      addressLine2: a.string(),
      city: a.string(),
      country: a.string(),
      name: a.string().required(),
      displayAddress: a.string(),
      googleMapsUri: a.string(),
      googlePlaceId: a.string(),
      lat: a.float(),
      lng: a.float(),
      website: a.string(),
      locationHint: a.string(),
      notes: a.string(),
      postalCode: a.string(),
      region: a.string(),
      status: a.string(),
      createdBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index("createdBy").queryField("restaurantRequestsByCreatedBy"),
    ])
    .authorization((allow) => [
      allow.publicApiKey().to(["create"]),
      allow.owner().to(["create", "read"]),
      allow.authenticated().to(["read"]),
      allow.group("Admins").to(["read", "update", "delete"]),
    ]),
  CommunityMenuItem: a
    .model({
      restaurantId: a.string().required(),
      name: a.string().required(),
      category: a.string(),
      description: a.string(),
      allergens: a.string().array(),
      mayContain: a.string().array(),
      sourceUrl: a.string(),
      status: a.string(),
      reviewNotes: a.string(),
      createdBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index("createdBy").queryField("communityMenuItemsByCreatedBy"),
      index("restaurantId").queryField("communityMenuItemsByRestaurantId"),
    ])
    .authorization((allow) => [
      allow.owner().to(["create", "read"]),
      allow.authenticated().to(["read"]),
      allow.group("Admins").to(["read", "update", "delete"]),
    ]),
  MenuItemReport: a
    .model({
      restaurantId: a.string().required(),
      menuItemId: a.string(),
      reason: a.string(),
      comment: a.string(),
      sourceUrl: a.string(),
      status: a.string(),
      createdBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index("createdBy").queryField("menuItemReportsByCreatedBy"),
      index("restaurantId").queryField("menuItemReportsByRestaurantId"),
    ])
    .authorization((allow) => [
      allow.owner().to(["create", "read"]),
      allow.authenticated().to(["read"]),
      allow.group("Admins").to(["read", "update", "delete"]),
    ]),
  CommunityComment: a
    .model({
      restaurantId: a.string().required(),
      menuItemId: a.string(),
      body: a.string().required(),
      allergyContext: a.string(),
      status: a.string(),
      createdBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index("createdBy").queryField("communityCommentsByCreatedBy"),
      index("restaurantId").queryField("communityCommentsByRestaurantId"),
    ])
    .authorization((allow) => [
      allow.owner().to(["create", "read"]),
      allow.authenticated().to(["read"]),
      allow.group("Admins").to(["read", "update", "delete"]),
    ]),
  CommunityAllergyReview: a
    .model({
      restaurantId: a.string().required(),
      menuItemId: a.string(),
      menuItemName: a.string(),
      rating: a.integer().required(),
      body: a.string().required(),
      allergyContext: a.string(),
      status: a.string(),
      createdBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index("createdBy").queryField("communityAllergyReviewsByCreatedBy"),
      index("restaurantId").queryField("communityAllergyReviewsByRestaurantId"),
    ])
    .authorization((allow) => [
      allow.owner().to(["create", "read"]),
      allow.authenticated().to(["read"]),
      allow.group("Admins").to(["read", "update", "delete"]),
    ]),
  RestaurantAllergyRatingSummary: a
    .model({
      restaurantId: a.string().required(),
      averageRating: a.float(),
      reviewCount: a.integer().required(),
      ratingTotal: a.integer().required(),
    })
    .identifier(["restaurantId"])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.group("Admins").to(["read", "create", "update", "delete"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
