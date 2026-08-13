import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassViewProps,
} from "expo-glass-effect";
import { useIsFocused } from "expo-router/react-navigation";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedProps } from "react-native-reanimated";

import { colors } from "@/constants/theme";

type IconButtonProps = {
  glassActive?: boolean;
  glassVisibilityProgress?: SharedValue<number>;
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
};

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

export function IconButton({
  glassActive = true,
  glassVisibilityProgress,
  Icon,
  label,
  onPress,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <IconButtonSurface
        active={glassActive}
        visibilityProgress={glassVisibilityProgress}
      />
      <Icon color={colors.primary} size={22} strokeWidth={2.3} />
    </Pressable>
  );
}

export function IconButtonSurface({
  active = true,
  fallbackColor = "rgba(242,242,247,0.9)",
  interactive = true,
  renderFallbackUnderGlass = true,
  tintColor = "rgba(248,248,252,0.34)",
  visibilityProgress,
}: {
  active?: boolean;
  fallbackColor?: string;
  interactive?: boolean;
  renderFallbackUnderGlass?: boolean;
  tintColor?: string | null;
  visibilityProgress?: SharedValue<number>;
}) {
  const canUseLiquidGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const isFocused = useIsFocused();
  const animatedProps = useAnimatedProps<GlassViewProps>(() => {
    const glassEffectStyle: "none" | "regular" =
      !visibilityProgress || visibilityProgress.value > 0.01
        ? "regular"
        : "none";

    return { glassEffectStyle };
  }, [visibilityProgress]);

  if (canUseLiquidGlass) {
    return (
      <>
        {renderFallbackUnderGlass || !active || !isFocused ? (
          <View
            pointerEvents="none"
            style={[styles.surface, styles.fallbackSurface, { backgroundColor: fallbackColor }]}
          />
        ) : null}
        {active && isFocused ? (
          visibilityProgress ? (
            <AnimatedGlassView
              animatedProps={animatedProps}
              isInteractive={interactive}
              pointerEvents="none"
              style={styles.surface}
              tintColor={tintColor ?? undefined}
            />
          ) : (
            <GlassView
              glassEffectStyle="regular"
              isInteractive={interactive}
              pointerEvents="none"
              style={styles.surface}
              tintColor={tintColor ?? undefined}
            />
          )
        ) : null}
      </>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.surface, styles.fallbackSurface, { backgroundColor: fallbackColor }]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
    width: 48,
  },
  buttonPressed: {
    transform: [{ scale: 0.94 }],
  },
  fallbackSurface: {
    borderColor: "rgba(255,255,255,0.75)",
    borderWidth: StyleSheet.hairlineWidth,
  },
  surface: {
    bottom: 0,
    borderRadius: 999,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
