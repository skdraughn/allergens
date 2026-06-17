import { StyleSheet, Text, View } from "react-native";

import { allergyOptions } from "@/constants/allergies";
import { colors } from "@/constants/theme";

type SelectedAllergenBadgesProps = {
  selectedIds: string[];
  maxVisible?: number;
};

export function SelectedAllergenBadges({
  maxVisible = 3,
  selectedIds,
}: SelectedAllergenBadgesProps) {
  const selectedOptions = allergyOptions.filter((option) => selectedIds.includes(option.id));
  const visibleOptions = selectedOptions.slice(0, maxVisible);
  const overflowCount = selectedOptions.length - visibleOptions.length;

  if (selectedOptions.length === 0) {
    return null;
  }

  return (
    <View style={styles.badges} pointerEvents="none">
      {visibleOptions.map((option, index) => {
        const Icon = option.Icon;

        return (
          <View
            key={option.id}
            style={[
              styles.badge,
              {
                backgroundColor: option.surface,
                marginLeft: index === 0 ? 0 : -7,
                zIndex: index + 1,
              },
            ]}
          >
            <Icon color={option.accent} size={18} strokeWidth={2.4} />
          </View>
        );
      })}
      {overflowCount > 0 ? (
        <View
          style={[
            styles.badge,
            styles.overflowBadge,
            { marginLeft: -7, zIndex: visibleOptions.length + 1 },
          ]}
        >
          <Text style={styles.overflowText}>+{overflowCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    borderColor: colors.white,
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  badges: {
    alignItems: "center",
    bottom: -7,
    flexDirection: "row",
    left: 0,
    position: "absolute",
  },
  overflowBadge: {
    backgroundColor: colors.primary,
  },
  overflowText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: "800",
  },
});
