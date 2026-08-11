import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";

const appIcon = require("../../assets/icon.png");
const MINIMUM_SPLASH_DURATION_MS = 3900;
const EXIT_DURATION_MS = 720;

const calmEase = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
const softEase = ReanimatedEasing.inOut(ReanimatedEasing.sin);

export function LaunchSplashScreen({ onFinish }: { onFinish?: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(true);
  const reveal = useSharedValue(0);
  const markReveal = useSharedValue(0);
  const copyReveal = useSharedValue(0);
  const statusReveal = useSharedValue(0);
  const ambient = useSharedValue(0);
  const breath = useSharedValue(0);
  const loadingCycle = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    reveal.value = withTiming(1, {
      duration: 1250,
      easing: calmEase,
    });
    markReveal.value = withDelay(
      80,
      withTiming(1, {
        duration: 1280,
        easing: calmEase,
      }),
    );
    copyReveal.value = withDelay(
      410,
      withTiming(1, {
        duration: 1050,
        easing: calmEase,
      }),
    );
    statusReveal.value = withDelay(
      900,
      withTiming(1, {
        duration: 900,
        easing: calmEase,
      }),
    );
    ambient.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4200, easing: softEase }),
        withTiming(0, { duration: 4200, easing: softEase }),
      ),
      -1,
      false,
    );
    breath.value = withDelay(
      950,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2700, easing: softEase }),
          withTiming(0, { duration: 2700, easing: softEase }),
        ),
        -1,
        false,
      ),
    );
    loadingCycle.value = withDelay(
      980,
      withRepeat(
        withTiming(1, {
          duration: 2380,
          easing: softEase,
        }),
        -1,
        false,
      ),
    );

    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const exitTimer = setTimeout(() => {
      exit.value = withTiming(1, {
        duration: EXIT_DURATION_MS,
        easing: softEase,
      });
      finishTimer = setTimeout(() => {
        setIsMounted(false);
        onFinish?.();
      }, EXIT_DURATION_MS);
    }, MINIMUM_SPLASH_DURATION_MS);

    return () => {
      clearTimeout(exitTimer);
      if (finishTimer) {
        clearTimeout(finishTimer);
      }
      cancelAnimation(reveal);
      cancelAnimation(markReveal);
      cancelAnimation(copyReveal);
      cancelAnimation(statusReveal);
      cancelAnimation(ambient);
      cancelAnimation(breath);
      cancelAnimation(loadingCycle);
      cancelAnimation(exit);
    };
  }, [
    ambient,
    breath,
    copyReveal,
    exit,
    loadingCycle,
    markReveal,
    onFinish,
    reveal,
    statusReveal,
  ]);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(exit.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(exit.value, [0, 1], [0, -7], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(exit.value, [0, 1], [1, 1.008], Extrapolation.CLAMP),
      },
    ],
  }));

  const ambientWashStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(reveal.value, [0, 0.45, 1], [0, 0, 1], Extrapolation.CLAMP) *
      interpolate(ambient.value, [0, 1], [0.7, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(ambient.value, [0, 1], [-5, 5], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(ambient.value, [0, 1], [4, -4], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(ambient.value, [0, 1], [0.985, 1.015], Extrapolation.CLAMP),
      },
    ],
  }));

  const markStageStyle = useAnimatedStyle(() => ({
    opacity: markReveal.value,
    transform: [
      {
        translateY: interpolate(markReveal.value, [0, 1], [18, 0], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(markReveal.value, [0, 1], [0.94, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const ambientHaloStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(reveal.value, [0, 0.4, 1], [0, 0, 1], Extrapolation.CLAMP) *
      interpolate(breath.value, [0, 1], [0.04, 0.075], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(breath.value, [0, 1], [0.96, 1.045], Extrapolation.CLAMP),
      },
    ],
  }));

  const loadingPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      loadingCycle.value,
      [0, 0.09, 0.34, 1],
      [0, 0.075, 0.038, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(loadingCycle.value, [0, 1], [0.94, 1.32], Extrapolation.CLAMP),
      },
    ],
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(breath.value, [0, 1], [0.5, -0.5], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(breath.value, [0, 1], [0.998, 1.006], Extrapolation.CLAMP),
      },
    ],
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyReveal.value,
    transform: [
      {
        translateY: interpolate(copyReveal.value, [0, 1], [16, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  const statusStyle = useAnimatedStyle(() => ({
    opacity: statusReveal.value,
    transform: [
      {
        translateY:
          interpolate(statusReveal.value, [0, 1], [10, 0], Extrapolation.CLAMP) +
          interpolate(exit.value, [0, 1], [0, 4], Extrapolation.CLAMP),
      },
    ],
  }));

  const loaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      loadingCycle.value,
      [0, 0.08, 0.9, 1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          loadingCycle.value,
          [0, 1],
          [-44, 124],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  if (!isMounted) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.screen,
        screenStyle,
        {
          paddingBottom: Math.max(insets.bottom, 28),
          paddingTop: Math.max(insets.top, 28),
        },
      ]}
    >
      <LinearGradient
        colors={["#FFFFFF", "#F9FBFE", "#FFFFFF"]}
        end={{ x: 0.82, y: 1 }}
        locations={[0, 0.54, 1]}
        start={{ x: 0.18, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View pointerEvents="none" style={[styles.ambientWash, ambientWashStyle]}>
        <LinearGradient
          colors={["rgba(0,122,255,0.065)", "rgba(74,144,255,0.018)", "rgba(255,255,255,0)"]}
          end={{ x: 0.74, y: 1 }}
          locations={[0, 0.52, 1]}
          start={{ x: 0.26, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          contentStyle,
          { minHeight: Math.max(580, height - insets.top - insets.bottom - 56) },
        ]}
      >
        <Animated.View style={[styles.markStage, markStageStyle]}>
          <Animated.View style={[styles.ambientHalo, ambientHaloStyle]} />
          <Animated.View style={[styles.loadingPulse, loadingPulseStyle]} />

          <Animated.View style={[styles.mark, markStyle]}>
            <View style={styles.iconFrame}>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="cover"
                source={appIcon}
                style={styles.appIcon}
              />
            </View>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.copy, copyStyle]}>
          <Text style={styles.title}>SafePlate</Text>
          <Text style={styles.subtitle}>Allergy-aware ordering, at a glance.</Text>
        </Animated.View>

        <Animated.View style={[styles.status, statusStyle]}>
          <Text style={styles.statusText}>Preparing SafePlate</Text>
          <View style={styles.loaderTrack}>
            <Animated.View style={[styles.loaderSweep, loaderStyle]}>
              <LinearGradient
                colors={["rgba(0,122,255,0)", "rgba(0,122,255,0.82)", "rgba(0,122,255,0)"]}
                end={{ x: 1, y: 0 }}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ambientHalo: {
    backgroundColor: colors.primary,
    borderRadius: 98,
    height: 196,
    position: "absolute",
    width: 196,
  },
  ambientWash: {
    borderRadius: 260,
    height: 520,
    left: "50%",
    marginLeft: -260,
    marginTop: -260,
    overflow: "hidden",
    position: "absolute",
    top: "50%",
    width: 520,
  },
  appIcon: {
    height: 92,
    width: 92,
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  copy: {
    alignItems: "center",
    gap: 8,
    marginTop: 22,
  },
  iconFrame: {
    borderCurve: "continuous",
    borderRadius: 26,
    height: 92,
    overflow: "hidden",
    width: 92,
  },
  loaderSweep: {
    height: 3,
    width: 44,
  },
  loaderTrack: {
    backgroundColor: "rgba(0,122,255,0.065)",
    borderRadius: 2,
    height: 3,
    overflow: "hidden",
    width: 124,
  },
  loadingPulse: {
    backgroundColor: colors.primary,
    borderRadius: 66,
    height: 132,
    position: "absolute",
    width: 132,
  },
  mark: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderColor: "rgba(255,255,255,0.96)",
    borderCurve: "continuous",
    borderRadius: 35,
    borderWidth: 1,
    boxShadow: "0 18px 48px rgba(0, 92, 214, 0.105)",
    height: 120,
    justifyContent: "center",
    width: 120,
  },
  markStage: {
    alignItems: "center",
    height: 210,
    justifyContent: "center",
    width: 210,
  },
  screen: {
    backgroundColor: colors.white,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1000,
  },
  status: {
    alignItems: "center",
    bottom: 16,
    gap: 13,
    position: "absolute",
  },
  statusText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 24,
    maxWidth: 286,
    textAlign: "center",
  },
  title: {
    color: colors.ink,
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: -0.7,
    lineHeight: 50,
  },
});
