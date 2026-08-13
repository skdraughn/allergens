import { ShieldCheck } from "lucide-react-native";
import { useUpdates } from "expo-updates";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { SereneLoader } from "@/components/serene-loader";
import { colors, radius, spacing } from "@/constants/theme";
import {
  checkForMySafeMenuUpdate,
  downloadAndReloadMySafeMenuUpdate,
  type MySafeMenuUpdateMetadata,
  type UpdateCheckState,
} from "@/lib/updates/update-coordinator";

type GateState = UpdateCheckState | { status: "checking" } | {
  metadata: MySafeMenuUpdateMetadata;
  status: "downloading";
};

export function StartupUpdateGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "checking" });
  const appState = useRef(AppState.currentState);
  const checkInFlight = useRef(false);
  const attemptedUpdateId = useRef<string | null>(null);
  const nativeUpdateState = useUpdates();
  const progress = useSharedValue(0.04);
  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  const check = useCallback(async (showChecking = true) => {
    if (checkInFlight.current) return;
    checkInFlight.current = true;
    if (showChecking) setState({ status: "checking" });
    try {
      const result = await checkForMySafeMenuUpdate();
      if (showChecking || result.status !== "ready") setState(result);
    } finally {
      checkInFlight.current = false;
    }
  }, []);

  const install = useCallback(async (metadata: MySafeMenuUpdateMetadata) => {
    setState({ metadata, status: "downloading" });
    try {
      await downloadAndReloadMySafeMenuUpdate(metadata);
    } catch {
      setState({
        message: "The update was interrupted. Check your connection and try again.",
        metadata,
        required: true,
        status: "error",
      });
    }
  }, []);

  useEffect(() => void check(), [check]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const becameActive = appState.current !== "active" && nextState === "active";
      appState.current = nextState;
      if (becameActive) void check(false);
    });
    return () => subscription.remove();
  }, [check]);

  useEffect(() => {
    if (state.status !== "required") return;
    if (attemptedUpdateId.current === state.metadata.updateId) return;
    attemptedUpdateId.current = state.metadata.updateId;
    void install(state.metadata);
  }, [install, state]);

  useEffect(() => {
    if (state.status !== "downloading" && state.status !== "required") return;
    const measured = nativeUpdateState.isDownloading
      ? (nativeUpdateState.downloadProgress ?? 0.08)
      : 0.08;
    // Reanimated shared values are intentionally mutated from effects.
    // eslint-disable-next-line react-hooks/immutability
    progress.value = withTiming(Math.max(0.08, measured), {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [nativeUpdateState.downloadProgress, nativeUpdateState.isDownloading, progress, state.status]);

  if (state.status === "ready") return children;

  const checking = state.status === "checking";
  const optional = state.status === "optional";
  const error = state.status === "error";
  const downloading = state.status === "downloading" || state.status === "required";
  const metadata = "metadata" in state ? state.metadata : undefined;
  const message =
    ("message" in state ? state.message : undefined) ??
    metadata?.message ??
    "Checking for the latest safety updates.";

  return (
    <View accessibilityViewIsModal style={styles.container}>
      <View style={styles.brandMark}>
        <ShieldCheck color={colors.primary} size={38} strokeWidth={2.15} />
      </View>
      {checking || downloading ? <SereneLoader /> : null}
      <View style={styles.copy}>
        <Text style={styles.title}>
          {checking
            ? "Preparing MySafeMenu"
            : downloading
              ? "Installing update"
              : error
                ? "Update interrupted"
                : "Update available"}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {!checking && !downloading ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (error) {
                attemptedUpdateId.current = null;
                void check();
              } else if (metadata) {
                void install(metadata);
              }
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>{error ? "Try again" : "Update now"}</Text>
          </Pressable>
          {optional ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setState({ reason: "skipped", status: "ready" })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Later</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {downloading ? (
        <View accessibilityLabel="MySafeMenu update in progress" accessibilityRole="progressbar" style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: spacing.three, width: "100%" },
  brandMark: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderCurve: "continuous",
    borderRadius: 24,
    height: 76,
    justifyContent: "center",
    marginBottom: spacing.three,
    width: 76,
  },
  container: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.four,
  },
  copy: { alignItems: "center", gap: 8, marginTop: spacing.two },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, maxWidth: 310, textAlign: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderCurve: "continuous",
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 50,
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  progressFill: { backgroundColor: colors.primary, height: "100%", transformOrigin: "left center", width: "100%" },
  progressTrack: { backgroundColor: colors.primaryLight, bottom: 0, height: 5, left: 0, overflow: "hidden", position: "absolute", right: 0 },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderCurve: "continuous",
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.55, textAlign: "center" },
});
