import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BadgeInfo,
  CalendarClock,
  ChevronLeft,
  ExternalLink,
  ShieldAlert,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { ScreenBackground } from "@/components/screen-background";
import { colors, radius, spacing } from "@/constants/theme";
import { getRestaurantBrand, getRestaurantBrandBackground } from "@/data/brand-assets";
import type { AllergyAccommodationPolicy } from "@/data/restaurants";
import { useRestaurantDetail } from "@/features/restaurants/restaurant-data-context";

export function RestaurantAccommodationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, snapshotPath } = useLocalSearchParams<{ id: string; snapshotPath?: string }>();
  const { restaurant } = useRestaurantDetail(id, snapshotPath);
  const policy = restaurant?.allergyAccommodationPolicy;
  const tone = getAccommodationPolicyTone(policy?.status ?? "unknown");
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
    <ScreenBackground>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <View style={styles.nav}>
          <IconButton Icon={ChevronLeft} label="Back" onPress={goBack} />
        </View>

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
                <RestaurantLogo brand={brand} borderRadius={18} size={58} />
              </View>
            ) : null}
            <Text maxFontSizeMultiplier={1.05} numberOfLines={2} style={styles.restaurantName}>
              {restaurant?.name ?? "Restaurant"}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: tone.background }]}>
              <BadgeInfo color={tone.color} size={15} strokeWidth={2.45} />
              <Text style={[styles.statusPillText, { color: tone.color }]}>
                {tone.label}
              </Text>
            </View>
          </View>

          {policy ? (
            <>
              <InfoSection title="What they say">
                <Text style={styles.bodyText}>{policy.summary}</Text>
              </InfoSection>

              {policy.advanceNotice ? (
                <InfoSection title="Advance notice">
                  <View style={styles.noticeRow}>
                    <CalendarClock color={colors.primary} size={18} strokeWidth={2.35} />
                    <Text style={styles.noticeText}>{policy.advanceNotice}</Text>
                  </View>
                </InfoSection>
              ) : null}

              {policy.supported?.length ? (
                <InfoSection title="They mention support for">
                  <ChipList labels={policy.supported} tone="positive" />
                </InfoSection>
              ) : null}

              {policy.notSupported?.length ? (
                <InfoSection title="They may not support">
                  <ChipList labels={policy.notSupported} tone="negative" />
                </InfoSection>
              ) : null}

              {policy.notes?.length ? (
                <InfoSection title="How to use this">
                  <View style={styles.noteList}>
                    {policy.notes.map((note) => (
                      <View key={note} style={styles.noteRow}>
                        <View style={styles.noteDot} />
                        <Text style={styles.noteText}>{note}</Text>
                      </View>
                    ))}
                  </View>
                </InfoSection>
              ) : null}

              <InfoSection title="Still confirm before ordering">
                <View style={styles.confirmRow}>
                  <ShieldAlert color="#B25E00" size={19} strokeWidth={2.35} />
                  <Text style={styles.bodyText}>
                    This is restaurant-level planning information, not item-level allergen data.
                    Contact the restaurant and confirm with staff before booking or ordering.
                  </Text>
                </View>
              </InfoSection>

              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(policy.sourceUrl)}
                style={styles.sourceButton}
              >
                <View style={styles.sourceButtonTextGroup}>
                  <Text style={styles.sourceButtonLabel}>{policy.sourceLabel}</Text>
                  <Text style={styles.sourceButtonMeta}>{formatSourceType(policy.sourceType)}</Text>
                </View>
                <ExternalLink color={colors.primary} size={18} strokeWidth={2.35} />
              </Pressable>
            </>
          ) : (
            <InfoSection title="No policy found yet">
              <Text style={styles.bodyText}>
                We do not have restaurant-level allergy accommodation information for this place yet.
              </Text>
            </InfoSection>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function InfoSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ChipList({ labels, tone }: { labels: string[]; tone: "negative" | "positive" }) {
  return (
    <View style={styles.chipList}>
      {labels.map((label) => (
        <View
          key={label}
          style={[
            styles.infoChip,
            tone === "positive" ? styles.infoChipPositive : styles.infoChipNegative,
          ]}
        >
          <Text
            style={[
              styles.infoChipText,
              tone === "positive" ? styles.infoChipTextPositive : styles.infoChipTextNegative,
            ]}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function getAccommodationPolicyTone(status: AllergyAccommodationPolicy["status"]) {
  if (status === "can-accommodate") {
    return { background: "#EAF7EF", color: "#22863A", label: "Can discuss allergies" };
  }

  if (status === "partial-accommodation") {
    return { background: "#FFF4E2", color: "#B25E00", label: "Limited accommodations" };
  }

  if (status === "cannot-accommodate") {
    return { background: "#FFECEE", color: "#C6283E", label: "Cannot accommodate" };
  }

  return { background: "#F2F2F7", color: colors.muted, label: "Policy not found yet" };
}

function formatSourceType(sourceType: AllergyAccommodationPolicy["sourceType"]) {
  if (sourceType === "official-site") {
    return "Restaurant website";
  }

  if (sourceType === "official-booking") {
    return "Official booking page";
  }

  if (sourceType === "manual-review") {
    return "Manual review";
  }

  return "Community lead";
}

const styles = StyleSheet.create({
  bodyText: {
    color: "#3C3C43",
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
  },
  chipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  confirmRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9,
  },
  content: {
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
  },
  header: {
    alignItems: "center",
    gap: 8,
    paddingBottom: spacing.three,
  },
  infoChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  infoChipNegative: {
    backgroundColor: "#FFECEE",
  },
  infoChipPositive: {
    backgroundColor: "#EAF7EF",
  },
  infoChipText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  infoChipTextNegative: {
    color: "#C6283E",
  },
  infoChipTextPositive: {
    color: "#22863A",
  },
  logoFrame: {
    alignItems: "center",
    borderRadius: 28,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  nav: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    flexDirection: "row",
    minHeight: 62,
    paddingBottom: spacing.one,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
    zIndex: 2,
  },
  noteDot: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 6,
    marginTop: 8,
    width: 6,
  },
  noteList: {
    gap: 9,
  },
  noteRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9,
  },
  noteText: {
    color: "#3C3C43",
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  noticeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  noticeText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  restaurantName: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
    textAlign: "center",
  },
  safeArea: {
    flex: 1,
  },
  section: {
    borderBottomColor: "rgba(60,60,67,0.12)",
    borderBottomWidth: 1,
    paddingBottom: spacing.two,
    paddingTop: spacing.two,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
    marginBottom: 7,
  },
  sourceButton: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: spacing.three,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sourceButtonLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
  },
  sourceButtonMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    opacity: 0.72,
  },
  sourceButtonTextGroup: {
    flex: 1,
    gap: 2,
  },
  statusPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
});
