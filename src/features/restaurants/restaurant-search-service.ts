import AsyncStorage from "@react-native-async-storage/async-storage";

import { normalizeAllergyIds } from "@/constants/allergies";
import type { Restaurant } from "@/data/restaurants";
import { getRestaurantBrand } from "@/data/brand-assets";

import amplifyOutputs from "../../../amplify_outputs.json";

type AmplifyCustomOutputs = {
  custom?: {
    restaurantSearchEndpoint?: string;
  };
};

export type RestaurantSearchResult = {
  brandKey?: string | null;
  category?: string | null;
  city?: string | null;
  compatibilitySummary?: RestaurantCompatibilitySummary | null;
  country?: string | null;
  coveragePercent?: number | null;
  coverageStatus?: string | null;
  displayAddress?: string | null;
  domain?: string | null;
  distanceMiles?: number | null;
  guideLabel?: string | null;
  guideUrl?: string | null;
  lat?: number | null;
  lastOpenedAt?: string | null;
  lastRefreshedAt?: string | null;
  logoAspectRatio?: number | null;
  logoMonogram?: string | null;
  logoSvgUrl?: string | null;
  logoUrl?: string | null;
  lng?: number | null;
  locationId?: string | null;
  nextEligibleRefreshAt?: string | null;
  name: string;
  officialItemCount?: number | null;
  openedCount?: number | null;
  rank?: number | null;
  region?: string | null;
  restaurantId: string;
  refreshStatus?: string | null;
  refreshTier?: string | null;
  snapshotPath?: string | null;
  sourceStatus?: unknown;
  sourceUrls?: string[] | null;
  totalItemCount?: number | null;
  type?: "chain" | "local" | string | null;
};

export type RestaurantSearchPage = {
  nextToken?: string | null;
  results: RestaurantSearchResult[];
};

export type RestaurantSearchSummary = {
  avoidCount: number;
  cautionCount: number;
  okCount: number;
  totalCount: number;
};

export type RestaurantSearchLocation = {
  lat: number;
  lng: number;
};

type SearchRestaurantsInput = {
  fallbackRestaurants?: Restaurant[];
  limit?: number;
  location?: RestaurantSearchLocation | null;
  nextToken?: string | null;
  query: string;
};

type RestaurantCompatibilitySummary = {
  directAllergenItemCounts?: Record<string, number>;
  directAllergenItemIndexes?: Record<string, number[]>;
  mayContainAllergenItemCounts?: Record<string, number>;
  mayContainAllergenItemIndexes?: Record<string, number[]>;
  officialItemCount?: number;
  totalItemCount?: number;
  unavailableCount?: number;
  unavailableItemIndexes?: number[];
};

const searchEndpoint = ((amplifyOutputs as AmplifyCustomOutputs).custom?.restaurantSearchEndpoint ?? "")
  .trim();
const visitDebouncePrefix = "restaurant-visit-recorded/";
const visitDebounceMs = 24 * 60 * 60 * 1000;

export async function getRestaurantSearchLocation(): Promise<RestaurantSearchLocation | null> {
  // Temporarily disabled for dev-client builds that do not include ExpoLocation.
  return null;
}

export async function searchRestaurants({
  fallbackRestaurants,
  limit = 30,
  location,
  nextToken,
  query,
}: SearchRestaurantsInput): Promise<RestaurantSearchResult[]> {
  const page = await searchRestaurantPage({
    fallbackRestaurants,
    limit,
    location,
    nextToken,
    query,
  });

  return page.results;
}

export async function searchRestaurantPage({
  fallbackRestaurants,
  limit = 30,
  location,
  nextToken,
  query,
}: SearchRestaurantsInput): Promise<RestaurantSearchPage> {
  const normalizedQuery = normalizeSearchText(query);
  const fallback = fallbackRestaurants ?? [];

  if (searchEndpoint) {
    try {
      const response = await fetch(searchEndpoint, {
        body: JSON.stringify({
          lat: location?.lat,
          limit,
          lng: location?.lng,
          nextToken,
          operation: normalizedQuery ? "searchRestaurants" : "listNearbyRestaurants",
          query: normalizedQuery,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (response.ok) {
        const payload = (await response.json()) as { nextToken?: unknown; results?: unknown };
        const results = Array.isArray(payload.results)
          ? payload.results.map(mapSearchResult).filter(isSearchResult)
          : [];
        const reconciledResults = reconcileSearchResults(results, fallback);

        return {
          nextToken: asString(payload.nextToken),
          results: mergeMatchingFallbackResults(
            reconciledResults,
            fallback,
            normalizedQuery,
            limit,
          ),
        };
      }
    } catch (error) {
      console.warn("Restaurant search API unavailable", error);
    }
  }

  return {
    nextToken: null,
    results: fallbackRestaurantSearch(fallback, normalizedQuery, limit),
  };
}

export async function recordRestaurantVisit({
  location,
  locationId = "national",
  restaurantId,
}: {
  location?: RestaurantSearchLocation | null;
  locationId?: string | null;
  restaurantId: string;
}) {
  if (!searchEndpoint || !restaurantId) {
    return;
  }

  const normalizedLocationId = locationId?.trim() || "national";
  const debounceKey = `${visitDebouncePrefix}${restaurantId}/${normalizedLocationId}`;

  try {
    const lastRecordedAt = await AsyncStorage.getItem(debounceKey);
    const lastRecordedMs = Number(lastRecordedAt);

    if (Number.isFinite(lastRecordedMs) && Date.now() - lastRecordedMs < visitDebounceMs) {
      return;
    }

    await AsyncStorage.setItem(debounceKey, String(Date.now()));
  } catch {
    // Visit recording is best-effort and should never block menu loading.
  }

  try {
    const response = await fetch(searchEndpoint, {
      body: JSON.stringify({
        lat: location?.lat,
        lng: location?.lng,
        locationId: normalizedLocationId,
        operation: "recordRestaurantVisit",
        restaurantId,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Visit recorder failed with ${response.status}`);
    }
  } catch (error) {
    console.warn("Restaurant visit recording unavailable", error);
  }
}

export function getSearchResultSummary(
  result: RestaurantSearchResult,
  selectedAllergyIds: string[],
) {
  const summary = result.compatibilitySummary;
  const totalCount = summary?.totalItemCount ?? result.totalItemCount ?? 0;
  const selectedIds = expandSelectedAllergyIds(selectedAllergyIds);

  if (!summary || selectedIds.length === 0) {
    return {
      avoidCount: 0,
      cautionCount: Number(summary?.unavailableCount ?? 0),
      okCount: Math.max(0, totalCount - Number(summary?.unavailableCount ?? 0)),
      totalCount,
    };
  }

  if (summary.directAllergenItemIndexes || summary.mayContainAllergenItemIndexes) {
    const avoidIndexes = collectIndexes(summary.directAllergenItemIndexes, selectedIds);
    const cautionIndexes = collectIndexes(summary.mayContainAllergenItemIndexes, selectedIds);

    for (const index of summary.unavailableItemIndexes ?? []) {
      cautionIndexes.add(index);
    }

    for (const index of avoidIndexes) {
      cautionIndexes.delete(index);
    }

    const avoidCount = avoidIndexes.size;
    const cautionCount = cautionIndexes.size;

    return {
      avoidCount,
      cautionCount,
      okCount: Math.max(0, totalCount - avoidCount - cautionCount),
      totalCount,
    };
  }

  const avoidCount = Math.min(
    totalCount,
    selectedIds.reduce(
      (sum, id) => sum + Number(summary.directAllergenItemCounts?.[id] ?? 0),
      0,
    ),
  );
  const cautionCount = Math.min(
    Math.max(0, totalCount - avoidCount),
    selectedIds.reduce(
      (sum, id) => sum + Number(summary.mayContainAllergenItemCounts?.[id] ?? 0),
      Number(summary.unavailableCount ?? 0),
    ),
  );

  return {
    avoidCount,
    cautionCount,
    okCount: Math.max(0, totalCount - avoidCount - cautionCount),
    totalCount,
  };
}

export function searchResultFromRestaurant(restaurant: Restaurant): RestaurantSearchResult {
  return {
    city: restaurant.city ?? restaurant.address?.city,
    brandKey: restaurant.brandKey,
    category: restaurant.category,
    compatibilitySummary: compatibilitySummaryFromRestaurant(restaurant),
    country: restaurant.country ?? restaurant.address?.country,
    coveragePercent: restaurant.coveragePercent,
    coverageStatus: restaurant.coverageStatus,
    displayAddress: restaurant.displayAddress ?? restaurant.address?.displayAddress,
    domain: restaurant.domain,
    guideLabel: restaurant.guideLabel,
    guideUrl: restaurant.guideUrl,
    lat: restaurant.lat,
    logoAspectRatio: restaurant.logoAspectRatio,
    logoMonogram: restaurant.logoMonogram,
    logoSvgUrl: restaurant.logoSvgUrl,
    logoUrl: restaurant.logoUrl,
    lng: restaurant.lng,
    locationId: restaurant.locationId ?? "national",
    name: restaurant.name,
    officialItemCount:
      restaurant.allergenDataStatus?.officialItemCount ??
      restaurant.items.filter((item) => item.allergenSourceType !== "unavailable").length,
    rank: restaurant.rank,
    restaurantId: restaurant.id,
    snapshotPath: restaurant.snapshotPath,
    sourceStatus: restaurant.sourceStatus,
    sourceUrls: restaurant.sourceUrls,
    totalItemCount: restaurant.totalItemCount ?? restaurant.items.length,
    type: restaurant.type ?? "chain",
  };
}

function reconcileSearchResults(
  results: RestaurantSearchResult[],
  fallbackRestaurants: Restaurant[],
) {
  if (fallbackRestaurants.length === 0) {
    return results;
  }

  const fallbackById = new Map(
    fallbackRestaurants.map((restaurant) => [restaurant.id, restaurant]),
  );

  return results.map((result) => {
    const fallbackRestaurant = fallbackById.get(result.restaurantId);

    if (!fallbackRestaurant) {
      return result;
    }

    const remoteItemCount = Math.max(
      0,
      result.totalItemCount ?? 0,
      result.officialItemCount ?? 0,
      result.compatibilitySummary?.totalItemCount ?? 0,
      result.compatibilitySummary?.officialItemCount ?? 0,
    );
    const fallbackOfficialItemCount =
      fallbackRestaurant.allergenDataStatus?.officialItemCount ??
      fallbackRestaurant.items.filter((item) => item.allergenSourceType !== "unavailable").length;
    const fallbackItemCount = fallbackRestaurant.totalItemCount ?? fallbackRestaurant.items.length;

    if (
      remoteItemCount >= fallbackItemCount ||
      remoteItemCount >= fallbackOfficialItemCount
    ) {
      return result;
    }

    const fallbackResult = searchResultFromRestaurant(fallbackRestaurant);

    return {
      ...result,
      ...fallbackResult,
      distanceMiles: result.distanceMiles,
      lastOpenedAt: result.lastOpenedAt,
      nextEligibleRefreshAt: result.nextEligibleRefreshAt,
      openedCount: result.openedCount,
      refreshStatus: result.refreshStatus,
      refreshTier: result.refreshTier,
      snapshotPath: null,
    };
  });
}

function mergeMatchingFallbackResults(
  results: RestaurantSearchResult[],
  fallbackRestaurants: Restaurant[],
  normalizedQuery: string,
  limit: number,
) {
  if (!normalizedQuery || fallbackRestaurants.length === 0) {
    return results;
  }

  const resultIds = new Set(results.map((result) => result.restaurantId));
  const fallbackMatches = fallbackRestaurantSearch(
    fallbackRestaurants.filter((restaurant) => !resultIds.has(restaurant.id)),
    normalizedQuery,
    Math.max(0, limit - results.length),
  );

  return [...results, ...fallbackMatches];
}

export function fallbackRestaurantSearch(
  restaurants: Restaurant[],
  normalizedQuery: string,
  limit: number,
) {
  return restaurants
    .map((restaurant) => ({
      matchRank: getFallbackMatchRank(restaurant, normalizedQuery),
      result: searchResultFromRestaurant(restaurant),
    }))
    .filter(({ matchRank }) => !normalizedQuery || matchRank < Number.POSITIVE_INFINITY)
    .sort((left, right) => {
      const leftRank = Number(left.result.rank ?? 9999);
      const rightRank = Number(right.result.rank ?? 9999);
      return left.matchRank - right.matchRank || leftRank - rightRank;
    })
    .slice(0, limit)
    .map(({ result }) => result);
}

function getFallbackMatchRank(restaurant: Restaurant, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  const restaurantName = normalizeSearchText(restaurant.name);
  const compactName = restaurantName.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");

  if (restaurantName === normalizedQuery || compactName === compactQuery) {
    return 0;
  }

  if (restaurantName.startsWith(normalizedQuery) || compactName.startsWith(compactQuery)) {
    return 1;
  }

  if (restaurantName.includes(normalizedQuery) || compactName.includes(compactQuery)) {
    return 2;
  }

  const brandDescription = getRestaurantBrand(restaurant.id).description;
  const restaurantDetails = [restaurant.category, brandDescription].join(" ");

  if (normalizeSearchText(restaurantDetails).includes(normalizedQuery)) {
    return 3;
  }

  return Number.POSITIVE_INFINITY;
}

function compatibilitySummaryFromRestaurant(restaurant: Restaurant): RestaurantCompatibilitySummary {
  const directAllergenItemCounts: Record<string, number> = {};
  const directAllergenItemIndexes: Record<string, number[]> = {};
  const mayContainAllergenItemCounts: Record<string, number> = {};
  const mayContainAllergenItemIndexes: Record<string, number[]> = {};
  const unavailableItemIndexes: number[] = [];

  restaurant.items.forEach((item, index) => {
    const unavailable =
      item.allergenSourceType === "unavailable" ||
      (!item.allergenSourceType &&
        item.allergens.length === 0 &&
        (item.mayContain ?? []).length === 0 &&
        !item.ingredientsText);

    if (unavailable) {
      unavailableItemIndexes.push(index);
    }

    for (const allergen of item.allergens) {
      directAllergenItemCounts[allergen] = (directAllergenItemCounts[allergen] ?? 0) + 1;
      directAllergenItemIndexes[allergen] = [...(directAllergenItemIndexes[allergen] ?? []), index];
    }

    for (const allergen of item.mayContain ?? []) {
      mayContainAllergenItemCounts[allergen] = (mayContainAllergenItemCounts[allergen] ?? 0) + 1;
      mayContainAllergenItemIndexes[allergen] = [
        ...(mayContainAllergenItemIndexes[allergen] ?? []),
        index,
      ];
    }
  });

  return {
    directAllergenItemCounts,
    directAllergenItemIndexes,
    mayContainAllergenItemCounts,
    mayContainAllergenItemIndexes,
    officialItemCount:
      restaurant.allergenDataStatus?.officialItemCount ??
      restaurant.items.filter((item) => item.allergenSourceType !== "unavailable").length,
    totalItemCount: restaurant.totalItemCount ?? restaurant.items.length,
    unavailableCount: unavailableItemIndexes.length,
    unavailableItemIndexes,
  };
}

function collectIndexes(indexesByAllergen: Record<string, number[]> | undefined, allergenIds: string[]) {
  const indexes = new Set<number>();

  for (const allergenId of allergenIds) {
    for (const index of indexesByAllergen?.[allergenId] ?? []) {
      indexes.add(index);
    }
  }

  return indexes;
}

function expandSelectedAllergyIds(selectedAllergyIds: string[]) {
  const normalizedIds = normalizeAllergyIds(selectedAllergyIds);

  if (normalizedIds.includes("gluten") && !normalizedIds.includes("wheat")) {
    return [...normalizedIds, "wheat"];
  }

  return normalizedIds;
}

function mapSearchResult(value: unknown): RestaurantSearchResult | null {
  const record = value as Record<string, unknown>;
  const restaurantId = asString(record.restaurantId);
  const name = asString(record.name);

  if (!restaurantId || !name) {
    return null;
  }

  return {
    brandKey: asString(record.brandKey),
    category: asString(record.category),
    city: asString(record.city),
    compatibilitySummary: isRecord(record.compatibilitySummary)
      ? (record.compatibilitySummary as RestaurantCompatibilitySummary)
      : null,
    country: asString(record.country),
    coveragePercent: asNumber(record.coveragePercent),
    coverageStatus: asString(record.coverageStatus),
    displayAddress: asString(record.displayAddress),
    domain: asString(record.domain),
    distanceMiles: asNumber(record.distanceMiles),
    guideLabel: asString(record.guideLabel),
    guideUrl: asString(record.guideUrl),
    lat: asNumber(record.lat),
    lastOpenedAt: asString(record.lastOpenedAt),
    lastRefreshedAt: asString(record.lastRefreshedAt),
    logoAspectRatio: asNumber(record.logoAspectRatio),
    logoMonogram: asString(record.logoMonogram),
    logoSvgUrl: asString(record.logoSvgUrl),
    logoUrl: asString(record.logoUrl),
    lng: asNumber(record.lng),
    locationId: asString(record.locationId),
    nextEligibleRefreshAt: asString(record.nextEligibleRefreshAt),
    name,
    officialItemCount: asNumber(record.officialItemCount),
    openedCount: asNumber(record.openedCount),
    rank: asNumber(record.rank),
    region: asString(record.region),
    restaurantId,
    refreshStatus: asString(record.refreshStatus),
    refreshTier: asString(record.refreshTier),
    snapshotPath: asString(record.snapshotPath),
    sourceStatus: record.sourceStatus,
    sourceUrls: Array.isArray(record.sourceUrls)
      ? record.sourceUrls.filter((item): item is string => typeof item === "string")
      : null,
    totalItemCount: asNumber(record.totalItemCount),
    type: asString(record.type),
  };
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSearchResult(value: RestaurantSearchResult | null): value is RestaurantSearchResult {
  return value !== null;
}
