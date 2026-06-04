import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AllergyProfilePicker } from "@/components/allergy-profile-picker";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenBackground } from "@/components/screen-background";
import { SecondaryButton } from "@/components/secondary-button";
import { spacing } from "@/constants/theme";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";

export function OnboardingFlow() {
  const router = useRouter();
  const { completeOnboarding, selectedAllergyIds, toggleAllergy } = useAllergyProfile();

  async function finish() {
    await completeOnboarding();
    router.replace("/home");
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <AllergyProfilePicker
          onToggleAllergy={toggleAllergy}
          selectedAllergyIds={selectedAllergyIds}
        />

        <View style={styles.actions}>
          <PrimaryButton label="Continue" onPress={finish} />
          <SecondaryButton label="Set Up Later" onPress={finish} />
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
    paddingBottom: spacing.three,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  safeArea: {
    flex: 1,
  },
});
