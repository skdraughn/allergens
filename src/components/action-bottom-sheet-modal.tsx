import { ChevronDown, ChevronUp, X, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/constants/theme";

export type ActionBottomSheetAction = {
  Icon?: LucideIcon;
  label: string;
  onPress: () => void;
  subcontent?: ReactNode;
};

type ActionBottomSheetModalProps = {
  actions: ActionBottomSheetAction[];
  visible: boolean;
  onClose: () => void;
  closeLabel?: string;
  onDismissComplete?: () => void;
  scrollable?: boolean;
};

export function ActionBottomSheetModal({
  actions,
  closeLabel = "Close",
  onClose,
  onDismissComplete,
  scrollable = false,
  visible,
}: ActionBottomSheetModalProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [showScrollEndButton, setShowScrollEndButton] = useState(false);
  const [scrollEndButtonDirection, setScrollEndButtonDirection] = useState<"down" | "up">("down");
  const backdropProgress = useRef(new Animated.Value(0)).current;
  const scrollContentHeightRef = useRef(0);
  const scrollLayoutHeightRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const dismissCompleteRef = useRef(onDismissComplete);
  const sheetProgress = useRef(new Animated.Value(1)).current;

  const updateScrollEndButton = (offsetY = 0) => {
    const maxOffset = Math.max(0, scrollContentHeightRef.current - scrollLayoutHeightRef.current);
    const hasScrollableContent = maxOffset > 16;
    setShowScrollEndButton(hasScrollableContent);
    setScrollEndButtonDirection(offsetY >= maxOffset - 18 ? "up" : "down");
  };

  useEffect(() => {
    dismissCompleteRef.current = onDismissComplete;
  }, [onDismissComplete]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setScrollEndButtonDirection("down");
      updateScrollEndButton(0);
      Animated.parallel([
        Animated.timing(backdropProgress, {
          duration: 180,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(sheetProgress, {
          duration: 230,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropProgress, {
        duration: 150,
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(sheetProgress, {
        duration: 190,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        dismissCompleteRef.current?.();
      }
    });
  }, [backdropProgress, sheetProgress, visible]);

  if (!mounted) {
    return null;
  }

  const closeAction = {
    Icon: X,
    label: closeLabel,
    onPress: onClose,
    tone: "close" as const,
  };
  const allActions = [...actions, closeAction];
  const regularActionRows = actions.map((action, index) => (
    <ActionBottomSheetRow
      Icon={action.Icon}
      first={index === 0}
      iconColor={colors.primary}
      key={action.label}
      label={action.label}
      last={index === actions.length - 1}
      onPress={action.onPress}
      subcontent={action.subcontent}
    />
  ));
  const actionRows = allActions.map((action, index) => {
    const isClose = "tone" in action && action.tone === "close";

    return (
      <ActionBottomSheetRow
        Icon={action.Icon}
        first={index === 0}
        iconColor={isClose ? colors.coral : colors.primary}
        key={action.label}
        label={action.label}
        last={index === allActions.length - 1}
        onPress={action.onPress}
        subcontent={"subcontent" in action ? action.subcontent : undefined}
      />
    );
  });
  const closeRow = (
    <View style={styles.cancelGroup}>
      <ActionBottomSheetRow
        Icon={closeAction.Icon}
        first
        iconColor={colors.coral}
        label={closeAction.label}
        last
        onPress={closeAction.onPress}
      />
    </View>
  );
  const scrollEndButton = showScrollEndButton ? (
    <Pressable
      accessibilityLabel={
        scrollEndButtonDirection === "down" ? "Scroll to end of menu" : "Scroll to top of menu"
      }
      accessibilityRole="button"
      onPress={() => {
        if (scrollEndButtonDirection === "down") {
          scrollRef.current?.scrollToEnd({ animated: true });
          setScrollEndButtonDirection("up");
          return;
        }

        scrollRef.current?.scrollTo({ animated: true, y: 0 });
        setScrollEndButtonDirection("down");
      }}
      style={({ pressed }) => [
        styles.scrollEndButton,
        pressed ? styles.scrollEndButtonPressed : null,
      ]}
    >
      {scrollEndButtonDirection === "down" ? (
        <ChevronDown color={colors.primary} size={22} strokeWidth={2.5} />
      ) : (
        <ChevronUp color={colors.primary} size={22} strokeWidth={2.5} />
      )}
    </Pressable>
  ) : null;

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={mounted}>
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.backdrop,
            {
              opacity: backdropProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.26],
              }),
            },
          ]}
        />
        <Pressable
          accessibilityLabel="Close menu"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdropDismiss}
        />
        <Animated.View
          style={[
            styles.sheetWrap,
            {
              transform: [
                {
                  translateY: sheetProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, height],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 8, spacing.three) }]}>
            {scrollable ? (
              <>
                <ScrollView
                  bounces={false}
                  onContentSizeChange={(_, contentHeight) => {
                    scrollContentHeightRef.current = contentHeight;
                    updateScrollEndButton();
                  }}
                  onLayout={(event) => {
                    scrollLayoutHeightRef.current = event.nativeEvent.layout.height;
                    updateScrollEndButton();
                  }}
                  onScroll={(event) => {
                    updateScrollEndButton(event.nativeEvent.contentOffset.y);
                  }}
                  ref={scrollRef}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  style={[styles.scrollArea, { maxHeight: height * 0.62 }]}
                >
                  {regularActionRows}
                </ScrollView>
                {scrollEndButton}
                {closeRow}
              </>
            ) : (
              actionRows
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ActionBottomSheetRow({
  first,
  Icon,
  iconColor,
  label,
  last,
  onPress,
  subcontent,
}: {
  first: boolean;
  Icon?: LucideIcon;
  iconColor: string;
  label: string;
  last: boolean;
  onPress: () => void;
  subcontent?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        subcontent ? styles.rowWithSubcontent : null,
        first && styles.rowFirst,
        !last && styles.rowDivider,
        pressed ? styles.rowPressed : null,
      ]}
    >
      {Icon ? <Icon color={iconColor} size={22} strokeWidth={2.25} /> : null}
      <View style={styles.rowContent}>
        <Text maxFontSizeMultiplier={1.12} numberOfLines={1} style={styles.rowText}>
          {label}
        </Text>
        {subcontent ? <View style={styles.rowSubcontent}>{subcontent}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "#000000",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 0,
  },
  backdropDismiss: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  cancelGroup: {
    borderTopColor: "rgba(60,60,67,0.12)",
    borderTopWidth: 1,
  },
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 56,
    paddingBottom: 11,
    paddingHorizontal: spacing.two,
    paddingTop: 11,
  },
  rowContent: {
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
  },
  rowDivider: {
    borderBottomColor: "rgba(60,60,67,0.12)",
    borderBottomWidth: 1,
  },
  rowFirst: {
    paddingTop: 16,
  },
  rowPressed: {
    backgroundColor: "#F7F7FA",
  },
  rowSubcontent: {
    marginTop: 0,
  },
  rowText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  rowWithSubcontent: {
    minHeight: 68,
  },
  scrollArea: {
    alignSelf: "stretch",
  },
  scrollEndButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "rgba(242,242,247,0.96)",
    borderColor: "rgba(60,60,67,0.12)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    marginBottom: 8,
    marginRight: spacing.two,
    marginTop: -44,
    width: 36,
    zIndex: 3,
  },
  scrollEndButtonPressed: {
    backgroundColor: "#E5E5EA",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheetWrap: {
    zIndex: 2,
  },
});
