import Constants from "expo-constants";
import { Platform } from "react-native";

import {
  type PerformanceTraceAttributes,
  type PerformanceTraceMetrics,
  type PerformanceTraceName,
  type TelemetryEventName,
  type TelemetryParamsFor,
  sanitizeEvent,
  sanitizeTraceAttributes,
  safeErrorCode,
} from "./schema";

type AnalyticsModule = typeof import("@react-native-firebase/analytics");
type CrashlyticsModule = typeof import("@react-native-firebase/crashlytics");
type PerformanceModule = typeof import("@react-native-firebase/perf");

type NativeHandles = {
  analytics: ReturnType<AnalyticsModule["getAnalytics"]>;
  analyticsModule: AnalyticsModule;
  crashlytics: ReturnType<CrashlyticsModule["getCrashlytics"]>;
  crashlyticsModule: CrashlyticsModule;
  performance: ReturnType<PerformanceModule["getPerformance"]>;
  performanceModule: PerformanceModule;
};

export type TelemetryOperation =
  | "account_deletion"
  | "authentication"
  | "catalog_initialization"
  | "community_load"
  | "community_submission"
  | "ota_update_check"
  | "profile_sync"
  | "restaurant_detail_load"
  | "restaurant_search"
  | "root_render"
  | "telemetry_initialization";

export type TelemetryTrace<Name extends PerformanceTraceName = PerformanceTraceName> = {
  stop: (options?: {
    attributes?: PerformanceTraceAttributes<Name>;
    metrics?: PerformanceTraceMetrics<Name>;
    outcome?: "cancelled" | "failure" | "success";
  }) => void;
};

const environment =
  process.env.EXPO_PUBLIC_APP_ENV || (__DEV__ ? "development" : "production");
const configuredPlatforms = Constants.expoConfig?.extra?.firebaseConfiguredPlatforms as
  | Partial<Record<"android" | "ios", boolean>>
  | undefined;
const firebaseConfigured =
  Platform.OS === "android" || Platform.OS === "ios"
    ? Boolean(configuredPlatforms?.[Platform.OS])
    : false;
const developmentCollectionEnabled =
  process.env.EXPO_PUBLIC_FIREBASE_TELEMETRY_DEBUG === "1";
const collectionEnabled = firebaseConfigured && (!__DEV__ || developmentCollectionEnabled);

let nativeHandles: NativeHandles | null | undefined;
let initialized = false;

function loadNativeHandles() {
  if (nativeHandles !== undefined) return nativeHandles;
  if (!firebaseConfigured) {
    nativeHandles = null;
    return nativeHandles;
  }

  try {
    // Dynamic loading preserves the no-op path for native clients built before Firebase was configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analyticsModule = require("@react-native-firebase/analytics") as AnalyticsModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crashlyticsModule = require("@react-native-firebase/crashlytics") as CrashlyticsModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const performanceModule = require("@react-native-firebase/perf") as PerformanceModule;
    nativeHandles = {
      analytics: analyticsModule.getAnalytics(),
      analyticsModule,
      crashlytics: crashlyticsModule.getCrashlytics(),
      crashlyticsModule,
      performance: performanceModule.getPerformance(),
      performanceModule,
    };
  } catch (error) {
    nativeHandles = null;
    if (__DEV__) {
      console.info("Firebase telemetry unavailable in this native build", safeErrorCode(error));
    }
  }
  return nativeHandles;
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  const native = loadNativeHandles();
  if (!native) return;

  await Promise.allSettled([
    native.analyticsModule.setAnalyticsCollectionEnabled(
      native.analytics,
      collectionEnabled,
    ),
    native.crashlyticsModule.setCrashlyticsCollectionEnabled(
      native.crashlytics,
      collectionEnabled,
    ),
  ]);
  native.performance.dataCollectionEnabled = collectionEnabled;
  native.performance.instrumentationEnabled = collectionEnabled;

  if (collectionEnabled) track("app_opened");
}

function track<Name extends TelemetryEventName>(
  name: Name,
  params?: TelemetryParamsFor<Name>,
) {
  const sanitized = sanitizeEvent(name, params ?? {}, {
    environment,
    strict: __DEV__,
  });
  const native = loadNativeHandles();
  if (!collectionEnabled || !native) return;

  native.analyticsModule.logEvent(native.analytics, name, sanitized);
  native.crashlyticsModule.log(native.crashlytics, `event:${name}`);
}

function screen(screenName: string) {
  const normalized = normalizeScreenName(screenName);
  const native = loadNativeHandles();
  if (!collectionEnabled || !native || !normalized) return;

  void native.analyticsModule.logScreenView(native.analytics, {
    screen_class: normalized,
    screen_name: normalized,
  });
  native.crashlyticsModule.log(native.crashlytics, `screen:${normalized}`);
}

async function setSignedInUserId(userId: string | null | undefined) {
  const normalized = String(userId ?? "").trim();
  if (normalized && !/^[a-zA-Z0-9._:-]{1,128}$/.test(normalized)) {
    if (__DEV__) throw new Error("Unsafe telemetry user identifier");
    return;
  }

  const native = loadNativeHandles();
  if (!collectionEnabled || !native) return;
  await Promise.allSettled([
    native.analyticsModule.setUserId(native.analytics, normalized || null),
    native.crashlyticsModule.setUserId(native.crashlytics, normalized),
  ]);
}

async function clearIdentity(options: { resetInstallation?: boolean } = {}) {
  const native = loadNativeHandles();
  if (!native) return;
  await Promise.allSettled([
    native.analyticsModule.setUserId(native.analytics, null),
    native.crashlyticsModule.setUserId(native.crashlytics, ""),
  ]);
  if (options.resetInstallation) {
    await native.analyticsModule.resetAnalyticsData(native.analytics);
  }
}

function recordError(
  _error: unknown,
  operation: TelemetryOperation,
  context: { errorCode?: string } = {},
) {
  const native = loadNativeHandles();
  if (!collectionEnabled || !native) return;
  const safeCode = context.errorCode?.replace(/[^a-z0-9_]+/gi, "_").slice(0, 40) || "unknown";
  const sanitizedError = new Error(`${operation}:${safeCode}`);
  sanitizedError.name = "MySafeMenuOperationalError";
  native.crashlyticsModule.setAttributes(native.crashlytics, {
    operation,
    safe_error_code: safeCode,
  });
  native.crashlyticsModule.recordError(
    native.crashlytics,
    sanitizedError,
    operation,
  );
}

function startTrace<Name extends PerformanceTraceName>(
  name: Name,
  attributes?: PerformanceTraceAttributes<Name>,
): TelemetryTrace<Name> {
  const native = loadNativeHandles();
  if (!collectionEnabled || !native) return noopTrace;

  try {
    const performanceTrace = native.performanceModule.trace(native.performance, name);
    for (const [key, value] of Object.entries(
      sanitizeTraceAttributes(
        name,
        (attributes ?? {}) as Readonly<Record<string, string | undefined>>,
        __DEV__,
      ),
    )) {
      const safeKey = key.replace(/[^a-z0-9_]+/gi, "_").slice(0, 32);
      const safeValue = value.replace(/[^a-z0-9._:-]+/gi, "_").slice(0, 100);
      if (safeKey && safeValue) performanceTrace.putAttribute(safeKey, safeValue);
    }
    performanceTrace.start();
    let stopped = false;
    return {
      stop(options = {}) {
        if (stopped) return;
        stopped = true;
        if (options.outcome) performanceTrace.putAttribute("outcome", options.outcome);
        for (const [key, value] of Object.entries(
          sanitizeTraceAttributes(name, options.attributes ?? {}, __DEV__),
        )) {
          const safeKey = key.replace(/[^a-z0-9_]+/gi, "_").slice(0, 32);
          const safeValue = value.replace(/[^a-z0-9._:-]+/gi, "_").slice(0, 100);
          if (safeKey && safeValue) performanceTrace.putAttribute(safeKey, safeValue);
        }
        for (const [key, value] of Object.entries(
          (options.metrics ?? {}) as Readonly<Record<string, number>>,
        )) {
          if (Number.isFinite(value)) {
            performanceTrace.putMetric(
              key.replace(/[^a-z0-9_]+/gi, "_").slice(0, 32),
              Math.max(0, Math.round(value)),
            );
          }
        }
        performanceTrace.stop();
      },
    };
  } catch (error) {
    if (__DEV__) console.info("Firebase performance trace unavailable", safeErrorCode(error));
    return noopTrace;
  }
}

const noopTrace: TelemetryTrace<PerformanceTraceName> = { stop() {} };

function normalizeScreenName(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
  if (!path) return "index";
  if (/^restaurant\/[^/]+$/.test(path)) return "restaurant_detail";
  return path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

export const telemetry = {
  clearIdentity,
  initialize,
  recordError,
  screen,
  setSignedInUserId,
  startTrace,
  track,
};
