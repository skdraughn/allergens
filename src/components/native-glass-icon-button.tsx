import { LiquidGlassPressable } from "@/components/liquid-glass-pressable";

import type { NativeGlassIconButtonProps } from "./native-glass-icon-button.types";

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
