import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@/constants/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  Icon?: LucideIcon;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, Icon, disabled }: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
      {Icon ? <Icon color={colors.white} size={20} strokeWidth={2.6} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
});
