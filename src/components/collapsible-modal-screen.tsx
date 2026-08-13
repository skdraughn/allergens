import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  type SharedValue,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { colors, spacing } from "@/constants/theme";

import { ModalIconButton } from "./modal-icon-button";
import { ScreenBackground } from "./screen-background";
import { SnackbarViewport } from "./snackbar-provider";

type CollapsibleModalScreenProps = {
  actionIcon: LucideIcon;
  actionLabel: string;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  footerContainerStyle?: StyleProp<ViewStyle>;
  onActionPress: () => void;
  title: string;
  actionGlassVisibilityProgress?: SharedValue<number>;
};

const compactThreshold = 76;
const compactAnimationDurationMs = 170;

export function CollapsibleModalScreen({
  actionIcon,
  actionGlassVisibilityProgress,
  actionLabel,
  children,
  contentContainerStyle,
  footer,
  footerContainerStyle,
  onActionPress,
  title,
}: CollapsibleModalScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(
        withTiming(event.contentOffset.y, {
          duration: compactAnimationDurationMs,
        }),
      );
    },
  });
  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [compactThreshold - 20, compactThreshold + 20], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(scrollY.value, [compactThreshold - 20, compactThreshold + 20], [-8, 0], Extrapolation.CLAMP),
      },
    ],
  }));
  const actionAnimatedStyle = useAnimatedStyle(() => {
    const size = interpolate(scrollY.value, [0, compactThreshold], [48, 36], Extrapolation.CLAMP);

    return {
      borderRadius: size / 2,
      height: size,
      width: size,
    };
  });
  return (
    <ScreenBackground>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
        <View style={styles.nav}>
          <Animated.Text
            maxFontSizeMultiplier={1.08}
            numberOfLines={1}
            style={[styles.navTitle, titleAnimatedStyle]}
          >
            {title}
          </Animated.Text>
          <Animated.View style={[styles.actionButton, actionAnimatedStyle]}>
            <ModalIconButton
              glassVisibilityProgress={actionGlassVisibilityProgress}
              Icon={actionIcon}
              label={actionLabel}
              onPress={onActionPress}
              style={styles.actionPressable}
            />
          </Animated.View>
        </View>
        <Animated.ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {children}
        </Animated.ScrollView>
        {footer ? (
          <View
            style={[
              footerContainerStyle,
              { paddingBottom: Math.max(insets.bottom, spacing.two) },
            ]}
          >
            {footer}
          </View>
        ) : null}
        <SnackbarViewport insideSafeArea />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    overflow: "hidden",
  },
  actionPressable: {
    borderRadius: 999,
    height: "100%",
    width: "100%",
  },
  content: {
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.two,
    justifyContent: "space-between",
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.four,
  },
  navTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
    opacity: 0,
  },
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
});
