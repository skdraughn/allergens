import { Plus, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/constants/theme";
import { IconButtonSurface } from "@/components/icon-button";

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
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
      ]}
    >
      <IconButtonSurface />
      <Icon color={colors.primary} size={16} strokeWidth={2.45} />
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </Pressable>
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
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44,
    overflow: "hidden",
    paddingHorizontal: 17,
    shadowColor: "#000000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.055,
    shadowRadius: 8,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
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
