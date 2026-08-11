import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  Extrapolation,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { RestaurantLogo } from "@/components/restaurant-logo";
import { colors } from "@/constants/theme";
import {
  getRestaurantBrandBackground,
  type RestaurantBrand,
} from "@/data/brand-assets";

const calmEase = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
const softEase = ReanimatedEasing.inOut(ReanimatedEasing.sin);

export function RestaurantDetailLoader({ brand }: { brand: RestaurantBrand }) {
  const reveal = useSharedValue(0);
  const breath = useSharedValue(0);
  const loadingCycle = useSharedValue(0);

  useEffect(() => {
    reveal.value = withTiming(1, {
      duration: 760,
      easing: calmEase,
    });
    breath.value = withDelay(
      380,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: softEase }),
          withTiming(0, { duration: 2200, easing: softEase }),
        ),
        -1,
        false,
      ),
    );
    loadingCycle.value = withDelay(
      460,
      withRepeat(
        withTiming(1, {
          duration: 2100,
          easing: softEase,
        }),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(reveal);
      cancelAnimation(breath);
      cancelAnimation(loadingCycle);
    };
  }, [breath, loadingCycle, reveal]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      {
        translateY: interpolate(reveal.value, [0, 1], [14, 0], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(reveal.value, [0, 1], [0.975, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const ambientHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.035, 0.07], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(breath.value, [0, 1], [0.96, 1.05], Extrapolation.CLAMP),
      },
    ],
  }));

  const loadingPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      loadingCycle.value,
      [0, 0.1, 0.38, 1],
      [0, 0.075, 0.032, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(loadingCycle.value, [0, 1], [0.94, 1.32], Extrapolation.CLAMP),
      },
    ],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(breath.value, [0, 1], [0.5, -0.5], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(breath.value, [0, 1], [0.998, 1.006], Extrapolation.CLAMP),
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
          [-38, 108],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View
      accessibilityLabel="Loading restaurant menu"
      accessibilityRole="progressbar"
      exiting={FadeOut.duration(220)}
      style={[styles.container, contentStyle]}
    >
      <View style={styles.logoStage}>
        <Animated.View style={[styles.ambientHalo, ambientHaloStyle]} />
        <Animated.View style={[styles.loadingPulse, loadingPulseStyle]} />
        <Animated.View style={[styles.logoShell, logoStyle]}>
          <View
            style={[
              styles.logoBackground,
              { backgroundColor: getRestaurantBrandBackground(brand) },
            ]}
          >
            <RestaurantLogo brand={brand} borderRadius={16} size={52} />
          </View>
        </Animated.View>
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>Preparing menu</Text>
        <Text style={styles.subtitle}>Gathering allergen context</Text>
      </View>

      <View style={styles.loaderTrack}>
        <Animated.View style={[styles.loaderSweep, loaderStyle]}>
          <LinearGradient
            colors={["rgba(0,122,255,0)", "rgba(0,122,255,0.8)", "rgba(0,122,255,0)"]}
            end={{ x: 1, y: 0 }}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ambientHalo: {
    backgroundColor: colors.primary,
    borderRadius: 66,
    height: 132,
    position: "absolute",
    width: 132,
  },
  container: {
    alignItems: "center",
    gap: 18,
  },
  copy: {
    alignItems: "center",
    gap: 4,
  },
  loaderSweep: {
    height: 3,
    width: 38,
  },
  loaderTrack: {
    backgroundColor: "rgba(0,122,255,0.06)",
    borderRadius: 2,
    height: 3,
    overflow: "hidden",
    width: 108,
  },
  loadingPulse: {
    backgroundColor: colors.primary,
    borderRadius: 47,
    height: 94,
    position: "absolute",
    width: 94,
  },
  logoBackground: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 18,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  logoShell: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderColor: "rgba(255,255,255,0.96)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: "0 14px 38px rgba(0, 92, 214, 0.09)",
    height: 78,
    justifyContent: "center",
    width: 78,
  },
  logoStage: {
    alignItems: "center",
    height: 144,
    justifyContent: "center",
    width: 144,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.15,
    lineHeight: 24,
  },
});
