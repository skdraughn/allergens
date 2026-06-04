import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";

import { colors } from "@/constants/theme";

type IconButtonProps = {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
};

export function IconButton({ Icon, label, onPress }: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}
    >
      <Icon color={colors.primary} size={22} strokeWidth={2.3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#F5F5F7",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
});
