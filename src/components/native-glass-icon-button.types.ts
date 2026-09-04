import type { LucideIcon } from "lucide-react-native";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";

export type NativeGlassIconButtonProps = {
  active?: boolean;
  contentStyle?: PressableProps["style"];
  glassVisibilityProgress?: SharedValue<number>;
  Icon: LucideIcon;
  iconColor: string;
  iconSize?: number;
  label: string;
  onPress: () => void;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};
