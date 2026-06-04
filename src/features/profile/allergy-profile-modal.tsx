import { Redirect, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { AllergyProfilePicker } from "@/components/allergy-profile-picker";
import { ModalScreen } from "@/components/modal-screen";
import { PrimaryButton } from "@/components/primary-button";
import { spacing } from "@/constants/theme";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";

export function AllergyProfileModal() {
  const router = useRouter();
  const {
    completeOnboarding,
    onboardingComplete,
    selectedAllergyIds,
    toggleAllergy,
  } = useAllergyProfile();

  function closeProfile() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(onboardingComplete ? "/home" : "/onboarding");
  }

  async function saveProfile() {
    await completeOnboarding();
    closeProfile();
  }

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <ModalScreen
      actionIcon={X}
      actionLabel="Close allergy profile"
      onActionPress={closeProfile}
    >
      <AllergyProfilePicker
        onToggleAllergy={toggleAllergy}
        selectedAllergyIds={selectedAllergyIds}
      />

      <View style={styles.actions}>
        <PrimaryButton label="Save Changes" onPress={saveProfile} />
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    paddingBottom: spacing.three,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
});
