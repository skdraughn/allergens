import { Host } from "@expo/ui";
import { Button } from "@expo/ui/swift-ui";
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  labelStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import {
  ChevronLeft,
  Ellipsis,
  List as ListIcon,
  Search,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { StyleSheet, View } from "react-native";

import { LiquidGlassPressable } from "@/components/liquid-glass-pressable";

import type { NativeGlassIconButtonProps } from "./native-glass-icon-button.types";

function resolveSystemImage(Icon: LucideIcon): SFSymbol | null {
  if (Icon === ChevronLeft) return "chevron.left";
  if (Icon === Ellipsis) return "ellipsis";
  if (Icon === ListIcon) return "list.bullet";
  if (Icon === Search) return "magnifyingglass";
  if (Icon === UserRound) return "person";
  if (Icon === X) return "xmark";

  return null;
}

export function NativeGlassIconButton({
  active = true,
  contentStyle,
  glassVisibilityProgress,
  Icon,
  iconColor,
  iconSize = 22,
  label,
  onPress,
  strokeWidth = 2.35,
  style,
}: NativeGlassIconButtonProps) {
  const systemImage = resolveSystemImage(Icon);
  const canUseNativeGlassButton =
    active &&
    !glassVisibilityProgress &&
    Boolean(systemImage) &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();

  if (!canUseNativeGlassButton || !systemImage) {
    return (
      <LiquidGlassPressable
        accessibilityLabel={label}
        accessibilityRole="button"
        active={active}
        containerStyle={style}
        contentStyle={contentStyle}
        onPress={onPress}
        visibilityProgress={glassVisibilityProgress}
      >
        <Icon color={iconColor} size={iconSize} strokeWidth={strokeWidth} />
      </LiquidGlassPressable>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Host style={styles.host}>
        <Button
          label={label}
          modifiers={[
            buttonStyle("glass"),
            controlSize("large"),
            labelStyle("iconOnly"),
            buttonBorderShape("circle"),
            tint(iconColor),
          ]}
          onPress={onPress}
          systemImage={systemImage}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  host: {
    height: 48,
    width: 48,
  },
});
