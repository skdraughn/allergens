import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text } from "react-native";
import Animated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/constants/theme";

const appIcon = require("../../assets/icon.png");
const MINIMUM_SPLASH_DURATION_MS = 2500;
const EXIT_DURATION_MS = 360;

const settleEase = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
const fadeEase = ReanimatedEasing.inOut(ReanimatedEasing.quad);

export function LaunchSplashScreen({
  onFinish,
  ready,
}: {
  onFinish?: () => void;
  ready: boolean;
}) {
  const [isMounted, setIsMounted] = useState(true);
  const [minimumDurationElapsed, setMinimumDurationElapsed] = useState(false);
  const hasHiddenNativeSplash = useRef(false);
  const hasStartedExit = useRef(false);
  const markPosition = useSharedValue(0);
  const copyReveal = useSharedValue(0);
  const exit = useSharedValue(0);

  const handleFirstLayout = useCallback(() => {
    if (hasHiddenNativeSplash.current) {
      return;
    }

    hasHiddenNativeSplash.current = true;
    requestAnimationFrame(() => {
      void SplashScreen.hideAsync();
    });
  }, []);

  useEffect(() => {
    markPosition.value = withDelay(
      120,
      withTiming(1, {
        duration: 820,
        easing: settleEase,
      }),
    );
    copyReveal.value = withDelay(
      300,
      withTiming(1, {
        duration: 620,
        easing: fadeEase,
      }),
    );
    const minimumTimer = setTimeout(() => {
      setMinimumDurationElapsed(true);
    }, MINIMUM_SPLASH_DURATION_MS);

    return () => {
      clearTimeout(minimumTimer);
      cancelAnimation(markPosition);
      cancelAnimation(copyReveal);
    };
  }, [copyReveal, markPosition]);

  useEffect(() => {
    if (!ready || !minimumDurationElapsed || hasStartedExit.current) {
      return;
    }

    hasStartedExit.current = true;
    exit.value = withTiming(1, {
      duration: EXIT_DURATION_MS,
      easing: fadeEase,
    });
    const finishTimer = setTimeout(() => {
      setIsMounted(false);
      onFinish?.();
    }, EXIT_DURATION_MS);

    return () => {
      clearTimeout(finishTimer);
      cancelAnimation(exit);
    };
  }, [exit, minimumDurationElapsed, onFinish, ready]);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(exit.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(markPosition.value, [0, 1], [0, -58], Extrapolation.CLAMP),
      },
    ],
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyReveal.value,
    transform: [
      {
        translateY: interpolate(copyReveal.value, [0, 1], [8, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  if (!isMounted) {
    return null;
  }

  return (
    <Animated.View
      onLayout={handleFirstLayout}
      pointerEvents="auto"
      style={[styles.screen, screenStyle]}
    >
      <Animated.View style={[styles.mark, markStyle]}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={appIcon}
          style={styles.appIcon}
        />
      </Animated.View>

      <Animated.View style={[styles.copy, copyStyle]}>
        <Text style={styles.title}>MySafeMenu</Text>
        <Text style={styles.subtitle}>Allergy-aware ordering, at a glance.</Text>
      </Animated.View>

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  appIcon: {
    height: 92,
    width: 92,
  },
  copy: {
    alignItems: "center",
    gap: 7,
    left: 24,
    marginTop: 58,
    position: "absolute",
    right: 24,
    top: "50%",
  },
  mark: {
    borderCurve: "continuous",
    borderRadius: 26,
    height: 92,
    left: "50%",
    marginLeft: -46,
    marginTop: -46,
    overflow: "hidden",
    position: "absolute",
    top: "50%",
    width: 92,
  },
  screen: {
    backgroundColor: "#FFFFFF",
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1000,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
    textAlign: "center",
  },
  title: {
    color: colors.ink,
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 46,
  },
});
