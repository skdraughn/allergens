import { ExternalLink, ShieldAlert } from "lucide-react-native";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants/theme";
import type { AllergyAccommodationPolicy } from "@/data/restaurants";

export function RestaurantAccommodationDetails({
  policy,
}: {
  policy: AllergyAccommodationPolicy;
}) {
  const tone = getAccommodationPolicyTone(policy.status);
  const publicSourceUrl = getPublicAccommodationSourceUrl(policy.sourceUrl);
  const details = [
    policy.advanceNotice
      ? { label: "Notice requested", value: policy.advanceNotice }
      : null,
    policy.supported?.length
      ? { label: "Restaurant says it can support", value: policy.supported.join(", ") }
      : null,
    policy.notSupported?.length
      ? { label: "Restaurant says it may not support", value: policy.notSupported.join(", ") }
      : null,
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail));

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>Allergy accommodations</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
          <Text style={[styles.status, { color: tone.color }]}>{tone.label}</Text>
        </View>
      </View>

      <Text style={styles.summary}>{policy.summary}</Text>

      {details.length > 0 || publicSourceUrl ? (
        <View style={styles.group}>
          {details.map((detail, index) => (
            <View key={detail.label}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{detail.label}</Text>
                <Text style={styles.detailValue}>{detail.value}</Text>
              </View>
            </View>
          ))}

          {publicSourceUrl ? (
            <>
              {details.length > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(publicSourceUrl)}
                style={({ pressed }) => [
                  styles.sourceRow,
                  pressed && styles.sourceRowPressed,
                ]}
              >
                <View style={styles.sourceText}>
                  <Text style={styles.sourceLabel}>{policy.sourceLabel}</Text>
                  <Text style={styles.sourceType}>
                    {formatSourceType(policy.sourceType)}
                  </Text>
                </View>
                <ExternalLink color={colors.primary} size={17} strokeWidth={2.25} />
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footnote}>
        <ShieldAlert color={colors.muted} size={16} strokeWidth={2.1} />
        <Text style={styles.footnoteText}>
          No item-by-item allergen menu is available. Confirm accommodations directly before
          booking or ordering.
        </Text>
      </View>
    </View>
  );
}

function getAccommodationPolicyTone(status: AllergyAccommodationPolicy["status"]) {
  if (status === "can-accommodate") {
    return { color: "#248A3D", label: "Can discuss allergies" };
  }

  if (status === "partial-accommodation") {
    return { color: "#A05A00", label: "Limited accommodations" };
  }

  if (status === "cannot-accommodate") {
    return { color: "#D70015", label: "Cannot accommodate" };
  }

  return { color: colors.muted, label: "No published policy" };
}

function formatSourceType(sourceType: AllergyAccommodationPolicy["sourceType"]) {
  if (sourceType === "official-site") return "Restaurant website";
  if (sourceType === "official-booking") return "Booking page";
  if (sourceType === "manual-review") return "Reviewed source";
  return "Community lead";
}

export function getPublicAccommodationSourceUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.toLowerCase();

    // OpenTable restaurant routes frequently bounce, block embedded traffic, or
    // resolve differently by locale. Keep them as internal audit evidence, not
    // as customer-facing policy links.
    if (hostname === "opentable.com" || hostname.endsWith(".opentable.com")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    gap: spacing.two,
    paddingBottom: spacing.three,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  detailRow: {
    gap: 4,
    paddingHorizontal: spacing.two,
    paddingVertical: 13,
  },
  detailValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.two,
  },
  footnote: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2,
  },
  footnoteText: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  group: {
    backgroundColor: "#F5F5F7",
    borderCurve: "continuous",
    borderRadius: 16,
    overflow: "hidden",
  },
  heading: {
    gap: 5,
  },
  sourceLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  sourceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 54,
    paddingHorizontal: spacing.two,
    paddingVertical: 10,
  },
  sourceRowPressed: {
    backgroundColor: "rgba(60,60,67,0.08)",
  },
  sourceText: {
    flex: 1,
    gap: 1,
  },
  sourceType: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  status: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  statusDot: {
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  summary: {
    color: "#3C3C43",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 23,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.35,
    lineHeight: 27,
  },
});
