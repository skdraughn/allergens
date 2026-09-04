import { Plus, type LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/constants/theme";
import { LiquidGlassPressable } from "@/components/liquid-glass-pressable";

type RestaurantRequestButtonProps = {
  label?: string;
  onPress: () => void;
};

type FloatingPillButtonProps = RestaurantRequestButtonProps & {
  Icon?: LucideIcon;
};

export function FloatingPillButton({
  Icon = Plus,
  label = "Continue",
  onPress,
}: FloatingPillButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.floatingWrap,
        { bottom: Math.max(insets.bottom + 12, spacing.three) },
      ]}
    >
      <PillButton Icon={Icon} label={label} onPress={onPress} />
    </View>
  );
}

export function RestaurantRequestButton({
  label = "Request a restaurant",
  onPress,
}: RestaurantRequestButtonProps) {
  return <PillButton Icon={Plus} label={label} onPress={onPress} />;
}

function PillButton({ Icon, label, onPress }: Required<FloatingPillButtonProps>) {
  return (
    <LiquidGlassPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      containerStyle={styles.button}
      contentStyle={styles.buttonContent}
      onPress={onPress}
    >
      <Icon color={colors.primary} size={16} strokeWidth={2.45} />
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </LiquidGlassPressable>
  );
}

export function FloatingRestaurantRequestButton({
  label = "Missing a restaurant? Request it",
  onPress,
}: RestaurantRequestButtonProps) {
  return <FloatingPillButton label={label} onPress={onPress} />;
}

const styles = StyleSheet.create({
  button: {
    borderCurve: "continuous",
    borderRadius: radius.pill,
    shadowColor: "#000000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.055,
    shadowRadius: 8,
  },
  buttonContent: {
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 17,
  },
  floatingWrap: {
    alignItems: "center",
    left: spacing.three,
    position: "absolute",
    right: spacing.three,
  },
  label: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.15,
    lineHeight: 20,
  },
});
