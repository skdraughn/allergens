import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/constants/theme";

type SereneLoaderProps = {
  color?: string;
  size?: "small" | "regular";
};

export function SereneLoader({
  color = colors.primary,
  size = "regular",
}: SereneLoaderProps) {
  const dotSize = size === "small" ? 5 : 7;

  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[styles.row, { gap: size === "small" ? 4 : 5 }]}
    >
      {[0, 1, 2].map((index) => (
        <SereneLoaderDot color={color} delay={index * 150} key={index} size={dotSize} />
      ))}
    </View>
  );
}

function SereneLoaderDot({
  color,
  delay,
  size,
}: {
  color: string;
  delay: number;
  size: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 560,
            easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
          }),
          withTiming(0, {
            duration: 560,
            easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + progress.value * 0.7,
    transform: [
      { scale: 0.82 + progress.value * 0.18 },
      { translateY: -progress.value * 2 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: color,
          height: size,
          width: size,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 999,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 18,
  },
});
