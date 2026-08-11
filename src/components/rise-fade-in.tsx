import { type ReactNode, useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const defaultEasing = ReanimatedEasing.out(ReanimatedEasing.cubic);

type RiseFadeInProps = {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  isActive: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RiseFadeIn({
  children,
  delay = 0,
  distance = 28,
  duration = 1200,
  isActive,
  style,
}: RiseFadeInProps) {
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    if (!isActive) {
      progress.value = 0;
      return;
    }

    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration,
        easing: defaultEasing,
      }),
    );
  }, [delay, duration, isActive, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
