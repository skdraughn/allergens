import Constants from "expo-constants";
import { Platform } from "react-native";
import { signIn, signOut } from "aws-amplify/auth";

import amplifyOutputs from "../../../amplify_outputs.json";

const SOCIAL_SIGN_IN_CANCELLED = "SOCIAL_SIGN_IN_CANCELLED";

type NativeSocialProvider = "apple" | "google";

type NativeSocialTokenPayload = {
  authorizationCode?: string | null;
  email?: string | null;
  familyName?: string | null;
  givenName?: string | null;
  idToken: string;
  photo?: string | null;
  provider: NativeSocialProvider;
  user?: string | null;
  userId?: string | null;
};

type NativeSocialExchangeResult = {
  cognito?: {
    isNewUser?: boolean;
    password?: string;
    username?: string;
  };
};

type AmplifyOutputs = {
  custom?: {
    socialAuthEndpoint?: string;
  };
};

type ExpoExtra = {
  socialAuthEndpoint?: string;
};

let googleConfigured = false;

type GoogleSignInModule = {
  GoogleSignin: {
    configure: (options: {
      iosClientId?: string;
      offlineAccess?: boolean;
      webClientId?: string;
    }) => void;
    getTokens: () => Promise<{ idToken?: string | null }>;
    hasPlayServices: () => Promise<boolean>;
    signIn: () => Promise<unknown>;
    signOut: () => Promise<unknown>;
  };
  isSuccessResponse?: (result: unknown) => boolean;
};

type AppleAuthenticationModule = {
  AppleAuthenticationScope: {
    EMAIL: unknown;
    FULL_NAME: unknown;
  };
  isAvailableAsync: () => Promise<boolean>;
  signInAsync: (options: { requestedScopes: unknown[] }) => Promise<{
    authorizationCode?: string | null;
    email?: string | null;
    fullName?: {
      familyName?: string | null;
      givenName?: string | null;
    } | null;
    identityToken?: string | null;
    user?: string | null;
  }>;
};

function loadGoogleSignIn(): GoogleSignInModule {
  try {
    return require("@react-native-google-signin/google-signin") as GoogleSignInModule;
  } catch {
    throw new Error("Google sign-in requires a new native build with Google Sign-In included.");
  }
}

function loadAppleAuthentication(): AppleAuthenticationModule {
  try {
    return require("expo-apple-authentication") as AppleAuthenticationModule;
  } catch {
    throw new Error("Apple sign-in requires a new native build with Apple Authentication included.");
  }
}

function createCancelledError(message = "Sign-in was cancelled.") {
  const error = new Error(message) as Error & { code?: string };
  error.code = SOCIAL_SIGN_IN_CANCELLED;
  return error;
}

export function isSocialSignInCancelled(error: unknown) {
  const maybeError = error as { code?: unknown; message?: unknown } | null | undefined;
  const code = String(maybeError?.code ?? "").toUpperCase();
  const message = String(maybeError?.message ?? "").toLowerCase();

  return (
    code === SOCIAL_SIGN_IN_CANCELLED ||
    code.includes("CANCEL") ||
    code === "SIGN_IN_CANCELLED" ||
    message.includes("cancel") ||
    message.includes("canceled") ||
    message.includes("cancelled") ||
    message.includes("gettokens requires a user")
  );
}

function getSocialEndpoint() {
  const outputs = amplifyOutputs as AmplifyOutputs;
  const extra = Constants.expoConfig?.extra as ExpoExtra | undefined;
  return (
    outputs.custom?.socialAuthEndpoint?.trim() ||
    extra?.socialAuthEndpoint?.trim() ||
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENDPOINT?.trim() ||
    null
  );
}

function ensureGoogleConfigured() {
  if (googleConfigured) {
    return;
  }

  const { GoogleSignin } = loadGoogleSignIn();

  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  googleConfigured = true;
}

export async function signInWithAppleNative(): Promise<NativeSocialTokenPayload> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple sign-in is only available on iOS.");
  }

  const AppleAuthentication = loadAppleAuthentication();
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Apple sign-in is not available on this device.");
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error("Apple did not return an identity token.");
    }

    return {
      authorizationCode: credential.authorizationCode ?? null,
      email: credential.email ?? null,
      familyName: credential.fullName?.familyName ?? null,
      givenName: credential.fullName?.givenName ?? null,
      idToken: credential.identityToken,
      provider: "apple",
      user: credential.user ?? null,
    };
  } catch (error) {
    if (isSocialSignInCancelled(error)) {
      throw createCancelledError("Apple sign-in cancelled.");
    }
    throw error;
  }
}

export async function signInWithGoogleNative(): Promise<NativeSocialTokenPayload> {
  ensureGoogleConfigured();
  const { GoogleSignin, isSuccessResponse } = loadGoogleSignIn();

  try {
    if (Platform.OS === "android") {
      await GoogleSignin.hasPlayServices();
    }
    const result = await GoogleSignin.signIn();

    if (isSuccessResponse && !isSuccessResponse(result)) {
      throw createCancelledError("Google sign-in cancelled.");
    }

    const data = ((result as { data?: unknown }).data ?? result) as {
      idToken?: string | null;
      user?: {
        email?: string | null;
        familyName?: string | null;
        givenName?: string | null;
        id?: string | null;
        photo?: string | null;
      };
    };
    const user = data.user ?? {};
    let idToken = data.idToken ?? null;

    if (!idToken) {
      const tokens = await GoogleSignin.getTokens();
      idToken = tokens.idToken ?? null;
    }

    if (!idToken) {
      throw new Error("Google did not return an ID token.");
    }

    return {
      email: user.email ?? null,
      familyName: user.familyName ?? null,
      givenName: user.givenName ?? null,
      idToken,
      photo: user.photo ?? null,
      provider: "google",
      userId: user.id ?? null,
    };
  } catch (error) {
    if (isSocialSignInCancelled(error)) {
      throw createCancelledError("Google sign-in cancelled.");
    }

    const message = error instanceof Error ? error.message : String(error);
    if (Platform.OS === "android" && message.toUpperCase().includes("DEVELOPER_ERROR")) {
      throw new Error(
        "Google sign-in is misconfigured for Android. Confirm the Android OAuth client package name and signing fingerprints are registered.",
      );
    }

    throw error;
  }
}

async function exchangeNativeSocialToken(payload: NativeSocialTokenPayload) {
  const endpoint = getSocialEndpoint();

  if (!endpoint) {
    throw new Error("Native sign-in succeeded, but the social auth endpoint is not configured.");
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      action: "nativeSocialSignIn",
      ...payload,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const text = await response.text();
  let data: (NativeSocialExchangeResult & { message?: string }) | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(data?.message || "Failed to exchange social token.");
  }

  return data;
}

async function signInWithFallbackFlows(username: string, password: string) {
  const attempts = [
    { username, password, options: { authFlowType: "USER_PASSWORD_AUTH" as const } },
    { username, password },
    { username, password, options: { authFlowType: "USER_SRP_AUTH" as const } },
  ];
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      return await signIn(attempt);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to complete Cognito sign-in.");
}

export async function completeNativeSocialSignIn(payload: NativeSocialTokenPayload) {
  const result = await exchangeNativeSocialToken(payload);
  const username = result?.cognito?.username;
  const password = result?.cognito?.password;

  if (!username || !password) {
    throw new Error("Social sign-in succeeded, but Cognito credentials were missing.");
  }

  try {
    await signOut();
  } catch {
    // No existing session is fine.
  }

  await signInWithFallbackFlows(username, password);
  return result;
}

export async function signOutFromNativeSocialProviders() {
  if (!googleConfigured) {
    return;
  }

  const { GoogleSignin } = loadGoogleSignIn();

  try {
    await GoogleSignin.signOut();
  } catch {
    // No active native Google session is fine.
  }
}
