import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Search,
  Sparkles,
  UserRound,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  Extrapolation,
  FadeIn,
  FadeInUp,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton, IconButtonSurface } from "@/components/icon-button";
import { RestaurantLogo } from "@/components/restaurant-logo";
import {
  FloatingRestaurantRequestButton,
  RestaurantRequestButton,
} from "@/components/restaurant-request-button";
import { ScreenBackground } from "@/components/screen-background";
import { SereneLoader } from "@/components/serene-loader";
import { colors, radius, spacing } from "@/constants/theme";
import { getRestaurantBrand, getRestaurantBrandBackground } from "@/data/brand-assets";
import type { Restaurant } from "@/data/restaurants";
import {
  CommunityContributionModal,
  type ContributionMode,
} from "@/features/community/community-contribution-modal";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { AllergyProfileManagerModal } from "@/features/profile/allergy-profile-manager-modal";
import {
  fallbackRestaurantSearch,
  getRestaurantSearchLocation,
  getSearchResultSummary,
  searchRestaurantPage,
  type RestaurantSearchPage,
  type RestaurantSearchResult,
  type RestaurantSearchSummary,
} from "@/features/restaurants/restaurant-search-service";
import { useRestaurantData } from "@/features/restaurants/restaurant-data-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { bucketCount, bucketPosition, safeErrorCode } from "@/lib/telemetry/schema";
import { telemetry, type TelemetryTrace } from "@/lib/telemetry/telemetry";

const restaurantResultPageSize = 50;
type ReviewedRestaurant = {
  restaurant: RestaurantSearchResult;
  sourceRestaurant?: Restaurant;
  summary: RestaurantSearchSummary;
};
export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    isSyncing: isProfileSyncing,
    profiles,
    selectedAllergyIds,
    selectedProfileIds,
  } = useAllergyProfile();
  const { catalogPath, restaurants } = useRestaurantData();
  const scrollY = useSharedValue(0);
  const stickySearchInteractive = useSharedValue(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const [contributionMode, setContributionMode] = useState<ContributionMode | null>(null);
  const [profileManagerVisible, setProfileManagerVisible] = useState(false);
  const [stickySearchVisible, setStickySearchVisible] = useState(false);
  const navigationPendingRef = useRef(false);
  const searchTraceRef = useRef<TelemetryTrace<"restaurant_search"> | null>(null);
  const lastStartedSearchRef = useRef("");
  const lastReportedSearchRef = useRef("");
  const locationQuery = useQuery({
    gcTime: 1000 * 60 * 30,
    queryFn: getRestaurantSearchLocation,
    queryKey: ["restaurant-search-location"],
    retry: false,
    staleTime: 1000 * 60 * 10,
  });
  const normalizedImmediateQuery = normalizeSearchText(query);
  const normalizedRemoteQuery = normalizeSearchText(debouncedQuery);
  const restaurantDataSignature = useMemo(
    () =>
      `${restaurants.length}:${restaurants.reduce(
        (count, restaurant) => count + restaurant.items.length,
        0,
      )}`,
    [restaurants],
  );

  const immediateLocalResults = useMemo(
    () =>
      fallbackRestaurantSearch(
        restaurants,
        normalizedImmediateQuery,
        restaurantResultPageSize,
      ),
    [normalizedImmediateQuery, restaurants],
  );
  const debouncedLocalResults = useMemo(
    () =>
      fallbackRestaurantSearch(
        restaurants,
        normalizedRemoteQuery,
        restaurantResultPageSize,
      ),
    [normalizedRemoteQuery, restaurants],
  );
  const searchQuery = useInfiniteQuery<RestaurantSearchPage>({
    gcTime: 1000 * 60 * 30,
    getNextPageParam: (lastPage) => lastPage.nextToken || undefined,
    initialPageParam: null as string | null,
    placeholderData:
      restaurants.length > 0
        ? {
            pageParams: [null],
            pages: [
              {
                nextToken: null,
                results: debouncedLocalResults,
              },
            ],
          }
        : undefined,
    queryFn: ({ pageParam, signal }) =>
      searchRestaurantPage({
        fallbackRestaurants: restaurants,
        limit: restaurantResultPageSize,
        location: locationQuery.data,
        nextToken: typeof pageParam === "string" ? pageParam : null,
        query: debouncedQuery,
        signal,
      }),
    queryKey: [
      "restaurant-search",
      normalizedRemoteQuery,
      catalogPath,
      restaurantDataSignature,
      locationQuery.data?.lat ?? null,
      locationQuery.data?.lng ?? null,
    ],
    staleTime: 1000 * 60 * 5,
  });
  const affirmedSearchResults = useMemo(
    () => searchQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [searchQuery.data],
  );
  const isWaitingForDebounce = normalizedImmediateQuery !== normalizedRemoteQuery;
  const searchResults = isWaitingForDebounce
    ? immediateLocalResults
    : affirmedSearchResults;
  const isAwaitingAffirmation =
    normalizedImmediateQuery.length > 0 &&
    (isWaitingForDebounce || searchQuery.isFetching);
  const compatibilityIsProvisional =
    isProfileSyncing ||
    isWaitingForDebounce ||
    searchQuery.isPlaceholderData ||
    searchQuery.isPending ||
    (searchQuery.isFetching && !searchQuery.isFetchingNextPage);
  const canLoadMoreRestaurants =
    !isWaitingForDebounce &&
    searchQuery.hasNextPage &&
    !searchQuery.isFetchingNextPage;

  useEffect(() => {
    if (!normalizedRemoteQuery || lastStartedSearchRef.current === normalizedRemoteQuery) return;
    lastStartedSearchRef.current = normalizedRemoteQuery;
    lastReportedSearchRef.current = "";
    searchTraceRef.current?.stop({ outcome: "cancelled" });
    searchTraceRef.current = telemetry.startTrace("restaurant_search");
    telemetry.track("restaurant_search_started", { entry_point: "home" });
  }, [normalizedRemoteQuery]);

  useEffect(() => {
    if (
      !normalizedRemoteQuery ||
      searchQuery.isFetching ||
      lastReportedSearchRef.current === normalizedRemoteQuery
    ) {
      return;
    }
    lastReportedSearchRef.current = normalizedRemoteQuery;
    const outcome = searchQuery.isError
      ? "failure"
      : affirmedSearchResults.length > 0
        ? "success"
        : "empty";
    searchTraceRef.current?.stop({
      attributes: {
        result_count_bucket: bucketCount(affirmedSearchResults.length),
      },
      outcome: outcome === "failure" ? "failure" : "success",
    });
    searchTraceRef.current = null;
    telemetry.track("restaurant_search_results", {
      outcome,
      result_count_bucket: bucketCount(affirmedSearchResults.length),
      source_type: "remote_with_local_fallback",
    });
    if (searchQuery.error) {
      telemetry.recordError(searchQuery.error, "restaurant_search", {
        errorCode: safeErrorCode(searchQuery.error),
      });
    }
  }, [affirmedSearchResults.length, normalizedRemoteQuery, searchQuery.error, searchQuery.isError, searchQuery.isFetching]);
  const selectedProfiles = profiles.filter((profile) =>
    selectedProfileIds.includes(profile.id),
  );
  const selectedProfileLabel = selectedProfiles.map((profile) => profile.name).join(" + ");
  const selectedProfileInitial =
    selectedProfiles[0]?.name.trim().charAt(0).toUpperCase() || "M";

  const loadMoreRestaurants = useCallback(
    () => {
      if (!canLoadMoreRestaurants) {
        return;
      }

      void searchQuery.fetchNextPage().then((result) => {
        telemetry.track("restaurant_search_paginated", {
          outcome: result.isError ? "failure" : "success",
        });
      });
    },
    [canLoadMoreRestaurants, searchQuery],
  );
  const maybeLoadMoreRestaurants = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const remainingScrollDistance =
        contentSize.height - layoutMeasurement.height - contentOffset.y;

      if (remainingScrollDistance < 620) {
        loadMoreRestaurants();
      }
    },
    [loadMoreRestaurants],
  );

  useFocusEffect(
    useCallback(() => {
      navigationPendingRef.current = false;
    }, []),
  );

  const reviewedRestaurants = useMemo<ReviewedRestaurant[]>(
    () => {
      const restaurantsById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));

      return searchResults.map((restaurant) => ({
        restaurant,
        sourceRestaurant: restaurantsById.get(restaurant.restaurantId),
        summary: getSearchResultSummary(restaurant, selectedAllergyIds),
      }));
    },
    [restaurants, searchResults, selectedAllergyIds],
  );
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      const nextStickySearchVisible = event.contentOffset.y >= 112;

      if (stickySearchInteractive.value !== nextStickySearchVisible) {
        stickySearchInteractive.value = nextStickySearchVisible;
        runOnJS(setStickySearchVisible)(nextStickySearchVisible);
      }
    },
  });
  const stickySearchStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [96, 148], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(scrollY.value, [96, 148], [10, 0], Extrapolation.CLAMP),
      },
    ],
  }));
  const heroSearchStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [78, 132], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [0, 148], [1, 0.96], Extrapolation.CLAMP) },
    ],
  }));
  const headerProfileScrollStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(scrollY.value, [72, 132], [0, 56], Extrapolation.CLAMP),
      },
    ],
  }));
  const accountButtonScrollStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [72, 118], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [72, 118], [1, 0.86], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={styles.nav}>
          <Animated.View style={[styles.headerProfileSlot, headerProfileScrollStyle]}>
            <Pressable
              accessibilityHint="Choose one or more allergy profiles"
              accessibilityLabel={`Allergy profiles, ${selectedProfileLabel || "My Profile"}`}
              accessibilityRole="button"
              onPress={() => setProfileManagerVisible(true)}
              style={({ pressed }) => [
                styles.headerProfile,
                pressed ? styles.headerProfilePressed : null,
              ]}
            >
              <IconButtonSurface />
              <View style={styles.headerProfileInitialCircle}>
                <Text style={styles.headerProfileInitial}>{selectedProfileInitial}</Text>
              </View>
            </Pressable>
          </Animated.View>
          <Animated.View
            pointerEvents={stickySearchVisible ? "none" : "auto"}
            style={accountButtonScrollStyle}
          >
            <IconButton
              glassActive={!stickySearchVisible}
              Icon={UserRound}
              label="Account"
              onPress={() => router.push("/account")}
            />
          </Animated.View>
          <Animated.View
            pointerEvents={stickySearchVisible ? "auto" : "none"}
            style={[styles.stickySearchWrap, stickySearchStyle]}
          >
            <IconButtonSurface
              active={stickySearchVisible}
              interactive={false}
            />
            <Search color={colors.muted} size={17} strokeWidth={2.4} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search restaurants"
              placeholderTextColor="#8E8E93"
              style={styles.stickySearchInput}
              value={query}
            />
          </Animated.View>
        </Animated.View>

        <Animated.FlatList
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + 94, 112) },
          ]}
          data={reviewedRestaurants}
          keyExtractor={({ restaurant }) =>
            getRestaurantResultKey(restaurant)
          }
          ListEmptyComponent={
            isAwaitingAffirmation ? null : (
              <View style={styles.emptySearch}>
                <Text style={styles.emptySearchTitle}>No restaurant matches</Text>
                <Text style={styles.emptySearchCopy}>
                  Request it and share any address or menu details you already have.
                </Text>
                <RestaurantRequestButton
                  label="Request this restaurant"
                  onPress={() => {
                    telemetry.track("restaurant_request_started", { entry_point: "search_empty" });
                    setContributionMode("restaurant-request");
                  }}
                />
              </View>
            )
          }
          ListFooterComponent={
            searchQuery.isFetchingNextPage ? (
              <View style={styles.loadingMoreRestaurants}>
                <SereneLoader size="small" />
              </View>
            ) : null
          }
          ListHeaderComponent={
            <>
              <Animated.View
                entering={FadeInUp.duration(720).easing(
                  ReanimatedEasing.bezier(0.16, 1, 0.3, 1),
                )}
                style={styles.copyBlock}
              >
                <Text style={styles.title}>Restaurants</Text>
              </Animated.View>

              <Animated.View
                style={[styles.searchGroup, heroSearchStyle]}
              >
                <IconButtonSurface
                  active={!stickySearchVisible}
                  interactive={false}
                />
                <Search color={colors.muted} size={20} strokeWidth={2.4} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setQuery}
                  placeholder="Search restaurants"
                  placeholderTextColor="#8E8E93"
                  style={styles.searchInput}
                  value={query}
                />
              </Animated.View>
            </>
          }
          onScroll={handleScroll}
          onMomentumScrollEnd={maybeLoadMoreRestaurants}
          onScrollEndDrag={maybeLoadMoreRestaurants}
          onEndReached={loadMoreRestaurants}
          onEndReachedThreshold={1.25}
          renderItem={({ index, item }) => (
            <RestaurantRow
              compatibilityIsProvisional={compatibilityIsProvisional}
              onPress={() => {
                if (navigationPendingRef.current) {
                  return;
                }

                navigationPendingRef.current = true;
                telemetry.track("restaurant_opened", {
                  entry_point: normalizedImmediateQuery ? "search_results" : "restaurant_list",
                  restaurant_id: item.restaurant.restaurantId,
                  result_position_bucket: bucketPosition(index),
                });
                router.push({
                  params: {
                    id: item.restaurant.restaurantId,
                    locationId: item.restaurant.locationId ?? "national",
                    snapshotPath: item.restaurant.snapshotPath ?? "",
                  },
                  pathname: "/restaurant/[id]",
                });
              }}
              restaurant={item.restaurant}
              sourceRestaurant={item.sourceRestaurant}
              summary={item.summary}
            />
          )}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        />

        <FloatingRestaurantRequestButton
          onPress={() => {
            telemetry.track("restaurant_request_started", { entry_point: "home_floating_button" });
            setContributionMode("restaurant-request");
          }}
        />

        <CommunityContributionModal
          initialRestaurantName={query}
          mode={contributionMode}
          onClose={() => setContributionMode(null)}
          onSignInRequired={() => router.push("/account")}
        />
        <AllergyProfileManagerModal
          onClose={() => setProfileManagerVisible(false)}
          visible={profileManagerVisible}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getRestaurantResultKey(restaurant: RestaurantSearchResult) {
  return `${restaurant.restaurantId}:${restaurant.locationId ?? "national"}`;
}

function RestaurantRow({
  compatibilityIsProvisional,
  onPress,
  restaurant,
  sourceRestaurant,
  summary,
}: {
  compatibilityIsProvisional: boolean;
  onPress: () => void;
  restaurant: RestaurantSearchResult;
  sourceRestaurant?: Restaurant;
  summary: RestaurantSearchSummary;
}) {
  const brand = getRestaurantBrand(restaurant.restaurantId, {
    domain: restaurant.domain ?? undefined,
    logoAspectRatio: restaurant.logoAspectRatio ?? undefined,
    logoMonogram: restaurant.logoMonogram ?? undefined,
    logoSvgUrl: restaurant.logoSvgUrl ?? undefined,
    logoUrl: restaurant.logoUrl ?? undefined,
    name: restaurant.name,
  });
  const officialCompatibleCount = summary.okCount;
  const ingredientIntelligenceCompatibleCount = summary.ingredientIntelligenceOkCount;
  const compatibleCount = officialCompatibleCount + ingredientIntelligenceCompatibleCount;
  const compatibleTotal = summary.totalCount;
  const compatibilityPresentation = getCompatibilityPresentation(
    compatibleCount,
    summary,
  );
  const locationLabel = getRestaurantLocationLabel(restaurant);
  const itemCount = restaurant.totalItemCount ?? summary.totalCount;
  const policy = sourceRestaurant?.allergyAccommodationPolicy;
  const policyOnly = Boolean(policy && itemCount === 0);
  const categoryLabel = /^restaurants?$/i.test(restaurant.category?.trim() ?? "")
    ? null
    : restaurant.category;
  const metadataLabel = [
    locationLabel,
    categoryLabel,
    policyOnly ? null : `${itemCount} menu items`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.restaurantRow,
        pressed ? styles.restaurantRowPressed : null,
      ]}
    >
      <View style={[styles.logoWrap, { backgroundColor: getRestaurantBrandBackground(brand) }]}>
        <RestaurantLogo brand={brand} borderRadius={11} size={34} />
      </View>
      <View style={styles.restaurantText}>
        <Text style={styles.restaurantName}>{restaurant.name}</Text>
        {metadataLabel ? (
          <Text style={styles.restaurantMeta}>
            {metadataLabel}
          </Text>
        ) : null}
        {!policyOnly && compatibilityIsProvisional ? (
          <View style={styles.restaurantEvidenceSkeleton} />
        ) : !policyOnly ? (
          <Text
            numberOfLines={1}
            style={[
              styles.restaurantEvidence,
              compatibilityPresentation.emphasizeEvidence
                ? styles.restaurantEvidenceNeedsConfirmation
                : null,
            ]}
          >
            {compatibilityPresentation.evidenceLabel}
          </Text>
        ) : null}
      </View>
      {compatibilityIsProvisional && !policyOnly ? (
        <CompatibilitySkeleton />
      ) : policyOnly ? null : (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.compatibilityBlock}
        >
          <Text style={styles.compatibilityPercent}>
            {compatibilityPresentation.percentLabel}
          </Text>
          <View
            accessibilityLabel={compatibilityPresentation.accessibilityLabel}
            accessible
            style={styles.compatibilityCountRow}
          >
            {compatibilityPresentation.showCount ? (
              compatibilityPresentation.usesIngredientIntelligenceOnly ? (
                <>
                  <Sparkles color="#B25E00" size={12} strokeWidth={2.45} />
                  <Text numberOfLines={1} style={styles.compatibilityCount}>
                    {compatibleCount}/{compatibleTotal} possible
                  </Text>
                </>
              ) : (
                <Text numberOfLines={1} style={styles.compatibilityCount}>
                  {compatibleCount}/{compatibleTotal} options
                </Text>
              )
            ) : (
              <Text style={styles.compatibilityCount}>
                {compatibilityPresentation.countFallbackLabel}
              </Text>
            )}
          </View>
          <View style={styles.compatibilityTrack}>
            <View
              style={[
                styles.compatibilityFill,
                compatibilityPresentation.usesIngredientIntelligenceOnly &&
                  styles.compatibilityFillIntelligence,
                {
                  width: `${compatibilityPresentation.progressPercent}%`,
                },
              ]}
            />
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

function getCompatibilityPresentation(
  compatibleCount: number,
  summary: RestaurantSearchSummary,
) {
  const totalCount = summary.totalCount;
  const evidenceUnavailable =
    summary.evidenceStatus === "none" || summary.evidenceStatus === "unknown";
  const unconfigured = summary.evidenceStatus === "unconfigured";
  const showCount = totalCount > 0 && !evidenceUnavailable && !unconfigured;
  const percent = showCount
    ? Math.round((compatibleCount / totalCount) * 100)
    : null;
  const usesIngredientIntelligenceOnly =
    summary.evidenceStatus === "intelligence";
  let evidenceLabel = "Not enough allergen data";
  let emphasizeEvidence = evidenceUnavailable;

  if (totalCount <= 0) {
    evidenceLabel = "Menu unavailable";
  } else if (unconfigured) {
    evidenceLabel = "Choose allergies to see options";
    emphasizeEvidence = false;
  } else if (evidenceUnavailable) {
    evidenceLabel = "Not enough allergen data";
  } else if (summary.needsConfirmationCount > 0) {
    evidenceLabel = `${summary.needsConfirmationCount} need confirmation`;
    emphasizeEvidence = true;
  } else if (compatibleCount === 0) {
    evidenceLabel = "All items have a concern";
    emphasizeEvidence = true;
  } else if (summary.evidenceStatus === "official") {
    evidenceLabel = "Official allergen data";
  } else if (summary.evidenceStatus === "mixed") {
    evidenceLabel = "Official + ingredient analysis";
  } else if (summary.evidenceStatus === "intelligence") {
    evidenceLabel = "Ingredient analysis only";
  }

  return {
    accessibilityLabel: showCount
      ? `${percent} percent, ${compatibleCount} of ${totalCount} potential options. ${evidenceLabel}`
      : evidenceLabel,
    countFallbackLabel: unconfigured
      ? "Set profile"
      : totalCount > 0
        ? "No score"
        : "No menu",
    emphasizeEvidence,
    evidenceLabel,
    percentLabel: percent === null ? "—" : `${percent}%`,
    progressPercent: percent ?? 0,
    showCount,
    usesIngredientIntelligenceOnly,
  };
}

function CompatibilitySkeleton() {
  return (
    <Animated.View
      accessibilityLabel="Checking allergy compatibility"
      accessibilityRole="progressbar"
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(140)}
      style={styles.compatibilitySkeleton}
    >
      <View style={styles.compatibilitySkeletonPercent} />
      <View style={styles.compatibilitySkeletonCount} />
      <View style={styles.compatibilitySkeletonTrack} />
    </Animated.View>
  );
}

function getRestaurantLocationLabel(restaurant: RestaurantSearchResult) {
  if (typeof restaurant.distanceMiles === "number") {
    return `${restaurant.distanceMiles} mi away`;
  }

  const city = normalizeCityForRegion(restaurant.city, restaurant.region);

  if (city && restaurant.region) {
    return `${city}, ${restaurant.region}`;
  }

  if (city) {
    return city;
  }

  if (restaurant.displayAddress && isStreetAddress(restaurant.displayAddress)) {
    return restaurant.displayAddress;
  }

  return null;
}

function isStreetAddress(value: string) {
  return (
    /\d/.test(value) &&
    /\b(?:st(?:reet)?|ave(?:nue)?|rd|road|blvd|boulevard|dr(?:ive)?|ln|lane|ct|court|pl(?:ace)?|pkwy|parkway|hwy|highway|way|cir(?:cle)?|suite|floor)\b/i.test(value)
  );
}

function normalizeCityForRegion(city: string | null | undefined, region: string | null | undefined) {
  if (!city || !region) return city;
  const escapedRegion = region.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return city.replace(new RegExp(`,\\s*${escapedRegion}$`, "i"), "").trim();
}

const styles = StyleSheet.create({
  compatibilityBlock: {
    alignItems: "flex-end",
    minWidth: 104,
  },
  compatibilityCount: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    fontVariant: ["tabular-nums"],
  },
  compatibilityCountRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    marginTop: 1,
  },
  compatibilityFill: {
    backgroundColor: "#34C759",
    borderRadius: radius.pill,
    height: "100%",
  },
  compatibilityFillIntelligence: {
    backgroundColor: "#FFB340",
  },
  compatibilityPercent: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    lineHeight: 23,
  },
  compatibilitySkeleton: {
    alignItems: "flex-end",
    gap: 5,
    minWidth: 104,
  },
  compatibilitySkeletonCount: {
    backgroundColor: "rgba(116,119,124,0.12)",
    borderRadius: radius.pill,
    height: 10,
    width: 32,
  },
  compatibilitySkeletonPercent: {
    backgroundColor: "rgba(116,119,124,0.14)",
    borderRadius: 5,
    height: 19,
    width: 46,
  },
  compatibilitySkeletonTrack: {
    backgroundColor: "rgba(116,119,124,0.12)",
    borderRadius: radius.pill,
    height: 5,
    marginTop: 2,
    width: 66,
  },
  compatibilityTrack: {
    backgroundColor: "#E5E5EA",
    borderRadius: radius.pill,
    height: 5,
    marginTop: 7,
    overflow: "hidden",
    width: 66,
  },
  content: {
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  copyBlock: {
    marginBottom: spacing.three,
    paddingHorizontal: spacing.one,
  },
  emptySearch: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: spacing.three,
    paddingVertical: spacing.four,
  },
  emptySearchCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  emptySearchTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  headerProfile: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
    width: 48,
  },
  headerProfileInitial: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21,
  },
  headerProfileInitialCircle: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  headerProfileSlot: {
    height: 48,
    width: 48,
    zIndex: 6,
  },
  headerProfilePressed: {
    opacity: 0.68,
    transform: [{ scale: 0.98 }],
  },
  nav: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    minHeight: 64,
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
    zIndex: 4,
  },
  logoWrap: {
    alignItems: "center",
    borderRadius: 17,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  loadingMoreRestaurants: {
    alignItems: "center",
    paddingBottom: spacing.three,
    paddingTop: spacing.two,
  },
  restaurantMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  restaurantEvidence: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    marginTop: 2,
  },
  restaurantEvidenceSkeleton: {
    backgroundColor: "rgba(116,119,124,0.10)",
    borderRadius: radius.pill,
    height: 9,
    marginTop: 5,
    width: 96,
  },
  restaurantEvidenceNeedsConfirmation: {
    color: "#A85D00",
  },
  restaurantName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  restaurantRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: "0 8px 22px rgba(17,17,17,0.04)",
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    minHeight: 78,
    paddingHorizontal: spacing.two,
    paddingVertical: 12,
  },
  restaurantRowPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.992 }],
  },
  restaurantText: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  searchGroup: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.three,
    minHeight: 48,
    overflow: "hidden",
    paddingHorizontal: 15,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    minHeight: 48,
  },
  stickySearchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    minHeight: 48,
  },
  stickySearchWrap: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 7,
    height: 48,
    left: spacing.three,
    overflow: "hidden",
    paddingHorizontal: 13,
    position: "absolute",
    right: 80,
    top: 8,
    zIndex: 5,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40,
  },
});
