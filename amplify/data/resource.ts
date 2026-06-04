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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
