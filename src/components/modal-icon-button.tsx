import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { IconButtonSurface } from "@/components/icon-button";
import { colors } from "@/constants/theme";

type ModalIconButtonProps = {
  glassVisibilityProgress?: SharedValue<number>;
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ModalIconButton({
  glassVisibilityProgress,
  Icon,
  label,
  onPress,
  style,
}: ModalIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, style, pressed && styles.buttonPressed]}
    >
      <IconButtonSurface visibilityProgress={glassVisibilityProgress} />
      <Icon color={colors.primary} size={22} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
    width: 48,
  },
  buttonPressed: {
    transform: [{ scale: 0.94 }],
  },
});
