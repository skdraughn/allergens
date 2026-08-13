import { HeartPulse } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { AllergyReviewSummary } from "@/features/community/community-service";

type CommunityReviewSummaryProps = {
  summary: AllergyReviewSummary;
};

export function CommunityReviewSummary({ summary }: CommunityReviewSummaryProps) {
  if (summary.count === 0 || summary.averageRating === null) {
    return <Text style={styles.emptyText}>No allergy ratings yet</Text>;
  }

  const averageRating = summary.averageRating;

  return (
    <View
      accessibilityLabel={`${averageRating.toFixed(1)} from ${summary.count} review${summary.count === 1 ? "" : "s"}`}
      accessible
      style={styles.bar}
    >
      <HeartPulse
        color={colors.coral}
        fill="#FF3B5F"
        size={17}
        strokeWidth={2.4}
      />
      <Text style={styles.score}>{averageRating.toFixed(1)}</Text>
      <Text style={styles.reviewCount}>
        ({summary.count} review{summary.count === 1 ? "" : "s"})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 24,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 2,
  },
  reviewCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    lineHeight: 19,
  },
  score: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    lineHeight: 20,
  },
});
