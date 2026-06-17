import { useRouter } from "expo-router";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  HeartPulse,
  Search,
} from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signIn, signUp } from "aws-amplify/auth";

import { AllergyProfilePicker } from "@/components/allergy-profile-picker";
import { IconButton } from "@/components/icon-button";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenBackground } from "@/components/screen-background";
import { SecondaryButton } from "@/components/secondary-button";
import { SetupHeroMark } from "@/components/setup-hero-mark";
import { useSnackbar } from "@/components/snackbar-provider";
import { allergyOptions } from "@/constants/allergies";
import { colors, spacing } from "@/constants/theme";
import { CreateAccountContent } from "@/features/account/account-screen";
import {
  completeNativeSocialSignIn,
  isSocialSignInCancelled,
  signInWithAppleNative,
  signInWithGoogleNative,
} from "@/features/account/native-social-auth";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";

type AuthMode = "options" | "password";
type PasswordIntent = "sign-in" | "create";
type LoadingProvider = "apple" | "google" | "password" | null;

const previewCrossContactAllergens = allergyOptions.filter((allergy) =>
  ["milk", "wheat", "egg"].includes(allergy.id),
);
const previewSaladAllergens = allergyOptions.filter((allergy) =>
  ["milk", "wheat", "sesame"].includes(allergy.id),
);

export function OnboardingFlow() {
  const router = useRouter();
  const { completeOnboarding, selectedAllergyIds, toggleAllergy } = useAllergyProfile();
  const [step, setStep] = useState<"welcome" | "profile" | "account">("welcome");

  async function finish() {
    await completeOnboarding();
    router.replace("/home");
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        {step === "welcome" ? (
          <WelcomeStep onContinue={() => setStep("profile")} />
        ) : step === "profile" ? (
          <>
            <View style={styles.profileHeader}>
              <IconButton
                Icon={ChevronLeft}
                label="Back to welcome"
                onPress={() => setStep("welcome")}
              />
            </View>
            <AllergyProfilePicker
              onToggleAllergy={toggleAllergy}
              selectedAllergyIds={selectedAllergyIds}
            />

            <View style={styles.actions}>
              <PrimaryButton label="Continue" onPress={() => setStep("account")} />
              <SecondaryButton label="Set Up Later" onPress={finish} />
            </View>
          </>
        ) : (
          <AccountChoiceStep
            onBack={() => setStep("profile")}
            onSkip={finish}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function AccountChoiceStep({
  onBack,
  onSkip,
}: {
  onBack: () => void;
  onSkip: () => Promise<void> | void;
}) {
  const { showSnackbar } = useSnackbar();
  const { syncProfilesFromCloud } = useAllergyProfile();
  const [authMode, setAuthMode] = useState<AuthMode>("options");
  const [username, setUsername] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<LoadingProvider>(null);
  const [password, setPassword] = useState("");
  const [passwordIntent, setPasswordIntent] = useState<PasswordIntent>("create");

  async function completeAuth(work: () => Promise<unknown>) {
    try {
      await work();
      await syncProfilesFromCloud();
      await onSkip();
    } catch (nextError) {
      if (isSocialSignInCancelled(nextError)) {
        return;
      }

      const message = nextError instanceof Error ? nextError.message : "Something went wrong.";
      showSnackbar({ message, title: "Account Error", tone: "error" });
    }
  }

  async function handleSocial(provider: "apple" | "google") {
    if (loadingProvider) {
      return;
    }

    setLoadingProvider(provider);
    await completeAuth(async () => {
      const payload =
        provider === "apple" ? await signInWithAppleNative() : await signInWithGoogleNative();
      await completeNativeSocialSignIn(payload);
    });
    setLoadingProvider(null);
  }

  async function handlePasswordAuth() {
    if (loadingProvider) {
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername || !password) {
      showSnackbar({
        message: "Enter your username and password.",
        title: "Account Error",
        tone: "error",
      });
      return;
    }

    if (!isValidUsername(normalizedUsername)) {
      showSnackbar({
        message: "Use 3-20 letters, numbers, underscores, or periods.",
        title: "Account Error",
        tone: "error",
      });
      return;
    }

    setLoadingProvider("password");
    try {
      if (passwordIntent === "create") {
        const result = await signUp({
          password,
          username: normalizedUsername,
        });

        if (result.nextStep.signUpStep === "CONFIRM_SIGN_UP") {
          throw new Error("Account was created but needs backend auto-confirm. Please try again.");
        }

        await signIn({
          options: {
            authFlowType: "USER_PASSWORD_AUTH",
          },
          password,
          username: normalizedUsername,
        });
      } else {
        await signIn({
          options: {
            authFlowType: "USER_PASSWORD_AUTH",
          },
          password,
          username: normalizedUsername,
        });
      }

      await syncProfilesFromCloud();
      await onSkip();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Password sign-in failed.";
      showSnackbar({ message, title: "Account Error", tone: "error" });
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <View style={styles.accountChoice}>
      <View style={styles.profileHeader}>
        <IconButton Icon={ChevronLeft} label="Back to allergy profile" onPress={onBack} />
      </View>

      <ScrollView
        contentContainerStyle={styles.accountContent}
        showsVerticalScrollIndicator={false}
      >
        <CreateAccountContent
          authMode={authMode}
          username={username}
          loadingProvider={loadingProvider}
          onApple={() => handleSocial("apple")}
          onBackToOptions={() => setAuthMode("options")}
          onChangeUsername={setUsername}
          onChangePassword={setPassword}
          onGoogle={() => handleSocial("google")}
          onPassword={() => setAuthMode("password")}
          onPasswordSubmit={handlePasswordAuth}
          onTogglePasswordIntent={() =>
            setPasswordIntent((current) => (current === "sign-in" ? "create" : "sign-in"))
          }
          password={password}
          passwordIntent={passwordIntent}
        />
      </ScrollView>

      <View style={styles.accountActions}>
        <SecondaryButton label="Continue Without Account" onPress={onSkip} />
      </View>
    </View>
  );
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string) {
  return /^[a-z0-9_.]{3,20}$/.test(value);
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.welcome}>
      <View style={styles.welcomeTop}>
        <SetupHeroMark Icon={HeartPulse} scale={0.78} />
        <View style={styles.welcomeCopy}>
          <Text style={styles.welcomeTitle}>{"{APP_NAME}"}</Text>
          <Text style={styles.welcomeSubtitle}>
            Find menu items that fit your allergy profile before you order.
          </Text>
        </View>
      </View>

      <WelcomePreview />

      <View style={styles.welcomeActions}>
        <PrimaryButton Icon={ArrowRight} label="Get Started" onPress={onContinue} />
      </View>
    </View>
  );
}

function WelcomePreview() {
  return (
    <View style={styles.previewStage}>
      <View style={[styles.previewPanel, styles.previewPanelBack]}>
        <View style={styles.previewHeader}>
          <View>
            <Text style={styles.previewRestaurantName}>Panera</Text>
            <Text style={styles.previewRestaurantMeta}>Official menu source</Text>
          </View>
        </View>
        <View style={styles.previewTabGroup}>
          <View style={[styles.previewTabButton, styles.previewTabButtonActive]}>
            <Text style={[styles.previewTabText, styles.previewTabTextActive]}>Official</Text>
          </View>
          <View style={styles.previewTabButton}>
            <Text style={styles.previewTabText}>Community</Text>
          </View>
        </View>
        <View style={styles.previewSearch}>
          <Search color={colors.muted} size={13} strokeWidth={2.4} />
          <Text style={styles.previewSearchText}>Search menu</Text>
        </View>
        <View style={styles.previewFilterRow}>
          <View style={styles.previewFilterSegment}>
            <Text style={[styles.previewFilterCount, styles.previewFilterAll]}>64</Text>
            <Text style={styles.previewFilterLabel}>All</Text>
          </View>
          <View style={[styles.previewFilterSegment, styles.previewFilterSegmentActive]}>
            <Text style={[styles.previewFilterCount, styles.previewFilterOk]}>42</Text>
            <Text style={styles.previewFilterLabel}>Ok</Text>
          </View>
          <View style={styles.previewFilterSegment}>
            <Text style={[styles.previewFilterCount, styles.previewFilterCaution]}>9</Text>
            <Text style={styles.previewFilterLabel}>Review</Text>
          </View>
          <View style={styles.previewFilterSegment}>
            <Text style={[styles.previewFilterCount, styles.previewFilterAvoid]}>13</Text>
            <Text style={styles.previewFilterLabel}>Avoid</Text>
          </View>
        </View>
        <View style={styles.previewMenuRow}>
          <View style={styles.previewMenuText}>
            <Text style={styles.previewFoodTitle}>Greek Salad</Text>
            <View style={styles.previewDirectAllergenRow}>
              {previewSaladAllergens.map((allergy) => {
                const Icon = allergy.Icon;

                return (
                  <View
                    key={allergy.id}
                    style={[styles.previewDirectAllergenDot, { backgroundColor: allergy.surface }]}
                  >
                    <Icon color={allergy.accent} size={16} strokeWidth={2.4} />
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.previewCheckBadge}>
            <Check color="#188B4D" size={16} strokeWidth={3} />
          </View>
        </View>
      </View>

      <View style={[styles.previewPanel, styles.previewPanelFront]}>
        <Text style={styles.previewPanelLabel}>Chicken Bowl</Text>
        <Text style={styles.previewDishLine}>No common allergens</Text>
        <View style={styles.previewAllergenGroup}>
          <Text style={styles.previewAllergenGroupLabel}>Cross-contact</Text>
          <View style={styles.previewAllergenRow}>
            {previewCrossContactAllergens.map((allergy) => {
              const Icon = allergy.Icon;

              return (
                <View
                  key={allergy.id}
                  style={[
                    styles.previewAllergenDot,
                    styles.previewMayContainIcon,
                    { backgroundColor: allergy.surface },
                  ]}
                >
                  <Icon color={allergy.accent} size={20} strokeWidth={2.4} />
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accountActions: {
    gap: 10,
    paddingHorizontal: spacing.three,
  },
  accountChoice: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: spacing.three,
  },
  accountContent: {
    alignItems: "flex-start",
    flexGrow: 1,
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  actions: {
    gap: 10,
    paddingBottom: spacing.three,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  safeArea: {
    flex: 1,
  },
  previewAllergenDot: {
    alignItems: "center",
    borderColor: "rgba(17,17,17,0.1)",
    borderRadius: 13,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  profileHeader: {
    paddingBottom: spacing.one,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
  },
  previewAllergenRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 6,
  },
  previewAllergenGroup: {
    marginTop: 9,
  },
  previewAllergenGroupLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  previewCheckBadge: {
    alignItems: "center",
    backgroundColor: "#E9F8EF",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  previewDirectAllergenDot: {
    alignItems: "center",
    borderColor: "rgba(17,17,17,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  previewDirectAllergenRow: {
    flexDirection: "row",
    gap: 5,
    marginTop: 8,
  },
  previewDishLine: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 5,
  },
  previewFilterAll: {
    color: colors.ink,
  },
  previewFilterAvoid: {
    color: "#FF3B30",
  },
  previewFilterCaution: {
    color: "#FF9F0A",
  },
  previewFilterCount: {
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11,
  },
  previewFilterLabel: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 10,
  },
  previewFilterOk: {
    color: "#34C759",
  },
  previewFilterSegment: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 2,
    height: 20,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: "25%",
  },
  previewFilterSegmentActive: {
    backgroundColor: colors.white,
    shadowColor: "#000000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  previewFilterRow: {
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    flexDirection: "row",
    marginTop: 8,
    padding: 2,
  },
  previewFoodTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  previewHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewMenuRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.76)",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    padding: 13,
  },
  previewMenuText: {
    flex: 1,
    minWidth: 0,
  },
  previewMayContainIcon: {
    borderColor: "#D6A33A",
    borderStyle: "dashed",
  },
  previewPanel: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 34,
  },
  previewPanelBack: {
    alignSelf: "flex-start",
    minHeight: 225,
    padding: 12,
    width: "90%",
  },
  previewPanelFront: {
    bottom: 0,
    minHeight: 122,
    padding: 14,
    position: "absolute",
    right: 0,
    width: "53%",
  },
  previewPanelLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  previewRestaurantMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  previewRestaurantName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  previewSearch: {
    alignItems: "center",
    backgroundColor: colors.backgroundCool,
    borderRadius: 13,
    flexDirection: "row",
    gap: 6,
    height: 30,
    marginTop: 8,
    paddingHorizontal: 10,
    width: "100%",
  },
  previewSearchText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  previewTabButton: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    height: 22,
    justifyContent: "center",
  },
  previewTabButtonActive: {
    backgroundColor: colors.white,
    shadowColor: "#000000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  previewTabGroup: {
    backgroundColor: "#F2F2F7",
    borderRadius: 13,
    flexDirection: "row",
    gap: 1,
    marginTop: 12,
    padding: 2,
  },
  previewTabText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
  },
  previewTabTextActive: {
    color: colors.ink,
  },
  previewStage: {
    height: 294,
    marginHorizontal: spacing.three,
    marginTop: spacing.one,
  },
  welcome: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: spacing.three,
  },
  welcomeActions: {
    paddingHorizontal: spacing.three,
  },
  welcomeCopy: {
    gap: 10,
    paddingHorizontal: spacing.four,
  },
  welcomeSubtitle: {
    color: colors.muted,
    fontSize: 21,
    lineHeight: 28,
    textAlign: "center",
  },
  welcomeTitle: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 39,
    textAlign: "center",
  },
  welcomeTop: {
    gap: spacing.three,
    paddingTop: spacing.two,
  },
});
