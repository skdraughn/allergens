import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";

import { colors } from "@/constants/theme";

type ModalIconButtonProps = {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
};

export function ModalIconButton({ Icon, label, onPress }: ModalIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}
    >
      <Icon color={colors.primary} size={22} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
});
