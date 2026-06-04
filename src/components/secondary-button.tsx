import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@/constants/theme";

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
};

export function SecondaryButton({ label, onPress }: SecondaryButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 54,
  },
  label: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "600",
  },
});
