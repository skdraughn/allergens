import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassViewProps,
} from "expo-glass-effect";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  ReduceMotion,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

type LiquidGlassPressableProps = Omit<
  PressableProps,
  "children" | "onLayout" | "style"
> & {
  active?: boolean;
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  contentStyle?: PressableProps["style"];
  fallbackColor?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  tintColor?: string | null;
  visibilityProgress?: SharedValue<number>;
};

/**
 * A content-bearing native glass control. Keeping the Pressable inside the
 * GlassView lets iOS own the liquid-glass touch response instead of treating
 * glass as a decorative layer beneath a separate JavaScript control.
 */
export function LiquidGlassPressable({
  active = true,
  children,
  containerStyle,
  contentStyle,
  fallbackColor = "rgba(242,242,247,0.9)",
  onLayout,
  tintColor = null,
  visibilityProgress,
  ...pressableProps
}: LiquidGlassPressableProps) {
  const canUseLiquidGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const shouldRenderGlass = canUseLiquidGlass && active;
  const pressScale = useSharedValue(1);
  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.get() }],
  }));
  const animatedProps = useAnimatedProps<GlassViewProps>(() => ({
    glassEffectStyle:
      !visibilityProgress || visibilityProgress.value > 0.01
        ? "regular"
        : "none",
  }));
  const {
    onPressIn,
    onPressOut,
    ...restPressableProps
  } = pressableProps;
  const renderContent = (nativeGlass: boolean) => (
    <Pressable
      {...restPressableProps}
      onPressIn={(event) => {
        pressScale.set(
          withTiming(1.018, {
            duration: 120,
            reduceMotion: ReduceMotion.System,
          }),
        );
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressScale.set(
          withTiming(1, {
            duration: 150,
            reduceMotion: ReduceMotion.System,
          }),
        );
        onPressOut?.(event);
      }}
      pressRetentionOffset={restPressableProps.pressRetentionOffset ?? 12}
      style={(state) => [
        styles.content,
        typeof contentStyle === "function" ? contentStyle(state) : contentStyle,
        !nativeGlass && state.pressed ? styles.fallbackPressed : null,
      ]}
    >
      {children}
    </Pressable>
  );

  if (shouldRenderGlass) {
    const glassProps = {
      isInteractive: true,
      onLayout,
      style: [styles.surface, containerStyle, pressAnimatedStyle],
      tintColor: tintColor ?? undefined,
    };

    return visibilityProgress ? (
      <AnimatedGlassView {...glassProps} animatedProps={animatedProps}>
        {renderContent(true)}
      </AnimatedGlassView>
    ) : (
      <AnimatedGlassView {...glassProps} glassEffectStyle="regular">
        {renderContent(true)}
      </AnimatedGlassView>
    );
  }

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.surface,
        styles.fallbackSurface,
        { backgroundColor: fallbackColor },
        containerStyle,
        pressAnimatedStyle,
      ]}
    >
      {renderContent(false)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  fallbackSurface: {
    borderColor: "rgba(255,255,255,0.75)",
    borderWidth: StyleSheet.hairlineWidth,
  },
  surface: {
    borderCurve: "continuous",
    overflow: "hidden",
  },
});
