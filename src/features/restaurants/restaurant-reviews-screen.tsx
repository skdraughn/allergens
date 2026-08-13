import { useAuthenticator } from "@aws-amplify/ui-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, HeartPulse, Plus, Search, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DetailPageShell, DetailPageTopBar } from "@/components/detail-page-shell";
import { AllergyRatingPicker } from "@/components/allergy-rating-picker";
import { CommunityReviewCard } from "@/components/community-review-card";
import { CommunityReviewSummary } from "@/components/community-review-summary";
import { IconButtonSurface } from "@/components/icon-button";
import { ModalIconButton } from "@/components/modal-icon-button";
import { PrimaryButton } from "@/components/primary-button";
import { FloatingPillButton } from "@/components/restaurant-request-button";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { SelectableChip } from "@/components/selectable-chip";
import { SereneLoader } from "@/components/serene-loader";
import { allergyOptions, getAllergyLabels, normalizeAllergyIds } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import {
  getRestaurantBrand,
  getRestaurantBrandBackground,
} from "@/data/brand-assets";
import type { MenuItem } from "@/data/restaurants";
import {
  useCommunitySubmission,
  useRestaurantCommunity,
} from "@/features/community/use-restaurant-community";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { useRestaurantDetail } from "@/features/restaurants/restaurant-data-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type ReviewForm = {
  allergyIds: string[];
  body: string;
  menuItemId: string;
  rating: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
type AnimatedPressableStyle = ComponentProps<typeof AnimatedPressable>["style"];
type AnimatedViewStyle = ComponentProps<typeof Animated.View>["style"];

const emptyForm = (menuItemId = "", allergyIds: string[] = []): ReviewForm => ({
  allergyIds: normalizeAllergyIds(allergyIds),
  body: "",
  menuItemId,
  rating: 0,
});

export function RestaurantReviewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { compose, id, menuItemId, snapshotPath } = useLocalSearchParams<{
    compose?: string;
    id: string;
    menuItemId?: string;
    snapshotPath?: string;
  }>();
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const { selectedAllergyIds } = useAllergyProfile();
  const { restaurant } = useRestaurantDetail(id, snapshotPath);
  const community = useRestaurantCommunity(restaurant?.id ?? "");
  const submissions = useCommunitySubmission(restaurant?.id);
  const initialMenuItemId = typeof menuItemId === "string" ? menuItemId : "";
  const shouldOpenComposerFromLink = compose === "1" || initialMenuItemId.length > 0;
  const [form, setForm] = useState<ReviewForm>(() =>
    emptyForm(initialMenuItemId, selectedAllergyIds),
  );
  const [composerVisible, setComposerVisible] = useState(shouldOpenComposerFromLink);
  const [compactTitleThreshold, setCompactTitleThreshold] = useState(132);
  const [menuSearchVisible, setMenuSearchVisible] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const reviews = community.data?.reviews ?? [];
  const summary = community.data?.summary ?? { averageRating: null, count: 0 };
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
  const animatedScrollY = useSharedValue(0);
  const navTitleAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        animatedScrollY.value,
        [compactTitleThreshold - 44, compactTitleThreshold + 8],
        [0, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateX: interpolate(
            animatedScrollY.value,
            [compactTitleThreshold - 44, compactTitleThreshold + 8],
            [-8, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    }),
    [compactTitleThreshold],
  );
  const navButtonAnimatedStyle = useAnimatedStyle(
    () => {
      const size = interpolate(
        animatedScrollY.value,
        [compactTitleThreshold - 44, compactTitleThreshold + 8],
        [48, 36],
        Extrapolation.CLAMP,
      );

      return {
        borderRadius: size / 2,
        height: size,
        width: size,
      };
    },
    [compactTitleThreshold],
  );
  const navIconAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          scale: interpolate(
            animatedScrollY.value,
            [compactTitleThreshold - 44, compactTitleThreshold + 8],
            [1, 0.84],
            Extrapolation.CLAMP,
          ),
        },
      ],
    }),
    [compactTitleThreshold],
  );
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      animatedScrollY.set(event.contentOffset.y);
    },
  });
  useEffect(() => {
    setForm(emptyForm(initialMenuItemId, selectedAllergyIds));
    setComposerVisible(shouldOpenComposerFromLink);
  }, [initialMenuItemId, restaurant?.id, selectedAllergyIds, shouldOpenComposerFromLink]);

  const selectedMenuItem = restaurant?.items.find((item) => item.id === form.menuItemId) ?? null;
  const canSubmit = Boolean(restaurant?.id && form.rating >= 1);
  const submitReview = async () => {
    if (!restaurant) {
      return;
    }

    if (authStatus !== "authenticated") {
      router.push("/account");
      return;
    }

    try {
      await submissions.submitReview.mutateAsync({
        allergyContext: formatAllergyContext(form.allergyIds),
        body: form.body,
        menuItemId: selectedMenuItem?.id ?? null,
        menuItemName: selectedMenuItem?.name ?? null,
        rating: form.rating,
        restaurantId: restaurant.id,
      });
      setForm(emptyForm(form.menuItemId, selectedAllergyIds));
      if (router.canGoBack()) {
        router.back();
      } else {
        setComposerVisible(false);
      }
      Alert.alert("Review submitted", "Thanks. Your allergy review is queued for review.");
    } catch (error) {
      Alert.alert(
        "Submission failed",
        error instanceof Error ? error.message : "Unable to submit this review right now.",
      );
    }
  };

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
            <AnimatedNavButton
              Icon={ChevronLeft}
              iconStyle={navIconAnimatedStyle}
              label="Back"
              onPress={goBack}
              style={navButtonAnimatedStyle}
            />
            <Animated.Text
              maxFontSizeMultiplier={1.1}
              numberOfLines={1}
              style={[styles.navTitle, navTitleAnimatedStyle]}
            >
              {composerVisible ? "Leave review" : restaurant?.name ?? "Allergy reviews"}
            </Animated.Text>
          </View>
        </DetailPageTopBar>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.safeArea}
        >
          <Animated.ScrollView
            contentContainerStyle={[
              styles.content,
              {
                paddingBottom: Math.max(
                  insets.bottom + (composerVisible ? 112 : 96),
                  spacing.four,
                ),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            {!composerVisible ? (
              <View
                onLayout={(event) => {
                  const nextThreshold = Math.max(96, event.nativeEvent.layout.height - 18);
                  setCompactTitleThreshold((current) =>
                    Math.abs(current - nextThreshold) < 1 ? current : nextThreshold,
                  );
                }}
                style={styles.header}
              >
                {restaurant && brand ? (
                  <View
                    style={[
                      styles.logoFrame,
                      { backgroundColor: getRestaurantBrandBackground(brand) },
                    ]}
                  >
                    <RestaurantLogo brand={brand} borderRadius={20} size={64} />
                  </View>
                ) : null}
                <Text numberOfLines={2} style={styles.title}>
                  {restaurant?.name ?? "Restaurant"}
                </Text>
                <CommunityReviewSummary summary={summary} />
              </View>
            ) : (
              <View
                onLayout={(event) => {
                  const nextThreshold = Math.max(96, event.nativeEvent.layout.height - 18);
                  setCompactTitleThreshold((current) =>
                    Math.abs(current - nextThreshold) < 1 ? current : nextThreshold,
                  );
                }}
                style={styles.composerIntro}
              >
                <Text style={styles.composerTitle}>Leave an allergy review</Text>
                <Text style={styles.helper}>
                  Share what someone ordering with allergies should know. Add a dish when your note
                  is tied to one item.
                </Text>
              </View>
            )}

            {composerVisible ? (
              <View style={styles.composer}>
                <AllergyRatingPicker
                  onChange={(rating) => setForm((current) => ({ ...current, rating }))}
                  rating={form.rating}
                />
                <MenuItemPicker
                  items={restaurant?.items ?? []}
                  onClear={() => setForm((current) => ({ ...current, menuItemId: "" }))}
                  onOpenSearch={() => setMenuSearchVisible(true)}
                  selectedId={form.menuItemId}
                />
                <Field
                  label="Review"
                  multiline
                  onChangeText={(body) => setForm((current) => ({ ...current, body }))}
                  placeholder="What should someone with allergies know?"
                  value={form.body}
                />
                <AllergyContextPicker
                  selectedIds={form.allergyIds}
                  onChange={(allergyIds) => setForm((current) => ({ ...current, allergyIds }))}
                />
              </View>
            ) : null}

            {!composerVisible ? (
              <View style={styles.reviewSection}>
              <View style={styles.reviewSectionHeader}>
                <Text style={styles.sectionTitle}>Allergy reviews</Text>
                {community.isFetching ? <SereneLoader size="small" /> : null}
              </View>
              {reviews.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No allergy ratings yet</Text>
                  <Text style={styles.emptyCopy}>
                    Be the first to leave a practical note for people ordering with allergies.
                  </Text>
                </View>
              ) : (
                <View style={styles.reviewList}>
                  {reviews.map((review, index) => (
                    <CommunityReviewCard
                      key={review.id}
                      last={index === reviews.length - 1}
                      review={review}
                    />
                  ))}
                </View>
              )}
            </View>
            ) : null}

          </Animated.ScrollView>
        </KeyboardAvoidingView>
        <MenuItemSearchModal
          items={restaurant?.items ?? []}
          onClose={() => setMenuSearchVisible(false)}
          onSelect={(item) => {
            setForm((current) => ({ ...current, menuItemId: item.id }));
            setMenuSearchVisible(false);
            setMenuSearchQuery("");
          }}
          query={menuSearchQuery}
          setQuery={setMenuSearchQuery}
          visible={menuSearchVisible}
        />
        {composerVisible ? (
          <View style={[styles.submitFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <PrimaryButton
              disabled={!canSubmit}
              label="Submit review"
              loading={submissions.submitReview.isPending}
              onPress={submitReview}
            />
          </View>
        ) : null}
        {!composerVisible ? (
          <FloatingPillButton
            Icon={HeartPulse}
            label="Leave an Allergy Review"
            onPress={() => router.push({
              pathname: "/restaurant-review",
              params: { compose: "1", id, snapshotPath },
            })}
          />
        ) : null}
    </DetailPageShell>
  );
}

function MenuItemPicker({
  items,
  onClear,
  onOpenSearch,
  selectedId,
}: {
  items: MenuItem[];
  onClear: () => void;
  onOpenSearch: () => void;
  selectedId: string;
}) {
  const selectedItem = items.find((item) => item.id === selectedId);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Mention menu item</Text>
      <Pressable accessibilityRole="button" onPress={onOpenSearch} style={styles.menuPickerButton}>
        <View style={styles.menuPickerIcon}>
          {selectedItem ? (
            <Search color={colors.primary} size={17} strokeWidth={2.55} />
          ) : (
            <Plus color={colors.primary} size={17} strokeWidth={2.55} />
          )}
        </View>
        <View style={styles.menuPickerCopy}>
          <Text numberOfLines={1} style={styles.menuPickerTitle}>
            {selectedItem?.name ?? "Add dish"}
          </Text>
          <Text numberOfLines={1} style={styles.menuPickerSubtitle}>
            {selectedItem ? "Menu item selected" : "Optional"}
          </Text>
        </View>
        {selectedItem ? (
          <Pressable
            accessibilityLabel="Clear selected menu item"
            accessibilityRole="button"
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              onClear();
            }}
            style={styles.clearMenuItemButton}
          >
            <X color={colors.muted} size={16} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

function AllergyContextPicker({
  onChange,
  selectedIds,
}: {
  onChange: (ids: string[]) => void;
  selectedIds: string[];
}) {
  const normalizedSelectedIds = normalizeAllergyIds(selectedIds);
  const toggleAllergy = (id: string) => {
    if (normalizedSelectedIds.includes(id)) {
      onChange(normalizedSelectedIds.filter((selectedId) => selectedId !== id));
      return;
    }

    onChange(normalizeAllergyIds([...normalizedSelectedIds, id]));
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Allergy context</Text>
      <Text style={styles.fieldHelper}>
        Select the allergies that are relevant to your report. Leave empty for a general restaurant
        note.
      </Text>
      <View style={styles.allergyContextChips}>
        {allergyOptions.map((option) => (
          <SelectableChip
            accessibilityRole="checkbox"
            key={option.id}
            label={option.label}
            onPress={() => toggleAllergy(option.id)}
            selected={normalizedSelectedIds.includes(option.id)}
          />
        ))}
      </View>
    </View>
  );
}

function MenuItemSearchModal({
  items,
  onClose,
  onSelect,
  query,
  setQuery,
  visible,
}: {
  items: MenuItem[];
  onClose: () => void;
  onSelect: (item: MenuItem) => void;
  query: string;
  setQuery: (query: string) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const debouncedQuery = useDebouncedValue(query, 180);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedQuery.length > 0;
  const matchingItems = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return items
      .map((item, index) => ({
        index,
        item,
        rank: getMenuItemSearchRank(item, normalizedQuery),
      }))
      .filter((result) => result.rank !== null)
      .sort((left, right) => left.rank! - right.rank! || left.index - right.index)
      .map((result) => result.item);
  }, [items, normalizedQuery]);

  const renderItem: ListRenderItem<MenuItem> = ({ item }) => (
    <Pressable accessibilityRole="button" onPress={() => onSelect(item)} style={styles.searchRow}>
      <Text numberOfLines={1} style={styles.searchRowTitle}>
        {item.name}
      </Text>
      {item.description ? (
        <Text numberOfLines={2} style={styles.searchRowDescription}>
          {item.description}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View
        style={[
          styles.searchModalRoot,
          {
            paddingBottom: insets.bottom,
            paddingTop: Math.max(insets.top, spacing.two),
          },
        ]}
      >
        <View style={styles.searchModalHeader}>
          <View style={styles.searchModalField}>
            <Search color={colors.muted} size={19} strokeWidth={2.4} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onChangeText={setQuery}
              placeholder="Search menu items"
              placeholderTextColor="#8E8E93"
              returnKeyType="search"
              style={styles.searchModalInput}
              value={query}
            />
            {query ? (
              <Pressable
                accessibilityLabel="Clear menu search"
                accessibilityRole="button"
                onPress={() => setQuery("")}
                style={styles.clearSearchButton}
              >
                <X color={colors.muted} size={16} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
          <ModalIconButton
            Icon={X}
            label="Close menu search"
            onPress={onClose}
            style={styles.searchCloseButton}
          />
        </View>
        <FlatList
          contentContainerStyle={styles.searchResultsContent}
          data={matchingItems}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            hasSearchQuery ? (
              <View style={styles.searchEmptyState}>
                <Text style={styles.searchEmptyTitle}>No menu matches</Text>
                <Text style={styles.searchEmptyCopy}>Try another item or category.</Text>
              </View>
            ) : null
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Modal>
  );
}

function Field({
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8E8E93"
        style={[styles.input, multiline && styles.multiline]}
        value={value}
      />
    </View>
  );
}

function AnimatedNavButton({
  Icon,
  iconStyle,
  label,
  onPress,
  size = 20,
  strokeWidth = 2.35,
  style,
}: {
  Icon: LucideIcon;
  iconStyle: AnimatedViewStyle;
  label: string;
  onPress: () => void;
  size?: number;
  strokeWidth?: number;
  style: AnimatedPressableStyle;
}) {
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.navButton, style]}
    >
      <IconButtonSurface />
      <Animated.View style={iconStyle}>
        <Icon color={colors.primary} size={size} strokeWidth={strokeWidth} />
      </Animated.View>
    </AnimatedPressable>
  );
}

function formatAllergyContext(allergyIds: string[]) {
  const labels = getAllergyLabels(allergyIds);

  return labels.length > 0 ? `Relevant allergies: ${labels.join(", ")}` : "General restaurant note";
}

function getMenuItemSearchRank(item: MenuItem, normalizedQuery: string) {
  const weightedFields = [
    { rank: 0, text: item.name },
    { rank: 1, text: item.category },
    { rank: 2, text: item.description },
    { rank: 3, text: item.notes },
  ];
  let bestRank: number | null = null;

  for (const field of weightedFields) {
    const text = field.text?.toLowerCase();

    if (!text) {
      continue;
    }

    const fieldRank = getSearchTextRank(text, normalizedQuery);

    if (fieldRank === null) {
      continue;
    }

    const candidateRank = field.rank * 10 + fieldRank;
    bestRank = bestRank === null ? candidateRank : Math.min(bestRank, candidateRank);
  }

  return bestRank;
}

function getSearchTextRank(text: string, normalizedQuery: string) {
  if (text.startsWith(normalizedQuery)) {
    return 0;
  }

  const words = text.split(/[^a-z0-9]+/).filter(Boolean);

  if (words.some((word) => word.startsWith(normalizedQuery))) {
    return 1;
  }

  const initials = words.map((word) => word[0]).join("");

  if (initials.startsWith(normalizedQuery)) {
    return 2;
  }

  return text.includes(normalizedQuery) ? 6 : null;
}

const styles = StyleSheet.create({
  allergyContextChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  clearMenuItemButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  clearSearchButton: {
    alignItems: "center",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  composer: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: colors.line,
    borderCurve: "continuous",
    borderRadius: 26,
    borderWidth: 1,
    gap: spacing.two,
    padding: spacing.three,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
  },
  composerIntro: {
    gap: 8,
    paddingHorizontal: spacing.one,
    paddingTop: spacing.two,
  },
  composerTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 33,
  },
  content: {
    gap: spacing.three,
    paddingHorizontal: spacing.three,
    paddingTop: 2,
  },
  empty: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 7,
    padding: spacing.three,
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  field: {
    gap: 8,
  },
  fieldHelper: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  floatingReviewButton: {
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
  floatingReviewText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  floatingReviewWrap: {
    alignItems: "center",
    left: spacing.three,
    position: "absolute",
    right: spacing.three,
  },
  header: {
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.one,
    paddingHorizontal: spacing.two,
    paddingTop: 2,
  },
  helper: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#FAFAFC",
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: spacing.two,
    paddingVertical: 12,
  },
  logoFrame: {
    alignItems: "center",
    borderRadius: 30,
    height: 84,
    justifyContent: "center",
    width: 84,
  },
  menuChoice: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  menuChoiceActive: {
    backgroundColor: colors.primaryLight,
  },
  menuChoiceText: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  menuChoiceTextActive: {
    color: colors.primary,
    fontWeight: "900",
  },
  menuItemLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  menuPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  menuPickerButton: {
    alignItems: "center",
    backgroundColor: "#FAFAFC",
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuPickerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  menuPickerIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  menuPickerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  menuPickerTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  multiline: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.two,
    justifyContent: "space-between",
    minHeight: 64,
  },
  navButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
    width: 48,
  },
  navLeading: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.two,
    minWidth: 0,
  },
  navTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
    opacity: 0,
  },
  pendingBadge: {
    backgroundColor: "#FFF6E5",
    borderRadius: radius.pill,
    color: "#B25E00",
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reviewBody: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  reviewCard: {
    gap: 10,
    marginLeft: spacing.two,
    paddingRight: spacing.two,
    paddingVertical: 17,
  },
  reviewCardDivider: {
    borderBottomColor: "rgba(60,60,67,0.13)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reviewMeta: {
    color: "#5F6470",
    fontSize: 11,
    fontWeight: "800",
  },
  reviewAllergyPill: {
    alignSelf: "flex-start",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewContextRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reviewDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  reviewList: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(60,60,67,0.12)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  reviewRatingCluster: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  reviewRatingIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0F3",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  reviewRatingValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  reviewSection: {
    gap: spacing.two,
  },
  reviewSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  safeArea: {
    flex: 1,
  },
  searchCloseButton: {
    borderRadius: 20,
    height: 40,
    width: 40,
  },
  searchEmptyCopy: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
  searchEmptyState: {
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.four,
  },
  searchEmptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
  },
  searchModalField: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 18,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingLeft: 13,
    paddingRight: 6,
  },
  searchModalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.two,
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
  },
  searchModalInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    minWidth: 0,
    paddingVertical: 0,
  },
  searchModalRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
  searchResultsContent: {
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
  },
  searchRow: {
    borderBottomColor: "rgba(60,60,67,0.12)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: 14,
  },
  searchRowDescription: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  searchRowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  submitFooter: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopColor: "rgba(60,60,67,0.12)",
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.three,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  summaryRatingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 3,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 37,
    textAlign: "center",
  },
});
