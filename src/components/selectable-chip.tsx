import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors, radius } from "@/constants/theme";

type SelectableChipProps = {
  accessibilityRole?: "button" | "checkbox" | "radio";
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SelectableChip({
  accessibilityRole = "button",
  label,
  onPress,
  selected,
  style,
}: SelectableChipProps) {
  const interaction = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    interaction.set(withTiming(selected ? 1 : 0, { duration: 180 }));
  }, [interaction, selected]);
  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      interaction.value,
      [0, 1],
      [colors.white, colors.primaryLight],
    ),
    borderColor: interpolateColor(
      interaction.value,
      [0, 1],
      [colors.line, colors.primary],
    ),
    transform: [{ scale: interpolate(interaction.value, [0, 0.48, 1], [1, 0.965, 1]) }],
  }));

  const handlePress = () => {
    interaction.set(withTiming(selected ? 0 : 1, { duration: 180 }));
    void Haptics.selectionAsync();
    onPress();
  };

  return (
    <Animated.View style={[styles.chip, animatedStyle, style]}>
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityState={{ checked: selected }}
        onPress={handlePress}
        style={styles.pressable}
      >
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  labelSelected: {
    color: colors.primary,
  },
  pressable: {
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
});
