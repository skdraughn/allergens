import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { downloadData } from "aws-amplify/storage";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  restaurantDataGeneratedAt,
  restaurantDataCacheVersion,
  restaurants as bundledRestaurants,
  type Restaurant,
} from "@/data/restaurants";
import { isAmplifyConfigured } from "@/lib/amplify";

const legacyCacheKey = "restaurant-data/latest";
const cacheKey = `restaurant-data/latest/${restaurantDataCacheVersion}`;
const cacheKeyPrefix = "restaurant-data/latest/";
const supportedSnapshotVersion = 1;
const restaurantDataQueryKey = ["restaurant-data", restaurantDataCacheVersion] as const;

type RestaurantRepository = {
  restaurants: Restaurant[];
  snapshotVersion: number;
  source: RestaurantDataContextValue["source"];
};

type RestaurantDataContextValue = {
  getRestaurantById: (id: string) => Restaurant | undefined;
  isRefreshing: boolean;
  restaurants: Restaurant[];
  source: "bundled" | "cache" | "remote";
};

const RestaurantDataContext = createContext<RestaurantDataContextValue>({
  getRestaurantById: (id) => bundledRestaurants.find((restaurant) => restaurant.id === id),
  isRefreshing: false,
  restaurants: bundledRestaurants,
  source: "bundled",
});

export function RestaurantDataProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    gcTime: 1000 * 60 * 60 * 24 * 7,
    initialData: bundledRepository(),
    queryFn: fetchRestaurantRepository,
    queryKey: restaurantDataQueryKey,
    retry: 1,
    staleTime: 1000 * 60 * 60 * 6,
  });

  const restaurants = query.data.restaurants;
  const source = query.data.source;

  const value = useMemo(
    () => ({
      getRestaurantById: (id: string) => restaurants.find((restaurant) => restaurant.id === id),
      isRefreshing: query.isFetching,
      restaurants,
      source,
    }),
    [query.isFetching, restaurants, source],
  );

  return (
    <RestaurantDataContext.Provider value={value}>{children}</RestaurantDataContext.Provider>
  );
}

export function useRestaurantData() {
  return useContext(RestaurantDataContext);
}

export function useRestaurantDetail(restaurantId: string | undefined, snapshotPath?: string) {
  const context = useRestaurantData();
  const normalizedPath = snapshotPath?.trim() || null;
  const fallbackRestaurant =
    restaurantId && (!isAmplifyConfigured || !normalizedPath)
      ? context.getRestaurantById(restaurantId)
      : undefined;
  const remoteDetailEnabled = Boolean(restaurantId && normalizedPath && isAmplifyConfigured);
  const query = useQuery<Restaurant | undefined>({
    enabled: remoteDetailEnabled,
    gcTime: 1000 * 60 * 60 * 24,
    initialData: fallbackRestaurant,
    queryFn: async () => {
      if (!normalizedPath) {
        return fallbackRestaurant;
      }

      const result = await downloadData({ path: normalizedPath }).result;
      const text = await result.body.text();
      const parsed = parseRestaurantDetail(text);

      return parsed ? mergeBundledRestaurantMetadata(parsed, fallbackRestaurant) : fallbackRestaurant;
    },
    queryKey: ["restaurant-detail", restaurantId, normalizedPath, restaurantDataCacheVersion],
    retry: 1,
    staleTime: 1000 * 60 * 60 * 6,
  });
  const restaurant = query.data ?? fallbackRestaurant;

  return {
    isLoading: !restaurant && remoteDetailEnabled && query.isPending,
    isRefreshing: query.isFetching,
    notFound:
      Boolean(restaurantId) &&
      !restaurant &&
      (!remoteDetailEnabled || query.isError || query.isSuccess),
    restaurant,
  };
}

async function fetchRestaurantRepository(): Promise<RestaurantRepository> {
  await removeStaleRestaurantCaches();
  const cached = await readCachedRepository();

  if (!isAmplifyConfigured) {
    return cached ?? bundledRepository();
  }

  return cached ?? bundledRepository();
}

async function removeStaleRestaurantCaches() {
  const keys = await AsyncStorage.getAllKeys();
  const staleKeys = keys.filter(
    (key) => key === legacyCacheKey || (key.startsWith(cacheKeyPrefix) && key !== cacheKey),
  );

  if (staleKeys.length > 0) {
    await AsyncStorage.multiRemove(staleKeys);
  }
}

async function readCachedRepository() {
  const value = await AsyncStorage.getItem(cacheKey);

  if (!value) {
    return null;
  }

  return parseRestaurantRepository(value, "cache");
}

function parseRestaurantRepository(
  value: string,
  source: RestaurantDataContextValue["source"],
) {
  try {
    const parsed = JSON.parse(value) as {
      generatedAt?: string;
      restaurants?: Restaurant[];
      snapshotVersion?: number;
    };

    if (
      parsed.snapshotVersion !== supportedSnapshotVersion ||
      !Array.isArray(parsed.restaurants) ||
      !parsed.restaurants.every(isValidRestaurant) ||
      isOlderThanBundledRepository(parsed.generatedAt)
    ) {
      return null;
    }

    const bundledById = new Map(
      bundledRestaurants.map((restaurant) => [restaurant.id, restaurant]),
    );
    const restaurants = parsed.restaurants.filter(
        (restaurant) =>
          !restaurant.coverageStatus ||
          restaurant.coverageStatus === "complete" ||
          restaurant.coverageStatus === "kept-previous",
      ).map((restaurant) => mergeBundledRestaurantMetadata(restaurant, bundledById.get(restaurant.id)));
    const remoteIds = new Set(restaurants.map((restaurant) => restaurant.id));
    const bundledLocalRestaurants = bundledRestaurants.filter(
      (restaurant) =>
        restaurant.type === "local" &&
        !remoteIds.has(restaurant.id) &&
        (!restaurant.coverageStatus ||
          restaurant.coverageStatus === "complete" ||
          restaurant.coverageStatus === "kept-previous"),
    );

    return {
      restaurants: [...restaurants, ...bundledLocalRestaurants],
      snapshotVersion: parsed.snapshotVersion,
      source,
    };
  } catch {
    return null;
  }
}

function isOlderThanBundledRepository(generatedAt?: string) {
  if (!generatedAt) {
    return false;
  }

  const remoteGeneratedAtMs = Date.parse(generatedAt);
  const bundledGeneratedAtMs = Date.parse(restaurantDataGeneratedAt);

  return (
    Number.isFinite(remoteGeneratedAtMs) &&
    Number.isFinite(bundledGeneratedAtMs) &&
    remoteGeneratedAtMs < bundledGeneratedAtMs
  );
}

function parseRestaurantDetail(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (isValidRestaurant(parsed)) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "restaurant" in parsed &&
      isValidRestaurant((parsed as { restaurant?: unknown }).restaurant)
    ) {
      return (parsed as { restaurant: Restaurant }).restaurant;
    }

    return null;
  } catch {
    return null;
  }
}

function mergeBundledRestaurantMetadata(
  restaurant: Restaurant,
  bundledRestaurant?: Restaurant,
) {
  if (!bundledRestaurant?.allergyAccommodationPolicy || restaurant.allergyAccommodationPolicy) {
    return restaurant;
  }

  return {
    ...restaurant,
    allergyAccommodationPolicy: bundledRestaurant.allergyAccommodationPolicy,
  };
}

function bundledRepository(): RestaurantRepository {
  return {
    restaurants: bundledRestaurants,
    snapshotVersion: supportedSnapshotVersion,
    source: "bundled",
  };
}

function isValidRestaurant(restaurant: unknown): restaurant is Restaurant {
  if (!restaurant || typeof restaurant !== "object") {
    return false;
  }

  const record = restaurant as Partial<Restaurant>;

  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.rank === "number" &&
    Array.isArray(record.items) &&
    record.items.every((item) => typeof item.name === "string" && Array.isArray(item.allergens))
  );
}
