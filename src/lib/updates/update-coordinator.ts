import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

const attemptKey = "mysafemenu.ota.reloadAttempt";
const pendingDeepLinkKey = "mysafemenu.ota.pendingDeepLink";
const maximumReloadAttempts = 2;

export type MySafeMenuUpdateMetadata = {
  message: string;
  platform: "android" | "ios" | null;
  required: boolean;
  updateId: string;
};

export type UpdateCheckState =
  | { reason: string; status: "ready" }
  | { metadata: MySafeMenuUpdateMetadata; status: "optional" | "required" }
  | {
      message: string;
      metadata?: MySafeMenuUpdateMetadata;
      required: true;
      status: "error";
    };

type ReloadAttempt = {
  count: number;
  targetUpdateId: string;
};

export function getMySafeMenuUpdateMetadata(
  checkResult: Record<string, unknown> | null | undefined,
): MySafeMenuUpdateMetadata | null {
  let manifest = checkResult?.manifest as Record<string, unknown> | undefined;
  const manifestString = checkResult?.manifestString;

  if (!manifest && typeof manifestString === "string") {
    try {
      manifest = JSON.parse(manifestString) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const extra = manifest?.extra as Record<string, unknown> | undefined;
  const metadata = extra?.mySafeMenuUpdate as
    | Record<string, unknown>
    | undefined;

  if (!metadata) {
    return null;
  }

  const platform = metadata.platform;
  return {
    message:
      typeof metadata.message === "string" && metadata.message.trim()
        ? metadata.message.trim()
        : "Getting the latest MySafeMenu update ready.",
    platform:
      platform === "ios" || platform === "android" ? platform : null,
    required: metadata.required === true,
    updateId: String(metadata.releaseId ?? manifest?.id ?? ""),
  };
}

async function readAttempt(): Promise<ReloadAttempt | null> {
  try {
    const value = await AsyncStorage.getItem(attemptKey);
    return value ? (JSON.parse(value) as ReloadAttempt) : null;
  } catch {
    return null;
  }
}

async function reconcileSuccessfulReload() {
  const attempt = await readAttempt();
  if (attempt?.targetUpdateId && attempt.targetUpdateId === Updates.updateId) {
    await AsyncStorage.removeItem(attemptKey);
  }
}

async function isReloadLoop(updateId: string) {
  const attempt = await readAttempt();
  return (
    Boolean(updateId) &&
    attempt?.targetUpdateId === updateId &&
    Number(attempt.count) >= maximumReloadAttempts
  );
}

async function recordReloadAttempt(updateId: string) {
  const previous = await readAttempt();
  await AsyncStorage.setItem(
    attemptKey,
    JSON.stringify({
      count:
        previous?.targetUpdateId === updateId ? Number(previous.count) + 1 : 1,
      recordedAt: new Date().toISOString(),
      targetUpdateId: updateId,
    }),
  );
}

export async function checkForMySafeMenuUpdate(): Promise<UpdateCheckState> {
  const preview = process.env.EXPO_PUBLIC_OTA_PREVIEW;
  if (__DEV__ && (preview === "required" || preview === "optional")) {
    return {
      metadata: {
        message: "Getting the latest MySafeMenu update ready.",
        platform: Platform.OS === "android" ? "android" : "ios",
        required: preview === "required",
        updateId: "development-preview",
      },
      status: preview,
    };
  }

  if (__DEV__ || !Updates.isEnabled) {
    return { reason: "updates_disabled", status: "ready" };
  }

  try {
    await reconcileSuccessfulReload();
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) {
      return { reason: "no_update", status: "ready" };
    }

    const metadata = getMySafeMenuUpdateMetadata(
      result as unknown as Record<string, unknown>,
    ) ?? {
      message: "A MySafeMenu update is available.",
      platform: Platform.OS === "android" ? "android" : "ios",
      required: false,
      updateId: String(result.manifest?.id ?? ""),
    };

    if (await isReloadLoop(metadata.updateId)) {
      return {
        message:
          "This update could not start safely. Please contact MySafeMenu support.",
        metadata,
        required: true,
        status: "error",
      };
    }

    return {
      metadata,
      status: metadata.required ? "required" : "optional",
    };
  } catch {
    return {
      message:
        "MySafeMenu could not check for required updates. Check your connection and try again.",
      required: true,
      status: "error",
    };
  }
}

export async function downloadAndReloadMySafeMenuUpdate(
  metadata: MySafeMenuUpdateMetadata,
) {
  if (__DEV__ && metadata.updateId === "development-preview") {
    return;
  }

  const deepLink = await Linking.getInitialURL();
  if (deepLink) {
    await AsyncStorage.setItem(pendingDeepLinkKey, deepLink);
  }

  await Updates.fetchUpdateAsync();
  await recordReloadAttempt(metadata.updateId);
  await Updates.reloadAsync({
    reloadScreenOptions: {
      backgroundColor: "#FFFFFF",
      spinner: { enabled: false },
    },
  });
}

export async function consumePendingUpdateDeepLink() {
  const deepLink = await AsyncStorage.getItem(pendingDeepLinkKey);
  if (deepLink) {
    await AsyncStorage.removeItem(pendingDeepLinkKey);
  }
  return deepLink;
}
