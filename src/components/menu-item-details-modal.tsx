import {
  ExternalLink,
  X,
} from "lucide-react-native";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ModalScreen } from "@/components/modal-screen";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import type { MenuItem } from "@/data/restaurants";
import { getMenuItemSafety } from "@/lib/safety";

type MenuItemDetailsModalProps = {
  item: MenuItem | null;
  onClose: () => void;
  selectedAllergyIds: string[];
};

export function MenuItemDetailsModal({
  item,
  onClose,
  selectedAllergyIds,
}: MenuItemDetailsModalProps) {
  const safety = item ? getMenuItemSafety(item, selectedAllergyIds) : null;
  const isAvoid = safety?.status === "avoid";
  const isCaution = safety?.status === "caution";
  const tone = isAvoid ? "#FF3B30" : isCaution ? "#FF9F0A" : "#34C759";
  const statusLabel =
    safety?.status === "unknown"
      ? "Set allergies"
      : isAvoid
        ? "Avoid"
        : isCaution
          ? "Review"
          : "Looks OK";
  const firstSource = item?.sourceUrls?.[0];
  const sourceHost = firstSource ? getSourceHost(firstSource) : null;
  const allergenSourceLabel = item ? getAllergenSourceLabel(item) : null;
  const sourceTypeLabel = item?.sourceType ? getSourceTypeLabel(item.sourceType) : null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={Boolean(item)}
    >
      {item ? (
        <ModalScreen
          actionIcon={X}
          actionLabel="Close menu item details"
          headerContent={
            <>
              <Text style={styles.kicker}>{item.category}</Text>
              <Text style={styles.title}>{item.name}</Text>
            </>
          }
          onActionPress={onClose}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.heroRow}>
              <View style={styles.statusBlock}>
                <Text style={[styles.status, { color: tone }]}>{statusLabel}</Text>
                {safety && safety.matchedLabels.length > 0 ? (
                  <Text style={styles.match}>Matches {safety.matchedLabels.join(", ")}</Text>
                ) : (
                  <Text style={styles.match}>No matches in your allergy profile</Text>
                )}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.body}>{item.description}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Listed Allergens</Text>
              <AllergenChips item={item} selectedAllergyIds={selectedAllergyIds} />
            </View>

            {item.ingredientsText ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ingredients</Text>
                <Text style={styles.body}>{item.ingredientsText}</Text>
              </View>
            ) : null}

            {item.notes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.body}>{item.notes}</Text>
              </View>
            ) : null}

            <View style={styles.sourceCard}>
              <Text style={styles.sourceEyebrow}>Allergen Information Source</Text>
              <Text style={styles.sourceBody}>
                {allergenSourceLabel}
                {sourceTypeLabel ? ` · ${sourceTypeLabel}` : ""}
              </Text>
              {firstSource ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => Linking.openURL(firstSource)}
                  style={styles.sourceLink}
                >
                  <ExternalLink color={colors.primary} size={18} strokeWidth={2.35} />
                  <Text style={styles.sourceLinkText}>
                    Open{sourceHost ? ` ${sourceHost}` : " official source"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </ModalScreen>
      ) : null}
    </Modal>
  );
}

function AllergenChips({
  item,
  selectedAllergyIds,
}: {
  item: MenuItem;
  selectedAllergyIds: string[];
}) {
  const chips = [
    ...item.allergens.map((id) => ({
      id,
      label: getAllergenLabel(id),
      tone: "direct" as const,
    })),
    ...(item.mayContain ?? []).map((id) => ({
      id,
      label: `May contain ${getAllergenLabel(id)}`,
      tone: "mayContain" as const,
    })),
  ];

  if (chips.length === 0) {
    return (
      <View style={styles.allergenWrap}>
        <View style={styles.noAllergenChip}>
          <Text style={styles.noAllergenText}>No listed allergens</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.allergenWrap}>
      {chips.map((chip) => {
        const selected = selectedAllergyIds.includes(chip.id);
        const mayContain = chip.tone === "mayContain";

        return (
          <View
            key={`${chip.tone}-${chip.id}`}
            style={[
              styles.allergenChip,
              mayContain && styles.mayContainChip,
              selected && styles.matchedChip,
            ]}
          >
            <Text
              style={[
                styles.allergenChipText,
                mayContain && styles.mayContainText,
                selected && styles.matchedChipText,
              ]}
            >
              {chip.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function getAllergenLabel(id: string) {
  return allergyOptions.find((option) => option.id === id)?.label ?? id;
}

function getSourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "official source";
  }
}

function getAllergenSourceLabel(item: MenuItem) {
  switch (item.allergenSourceType) {
    case "official-allergen-menu":
      return "Allergens are from the restaurant's official allergen guide.";
    case "official-ingredients":
      return "Allergens are from the restaurant's official ingredient information.";
    case "official-product-allergen-section":
      return "Allergens are from the restaurant's official product allergen section.";
    case "unavailable":
      return "Official allergen information was not available for this item.";
    default:
      return "Allergens are from the restaurant source listed below.";
  }
}

function getSourceTypeLabel(sourceType: string) {
  const sourceTypeLabels: Record<string, string> = {
    "html-allergen-matrix": "Official allergen table",
    "official-api": "Official restaurant API",
    "pdf-ingredients": "Official ingredient PDF",
    "pdf-matrix": "Official PDF guide",
    "product-page": "Official product page",
  };

  return sourceTypeLabels[sourceType] ?? sourceType.replaceAll("-", " ");
}

const styles = StyleSheet.create({
  allergenChip: {
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  allergenChipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  allergenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  body: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 25,
  },
  content: {
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.three,
  },
  heroRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: spacing.two,
    padding: spacing.two,
  },
  kicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 5,
    marginTop: 2,
  },
  match: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
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
  section: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: spacing.two,
    padding: spacing.two,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  sourceBody: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 5,
  },
  sourceCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: spacing.two,
    padding: spacing.two,
  },
  sourceEyebrow: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  sourceLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sourceLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  status: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusBlock: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
});
