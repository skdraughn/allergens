import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants/theme";

type AuthActionButtonProps = {
  label: string;
  onPress: () => void;
  leading: ReactNode;
  variant?: "neutral" | "primarySoft";
};

export function AuthActionButton({
  label,
  leading,
  onPress,
  variant = "neutral",
}: AuthActionButtonProps) {
  const primarySoft = variant === "primarySoft";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, primarySoft ? styles.buttonPrimarySoft : styles.buttonNeutral]}
    >
      <View style={styles.leading}>{leading}</View>
      <Text style={[styles.label, primarySoft && styles.labelPrimary]}>{label}</Text>
    </Pressable>
  );
}

type AuthActionIconBadgeProps = {
  children: ReactNode;
  variant?: "neutral" | "primarySoft";
};

export function AuthActionIconBadge({
  children,
  variant = "neutral",
}: AuthActionIconBadgeProps) {
  return (
    <View style={[styles.badge, variant === "primarySoft" && styles.badgePrimarySoft]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  badgePrimarySoft: {
    backgroundColor: "rgba(0,122,255,0.1)",
  },
  button: {
    alignItems: "center",
    borderRadius: 24,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.two,
    position: "relative",
  },
  buttonNeutral: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
  },
  buttonPrimarySoft: {
    backgroundColor: colors.primaryLight,
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  labelPrimary: {
    color: colors.primary,
    fontWeight: "800",
  },
  leading: {
    left: spacing.two,
    position: "absolute",
  },
});
