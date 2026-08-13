# Allergy App

React Native/Expo app for checking restaurant menu items against a user's allergy profile.

## Data Architecture

The app uses three separate data paths:

- Official restaurant/menu/allergen data lives in generated JSON and S3 snapshots.
- Restaurant discovery/search metadata lives in DynamoDB.
- User-owned and community contribution data lives in Amplify/AppSync.

Official restaurant data is not read from AppSync. The app starts with:

```txt
src/data/generated/restaurants.generated.json
```

Then, when Amplify Storage is configured, it fetches the compact repository fallback:

```txt
restaurant-data/latest.json
```

from the Amplify S3 bucket. The app accepts the remote snapshot only when the snapshot schema version is supported and the shape validates. Historical S3 objects under `restaurant-data/runs/` and `restaurant-data/manifests/` are for audit/debugging.

Home restaurant discovery uses the `search-restaurants` Lambda over the DynamoDB `RestaurantSearchIndex` table. Detail pages load full menu/allergen snapshots from:

```txt
restaurant-data/restaurants/{restaurantId}/latest.json
```

If the search endpoint is unavailable, Home falls back to the bundled/remote repository and still searches restaurant names only.

## Restaurant Refresh

Restaurant refresh is split into two paths. Scheduled execution is currently disabled while
the launch portfolio goes through manual item-by-item quality review:

- `refresh-restaurant-data` refreshes national chain snapshots when invoked manually.
- `process-restaurant-refresh-jobs` processes stale local restaurant jobs when invoked manually.

During each weekly chain refresh, the pipeline:

1. Scrapes official restaurant menu/allergen sources.
2. Applies the 100% official coverage gate.
3. Reads the previous S3 `restaurant-data/latest.json`.
4. Uses the bundled generated snapshot as a seed fallback.
5. Writes S3 per-chain detail snapshots.
6. Syncs compact `META`, `TOKEN`, `POPULAR`, and `GEO` rows into DynamoDB only for the refreshed chains.
7. Publishes complete chains, keeps previous known-good chains when a refresh regresses, and blocks chains with no known-good fallback.

This prevents known-good bundled chains from disappearing remotely if prod S3 did not already have a previous known-good copy, and prevents chain refreshes from deleting future local restaurant rows.

When a user opens a local restaurant detail page, the app calls the `search-restaurants`
operation `recordRestaurantVisit` in the background. The server updates the restaurant
`META` row, but automatic refresh job queueing is disabled by default with
`DISABLE_RESTAURANT_REFRESH_JOBS=true` while the launch data is under manual quality
review. The refresh worker also exits without processing jobs unless
`DISABLE_RESTAURANT_REFRESH_JOB_PROCESSING=false` is explicitly configured. Visit
recording is best-effort and debounced on-device for 24 hours per restaurant/location
so it never blocks menu loading. Local jobs with no official source URL move to
`manual-review` instead of retrying forever when refresh processing is intentionally
re-enabled.

## Restaurant Search Index

`RestaurantSearchIndex` is a DynamoDB table with `pk` and `sk` keys. It stores:

- `META#{restaurantId}#{locationId}` rows for canonical chain/location metadata.
- `TOKEN#{token}` rows for normalized restaurant-name and alias prefix search.
- `POPULAR#GLOBAL` rows for empty-query popular restaurants.
- `GEO#{geohashPrefix}` lookup rows for physical locations.

Only `META` rows contain restaurant metadata and compatibility summaries. Popularity,
token, and geographic rows contain lightweight lookup keys; the search Lambda batch-loads
the matching `META` rows before returning a page. This keeps each allergy summary stored
once instead of duplicating it across every search token.

National chain records use `locationId = "national"` and do not require address fields. Local restaurants and physical chain locations should store `lat`, `lng`, and address fields when known.

`RestaurantRefreshJobs` is a DynamoDB operational table keyed by
`restaurantId#locationId`. Its `StatusNextRunAtIndex` lets the hourly worker query due
queued jobs by `status` and `nextRunAt` without scans.

## AppSync Models

AppSync is intentionally limited to user/community data:

- `AllergyProfile`
- `RestaurantRequest`
- `CommunityMenuItem`
- `MenuItemReport`
- `CommunityComment`

Legacy official-data models such as AppSync `Restaurant`, `MenuItem`, and `FoodReview` are not part of the active app read path and should not be reintroduced unless official restaurant data is intentionally moved out of the S3 snapshot pipeline.

## Internal Request Review

Restaurant requests can be reviewed locally with the lightweight internal admin
page:

```sh
npm run admin:requests
```

Then open:

```txt
http://localhost:4177
```

The page uses `AWS_PROFILE=allergens`, reads the active `RestaurantRequest`
DynamoDB table, and lets an internal reviewer mark requests as `pending`,
`approved`, or `rejected` with optional review notes.

## Google Places For Restaurant Requests

The Request Restaurant flow can use Google Places Autocomplete to reduce duplicate
requests and capture structured location data. It is optional at runtime; without
the key, the flow falls back to manual entry.

Set this public Expo env var before starting or building the app:

```sh
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=...
```

The key should be restricted in Google Cloud Console to the Places API. Because
the current implementation calls Places REST directly from React Native, treat
the key as public and use billing alerts/quotas. The app only requests restaurant
autocomplete and Essentials place detail fields for identity/location data.

## Local Commands

```sh
npm run typecheck
npm run lint
npm run test:pipeline
npm run scrape:restaurants
```

More detail lives in:

```txt
docs/restaurant-data-pipeline.md
```
