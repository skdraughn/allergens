import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import {
  BadgeInfo,
  Plus,
  Search,
  UserRound,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
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
  FadeInUp,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { ScreenBackground } from "@/components/screen-background";
import { SereneLoader } from "@/components/serene-loader";
import { normalizeAllergyIds } from "@/constants/allergies";
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
  getRestaurantSearchLocation,
  getSearchResultSummary,
  searchRestaurantPage,
  type RestaurantSearchPage,
  type RestaurantSearchResult,
  type RestaurantSearchSummary,
} from "@/features/restaurants/restaurant-search-service";
import { useRestaurantData } from "@/features/restaurants/restaurant-data-context";
import { getMenuItemSafety } from "@/lib/safety";

const restaurantResultPageSize = 50;
type ReviewedRestaurant = {
  restaurant: RestaurantSearchResult;
  sourceRestaurant?: Restaurant;
  summary: RestaurantSearchSummary;
};
export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profiles, selectedAllergyIds, selectedProfileIds } = useAllergyProfile();
  const { restaurants } = useRestaurantData();
  const scrollY = useSharedValue(0);
  const stickySearchInteractive = useSharedValue(false);
  const [query, setQuery] = useState("");
  const [contributionMode, setContributionMode] = useState<ContributionMode | null>(null);
  const [profileManagerVisible, setProfileManagerVisible] = useState(false);
  const [stickySearchVisible, setStickySearchVisible] = useState(false);
  const [pendingRestaurantId, setPendingRestaurantId] = useState<string | null>(null);
  const locationQuery = useQuery({
    gcTime: 1000 * 60 * 30,
    queryFn: getRestaurantSearchLocation,
    queryKey: ["restaurant-search-location"],
    retry: false,
    staleTime: 1000 * 60 * 10,
  });
  const normalizedQuery = normalizeSearchText(query);
  const restaurantDataSignature = useMemo(
    () =>
      `${restaurants.length}:${restaurants.reduce(
        (count, restaurant) => count + restaurant.items.length,
        0,
      )}`,
    [restaurants],
  );

  const searchQuery = useInfiniteQuery<RestaurantSearchPage>({
    gcTime: 1000 * 60 * 30,
    getNextPageParam: (lastPage) => lastPage.nextToken || undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      searchRestaurantPage({
        fallbackRestaurants: restaurants,
        limit: restaurantResultPageSize,
        location: locationQuery.data,
        nextToken: typeof pageParam === "string" ? pageParam : null,
        query,
      }),
    queryKey: [
      "restaurant-search",
      normalizedQuery,
      restaurantDataSignature,
      locationQuery.data?.lat ?? null,
      locationQuery.data?.lng ?? null,
    ],
    staleTime: 1000 * 60 * 5,
  });
  const searchResults = useMemo(
    () => searchQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [searchQuery.data],
  );
  const isInitialSearchLoading = searchQuery.isPending && searchResults.length === 0;
  const canLoadMoreRestaurants = searchQuery.hasNextPage && !searchQuery.isFetchingNextPage;
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

      void searchQuery.fetchNextPage();
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
      setPendingRestaurantId(null);
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
              <View style={styles.headerProfileInitialCircle}>
                <Text style={styles.headerProfileInitial}>{selectedProfileInitial}</Text>
              </View>
            </Pressable>
          </Animated.View>
          <Animated.View
            pointerEvents={stickySearchVisible ? "none" : "auto"}
            style={accountButtonScrollStyle}
          >
            <IconButton Icon={UserRound} label="Account" onPress={() => router.push("/account")} />
          </Animated.View>
          <Animated.View
            pointerEvents={stickySearchVisible ? "auto" : "none"}
            style={[styles.stickySearchWrap, stickySearchStyle]}
          >
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
            isInitialSearchLoading ? (
              <View style={styles.loadingSearch}>
                <SereneLoader />
                <Text style={styles.loadingLabel}>Finding restaurants</Text>
              </View>
            ) : (
              <View style={styles.emptySearch}>
                <Text style={styles.emptySearchTitle}>No restaurant matches</Text>
                <Text style={styles.emptySearchCopy}>
                  Request it and share any address or menu details you already have.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setContributionMode("restaurant-request")}
                  style={styles.requestButton}
                >
                  <Plus color={colors.primary} size={18} strokeWidth={2.6} />
                  <Text style={styles.requestButtonText}>Request this restaurant</Text>
                </Pressable>
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
                entering={FadeInUp.duration(820)
                  .delay(90)
                  .easing(ReanimatedEasing.bezier(0.16, 1, 0.3, 1))}
                style={[styles.searchGroup, heroSearchStyle]}
              >
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
          renderItem={({ item }) => (
            <RestaurantRow
              disabled={pendingRestaurantId !== null}
              loading={pendingRestaurantId === item.restaurant.restaurantId}
              onPress={() => {
                if (pendingRestaurantId !== null) {
                  return;
                }

                setPendingRestaurantId(item.restaurant.restaurantId);
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
              selectedAllergyIds={selectedAllergyIds}
              sourceRestaurant={item.sourceRestaurant}
              summary={item.summary}
            />
          )}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        />

        <View
          pointerEvents="box-none"
          style={[styles.floatingRequestWrap, { bottom: Math.max(insets.bottom + 14, 24) }]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => setContributionMode("restaurant-request")}
            style={styles.floatingRequestButton}
          >
            <Plus color={colors.primary} size={17} strokeWidth={2.6} />
            <Text style={styles.floatingRequestText}>Missing a restaurant? Request it</Text>
          </Pressable>
        </View>

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
  disabled,
  loading,
  onPress,
  restaurant,
  selectedAllergyIds,
  sourceRestaurant,
  summary,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  restaurant: RestaurantSearchResult;
  selectedAllergyIds: string[];
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
  const combinedMetric = sourceRestaurant
    ? getCombinedReviewMetric(sourceRestaurant, selectedAllergyIds)
    : null;
  const usesIngredientIntelligenceMetric = Boolean(
    combinedMetric?.hasIngredientIntelligence && combinedMetric.reviewedCount > 0,
  );
  const compatibleCount = combinedMetric?.reviewedCount
    ? combinedMetric.okCount
    : summary.okCount;
  const compatibleTotal = combinedMetric?.reviewedCount
    ? combinedMetric.reviewedCount
    : summary.totalCount;
  const compatiblePercent =
    compatibleTotal > 0 ? Math.round((compatibleCount / compatibleTotal) * 100) : 0;
  const locationLabel = getRestaurantLocationLabel(restaurant);
  const itemCount = restaurant.totalItemCount ?? summary.totalCount;
  const policy = sourceRestaurant?.allergyAccommodationPolicy;
  const policyOnly = Boolean(policy && itemCount === 0);
  const policyTone = policy ? getAccommodationPolicyTone(policy.status) : null;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.restaurantRow,
        pressed ? styles.restaurantRowPressed : null,
        loading ? styles.restaurantRowLoading : null,
      ]}
    >
      <View style={[styles.logoWrap, { backgroundColor: getRestaurantBrandBackground(brand) }]}>
        <RestaurantLogo brand={brand} borderRadius={11} size={34} />
      </View>
      <View style={styles.restaurantText}>
        <Text style={styles.restaurantName}>{restaurant.name}</Text>
        {policyOnly && policyTone ? (
          <View style={styles.policyMetaRow}>
            <BadgeInfo color={policyTone.color} size={14} strokeWidth={2.35} />
            <Text style={[styles.policyMetaText, { color: policyTone.color }]}>
              {policyTone.label}
            </Text>
          </View>
        ) : (
          <Text style={styles.restaurantMeta}>
            {[locationLabel, restaurant.category, `${itemCount} menu items`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
      </View>
      {loading ? (
        <View style={styles.rowLoadingIndicator}>
          <SereneLoader size="small" />
        </View>
      ) : policyOnly && policyTone ? (
        <View style={styles.policyBadgeBlock}>
          <View style={[styles.policyBadge, { backgroundColor: policyTone.background }]}>
            <Text style={[styles.policyBadgeText, { color: policyTone.color }]}>Policy</Text>
          </View>
        </View>
      ) : (
        <View style={styles.compatibilityBlock}>
          <Text style={styles.compatibilityPercent}>{compatiblePercent}%</Text>
          <Text style={styles.compatibilityCount}>
            {compatibleCount}/{compatibleTotal}
          </Text>
          <View style={styles.compatibilityTrack}>
            <View
              style={[
                styles.compatibilityFill,
                usesIngredientIntelligenceMetric && styles.compatibilityFillIntelligence,
                { width: `${compatiblePercent}%` },
              ]}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}

function getAccommodationPolicyTone(status: NonNullable<Restaurant["allergyAccommodationPolicy"]>["status"]) {
  if (status === "can-accommodate") {
    return { background: "#EAF7EF", color: "#22863A", label: "Accommodation info" };
  }

  if (status === "partial-accommodation") {
    return { background: "#FFF4E2", color: "#B25E00", label: "Limited accommodation info" };
  }

  if (status === "cannot-accommodate") {
    return { background: "#FFECEE", color: "#C6283E", label: "Restriction policy" };
  }

  return { background: "#F2F2F7", color: colors.muted, label: "Policy research" };
}

function getCombinedReviewMetric(restaurant: Restaurant, selectedAllergyIds: string[]) {
  const selectedIds = expandSelectedAllergyIds(selectedAllergyIds);
  let reviewedCount = 0;
  let okCount = 0;
  let hasIngredientIntelligence = false;

  for (const item of restaurant.items) {
    const officialReviewed = isOfficiallyReviewed(item);
    const intelligenceReviewed = isIngredientIntelligenceReviewed(item);

    if (!officialReviewed && !intelligenceReviewed) {
      continue;
    }

    reviewedCount += 1;

    if (intelligenceReviewed && !officialReviewed) {
      hasIngredientIntelligence = true;
    }

    if (selectedIds.size === 0) {
      okCount += 1;
      continue;
    }

    if (officialReviewed) {
      if (getMenuItemSafety(item, selectedAllergyIds).status === "ok") {
        okCount += 1;
      }

      continue;
    }

    const hasSelectedInferredSignal = (item.inferredAllergenSignals ?? []).some((signal) =>
      selectedIds.has(signal.id),
    );

    if (!hasSelectedInferredSignal) {
      okCount += 1;
    }
  }

  return {
    hasIngredientIntelligence,
    okCount,
    reviewedCount,
  };
}

function isOfficiallyReviewed(item: Restaurant["items"][number]) {
  return item.allergenSourceType !== "unavailable" && !isOfficialAllergenDataEmpty(item);
}

function isOfficialAllergenDataEmpty(item: Restaurant["items"][number]) {
  return (
    !item.allergenSourceType &&
    item.allergens.length === 0 &&
    (item.mayContain ?? []).length === 0
  );
}

function isIngredientIntelligenceReviewed(item: Restaurant["items"][number]) {
  return Boolean(
    item.inferenceVersion ||
      item.inferenceSummary ||
      (item.inferredIngredients ?? []).length > 0 ||
      (item.inferredAllergenSignals ?? []).length > 0,
  );
}

function expandSelectedAllergyIds(selectedAllergyIds: string[]) {
  const normalizedIds = normalizeAllergyIds(selectedAllergyIds);
  const expandedIds = new Set(normalizedIds);

  if (expandedIds.has("gluten")) {
    expandedIds.add("wheat");
  }

  return expandedIds;
}

function getRestaurantLocationLabel(restaurant: RestaurantSearchResult) {
  if (typeof restaurant.distanceMiles === "number") {
    return `${restaurant.distanceMiles} mi away`;
  }

  if (restaurant.city && restaurant.region) {
    return `${restaurant.city}, ${restaurant.region}`;
  }

  if (restaurant.city) {
    return restaurant.city;
  }

  if (restaurant.type === "local") {
    return "Local restaurant";
  }

  return null;
}

const styles = StyleSheet.create({
  compatibilityBlock: {
    alignItems: "flex-end",
    minWidth: 74,
  },
  compatibilityCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
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
    lineHeight: 23,
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
  floatingRequestButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "rgba(0,122,255,0.18)",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14,
    shadowColor: "#000000",
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  floatingRequestText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  floatingRequestWrap: {
    alignItems: "center",
    left: spacing.three,
    position: "absolute",
    right: spacing.three,
  },
  headerProfile: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
  },
  headerProfileInitial: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21,
  },
  headerProfileInitialCircle: {
    alignItems: "center",
    backgroundColor: "#F5F5F7",
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
  loadingSearch: {
    alignItems: "center",
    gap: 8,
    paddingVertical: spacing.four,
  },
  loadingLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
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
    boxShadow: "0 10px 28px rgba(17,17,17,0.055)",
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    minHeight: 78,
    paddingHorizontal: spacing.two,
    paddingVertical: 12,
  },
  restaurantRowLoading: {
    opacity: 0.72,
  },
  restaurantRowPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.992 }],
  },
  restaurantText: {
    flex: 1,
  },
  policyBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  policyBadgeBlock: {
    alignItems: "flex-end",
    minWidth: 66,
  },
  policyBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
  },
  policyMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 3,
  },
  policyMetaText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  requestButton: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: spacing.two,
  },
  requestButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
  },
  rowLoadingIndicator: {
    alignItems: "flex-end",
    minWidth: 74,
  },
  safeArea: {
    flex: 1,
  },
  searchGroup: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.three,
    minHeight: 48,
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
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 7,
    height: 48,
    left: spacing.three,
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
