import { Ban, Ellipsis, Flag, HeartPulse } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ActionBottomSheetModal } from "@/components/action-bottom-sheet-modal";
import { useSnackbar } from "@/components/snackbar-provider";
import { colors, radius, spacing } from "@/constants/theme";
import {
  blockCommunityReviewer,
  reportCommunityReview,
  type CommunityAllergyReview,
} from "@/features/community/community-service";
import { telemetry } from "@/lib/telemetry/telemetry";

type CommunityReviewCardProps = {
  last: boolean;
  restaurantName?: string;
  review: CommunityAllergyReview;
};

export function CommunityReviewCard({
  last,
  restaurantName,
  review,
}: CommunityReviewCardProps) {
  const { showSnackbar } = useSnackbar();
  const [actionsVisible, setActionsVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const canModerate = review.communityStatus === "approved" && !review.isOwn;

  if (hidden) {
    return null;
  }

  const reportReview = () => {
    setActionsVisible(false);
    Alert.alert(
      "Report this review?",
      "Our moderation team will check it for abusive, offensive, or unsafe content.",
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Report",
          onPress: () => {
            setSubmitting(true);
            void reportCommunityReview(review)
              .then(() => {
                telemetry.track("report_submitted", {
                  outcome: "queued",
                  restaurant_id: review.restaurantId,
                  scope: "community_review",
                });
                showSnackbar({
                  message: "Thanks. Our moderation team will review it.",
                  title: "Review Reported",
                  tone: "success",
                });
              })
              .catch((error) => {
                showSnackbar({
                  message: error instanceof Error ? error.message : "The review could not be reported.",
                  title: "Report Failed",
                  tone: "error",
                });
              })
              .finally(() => setSubmitting(false));
          },
        },
      ],
    );
  };

  const blockReviewer = () => {
    setActionsVisible(false);
    Alert.alert(
      "Block this reviewer?",
      "Their reviews will no longer appear for you. They will not be notified.",
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Block",
          onPress: () => {
            setSubmitting(true);
            void blockCommunityReviewer(review)
              .then(() => {
                telemetry.track("user_blocked", {
                  outcome: "success",
                  scope: "community_reviewer",
                });
                setHidden(true);
                showSnackbar({
                  message: "This reviewer’s content is now hidden.",
                  title: "Reviewer Blocked",
                  tone: "success",
                });
              })
              .catch((error) => {
                showSnackbar({
                  message: error instanceof Error ? error.message : "The reviewer could not be blocked.",
                  title: "Block Failed",
                  tone: "error",
                });
              })
              .finally(() => setSubmitting(false));
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.card, !last && styles.divider]}>
      <ActionBottomSheetModal
        actions={[
          { Icon: Flag, label: "Report review", onPress: reportReview },
          ...(review.createdBy
            ? [{ Icon: Ban, label: "Block reviewer", onPress: blockReviewer }]
            : []),
        ]}
        closeLabel="Cancel"
        onClose={() => setActionsVisible(false)}
        visible={actionsVisible}
      />
      <View style={styles.header}>
        <View style={styles.ratingCluster}>
          <View style={styles.ratingIcon}>
            <HeartPulse
              color={colors.coral}
              fill="#FF3B5F"
              size={15}
              strokeWidth={2.5}
            />
          </View>
          <Text style={styles.ratingValue}>{review.rating.toFixed(1)}</Text>
        </View>
        <View style={styles.headerTrailing}>
          {review.communityStatus === "pending" ? (
            <Text style={styles.pendingBadge}>Pending review</Text>
          ) : null}
          {canModerate ? (
            <Pressable
              accessibilityLabel="Review options"
              accessibilityRole="button"
              disabled={submitting}
              hitSlop={10}
              onPress={() => setActionsVisible(true)}
              style={({ pressed }) => [styles.moreButton, pressed && styles.moreButtonPressed]}
            >
              <Ellipsis color={colors.muted} size={19} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {restaurantName ? (
        <Text numberOfLines={1} style={styles.restaurantName}>
          {restaurantName}
        </Text>
      ) : null}
      {review.menuItemName ? (
        <Text numberOfLines={1} style={styles.menuItemLabel}>
          {review.menuItemName}
        </Text>
      ) : null}
      {review.body ? <Text style={styles.body}>{review.body}</Text> : null}
      {review.allergyContext || review.createdAt ? (
        <View style={styles.footerRow}>
          {review.allergyContext ? (
            <View style={styles.allergyPill}>
              <Text numberOfLines={1} style={styles.meta}>
                {review.allergyContext.replace("Relevant allergies: ", "")}
              </Text>
            </View>
          ) : (
            <View />
          )}
          {review.createdAt ? (
            <Text style={styles.date}>{formatDate(review.createdAt)}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  allergyPill: {
    alignSelf: "flex-start",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  body: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  card: {
    gap: 10,
    marginLeft: spacing.two,
    paddingRight: spacing.two,
    paddingVertical: 17,
  },
  date: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    marginLeft: spacing.one,
  },
  divider: {
    borderBottomColor: "rgba(60,60,67,0.13)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerTrailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  menuItemLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  meta: {
    color: "#5F6470",
    fontSize: 11,
    fontWeight: "800",
  },
  moreButton: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  moreButtonPressed: {
    backgroundColor: "rgba(60,60,67,0.08)",
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
  ratingCluster: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  ratingIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0F3",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  ratingValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  restaurantName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
});
