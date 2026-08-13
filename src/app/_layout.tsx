import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Authenticator } from "@aws-amplify/ui-react-native";

import { LaunchSplashScreen } from "@/components/launch-splash-screen";
import { LaunchSplashCompleteProvider } from "@/components/launch-splash-state";
import { SereneLoader } from "@/components/serene-loader";
import { SnackbarProvider } from "@/components/snackbar-provider";
import { StartupUpdateGate } from "@/components/startup-update-gate";
import { colors } from "@/constants/theme";
import { AllergyProfileProvider, useAllergyProfile } from "@/features/profile/allergy-profile-context";
import {
  RestaurantDataProvider,
  useRestaurantData,
} from "@/features/restaurants/restaurant-data-context";
import { isAmplifyConfigured } from "@/lib/amplify";

// Keep the native launch screen in place until the first frame of our custom
// splash has been laid out. Calling this at module scope prevents an automatic
// hide before React has had a chance to paint that matching frame.
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7,
      refetchOnMount: false,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 60 * 6,
    },
  },
});

function RootNavigator({ onStartupReady }: { onStartupReady: () => void }) {
  const { isLoading } = useAllergyProfile();
  const restaurantData = useRestaurantData();
  const startupReady = !isLoading && !restaurantData.isLoading;

  useEffect(() => {
    if (startupReady) {
      onStartupReady();
    }
  }, [onStartupReady, startupReady]);

  if (!startupReady) {
    return (
      <View style={styles.loading}>
        <SereneLoader />
      </View>
    );
  }

  if (restaurantData.error) {
    return (
      <View style={styles.catalogError}>
        <Text style={styles.catalogErrorTitle}>Restaurant catalog unavailable</Text>
        <Text style={styles.catalogErrorBody}>
          Connect to the internet and try loading the current catalog again.
        </Text>
        <Pressable onPress={() => void restaurantData.refresh()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="home" />
      <Stack.Screen name="account" options={{ presentation: "modal" }} />
      <Stack.Screen name="profile" options={{ presentation: "modal" }} />
      <Stack.Screen name="restaurant-accommodations" />
      <Stack.Screen name="restaurant-reviews" />
      <Stack.Screen name="restaurant-review" />
    </Stack>
  );
}

export default function RootLayout() {
  const [isStartupReady, setIsStartupReady] = useState(false);
  const [isLaunchSplashComplete, setIsLaunchSplashComplete] = useState(false);
  const handleStartupReady = useCallback(() => {
    setIsStartupReady(true);
  }, []);
  const handleLaunchSplashFinish = useCallback(() => {
    setIsLaunchSplashComplete(true);
  }, []);
  const app = (
    <QueryClientProvider client={queryClient}>
      <AllergyProfileProvider>
        <RestaurantDataProvider>
          <StatusBar style="dark" />
          <RootNavigator onStartupReady={handleStartupReady} />
        </RestaurantDataProvider>
      </AllergyProfileProvider>
    </QueryClientProvider>
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider preload={false}>
        <SafeAreaProvider>
          <StartupUpdateGate>
            <SnackbarProvider>
              <LaunchSplashCompleteProvider isComplete={isLaunchSplashComplete}>
                {isAmplifyConfigured ? (
                  <Authenticator.Provider>{app}</Authenticator.Provider>
                ) : (
                  app
                )}
              </LaunchSplashCompleteProvider>
            </SnackbarProvider>
          </StartupUpdateGate>
          {!isLaunchSplashComplete ? (
            <LaunchSplashScreen
              onFinish={handleLaunchSplashFinish}
              ready={isStartupReady}
            />
          ) : null}
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  catalogError: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  catalogErrorBody: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 10,
    textAlign: "center",
  },
  catalogErrorTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
});
