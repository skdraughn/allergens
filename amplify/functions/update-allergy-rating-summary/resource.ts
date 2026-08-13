import { defineFunction } from "@aws-amplify/backend";

export const updateAllergyRatingSummary = defineFunction({
  name: "update-allergy-rating-summary",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  runtime: 22,
  environment: {
    PUBLISHED_COMMUNITY_ALLERGY_REVIEW_TABLE_NAME: "",
    RESTAURANT_ALLERGY_RATING_SUMMARY_TABLE_NAME: "",
  },
});
