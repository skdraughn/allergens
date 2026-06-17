import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Authenticator } from "@aws-amplify/ui-react-native";

import "@/lib/amplify";
import { SnackbarProvider } from "@/components/snackbar-provider";
import { colors } from "@/constants/theme";
import { AllergyProfileProvider, useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { RestaurantDataProvider } from "@/features/restaurants/restaurant-data-context";
import { isAmplifyConfigured } from "@/lib/amplify";

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

function RootNavigator() {
  const { isLoading } = useAllergyProfile();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
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
    </Stack>
  );
}

export default function RootLayout() {
  const app = (
    <QueryClientProvider client={queryClient}>
      <AllergyProfileProvider>
        <RestaurantDataProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </RestaurantDataProvider>
      </AllergyProfileProvider>
    </QueryClientProvider>
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SnackbarProvider>
          {isAmplifyConfigured ? (
            <Authenticator.Provider>{app}</Authenticator.Provider>
          ) : (
            app
          )}
        </SnackbarProvider>
      </SafeAreaProvider>
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
});
