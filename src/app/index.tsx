import { Redirect } from "expo-router";

import { useAllergyProfile } from "@/features/profile/allergy-profile-context";

export default function IndexRoute() {
  const { onboardingComplete } = useAllergyProfile();

  return <Redirect href={onboardingComplete ? "/home" : "/onboarding"} />;
}
