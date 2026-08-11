import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ModuleSlideFadeIn } from "@/components/module-slide-fade-in";
import { allergyOptions, type AllergyOption } from "@/constants/allergies";
import { colors, spacing } from "@/constants/theme";

type AllergyProfilePickerProps = {
  animateModules?: boolean;
  embedded?: boolean;
  hideHeader?: boolean;
  moduleDelayBase?: number;
  moduleDelayStep?: number;
  onToggleAllergy: (id: string) => void;
  selectedAllergyIds: string[];
};

export function AllergyProfilePicker({
  animateModules = true,
  embedded = false,
  hideHeader = false,
  moduleDelayBase = 110,
  moduleDelayStep = 80,
  onToggleAllergy,
  selectedAllergyIds,
}: AllergyProfilePickerProps) {
  const selectedCount = selectedAllergyIds.length;
  const content = (
    <>
      {embedded || hideHeader ? null : (
        <View style={styles.header}>
          <Text style={styles.title}>What are you allergic to?</Text>
          <Text style={styles.subtitle}>
            {selectedCount === 0 ? "Select anything you want flagged." : `${selectedCount} selected`}
          </Text>
        </View>
      )}

      <View style={styles.modules}>
        {allergyOptions.map((option, index) => {
          const module = (
            <AllergyModule
              onPress={() => onToggleAllergy(option.id)}
              option={option}
              selected={selectedAllergyIds.includes(option.id)}
            />
          );

          if (!animateModules) {
            return <View key={option.id}>{module}</View>;
          }

          return (
            <ModuleSlideFadeIn
              delay={moduleDelayBase + index * moduleDelayStep}
              distance={96}
              duration={980}
              isActive
              key={option.id}
            >
              {module}
            </ModuleSlideFadeIn>
          );
        })}
      </View>
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedContent}>{content}</View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}

function AllergyModule({
  onPress,
  option,
  selected,
}: {
  onPress: () => void;
  option: AllergyOption;
  selected: boolean;
}) {
  const Icon = option.Icon;
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const selectedBackground = hexToRgba(option.accent, 0.032);
  const selectedBorder = hexToRgba(option.accent, 0.78);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: 620,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
  }, [selected, selectedProgress]);

  const animatedModuleStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      ["rgba(17,17,17,0.09)", selectedBorder],
    ),
  }));
  const animatedSelectedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
  }));

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={styles.pressable}
    >
      <Animated.View style={[styles.module, animatedModuleStyle]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.selectedBackground,
            { backgroundColor: selectedBackground },
            animatedSelectedBackgroundStyle,
          ]}
        />
        <View style={styles.symbol}>
          <Icon color={option.accent} size={30} strokeWidth={2.35} />
        </View>
        <View style={styles.moduleText}>
          <Text style={styles.moduleTitle}>{option.label}</Text>
          <Text style={styles.moduleDetail}>{option.detail}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red},${green},${blue},${alpha})`;
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  embeddedContent: {
    paddingTop: spacing.two,
  },
  header: {
    alignItems: "center",
    gap: 10,
    marginBottom: spacing.three,
    width: "100%",
  },
  module: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "rgba(17,17,17,0.09)",
    borderCurve: "continuous",
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    gap: 13,
    minHeight: 70,
    overflow: "hidden",
    paddingHorizontal: spacing.two,
    paddingVertical: 11,
  },
  moduleDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  modules: {
    gap: 10,
  },
  moduleText: {
    flex: 1,
    minWidth: 0,
  },
  moduleTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  pressable: {
    borderRadius: 16,
  },
  selectedBackground: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "300",
    lineHeight: 23,
    maxWidth: 280,
    textAlign: "center",
  },
  symbol: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 29,
    maxWidth: 315,
    textAlign: "center",
  },
});
