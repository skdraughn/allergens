import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { SereneLoader } from "@/components/serene-loader";
import { colors, radius } from "@/constants/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  Icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
};

export function PrimaryButton({ label, onPress, Icon, disabled, loading }: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.button, (disabled || loading) && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <SereneLoader color={colors.white} size="small" />
      ) : Icon ? (
        <Icon color={colors.white} size={20} strokeWidth={2.6} />
      ) : null}
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
