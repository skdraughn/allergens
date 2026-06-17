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
  Restaurant: a
    .model({
      name: a.string().required(),
      chainRank: a.integer(),
      category: a.string(),
      description: a.string(),
      domain: a.string(),
      logoUrl: a.string(),
      brandColor: a.string(),
      guideUrl: a.string(),
      guideLabel: a.string(),
      updated: a.string(),
    })
    .authorization((allow) => [allow.owner()]),
  MenuItem: a
    .model({
      restaurantId: a.string().required(),
      name: a.string().required(),
      category: a.string(),
      description: a.string(),
      imageUrl: a.string(),
      allergens: a.string().array(),
      mayContain: a.string().array(),
      notes: a.string(),
      sourceUrls: a.string().array(),
    })
    .authorization((allow) => [allow.owner()]),
  FoodReview: a
    .model({
      restaurantId: a.string().required(),
      menuItemId: a.string(),
      allergies: a.string().array(),
      status: a.string(),
      comment: a.string(),
      sourceUrl: a.string(),
    })
    .authorization((allow) => [allow.owner()]),
  RestaurantRequest: a
    .model({
      name: a.string().required(),
      website: a.string(),
      locationHint: a.string(),
      notes: a.string(),
      status: a.string(),
      createdBy: a.string(),
    })
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
    .authorization((allow) => [
      allow.owner().to(["create", "read"]),
      allow.authenticated().to(["read"]),
      allow.group("Admins").to(["read", "update", "delete"]),
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
