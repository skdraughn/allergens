# Restaurant Data Pipeline

The app now has a repeatable ingestion path for official fast-food menu and allergen data.

## Source Registry

`scripts/restaurant-sources.mjs` is the chain registry. Each source includes:

- QSR rank, chain id, display name, category, and domain
- Official menu URLs
- Official nutrition, ingredient, and allergen guide URLs

The current registry covers the top 30 QSR chains used by the app.

## Scraper

Run:

```sh
npm run scrape:restaurants
```

Useful options:

```sh
npm run scrape:restaurants -- --chain=mcdonalds,taco-bell
npm run scrape:restaurants -- --limit=5
npm run scrape:restaurants -- --skip-raw=true
npm run scrape:restaurants -- --product-page-limit=25
```

The scraper:

- Fetches official menu and allergen/nutrition pages.
- Discovers linked PDFs, CSVs, and spreadsheets from official allergen pages.
- Uses one `BrandAdapter` per restaurant and shared parser adapters for official APIs, HTML allergen matrices, PDF matrices, PDF ingredient text, and product allergen sections.
- Parses structured JSON/JSON-LD, dynamic page bootstrap JSON, official allergen matrices, and PDF text layers.
- Crawls official product detail pages when a menu exposes them.
- Normalizes item names, descriptions, images, direct allergens, may-contain allergens, source URLs, variant metadata, configurability, and evidence snippets.
- Rejects generic DOM menu extraction unless a brand adapter explicitly enables it.
- Applies a 100% official-coverage gate before publishing refreshed chain data.
- Saves raw fetched files under `data/scraped/raw/` for local audit. That directory is intentionally gitignored.

## Outputs

The app consumes:

```txt
src/data/generated/restaurants.generated.json
```

The latest run manifest lives at:

```txt
data/scraped/latest-run.json
```

The app only swaps scraped data into the UI for chains whose generated output passes the current quality gate. Chains that block scraping, hydrate everything client-side, or produce noisy output fall back to the starter rows until a chain-specific parser is added.

## Hosted Refresh

Amplify defines a scheduled `refresh-restaurant-data` Lambda and a `restaurantData` S3 bucket. The Lambda runs daily at `08:17 UTC` and writes:

```txt
restaurant-data/latest.json
restaurant-data/restaurants/{restaurantId}/latest.json
restaurant-data/runs/{timestamp}.json
restaurant-data/manifests/{timestamp}.json
```

The Lambda reads the previous `latest.json` before publishing and also imports the bundled generated snapshot as a seed fallback. If a chain does not meet 100% official coverage on a refresh, the pipeline keeps the previous known-good chain snapshot and records the failed attempt in the manifest. Eligible S3 known-good data wins over the bundled seed, but the bundled seed prevents a chain that is already good in the app bundle from disappearing just because prod S3 did not previously have a known-good copy.

The app loads bundled generated data first, then attempts to fetch `restaurant-data/latest.json` from Amplify Storage, validates the snapshot schema, and caches the last valid remote snapshot in AsyncStorage.

`snapshotVersion` is a schema compatibility gate, not a freshness selector. The app always pulls `restaurant-data/latest.json`; timestamped `runs/` and `manifests/` objects are for audit/debugging.

## DynamoDB Search Index

Restaurant discovery is backed by DynamoDB instead of client-side filtering over the full menu snapshot. The scheduled refresh Lambda builds and syncs rows in `RestaurantSearchIndex`:

```txt
META#{restaurantId}#{locationId}  METADATA
POPULAR#GLOBAL                   {rank}#{restaurantId}#{locationId}
TOKEN#{token}                    {rank}#{restaurantId}#{locationId}
GEO#{geohashPrefix}              {rank}#{restaurantId}#{locationId}
```

The `search-restaurants` Lambda exposes:

- `searchRestaurants(query, lat?, lng?, limit?, cursor?)`
- `listNearbyRestaurants(lat, lng, limit?, cursor?)`
- `getRestaurantSnapshotPath(restaurantId, locationId?)`

Current app behavior:

- Home search is restaurant-name search only.
- Empty query returns popular supported restaurants, or nearby rows when location permission is already granted.
- Home rows use compact compatibility summary fields and do not download full menus.
- Restaurant detail pages fetch `restaurant-data/restaurants/{restaurantId}/latest.json`.
- If the search endpoint is unavailable, the app falls back to the bundled/remote repository.

The index intentionally stores compact allergen summary fields:

- total item count
- official item count
- direct-allergen counts and exact item indexes by allergen id
- cross-contact counts and exact item indexes by allergen id
- unavailable item count and exact item indexes

The exact item indexes let the app compute user-specific `Ok`, `Review`, and `Avoid` counts without double-counting items that contain multiple selected allergens.

## Location And Address Policy

National chain records use `locationId = "national"` and do not need an address. Local restaurants and physical chain locations should store:

- `lat`
- `lng`
- `addressLine1`
- `addressLine2`
- `city`
- `region`
- `postalCode`
- `country`
- `displayAddress`

Physical rows also get `GEO#{geohashPrefix}` index rows. The Lambda queries the current geohash area and neighbors, then calculates exact distance from `lat`/`lng` before returning nearby results.

Restaurant-level derived counts are intentionally compact:

- `items.length` is the total published item count.
- `allergenDataStatus.officialItemCount` is the official allergen-covered item count.
- `coveragePercent` is retained for the coverage gate and manifests.
- Per-restaurant `snapshotVersion`, `itemCount`, `totalOfficialItemCount`, and `unavailableItemCount` are no longer produced because they duplicate repository-level or derivable values.

The previous GitHub Actions refresh workflow has been removed from this repo. Scheduled refreshes should run through the Amplify Lambda/S3 path above, not GitHub.

## Current Caveat

This is now a gated ingestion pipeline, but some chains still need deeper brand-specific source discovery or parser work before they can publish at 100% official coverage. The coverage gate keeps those misses visible in `latest-run.json` and prevents incomplete refreshed chain data from replacing a known-good snapshot.
