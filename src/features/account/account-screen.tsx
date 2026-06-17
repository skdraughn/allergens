import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  FileText,
  KeyRound,
  LifeBuoy,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getCurrentUser, signIn, signOut, signUp, type AuthUser } from "aws-amplify/auth";

import { AuthActionButton, AuthActionIconBadge } from "@/components/auth-action-button";
import { AuthProviderLogo } from "@/components/auth-provider-logo";
import { AllergyProfilePicker } from "@/components/allergy-profile-picker";
import { ModalScreen } from "@/components/modal-screen";
import { SetupHeroMark } from "@/components/setup-hero-mark";
import { useSnackbar } from "@/components/snackbar-provider";
import { colors, radius, spacing } from "@/constants/theme";
import {
  completeNativeSocialSignIn,
  isSocialSignInCancelled,
  signInWithAppleNative,
  signInWithGoogleNative,
  signOutFromNativeSocialProviders,
} from "@/features/account/native-social-auth";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import type { AllergyProfile } from "@/features/profile/allergy-profile-context";
import { isAmplifyConfigured } from "@/lib/amplify";

type AuthMode = "options" | "password";
type PasswordIntent = "sign-in" | "create";
type LoadingProvider = "apple" | "google" | "password" | "sign-out" | null;

type CreateAccountContentProps = {
  authMode: AuthMode;
  username: string;
  loadingProvider: LoadingProvider;
  password: string;
  passwordIntent: PasswordIntent;
  onApple: () => void;
  onBackToOptions: () => void;
  onChangeUsername: (value: string) => void;
  onChangePassword: (value: string) => void;
  onGoogle: () => void;
  onPassword: () => void;
  onPasswordSubmit: () => void;
  onTogglePasswordIntent: () => void;
};

export function AccountScreen() {
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const {
    activeProfileId,
    createProfile,
    onboardingComplete,
    profiles,
    selectedAllergyIds,
    switchProfile,
    syncProfilesFromCloud,
    toggleAllergy,
  } = useAllergyProfile();
  const [authMode, setAuthMode] = useState<AuthMode>("options");
  const [passwordIntent, setPasswordIntent] = useState<PasswordIntent>("create");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<LoadingProvider>(null);
  const closeAccount = () => {
    if (returnTo === "home") {
      router.replace("/home");
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(onboardingComplete ? "/home" : "/onboarding");
  };

  useEffect(() => {
    void refreshCurrentUser();
  }, []);

  const accountLabel = useMemo(() => {
    return currentUser?.signInDetails?.loginId ?? currentUser?.username ?? "Your account is connected.";
  }, [currentUser]);

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  if (!router.canGoBack()) {
    return <Redirect href="/home" />;
  }

  async function refreshCurrentUser() {
    if (!isAmplifyConfigured) {
      setCurrentUser(null);
      return;
    }

    try {
      setCurrentUser(await getCurrentUser());
    } catch {
      setCurrentUser(null);
    }
  }

  async function completeAndRefresh(work: () => Promise<unknown>) {
    try {
      await work();
      await syncProfilesFromCloud();
      await refreshCurrentUser();
      closeAccount();
    } catch (nextError) {
      if (isSocialSignInCancelled(nextError)) {
        return;
      }

      const message = nextError instanceof Error ? nextError.message : "Something went wrong.";
      showSnackbar({ message, title: "Sign In Error", tone: "error" });
    }
  }

  async function handleSocial(provider: "apple" | "google") {
    if (loadingProvider) {
      return;
    }

    setLoadingProvider(provider);
    await completeAndRefresh(async () => {
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
      const message = "Enter your username and password.";
      showSnackbar({ message, title: "Account Error", tone: "error" });
      return;
    }

    if (!isValidUsername(normalizedUsername)) {
      const message = "Use 3-20 letters, numbers, underscores, or periods.";
      showSnackbar({ message, title: "Account Error", tone: "error" });
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
      await refreshCurrentUser();
      closeAccount();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Password sign-in failed.";
      showSnackbar({ message, title: "Account Error", tone: "error" });
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleSignOut() {
    setLoadingProvider("sign-out");
    try {
      await signOutFromNativeSocialProviders();
      await signOut();
      setCurrentUser(null);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Could not sign out.";
      showSnackbar({ message, title: "Sign Out Error", tone: "error" });
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <ModalScreen actionIcon={X} actionLabel="Close account" onActionPress={closeAccount}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {currentUser ? (
            <SignedInAccount
              accountLabel={accountLabel}
              activeProfileId={activeProfileId}
              profiles={profiles}
              selectedAllergyIds={selectedAllergyIds}
              onAddProfile={createProfile}
              onSwitchProfile={switchProfile}
              isSigningOut={loadingProvider === "sign-out"}
              onSignOut={handleSignOut}
              onToggleAllergy={toggleAllergy}
            />
          ) : (
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
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ModalScreen>
  );
}

export function CreateAccountContent({
  authMode,
  username,
  loadingProvider,
  onApple,
  onBackToOptions,
  onChangeUsername,
  onChangePassword,
  onGoogle,
  onPassword,
  onPasswordSubmit,
  onTogglePasswordIntent,
  password,
  passwordIntent,
}: CreateAccountContentProps) {
  return (
    <>
      <AccountMark />
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Save your allergy profile and manage community submissions.</Text>

      {authMode === "options" ? (
        <AuthOptions
          loadingProvider={loadingProvider}
          onApple={onApple}
          onGoogle={onGoogle}
          onPassword={onPassword}
        />
      ) : null}

      {authMode === "password" ? (
        <PasswordPanel
          username={username}
          intent={passwordIntent}
          isLoading={loadingProvider === "password"}
          onBack={onBackToOptions}
          onChangeUsername={onChangeUsername}
          onChangePassword={onChangePassword}
          onSubmit={onPasswordSubmit}
          onToggleIntent={onTogglePasswordIntent}
          password={password}
        />
      ) : null}

    </>
  );
}

function AuthOptions({
  loadingProvider,
  onApple,
  onGoogle,
  onPassword,
}: {
  loadingProvider: LoadingProvider;
  onApple: () => void;
  onGoogle: () => void;
  onPassword: () => void;
}) {
  return (
    <View style={styles.authOptions}>
      {Platform.OS === "ios" ? (
        <AuthProviderButton
          disabled={Boolean(loadingProvider && loadingProvider !== "apple")}
          label="Continue with Apple"
          loading={loadingProvider === "apple"}
          onPress={onApple}
          provider="apple"
        />
      ) : null}
      <AuthProviderButton
        disabled={Boolean(loadingProvider && loadingProvider !== "google")}
        label="Continue with Google"
        loading={loadingProvider === "google"}
        onPress={onGoogle}
        provider="google"
      />
      <AuthActionButton
        label="Continue with password"
        leading={
          <AuthActionIconBadge variant="primarySoft">
            <KeyRound color={colors.primary} size={20} strokeWidth={2.4} />
          </AuthActionIconBadge>
        }
        disabled={Boolean(loadingProvider)}
        onPress={onPassword}
        variant="primarySoft"
      />
    </View>
  );
}

function AuthProviderButton({
  label,
  disabled,
  loading,
  onPress,
  provider,
}: {
  disabled?: boolean;
  label: string;
  loading: boolean;
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
      disabled={disabled}
      loading={loading}
      onPress={onPress}
    />
  );
}

function PasswordPanel({
  username,
  intent,
  isLoading,
  onBack,
  onChangeUsername,
  onChangePassword,
  onSubmit,
  onToggleIntent,
  password,
}: {
  username: string;
  intent: PasswordIntent;
  isLoading: boolean;
  onBack: () => void;
  onChangeUsername: (value: string) => void;
  onChangePassword: (value: string) => void;
  onSubmit: () => void;
  onToggleIntent: () => void;
  password: string;
}) {
  const isCreate = intent === "create";

  return (
    <View style={styles.passwordFlow}>
      <Field
        autoCapitalize="none"
        onChangeText={onChangeUsername}
        placeholder="Username"
        value={username}
      />
      <Field
        autoCapitalize="none"
        onChangeText={onChangePassword}
        placeholder="Password"
        secureTextEntry
        value={password}
      />
      <AuthActionButton
        label={isCreate ? "Create account" : "Sign in"}
        leading={
          <AuthActionIconBadge variant="primarySoft">
            <KeyRound color={colors.primary} size={19} strokeWidth={2.45} />
          </AuthActionIconBadge>
        }
        loading={isLoading}
        onPress={onSubmit}
        variant="primarySoft"
      />
      <View style={styles.inlineLinks}>
        <Pressable accessibilityRole="button" onPress={onToggleIntent} style={styles.linkButton}>
          <Text style={styles.linkText}>
            {isCreate ? "Already have an account?" : "Need an account?"}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.linkButton}>
          <Text style={styles.linkText}>Other options</Text>
        </Pressable>
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

function Field({
  ...props
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "number-pad";
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <TextInput {...props} placeholderTextColor="#8E8E93" style={styles.input} />
    </View>
  );
}

function SignedInAccount({
  activeProfileId,
  accountLabel,
  isSigningOut,
  onAddProfile,
  onSignOut,
  onSwitchProfile,
  onToggleAllergy,
  profiles,
  selectedAllergyIds,
}: {
  activeProfileId: string;
  accountLabel: string;
  isSigningOut: boolean;
  onAddProfile: () => Promise<void>;
  onSignOut: () => void;
  onSwitchProfile: (id: string) => Promise<void>;
  onToggleAllergy: (id: string) => void;
  profiles: AllergyProfile[];
  selectedAllergyIds: string[];
}) {
  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  const openSupport = () => {
    void Linking.openURL("mailto:truflag@dnatechgroup.com?subject=Allergy%20App%20Support");
  };

  return (
    <View style={styles.signedInContent}>
      <AccountMark />
      <Text style={styles.title}>Account</Text>
      <Text style={styles.subtitle}>{accountLabel}</Text>

      <View style={styles.profileSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWrap}>
            <ClipboardList color={colors.primary} size={19} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Allergy Profiles</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void onAddProfile()}
            style={({ pressed }) => [styles.addProfileButton, pressed ? styles.pressed : null]}
          >
            <Plus color={colors.primary} size={17} strokeWidth={2.7} />
            <Text style={styles.addProfileText}>Add</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.profileTabsContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {profiles.map((profile) => {
            const active = profile.id === activeProfileId;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={profile.id}
                onPress={() => void onSwitchProfile(profile.id)}
                style={({ pressed }) => [
                  styles.profileTab,
                  active ? styles.profileTabActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={[styles.profileTabText, active ? styles.profileTabTextActive : null]}>
                  {profile.name}
                </Text>
                <Text style={[styles.profileTabMeta, active ? styles.profileTabMetaActive : null]}>
                  {profile.selectedAllergyIds.length || "No"} selected
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <AllergyProfilePicker
          embedded
          onToggleAllergy={onToggleAllergy}
          selectedAllergyIds={selectedAllergyIds}
        />
      </View>

      <View style={styles.settingsGroup}>
        <SettingsRow
          Icon={Bell}
          label="Notification Settings"
          onPress={() => undefined}
          sublabel="Coming soon"
        />
        <SettingsRow
          Icon={LifeBuoy}
          label="Contact Support"
          onPress={openSupport}
          sublabel="truflag@dnatechgroup.com"
        />
      </View>

      <View style={styles.settingsGroup}>
        <SettingsRow
          Icon={FileText}
          label="Privacy Policy"
          onPress={() => openUrl("https://hoopleapp.com/privacy")}
        />
        <SettingsRow
          Icon={FileText}
          label="Terms of Service"
          onPress={() => openUrl("https://hoopleapp.com/terms")}
        />
        <SettingsRow
          Icon={Trash2}
          label="Delete Account"
          onPress={() => openUrl("https://hoopleapp.com/delete-account")}
          tone="danger"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={isSigningOut}
        onPress={onSignOut}
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && !isSigningOut ? styles.pressed : null,
        ]}
      >
        <LogOut color={colors.coral} size={19} strokeWidth={2.45} />
        <Text style={styles.signOutText}>{isSigningOut ? "Signing Out..." : "Sign Out"}</Text>
      </Pressable>
    </View>
  );
}

function SettingsRow({
  Icon,
  label,
  onPress,
  sublabel,
  tone = "default",
}: {
  Icon: typeof UserRound;
  label: string;
  onPress: () => void;
  sublabel?: string;
  tone?: "default" | "danger";
}) {
  const isDanger = tone === "danger";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed ? styles.pressed : null]}
    >
      <View style={[styles.settingsIcon, isDanger ? styles.settingsIconDanger : null]}>
        <Icon color={isDanger ? colors.coral : colors.primary} size={18} strokeWidth={2.45} />
      </View>
      <View style={styles.settingsTextWrap}>
        <Text style={[styles.settingsLabel, isDanger ? styles.settingsLabelDanger : null]}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.settingsSublabel}>{sublabel}</Text> : null}
      </View>
      <ChevronRight color="#C7C7CC" size={18} strokeWidth={2.6} />
    </Pressable>
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
    marginTop: spacing.three,
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
    flexGrow: 1,
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  field: {
    width: "100%",
  },
  addProfileButton: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 11,
  },
  addProfileText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  passwordFlow: {
    gap: 13,
    marginTop: spacing.four,
    width: "100%",
  },
  formCopy: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
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
  inlineLinks: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  input: {
    backgroundColor: "#F7F7FA",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
    minHeight: 52,
    paddingHorizontal: spacing.two,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  linkButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  signedInContent: {
    width: "100%",
  },
  settingsGroup: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: spacing.two,
    overflow: "hidden",
    width: "100%",
  },
  settingsIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  settingsIconDanger: {
    backgroundColor: "rgba(184,77,103,0.1)",
  },
  settingsLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  settingsLabelDanger: {
    color: colors.coral,
  },
  settingsRow: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  settingsSublabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  settingsTextWrap: {
    flex: 1,
  },
  signOutButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: spacing.three,
    minHeight: 48,
    paddingHorizontal: spacing.two,
  },
  signOutText: {
    color: colors.coral,
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 20,
    lineHeight: 26,
  },
  pressed: {
    opacity: 0.65,
  },
  profileSection: {
    marginTop: spacing.three,
    width: "100%",
  },
  profileTab: {
    backgroundColor: "#F7F7FA",
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    minWidth: 116,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  profileTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  profileTabMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  profileTabMetaActive: {
    color: colors.white,
    opacity: 0.82,
  },
  profileTabText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  profileTabTextActive: {
    color: colors.white,
  },
  profileTabsContent: {
    gap: 9,
    paddingBottom: 2,
    paddingRight: spacing.three,
    paddingTop: 12,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800",
  },
  sectionTitleWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 36,
  },
});
