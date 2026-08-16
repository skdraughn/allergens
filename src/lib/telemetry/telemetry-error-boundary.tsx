import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";

import { telemetry } from "./telemetry";

type State = { failed: boolean };

export class TelemetryErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    telemetry.recordError(error, "root_render", { errorCode: "react_render_failure" });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>MySafeMenu needs a fresh start</Text>
        <Text style={styles.body}>Close and reopen the app to continue.</Text>
        <Pressable onPress={() => this.setState({ failed: false })} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontSize: 16, marginTop: 8, textAlign: "center" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  root: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  title: { color: colors.ink, fontSize: 23, fontWeight: "700", textAlign: "center" },
});
