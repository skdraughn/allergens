import { useRouter } from "expo-router";
import {
  ArrowRight,
  ChevronLeft,
  ExternalLink,
  FileText,
  HeartPulse,
  Plus,
  Search,
  Sparkles,
  ShieldCheck,
  UsersRound,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { getCurrentUser, signIn, signUp } from "aws-amplify/auth";

import { AllergyProfilePicker } from "@/components/allergy-profile-picker";
import { AllergyIconChips } from "@/components/allergy-icon-chips";
import { ContinuousPulse } from "@/components/continuous-pulse";
import { IconButton } from "@/components/icon-button";
import { useLaunchSplashComplete } from "@/components/launch-splash-state";
import { ModuleSlideFadeIn } from "@/components/module-slide-fade-in";
import { RestaurantLogo } from "@/components/restaurant-logo";
import { RiseFadeIn } from "@/components/rise-fade-in";
import { ScreenBackground } from "@/components/screen-background";
import { SecondaryButton } from "@/components/secondary-button";
import { useSnackbar } from "@/components/snackbar-provider";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import { getRestaurantBrand, getRestaurantBrandBackground } from "@/data/brand-assets";
import { CreateAccountContent } from "@/features/account/account-screen";
import {
  completeNativeSocialSignIn,
  isSocialSignInCancelled,
  signInWithAppleNative,
  signInWithGoogleNative,
} from "@/features/account/native-social-auth";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { safeErrorCode } from "@/lib/telemetry/schema";
import { telemetry } from "@/lib/telemetry/telemetry";

type AuthMode = "options" | "password";
type PasswordIntent = "sign-in" | "create";
type AccountEntryIntent = PasswordIntent;
type LoadingProvider = "apple" | "google" | "password" | null;
type OnboardingStep =
  | "welcome"
  | "overview"
  | "profile"
  | "covered"
  | "restaurants"
  | "sources"
  | "menuItems"
  | "community"
  | "account";
const overviewCavaBrand = getRestaurantBrand("cava", { name: "Cava" });

const featureSteps = [
  {
    id: "restaurants",
    title: "Browse restaurants with context.",
    subtitle: "Quickly compare how entire menus relate to your allergy profile before reviewing individual items.",
  },
  {
    id: "sources",
    title: "Know where signals come from.",
    subtitle: "MySafeMenu always labels the source type.",
  },
  {
    id: "menuItems",
    title: "Review menu items.",
    subtitle: "See allergen flags, cross-contact notes, and what needs closer review.",
  },
  {
    id: "community",
    title: "Learn from the community.",
    subtitle: "Read restaurant allergy reviews from people with similar needs, then share your own experience for the next person.",
  },
] satisfies {
  id: Extract<OnboardingStep, "restaurants" | "sources" | "menuItems" | "community">;
  title: string;
  subtitle: string;
}[];

export function OnboardingFlow() {
  const router = useRouter();
  const {
    activeProfileAllergyIds,
    completeOnboarding,
    toggleAllergy,
  } = useAllergyProfile();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [accountEntryIntent, setAccountEntryIntent] = useState<AccountEntryIntent>("create");
  const completedRef = useRef(false);
  const currentStepRef = useRef<OnboardingStep>("welcome");

  useEffect(() => {
    telemetry.track("onboarding_started", { entry_point: "first_launch" });
    return () => {
      if (!completedRef.current) {
        telemetry.track("onboarding_abandoned", { step: currentStepRef.current });
      }
    };
  }, []);

  useEffect(() => {
    currentStepRef.current = step;
    telemetry.track("onboarding_step_viewed", { step });
  }, [step]);

  async function finish() {
    await completeOnboarding();
    let authState: "guest" | "signed_in" = "guest";
    try {
      await getCurrentUser();
      authState = "signed_in";
    } catch {
      // Guest onboarding is supported.
    }
    completedRef.current = true;
    telemetry.track("onboarding_completed", { auth_state: authState });
    router.replace("/home");
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        {step === "welcome" ? (
          <WelcomeStep
            onContinue={() => setStep("overview")}
            onSignIn={() => {
              setAccountEntryIntent("sign-in");
              setStep("account");
            }}
          />
        ) : step === "overview" ? (
          <OverviewStep onContinue={() => setStep("profile")} />
        ) : step === "profile" ? (
          <ProfileStep
            onContinue={() => setStep("covered")}
            onSkip={finish}
            onToggleAllergy={toggleAllergy}
            selectedAllergyIds={activeProfileAllergyIds}
          />
        ) : step === "covered" ? (
          <CoveredStep onContinue={() => setStep("restaurants")} />
        ) : step === "restaurants" ||
          step === "sources" ||
          step === "menuItems" ||
          step === "community" ? (
          <FeatureStep
            key={step}
            config={featureSteps.find((featureStep) => featureStep.id === step)!}
            onContinue={() => {
              const nextStep = getNextFeatureStep(step);
              if (nextStep === "account") {
                setAccountEntryIntent("create");
              }
              setStep(nextStep);
            }}
          />
        ) : (
          <AccountChoiceStep
            key={accountEntryIntent}
            entryIntent={accountEntryIntent}
            onBack={accountEntryIntent === "sign-in" ? () => setStep("welcome") : undefined}
            onSkip={finish}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function getNextFeatureStep(step: OnboardingStep): OnboardingStep {
  if (step === "restaurants") {
    return "sources";
  }

  if (step === "sources") {
    return "menuItems";
  }

  if (step === "menuItems") {
    return "community";
  }

  return "account";
}

function AccountChoiceStep({
  entryIntent,
  onBack,
  onSkip,
}: {
  entryIntent: AccountEntryIntent;
  onBack?: () => void;
  onSkip: () => Promise<void> | void;
}) {
  const { showSnackbar } = useSnackbar();
  const { syncProfilesFromCloud } = useAllergyProfile();
  const [authMode, setAuthMode] = useState<AuthMode>("options");
  const [username, setUsername] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<LoadingProvider>(null);
  const [password, setPassword] = useState("");
  const [passwordIntent, setPasswordIntent] = useState<PasswordIntent>(entryIntent);
  const [isPasswordFieldFocused, setIsPasswordFieldFocused] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(true);
  }, []);

  async function completeAuth(
    work: () => Promise<unknown>,
    authMethod: "apple" | "google",
  ) {
    try {
      await work();
      telemetry.track("auth_succeeded", {
        auth_action: "authenticate",
        auth_method: authMethod,
      });
      await syncProfilesFromCloud();
      await onSkip();
    } catch (nextError) {
      if (isSocialSignInCancelled(nextError)) {
        return;
      }

      telemetry.track("auth_failed", {
        auth_action: "authenticate",
        auth_method: authMethod,
        error_code: safeErrorCode(nextError),
      });
      telemetry.recordError(nextError, "authentication", {
        errorCode: safeErrorCode(nextError),
      });

      const message = nextError instanceof Error ? nextError.message : "Something went wrong.";
      showSnackbar({ message, title: "Account Error", tone: "error" });
    }
  }

  async function handleSocial(provider: "apple" | "google") {
    if (loadingProvider) {
      return;
    }

    setLoadingProvider(provider);
    telemetry.track("auth_started", {
      auth_action: "authenticate",
      auth_method: provider,
    });
    await completeAuth(async () => {
      const payload =
        provider === "apple" ? await signInWithAppleNative() : await signInWithGoogleNative();
      await completeNativeSocialSignIn(payload);
    }, provider);
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
    const authAction = passwordIntent === "create" ? "sign_up" : "sign_in";
    telemetry.track("auth_started", {
      auth_action: authAction,
      auth_method: "password",
    });
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
      telemetry.track("auth_succeeded", {
        auth_action: authAction,
        auth_method: "password",
      });
      await onSkip();
    } catch (nextError) {
      telemetry.track("auth_failed", {
        auth_action: authAction,
        auth_method: "password",
        error_code: safeErrorCode(nextError),
      });
      telemetry.recordError(nextError, "authentication", {
        errorCode: safeErrorCode(nextError),
      });
      const message = nextError instanceof Error ? nextError.message : "Password sign-in failed.";
      showSnackbar({ message, title: "Account Error", tone: "error" });
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <View style={styles.accountChoice}>
      {onBack ? (
        <RiseFadeIn isActive={isActive} delay={40} style={styles.profileHeader}>
          <IconButton
            Icon={ChevronLeft}
            label={authMode === "password" ? "Back to sign in options" : "Back to welcome"}
            onPress={() => {
              if (authMode === "password") {
                setAuthMode("options");
                setIsPasswordFieldFocused(false);
                return;
              }

              onBack();
            }}
          />
        </RiseFadeIn>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.accountContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <RiseFadeIn isActive={isActive} delay={120} style={styles.accountEntrance}>
          <CreateAccountContent
            authMode={authMode}
            isPasswordFieldFocused={isPasswordFieldFocused}
            username={username}
            loadingProvider={loadingProvider}
            onApple={() => handleSocial("apple")}
            onBackToOptions={() => {
              setAuthMode("options");
              setIsPasswordFieldFocused(false);
            }}
            onChangeUsername={setUsername}
            onChangePassword={setPassword}
            onGoogle={() => handleSocial("google")}
            onPassword={() => {
              setAuthMode("password");
              setIsPasswordFieldFocused(false);
            }}
            onPasswordInputFocus={() => setIsPasswordFieldFocused(true)}
            onPasswordSubmit={handlePasswordAuth}
            onTogglePasswordIntent={() =>
              setPasswordIntent((current) => (current === "sign-in" ? "create" : "sign-in"))
            }
            password={password}
            passwordIntent={passwordIntent}
          />
        </RiseFadeIn>
      </ScrollView>

      <RiseFadeIn isActive={isActive} delay={360} style={styles.accountActions}>
        <SecondaryButton label="Continue as Guest" onPress={onSkip} />
      </RiseFadeIn>
    </View>
  );
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string) {
  return /^[a-z0-9_.]{3,20}$/.test(value);
}

function ProfileStep({
  onContinue,
  onSkip,
  onToggleAllergy,
  selectedAllergyIds,
}: {
  onContinue: () => void;
  onSkip: () => Promise<void> | void;
  onToggleAllergy: (id: string) => void;
  selectedAllergyIds: string[];
}) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(true);
  }, []);

  return (
    <View style={styles.profileStep}>
      <View style={styles.profileTopBar}>
        <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={10}>
          <Text style={styles.profileSkipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.profileScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <RiseFadeIn isActive={isActive} delay={60} style={styles.profileCopy}>
          <Text style={styles.overviewTitle}>What are you allergic to?</Text>
        </RiseFadeIn>

        <View style={styles.profilePickerWrap}>
          <AllergyProfilePicker
            embedded
            hideHeader
            moduleDelayBase={720}
            moduleDelayStep={95}
            onToggleAllergy={onToggleAllergy}
            selectedAllergyIds={selectedAllergyIds}
          />
        </View>
      </ScrollView>

      <RiseFadeIn isActive={isActive} delay={520} style={styles.profileActions}>
        <ContinuousPulse
          duration={6200}
          horizontalExpansionMultiplier={1.3}
          maxExpansion={18}
          maxOpacity={0.1}
          pulseStyle={styles.welcomeArrowPulse}
          style={styles.welcomeArrowOuter}
          waveOffset={0.3}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={onContinue}
            style={({ pressed }) => [
              styles.welcomeArrowPressable,
              pressed && styles.welcomeArrowPressed,
            ]}
          >
            <View style={styles.welcomeArrowButton}>
              <Text style={styles.welcomeArrowLabel}>Continue</Text>
              <ArrowRight color={colors.white} size={24} strokeWidth={2.8} />
            </View>
          </Pressable>
        </ContinuousPulse>
      </RiseFadeIn>
    </View>
  );
}

function CoveredStep({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(true);
  }, []);

  return (
    <View style={styles.coveredStep}>
      <View style={styles.coveredContent}>
        <RiseFadeIn isActive={isActive} delay={60} style={styles.overviewCopy}>
          <Text style={styles.overviewTitle}>{"We've got you covered."}</Text>
          <Text style={styles.overviewSubtitle}>
            Add more allergy profiles later to check everyone at the table while you browse menus.
          </Text>
        </RiseFadeIn>

        <RiseFadeIn isActive={isActive} delay={260} style={styles.coveredGraphicWrap}>
          <CombinedProfilesGraphic isActive={isActive} />
        </RiseFadeIn>
      </View>

      <RiseFadeIn isActive={isActive} delay={520} style={styles.overviewActions}>
        <ContinuousPulse
          duration={6200}
          horizontalExpansionMultiplier={1.3}
          maxExpansion={18}
          maxOpacity={0.1}
          pulseStyle={styles.welcomeArrowPulse}
          style={styles.welcomeArrowOuter}
          waveOffset={0.3}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={onContinue}
            style={({ pressed }) => [
              styles.welcomeArrowPressable,
              pressed && styles.welcomeArrowPressed,
            ]}
          >
            <View style={styles.welcomeArrowButton}>
              <Text style={styles.welcomeArrowLabel}>Continue</Text>
              <ArrowRight color={colors.white} size={24} strokeWidth={2.8} />
            </View>
          </Pressable>
        </ContinuousPulse>
      </RiseFadeIn>
    </View>
  );
}

const combinedMergeDuration = 2100;
const combinedCompletionEnterDuration = 280;

function CombinedProfilesGraphic({ isActive }: { isActive: boolean }) {
  const mergeProgress = useSharedValue(0);
  const orbitProgress = useSharedValue(0);
  const completionProgress = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(mergeProgress);
      cancelAnimation(orbitProgress);
      cancelAnimation(completionProgress);
      mergeProgress.value = 0;
      orbitProgress.value = 0;
      completionProgress.value = 0;
      return;
    }

    mergeProgress.value = withDelay(
      260,
      withTiming(1, {
        duration: combinedMergeDuration,
        easing: ReanimatedEasing.inOut(ReanimatedEasing.quad),
      }),
    );
    orbitProgress.value = withRepeat(
      withTiming(1, {
        duration: 7600,
        easing: ReanimatedEasing.inOut(ReanimatedEasing.sin),
      }),
      -1,
      true,
    );
    completionProgress.value = withDelay(
      260 + combinedMergeDuration,
      withTiming(1, {
        duration: combinedCompletionEnterDuration,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      }),
    );

    return () => {
      cancelAnimation(mergeProgress);
      cancelAnimation(orbitProgress);
      cancelAnimation(completionProgress);
    };
  }, [completionProgress, isActive, mergeProgress, orbitProgress]);

  const haloStyle = useAnimatedStyle(() => {
    const merged = mergeProgress.value;
    const breath = (Math.sin(orbitProgress.value * Math.PI * 4) + 1) / 2;
    const baseScale = interpolate(merged, [0, 1], [0.76, 1.08], Extrapolation.CLAMP);

    return {
      opacity:
        interpolate(merged, [0, 1], [0.34, 0.76], Extrapolation.CLAMP) + breath * 0.06,
      transform: [
        { rotate: `${orbitProgress.value * 360}deg` },
        { scale: baseScale * interpolate(breath, [0, 1], [0.97, 1.04]) },
      ],
    };
  });

  const coreStyle = useAnimatedStyle(() => {
    const merged = mergeProgress.value;

    return {
      transform: [
        { scale: interpolate(merged, [0, 1], [0.88, 1.06], Extrapolation.CLAMP) },
      ],
    };
  });

  const combinedLabelStyle = useAnimatedStyle(() => {
    const completed = completionProgress.value;

    return {
      opacity: completed,
      transform: [
        { translateY: interpolate(completed, [0, 1], [8, 0], Extrapolation.CLAMP) },
        { scale: interpolate(completed, [0, 1], [0.96, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  const shieldStyle = useAnimatedStyle(() => {
    const completed = completionProgress.value;

    return {
      opacity: completed,
      transform: [
        { scale: interpolate(completed, [0, 1], [0.7, 1], Extrapolation.CLAMP) },
        { rotate: `${interpolate(completed, [0, 1], [-10, 0])}deg` },
      ],
    };
  });

  return (
    <View style={styles.combinedGraphic}>
      <View style={styles.combinedBackdrop} />
      <Animated.View style={[styles.combinedHalo, haloStyle]}>
        <View style={[styles.combinedHaloDot, styles.combinedHaloDotBlue]} />
        <View style={[styles.combinedHaloDot, styles.combinedHaloDotPurple]} />
        <View style={[styles.combinedHaloDot, styles.combinedHaloDotOrange]} />
        <View style={[styles.combinedHaloDot, styles.combinedHaloDotGreen]} />
      </Animated.View>

      <CombinedProfileNode
        accent="#007AFF"
        initial="Y"
        label="You"
        progress={mergeProgress}
        sourceX={-94}
        sourceY={-72}
        stagger={0}
      />
      <CombinedProfileNode
        accent="#AF52DE"
        initial="M"
        label="Mia"
        progress={mergeProgress}
        sourceX={94}
        sourceY={-66}
        stagger={0.035}
      />
      <CombinedProfileNode
        accent="#FF9500"
        initial="L"
        label="Leo"
        progress={mergeProgress}
        sourceX={-88}
        sourceY={76}
        stagger={0.07}
      />
      <CombinedProfileNode
        accent="#34C759"
        initial="A"
        label="Ava"
        progress={mergeProgress}
        sourceX={88}
        sourceY={78}
        stagger={0.105}
      />

      <Animated.View style={[styles.combinedCore, coreStyle]}>
        <View style={styles.combinedCoreInner}>
          <UsersRound color={colors.white} size={31} strokeWidth={2.35} />
        </View>
        <Animated.View style={[styles.combinedCoreBadge, shieldStyle]}>
          <ShieldCheck color="#188B4D" size={17} strokeWidth={2.7} />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.combinedResultLabel, combinedLabelStyle]}>
        <Sparkles color={colors.primary} size={14} strokeWidth={2.4} />
        <Text style={styles.combinedResultText}>Everyone covered</Text>
      </Animated.View>
    </View>
  );
}

function CombinedProfileNode({
  accent,
  initial,
  label,
  progress,
  sourceX,
  sourceY,
  stagger,
}: {
  accent: string;
  initial: string;
  label: string;
  progress: SharedValue<number>;
  sourceX: number;
  sourceY: number;
  stagger: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const merged = interpolate(
      progress.value,
      [0, 0.01 + stagger * 0.45, 0.93 + stagger * 0.45, 1],
      [0, 0, 1, 1],
      Extrapolation.CLAMP,
    );
    const distance = Math.sqrt(sourceX * sourceX + sourceY * sourceY);
    const arc = Math.sin(merged * Math.PI) * 14;
    const arcX = (-sourceY / distance) * arc;
    const arcY = (sourceX / distance) * arc;
    const tilt = sourceX > 0 ? 7 : -7;

    return {
      opacity: interpolate(merged, [0, 0.72, 1], [1, 0.92, 0.08], Extrapolation.CLAMP),
      transform: [
        { translateX: sourceX * (1 - merged) + arcX },
        { translateY: sourceY * (1 - merged) + arcY },
        { rotate: `${Math.sin(merged * Math.PI) * tilt}deg` },
        {
          scale: interpolate(
            merged,
            [0, 0.46, 1],
            [1, 1.06, 0.72],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.combinedProfileNode, animatedStyle]}>
      <View style={[styles.combinedProfileAvatar, { backgroundColor: accent }]}>
        <Text style={styles.combinedProfileInitial}>{initial}</Text>
      </View>
      <Text style={styles.combinedProfileLabel}>{label}</Text>
    </Animated.View>
  );
}

function FeatureStep({
  config,
  onContinue,
}: {
  config: (typeof featureSteps)[number];
  onContinue: () => void;
}) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(true);
  }, []);

  return (
    <View style={styles.featureStep}>
      <View style={styles.featureContent}>
        <RiseFadeIn isActive={isActive} delay={60} style={styles.overviewCopy}>
          <Text style={styles.overviewTitle}>{config.title}</Text>
          <Text style={styles.overviewSubtitle}>{config.subtitle}</Text>
        </RiseFadeIn>

        <RiseFadeIn isActive={isActive} delay={260} style={styles.featureGraphicWrap}>
          <FeatureGraphic id={config.id} isActive={isActive} />
        </RiseFadeIn>
      </View>

      <RiseFadeIn isActive={isActive} delay={520} style={styles.overviewActions}>
        <ContinuousPulse
          duration={6200}
          horizontalExpansionMultiplier={1.3}
          maxExpansion={18}
          maxOpacity={0.1}
          pulseStyle={styles.welcomeArrowPulse}
          style={styles.welcomeArrowOuter}
          waveOffset={0.3}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={onContinue}
            style={({ pressed }) => [
              styles.welcomeArrowPressable,
              pressed && styles.welcomeArrowPressed,
            ]}
          >
            <View style={styles.welcomeArrowButton}>
              <Text style={styles.welcomeArrowLabel}>Continue</Text>
              <ArrowRight color={colors.white} size={24} strokeWidth={2.8} />
            </View>
          </Pressable>
        </ContinuousPulse>
      </RiseFadeIn>
    </View>
  );
}

function FeatureGraphic({
  id,
  isActive,
}: {
  id: (typeof featureSteps)[number]["id"];
  isActive: boolean;
}) {
  if (id === "restaurants") {
    return <RestaurantsFeatureGraphic isActive={isActive} />;
  }

  if (id === "sources") {
    return <SourcesFeatureGraphic isActive={isActive} />;
  }

  if (id === "menuItems") {
    return <MenuItemsFeatureGraphic isActive={isActive} />;
  }

  return <CommunityFeatureGraphic isActive={isActive} />;
}

function RestaurantsFeatureGraphic({ isActive }: { isActive: boolean }) {
  const focusProgress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(focusProgress);
    focusProgress.value = 0;

    if (isActive) {
      focusProgress.value = withDelay(
        140,
        withRepeat(
          withTiming(1, {
            duration: 14000,
            easing: ReanimatedEasing.linear,
          }),
          -1,
          false,
        ),
      );
    }

    return () => cancelAnimation(focusProgress);
  }, [focusProgress, isActive]);

  const moduleStyle = useAnimatedStyle(() => {
    const progress = focusProgress.value;

    return {
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 0.015, 0.065, 0.43, 0.48, 0.52, 0.57, 0.94, 0.99, 1],
            [0, 0, -70, -70, 0, 0, -72, -72, 0, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 0.015, 0.065, 0.43, 0.48, 0.52, 0.57, 0.94, 0.99, 1],
            [0, 0, 18, 18, 0, 0, -4, -4, 0, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            progress,
            [0, 0.015, 0.065, 0.43, 0.48, 0.52, 0.57, 0.94, 0.99, 1],
            [1, 1, 1.42, 1.42, 1, 1, 1.48, 1.48, 1, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const restingShadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.015, 0.04, 0.465, 0.48, 0.52, 0.545, 0.975, 0.99, 1],
      [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const moduleDetailsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.025, 0.065, 0.43, 0.48, 0.53, 0.57, 0.94, 0.99, 1],
      [1, 1, 0.34, 0.34, 1, 1, 0.34, 0.34, 1, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const percentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.52, 0.57, 0.94, 0.99, 1],
      [1, 1, 0.38, 0.38, 1, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const countStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.025, 0.065, 0.43, 0.48, 1],
      [1, 1, 0.38, 0.38, 1, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const percentHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.035, 0.075, 0.42, 0.46, 1],
      [0, 0, 1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const countHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.54, 0.58, 0.93, 0.97, 1],
      [0, 0, 1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const percentExplanationStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.05, 0.085, 0.405, 0.445, 1],
      [0, 0, 1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          focusProgress.value,
          [0.05, 0.085, 0.405, 0.445],
          [10, 0, 0, 8],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const countExplanationStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      focusProgress.value,
      [0, 0.56, 0.595, 0.915, 0.955, 1],
      [0, 0, 1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          focusProgress.value,
          [0.56, 0.595, 0.915, 0.955],
          [10, 0, 0, 8],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={styles.restaurantFocusGraphic}>
      <View style={styles.restaurantFocusGlow} />
      <Animated.View
        pointerEvents="none"
        style={[styles.restaurantAppShadow, restingShadowStyle]}
      />
      <Animated.View style={[styles.restaurantAppModule, moduleStyle]}>
        <Animated.View style={[styles.restaurantAppDetails, moduleDetailsStyle]}>
          <View style={styles.restaurantAppModuleRow}>
            <View
              style={[
                styles.restaurantAppLogo,
                { backgroundColor: getRestaurantBrandBackground(overviewCavaBrand) },
              ]}
            >
              <RestaurantLogo brand={overviewCavaBrand} borderRadius={11} size={34} />
            </View>
            <View style={styles.restaurantAppText}>
              <Text style={styles.restaurantAppName}>Cava</Text>
              <Text style={styles.restaurantAppMeta}>Mediterranean · 64 menu items</Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.restaurantAppCompatibility}>
          <View style={styles.restaurantAppMetricWrap}>
            <Animated.View
              pointerEvents="none"
              style={[styles.restaurantAppPercentHalo, percentHaloStyle]}
            />
            <Animated.Text style={[styles.restaurantAppPercent, percentStyle]}>
              66%
            </Animated.Text>
          </View>
          <View style={styles.restaurantAppMetricWrap}>
            <Animated.View
              pointerEvents="none"
              style={[styles.restaurantAppCountHalo, countHaloStyle]}
            />
            <Animated.Text style={[styles.restaurantAppCount, countStyle]}>
              42/64
            </Animated.Text>
          </View>
          <View style={styles.restaurantAppTrack}>
            <View style={styles.restaurantAppFill} />
          </View>
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.restaurantFocusExplanation, percentExplanationStyle]}
      >
        <Text style={styles.restaurantFocusTitle}>Allergen signal</Text>
        <Text style={styles.restaurantFocusCopy}>
          66% of reviewed items showed no allergen signal matching the selected profile.
        </Text>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.restaurantFocusExplanation, countExplanationStyle]}
      >
        <View style={styles.restaurantCountDefinitionRow}>
          <View style={styles.restaurantCountDefinition}>
            <Text style={styles.restaurantCountDefinitionNumber}>42</Text>
            <Text style={styles.restaurantCountDefinitionCopy}>
              items with no matching allergen signal
            </Text>
          </View>
          <View style={styles.restaurantCountDefinitionDivider} />
          <View style={styles.restaurantCountDefinition}>
            <Text style={styles.restaurantCountDefinitionNumber}>64</Text>
            <Text style={styles.restaurantCountDefinitionCopy}>menu items reviewed</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function SourcesFeatureGraphic({ isActive }: { isActive: boolean }) {
  return (
    <View style={styles.sourceGraphic}>
      <View style={styles.sourceGraphicGlow} />
      <RiseFadeIn isActive={isActive} delay={300} distance={10}>
        <Text style={styles.sourceGraphicKicker}>HOW EACH RESULT IS BUILT</Text>
      </RiseFadeIn>
      <ModuleSlideFadeIn
        delay={720}
        distance={-96}
        duration={980}
        isActive={isActive}
        style={styles.sourceCard}
      >
        <View style={styles.sourceIconBadge}>
          <ShieldCheck color={colors.primary} size={22} strokeWidth={2.5} />
        </View>
        <View style={styles.sourceTextBlock}>
          <Text style={styles.sourceTitle}>Official source</Text>
          <Text style={styles.sourceCopy}>
            Published allergen or ingredient data from the restaurant.
          </Text>
        </View>
        <View style={styles.sourceDirectPill}>
          <Text style={styles.sourceDirectText}>DIRECT</Text>
        </View>
      </ModuleSlideFadeIn>

      <ModuleSlideFadeIn
        delay={815}
        distance={96}
        duration={980}
        isActive={isActive}
        style={styles.sourceCard}
      >
        <View style={[styles.sourceIconBadge, styles.sourceOrangeBadge]}>
          <FileText color="#B25E00" size={22} strokeWidth={2.5} />
        </View>
        <View style={styles.sourceTextBlock}>
          <Text style={styles.sourceTitle}>Ingredient intelligence</Text>
          <Text style={styles.sourceCopy}>
            An estimate from menu names, descriptions, and ingredient text.
          </Text>
        </View>
        <View style={styles.sourceEstimatePill}>
          <Text style={styles.sourceEstimateText}>ESTIMATE</Text>
        </View>
      </ModuleSlideFadeIn>
    </View>
  );
}

function MenuItemsFeatureGraphic({ isActive }: { isActive: boolean }) {
  const containsAllergen = allergyOptions.find((option) => option.id === "milk");
  const crossContactAllergen = allergyOptions.find((option) => option.id === "wheat");
  const ContainsIcon = containsAllergen?.Icon;
  const CrossContactIcon = crossContactAllergen?.Icon;

  return (
    <View style={styles.menuItemDetailsGraphic}>
      <RiseFadeIn
        isActive={isActive}
        delay={360}
        distance={14}
        style={styles.featurePhone}
      >
        <View style={styles.switchPhoneHandle} />
        <View style={styles.menuItemDetailsAppSlice}>
          <Text style={styles.menuItemDetailsTitle}>Harvest Bowl</Text>
          <Text style={styles.menuItemDetailsDescription}>
            Chicken, rice, greens, feta, and dressing.
            <Text style={styles.menuItemDetailsInlineLink}> View Ingredients</Text>
          </Text>

          <View style={styles.menuItemDetailsSection}>
            <View style={styles.menuItemDetailsSectionHeader}>
              <Text style={styles.menuItemDetailsSectionTitle}>Allergen Details</Text>
              <View style={styles.menuItemDetailsSourceCue}>
                <ShieldCheck color={colors.primary} size={13} strokeWidth={2.45} />
                <Text style={styles.menuItemDetailsSourceText}>Official source</Text>
                <ExternalLink color={colors.primary} size={12} strokeWidth={2.5} />
              </View>
            </View>

            <View style={styles.menuItemDetailsAllergenGroups}>
              <View style={styles.menuItemDetailsAllergenGroup}>
                <Text style={styles.menuItemDetailsAllergenGroupTitle}>Contains</Text>
                <View style={styles.menuItemDetailsAllergenWrap}>
                  <View style={[styles.menuItemDetailsAllergenChip, styles.menuItemDetailsMatchedChip]}>
                    {ContainsIcon ? (
                      <ContainsIcon color="#B42318" size={15} strokeWidth={2.35} />
                    ) : null}
                    <Text style={[styles.menuItemDetailsAllergenChipText, styles.menuItemDetailsMatchedText]}>
                      Milk
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.menuItemDetailsAllergenGroup}>
                <Text style={styles.menuItemDetailsAllergenGroupTitle}>Cross-contact</Text>
                <View style={styles.menuItemDetailsAllergenWrap}>
                  <View style={[styles.menuItemDetailsAllergenChip, styles.menuItemDetailsMatchedChip]}>
                    {CrossContactIcon ? (
                      <CrossContactIcon color="#B42318" size={15} strokeWidth={2.35} />
                    ) : null}
                    <Text style={[styles.menuItemDetailsAllergenChipText, styles.menuItemDetailsMatchedText]}>
                      Wheat
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </RiseFadeIn>
    </View>
  );
}

function CommunityFeatureGraphic({ isActive }: { isActive: boolean }) {
  const communityProgress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(communityProgress);
    communityProgress.value = 0;

    if (isActive) {
      communityProgress.value = withDelay(
        340,
        withRepeat(
          withTiming(1, {
            duration: 9600,
            easing: ReanimatedEasing.linear,
          }),
          -1,
          false,
        ),
      );
    }

    return () => cancelAnimation(communityProgress);
  }, [communityProgress, isActive]);

  const summaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      communityProgress.value,
      [0, 0.035, 0.12, 0.93, 1],
      [0, 0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          communityProgress.value,
          [0.035, 0.12, 0.93, 1],
          [0.96, 1, 1, 0.98],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          communityProgress.value,
          [0.035, 0.12],
          [10, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const firstReviewStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      communityProgress.value,
      [0, 0.12, 0.21, 0.88, 0.96, 1],
      [0, 0, 1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          communityProgress.value,
          [0.12, 0.21, 0.88, 0.96],
          [-48, 0, 0, -12],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          communityProgress.value,
          [0.21, 0.54, 0.88],
          [0, -3, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const secondReviewStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      communityProgress.value,
      [0, 0.24, 0.33, 0.88, 0.96, 1],
      [0, 0, 1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          communityProgress.value,
          [0.24, 0.33, 0.88, 0.96],
          [48, 0, 0, 12],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          communityProgress.value,
          [0.33, 0.62, 0.88],
          [0, 3, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const contributionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      communityProgress.value,
      [0, 0.38, 0.47, 0.88, 0.96, 1],
      [0, 0, 1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          communityProgress.value,
          [0.38, 0.47, 0.88, 0.96],
          [0.96, 1, 1, 0.98],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          communityProgress.value,
          [0.38, 0.47, 0.88, 0.96],
          [12, 0, 0, 6],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={styles.communityGraphic}>
      <View style={styles.communityGraphicGlow} />

      <Animated.View style={[styles.communitySummaryCard, summaryStyle]}>
        <View style={styles.communitySummaryIcon}>
          <UsersRound color={colors.primary} size={19} strokeWidth={2.45} />
        </View>
        <View style={styles.communitySummaryCopy}>
          <Text style={styles.communitySummaryKicker}>ALLERGY COMMUNITY</Text>
          <View style={styles.communitySummaryRatingRow}>
            <CommunityHeartRating rating={5} size={14} />
            <Text style={styles.communitySummaryRating}>4.7 from 38 reviews</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.communityReviewCard, styles.communityReviewCardLeft, firstReviewStyle]}>
        <View style={styles.communityReviewHeader}>
          <CommunityHeartRating rating={5} size={13} />
          <View style={[styles.communityAvatar, styles.communityAvatarBlue]}>
            <Text style={styles.communityAvatarText}>M</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.communityReviewBody}>
          “Staff walked me through the ingredient binder.”
        </Text>
        <Text style={styles.communityReviewMeta}>Milk · Sesame</Text>
      </Animated.View>

      <Animated.View style={[styles.communityReviewCard, styles.communityReviewCardRight, secondReviewStyle]}>
        <View style={styles.communityReviewHeader}>
          <CommunityHeartRating rating={4} size={13} />
          <View style={[styles.communityAvatar, styles.communityAvatarCoral]}>
            <Text style={styles.communityAvatarText}>J</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.communityReviewBody}>
          “They changed gloves and used a clean bowl.”
        </Text>
        <Text style={styles.communityReviewMeta}>Peanut · Tree nuts</Text>
      </Animated.View>

      <Animated.View style={[styles.communityContributionPill, contributionStyle]}>
        <View style={styles.communityContributionIcon}>
          <Plus color={colors.primary} size={15} strokeWidth={2.7} />
        </View>
        <Text style={styles.communityContributionText}>Share your experience</Text>
      </Animated.View>
    </View>
  );
}

function CommunityHeartRating({ rating, size }: { rating: number; size: number }) {
  return (
    <View style={styles.communityHeartRating}>
      {[1, 2, 3, 4, 5].map((value) => (
        <HeartPulse
          color={value <= rating ? colors.coral : "#C7C7CC"}
          key={value}
          size={size}
          strokeWidth={2.45}
        />
      ))}
    </View>
  );
}

function OverviewStep({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(true);
  }, []);

  return (
    <View style={styles.overview}>
      <View style={styles.overviewContent}>
        <RiseFadeIn isActive={isActive} delay={60} style={styles.overviewCopy}>
          <Text style={styles.overviewTitle}>Check menus with your allergy profile.</Text>
          <Text style={styles.overviewSubtitle}>
            Search restaurants and review allergen flags before you order.
          </Text>
        </RiseFadeIn>

        <RiseFadeIn isActive={isActive} delay={220} style={styles.overviewGraphicWrap}>
          <OverviewMockups />
        </RiseFadeIn>
      </View>

      <RiseFadeIn isActive={isActive} delay={420} style={styles.overviewActions}>
        <ContinuousPulse
          duration={6200}
          horizontalExpansionMultiplier={1.3}
          maxExpansion={18}
          maxOpacity={0.1}
          pulseStyle={styles.welcomeArrowPulse}
          style={styles.welcomeArrowOuter}
          waveOffset={0.3}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={onContinue}
            style={({ pressed }) => [
              styles.welcomeArrowPressable,
              pressed && styles.welcomeArrowPressed,
            ]}
          >
            <View style={styles.welcomeArrowButton}>
              <Text style={styles.welcomeArrowLabel}>Continue</Text>
              <ArrowRight color={colors.white} size={24} strokeWidth={2.8} />
            </View>
          </Pressable>
        </ContinuousPulse>
      </RiseFadeIn>
    </View>
  );
}

function OverviewMockups() {
  return (
    <View style={styles.mockupStage}>
      <View style={styles.mockupPhone}>
        <View style={styles.mockupPhoneBar} />
        <View style={styles.mockupSearch}>
          <Search color={colors.muted} size={13} strokeWidth={2.5} />
          <Text style={styles.mockupSearchText}>Search restaurants</Text>
        </View>

        <View style={styles.mockupRestaurantRow}>
          <View style={styles.mockupRestaurantText}>
            <Text style={styles.mockupRestaurantName}>Sweetgreen</Text>
            <View style={styles.mockupSourcePill}>
              <ShieldCheck color={colors.primary} size={12} strokeWidth={2.5} />
              <Text style={styles.mockupSourceText}>Official source</Text>
            </View>
          </View>
          <View style={styles.mockupStatusPill}>
            <Text style={styles.mockupStatusText}>Open</Text>
          </View>
        </View>

        <View style={styles.mockupTabs}>
          <View style={[styles.mockupTab, styles.mockupTabActive]}>
            <Text style={styles.mockupTabTextActive}>Menu</Text>
          </View>
          <View style={styles.mockupTab}>
            <Text style={styles.mockupTabText}>Profile</Text>
          </View>
        </View>

        <View style={styles.mockupFilterRow}>
          <View style={[styles.mockupFilterChip, styles.mockupFilterChipActive]}>
            <Text style={styles.mockupFilterCountActive}>42</Text>
            <Text style={styles.mockupFilterTextActive}>Ok</Text>
          </View>
          <View style={styles.mockupFilterChip}>
            <Text style={styles.mockupFilterCount}>9</Text>
            <Text style={styles.mockupFilterText}>Review</Text>
          </View>
          <View style={styles.mockupFilterChip}>
            <Text style={styles.mockupFilterCount}>13</Text>
            <Text style={styles.mockupFilterText}>Avoid</Text>
          </View>
        </View>

        <View style={styles.mockupMenuGroup}>
          <View style={styles.mockupMenuRow}>
            <View style={styles.mockupMenuText}>
              <Text style={styles.mockupMenuTitle}>Harvest Bowl</Text>
              <View style={styles.mockupNoticeRow}>
                <Text style={styles.mockupNotice}>Cross-contact: Milk</Text>
                <AllergyIconChips
                  allergyIds={["milk", "wheat"]}
                  compact
                  crossContact
                  emptyLabel={null}
                  highlightedIds={["milk"]}
                  maxVisible={4}
                  overlap
                  overlapOffset={-4}
                  preserveOrder
                  size={20}
                  style={styles.mockupNoticeIcons}
                />
              </View>
            </View>
            <View style={[styles.mockupVerdictPill, styles.mockupVerdictReview]}>
              <Text style={[styles.mockupVerdictText, styles.mockupVerdictTextReview]}>Review</Text>
            </View>
          </View>
        </View>

      </View>

      <View style={styles.mockupDetailPanel}>
        <View style={styles.mockupHomeRow}>
          <View
            style={[
              styles.mockupHomeLogo,
              { backgroundColor: getRestaurantBrandBackground(overviewCavaBrand) },
            ]}
          >
            <RestaurantLogo brand={overviewCavaBrand} borderRadius={9} size={28} />
          </View>
          <View style={styles.mockupHomeText}>
            <Text style={styles.mockupHomeName}>Cava</Text>
            <Text style={styles.mockupHomeMeta}>64 menu items</Text>
          </View>
          <View style={styles.mockupCompatibilityBlock}>
            <Text style={styles.mockupCompatibilityPercent}>66%</Text>
            <Text style={styles.mockupCompatibilityCount}>42/64</Text>
            <View style={styles.mockupCompatibilityTrack}>
              <View style={styles.mockupCompatibilityFill} />
            </View>
          </View>
        </View>

        <View style={styles.mockupHomeAllergens}>
          <Text style={styles.mockupDetailTitle}>Your allergens</Text>
          <AllergyIconChips
            allergyIds={["peanut", "milk", "egg", "wheat"]}
            emptyLabel={null}
            highlightedIds="all"
            maxVisible={4}
            overlap
            overlapOffset={-5}
            preserveOrder
            size={24}
            style={styles.mockupProfileIcons}
          />
        </View>
      </View>
    </View>
  );
}

function WelcomeStep({
  onContinue,
  onSignIn,
}: {
  onContinue: () => void;
  onSignIn: () => void;
}) {
  const isLaunchSplashComplete = useLaunchSplashComplete();

  return (
    <View style={styles.welcome}>
      <View style={styles.welcomeCenter}>
        <RiseFadeIn
          isActive={isLaunchSplashComplete}
          delay={80}
          style={styles.welcomeTitleWrap}
        >
          <Text style={styles.welcomeTitle}>Welcome</Text>
        </RiseFadeIn>
      </View>

      <View style={styles.welcomeActions}>
        <RiseFadeIn
          isActive={isLaunchSplashComplete}
          delay={180}
          style={styles.welcomeSubtitleWrap}
        >
          <Text style={styles.welcomeSubtitle}>
            Check for <Text style={styles.welcomeSubtitleAccent}>allergens</Text> before you order.
          </Text>
        </RiseFadeIn>

        <RiseFadeIn
          isActive={isLaunchSplashComplete}
          delay={280}
          style={styles.welcomeArrowEntrance}
        >
          <ContinuousPulse
            duration={6200}
            horizontalExpansionMultiplier={1.3}
            maxExpansion={18}
            maxOpacity={0.1}
            pulseStyle={styles.welcomeArrowPulse}
            style={styles.welcomeArrowOuter}
            waveOffset={0.3}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get started"
              onPress={onContinue}
              style={({ pressed }) => [
                styles.welcomeArrowPressable,
                pressed && styles.welcomeArrowPressed,
              ]}
            >
              <View style={styles.welcomeArrowButton}>
                <Text style={styles.welcomeArrowLabel}>Get Started</Text>
                <ArrowRight color={colors.white} size={24} strokeWidth={2.8} />
              </View>
            </Pressable>
          </ContinuousPulse>
        </RiseFadeIn>

        <RiseFadeIn
          isActive={isLaunchSplashComplete}
          delay={440}
          style={styles.welcomeAccountRow}
        >
          <Text style={styles.welcomeAccountText}>I already have an account.</Text>
          <Pressable accessibilityRole="link" onPress={onSignIn}>
            <Text style={styles.welcomeSignInText}>Sign In</Text>
          </Pressable>
        </RiseFadeIn>

        <RiseFadeIn
          isActive={isLaunchSplashComplete}
          delay={560}
          style={styles.welcomeLegalRow}
        >
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL("https://www.mysafemenu.com/privacy")}
          >
            <Text style={styles.welcomeLegalText}>Privacy Policy</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL("https://www.mysafemenu.com/terms")}
          >
            <Text style={styles.welcomeLegalText}>Terms of Service</Text>
          </Pressable>
        </RiseFadeIn>
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
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  accountEntrance: {
    width: "100%",
  },
  coveredContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  coveredGraphicWrap: {
    marginTop: 54,
    width: "100%",
  },
  coveredStep: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: spacing.two,
  },
  combinedBackdrop: {
    backgroundColor: "rgba(0,122,255,0.045)",
    borderRadius: 138,
    height: 276,
    position: "absolute",
    width: 276,
  },
  combinedCore: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(0,122,255,0.16)",
    borderCurve: "continuous",
    borderRadius: 45,
    borderWidth: 1,
    boxShadow: "0 18px 40px rgba(0,122,255,0.18)",
    height: 90,
    justifyContent: "center",
    left: "50%",
    marginLeft: -45,
    marginTop: -45,
    position: "absolute",
    top: "50%",
    width: 90,
    zIndex: 4,
  },
  combinedCoreBadge: {
    alignItems: "center",
    backgroundColor: "#EAF8EF",
    borderColor: colors.white,
    borderRadius: 14,
    borderWidth: 3,
    bottom: -2,
    height: 29,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 29,
  },
  combinedCoreInner: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  combinedGraphic: {
    alignItems: "center",
    height: 312,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  combinedHalo: {
    borderColor: "rgba(0,122,255,0.25)",
    borderRadius: 94,
    borderStyle: "dashed",
    borderWidth: 1.5,
    height: 188,
    position: "absolute",
    width: 188,
  },
  combinedHaloDot: {
    borderColor: colors.white,
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    position: "absolute",
    width: 14,
  },
  combinedHaloDotBlue: {
    backgroundColor: "#007AFF",
    left: 85,
    top: -8,
  },
  combinedHaloDotGreen: {
    backgroundColor: "#34C759",
    left: -8,
    top: 85,
  },
  combinedHaloDotOrange: {
    backgroundColor: "#FF9500",
    bottom: -8,
    left: 85,
  },
  combinedHaloDotPurple: {
    backgroundColor: "#AF52DE",
    right: -8,
    top: 85,
  },
  combinedProfileAvatar: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.92)",
    borderRadius: 25,
    borderWidth: 3,
    boxShadow: "0 10px 22px rgba(17,17,17,0.12)",
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  combinedProfileInitial: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  combinedProfileLabel: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 10,
    color: colors.ink,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  combinedProfileNode: {
    alignItems: "center",
    gap: 4,
    left: "50%",
    marginLeft: -31,
    marginTop: -34,
    position: "absolute",
    top: "50%",
    width: 62,
    zIndex: 3,
  },
  combinedResultLabel: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(0,122,255,0.14)",
    borderRadius: 16,
    borderWidth: 1,
    bottom: 17,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    position: "absolute",
  },
  combinedResultText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
  },
  communityAvatar: {
    alignItems: "center",
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  communityAvatarBlue: {
    backgroundColor: "#DDEEFF",
  },
  communityAvatarCoral: {
    backgroundColor: "#FFE3EA",
  },
  communityAvatarText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
  },
  communityContributionIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  communityContributionPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: "rgba(0,122,255,0.16)",
    borderCurve: "continuous",
    borderRadius: 22,
    borderWidth: 1,
    bottom: 0,
    boxShadow: "0 12px 30px rgba(0,74,173,0.12)",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    left: "18%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
    right: "18%",
    zIndex: 5,
  },
  communityContributionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  communityGraphic: {
    alignItems: "center",
    height: 312,
    justifyContent: "center",
    position: "relative",
    width: "100%",
  },
  communityGraphicGlow: {
    backgroundColor: "rgba(184,77,103,0.07)",
    borderRadius: 142,
    height: 270,
    position: "absolute",
    width: 284,
  },
  communityHeartRating: {
    flexDirection: "row",
    gap: 2,
  },
  communityReviewBody: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  communityReviewCard: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: colors.line,
    borderCurve: "continuous",
    borderRadius: 21,
    borderWidth: 1,
    boxShadow: "0 16px 38px rgba(17,17,17,0.09)",
    gap: 6,
    padding: 12,
    position: "absolute",
    width: "78%",
  },
  communityReviewCardLeft: {
    left: 0,
    top: 74,
    zIndex: 2,
  },
  communityReviewCardRight: {
    right: 0,
    top: 164,
    zIndex: 3,
  },
  communityReviewHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  communityReviewMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  communitySummaryCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: "rgba(184,77,103,0.14)",
    borderCurve: "continuous",
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: "0 14px 34px rgba(17,17,17,0.08)",
    flexDirection: "row",
    gap: 10,
    padding: 12,
    position: "absolute",
    top: 2,
    width: "72%",
    zIndex: 1,
  },
  communitySummaryCopy: {
    flex: 1,
    gap: 4,
  },
  communitySummaryIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  communitySummaryKicker: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  communitySummaryRating: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
  },
  communitySummaryRatingRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  featureContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  featureGraphicWrap: {
    marginTop: 40,
    width: "100%",
  },
  featurePhone: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: "0 22px 52px rgba(0,0,0,0.1)",
    gap: 12,
    minHeight: 286,
    padding: 14,
    width: "88%",
    zIndex: 2,
  },
  featureSearchBar: {
    alignItems: "center",
    backgroundColor: colors.backgroundCool,
    borderRadius: 15,
    flexDirection: "row",
    gap: 8,
    height: 34,
    paddingHorizontal: 12,
  },
  featureSearchText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  featureStep: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: spacing.two,
  },
  menuItemDetailsAllergenChip: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  menuItemDetailsAllergenChipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  menuItemDetailsAllergenGroup: {
    gap: 6,
  },
  menuItemDetailsAllergenGroups: {
    gap: 12,
    marginTop: 8,
  },
  menuItemDetailsAllergenGroupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  menuItemDetailsAllergenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  menuItemDetailsAppSlice: {
    gap: 18,
    width: "100%",
  },
  menuItemDetailsDescription: {
    color: "#3C3C43",
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  },
  menuItemDetailsGraphic: {
    alignItems: "center",
    height: 312,
    justifyContent: "center",
    width: "100%",
  },
  menuItemDetailsInlineLink: {
    color: colors.primary,
    fontWeight: "800",
  },
  menuItemDetailsMatchedChip: {
    backgroundColor: "#FFE9E7",
    borderColor: "rgba(255,59,48,0.24)",
    borderWidth: 1,
  },
  menuItemDetailsMatchedText: {
    color: "#B42318",
  },
  menuItemDetailsSection: {
    gap: 9,
    paddingTop: 3,
  },
  menuItemDetailsSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  menuItemDetailsSectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  menuItemDetailsSourceCue: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  menuItemDetailsSourceText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  menuItemDetailsTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 28,
  },
  mockupChip: {
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(0,122,255,0.16)",
    borderRadius: 12,
    borderWidth: 1,
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  mockupChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  mockupDetailPanel: {
    backgroundColor: colors.white,
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    bottom: 0,
    boxShadow: "0 18px 34px rgba(0,0,0,0.12)",
    padding: 13,
    position: "absolute",
    right: 0,
    width: "54%",
    zIndex: 3,
  },
  mockupDetailTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
  mockupFlagReview: {
    backgroundColor: "#FFF4DC",
    borderRadius: 10,
    color: "#9A6200",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 12,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  mockupFlagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  mockupFlagSafe: {
    backgroundColor: "#EAF8EF",
    borderRadius: 10,
    color: "#188B4D",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 12,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  mockupGuideDot: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
    marginTop: 4,
    width: 8,
  },
  mockupGuideRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
  },
  mockupGuideText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 9,
  },
  mockupCompatibilityBlock: {
    alignItems: "flex-end",
    minWidth: 48,
  },
  mockupCompatibilityCount: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
    marginTop: 1,
  },
  mockupCompatibilityFill: {
    backgroundColor: "#34C759",
    borderRadius: 28,
    height: "100%",
    width: "66%",
  },
  mockupCompatibilityPercent: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  mockupCompatibilityTrack: {
    backgroundColor: "#E5E5EA",
    borderRadius: 28,
    height: 4,
    marginTop: 5,
    overflow: "hidden",
    width: 44,
  },
  mockupHomeAllergens: {
    alignItems: "flex-start",
    gap: 5,
    marginTop: 10,
  },
  mockupHomeLogo: {
    alignItems: "center",
    borderRadius: 13,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  mockupHomeMeta: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 1,
  },
  mockupHomeName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  mockupHomeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  mockupHomeText: {
    flex: 1,
    minWidth: 0,
  },
  mockupLogo: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  mockupMenuCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 13,
  },
  mockupMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mockupMenuTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
  mockupPhone: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: "0 22px 42px rgba(0,0,0,0.1)",
    minHeight: 272,
    padding: 13,
    width: "82%",
    zIndex: 2,
  },
  mockupPhoneBar: {
    alignSelf: "center",
    backgroundColor: "rgba(17,17,17,0.16)",
    borderRadius: 3,
    height: 5,
    marginBottom: 13,
    width: 52,
  },
  mockupRestaurantMeta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
  },
  mockupRestaurantName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  mockupRestaurantRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },
  mockupRestaurantText: {
    flex: 1,
    minWidth: 0,
  },
  mockupSearch: {
    alignItems: "center",
    backgroundColor: colors.backgroundCool,
    borderRadius: 14,
    flexDirection: "row",
    gap: 7,
    height: 32,
    paddingHorizontal: 11,
  },
  mockupSearchText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  mockupStage: {
    height: 326,
    justifyContent: "center",
    position: "relative",
    width: "100%",
  },
  mockupStatusPill: {
    backgroundColor: "#EAF8EF",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  mockupStatusText: {
    color: "#188B4D",
    fontSize: 9,
    fontWeight: "900",
  },
  mockupTab: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    height: 24,
    justifyContent: "center",
  },
  mockupTabActive: {
    backgroundColor: colors.white,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  mockupTabText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  mockupTabTextActive: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
  },
  mockupTabs: {
    backgroundColor: "#F2F2F7",
    borderRadius: 13,
    flexDirection: "row",
    gap: 2,
    marginTop: 12,
    padding: 2,
  },
  mockupDivider: {
    backgroundColor: colors.line,
    height: 1,
  },
  mockupFilterChip: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderColor: "rgba(60,60,67,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 26,
    paddingHorizontal: 7,
  },
  mockupFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mockupFilterCount: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  mockupFilterCountActive: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "900",
  },
  mockupFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  mockupFilterText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "600",
  },
  mockupFilterTextActive: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  mockupMenuGroup: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    overflow: "hidden",
  },
  mockupMenuRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  mockupMenuText: {
    flex: 1,
    minWidth: 0,
  },
  mockupNotice: {
    color: "#6F4B00",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },
  mockupNoticeAvoid: {
    color: "#B42318",
    fontWeight: "700",
  },
  mockupNoticeIcons: {
    flexShrink: 0,
    marginTop: 0,
  },
  mockupNoticeRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 4,
  },
  mockupProfileIcons: {
    marginTop: 0,
  },
  mockupSourcePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    borderRadius: 13,
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
    minHeight: 22,
    paddingHorizontal: 8,
  },
  mockupSourceText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  mockupVerdictAvoid: {
    backgroundColor: "#FFF0F0",
  },
  mockupVerdictPill: {
    alignItems: "center",
    borderRadius: 28,
    justifyContent: "center",
    minHeight: 26,
    minWidth: 54,
    paddingHorizontal: 8,
  },
  mockupVerdictReview: {
    backgroundColor: "#FFF6E5",
  },
  mockupVerdictText: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  mockupVerdictTextAvoid: {
    color: "#D92D20",
  },
  mockupVerdictTextReview: {
    color: "#B25E00",
  },
  overview: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: spacing.two,
  },
  overviewActions: {
    paddingHorizontal: spacing.three,
    width: "100%",
  },
  overviewContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  overviewCopy: {
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  overviewGraphicWrap: {
    marginTop: 40,
    width: "100%",
  },
  overviewSubtitle: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "300",
    lineHeight: 23,
    maxWidth: 280,
    textAlign: "center",
  },
  overviewTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 29,
    maxWidth: 315,
    textAlign: "center",
  },
  safeArea: {
    flex: 1,
  },
  restaurantAppCompatibility: {
    alignItems: "flex-end",
    minWidth: 74,
  },
  restaurantAppCount: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 1,
  },
  restaurantAppCountHalo: {
    backgroundColor: "rgba(0,122,255,0.16)",
    borderRadius: 9,
    boxShadow: "0 0 12px rgba(0,122,255,0.16)",
    height: 16,
    position: "absolute",
    right: -5,
    top: 0,
    width: 46,
  },
  restaurantAppDetails: {
    flex: 1,
    minWidth: 0,
  },
  restaurantAppFill: {
    backgroundColor: "#34C759",
    borderRadius: 999,
    height: "100%",
    width: "66%",
  },
  restaurantAppLogo: {
    alignItems: "center",
    borderRadius: 17,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  restaurantAppMeta: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  restaurantAppMetricWrap: {
    alignItems: "flex-end",
    position: "relative",
    width: 66,
  },
  restaurantAppModule: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: "absolute",
    top: 117,
    width: "90%",
    zIndex: 2,
  },
  restaurantAppShadow: {
    backgroundColor: colors.white,
    borderCurve: "continuous",
    borderRadius: 24,
    boxShadow: "0 18px 40px rgba(0,0,0,0.11)",
    minHeight: 78,
    position: "absolute",
    top: 117,
    width: "90%",
    zIndex: 1,
  },
  restaurantAppModuleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  restaurantAppName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  restaurantAppPercent: {
    color: colors.ink,
    fontSize: 19,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    lineHeight: 23,
  },
  restaurantAppPercentHalo: {
    backgroundColor: "rgba(0,122,255,0.16)",
    borderRadius: 12,
    boxShadow: "0 0 14px rgba(0,122,255,0.18)",
    height: 23,
    position: "absolute",
    right: -5,
    top: 0,
    width: 58,
  },
  restaurantAppText: {
    flex: 1,
    minWidth: 0,
  },
  restaurantAppTrack: {
    backgroundColor: "#E5E5EA",
    borderRadius: 999,
    height: 5,
    marginTop: 7,
    overflow: "hidden",
    width: 66,
  },
  restaurantCountDefinition: {
    alignItems: "center",
    flex: 1,
    gap: 3,
  },
  restaurantCountDefinitionCopy: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
    textAlign: "center",
  },
  restaurantCountDefinitionDivider: {
    backgroundColor: colors.line,
    height: 36,
    width: 1,
  },
  restaurantCountDefinitionNumber: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 20,
  },
  restaurantCountDefinitionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  restaurantFocusCopy: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 5,
    textAlign: "center",
  },
  restaurantFocusExplanation: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: "rgba(0,122,255,0.16)",
    borderCurve: "continuous",
    borderRadius: 18,
    borderWidth: 1,
    bottom: 13,
    boxShadow: "0 14px 28px rgba(0,0,0,0.09)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    position: "absolute",
    width: "88%",
    zIndex: 4,
  },
  restaurantFocusGlow: {
    backgroundColor: "rgba(0,122,255,0.06)",
    borderRadius: 140,
    height: 258,
    position: "absolute",
    top: 27,
    transform: [{ scaleX: 1.18 }],
    width: 258,
  },
  restaurantFocusGraphic: {
    alignItems: "center",
    height: 312,
    position: "relative",
    width: "100%",
  },
  restaurantFocusTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 3,
    textAlign: "center",
  },
  sourceCard: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 88,
    padding: 14,
    width: "90%",
  },
  sourceCopy: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 3,
  },
  sourceIconBadge: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 17,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  sourceDirectPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  sourceDirectText: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 10,
  },
  sourceEstimatePill: {
    backgroundColor: "#FFF6E5",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  sourceEstimateText: {
    color: "#B25E00",
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 10,
  },
  sourceGraphic: {
    alignItems: "center",
    gap: 11,
    height: 312,
    justifyContent: "center",
    position: "relative",
    width: "100%",
  },
  sourceGraphicGlow: {
    backgroundColor: "rgba(0,122,255,0.06)",
    borderRadius: 138,
    height: 256,
    position: "absolute",
    transform: [{ scaleX: 1.16 }],
    width: 256,
  },
  sourceGraphicKicker: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    lineHeight: 12,
    textAlign: "center",
  },
  sourceOrangeBadge: {
    backgroundColor: "#FFF6E5",
  },
  sourceTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  sourceTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
  },
  switchAddText: {
    color: colors.primary,
    fontSize: 19,
    fontWeight: "300",
    lineHeight: 22,
  },
  switchAllergenText: {
    color: "#8A5A00",
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  switchGraphic: {
    alignItems: "center",
    height: 312,
    justifyContent: "center",
    position: "relative",
    width: "100%",
  },
  switchGraphicGlow: {
    backgroundColor: "rgba(0,122,255,0.07)",
    borderRadius: 130,
    height: 260,
    position: "absolute",
    transform: [{ scaleX: 1.16 }],
    width: 260,
  },
  switchManageText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  switchMenuCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  switchMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  switchMenuMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  switchMenuTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
  },
  switchOpenPill: {
    backgroundColor: "#EAF8EF",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  switchOpenText: {
    color: "#188B4D",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
  },
  switchPhone: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(17,17,17,0.08)",
    borderCurve: "continuous",
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: "0 22px 52px rgba(0,0,0,0.1)",
    padding: 14,
    width: "88%",
    zIndex: 2,
  },
  switchPhoneHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(17,17,17,0.14)",
    borderRadius: 3,
    height: 5,
    marginBottom: 13,
    width: 50,
  },
  switchProfileAddOption: {
    alignItems: "center",
    backgroundColor: "rgba(0,122,255,0.08)",
    borderRadius: 13,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  switchProfileAddText: {
    color: colors.primary,
    fontSize: 19,
    fontWeight: "300",
    lineHeight: 22,
  },
  switchProfileHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  switchProfileLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  switchProfileOption: {
    alignItems: "center",
    backgroundColor: colors.backgroundCool,
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 27,
    paddingHorizontal: 10,
  },
  switchProfileOptionActive: {
    backgroundColor: colors.primaryLight,
  },
  switchProfileOptionActiveText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  switchProfileOptions: {
    flexDirection: "row",
    gap: 7,
    marginTop: 10,
  },
  switchProfileOptionText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  switchProfilePanel: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  switchProfileTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  switchRestaurantLogo: {
    alignItems: "center",
    borderRadius: 14,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  switchRestaurantMeta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    marginTop: 1,
  },
  switchRestaurantName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  switchRestaurantText: {
    flex: 1,
    minWidth: 0,
  },
  switchReviewPill: {
    backgroundColor: "#FFF6E5",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  switchReviewText: {
    color: "#B25E00",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  switchSegment: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    height: 26,
    justifyContent: "center",
  },
  switchSegmentActive: {
    backgroundColor: colors.white,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  switchSegmentActiveText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  switchSegmented: {
    backgroundColor: "#F0F0F5",
    borderRadius: 13,
    flexDirection: "row",
    height: 30,
    marginTop: 12,
    padding: 2,
  },
  switchSegmentText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  switchTopBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
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
  profileActions: {
    paddingHorizontal: spacing.three,
    paddingTop: spacing.three,
    width: "100%",
  },
  profileCopy: {
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  profilePickerWrap: {
    marginTop: spacing.three,
    width: "100%",
  },
  profileScrollContent: {
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
  },
  profileSkipText: {
    color: "#8E8E93",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  profileStep: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: spacing.two,
  },
  profileTopBar: {
    alignItems: "flex-end",
    minHeight: 42,
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
    alignItems: "center",
    flex: 1,
    justifyContent: "space-between",
    overflow: "hidden",
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  welcomeActions: {
    alignItems: "center",
    flex: 1,
    gap: 22,
    justifyContent: "flex-end",
    paddingBottom: spacing.one,
    width: "100%",
  },
  welcomeAccountRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 18,
  },
  welcomeAccountText: {
    color: colors.muted,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
  },
  welcomeArrowButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 31,
    boxShadow: "0 18px 36px rgba(0, 122, 255, 0.24)",
    flexDirection: "row",
    gap: 10,
    height: 62,
    justifyContent: "center",
    paddingHorizontal: 30,
    width: "100%",
  },
  welcomeArrowEntrance: {
    width: "100%",
  },
  welcomeArrowLabel: {
    color: colors.white,
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 24,
  },
  welcomeArrowOuter: {
    alignItems: "center",
    borderRadius: 35,
    height: 70,
    justifyContent: "center",
    position: "relative",
    width: "100%",
  },
  welcomeArrowPressable: {
    alignItems: "center",
    height: 70,
    justifyContent: "center",
    width: "100%",
  },
  welcomeArrowPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  welcomeArrowPulse: {
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  welcomeCenter: {
    alignItems: "center",
    height: "35%",
    justifyContent: "flex-end",
    paddingBottom: 2,
    paddingTop: 20,
    width: "100%",
  },
  welcomeLegalRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
  },
  welcomeLegalText: {
    color: "rgba(116,119,124,0.62)",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  welcomeSubtitle: {
    color: colors.muted,
    fontSize: 26,
    fontWeight: "300",
    lineHeight: 36,
    maxWidth: 300,
    textAlign: "center",
  },
  welcomeSubtitleAccent: {
    color: colors.coral,
    fontWeight: "700",
  },
  welcomeSubtitleWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  welcomeTitle: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 43,
    textAlign: "center",
  },
  welcomeTitleWrap: {
    alignItems: "center",
    width: "100%",
  },
  welcomeSignInText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
    textDecorationLine: "underline",
  },
});
