import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { colors } from "@/constants/theme";

const DOTS = Array.from({ length: 32 });
const SIZE = 148;
const CENTER = SIZE / 2;
const RADIUS = 60;
const DOT_SIZE = 7;

type SetupHeroMarkProps = {
  Icon: LucideIcon;
};

export function SetupHeroMark({ Icon }: SetupHeroMarkProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.ring}>
        {DOTS.map((_, index) => {
          const angle = (index / DOTS.length) * Math.PI * 2;

          return (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  left: CENTER + Math.cos(angle) * RADIUS - DOT_SIZE / 2,
                  top: CENTER + Math.sin(angle) * RADIUS - DOT_SIZE / 2,
                },
              ]}
            />
          );
        })}
        <View style={styles.inner}>
          <Icon color={colors.primary} size={42} strokeWidth={2.25} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: "#75B9FF",
    borderRadius: DOT_SIZE / 2,
    height: DOT_SIZE,
    position: "absolute",
    width: DOT_SIZE,
  },
  inner: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 48,
    height: 96,
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 24,
    width: 96,
  },
  ring: {
    alignItems: "center",
    height: SIZE,
    justifyContent: "center",
    width: SIZE,
  },
  wrap: {
    alignItems: "center",
    width: "100%",
  },
});
