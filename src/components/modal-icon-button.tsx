import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { NativeGlassIconButton } from "@/components/native-glass-icon-button";
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
    <NativeGlassIconButton
      contentStyle={styles.buttonContent}
      glassVisibilityProgress={glassVisibilityProgress}
      Icon={Icon}
      iconColor={colors.primary}
      label={label}
      onPress={onPress}
      strokeWidth={2.4}
      style={[styles.button, style]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  buttonContent: {
    height: 48,
    width: 48,
  },
});
