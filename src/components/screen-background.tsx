import { LinearGradient } from "expo-linear-gradient";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";

export function ScreenBackground({ children }: PropsWithChildren) {
  return (
    <LinearGradient colors={["#FFFFFF", "#FFFFFF", "#F8FAFD"]} style={styles.root}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
