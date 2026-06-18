import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { allergyOptions, normalizeAllergyIds } from "@/constants/allergies";
import { colors } from "@/constants/theme";

type AllergyIconChipsProps = {
  allergyIds: string[];
  crossContact?: boolean;
  compact?: boolean;
  emptyLabel?: string | null;
  highlightedIds?: string[] | "all";
  labelPrefix?: string;
  maxVisible?: number;
  overlap?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function AllergyIconChips({
  allergyIds,
  crossContact = false,
  compact = false,
  emptyLabel = "No allergies",
  highlightedIds = [],
  labelPrefix,
  maxVisible = compact ? 5 : 7,
  overlap = false,
  size,
  style,
}: AllergyIconChipsProps) {
  const normalizedIds = normalizeAllergyIds(allergyIds);
  const normalizedHighlightedIds =
    highlightedIds === "all" ? "all" : normalizeAllergyIds(highlightedIds);
  const selectedOptions = allergyOptions.filter((option) => normalizedIds.includes(option.id));
  const visibleOptions = selectedOptions.slice(0, maxVisible);
  const overflowCount = selectedOptions.length - visibleOptions.length;

  if (selectedOptions.length === 0) {
    return emptyLabel ? <Text style={styles.emptyText}>{emptyLabel}</Text> : null;
  }

  const chipSize = size ?? (compact ? 24 : 30);
  const iconSize = Math.round(chipSize * 0.73);

  return (
    <View style={[styles.row, overlap ? styles.overlapRow : null, style]}>
      {visibleOptions.map((option, index) => {
        const Icon = option.Icon;
        const highlighted =
          normalizedHighlightedIds === "all" || normalizedHighlightedIds.includes(option.id);

        return (
          <View
            accessibilityLabel={`${labelPrefix ? `${labelPrefix} ` : ""}${option.label}`}
            key={option.id}
            style={[
              styles.chip,
              {
                backgroundColor: option.surface,
                height: chipSize,
                width: chipSize,
              },
              overlap && index > 0 ? styles.overlapChip : null,
              overlap ? { zIndex: index + 1 } : null,
              crossContact ? styles.crossContactChip : null,
              highlighted ? styles.selectedChip : null,
            ]}
          >
            <Icon
              color={highlighted ? "#B42318" : option.accent}
              size={iconSize}
              strokeWidth={2.4}
            />
          </View>
        );
      })}
      {overflowCount > 0 ? (
        <View
          style={[
            styles.chip,
            styles.overflowChip,
            {
              height: chipSize,
              zIndex: visibleOptions.length + 1,
              width: chipSize,
            },
            overlap && visibleOptions.length > 0 ? styles.overlapChip : null,
          ]}
        >
          <Text style={styles.overflowText}>+{overflowCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderRadius: 15,
    justifyContent: "center",
  },
  crossContactChip: {
    borderColor: "rgba(178,94,0,0.24)",
    borderWidth: 1,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 5,
  },
  overflowChip: {
    backgroundColor: colors.primary,
  },
  overflowText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "900",
  },
  overlapChip: {
    marginLeft: -7,
  },
  overlapRow: {
    gap: 0,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 7,
  },
  selectedChip: {
    backgroundColor: "#FFE9E7",
    borderColor: "rgba(255,59,48,0.25)",
    borderWidth: 1,
  },
});
