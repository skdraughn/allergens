import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DetailPageShell, DetailPageTopBar } from "@/components/detail-page-shell";
import { IconButton } from "@/components/icon-button";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { colors, spacing } from "@/constants/theme";
import { getRestaurantBrand, getRestaurantBrandBackground } from "@/data/brand-assets";
import { RestaurantAccommodationDetails } from "@/features/restaurants/restaurant-accommodation-details";
import { useRestaurantDetail } from "@/features/restaurants/restaurant-data-context";

export function RestaurantAccommodationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, snapshotPath } = useLocalSearchParams<{ id: string; snapshotPath?: string }>();
  const { restaurant } = useRestaurantDetail(id, snapshotPath);
  const policy = restaurant?.allergyAccommodationPolicy;
  const brand = restaurant
    ? getRestaurantBrand(restaurant.id, {
        domain: restaurant.domain ?? undefined,
        logoAspectRatio: restaurant.logoAspectRatio ?? undefined,
        logoMonogram: restaurant.logoMonogram ?? undefined,
        logoSvgUrl: restaurant.logoSvgUrl ?? undefined,
        logoUrl: restaurant.logoUrl ?? undefined,
        name: restaurant.name,
      })
    : null;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/home");
  };

  return (
    <DetailPageShell>
      <DetailPageTopBar style={styles.nav}>
        <View style={styles.navLeading}>
          <IconButton Icon={ChevronLeft} label="Back" onPress={goBack} />
          <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.navTitle}>
            {restaurant?.name ?? "Allergy accommodations"}
          </Text>
        </View>
      </DetailPageTopBar>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom + 32, spacing.four) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {restaurant && brand ? (
            <View
              style={[
                styles.logoFrame,
                { backgroundColor: getRestaurantBrandBackground(brand) },
              ]}
            >
              <RestaurantLogo brand={brand} borderRadius={18} size={56} />
            </View>
          ) : null}
          <Text maxFontSizeMultiplier={1.05} numberOfLines={2} style={styles.restaurantName}>
            {restaurant?.name ?? "Restaurant"}
          </Text>
        </View>

        {policy ? (
          <RestaurantAccommodationDetails policy={policy} />
        ) : (
          <View style={styles.emptyState}>
            <Text selectable style={styles.emptyTitle}>No published policy</Text>
            <Text selectable style={styles.emptyCopy}>
              We do not have restaurant-level allergy accommodation information for this place yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </DetailPageShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  emptyState: {
    backgroundColor: "#F5F5F7",
    borderCurve: "continuous",
    borderRadius: 16,
    gap: 5,
    padding: spacing.two,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  header: {
    alignItems: "center",
    gap: 8,
    paddingBottom: spacing.three,
  },
  logoFrame: {
    alignItems: "center",
    borderRadius: 28,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  nav: {
    backgroundColor: "rgba(255,255,255,0.88)",
    minHeight: 62,
    zIndex: 2,
  },
  navLeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  navTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    lineHeight: 23,
  },
  restaurantName: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
    textAlign: "center",
  },
});
