import { useQuery } from "@tanstack/react-query";
import { downloadData } from "aws-amplify/storage";
import { ungzip } from "pako";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import type { Restaurant } from "@/data/restaurants";
import { isAmplifyConfigured } from "@/lib/amplify";

const supportedSnapshotVersion = 1;
const restaurantDataQueryKey = ["restaurant-data", "remote-only-v2"] as const;
const emptyRestaurants: Restaurant[] = [];

type RestaurantRepository = {
  generatedAt: string | null;
  restaurants: Restaurant[];
  snapshotVersion: number;
};

type RestaurantDataContextValue = {
  error: Error | null;
  generatedAt: string | null;
  getRestaurantById: (id: string) => Restaurant | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  restaurants: Restaurant[];
  source: "remote" | null;
};

const RestaurantDataContext = createContext<RestaurantDataContextValue>({
  error: null,
  generatedAt: null,
  getRestaurantById: () => undefined,
  isLoading: true,
  isRefreshing: false,
  refresh: async () => undefined,
  restaurants: [],
  source: null,
});

export function RestaurantDataProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    gcTime: 1000 * 60 * 60 * 24 * 7,
    queryFn: fetchRemoteRestaurantRepository,
    queryKey: restaurantDataQueryKey,
    retry: 2,
    staleTime: 1000 * 60 * 15,
  });

  const restaurants = query.data?.restaurants ?? emptyRestaurants;
  const restaurantsById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])),
    [restaurants],
  );
  const getRestaurantById = useCallback(
    (id: string) => restaurantsById.get(id),
    [restaurantsById],
  );
  const refetch = query.refetch;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const value = useMemo(
    () => ({
      error: query.error,
      generatedAt: query.data?.generatedAt ?? null,
      getRestaurantById,
      isLoading: query.isPending,
      isRefreshing: query.isFetching,
      refresh,
      restaurants,
      source: query.data ? ("remote" as const) : null,
    }),
    [getRestaurantById, query.data, query.error, query.isFetching, query.isPending, refresh, restaurants],
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
  const summaryRestaurant = restaurantId ? context.getRestaurantById(restaurantId) : undefined;
  const remoteDetailEnabled = Boolean(restaurantId && normalizedPath && isAmplifyConfigured);
  const query = useQuery<Restaurant | undefined>({
    enabled: remoteDetailEnabled,
    gcTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!normalizedPath) {
        return summaryRestaurant;
      }

      const result = await downloadData({ path: normalizedPath }).result;
      const parsed = parseRestaurantDetail(await readDownloadBody(result.body));

      if (!parsed) {
        throw new Error(`Invalid remote restaurant detail: ${normalizedPath}`);
      }

      return parsed;
    },
    queryKey: [
      "restaurant-detail-v2",
      restaurantId,
      normalizedPath,
      context.generatedAt,
    ],
    retry: 2,
    staleTime: 1000 * 60 * 30,
  });
  const restaurant = remoteDetailEnabled ? query.data : summaryRestaurant;

  return {
    isLoading: remoteDetailEnabled && query.isPending,
    isRefreshing: query.isFetching,
    notFound: Boolean(restaurantId) && !restaurant && (query.isError || query.isSuccess),
    restaurant,
  };
}

async function fetchRemoteRestaurantRepository(): Promise<RestaurantRepository> {
  if (!isAmplifyConfigured) {
    throw new Error("Remote restaurant storage is not configured.");
  }

  let repository: RestaurantRepository | null;

  try {
    const result = await downloadData({ path: "restaurant-data/latest.json" }).result;
    repository = parseRestaurantRepository(await readDownloadBody(result.body));
  } catch (error) {
    console.error("Remote restaurant catalog download failed", error);
    throw error;
  }

  if (!repository) {
    throw new Error("The remote restaurant catalog is invalid or unsupported.");
  }

  return repository;
}

async function readDownloadBody(body: { blob: () => Promise<Blob> }): Promise<string> {
  const bytes = new Uint8Array(await readBlobAsArrayBuffer(await body.blob()));

  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return ungzip(bytes, { toText: true });
  }

  return new TextDecoder().decode(bytes);
}

function readBlobAsArrayBuffer(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read catalog response."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Catalog response was not binary data."));
      }
    };
    reader.readAsArrayBuffer(blob);
  });
}

function parseRestaurantRepository(value: string): RestaurantRepository | null {
  try {
    const parsed = JSON.parse(value) as {
      generatedAt?: string;
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
      generatedAt: parsed.generatedAt ?? null,
      restaurants: parsed.restaurants
        .filter(
          (restaurant) =>
            !restaurant.coverageStatus ||
            restaurant.coverageStatus === "complete" ||
            restaurant.coverageStatus === "kept-previous",
        )
        .map((restaurant) => ({
          ...restaurant,
          items: Array.isArray(restaurant.items) ? restaurant.items : [],
        })),
      snapshotVersion: parsed.snapshotVersion,
    };
  } catch {
    return null;
  }
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

function isValidRestaurant(restaurant: unknown): restaurant is Restaurant {
  if (!restaurant || typeof restaurant !== "object") {
    return false;
  }

  const record = restaurant as Partial<Restaurant>;

  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.rank === "number" &&
    (!record.items ||
      (Array.isArray(record.items) &&
        record.items.every(
          (item) => typeof item.name === "string" && Array.isArray(item.allergens),
        )))
  );
}
