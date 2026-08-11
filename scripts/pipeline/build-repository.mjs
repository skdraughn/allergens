import { readFile } from "node:fs/promises";

import {
  annotateRestaurantWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";
import { rankingSource, restaurantSources } from "../restaurant-sources.mjs";
import { applyCoverageGate } from "./coverage-gate.mjs";
import {
  filterMenuCatalogRecords,
  isProbablyMenuCatalogRecord,
} from "./normalize-records.mjs";
import { scrapeRestaurant } from "./scrape-restaurant.mjs";

export { filterMenuCatalogRecords, isProbablyMenuCatalogRecord };

export async function buildRestaurantRepository({
  args: runArgs = {},
  chainFilter: requestedChainFilter = [],
  limit: requestedLimit = null,
  previousRepository = null,
  previousPath = null,
  sourceSets = restaurantSources,
} = {}) {
  const runDate = new Date().toISOString();
  const restaurants = [];
  const runSources = [];
  const selected = sourceSets
    .filter(
      (source) =>
        requestedChainFilter.length === 0 || requestedChainFilter.includes(source.id),
    )
    .slice(0, requestedLimit ?? restaurantSources.length);

  console.log(`Scraping ${selected.length} restaurant source set(s)`);

  for (const source of selected) {
    console.log(`→ ${source.name}`);
    const result = await scrapeRestaurant(source);
    restaurants.push(result.restaurant);
    runSources.push(...result.sources);

    const statusLine = result.sources
      .map((entry) => `${entry.status}:${shortUrl(entry.url)}`)
      .join(", ");
    console.log(
      `  ${result.restaurant.items.length} item(s), ${result.restaurant.sourceStatus.ok} ok / ${result.restaurant.sourceStatus.failed} failed source(s) ${statusLine}`,
    );
  }

  const repository = {
    generatedAt: runDate,
    rankingSource,
    snapshotVersion: 1,
    sourceCount: runSources.length,
    restaurantCount: restaurants.length,
    itemCount: restaurants.reduce((count, restaurant) => count + restaurant.items.length, 0),
    restaurants,
  };

  const previous = previousRepository ?? (previousPath ? await readJsonIfExists(previousPath) : null);
  const gated = applyCoverageGate(repository, previous);
  const ingredientIntelligenceManifest = await getDefaultIngredientIntelligenceManifest();
  const annotatedRestaurants = await Promise.all(
    gated.repository.restaurants.map((restaurant) =>
      annotateRestaurantWithIngredientIntelligence(restaurant, {
        manifest: ingredientIntelligenceManifest,
      }),
    ),
  );
  const annotatedRepository = {
    ...gated.repository,
    inferenceVersion: ingredientIntelligenceManifest.version,
    restaurants: annotatedRestaurants.map(populateRestaurantLogo),
  };

  const run = {
    generatedAt: runDate,
    args: runArgs,
    coverageGate: gated.manifest,
    sourceCount: runSources.length,
    okCount: runSources.filter((source) => source.ok).length,
    failedCount: runSources.filter((source) => !source.ok).length,
    sources: runSources,
  };

  return {
    repository: annotatedRepository,
    run,
  };
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.slice(0, 80);
  } catch {
    return String(url).slice(0, 80);
  }
}

function populateRestaurantLogo(restaurant) {
  if (restaurant.logoUrl || restaurant.logoSvgUrl || restaurant.logoMonogram || !restaurant.domain) {
    return restaurant;
  }

  return {
    ...restaurant,
    logoUrl: faviconUrl(restaurant.domain),
  };
}

function faviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
}
