# MySafeMenu Firebase observability runbook

## Scope and privacy boundary

MySafeMenu uses React Native Firebase Analytics, Crashlytics, and Performance Monitoring for product analytics, diagnostics, and performance measurement. AWS Amplify remains the authentication, data, search, and storage backend. Firebase Auth, Firestore, advertising ID support, ATT, and ad personalization are intentionally absent.

The telemetry adapter in `src/lib/telemetry/` is the only supported entry point. It applies schema version `1`, allowlists event parameters, rejects prohibited keys, buckets counts and positions, and replaces operational exceptions with sanitized errors. Never bypass it with direct Firebase calls.

Allowed identifiers are the opaque Cognito `userId`, stable restaurant IDs, and stable menu-item IDs. Never send email, username, profile name, allergy selections, allergy context, precise location, coordinates, search text, ratings, review text, restaurant-request fields, notes, report text, tokens, requests, responses, or exception payloads.

## Firebase project and app registration

1. Create or select the production Firebase project and enable Google Analytics.
2. Register an Apple app with bundle ID `com.cliqinvite.mysafemenu`.
3. Register an Android app with package name `com.cliqinvite.mysafemenu`.
4. Download `GoogleService-Info.plist` and `google-services.json` from Firebase project settings.
5. In Analytics settings, leave advertising personalization disabled. The iOS Analytics pod is also compiled with `withoutAdIdSupport: true`; do not add ATT solely for analytics.
6. Enable Crashlytics and Performance Monitoring in the Firebase console.

Do not commit either Firebase configuration file. They are project identifiers/configuration rather than server credentials, but this repository deliberately supplies them through ignored local files or EAS file variables.

## Local and EAS credential placement

For local native builds, place the downloaded files at the repository root:

```text
GoogleService-Info.plist
google-services.json
```

Alternatively, set `GOOGLE_SERVICES_PLIST` and `GOOGLE_SERVICES_JSON` to absolute file paths before resolving Expo config.

For EAS Build, open the project dashboard, then **Project settings → Environment variables → Add variable**. Upload each as a **File** variable with **Secret** visibility for the `preview` and `production` environments:

| Variable | Uploaded file |
| --- | --- |
| `GOOGLE_SERVICES_PLIST` | `GoogleService-Info.plist` |
| `GOOGLE_SERVICES_JSON` | `google-services.json` |

Confirm the build profile uses the matching EAS `environment`. `app.config.js` reads the temporary file paths EAS exposes. Verify presence with `eas env:list --environment production`; secret file contents will not be readable. Expo's current file-variable guidance is at <https://docs.expo.dev/eas/environment-variables/manage/>.

When neither platform file is available, Expo omits all Firebase config plugins and sets `extra.firebaseConfigured` to false. The JavaScript adapter then becomes a safe no-op, keeping existing development clients usable. A production build must have both files.

## Collection environments

- Release builds with Firebase configuration collect Analytics, Crashlytics, and Performance data.
- Development builds do not collect by default, protecting production reports from Fast Refresh and simulator activity.
- For a Firebase-enabled development build used only for verification, set `EXPO_PUBLIC_FIREBASE_TELEMETRY_DEBUG=1` before bundling.
- Automatic native screen reporting is disabled. Expo Router paths are normalized and emitted manually.

## Analytics verification and DebugView

Use a Firebase-enabled development or internal build and opt development collection in. Enable Firebase debug mode on only the test device:

- iOS: add `-FIRDebugEnabled` to the Xcode scheme launch arguments. Remove it or use `-FIRDebugDisabled` afterward.
- Android: `adb shell setprop debug.firebase.analytics.app com.cliqinvite.mysafemenu`; clear with `adb shell setprop debug.firebase.analytics.app .none.`.

Open **Firebase Console → Analytics → DebugView** and exercise onboarding, authentication, search, restaurant detail, a menu item, and a non-production community submission. Confirm:

- event names and parameter names are snake_case;
- `schema_version=1` and `app_environment` are present;
- screen names contain no restaurant or menu IDs;
- no entered text, allergy choice, rating, location, email, or profile name appears;
- Cognito `userId` is present only after authentication and disappears after sign-out.

Configure a GA4 internal/developer traffic filter so debug devices do not contaminate retained production reporting. See <https://firebase.google.com/docs/analytics/debugview>.

## Events

Lifecycle and onboarding: `app_opened`, `startup_completed`, `startup_failed`, `onboarding_started`, `onboarding_step_viewed`, `onboarding_completed`, `onboarding_abandoned`.

Authentication and account: `auth_started`, `auth_succeeded`, `auth_failed`, `auth_signed_out`, `account_deleted`, `account_screen_opened`.

Discovery: `restaurant_search_started`, `restaurant_search_results`, `restaurant_search_paginated`, `restaurant_opened`.

Restaurant and menu: `restaurant_detail_loaded`, `restaurant_detail_failed`, `menu_filter_selected`, `menu_category_selected`, `restaurant_accommodation_opened`, `source_explanation_opened`, `restaurant_website_opened`, `restaurant_shared`, `menu_search_used`, `menu_item_opened`, `menu_item_ingredients_opened`, `menu_item_source_opened`, `review_flow_opened`.

Profiles: `profile_created`, `profile_edited`, `profile_switched`, `profile_selected`, `profile_deleted`.

Community: `restaurant_request_started`, `restaurant_request_submitted`, `restaurant_request_duplicate`, `restaurant_request_failed`, `review_started`, `review_submitted`, `review_failed`, `report_submitted`, `user_blocked`.

## GA4 custom dimensions

Register these event-scoped dimensions under **Analytics → Custom definitions** only after events arrive. Do not register identifiers as dimensions unless a specific operational analysis requires them; restaurant and menu IDs are high cardinality and are better queried in BigQuery.

- `app_environment`
- `schema_version`
- `entry_point`
- `outcome`
- `source_type`
- `auth_action`
- `auth_method`
- `auth_state`
- `scope`
- `filter`
- `item_status`
- `result_count_bucket`
- `result_position_bucket`
- `item_count_bucket`
- `duration_bucket`
- `error_code`

## Recommended funnels, audiences, and retention

Funnels:

1. `onboarding_started` → `profile_created` or `profile_selected` → `onboarding_completed` → home screen view.
2. `restaurant_search_results` → `restaurant_opened` → `menu_item_opened` → `menu_item_ingredients_opened` or `menu_item_source_opened`.
3. `restaurant_request_started` → `restaurant_request_submitted` → optional `review_started` → `review_submitted`.
4. `review_started` → `review_submitted`, segmented by `scope` and `entry_point`.

Recommended audiences:

- new users who complete onboarding;
- searchers who see results but do not open a restaurant;
- restaurant viewers who open ingredients or an official source;
- restaurant-request submitters;
- review starters who do not submit;
- weekly returning catalog explorers;
- users on app versions with elevated detail-load failures.

Use GA4 cohort reports for day 1, day 7, and day 30 retention, segmented by onboarding completion and first-session restaurant/menu engagement. Never define audiences using allergies, health context, user IDs, or restaurant-request/review content.

## Crashlytics verification

1. Exercise one controlled sanitized nonfatal error in a Firebase-enabled internal build and verify its message contains only `operation:safe_error_code`.
2. Confirm navigation and major actions appear only as bounded breadcrumbs.
3. Test a controlled native crash only in a dedicated internal **release** build and test account/device. Do not crash App Store production.
4. Relaunch the app so the report uploads, then inspect issue grouping, release, device, stack, and custom keys.

Native crashes from Expo Go or a development client are not a valid Crashlytics fatal test: development clients add their own runtime/debug behavior, and Crashlytics may not treat their JavaScript/dev failure path as a production native fatal. Use an internal release build.

For iOS, confirm the Crashlytics build phase uploaded the matching archive dSYM. In Firebase, open the affected issue/version and verify there is no **Missing dSYM** warning. If one appears, retrieve the exact dSYM from the EAS/Xcode archive and use Firebase's `upload-symbols` tool for the reported UUID. See <https://firebase.google.com/docs/crashlytics/ios/get-started>.

## Performance verification

The app records custom traces for:

- `startup_to_interactive`
- `catalog_initialization`
- `restaurant_search`
- `restaurant_detail_load`
- `profile_sync`
- `community_load`
- `community_submission`
- `ota_update_check`

Exercise each path in an internal release build, wait for ingestion, and open **Firebase Console → Performance → Custom traces**. Confirm success/failure/cancelled attributes and bounded metrics. Automatic supported app-start and network instrumentation remains enabled. No trace runs in scrolling, typing, animation, or render loops.

## Restaurant catalog authority

Firebase Remote Config parameter `restaurant_catalog_path` is the sole authority for the active restaurant catalog. Its value must be an immutable summary path shaped like:

`restaurant-data/catalogs/v1-<content-hash>/summary.json`

Publish and validate the complete S3 snapshot and update the DynamoDB search index to its matching `restaurants` prefix before promoting this parameter. The app stores the selected summary and viewed restaurant detail files in persistent device storage with no time-based expiration. It checks Remote Config at launch and listens for real-time updates; only a changed valid path causes a new catalog download. Retain older catalog objects so the parameter can be rolled back atomically.

## BigQuery export

Open **Firebase Console → Project settings → Integrations → BigQuery → Link**. Select a deliberate dataset region before creation; it is difficult to change later. Enable Google Analytics, Crashlytics (including Sessions), and Performance Monitoring exports for both apps. Enable streaming export only if the billing plan and near-real-time use case justify it. Restrict dataset access with least-privilege IAM and set cost alerts/table expiration where appropriate. See <https://firebase.google.com/docs/projects/bigquery-export>.

Replace `PROJECT_ID` below. Analytics tables use the property's generated `analytics_*` dataset.

```sql
-- Search-to-restaurant conversion by day.
WITH events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS day,
    user_pseudo_id,
    event_name
  FROM `PROJECT_ID.analytics_DATASET.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name IN ('restaurant_search_results', 'restaurant_opened')
)
SELECT
  day,
  COUNT(DISTINCT IF(event_name = 'restaurant_search_results', user_pseudo_id, NULL)) AS searchers,
  COUNT(DISTINCT IF(event_name = 'restaurant_opened', user_pseudo_id, NULL)) AS openers,
  SAFE_DIVIDE(
    COUNT(DISTINCT IF(event_name = 'restaurant_opened', user_pseudo_id, NULL)),
    COUNT(DISTINCT IF(event_name = 'restaurant_search_results', user_pseudo_id, NULL))
  ) AS conversion_rate
FROM events
GROUP BY day
ORDER BY day;
```

```sql
-- Review funnel by safe scope parameter.
SELECT
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'scope') AS scope,
  COUNTIF(event_name = 'review_started') AS starts,
  COUNTIF(event_name = 'review_submitted') AS submissions,
  SAFE_DIVIDE(COUNTIF(event_name = 'review_submitted'), COUNTIF(event_name = 'review_started')) AS completion_rate
FROM `PROJECT_ID.analytics_DATASET.events_*`
WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                        AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name IN ('review_started', 'review_submitted')
GROUP BY scope;
```

## Schema governance

- Event and parameter names are immutable once released.
- Additive parameters require tests and privacy review.
- Increment `TELEMETRY_SCHEMA_VERSION` for semantic changes, not routine additive fields.
- To rename an event, emit old and new names for one release where safe, mark the old event deprecated here, then remove it in the next major telemetry schema version.
- Never recycle a removed event name with different meaning.
- Review DebugView and BigQuery samples before every production release that changes telemetry.

## App Store privacy-label checklist

Confirm the answers in App Store Connect reflect the shipping build and current Apple definitions:

- **Product Interaction**: collected for analytics; linked to the user when the opaque Cognito ID is set; not used for tracking.
- **User ID**: collected for analytics and app functionality/diagnostics; linked to the user; not used for tracking.
- **Device ID**: Firebase installation/device identifiers are collected for analytics and diagnostics; not used for tracking.
- **Crash Data**: collected for app functionality and analytics/diagnostics; not used for tracking.
- **Performance Data**: collected for app functionality and analytics/diagnostics; not used for tracking.
- **Advertising Data**: not collected by this integration.
- **Precise Location, Search History, Health, User Content**: not transmitted to Firebase telemetry by this integration. Declare separately if another app feature/provider collects them.

Re-check Apple's questionnaire whenever Firebase configuration, SDK behavior, event parameters, or other providers change.
