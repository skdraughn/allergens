import { defineFunction } from "@aws-amplify/backend";

export const updateAllergyRatingSummary = defineFunction({
  name: "update-allergy-rating-summary",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  runtime: 22,
  environment: {
    RESTAURANT_ALLERGY_RATING_SUMMARY_TABLE_NAME: "",
  },
});
