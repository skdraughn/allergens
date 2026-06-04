import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";

import { ModalIconButton } from "./modal-icon-button";
import { ScreenBackground } from "./screen-background";

type ModalScreenProps = {
  children: ReactNode;
  actionIcon: LucideIcon;
  actionLabel: string;
  onActionPress: () => void;
  headerContent?: ReactNode;
  actionPosition?: "left" | "right";
};

export function ModalScreen({
  actionIcon,
  actionLabel,
  actionPosition = "right",
  children,
  headerContent,
  onActionPress,
}: ModalScreenProps) {
  const actionButton = (
    <ModalIconButton Icon={actionIcon} label={actionLabel} onPress={onActionPress} />
  );

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.nav}>
          {actionPosition === "left" ? actionButton : null}
          {headerContent ? <View style={styles.headerContent}>{headerContent}</View> : <View />}
          {actionPosition === "right" ? actionButton : <View style={styles.spacer} />}
        </View>
        {children}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  headerContent: {
    flex: 1,
    paddingRight: spacing.two,
  },
  nav: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.two,
    justifyContent: "space-between",
    paddingHorizontal: spacing.three,
    paddingTop: spacing.four,
  },
  safeArea: {
    flex: 1,
  },
  spacer: {
    height: 48,
    width: 48,
  },
});
