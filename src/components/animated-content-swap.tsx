import { type ReactNode, useEffect } from "react";
import { StyleSheet, type StyleProp, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type AnimatedContentSwapProps = {
  duration?: number;
  primary: ReactNode;
  reverseDuration?: number;
  secondary: ReactNode;
  showSecondary: boolean;
  style?: StyleProp<ViewStyle>;
};

const contentEasing = Easing.bezier(0.16, 1, 0.3, 1);

export function AnimatedContentSwap({
  duration = 560,
  primary,
  reverseDuration = 480,
  secondary,
  showSecondary,
  style,
}: AnimatedContentSwapProps) {
  const progress = useSharedValue(showSecondary ? 1 : 0);

  useEffect(() => {
    progress.set(
      withTiming(showSecondary ? 1 : 0, {
        duration: showSecondary ? duration : reverseDuration,
        easing: contentEasing,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [duration, progress, reverseDuration, showSecondary]);

  const primaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.72, 1],
      [1, 0.18, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [0, -20],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [1, 0.992],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  const secondaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.18, 1],
      [0, 0.06, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [36, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        accessibilityElementsHidden={showSecondary}
        importantForAccessibility={
          showSecondary ? "no-hide-descendants" : "yes"
        }
        pointerEvents={showSecondary ? "none" : "auto"}
        style={[styles.page, primaryStyle]}
      >
        {primary}
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden={!showSecondary}
        importantForAccessibility={
          showSecondary ? "yes" : "no-hide-descendants"
        }
        pointerEvents={showSecondary ? "auto" : "none"}
        style={[styles.page, secondaryStyle]}
      >
        {secondary}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  page: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
