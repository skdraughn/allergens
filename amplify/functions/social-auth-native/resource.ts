import { defineFunction } from "@aws-amplify/backend";

const defaultGoogleClientIds = [
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
]
  .filter(Boolean)
  .join(",");

const appJwtSecret = "GuNf1CQ7yEODuxrJEEK/PuUZlXrP1kYEiK+LzCxSemK0Fjft7Fh5Arq/IzDXDSu0";
const socialAuthPasswordPepper = "zhNYo3CL2OgmbMww8Xq70DHERpw4atue0ZVh4G90YfPnIMrxMxNT1iTz1YcCFCA9";

export const socialAuthNative = defineFunction({
  name: "allergy-socialauthnative",
  entry: "./handler.ts",
  timeoutSeconds: 15,
  environment: {
    APP_JWT_SECRET: appJwtSecret,
    APP_JWT_TTL_SECONDS: "3600",
    APPLE_CLIENT_IDS: process.env.APPLE_CLIENT_IDS ?? "com.truflag.allergyapp",
    GOOGLE_CLIENT_IDS: process.env.GOOGLE_CLIENT_IDS ?? defaultGoogleClientIds,
    SOCIAL_AUTH_PASSWORD_PEPPER: socialAuthPasswordPepper,
  },
});
