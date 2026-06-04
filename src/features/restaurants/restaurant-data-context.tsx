import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { downloadData } from "aws-amplify/storage";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  restaurantDataCacheVersion,
  restaurants as bundledRestaurants,
  type Restaurant,
} from "@/data/restaurants";
import { isAmplifyConfigured } from "@/lib/amplify";

const legacyCacheKey = "restaurant-data/latest";
const cacheKey = `restaurant-data/latest/${restaurantDataCacheVersion}`;
const cacheKeyPrefix = "restaurant-data/latest/";
const remoteSnapshotPath = "restaurant-data/latest.json";
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

async function fetchRestaurantRepository(): Promise<RestaurantRepository> {
  await removeStaleRestaurantCaches();
  const cached = await readCachedRepository();

  if (!isAmplifyConfigured) {
    return cached ?? bundledRepository();
  }

  try {
    const remote = await downloadRemoteRepository();

    if (remote) {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(remote));
      return remote;
    }
  } catch (error) {
    console.warn("Unable to refresh restaurant data", error);
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

async function downloadRemoteRepository() {
  const result = await downloadData({ path: remoteSnapshotPath }).result;
  const text = await result.body.text();

  return parseRestaurantRepository(text, "remote");
}

function parseRestaurantRepository(
  value: string,
  source: RestaurantDataContextValue["source"],
) {
  try {
    const parsed = JSON.parse(value) as {
      restaurants?: Restaurant[];
      snapshotVersion?: number;
    };

    if (
      parsed.snapshotVersion !== supportedSnapshotVersion ||
      !Array.isArray(parsed.restaurants) ||
      !parsed.restaurants.every(isValidRestaurant)
    ) {
      return null;
    }

    return {
      restaurants: parsed.restaurants.filter(
        (restaurant) =>
          !restaurant.coverageStatus ||
          restaurant.coverageStatus === "complete" ||
          restaurant.coverageStatus === "kept-previous",
      ),
      snapshotVersion: parsed.snapshotVersion,
      source,
    };
  } catch {
    return null;
  }
}

function bundledRepository(): RestaurantRepository {
  return {
    restaurants: bundledRestaurants,
    snapshotVersion: supportedSnapshotVersion,
    source: "bundled",
  };
}

function isValidRestaurant(restaurant: Restaurant) {
  return (
    typeof restaurant.id === "string" &&
    typeof restaurant.name === "string" &&
    typeof restaurant.rank === "number" &&
    Array.isArray(restaurant.items) &&
    restaurant.items.every((item) => typeof item.name === "string" && Array.isArray(item.allergens))
  );
}
