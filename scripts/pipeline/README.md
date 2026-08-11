# Restaurant Pipeline Structure

`scrape-restaurants.mjs` is intentionally a small compatibility wrapper. New code should target the pipeline modules directly:

- `build-repository.mjs`: selects sources, runs restaurant scraping, applies coverage gate, and annotates Ingredient Intelligence.
- `scrape-restaurant.mjs`: scrapes one restaurant source set.
- `fetch-source.mjs`: fetches a source URL and records source manifest data.
- `normalize-records.mjs`: normalizes raw parser records and filters catalog artifacts.
- `merge-records.mjs`: merges normalized records into menu items.
- `coverage-gate.mjs`: re-exports coverage-gate policy functions.
- `publish-snapshot.mjs`: writes repository and run manifest files.

The remaining large `legacy-scrape-engine.mjs` owns parser implementations while they are being extracted into focused restaurant adapters and generic parser modules. Avoid adding new orchestration or CLI behavior there.

## DC Metro First Pass

Local DC launch sources should use the shared local menu fallback path whenever possible:

- mark the source as `type: "local"`
- set `allowUnavailableAllergenFallback: true`
- provide official menu/allergen URLs only
- avoid restaurant-specific parsers unless a high-value source cannot be represented by shared HTML/PDF/API parsing

The first pass ships Founding Farmers DC plus Ted's Bulletin, sweetgreen, District Taco, Taco Bamba City Ridge, and Old Ebbitt Grill. Deferred candidates that need better shared extraction or a reliable official endpoint include Busboys and Poets, Call Your Mother, &pizza, Le Diplomate, Zaytinya, Nando's, and Potbelly.
