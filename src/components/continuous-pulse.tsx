import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type ContinuousPulseProps = {
  children: ReactNode;
  duration?: number;
  horizontalExpansionMultiplier?: number;
  maxExpansion?: number;
  maxOpacity?: number;
  pulseStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  waveOffset?: number;
};

export function ContinuousPulse({
  children,
  duration = 6200,
  horizontalExpansionMultiplier = 1,
  maxExpansion = 18,
  maxOpacity = 0.1,
  pulseStyle,
  style,
  waveOffset = 0.3,
}: ContinuousPulseProps) {
  const [layout, setLayout] = useState({ height: 0, width: 0 });
  const normalizedWaveOffset = Math.max(0.05, waveOffset);
  const waveCount = Math.max(1, Math.ceil(1 / normalizedWaveOffset));
  const waveInterval = duration * normalizedWaveOffset;
  const repeatInterval = waveInterval * waveCount;
  const waveIndexes = useRef<number[]>([]).current;

  while (waveIndexes.length < waveCount) {
    waveIndexes.push(waveIndexes.length);
  }

  function handleLayout(event: LayoutChangeEvent) {
    const { height, width } = event.nativeEvent.layout;
    setLayout((current) =>
      current.height === height && current.width === width ? current : { height, width },
    );
  }

  return (
    <View onLayout={handleLayout} style={[styles.container, style]}>
      {waveIndexes.slice(0, waveCount).map((index) => (
        <PulseWave
          delay={waveInterval * index}
          duration={duration}
          height={layout.height}
          horizontalExpansionMultiplier={horizontalExpansionMultiplier}
          key={index}
          maxExpansion={maxExpansion}
          maxOpacity={maxOpacity}
          pulseStyle={pulseStyle}
          repeatInterval={repeatInterval}
          width={layout.width}
        />
      ))}
      {children}
    </View>
  );
}

function PulseWave({
  delay,
  duration,
  height,
  horizontalExpansionMultiplier,
  maxExpansion,
  maxOpacity,
  pulseStyle,
  repeatInterval,
  width,
}: {
  delay: number;
  duration: number;
  height: number;
  horizontalExpansionMultiplier: number;
  maxExpansion: number;
  maxOpacity: number;
  pulseStyle: StyleProp<ViewStyle>;
  repeatInterval: number;
  width: number;
}) {
  const progress = useSharedValue(1);
  const horizontalExpansion = maxExpansion * horizontalExpansionMultiplier;
  const maxScaleX = width > 0 ? (width + horizontalExpansion * 2) / width : 1;
  const maxScaleY = height > 0 ? (height + maxExpansion * 2) / height : 1;
  const repeatDelay = Math.max(0, repeatInterval - duration);

  useEffect(() => {
    progress.value = 1;
    progress.value = withSequence(
      withTiming(1, { duration: delay }),
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, {
            duration,
            easing: Easing.out(Easing.cubic),
          }),
          withTiming(1, { duration: repeatDelay }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(progress);
    };
  }, [delay, duration, progress, repeatDelay]);

  const animatedStyle = useAnimatedStyle(() => {
    const nextScaleX = 1 + (maxScaleX - 1) * progress.value;
    const nextScaleY = 1 + (maxScaleY - 1) * progress.value;
    const nextOpacity =
      progress.value <= 0.08
        ? (progress.value / 0.08) * maxOpacity
        : Math.max(0, maxOpacity * (1 - (progress.value - 0.08) / 0.92));

    return {
      opacity: nextOpacity,
      transform: [{ scaleX: nextScaleX }, { scaleY: nextScaleY }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        pulseStyle,
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
});
