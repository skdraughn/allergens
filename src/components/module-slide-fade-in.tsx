import { type ReactNode, useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const defaultEasing = ReanimatedEasing.bezier(0.16, 1, 0.3, 1);

type ModuleSlideFadeInProps = {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  isActive?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ModuleSlideFadeIn({
  children,
  delay = 0,
  distance = 88,
  duration = 940,
  isActive = true,
  style,
}: ModuleSlideFadeInProps) {
  const progress = useSharedValue(0);

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
    transform: [{ translateX: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
