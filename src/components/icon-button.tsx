import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassViewProps,
} from "expo-glass-effect";
import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedProps } from "react-native-reanimated";

import { NativeGlassIconButton } from "@/components/native-glass-icon-button";
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
    <NativeGlassIconButton
      active={glassActive}
      contentStyle={styles.buttonContent}
      glassVisibilityProgress={glassVisibilityProgress}
      Icon={Icon}
      iconColor={colors.primary}
      label={label}
      onPress={onPress}
      strokeWidth={2.3}
      style={styles.button}
    />
  );
}

export function IconButtonSurface({
  active = true,
  fallbackColor = "rgba(242,242,247,0.9)",
  interactive = false,
  renderFallbackUnderGlass = false,
  tintColor = null,
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
        {renderFallbackUnderGlass || !active ? (
          <View
            pointerEvents="none"
            style={[styles.surface, styles.fallbackSurface, { backgroundColor: fallbackColor }]}
          />
        ) : null}
        {active ? (
          visibilityProgress ? (
            <AnimatedGlassView
              animatedProps={animatedProps}
              isInteractive={interactive}
              pointerEvents={interactive ? "auto" : "none"}
              style={styles.surface}
              tintColor={tintColor ?? undefined}
            />
          ) : (
            <GlassView
              glassEffectStyle="regular"
              isInteractive={interactive}
              pointerEvents={interactive ? "auto" : "none"}
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
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  buttonContent: {
    height: 48,
    width: 48,
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
