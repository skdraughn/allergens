import type { PropsWithChildren, ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "@/components/screen-background";
import { spacing } from "@/constants/theme";

export function DetailPageShell({ children }: PropsWithChildren) {
  return (
    <ScreenBackground>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        {children}
      </SafeAreaView>
    </ScreenBackground>
  );
}

export function DetailPageTopBar({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.topBar, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    paddingBottom: spacing.one,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
  },
});
