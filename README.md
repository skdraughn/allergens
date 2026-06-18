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

The scheduled Amplify Lambda `refresh-restaurant-data` runs daily at `08:17 UTC`.

During each refresh, the pipeline:

1. Scrapes official restaurant menu/allergen sources.
2. Applies the 100% official coverage gate.
3. Reads the previous S3 `restaurant-data/latest.json`.
4. Uses the bundled generated snapshot as a seed fallback.
5. Writes S3 per-restaurant detail snapshots.
6. Syncs compact `META`, `TOKEN`, `POPULAR`, and `GEO` rows into DynamoDB.
7. Publishes complete chains, keeps previous known-good chains when a refresh regresses, and blocks chains with no known-good fallback.

This prevents known-good bundled chains from disappearing remotely if prod S3 did not already have a previous known-good copy.

## Restaurant Search Index

`RestaurantSearchIndex` is a DynamoDB table with `pk` and `sk` keys. It stores:

- `META#{restaurantId}#{locationId}` rows for canonical chain/location metadata.
- `TOKEN#{token}` rows for normalized restaurant-name and alias prefix search.
- `POPULAR#GLOBAL` rows for empty-query popular restaurants.
- `GEO#{geohashPrefix}` rows for physical locations with `lat`/`lng`.

National chain records use `locationId = "national"` and do not require address fields. Local restaurants and physical chain locations should store `lat`, `lng`, and address fields when known.

## AppSync Models

AppSync is intentionally limited to user/community data:

- `AllergyProfile`
- `RestaurantRequest`
- `CommunityMenuItem`
- `MenuItemReport`
- `CommunityComment`

Legacy official-data models such as AppSync `Restaurant`, `MenuItem`, and `FoodReview` are not part of the active app read path and should not be reintroduced unless official restaurant data is intentionally moved out of the S3 snapshot pipeline.

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
