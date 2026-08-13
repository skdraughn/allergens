import * as Haptics from "expo-haptics";
import { HeartPulse } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/constants/theme";

type AllergyRatingPickerProps = {
  label?: string;
  onChange: (rating: number) => void;
  rating: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AllergyRatingPicker({
  label = "Allergy rating",
  onChange,
  rating,
}: AllergyRatingPickerProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.picker}>
        {[1, 2, 3, 4, 5].map((value) => (
          <RatingIcon
            active={value <= rating}
            key={value}
            onPress={() => onChange(value)}
            value={value}
          />
        ))}
      </View>
    </View>
  );
}

function RatingIcon({
  active,
  onPress,
  value,
}: {
  active: boolean;
  onPress: () => void;
  value: number;
}) {
  const selectedProgress = useSharedValue(active ? 1 : 0);
  const tapProgress = useSharedValue(1);

  useEffect(() => {
    selectedProgress.set(
      withTiming(active ? 1 : 0, {
        duration: 220,
      }),
    );
  }, [active, selectedProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(selectedProgress.value, [0, 1], [0.58, 1]),
    transform: [
      {
        scale:
          tapProgress.value *
          interpolate(selectedProgress.value, [0, 1], [1, 1.07]),
      },
    ],
  }));

  const handlePress = () => {
    tapProgress.set(
      withSequence(
        withTiming(0.84, { duration: 75 }),
        withTiming(1, { duration: 210 }),
      ),
    );
    void Haptics.selectionAsync();
    onPress();
  };

  return (
    <AnimatedPressable
      accessibilityLabel={`${value} out of 5 allergy rating`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={4}
      onPress={handlePress}
      style={[styles.iconButton, animatedStyle]}
    >
      <HeartPulse
        color={active ? "#E3264F" : colors.muted}
        fill={active ? "#FF3B5F" : "transparent"}
        size={28}
        strokeWidth={active ? 2.35 : 2.15}
      />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 5,
  },
  iconButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  label: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  picker: {
    flexDirection: "row",
    gap: 0,
  },
});
