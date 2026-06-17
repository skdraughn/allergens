import { Check } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

type SelectionIconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

export type SelectionOption = {
  id: string;
  label: string;
  detail: string;
  Icon: LucideIcon | ComponentType<SelectionIconProps>;
  accent: string;
  surface: string;
};

type SelectionGroupProps = {
  title: string;
  meta: string;
  hideHeader?: boolean;
  options: SelectionOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

export function SelectionGroup({
  hideHeader = false,
  title,
  meta,
  options,
  selectedIds,
  onToggle,
}: SelectionGroupProps) {
  return (
    <View style={styles.group}>
      {hideHeader ? null : (
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>{title}</Text>
          <Text style={styles.groupMeta}>{meta}</Text>
        </View>
      )}

      {options.map((option, index) => (
        <SelectionRow
          key={option.id}
          isLast={index === options.length - 1}
          onPress={() => onToggle(option.id)}
          option={option}
          selected={selectedIds.includes(option.id)}
        />
      ))}
    </View>
  );
}

type SelectionRowProps = {
  option: SelectionOption;
  selected: boolean;
  isLast: boolean;
  onPress: () => void;
};

function SelectionRow({ option, selected, isLast, onPress }: SelectionRowProps) {
  const Icon = option.Icon;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.row, !isLast && styles.rowDivider]}
    >
      <View style={[styles.symbol, { backgroundColor: option.surface }]}>
        <Icon color={option.accent} size={30} strokeWidth={2.35} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{option.label}</Text>
        <Text style={styles.rowDetail}>{option.detail}</Text>
      </View>
      <View style={[styles.selection, selected ? styles.selectionActive : styles.selectionInactive]}>
        {selected ? <Check color={colors.white} size={16} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  groupHeader: {
    alignItems: "center",
    backgroundColor: "#F7F8FA",
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.two,
    paddingVertical: 14,
  },
  groupMeta: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
  },
  groupTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    paddingHorizontal: spacing.two,
    paddingVertical: 8,
  },
  rowDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  rowDivider: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  selection: {
    alignItems: "center",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  selectionActive: {
    backgroundColor: colors.primary,
  },
  selectionInactive: {
    borderColor: "#C7C7CC",
    borderWidth: 2,
  },
  symbol: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
});
