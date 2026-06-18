import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { colors, spacing } from "@/constants/theme";

type SnackbarTone = "error" | "info" | "success";

type SnackbarOptions = {
  message: string;
  title?: string;
  tone?: SnackbarTone;
};

type SnackbarContextValue = {
  animation: Animated.Value;
  hideSnackbar: () => void;
  snackbar: SnackbarOptions | null;
  showSnackbar: (options: SnackbarOptions) => void;
};

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: PropsWithChildren) {
  const [snackbar, setSnackbar] = useState<SnackbarOptions | null>(null);
  const animation = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideSnackbar = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    Animated.timing(animation, {
      duration: 180,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSnackbar(null);
      }
    });
  }, [animation]);

  const showSnackbar = useCallback(
    (options: SnackbarOptions) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setSnackbar(options);
      Animated.spring(animation, {
        damping: 18,
        mass: 0.7,
        stiffness: 220,
        toValue: 1,
        useNativeDriver: true,
      }).start();

      timeoutRef.current = setTimeout(hideSnackbar, 4200);
    },
    [animation, hideSnackbar],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({ animation, hideSnackbar, showSnackbar, snackbar }),
    [animation, hideSnackbar, showSnackbar, snackbar],
  );

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <SnackbarViewport />
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);

  if (!context) {
    throw new Error("useSnackbar must be used inside SnackbarProvider");
  }

  return context;
}

export function SnackbarViewport() {
  const insets = useSafeAreaInsets();
  const context = useContext(SnackbarContext);

  if (!context?.snackbar) {
    return null;
  }

  const { animation, hideSnackbar, snackbar } = context;
  const tone = snackbar.tone ?? "error";

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        {
          bottom: Math.max(insets.bottom, spacing.two),
          opacity: animation,
          transform: [
            {
              translateY: animation.interpolate({
                inputRange: [0, 1],
                outputRange: [28, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.snackbar, styles[tone]]}>
        <View style={styles.copy}>
          {snackbar.title ? <Text style={styles.title}>{snackbar.title}</Text> : null}
          <Text style={styles.message}>{snackbar.message}</Text>
        </View>
        <Pressable
          accessibilityLabel="Dismiss message"
          accessibilityRole="button"
          onPress={hideSnackbar}
          style={styles.closeButton}
        >
          <X color={colors.muted} size={18} strokeWidth={2.5} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  error: {
    borderLeftColor: "#FF3B30",
  },
  info: {
    borderLeftColor: colors.primary,
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  overlay: {
    left: spacing.two,
    position: "absolute",
    right: spacing.two,
    zIndex: 1000,
  },
  snackbar: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "rgba(17,17,17,0.1)",
    borderCurve: "continuous",
    borderLeftWidth: 4,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
  },
  success: {
    borderLeftColor: "#34C759",
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
});
