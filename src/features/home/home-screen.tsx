import { useFocusEffect, useRouter } from "expo-router";
import { Plus, Search, UserRound } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { ScreenBackground } from "@/components/screen-background";
import { colors, radius, spacing } from "@/constants/theme";
import { getRestaurantBrand } from "@/data/brand-assets";
import { type Restaurant } from "@/data/restaurants";
import {
  CommunityContributionModal,
  type ContributionMode,
} from "@/features/community/community-contribution-modal";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { useRestaurantData } from "@/features/restaurants/restaurant-data-context";
import { getRestaurantSafety } from "@/lib/safety";

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedAllergyIds } = useAllergyProfile();
  const { restaurants } = useRestaurantData();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");
  const [contributionMode, setContributionMode] = useState<ContributionMode | null>(null);
  const [pendingRestaurantId, setPendingRestaurantId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setPendingRestaurantId(null);
    }, []),
  );

  const reviewedRestaurants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return restaurants
      .map((restaurant) => ({
        matchRank: getRestaurantSearchMatchRank(restaurant, normalizedQuery),
        restaurant,
        summary: getRestaurantSafety(restaurant, selectedAllergyIds),
      }))
      .filter(({ matchRank }) => !normalizedQuery || matchRank < Number.POSITIVE_INFINITY)
      .sort((a, b) => a.matchRank - b.matchRank || a.restaurant.rank - b.restaurant.rank);
  }, [query, restaurants, selectedAllergyIds]);
  const stickySearchOpacity = scrollY.interpolate({
    inputRange: [44, 86],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickySearchTranslateY = scrollY.interpolate({
    inputRange: [44, 86],
    outputRange: [10, 0],
    extrapolate: "clamp",
  });
  const heroSearchOpacity = scrollY.interpolate({
    inputRange: [24, 76],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const heroSearchScale = scrollY.interpolate({
    inputRange: [0, 86],
    outputRange: [1, 0.96],
    extrapolate: "clamp",
  });
  const navShadowOpacity = scrollY.interpolate({
    inputRange: [12, 80],
    outputRange: [0, 0.1],
    extrapolate: "clamp",
  });

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.nav, { shadowOpacity: navShadowOpacity }]}>
          <Animated.View
            style={[
              styles.stickySearchWrap,
              {
                opacity: stickySearchOpacity,
                transform: [{ translateY: stickySearchTranslateY }],
              },
            ]}
          >
            <Search color={colors.muted} size={17} strokeWidth={2.4} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#8E8E93"
              style={styles.stickySearchInput}
              value={query}
            />
          </Animated.View>
          <IconButton Icon={UserRound} label="Account" onPress={() => router.push("/account")} />
        </Animated.View>

        <Animated.ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + 94, 112) },
          ]}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.copyBlock}>
            <Text style={styles.title}>Restaurants</Text>
          </View>

          <Animated.View
            style={[
              styles.searchGroup,
              {
                opacity: heroSearchOpacity,
                transform: [{ scale: heroSearchScale }],
              },
            ]}
          >
            <Search color={colors.muted} size={20} strokeWidth={2.4} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search restaurants or menu items"
              placeholderTextColor="#8E8E93"
              style={styles.searchInput}
              value={query}
            />
          </Animated.View>

          <View style={styles.resultsGroup}>
            {reviewedRestaurants.map(({ restaurant, summary }, index) => (
              <RestaurantRow
                disabled={pendingRestaurantId !== null}
                key={restaurant.id}
                last={index === reviewedRestaurants.length - 1}
                loading={pendingRestaurantId === restaurant.id}
                onPress={() => {
                  if (pendingRestaurantId !== null) {
                    return;
                  }

                  setPendingRestaurantId(restaurant.id);
                  router.push(`/restaurant/${restaurant.id}`);
                }}
                restaurant={restaurant}
                summary={summary}
              />
            ))}
            {reviewedRestaurants.length === 0 ? (
              <View style={styles.emptySearch}>
                <Text style={styles.emptySearchTitle}>No restaurant matches</Text>
                <Text style={styles.emptySearchCopy}>
                  Request it and we’ll look for official allergen sources.
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
            ) : null}
          </View>
        </Animated.ScrollView>

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
      </SafeAreaView>
    </ScreenBackground>
  );
}

function getRestaurantSearchMatchRank(restaurant: Restaurant, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  const restaurantName = restaurant.name.toLowerCase();

  if (restaurantName === normalizedQuery) {
    return 0;
  }

  if (restaurantName.startsWith(normalizedQuery)) {
    return 1;
  }

  if (restaurantName.includes(normalizedQuery)) {
    return 2;
  }

  const restaurantDetails = [
    restaurant.category,
    getRestaurantBrand(restaurant.id).description,
  ]
    .join(" ")
    .toLowerCase();

  if (restaurantDetails.includes(normalizedQuery)) {
    return 3;
  }

  const menuItemNames = restaurant.items.map((item) => item.name).join(" ").toLowerCase();

  if (menuItemNames.includes(normalizedQuery)) {
    return 4;
  }

  const menuItemDescriptions = restaurant.items
    .map((item) => item.description)
    .join(" ")
    .toLowerCase();

  if (menuItemDescriptions.includes(normalizedQuery)) {
    return 5;
  }

  return Number.POSITIVE_INFINITY;
}

function RestaurantRow({
  disabled,
  last,
  loading,
  onPress,
  restaurant,
  summary,
}: {
  disabled: boolean;
  last: boolean;
  loading: boolean;
  onPress: () => void;
  restaurant: Restaurant;
  summary: ReturnType<typeof getRestaurantSafety>;
}) {
  const brand = getRestaurantBrand(restaurant.id);
  const compatibleCount = summary.okCount;
  const compatiblePercent =
    summary.totalCount > 0 ? Math.round((compatibleCount / summary.totalCount) * 100) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.restaurantRow,
        !last && styles.rowDivider,
        loading && styles.restaurantRowLoading,
      ]}
    >
      <View style={[styles.logoWrap, { backgroundColor: `${brand.color}14` }]}>
        <RestaurantLogo brand={brand} borderRadius={11} size={34} />
      </View>
      <View style={styles.restaurantText}>
        <Text style={styles.restaurantName}>{restaurant.name}</Text>
        <Text style={styles.restaurantMeta}>
          {restaurant.category} · {restaurant.items.length} guide items
        </Text>
      </View>
      <View style={styles.compatibilityBlock}>
        <Text style={styles.compatibilityPercent}>{compatiblePercent}%</Text>
        <Text style={styles.compatibilityCount}>
          {compatibleCount}/{summary.totalCount}
        </Text>
        <View style={styles.compatibilityTrack}>
          <View style={[styles.compatibilityFill, { width: `${compatiblePercent}%` }]} />
        </View>
      </View>
    </Pressable>
  );
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
  nav: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    flexDirection: "row",
    justifyContent: "flex-end",
    minHeight: 64,
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
    shadowColor: "#000000",
    shadowOffset: { height: 5, width: 0 },
    shadowRadius: 14,
    zIndex: 4,
  },
  logoWrap: {
    alignItems: "center",
    borderRadius: 17,
    height: 48,
    justifyContent: "center",
    width: 48,
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
    flexDirection: "row",
    gap: 12,
    minHeight: 78,
    paddingHorizontal: spacing.two,
    paddingVertical: 12,
  },
  restaurantRowLoading: {
    opacity: 0.62,
  },
  restaurantText: {
    flex: 1,
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
  resultsGroup: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  rowDivider: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
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
    fontWeight: "600",
    minHeight: 38,
  },
  stickySearchWrap: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 7,
    height: 38,
    left: spacing.three,
    paddingHorizontal: 13,
    position: "absolute",
    right: 78,
    top: 9,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40,
  },
});
