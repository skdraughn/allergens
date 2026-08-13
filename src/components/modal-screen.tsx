import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";

import { ModalIconButton } from "./modal-icon-button";
import { ScreenBackground } from "./screen-background";
import { SnackbarViewport } from "./snackbar-provider";

type ModalScreenProps = {
  children: ReactNode;
  actionIcon: LucideIcon;
  actionLabel: string;
  onActionPress: () => void;
  headerContent?: ReactNode;
  actionPosition?: "left" | "right";
  actionGlassVisibilityProgress?: SharedValue<number>;
  includeBottomInset?: boolean;
};

export function ModalScreen({
  actionIcon,
  actionGlassVisibilityProgress,
  actionLabel,
  actionPosition = "right",
  children,
  headerContent,
  includeBottomInset = true,
  onActionPress,
}: ModalScreenProps) {
  const insets = useSafeAreaInsets();
  const actionButton = (
    <ModalIconButton
      glassVisibilityProgress={actionGlassVisibilityProgress}
      Icon={actionIcon}
      label={actionLabel}
      onPress={onActionPress}
    />
  );

  return (
    <ScreenBackground>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
        <View style={styles.nav}>
          {actionPosition === "left" ? actionButton : null}
          {headerContent ? <View style={styles.headerContent}>{headerContent}</View> : <View />}
          {actionPosition === "right" ? actionButton : <View style={styles.spacer} />}
        </View>
        <View
          style={[
            styles.content,
            includeBottomInset && { paddingBottom: insets.bottom },
          ]}
        >
          {children}
        </View>
        <SnackbarViewport insideSafeArea />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  headerContent: {
    flex: 1,
    paddingRight: spacing.two,
  },
  nav: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.two,
    justifyContent: "space-between",
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.four,
  },
  screen: {
    flex: 1,
  },
  spacer: {
    height: 48,
    width: 48,
  },
});
