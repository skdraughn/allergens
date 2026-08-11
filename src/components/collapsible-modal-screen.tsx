import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/constants/theme";

import { ScreenBackground } from "./screen-background";
import { SnackbarViewport } from "./snackbar-provider";

type CollapsibleModalScreenProps = {
  actionIcon: LucideIcon;
  actionLabel: string;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  onActionPress: () => void;
  title: string;
};

const compactThreshold = 76;
const compactAnimationDurationMs = 170;

export function CollapsibleModalScreen({
  actionIcon,
  actionLabel,
  children,
  contentContainerStyle,
  footer,
  onActionPress,
  title,
}: CollapsibleModalScreenProps) {
  const scrollY = useSharedValue(0);
  const ActionIcon = actionIcon;
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
  const actionIconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(scrollY.value, [0, compactThreshold], [1, 0.84], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.nav}>
          <Animated.Text
            maxFontSizeMultiplier={1.08}
            numberOfLines={1}
            style={[styles.navTitle, titleAnimatedStyle]}
          >
            {title}
          </Animated.Text>
          <Animated.View style={[styles.actionButton, actionAnimatedStyle]}>
            <Pressable
              accessibilityLabel={actionLabel}
              accessibilityRole="button"
              onPress={onActionPress}
              style={styles.actionPressable}
            >
              <Animated.View style={actionIconAnimatedStyle}>
                <ActionIcon color={colors.primary} size={22} strokeWidth={2.4} />
              </Animated.View>
            </Pressable>
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
        {footer}
        <SnackbarViewport />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    backgroundColor: "#F2F2F7",
    overflow: "hidden",
  },
  actionPressable: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
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
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
});
