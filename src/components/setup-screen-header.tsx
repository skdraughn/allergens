import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants/theme";

import { SetupHeroMark } from "./setup-hero-mark";

type SetupScreenHeaderProps = {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
};

export function SetupScreenHeader({ Icon, title, subtitle }: SetupScreenHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.heroWrap}>
        <SetupHeroMark Icon={Icon} />
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copyBlock: {
    paddingHorizontal: spacing.one,
  },
  heroWrap: {
    marginBottom: spacing.two,
    marginTop: 18,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 23,
    letterSpacing: 0,
    lineHeight: 29,
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 32,
  },
  wrap: {
    marginBottom: spacing.two,
  },
});
