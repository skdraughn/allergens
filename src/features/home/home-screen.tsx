import { useFocusEffect, useRouter } from "expo-router";
import { ClipboardList, Plus, Search, UserRound } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { ScreenBackground } from "@/components/screen-background";
import { SelectedAllergenBadges } from "@/components/selected-allergen-badges";
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
  const { selectedAllergyIds } = useAllergyProfile();
  const { restaurants } = useRestaurantData();
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

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.nav}>
          <View style={styles.profileButtonWrap}>
            <IconButton
              Icon={ClipboardList}
              label="Edit allergy profile"
              onPress={() => router.push("/profile")}
            />
            <SelectedAllergenBadges selectedIds={selectedAllergyIds} />
          </View>
          <IconButton Icon={UserRound} label="Account" onPress={() => router.push("/account")} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.copyBlock}>
            <Text style={styles.title}>Restaurants</Text>
          </View>

          <View style={styles.searchGroup}>
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
          </View>

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
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setContributionMode("restaurant-request")}
                style={styles.requestFooter}
              >
                <Plus color={colors.primary} size={17} strokeWidth={2.6} />
                <Text style={styles.requestFooterText}>Missing a restaurant? Request it.</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

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
    paddingTop: spacing.four,
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
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.three,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
  },
  profileButtonWrap: {
    position: "relative",
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
  requestFooter: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 58,
  },
  requestFooterText: {
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
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40,
  },
});
