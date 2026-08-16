export const TELEMETRY_SCHEMA_VERSION = 1;

export type TelemetryPrimitive = string | number | boolean;
export type TelemetryParams = Readonly<Record<string, TelemetryPrimitive | null | undefined>>;

const commonKeys = ["entry_point", "error_code", "outcome"] as const;
const restaurantKeys = ["restaurant_id", "source_type"] as const;
const menuItemKeys = ["menu_item_id", "item_status"] as const;

export const eventParameterKeys = {
  app_opened: [],
  startup_completed: ["duration_bucket"],
  startup_failed: ["error_code"],
  onboarding_started: ["entry_point"],
  onboarding_step_viewed: ["step"],
  onboarding_completed: ["auth_state"],
  onboarding_abandoned: ["step"],
  auth_started: ["auth_action", "auth_method"],
  auth_succeeded: ["auth_action", "auth_method"],
  auth_failed: ["auth_action", "auth_method", "error_code"],
  auth_signed_out: [],
  account_deleted: [],
  account_screen_opened: ["auth_state"],
  restaurant_search_started: ["entry_point"],
  restaurant_search_results: ["result_count_bucket", "outcome", "source_type"],
  restaurant_search_paginated: ["outcome"],
  restaurant_opened: ["restaurant_id", "entry_point", "result_position_bucket"],
  restaurant_detail_loaded: ["restaurant_id", "source_type", "item_count_bucket"],
  restaurant_detail_failed: ["restaurant_id", "error_code"],
  menu_filter_selected: ["restaurant_id", "filter"],
  menu_category_selected: ["restaurant_id"],
  restaurant_accommodation_opened: restaurantKeys,
  source_explanation_opened: restaurantKeys,
  restaurant_website_opened: restaurantKeys,
  restaurant_shared: ["restaurant_id"],
  menu_search_used: ["restaurant_id", "result_count_bucket", "outcome"],
  menu_item_opened: [...restaurantKeys, ...menuItemKeys],
  menu_item_ingredients_opened: [...restaurantKeys, "menu_item_id", "source_type"],
  menu_item_source_opened: [...restaurantKeys, "menu_item_id", "source_type"],
  review_flow_opened: ["restaurant_id", "menu_item_id", "scope", "entry_point"],
  profile_created: [],
  profile_edited: [],
  profile_switched: [],
  profile_selected: [],
  profile_deleted: [],
  restaurant_request_started: ["entry_point"],
  restaurant_request_submitted: ["outcome"],
  restaurant_request_duplicate: [],
  restaurant_request_failed: ["error_code"],
  review_started: ["restaurant_id", "menu_item_id", "scope", "entry_point"],
  review_submitted: ["restaurant_id", "menu_item_id", "scope", "outcome"],
  review_failed: ["restaurant_id", "menu_item_id", "scope", "error_code"],
  report_submitted: ["restaurant_id", "menu_item_id", "scope", "outcome"],
  user_blocked: ["scope", "outcome"],
} as const satisfies Record<string, readonly string[]>;

export type TelemetryEventName = keyof typeof eventParameterKeys;

type CommonParameterKey = (typeof commonKeys)[number];
type EventParameterKey<Name extends TelemetryEventName> =
  | CommonParameterKey
  | (typeof eventParameterKeys)[Name][number];

type CountBucket = "0" | "1" | "2_5" | "6_10" | "11_25" | "26_50" | "51_100" | "101_plus";
type DurationBucket = "under_500ms" | "500_999ms" | "1_2s" | "2_4s" | "4_8s" | "8s_plus";
type PositionBucket = "1" | "2_5" | "6_10" | "11_25" | "26_plus";

type ParameterValue<Key extends string> = Key extends "outcome"
  ? "cancelled" | "duplicate" | "empty" | "failure" | "queued" | "success"
  : Key extends "auth_action"
    ? "authenticate" | "sign_in" | "sign_up"
    : Key extends "auth_method"
      ? "apple" | "google" | "password"
      : Key extends "auth_state"
        ? "guest" | "signed_in"
        : Key extends "scope"
          ? "community_review" | "community_reviewer" | "menu_item" | "restaurant"
          : Key extends "result_count_bucket" | "item_count_bucket"
            ? CountBucket
            : Key extends "duration_bucket"
              ? DurationBucket
              : Key extends "result_position_bucket"
                ? PositionBucket
                : Key extends "item_status"
                  ? "avoid" | "caution" | "ok" | "unknown"
                  : TelemetryPrimitive;

export type TelemetryParamsFor<Name extends TelemetryEventName> = Readonly<{
  [Key in EventParameterKey<Name>]?: ParameterValue<Key> | null;
}>;

export const performanceTraceNames = [
  "startup_to_interactive",
  "catalog_initialization",
  "restaurant_search",
  "restaurant_detail_load",
  "profile_sync",
  "community_load",
  "community_submission",
  "ota_update_check",
] as const;

export type PerformanceTraceName = (typeof performanceTraceNames)[number];

export const performanceTraceAttributeKeys = {
  startup_to_interactive: [],
  catalog_initialization: [],
  restaurant_search: ["result_count_bucket"],
  restaurant_detail_load: ["item_count_bucket"],
  profile_sync: [],
  community_load: ["review_count_bucket"],
  community_submission: ["submission_type"],
  ota_update_check: ["update_status"],
} as const satisfies Record<PerformanceTraceName, readonly string[]>;

export const performanceTraceMetricKeys = {
  startup_to_interactive: ["duration_ms"],
  catalog_initialization: ["restaurant_count"],
  restaurant_search: [],
  restaurant_detail_load: [],
  profile_sync: [],
  community_load: [],
  community_submission: [],
  ota_update_check: [],
} as const satisfies Record<PerformanceTraceName, readonly string[]>;

type TraceAttributeKey<Name extends PerformanceTraceName> =
  (typeof performanceTraceAttributeKeys)[Name][number];
type TraceMetricKey<Name extends PerformanceTraceName> =
  (typeof performanceTraceMetricKeys)[Name][number];

type TraceAttributeValue<Key extends string> = Key extends
  | "result_count_bucket"
  | "item_count_bucket"
  | "review_count_bucket"
  ? CountBucket
  : Key extends "submission_type"
    ? "report" | "restaurant_request" | "review"
    : Key extends "update_status"
      ? "check_failed" | "no_update" | "optional" | "reload_loop" | "required" | "updates_disabled"
      : string;

export type PerformanceTraceAttributes<Name extends PerformanceTraceName> = Readonly<{
  [Key in TraceAttributeKey<Name>]?: TraceAttributeValue<Key>;
}>;

export type PerformanceTraceMetrics<Name extends PerformanceTraceName> = Readonly<{
  [Key in TraceMetricKey<Name>]?: number;
}>;

const prohibitedKeyPattern =
  /(?:allerg|email|username|display_name|profile_name|search_(?:query|text|term|input)|(?:review|request|report)_(?:text|body|notes|content|message)|free_text|latitude|longitude|coordinates|address|password|token|credential)/i;
const identifierKeyPattern = /(?:^|_)(?:restaurant|menu_item)_id$/;
const safeIdentifierPattern = /^[a-zA-Z0-9._:-]+$/;

export function bucketCount(count: number): CountBucket {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2_5";
  if (count <= 10) return "6_10";
  if (count <= 25) return "11_25";
  if (count <= 50) return "26_50";
  if (count <= 100) return "51_100";
  return "101_plus";
}

export function bucketDuration(milliseconds: number): DurationBucket {
  if (milliseconds < 500) return "under_500ms";
  if (milliseconds < 1_000) return "500_999ms";
  if (milliseconds < 2_000) return "1_2s";
  if (milliseconds < 4_000) return "2_4s";
  if (milliseconds < 8_000) return "4_8s";
  return "8s_plus";
}

export function bucketPosition(position: number): PositionBucket {
  if (position <= 0) return "1";
  if (position < 5) return "2_5";
  if (position < 10) return "6_10";
  if (position < 25) return "11_25";
  return "26_plus";
}

export function safeErrorCode(error: unknown, fallback = "unknown") {
  const candidate =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  const normalized = candidate
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return normalized ? normalized.slice(0, 40) : fallback;
}

export function sanitizeEvent(
  name: TelemetryEventName,
  params: TelemetryParams = {},
  options: { environment: string; strict?: boolean },
) {
  const allowedKeys = new Set<string>([
    ...commonKeys,
    ...eventParameterKeys[name],
  ]);
  const sanitized: Record<string, TelemetryPrimitive> = {
    app_environment: sanitizeEnum(options.environment),
    schema_version: TELEMETRY_SCHEMA_VERSION,
  };

  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === null || rawValue === undefined) continue;
    if (prohibitedKeyPattern.test(key)) {
      throw new Error(`Prohibited telemetry parameter: ${key}`);
    }
    if (!allowedKeys.has(key)) {
      if (options.strict) throw new Error(`Unknown parameter ${key} for ${name}`);
      continue;
    }

    if (typeof rawValue === "number") {
      if (Number.isFinite(rawValue)) sanitized[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "boolean") {
      sanitized[key] = rawValue;
      continue;
    }

    const value = rawValue.trim();
    if (!value) continue;
    if (identifierKeyPattern.test(key) && !safeIdentifierPattern.test(value)) {
      if (options.strict) throw new Error(`Unsafe identifier for ${key}`);
      continue;
    }
    sanitized[key] = sanitizeEnum(value);
  }

  return sanitized;
}

export function sanitizeTraceAttributes<Name extends PerformanceTraceName>(
  name: Name,
  attributes: Readonly<Record<string, string | undefined>>,
  strict = false,
) {
  const allowedKeys = new Set<string>(performanceTraceAttributeKeys[name]);
  const sanitized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(attributes)) {
    if (rawValue === undefined) continue;
    if (prohibitedKeyPattern.test(key)) {
      throw new Error(`Prohibited telemetry parameter: ${key}`);
    }
    if (!allowedKeys.has(key)) {
      if (strict) throw new Error(`Unknown trace attribute ${key} for ${name}`);
      continue;
    }
    const value = sanitizeEnum(rawValue);
    if (value) sanitized[key] = value;
  }
  return sanitized;
}

function sanitizeEnum(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 100);
}
