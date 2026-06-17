import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  type AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import crypto from "node:crypto";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const APPLE_ISSUER = "https://appleid.apple.com";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

type NativeSocialProvider = "apple" | "google";

type NativeSocialProfile = {
  email: string | null;
  emailVerified: boolean;
  familyName: string | null;
  fullName: string | null;
  givenName: string | null;
  picture: string | null;
  provider: NativeSocialProvider;
  providerUserId: string;
};

type LambdaEvent = {
  body?: string | Record<string, unknown> | null;
  httpMethod?: string;
  isBase64Encoded?: boolean;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
};

function getJsonBody(event: LambdaEvent) {
  if (!event.body) {
    return {} as Record<string, unknown>;
  }

  if (typeof event.body === "object") {
    return event.body;
  }

  const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function listFromEnv(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function cors(statusCode: number, payload: Record<string, unknown>) {
  return {
    body: JSON.stringify(payload),
    headers: {
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "OPTIONS,POST",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    statusCode,
  };
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is not configured.`);
  }

  return value.trim();
}

async function verifyGoogleIdToken(idToken: string): Promise<NativeSocialProfile> {
  const audiences = listFromEnv(process.env.GOOGLE_CLIENT_IDS);

  if (audiences.length === 0) {
    throw new Error("GOOGLE_CLIENT_IDS is not configured for native Google sign-in.");
  }

  const { payload } = await jwtVerify(idToken, googleJwks, {
    audience: audiences,
    issuer: GOOGLE_ISSUERS,
  });

  return {
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true,
    familyName: typeof payload.family_name === "string" ? payload.family_name : null,
    fullName: typeof payload.name === "string" ? payload.name : null,
    givenName: typeof payload.given_name === "string" ? payload.given_name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
    provider: "google",
    providerUserId: requiredString(payload.sub, "Google subject"),
  };
}

async function verifyAppleIdToken(idToken: string): Promise<NativeSocialProfile> {
  const audiences = listFromEnv(process.env.APPLE_CLIENT_IDS);

  if (audiences.length === 0) {
    throw new Error("APPLE_CLIENT_IDS is not configured for native Apple sign-in.");
  }

  const { payload } = await jwtVerify(idToken, appleJwks, {
    audience: audiences,
    issuer: APPLE_ISSUER,
  });

  return {
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    familyName: null,
    fullName: null,
    givenName: null,
    picture: null,
    provider: "apple",
    providerUserId: requiredString(payload.sub, "Apple subject"),
  };
}

function computeAppUserId(profile: NativeSocialProfile) {
  return `${profile.provider}:${profile.providerUserId}`;
}

function buildCognitoUsername(profile: NativeSocialProfile) {
  return `${profile.provider}_${profile.providerUserId}`.replace(/[^a-zA-Z0-9._@+-]/g, "_").slice(0, 128);
}

function buildDeterministicPassword(profile: NativeSocialProfile) {
  const pepper = requiredString(process.env.SOCIAL_AUTH_PASSWORD_PEPPER, "SOCIAL_AUTH_PASSWORD_PEPPER");
  const digest = crypto
    .createHmac("sha256", pepper)
    .update(`${profile.provider}|${profile.providerUserId}`)
    .digest("hex");

  return `Al!${digest.slice(0, 24)}aA1`;
}

function displayNameForProfile(profile: NativeSocialProfile, fallbackUsername: string) {
  return (
    profile.fullName ||
    [profile.givenName, profile.familyName].filter(Boolean).join(" ") ||
    profile.email?.split("@")[0] ||
    fallbackUsername
  );
}

async function ensureCognitoUser(profile: NativeSocialProfile) {
  const userPoolId = requiredString(process.env.COGNITO_USER_POOL_ID, "COGNITO_USER_POOL_ID");
  const client = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || process.env.REGION || "us-east-1",
  });
  const username = buildCognitoUsername(profile);
  const password = buildDeterministicPassword(profile);
  let isNewUser = false;

  try {
    await client.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      }),
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : undefined;
    if (name !== "UserNotFoundException") {
      throw error;
    }

    isNewUser = true;
    const userAttributes: AttributeType[] = [
      { Name: "name", Value: displayNameForProfile(profile, username) },
    ];

    if (profile.email) {
      userAttributes.push({ Name: "email", Value: profile.email });
      userAttributes.push({ Name: "email_verified", Value: profile.emailVerified ? "true" : "false" });
    }

    await client.send(
      new AdminCreateUserCommand({
        MessageAction: "SUPPRESS",
        UserAttributes: userAttributes,
        UserPoolId: userPoolId,
        Username: username,
      }),
    );
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      Password: password,
      Permanent: true,
      UserPoolId: userPoolId,
      Username: username,
    }),
  );

  const updateAttributes: AttributeType[] = [];

  if (profile.email) {
    updateAttributes.push({ Name: "email", Value: profile.email });
    updateAttributes.push({ Name: "email_verified", Value: profile.emailVerified ? "true" : "false" });
  }

  if (profile.fullName || profile.givenName || profile.familyName) {
    updateAttributes.push({ Name: "name", Value: displayNameForProfile(profile, username) });
  }

  if (updateAttributes.length > 0) {
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserAttributes: updateAttributes,
        UserPoolId: userPoolId,
        Username: username,
      }),
    );
  }

  return { isNewUser, password, username };
}

async function mintAppToken(profile: NativeSocialProfile) {
  const secret = typeof process.env.APP_JWT_SECRET === "string" ? process.env.APP_JWT_SECRET.trim() : "";

  if (!secret) {
    return null;
  }

  const ttlSeconds = Number(process.env.APP_JWT_TTL_SECONDS || 3600);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: profile.email,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    sub: computeAppUserId(profile),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setIssuer("allergy-social-auth")
    .sign(new TextEncoder().encode(secret));
}

export const handler = async (event: LambdaEvent) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod;

  if (method === "OPTIONS") {
    return cors(200, { ok: true });
  }

  if (method && method !== "POST") {
    return cors(405, { message: "Method not allowed. Use POST.", ok: false });
  }

  try {
    const body = getJsonBody(event);
    const action = body.action;
    const provider = body.provider;
    const idToken = body.idToken;

    if (action !== "nativeSocialSignIn") {
      return cors(400, { message: "Unsupported action.", ok: false });
    }

    if ((provider !== "google" && provider !== "apple") || typeof idToken !== "string" || !idToken.trim()) {
      return cors(400, { message: "Missing required fields: provider and idToken.", ok: false });
    }

    let profile = provider === "google" ? await verifyGoogleIdToken(idToken) : await verifyAppleIdToken(idToken);

    if (provider === "apple") {
      profile = {
        ...profile,
        email: profile.email ?? (typeof body.email === "string" ? body.email : null),
        familyName: typeof body.familyName === "string" ? body.familyName : profile.familyName,
        givenName: typeof body.givenName === "string" ? body.givenName : profile.givenName,
      };
    }

    const [appToken, cognito] = await Promise.all([mintAppToken(profile), ensureCognitoUser(profile)]);

    return cors(200, {
      appToken,
      appTokenType: appToken ? "Bearer" : null,
      cognito,
      message: "Native social token verified.",
      ok: true,
      user: {
        id: computeAppUserId(profile),
        ...profile,
      },
    });
  } catch (error) {
    console.error("social-auth-native-error", error);
    return cors(401, {
      message: error instanceof Error ? error.message : "Social token verification failed.",
      ok: false,
    });
  }
};
