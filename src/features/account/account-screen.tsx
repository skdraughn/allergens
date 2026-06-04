import { useRouter } from "expo-router";
import { Redirect } from "expo-router";
import { KeyRound, ShieldCheck, UserRound, X } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react-native";

import { AuthActionButton, AuthActionIconBadge } from "@/components/auth-action-button";
import { AuthProviderLogo } from "@/components/auth-provider-logo";
import { ModalScreen } from "@/components/modal-screen";
import { SecondaryButton } from "@/components/secondary-button";
import { SetupHeroMark } from "@/components/setup-hero-mark";
import { colors, spacing } from "@/constants/theme";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { isAmplifyConfigured } from "@/lib/amplify";

export function AccountScreen() {
  const router = useRouter();
  const { onboardingComplete } = useAllergyProfile();
  const closeAccount = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(onboardingComplete ? "/home" : "/onboarding");
  };

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  if (!router.canGoBack()) {
    return <Redirect href="/home" />;
  }

  return (
    <ModalScreen
      actionIcon={X}
      actionLabel="Close account"
      onActionPress={closeAccount}
    >
      {isAmplifyConfigured ? (
        <Authenticator>
          <SignedInAccount />
        </Authenticator>
      ) : (
        <CreateAccountPanel onContinue={closeAccount} />
      )}
    </ModalScreen>
  );
}

function CreateAccountPanel({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.content}>
      <AccountMark />
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>
        Save your allergy profile and keep it available across your devices.
      </Text>

      <View style={styles.authOptions}>
        <AuthProviderButton label="Sign in with Apple" provider="apple" onPress={onContinue} />
        <AuthProviderButton label="Sign in with Google" provider="google" onPress={onContinue} />
        <AuthActionButton
          label="Continue with password"
          leading={
            <AuthActionIconBadge variant="primarySoft">
              <KeyRound color={colors.primary} size={20} strokeWidth={2.4} />
            </AuthActionIconBadge>
          }
          onPress={onContinue}
          variant="primarySoft"
        />
      </View>
    </View>
  );
}

function AuthProviderButton({
  label,
  onPress,
  provider,
}: {
  label: string;
  onPress: () => void;
  provider: "apple" | "google";
}) {
  return (
    <AuthActionButton
      label={label}
      leading={
        <AuthActionIconBadge>
          <AuthProviderLogo provider={provider} />
        </AuthActionIconBadge>
      }
      onPress={onPress}
    />
  );
}

function SignedInAccount() {
  const { signOut, user } = useAuthenticator((context) => [context.user]);
  const accountLabel =
    user?.signInDetails?.loginId ?? user?.username ?? "Your account is connected.";

  return (
    <View style={styles.content}>
      <AccountMark />
      <Text style={styles.title}>Signed In</Text>
      <Text style={styles.subtitle}>{accountLabel}</Text>
      <View style={styles.actions}>
        <SecondaryButton label="Sign Out" onPress={signOut} />
      </View>
    </View>
  );
}

function AccountMark() {
  return (
    <View style={styles.heroWrap}>
      <SetupHeroMark Icon={UserRound} />
      <View style={styles.badge}>
        <ShieldCheck color={colors.primary} size={18} strokeWidth={2.5} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    marginTop: "auto",
    paddingBottom: spacing.three,
    width: "100%",
  },
  authOptions: {
    gap: 10,
    marginTop: spacing.four,
    width: "100%",
  },
  badge: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    bottom: 0,
    height: 36,
    justifyContent: "center",
    position: "absolute",
    right: 98,
    width: 36,
  },
  content: {
    alignItems: "flex-start",
    flex: 1,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  heroWrap: {
    alignItems: "center",
    alignSelf: "center",
    height: 142,
    justifyContent: "center",
    marginBottom: spacing.three,
    marginTop: 14,
    width: "100%",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 24,
    lineHeight: 30,
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "700",
    lineHeight: 32,
  },
});
