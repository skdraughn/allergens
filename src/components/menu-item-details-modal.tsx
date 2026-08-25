import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { CollapsibleModalScreen } from "@/components/collapsible-modal-screen";
import { CommunityReviewCard } from "@/components/community-review-card";
import { CommunityReviewSummary } from "@/components/community-review-summary";
import { ModalScreen } from "@/components/modal-screen";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import type { MenuItem, OfficialAllergenProfiles } from "@/data/restaurants";
import {
  getUncoveredOfficialAllergenIds,
  hasIngredientIntelligence,
} from "@/lib/safety";
import type {
  AllergyReviewSummary,
  CommunityAllergyReview,
  CommunitySnapshot,
} from "@/features/community/community-service";
import { telemetry } from "@/lib/telemetry/telemetry";

type MenuItemDetailsModalProps = {
  community?: CommunitySnapshot | null;
  item: MenuItem | null;
  onComment?: (item: MenuItem) => void;
  onClose: () => void;
  onReport?: (item: MenuItem) => void;
  onViewReviews?: (item: MenuItem) => void;
  officialAllergenProfiles?: OfficialAllergenProfiles;
  restaurantId: string;
  selectedAllergyIds: string[];
};

type SourceCue = {
  kind: "inferred" | "linked" | "official" | "unavailable";
  label: string;
};

const emptyReviewSummary: AllergyReviewSummary = {
  averageRating: null,
  count: 0,
};

export function MenuItemDetailsModal({
  community,
  item,
  onComment,
  onClose,
  onReport,
  onViewReviews,
  officialAllergenProfiles,
  restaurantId,
  selectedAllergyIds,
}: MenuItemDetailsModalProps) {
  const [ingredientsVisible, setIngredientsVisible] = useState(false);
  const [presentedItem, setPresentedItem] = useState<MenuItem | null>(item);
  const navigationProgress = useSharedValue(0);
  const detailsGlassVisibility = useDerivedValue(() => 1 - navigationProgress.value);
  const displayItem = item ?? presentedItem;
  const allergenSourceCue = displayItem
    ? getAllergenSourceCue(displayItem)
    : null;
  const firstSource = displayItem?.sourceUrls?.find(isUserFacingSourceUrl);
  const canShowAllergenSourceLink = Boolean(
    allergenSourceCue?.kind === "official" || allergenSourceCue?.kind === "linked",
  );
  const allergenSourceUrl = canShowAllergenSourceLink ? firstSource : undefined;
  const displayedAllergenSourceUrl = allergenSourceUrl;
  const sourceHost = displayedAllergenSourceUrl
    ? getSourceHost(displayedAllergenSourceUrl)
    : null;
  const displayDescription = displayItem
    ? getDisplayDescription(displayItem)
    : "";
  const hasIngredients = Boolean(displayItem?.ingredientsText?.trim());
  const itemCommunity = displayItem
    ? getItemCommunity(displayItem, community?.reviews ?? [])
    : null;
  const openIngredients = () => {
    if (displayItem) {
      telemetry.track("menu_item_ingredients_opened", {
        menu_item_id: displayItem.id,
        restaurant_id: restaurantId,
        source_type: displayItem.allergenSourceType,
      });
    }
    setIngredientsVisible(true);
  };
  const openSource = (url: string) => {
    if (displayItem) {
      telemetry.track("menu_item_source_opened", {
        menu_item_id: displayItem.id,
        restaurant_id: restaurantId,
        source_type: allergenSourceCue?.kind ?? "unknown",
      });
    }
    void Linking.openURL(url);
  };

  useEffect(() => {
    if (item) {
      setPresentedItem(item);
      setIngredientsVisible(false);
    }
  }, [item]);

  useEffect(() => {
    navigationProgress.set(withTiming(ingredientsVisible ? 1 : 0, {
      duration: ingredientsVisible ? 340 : 300,
      easing: ReanimatedEasing.bezier(0.16, 1, 0.3, 1),
      reduceMotion: ReduceMotion.System,
    }));
  }, [ingredientsVisible, navigationProgress]);

  const detailsPageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      navigationProgress.value,
      [0, 0.72, 1],
      [1, 0.18, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          navigationProgress.value,
          [0, 1],
          [0, -30],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          navigationProgress.value,
          [0, 1],
          [1, 0.985],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  const ingredientsPageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          navigationProgress.value,
          [0, 1],
          [54, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Modal
      animationType="slide"
      onDismiss={() => {
        if (!item) {
          setPresentedItem(null);
        }
      }}
      onRequestClose={
        ingredientsVisible ? () => setIngredientsVisible(false) : onClose
      }
      presentationStyle="pageSheet"
      visible={Boolean(item)}
    >
      {displayItem ? (
        <View style={styles.pageContainer}>
          <Animated.View
            accessibilityElementsHidden={!ingredientsVisible}
            importantForAccessibility={
              ingredientsVisible ? "yes" : "no-hide-descendants"
            }
            pointerEvents={ingredientsVisible ? "auto" : "none"}
            style={[styles.page, ingredientsPageStyle]}
          >
            {ingredientsVisible && hasIngredients ? (
              <ModalScreen
                actionIcon={ChevronLeft}
                actionLabel="Back to menu item details"
                actionPosition="left"
                headerContent={
                  <View>
                    <Text
                      maxFontSizeMultiplier={1.08}
                      style={styles.ingredientsModalTitle}
                    >
                      Ingredients
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={styles.ingredientsModalSubtitle}
                    >
                      {displayItem.name}
                    </Text>
                  </View>
                }
                onActionPress={() => setIngredientsVisible(false)}
              >
                <ScrollView
                  contentContainerStyle={styles.ingredientsModalContent}
                  showsVerticalScrollIndicator={false}
                  style={styles.ingredientsModalScroll}
                >
                  <Text selectable style={styles.ingredientsModalBody}>
                    {displayItem.ingredientsText}
                  </Text>
                  {allergenSourceUrl ? (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => openSource(allergenSourceUrl)}
                      style={styles.ingredientsSourceLink}
                    >
                      <ExternalLink
                        color={colors.primary}
                        size={16}
                        strokeWidth={2.35}
                      />
                      <Text style={styles.ingredientsSourceLinkText}>
                        Source{sourceHost ? `: ${sourceHost}` : ""}
                      </Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              </ModalScreen>
            ) : null}
          </Animated.View>
          <Animated.View
            accessibilityElementsHidden={ingredientsVisible}
            importantForAccessibility={
              ingredientsVisible ? "no-hide-descendants" : "yes"
            }
            pointerEvents={ingredientsVisible ? "none" : "auto"}
            style={[styles.page, detailsPageStyle]}
          >
            <CollapsibleModalScreen
              actionGlassVisibilityProgress={detailsGlassVisibility}
              actionIcon={X}
              actionLabel="Close menu item details"
              contentContainerStyle={styles.content}
              footerContainerStyle={styles.feedbackFooter}
              footer={
                <View>
                  <Text style={styles.feedbackBody}>
                    Something wrong or worth sharing?
                  </Text>
                  <View style={styles.feedbackActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onReport?.(displayItem)}
                      style={styles.feedbackButton}
                    >
                      <Text style={styles.feedbackButtonText}>Report</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onComment?.(displayItem)}
                      style={styles.feedbackButtonPrimary}
                    >
                      <Text style={styles.feedbackButtonPrimaryText}>
                        Review
                      </Text>
                    </Pressable>
                  </View>
                </View>
              }
              onActionPress={onClose}
              title={displayItem.name}
            >
              <Text maxFontSizeMultiplier={1.08} style={styles.title}>
                {displayItem.name}
              </Text>

              {displayDescription ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Description</Text>
                  </View>
                  <Text selectable style={styles.descriptionText}>
                    {displayDescription}
                    {hasIngredients ? (
                      <Text
                        accessibilityRole="button"
                        onPress={openIngredients}
                        style={styles.inlineTextLink}
                      >
                        {" "}
                        View Ingredients
                      </Text>
                    ) : null}
                  </Text>
                </View>
              ) : hasIngredients ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={openIngredients}
                  style={styles.ingredientsLink}
                >
                  <Text style={styles.ingredientsLinkText}>
                    View Ingredients
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Allergen Details</Text>
                </View>
                {displayedAllergenSourceUrl && allergenSourceCue ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => openSource(displayedAllergenSourceUrl)}
                    style={[
                      styles.sourceCue,
                      allergenSourceCue.kind === "official"
                        ? styles.sourceCueOfficial
                        : styles.sourceCueInferred,
                    ]}
                  >
                    {allergenSourceCue.kind === "official" ? (
                      <ShieldCheck color={colors.primary} size={15} strokeWidth={2.45} />
                    ) : null}
                    <Text
                      style={[
                        styles.sourceCueText,
                        allergenSourceCue.kind === "official"
                          ? styles.sourceCueTextOfficial
                          : styles.sourceCueTextInferred,
                      ]}
                    >
                      Source: {sourceHost ?? allergenSourceCue.label}
                    </Text>
                    <ExternalLink
                      color={
                        allergenSourceCue.kind === "official" ? colors.primary : "#265CB9"
                      }
                      size={13}
                      strokeWidth={2.5}
                    />
                  </Pressable>
                ) : null}
                <AllergenChips
                  item={displayItem}
                  officialAllergenProfiles={officialAllergenProfiles}
                  selectedAllergyIds={selectedAllergyIds}
                />
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Community</Text>
                </View>
                <CommunityReviewPreview
                  onAddReview={() => onComment?.(displayItem)}
                  onViewMore={() => onViewReviews?.(displayItem)}
                  reviews={itemCommunity?.reviews ?? []}
                  summary={itemCommunity?.summary ?? emptyReviewSummary}
                />
              </View>

              {displayItem.notes ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Notes</Text>
                  <Text style={styles.body}>{displayItem.notes}</Text>
                </View>
              ) : null}
            </CollapsibleModalScreen>
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

function CommunityReviewPreview({
  onAddReview,
  onViewMore,
  reviews,
  summary,
}: {
  onAddReview: () => void;
  onViewMore: () => void;
  reviews: CommunityAllergyReview[];
  summary: AllergyReviewSummary;
}) {
  const topReviews = reviews.slice(0, 2);

  if (summary.count === 0) {
    return (
      <View style={styles.communityEmpty}>
        <Text style={styles.communityEmptyTitle}>No allergy reviews yet</Text>
        <Text style={styles.communityEmptyBody}>
          Be the first to share how this item worked for your allergy needs.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAddReview}
          style={styles.communityLink}
        >
          <Text style={styles.communityLinkText}>Add a review</Text>
          <ChevronRight color={colors.primary} size={14} strokeWidth={2.4} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.communityPreview}>
      <CommunityReviewSummary summary={summary} />
      <View style={styles.communityReviewList}>
        {topReviews.map((review, index) => (
          <CommunityReviewCard
            key={review.id}
            last={index === topReviews.length - 1}
            review={review}
          />
        ))}
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={onViewMore}
        style={styles.communityLink}
      >
        <Text style={styles.communityLinkText}>View all reviews</Text>
        <ChevronRight color={colors.primary} size={14} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function AllergenChips({
  item,
  officialAllergenProfiles,
  selectedAllergyIds,
}: {
  item: MenuItem;
  officialAllergenProfiles?: OfficialAllergenProfiles;
  selectedAllergyIds: string[];
}) {
  const broadCrossContact = hasBroadCrossContact(item);
  const directChips = item.allergens.map((id) => ({
    id,
    label: getAllergenLabel(id),
    tone: "direct" as const,
  }));
  const crossContactChips = (
    broadCrossContact ? [] : (item.mayContain ?? [])
  ).map((id) => ({
    id,
    label: getAllergenLabel(id),
    tone: "mayContain" as const,
  }));
  const inferredChips = (item.inferredAllergenSignals ?? []).map((signal) => ({
    id: signal.id,
    label: getAllergenLabel(signal.id),
    tone: "inferred" as const,
  }));
  const ingredientIntelligenceUsed = hasIngredientIntelligence(item);

  const uncoveredOfficialAllergenIds = getUncoveredOfficialAllergenIds(
    item,
    selectedAllergyIds,
    officialAllergenProfiles,
  );
  const hasNoOfficialAllergenCoverage =
    item.allergenSourceType === "unavailable" ||
    (!item.allergenSourceType &&
      directChips.length === 0 &&
      crossContactChips.length === 0);

  if (
    hasNoOfficialAllergenCoverage ||
    uncoveredOfficialAllergenIds.length > 0
  ) {
    return (
      <View style={styles.allergenGroups}>
        <View style={styles.allergenWrap}>
          <View style={styles.reviewChip}>
            <Text style={styles.reviewChipText}>
              Official allergen info unavailable
            </Text>
          </View>
        </View>
        {ingredientIntelligenceUsed ? (
          <IngredientIntelligenceGroup
            chips={inferredChips}
            selectedAllergyIds={selectedAllergyIds}
          />
        ) : null}
      </View>
    );
  }

  if (
    directChips.length === 0 &&
    crossContactChips.length === 0 &&
    !broadCrossContact
  ) {
    return (
      <View style={styles.allergenGroups}>
        <View style={styles.allergenWrap}>
          <View style={styles.noAllergenChip}>
            <Text style={styles.noAllergenText}>
              {selectedAllergyIds.length > 0
                ? "No selected allergens listed"
                : "No allergens listed in the official source"}
            </Text>
          </View>
        </View>
        {ingredientIntelligenceUsed ? (
          <IngredientIntelligenceGroup
            chips={inferredChips}
            selectedAllergyIds={selectedAllergyIds}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.allergenGroups}>
      {directChips.length > 0 ? (
        <AllergenChipGroup
          chips={directChips}
          label="Contains"
          selectedAllergyIds={selectedAllergyIds}
        />
      ) : null}
      {crossContactChips.length > 0 || broadCrossContact ? (
        <AllergenChipGroup
          broad={broadCrossContact}
          chips={crossContactChips}
          label="Cross-contact"
          selectedAllergyIds={selectedAllergyIds}
        />
      ) : null}
      {ingredientIntelligenceUsed ? (
        <IngredientIntelligenceGroup
          chips={inferredChips}
          selectedAllergyIds={selectedAllergyIds}
        />
      ) : null}
    </View>
  );
}

function IngredientIntelligenceGroup({
  chips,
  selectedAllergyIds,
}: {
  chips: {
    id: string;
    label: string;
    tone: "inferred";
  }[];
  selectedAllergyIds: string[];
}) {
  if (chips.length > 0) {
    return (
      <AllergenChipGroup
        chips={chips}
        label="Ingredient Intelligence:"
        selectedAllergyIds={selectedAllergyIds}
      />
    );
  }

  return (
    <View style={styles.allergenGroup}>
      <Text style={styles.allergenGroupTitle}>Ingredient Intelligence:</Text>
      <View style={styles.allergenWrap}>
        <View style={[styles.allergenChip, styles.inferredChip]}>
          <Text style={[styles.allergenChipText, styles.inferredChipText]}>
            No signals identified
          </Text>
        </View>
      </View>
    </View>
  );
}

function AllergenChipGroup({
  broad = false,
  chips,
  label,
  selectedAllergyIds,
}: {
  broad?: boolean;
  chips: {
    id: string;
    label: string;
    tone: "direct" | "inferred" | "mayContain";
  }[];
  label: string;
  selectedAllergyIds: string[];
}) {
  const selectedAllergySet = getSelectedAllergenSet(selectedAllergyIds);
  const sortedChips = [...chips].sort((left, right) => {
    const leftSelected = selectedAllergySet.has(left.id);
    const rightSelected = selectedAllergySet.has(right.id);

    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });

  return (
    <View style={styles.allergenGroup}>
      <Text style={styles.allergenGroupTitle}>{label}</Text>
      <View style={styles.allergenWrap}>
        {sortedChips.map((chip) => {
          const option = allergyOptions.find(
            (nextOption) => nextOption.id === chip.id,
          );
          const Icon = option?.Icon;
          const selected = selectedAllergySet.has(chip.id);
          const mayContain = chip.tone === "mayContain";
          const inferred = chip.tone === "inferred";

          return (
            <View
              key={`${chip.tone}-${chip.id}`}
              style={[
                styles.allergenChip,
                mayContain && styles.mayContainChip,
                inferred && styles.inferredChip,
                selected && styles.matchedChip,
              ]}
            >
              {Icon ? (
                <Icon
                  color={selected ? "#B42318" : option.accent}
                  size={15}
                  strokeWidth={2.35}
                />
              ) : null}
              <Text
                style={[
                  styles.allergenChipText,
                  mayContain && styles.mayContainText,
                  inferred && styles.inferredChipText,
                  selected && styles.matchedChipText,
                ]}
              >
                {chip.label}
              </Text>
            </View>
          );
        })}
        {broad ? (
          <View style={[styles.allergenChip, styles.mayContainChip]}>
            <Text style={[styles.allergenChipText, styles.mayContainText]}>
              Shared prep/contact risk
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function getSelectedAllergenSet(selectedAllergyIds: string[]) {
  const selected = new Set(selectedAllergyIds);

  if (selected.has("gluten")) {
    selected.add("wheat");
  }

  return selected;
}

function hasBroadCrossContact(item: MenuItem) {
  return (item.mayContain ?? []).length >= 8;
}

function getAllergenLabel(id: string) {
  return allergyOptions.find((option) => option.id === id)?.label ?? id;
}

function getDisplayDescription(item: MenuItem) {
  const description = item.description?.trim();

  if (!description || isSourceArtifactDescription(description)) {
    return "";
  }

  return description;
}

function isSourceArtifactDescription(description: string) {
  return /^official .+(nutrition calculator|allergen|ingredient).*(api|data|source)\.?$/i.test(
    description,
  );
}

function getSourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "official source";
  }
}

function isUserFacingSourceUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return !parsedUrl.pathname.toLowerCase().endsWith(".json");
  } catch {
    return false;
  }
}

function getAllergenSourceCue(item: MenuItem): SourceCue {
  switch (item.allergenSourceType) {
    case "official-allergen-menu":
      return {
        kind: "official",
        label: "Official source",
      };
    case "official-ingredients":
      return {
        kind: "official",
        label: "Official source",
      };
    case "official-product-allergen-section":
      return {
        kind: "official",
        label: "Official source",
      };
    case "official-global-cross-contact-note":
      return {
        kind: "official",
        label: "Official source",
      };
    case "restaurant-linked-menu-ingredients":
    case "restaurant-linked-product-allergen-section":
      return {
        kind: "linked",
        label: "Restaurant-linked menu",
      };
    case "unavailable":
      return hasIngredientIntelligence(item)
        ? {
            kind: "inferred",
            label: "Ingredient Intelligence",
          }
        : {
            kind: "unavailable",
            label: "No official source",
          };
    default:
      return {
        kind: "official",
        label: "Source",
      };
  }
}

function getItemCommunity(item: MenuItem, reviews: CommunityAllergyReview[]) {
  const itemNameKey = normalizeReviewMenuItemName(item.name);
  const matchedReviews = reviews
    .filter((review) => {
      if (review.menuItemId && review.menuItemId === item.id) {
        return true;
      }

      return review.menuItemName
        ? normalizeReviewMenuItemName(review.menuItemName) === itemNameKey
        : false;
    })
    .sort(sortCommunityReviewsForPreview);
  return {
    reviews: matchedReviews,
    summary: summarizeCommunityReviews(matchedReviews),
  };
}

function summarizeCommunityReviews(
  reviews: CommunityAllergyReview[],
): AllergyReviewSummary {
  const approvedReviews = reviews.filter(
    (review) => review.communityStatus === "approved",
  );

  if (approvedReviews.length === 0) {
    return emptyReviewSummary;
  }

  const total = approvedReviews.reduce((sum, review) => sum + review.rating, 0);

  return {
    averageRating: Math.round((total / approvedReviews.length) * 10) / 10,
    count: approvedReviews.length,
  };
}

function sortCommunityReviewsForPreview(
  left: CommunityAllergyReview,
  right: CommunityAllergyReview,
) {
  if (left.communityStatus !== right.communityStatus) {
    return left.communityStatus === "approved" ? -1 : 1;
  }

  if (left.rating !== right.rating) {
    return right.rating - left.rating;
  }

  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
}

function normalizeReviewMenuItemName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const styles = StyleSheet.create({
  allergenChip: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  allergenChipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  allergenGroup: {
    gap: 6,
  },
  allergenGroups: {
    gap: 12,
    marginTop: 8,
  },
  allergenGroupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  allergenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  body: {
    color: "#3C3C43",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
  },
  content: {
    gap: 18,
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: 6,
  },
  descriptionText: {
    color: "#3C3C43",
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  },
  feedbackActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  feedbackBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
  feedbackButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  feedbackButtonPrimary: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  feedbackButtonPrimaryText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
  },
  feedbackButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  feedbackFooter: {
    backgroundColor: "rgba(250,250,252,0.96)",
    borderTopColor: "rgba(60,60,67,0.12)",
    borderTopWidth: 1,
    paddingHorizontal: spacing.three,
    paddingTop: 10,
  },
  inferredChip: {
    backgroundColor: "#EEF4FF",
    borderColor: "rgba(38,92,185,0.24)",
    borderWidth: 1,
  },
  inferredChipText: {
    color: "#265CB9",
  },
  ingredientsLink: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  ingredientsLinkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
  },
  ingredientsModalBody: {
    color: "#3C3C43",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
  },
  ingredientsModalContent: {
    gap: spacing.two,
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  ingredientsModalScroll: {
    flex: 1,
  },
  ingredientsModalSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 2,
  },
  ingredientsModalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  ingredientsSourceLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  ingredientsSourceLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  inlineTextLink: {
    color: colors.primary,
    fontWeight: "800",
  },
  communityEmpty: {
    gap: 6,
    paddingTop: 2,
  },
  communityEmptyBody: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  communityEmptyTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  communityLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    paddingVertical: 4,
  },
  communityLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  communityPreview: {
    gap: 10,
  },
  communityReviewList: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(60,60,67,0.12)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  matchedChip: {
    backgroundColor: "#FFE9E7",
    borderColor: "rgba(255,59,48,0.24)",
    borderWidth: 1,
  },
  matchedChipText: {
    color: "#B42318",
  },
  mayContainChip: {
    backgroundColor: "#FFF6E5",
  },
  mayContainText: {
    color: "#B25E00",
  },
  noAllergenChip: {
    backgroundColor: "#EAF8EF",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  noAllergenText: {
    color: "#248A3D",
    fontSize: 12,
    fontWeight: "700",
  },
  page: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  pageContainer: {
    flex: 1,
    overflow: "hidden",
  },
  reviewChip: {
    backgroundColor: "#FFF6E5",
    borderColor: "rgba(255,159,10,0.28)",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewChipText: {
    color: "#B25E00",
    fontSize: 12,
    fontWeight: "700",
  },
  section: {
    gap: 9,
    paddingTop: 3,
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  sourceCue: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sourceCueInferred: {
    backgroundColor: "#EEF4FF",
  },
  sourceCueOfficial: {
    backgroundColor: colors.primaryLight,
  },
  sourceCueText: {
    fontSize: 11,
    fontWeight: "800",
  },
  sourceCueTextInferred: {
    color: "#265CB9",
  },
  sourceCueTextOfficial: {
    color: colors.primary,
  },
  sourceCueTextUnavailable: {
    color: colors.muted,
  },
  sourceCueUnavailable: {
    backgroundColor: "#F2F2F7",
  },
  title: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 28,
  },
});
