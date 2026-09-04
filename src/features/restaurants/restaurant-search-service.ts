import AsyncStorage from "@react-native-async-storage/async-storage";

import { normalizeAllergyIds } from "@/constants/allergies";
import type { Restaurant } from "@/data/restaurants";
import { getRestaurantBrand } from "@/data/brand-assets";
import {
  getApplicableIngredientIntelligenceSignals,
  getApplicableIngredientIntelligenceSuppressions,
  getPublishedAllergenSourceAuthority,
  getRestaurantAllergenSourceCounts,
  hasApplicableIngredientIntelligence,
  isPublishedAllergenCovered,
} from "@/lib/safety";

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
  evidenceStatus:
    | "unconfigured"
    | "official"
    | "linked"
    | "mixed"
    | "intelligence"
    | "partial"
    | "none"
    | "unknown";
  hasIngredientIntelligence: boolean;
  ingredientIntelligenceOkCount: number;
  needsConfirmationCount: number;
  okCount: number;
  totalCount: number;
};

export type RestaurantAllergenCoverage = {
  allergenId: string;
  coveredItemCount: number;
  status: "official" | "linked" | "mixed" | "partial";
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
  signal?: AbortSignal;
};

type RestaurantCompatibilitySummary = {
  directAllergenItemCounts?: Record<string, number>;
  directAllergenItemIndexes?: Record<string, number[]>;
  inferredAllergenItemIndexes?: Record<string, number[]>;
  ingredientIntelligenceItemIndexes?: number[];
  ingredientIntelligenceSafeAllergenItemIndexes?: Record<string, number[]>;
  linkedAllergenItemIndexes?: number[];
  mayContainAllergenItemCounts?: Record<string, number>;
  mayContainAllergenItemIndexes?: Record<string, number[]>;
  officialItemCount?: number;
  totalItemCount?: number;
  unavailableCount?: number;
  unavailableAllergenItemIndexes?: Record<string, number[]>;
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
  signal,
}: SearchRestaurantsInput): Promise<RestaurantSearchResult[]> {
  const page = await searchRestaurantPage({
    fallbackRestaurants,
    limit,
    location,
    nextToken,
    query,
    signal,
  });

  return page.results;
}

export async function searchRestaurantPage({
  fallbackRestaurants,
  limit = 30,
  location,
  nextToken,
  query,
  signal,
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
        signal,
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
      if (signal?.aborted) {
        throw error;
      }

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
): RestaurantSearchSummary {
  const summary = result.compatibilitySummary;
  const totalCount = summary?.totalItemCount ?? result.totalItemCount ?? 0;
  const selectedIds = expandSelectedAllergyIds(selectedAllergyIds);

  if (selectedIds.length === 0) {
    return {
      avoidCount: 0,
      cautionCount: 0,
      evidenceStatus: "unconfigured",
      hasIngredientIntelligence: false,
      ingredientIntelligenceOkCount: 0,
      needsConfirmationCount: 0,
      okCount: 0,
      totalCount,
    };
  }

  if (!summary) {
    return {
      avoidCount: 0,
      cautionCount: totalCount,
      evidenceStatus: "unknown",
      hasIngredientIntelligence: false,
      ingredientIntelligenceOkCount: 0,
      needsConfirmationCount: totalCount,
      okCount: 0,
      totalCount,
    };
  }

  if (summary.directAllergenItemIndexes || summary.mayContainAllergenItemIndexes) {
    const directIndexes = collectIndexes(summary.directAllergenItemIndexes, selectedIds);
    const avoidIndexes = new Set(directIndexes);
    const mayContainIndexes = collectIndexes(summary.mayContainAllergenItemIndexes, selectedIds);
    const cautionIndexes = new Set(mayContainIndexes);
    const inferredIndexes = collectIndexes(summary.inferredAllergenItemIndexes, selectedIds);
    const intelligenceSafeIndexes = collectIndexes(
      summary.ingredientIntelligenceSafeAllergenItemIndexes,
      selectedIds,
    );
    const intelligenceIndexes = new Set([...inferredIndexes, ...intelligenceSafeIndexes]);
    const unavailableIndexes = summary.unavailableAllergenItemIndexes
      ? collectIndexes(summary.unavailableAllergenItemIndexes, selectedIds)
      : new Set(summary.unavailableItemIndexes ?? []);

    for (const allergenId of selectedIds) {
      const unavailableForAllergen = new Set(
        summary.unavailableAllergenItemIndexes?.[allergenId] ??
          summary.unavailableItemIndexes ??
          [],
      );

      for (const index of summary.inferredAllergenItemIndexes?.[allergenId] ?? []) {
        if (unavailableForAllergen.has(index)) {
          avoidIndexes.add(index);
        }
      }
    }

    for (const index of unavailableIndexes) {
      cautionIndexes.add(index);
    }

    for (const index of avoidIndexes) {
      cautionIndexes.delete(index);
    }

    const avoidCount = avoidIndexes.size;
    const cautionCount = cautionIndexes.size;
    const ingredientIntelligenceOkCount = Array.from(intelligenceSafeIndexes).filter(
      (index) =>
        unavailableIndexes.has(index) &&
        !avoidIndexes.has(index) &&
        !mayContainIndexes.has(index) &&
        !inferredIndexes.has(index),
    ).length;

    const relevantIntelligenceCount = Array.from(intelligenceIndexes).filter((index) =>
      unavailableIndexes.has(index),
    ).length;
    const needsConfirmationCount = Math.max(
      0,
      cautionCount - ingredientIntelligenceOkCount,
    );
    const linkedSourceIndexes = new Set(
      summary.linkedAllergenItemIndexes ?? [],
    );
    const officialResolvedIndexes = new Set<number>();
    const linkedResolvedIndexes = new Set<number>();
    const addPublishedResolution = (index: number) => {
      if (linkedSourceIndexes.has(index)) {
        linkedResolvedIndexes.add(index);
      } else {
        officialResolvedIndexes.add(index);
      }
    };

    for (const index of [...directIndexes, ...mayContainIndexes]) {
      addPublishedResolution(index);
    }

    for (let index = 0; index < totalCount; index += 1) {
      if (!unavailableIndexes.has(index)) {
        addPublishedResolution(index);
      }
    }

    const intelligenceResolvedIndexes = new Set(
      Array.from(intelligenceIndexes).filter((index) => unavailableIndexes.has(index)),
    );
    const resolvedIndexes = new Set([
      ...officialResolvedIndexes,
      ...linkedResolvedIndexes,
      ...intelligenceResolvedIndexes,
    ]);
    const hasAllergenSpecificCoverage = Boolean(
      summary.unavailableAllergenItemIndexes,
    );
    let evidenceStatus: RestaurantSearchSummary["evidenceStatus"] = "unknown";

    if (totalCount <= 0) {
      evidenceStatus = "none";
    } else if (!hasAllergenSpecificCoverage) {
      evidenceStatus = "unknown";
    } else if (officialResolvedIndexes.size >= totalCount) {
      evidenceStatus = "official";
    } else if (linkedResolvedIndexes.size >= totalCount) {
      evidenceStatus = "linked";
    } else if (resolvedIndexes.size >= totalCount) {
      const resolvedSourceCount = [
        officialResolvedIndexes,
        linkedResolvedIndexes,
        intelligenceResolvedIndexes,
      ].filter((indexes) => indexes.size > 0).length;

      evidenceStatus =
        resolvedSourceCount > 1
          ? "mixed"
          : intelligenceResolvedIndexes.size > 0
            ? "intelligence"
            : linkedResolvedIndexes.size > 0
              ? "linked"
              : "official";
    } else if (resolvedIndexes.size > 0) {
      evidenceStatus = "partial";
    } else {
      evidenceStatus = "none";
    }

    return {
      avoidCount,
      cautionCount,
      evidenceStatus,
      hasIngredientIntelligence: relevantIntelligenceCount > 0,
      ingredientIntelligenceOkCount,
      needsConfirmationCount,
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
    evidenceStatus: "unknown",
    hasIngredientIntelligence: false,
    ingredientIntelligenceOkCount: 0,
    needsConfirmationCount: cautionCount,
    okCount: Math.max(0, totalCount - avoidCount - cautionCount),
    totalCount,
  };
}

export function getSearchResultAllergenCoverage(
  result: RestaurantSearchResult,
  selectedAllergyIds: string[],
): RestaurantAllergenCoverage[] {
  const summary = result.compatibilitySummary;
  const unavailableByAllergen = summary?.unavailableAllergenItemIndexes;
  const totalCount = summary?.totalItemCount ?? result.totalItemCount ?? 0;

  if (!unavailableByAllergen || totalCount <= 0) {
    return [];
  }

  return normalizeAllergyIds(selectedAllergyIds).flatMap((allergenId) => {
    if (!Object.prototype.hasOwnProperty.call(unavailableByAllergen, allergenId)) {
      return [];
    }

    const unavailableIndexes = new Set(
      unavailableByAllergen[allergenId] ?? [],
    );
    const unavailableCount = unavailableIndexes.size;
    const coveredItemCount = Math.max(0, totalCount - unavailableCount);

    const linkedSourceIndexes = new Set(
      summary?.linkedAllergenItemIndexes ?? [],
    );
    const linkedCoveredCount = Array.from(
      { length: totalCount },
      (_, index) => index,
    ).filter(
      (index) =>
        !unavailableIndexes.has(index) &&
        linkedSourceIndexes.has(index),
    ).length;
    const status =
      coveredItemCount < totalCount
        ? "partial" as const
        : linkedCoveredCount === totalCount
          ? "linked" as const
          : linkedCoveredCount > 0
            ? "mixed" as const
            : "official" as const;

    return [{
      allergenId,
      coveredItemCount,
      status,
      totalCount,
    }];
  });
}

export function searchResultFromRestaurant(restaurant: Restaurant): RestaurantSearchResult {
  const hasLoadedItems = restaurant.items.length > 0;
  const totalItemCount = getRestaurantItemCount(restaurant);

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
      hasLoadedItems
        ? getRestaurantAllergenSourceCounts(restaurant).officialItemCount
        : restaurant.allergenDataStatus?.officialItemCount ?? 0,
    rank: restaurant.rank,
    restaurantId: restaurant.id,
    snapshotPath: restaurant.snapshotPath,
    sourceStatus: restaurant.sourceStatus,
    sourceUrls: restaurant.sourceUrls,
    totalItemCount,
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

  return results.flatMap((result) => {
    const fallbackRestaurant = fallbackById.get(result.restaurantId);

    if (!fallbackRestaurant) {
      // The versioned catalog owns restaurant membership. Search affirmation
      // may contain a stale row for a retired restaurant, but it must never
      // reintroduce that row into the app.
      return [];
    }

    const fallbackResult = searchResultFromRestaurant(fallbackRestaurant);
    const fallbackItemCount = fallbackResult.totalItemCount ?? 0;
    const apiSummaryItemCount = result.compatibilitySummary?.totalItemCount;
    const compatibilitySummary =
      fallbackRestaurant.items.length > 0
        ? fallbackResult.compatibilitySummary
        : result.compatibilitySummary && apiSummaryItemCount === fallbackItemCount
          ? result.compatibilitySummary
          : conservativeCompatibilitySummary(fallbackItemCount);

    return [{
      ...result,
      ...fallbackResult,
      // Full local detail owns compatibility when it is present. The home
      // repository intentionally contains lightweight rows with no item array,
      // so those rows retain the matching Lambda summary instead of being
      // replaced by an all-unavailable conservative placeholder.
      compatibilitySummary,
      distanceMiles: result.distanceMiles,
      lastOpenedAt: result.lastOpenedAt,
      nextEligibleRefreshAt: result.nextEligibleRefreshAt,
      openedCount: result.openedCount,
      refreshStatus: result.refreshStatus,
      refreshTier: result.refreshTier,
    }];
  });
}

function conservativeCompatibilitySummary(
  totalItemCount: number,
): RestaurantCompatibilitySummary {
  return {
    directAllergenItemCounts: {},
    directAllergenItemIndexes: {},
    inferredAllergenItemIndexes: {},
    ingredientIntelligenceItemIndexes: [],
    ingredientIntelligenceSafeAllergenItemIndexes: {},
    linkedAllergenItemIndexes: [],
    mayContainAllergenItemCounts: {},
    mayContainAllergenItemIndexes: {},
    officialItemCount: 0,
    totalItemCount,
    unavailableCount: totalItemCount,
    unavailableItemIndexes: Array.from(
      { length: totalItemCount },
      (_, index) => index,
    ),
  };
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
      restaurant,
    }))
    .filter(({ matchRank }) => !normalizedQuery || matchRank < Number.POSITIVE_INFINITY)
    .sort((left, right) => {
      const leftRank = Number(left.restaurant.rank ?? 9999);
      const rightRank = Number(right.restaurant.rank ?? 9999);
      return left.matchRank - right.matchRank || leftRank - rightRank;
    })
    .slice(0, limit)
    .map(({ restaurant }) => searchResultFromRestaurant(restaurant));
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
  const totalItemCount = getRestaurantItemCount(restaurant);

  if (restaurant.items.length === 0 && totalItemCount > 0) {
    return conservativeCompatibilitySummary(totalItemCount);
  }

  const directAllergenItemCounts: Record<string, number> = {};
  const directAllergenItemIndexes: Record<string, number[]> = {};
  const mayContainAllergenItemCounts: Record<string, number> = {};
  const mayContainAllergenItemIndexes: Record<string, number[]> = {};
  const inferredAllergenItemIndexes: Record<string, number[]> = {};
  const ingredientIntelligenceItemIndexes: number[] = [];
  const ingredientIntelligenceSafeAllergenItemIndexes: Record<string, number[]> = {};
  const linkedAllergenItemIndexes: number[] = [];
  const unavailableAllergenItemIndexes: Record<string, number[]> = {};
  const unavailableItemIndexes: number[] = [];

  restaurant.items.forEach((item, index) => {
    const sourceAuthority = getPublishedAllergenSourceAuthority(item);

    if (sourceAuthority === "linked") {
      linkedAllergenItemIndexes.push(index);
    }

    const unavailableAllergenIds = Object.keys(allergyIndexSeed).filter(
      (allergenId) =>
        !isPublishedAllergenCovered(
          item,
          restaurant.officialAllergenProfiles,
          allergenId,
        ),
    );
    const unavailable = unavailableAllergenIds.length === Object.keys(allergyIndexSeed).length;

    for (const allergenId of unavailableAllergenIds) {
      unavailableAllergenItemIndexes[allergenId] = [
        ...(unavailableAllergenItemIndexes[allergenId] ?? []),
        index,
      ];
    }

    if (unavailableAllergenIds.length > 0) {
      if (unavailable) {
        unavailableItemIndexes.push(index);
      }

      if (
        hasApplicableIngredientIntelligence(
          item,
          restaurant.officialAllergenProfiles,
        )
      ) {
        ingredientIntelligenceItemIndexes.push(index);

        const applicableSignals = getApplicableIngredientIntelligenceSignals(
          item,
          restaurant.officialAllergenProfiles,
        );
        const signaledAllergenIds = new Set<string>(
          applicableSignals.map((signal) => signal.id),
        );

        for (const signal of applicableSignals) {
          inferredAllergenItemIndexes[signal.id] = [
            ...(inferredAllergenItemIndexes[signal.id] ?? []),
            index,
          ];
        }

        // The menu UI already presents a reviewed Intelligence result with no
        // matching profile signal as clear. Encode that same allergen-specific
        // result in the home summary so the two surfaces cannot disagree.
        const explicitlySuppressedIds = new Set<string>(
          getApplicableIngredientIntelligenceSuppressions(
            item,
            restaurant.officialAllergenProfiles,
          ).map((suppression) => suppression.id),
        );

        for (const allergenId of unavailableAllergenIds) {
          if (
            signaledAllergenIds.has(allergenId) &&
            !explicitlySuppressedIds.has(allergenId)
          ) {
            continue;
          }

          ingredientIntelligenceSafeAllergenItemIndexes[allergenId] = [
            ...(ingredientIntelligenceSafeAllergenItemIndexes[allergenId] ?? []),
            index,
          ];
        }
      }
    }

    if (sourceAuthority) {
      for (const allergen of item.allergens) {
        directAllergenItemCounts[allergen] =
          (directAllergenItemCounts[allergen] ?? 0) + 1;
        directAllergenItemIndexes[allergen] = [
          ...(directAllergenItemIndexes[allergen] ?? []),
          index,
        ];
      }

      for (const allergen of item.mayContain ?? []) {
        mayContainAllergenItemCounts[allergen] =
          (mayContainAllergenItemCounts[allergen] ?? 0) + 1;
        mayContainAllergenItemIndexes[allergen] = [
          ...(mayContainAllergenItemIndexes[allergen] ?? []),
          index,
        ];
      }
    }
  });

  return {
    directAllergenItemCounts,
    directAllergenItemIndexes,
    ...(ingredientIntelligenceItemIndexes.length > 0
      ? { inferredAllergenItemIndexes, ingredientIntelligenceItemIndexes }
      : {}),
    ingredientIntelligenceSafeAllergenItemIndexes,
    linkedAllergenItemIndexes,
    mayContainAllergenItemCounts,
    mayContainAllergenItemIndexes,
    officialItemCount:
      getRestaurantAllergenSourceCounts(restaurant).officialItemCount,
    totalItemCount,
    unavailableCount: unavailableItemIndexes.length,
    unavailableAllergenItemIndexes,
    unavailableItemIndexes,
  };
}

function getRestaurantItemCount(restaurant: Restaurant) {
  if (restaurant.items.length > 0) {
    return restaurant.items.length;
  }

  return Math.max(0, restaurant.totalItemCount ?? 0);
}

const allergyIndexSeed = {
  shellfish: true,
  milk: true,
  peanut: true,
  "tree-nut": true,
  egg: true,
  fish: true,
  wheat: true,
  soy: true,
  sesame: true,
  gluten: true,
  mustard: true,
  sulfites: true,
};

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
