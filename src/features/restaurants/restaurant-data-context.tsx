import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAuthSession } from "aws-amplify/auth";
import { downloadData } from "aws-amplify/storage";
import { ungzip } from "pako";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Restaurant } from "@/data/restaurants";
import { isAmplifyConfigured } from "@/lib/amplify";
import {
  getAuthoritativeCatalogPath,
  getCachedActiveCatalogPath,
  getRetiredRestaurantIds,
  isVersionedCatalogObjectPath,
  markCatalogActive,
  readImmutableCatalogFile,
  subscribeToAuthoritativeCatalogPath,
  writeImmutableCatalogFile,
} from "@/lib/catalog/restaurant-catalog-cache";
import { bucketCount, safeErrorCode } from "@/lib/telemetry/schema";
import { telemetry } from "@/lib/telemetry/telemetry";

const supportedSnapshotVersion = 1;
const emptyRestaurants: Restaurant[] = [];
let sessionRefreshPromise: Promise<void> | null = null;

type RestaurantRepository = {
  generatedAt: string | null;
  restaurants: Restaurant[];
  snapshotVersion: number;
};

type RestaurantDataContextValue = {
  catalogPath: string | null;
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
  catalogPath: null,
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
  const queryClient = useQueryClient();
  const [catalogPath, setCatalogPath] = useState<string | null>(null);
  const [pathResolutionError, setPathResolutionError] = useState<Error | null>(null);
  const mounted = useRef(true);
  const query = useQuery<RestaurantRepository>({
    enabled: Boolean(catalogPath),
    gcTime: Infinity,
    queryFn: () => fetchRemoteRestaurantRepository(catalogPath!),
    queryKey: ["restaurant-data", "versioned-v1", catalogPath],
    retry: 2,
    staleTime: Infinity,
  });

  const promoteCatalogPath = useCallback(
    async (nextPath: string) => {
      if (nextPath === catalogPath) return;
      await queryClient.fetchQuery({
        gcTime: Infinity,
        queryFn: () => fetchRemoteRestaurantRepository(nextPath),
        queryKey: ["restaurant-data", "versioned-v1", nextPath],
        staleTime: Infinity,
      });
      await markCatalogActive(nextPath);
      if (mounted.current) setCatalogPath(nextPath);
    },
    [catalogPath, queryClient],
  );

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let unsubscribe: () => void = () => undefined;

    void (async () => {
      try {
        const cachedPath = await getCachedActiveCatalogPath();
        if (cachedPath && mounted.current) setCatalogPath(cachedPath);

        const authoritativePath = await getAuthoritativeCatalogPath();
        if (cancelled) return;
        await promoteCatalogPath(authoritativePath);
        if (cancelled) return;
        unsubscribe = await subscribeToAuthoritativeCatalogPath((nextPath) => {
          void promoteCatalogPath(nextPath).catch(() => undefined);
        });
        if (cancelled) unsubscribe();
      } catch (error) {
        if (mounted.current && !catalogPath) {
          setPathResolutionError(
            error instanceof Error ? error : new Error("Could not resolve restaurant catalog."),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
      unsubscribe();
    };
  }, [catalogPath, promoteCatalogPath]);

  const restaurants = query.data?.restaurants ?? emptyRestaurants;
  const restaurantsById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])),
    [restaurants],
  );
  const getRestaurantById = useCallback(
    (id: string) => restaurantsById.get(id),
    [restaurantsById],
  );
  const refresh = useCallback(async () => {
    const authoritativePath = await getAuthoritativeCatalogPath();
    await promoteCatalogPath(authoritativePath);
  }, [promoteCatalogPath]);
  const value = useMemo(
    () => ({
      catalogPath,
      error: query.error ?? pathResolutionError,
      generatedAt: query.data?.generatedAt ?? null,
      getRestaurantById,
      isLoading: !catalogPath || query.isPending,
      isRefreshing: query.isFetching,
      refresh,
      restaurants,
      source: query.data ? ("remote" as const) : null,
    }),
    [catalogPath, getRestaurantById, pathResolutionError, query.data, query.error, query.isFetching, query.isPending, refresh, restaurants],
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
    gcTime: Infinity,
    queryFn: async () => {
      const trace = telemetry.startTrace("restaurant_detail_load");
      if (!normalizedPath) {
        trace.stop({ outcome: "success" });
        return summaryRestaurant;
      }

      try {
        const parsed = await readParsedImmutableRemoteObject(
          normalizedPath,
          parseRestaurantDetail,
        );

        if (!parsed) {
          throw new Error("Invalid remote restaurant detail");
        }
        trace.stop({
          attributes: { item_count_bucket: bucketCount(parsed.items.length) },
          outcome: "success",
        });
        return parsed;
      } catch (error) {
        trace.stop({ outcome: "failure" });
        telemetry.recordError(error, "restaurant_detail_load", {
          errorCode: safeErrorCode(error),
        });
        throw error;
      }
    },
    queryKey: [
      "restaurant-detail-v2",
      restaurantId,
      normalizedPath,
      context.catalogPath,
    ],
    retry: 2,
    staleTime: Infinity,
  });
  const restaurant = remoteDetailEnabled ? query.data : summaryRestaurant;

  return {
    error: remoteDetailEnabled ? query.error : context.error,
    isLoading: remoteDetailEnabled && query.isPending,
    isRefreshing: query.isFetching,
    notFound: Boolean(restaurantId) && !restaurant && (query.isError || query.isSuccess),
    restaurant,
  };
}

async function fetchRemoteRestaurantRepository(path: string): Promise<RestaurantRepository> {
  if (!isAmplifyConfigured) {
    throw new Error("Remote restaurant storage is not configured.");
  }

  let repository: RestaurantRepository | null;
  const trace = telemetry.startTrace("catalog_initialization");

  try {
    repository = await readParsedImmutableRemoteObject(path, parseRestaurantRepository);
  } catch (error) {
    trace.stop({ outcome: "failure" });
    telemetry.recordError(error, "catalog_initialization", {
      errorCode: safeErrorCode(error),
    });
    throw error;
  }

  if (!repository) {
    trace.stop({ outcome: "failure" });
    throw new Error("The remote restaurant catalog is invalid or unsupported.");
  }

  trace.stop({
    metrics: { restaurant_count: repository.restaurants.length },
    outcome: "success",
  });

  return repository;
}

async function readParsedImmutableRemoteObject<T>(
  path: string,
  parse: (contents: string) => T | null,
): Promise<T | null> {
  if (!isVersionedCatalogObjectPath(path)) {
    throw new Error("Refusing to load a mutable restaurant catalog object.");
  }

  const cached = await readImmutableCatalogFile(path);
  if (cached !== null) {
    const parsed = parse(cached);
    if (parsed) return parsed;
  }

  const result = await downloadRemoteObjectWithSessionRecovery(path);
  const contents = await readDownloadBody(result.body);
  const parsed = parse(contents);
  if (!parsed) return null;
  await writeImmutableCatalogFile(path, contents);
  return parsed;
}

async function downloadRemoteObjectWithSessionRecovery(path: string) {
  try {
    return await downloadData({ path }).result;
  } catch (error) {
    if (!isInvalidLoginTokenError(error)) throw error;

    await refreshAmplifySession();
    return downloadData({ path }).result;
  }
}

async function refreshAmplifySession() {
  if (!sessionRefreshPromise) {
    sessionRefreshPromise = fetchAuthSession({ forceRefresh: true })
      .then(() => undefined)
      .finally(() => {
        sessionRefreshPromise = null;
      });
  }

  return sessionRefreshPromise;
}

function isInvalidLoginTokenError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { message?: unknown; name?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    name === "NotAuthorizedException" &&
    /invalid login token|couldn(?:'|’)t verify signed token/i.test(message)
  );
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

    const retiredRestaurantIds = getRetiredRestaurantIds();
    return {
      generatedAt: parsed.generatedAt ?? null,
      restaurants: parsed.restaurants
        .filter(
          (restaurant) =>
            !retiredRestaurantIds.has(restaurant.id) &&
            (!restaurant.coverageStatus ||
              restaurant.coverageStatus === "complete" ||
              restaurant.coverageStatus === "kept-previous"),
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
