import {
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CollapsibleModalScreen } from "@/components/collapsible-modal-screen";
import { ModalScreen } from "@/components/modal-screen";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import type { MenuItem } from "@/data/restaurants";
import type {
  AllergyReviewSummary,
  CommunityAllergyReview,
  CommunitySnapshot,
} from "@/features/community/community-service";

type MenuItemDetailsModalProps = {
  community?: CommunitySnapshot | null;
  item: MenuItem | null;
  onComment?: (item: MenuItem) => void;
  onClose: () => void;
  onReport?: (item: MenuItem) => void;
  onViewReviews?: (item: MenuItem) => void;
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
  selectedAllergyIds,
}: MenuItemDetailsModalProps) {
  const [ingredientsVisible, setIngredientsVisible] = useState(false);
  const firstSource = item?.sourceUrls?.[0];
  const sourceHost = firstSource ? getSourceHost(firstSource) : null;
  const allergenSourceCue = item ? getAllergenSourceCue(item) : null;
  const displayDescription = item ? getDisplayDescription(item) : "";
  const hasIngredients = Boolean(item?.ingredientsText?.trim());
  const itemCommunity = item ? getItemCommunity(item, community?.reviews ?? []) : null;

  useEffect(() => {
    if (!item) {
      setIngredientsVisible(false);
    }
  }, [item]);

  return (
    <>
      <Modal
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle="pageSheet"
        visible={Boolean(item)}
      >
        {item ? (
          <CollapsibleModalScreen
            actionIcon={X}
            actionLabel="Close menu item details"
            contentContainerStyle={styles.content}
            footer={
              <View style={styles.feedbackFooter}>
                <Text style={styles.feedbackBody}>Something wrong or worth sharing?</Text>
                <View style={styles.feedbackActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onReport?.(item)}
                    style={styles.feedbackButton}
                  >
                    <Text style={styles.feedbackButtonText}>Report</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onComment?.(item)}
                    style={styles.feedbackButtonPrimary}
                  >
                    <Text style={styles.feedbackButtonPrimaryText}>Review</Text>
                  </Pressable>
                </View>
              </View>
            }
            onActionPress={onClose}
            title={item.name}
          >
            <Text maxFontSizeMultiplier={1.08} style={styles.title}>
              {item.name}
            </Text>

            {displayDescription ? (
              <Text style={styles.descriptionText}>
                {displayDescription}
                {hasIngredients ? (
                  <Text
                    accessibilityRole="button"
                    onPress={() => setIngredientsVisible(true)}
                    style={styles.inlineTextLink}
                  >
                    {" "}
                    View Ingredients
                  </Text>
                ) : null}
              </Text>
            ) : hasIngredients ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIngredientsVisible(true)}
                style={styles.ingredientsLink}
              >
                <Text style={styles.ingredientsLinkText}>View Ingredients</Text>
              </Pressable>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Allergen Details</Text>
                {allergenSourceCue ? (
                  <Pressable
                    accessibilityRole={firstSource ? "link" : undefined}
                    disabled={!firstSource}
                    onPress={firstSource ? () => Linking.openURL(firstSource) : undefined}
                    style={[
                      styles.sourceCue,
                      allergenSourceCue.kind === "official" && styles.sourceCueOfficial,
                      (allergenSourceCue.kind === "inferred" ||
                        allergenSourceCue.kind === "linked") &&
                        styles.sourceCueInferred,
                      allergenSourceCue.kind === "unavailable" && styles.sourceCueUnavailable,
                    ]}
                  >
                    {allergenSourceCue.kind === "official" ? (
                      <ShieldCheck color={colors.primary} size={13} strokeWidth={2.45} />
                    ) : null}
                    <Text
                      style={[
                        styles.sourceCueText,
                        allergenSourceCue.kind === "official" && styles.sourceCueTextOfficial,
                        (allergenSourceCue.kind === "inferred" ||
                          allergenSourceCue.kind === "linked") &&
                          styles.sourceCueTextInferred,
                        allergenSourceCue.kind === "unavailable" && styles.sourceCueTextUnavailable,
                      ]}
                    >
                      {allergenSourceCue.label}
                    </Text>
                    {firstSource ? (
                      <ExternalLink
                        color={
                          allergenSourceCue.kind === "official" ? colors.primary : "#265CB9"
                        }
                        size={12}
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </Pressable>
                ) : null}
              </View>
              <AllergenChips item={item} selectedAllergyIds={selectedAllergyIds} />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Community</Text>
              </View>
              <CommunityReviewPreview
                onAddReview={() => onComment?.(item)}
                onViewMore={() => onViewReviews?.(item)}
                reviews={itemCommunity?.reviews ?? []}
                summary={itemCommunity?.summary ?? emptyReviewSummary}
              />
            </View>

            {item.notes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.body}>{item.notes}</Text>
              </View>
            ) : null}
          </CollapsibleModalScreen>
        ) : null}
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setIngredientsVisible(false)}
        presentationStyle="pageSheet"
        visible={ingredientsVisible && hasIngredients}
      >
        {item ? (
          <ModalScreen
            actionIcon={X}
            actionLabel="Close ingredients"
            headerContent={
              <View>
                <Text maxFontSizeMultiplier={1.08} style={styles.ingredientsModalTitle}>
                  Ingredients
                </Text>
                <Text numberOfLines={1} style={styles.ingredientsModalSubtitle}>
                  {item.name}
                </Text>
              </View>
            }
            onActionPress={() => setIngredientsVisible(false)}
          >
            <ScrollView
              contentContainerStyle={styles.ingredientsModalContent}
              showsVerticalScrollIndicator={false}
            >
              <Text selectable style={styles.ingredientsModalBody}>
                {item.ingredientsText}
              </Text>
              {firstSource ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(firstSource)}
                  style={styles.ingredientsSourceLink}
                >
                  <ExternalLink color={colors.primary} size={16} strokeWidth={2.35} />
                  <Text style={styles.ingredientsSourceLinkText}>
                    Source{sourceHost ? `: ${sourceHost}` : ""}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </ModalScreen>
        ) : null}
      </Modal>
    </>
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
        <Pressable accessibilityRole="button" onPress={onAddReview} style={styles.communityLink}>
          <Text style={styles.communityLinkText}>Add a review</Text>
          <ChevronRight color={colors.primary} size={14} strokeWidth={2.4} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.communityPreview}>
      <View style={styles.communitySummaryRow}>
        <CommunityRatingDisplay rating={summary.averageRating ?? 0} />
        <Text style={styles.communitySummaryText}>
          {formatReviewSummary(summary)}
        </Text>
      </View>
      {topReviews.map((review) => (
        <View key={review.id} style={styles.communityReview}>
          <View style={styles.communityReviewHeader}>
            <CommunityRatingDisplay rating={review.rating} size={13} />
            {review.communityStatus === "pending" ? (
              <Text style={styles.pendingBadge}>Pending</Text>
            ) : null}
          </View>
          <Text numberOfLines={2} style={styles.communityReviewBody}>
            {review.body}
          </Text>
          {review.allergyContext ? (
            <Text numberOfLines={1} style={styles.communityReviewMeta}>
              {review.allergyContext}
            </Text>
          ) : null}
        </View>
      ))}
      <Pressable accessibilityRole="link" onPress={onViewMore} style={styles.communityLink}>
        <Text style={styles.communityLinkText}>View all reviews</Text>
        <ChevronRight color={colors.primary} size={14} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function CommunityRatingDisplay({
  rating,
  size = 15,
}: {
  rating: number;
  size?: number;
}) {
  const roundedRating = Math.round(rating);

  return (
    <View style={styles.communityRating}>
      {[1, 2, 3, 4, 5].map((value) => (
        <ShieldCheck
          color={value <= roundedRating ? colors.primary : "#C7C7CC"}
          key={value}
          size={size}
          strokeWidth={2.45}
        />
      ))}
    </View>
  );
}

function AllergenChips({
  item,
  selectedAllergyIds,
}: {
  item: MenuItem;
  selectedAllergyIds: string[];
}) {
  const broadCrossContact = hasBroadCrossContact(item);
  const directChips = item.allergens.map((id) => ({
      id,
      label: getAllergenLabel(id),
      tone: "direct" as const,
  }));
  const crossContactChips = (broadCrossContact ? [] : (item.mayContain ?? [])).map((id) => ({
      id,
      label: getAllergenLabel(id),
      tone: "mayContain" as const,
  }));
  const inferredChips = (item.inferredAllergenSignals ?? []).map((signal) => ({
      id: signal.id,
      label: getAllergenLabel(signal.id),
      tone: "inferred" as const,
  }));

  if (item.allergenSourceType === "unavailable") {
    return (
      <View style={styles.allergenGroups}>
        <View style={styles.allergenWrap}>
          <View style={styles.reviewChip}>
            <Text style={styles.reviewChipText}>Official allergen info unavailable</Text>
          </View>
        </View>
        {inferredChips.length > 0 ? (
          <AllergenChipGroup
            chips={inferredChips}
            label="Ingredient Intelligence"
            selectedAllergyIds={selectedAllergyIds}
          />
        ) : null}
      </View>
    );
  }

  if (directChips.length === 0 && crossContactChips.length === 0 && !broadCrossContact) {
    return (
      <View style={styles.allergenWrap}>
        <View style={styles.noAllergenChip}>
          <Text style={styles.noAllergenText}>No common allergens</Text>
        </View>
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
  chips: { id: string; label: string; tone: "direct" | "inferred" | "mayContain" }[];
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
          const option = allergyOptions.find((nextOption) => nextOption.id === chip.id);
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
      return item.inferredAllergenSignals?.length
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

function summarizeCommunityReviews(reviews: CommunityAllergyReview[]): AllergyReviewSummary {
  const approvedReviews = reviews.filter((review) => review.communityStatus === "approved");

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

function formatReviewSummary(summary: AllergyReviewSummary) {
  if (summary.count === 0 || summary.averageRating === null) {
    return "No allergy reviews yet";
  }

  return `${summary.averageRating.toFixed(1)} from ${summary.count} review${
    summary.count === 1 ? "" : "s"
  }`;
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
    paddingBottom: spacing.two,
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
  communityRating: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  communityReview: {
    borderTopColor: "rgba(60,60,67,0.1)",
    borderTopWidth: 1,
    gap: 5,
    paddingTop: 10,
  },
  communityReviewBody: {
    color: "#3C3C43",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  communityReviewHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  communityReviewMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  communitySummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  communitySummaryText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
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
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  pendingBadge: {
    backgroundColor: "#FFF6E5",
    borderRadius: radius.pill,
    color: "#B25E00",
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  title: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 28,
  },
});
