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
restaurant-data/runs/{timestamp}.json
restaurant-data/manifests/{timestamp}.json
```

The Lambda reads the previous `latest.json` before publishing. If a chain does not meet 100% official coverage on a refresh, the pipeline keeps the previous known-good chain snapshot and records the failed attempt in the manifest.

The app loads bundled generated data first, then attempts to fetch `restaurant-data/latest.json` from Amplify Storage, validates the snapshot schema, and caches the last valid remote snapshot in AsyncStorage.

`.github/workflows/refresh-restaurant-data.yml` still runs the local pipeline on a daily cron and on manual dispatch for repository-level auditing. It:

- Runs `npm ci`
- Runs the scraper without raw-file output
- Runs the pipeline tests
- Runs `npm run typecheck`
- Uploads the generated snapshot and run manifest as an artifact
- Pushes changed generated data to `bot/refresh-restaurant-data`

## Current Caveat

This is now a gated ingestion pipeline, but some chains still need deeper brand-specific source discovery or parser work before they can publish at 100% official coverage. The coverage gate keeps those misses visible in `latest-run.json` and prevents incomplete refreshed chain data from replacing a known-good snapshot.
