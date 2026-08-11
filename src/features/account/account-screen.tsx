import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  HeartPulse,
  KeyRound,
  LifeBuoy,
  LogOut,
  MessageSquareWarning,
  Trash2,
  UserRound,
  X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing as ReanimatedEasing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { getCurrentUser, signIn, signOut, signUp, type AuthUser } from "aws-amplify/auth";

import { AllergyIconChips } from "@/components/allergy-icon-chips";
import { AuthActionButton, AuthActionIconBadge } from "@/components/auth-action-button";
import { AuthProviderLogo } from "@/components/auth-provider-logo";
import { ModalScreen } from "@/components/modal-screen";
import { SereneLoader } from "@/components/serene-loader";
import { useSnackbar } from "@/components/snackbar-provider";
import { colors, spacing } from "@/constants/theme";
import {
  completeNativeSocialSignIn,
  isSocialSignInCancelled,
  signInWithAppleNative,
  signInWithGoogleNative,
  signOutFromNativeSocialProviders,
} from "@/features/account/native-social-auth";
import {
  fetchMyAllergyReviews,
  fetchMyMenuItemReports,
  fetchMyRestaurantRequests,
  type CommunityStatus,
  type MenuItemReportSummary,
  type MyAllergyReviewSummary,
  type RestaurantRequestSummary,
} from "@/features/community/community-service";
import { AllergyProfileManagerModal } from "@/features/profile/allergy-profile-manager-modal";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import { useRestaurantData } from "@/features/restaurants/restaurant-data-context";
import { isAmplifyConfigured } from "@/lib/amplify";
import type { Restaurant } from "@/data/restaurants";

type AuthMode = "options" | "password";
type PasswordIntent = "sign-in" | "create";
type LoadingProvider = "apple" | "google" | "password" | "sign-out" | null;

const safePlateIcon = require("../../../assets/icon.png");

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
  onPasswordInputFocus?: () => void;
  onPasswordSubmit: () => void;
  onTogglePasswordIntent: () => void;
  isPasswordFieldFocused?: boolean;
};

export function AccountScreen() {
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const {
    onboardingComplete,
    profiles,
    selectedAllergyIds,
    selectedProfileIds,
    syncProfilesFromCloud,
  } = useAllergyProfile();
  const [authMode, setAuthMode] = useState<AuthMode>("options");
  const [passwordIntent, setPasswordIntent] = useState<PasswordIntent>("create");
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<LoadingProvider>(null);
  const [isPasswordFieldFocused, setIsPasswordFieldFocused] = useState(false);
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {currentUser ? (
          <SignedInAccount
            accountLabel={accountLabel}
            profiles={profiles}
            selectedAllergyIds={selectedAllergyIds}
            selectedProfileIds={selectedProfileIds}
            isSigningOut={loadingProvider === "sign-out"}
            onSignOut={handleSignOut}
          />
        ) : currentUser === undefined ? (
          <AccountLoadingContent />
        ) : (
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
        )}
      </ScrollView>
    </ModalScreen>
  );
}

function AccountLoadingContent() {
  return (
    <View style={styles.loadingAccount}>
      <SereneLoader />
      <Text style={styles.loadingAccountText}>Loading account...</Text>
    </View>
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
  onPasswordInputFocus,
  onPasswordSubmit,
  onTogglePasswordIntent,
  password,
  passwordIntent,
  isPasswordFieldFocused = false,
}: CreateAccountContentProps) {
  const isSigningIn = passwordIntent === "sign-in";

  return (
    <>
      <AccountMark isCollapsed={authMode === "password" && isPasswordFieldFocused} />
      <Text style={styles.title}>{isSigningIn ? "Sign In" : "Create Account"}</Text>
      <Text style={styles.subtitle}>
        {isSigningIn
          ? "Access your saved allergy profiles and restaurant activity."
          : "Save your allergy profile and manage restaurant requests."}
      </Text>

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
          onInputFocus={onPasswordInputFocus}
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
  onInputFocus,
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
  onInputFocus?: () => void;
  onSubmit: () => void;
  onToggleIntent: () => void;
  password: string;
}) {
  const isCreate = intent === "create";

  return (
    <View style={styles.passwordFlow}>
      <Field
        autoCapitalize="none"
        onFocus={onInputFocus}
        onChangeText={onChangeUsername}
        placeholder="Username"
        value={username}
      />
      <Field
        autoCapitalize="none"
        onFocus={onInputFocus}
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
            {isCreate ? "Already have an account? Sign in" : "Need an account? Create one"}
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
  onFocus?: () => void;
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
  accountLabel,
  isSigningOut,
  onSignOut,
  profiles,
  selectedAllergyIds,
  selectedProfileIds,
}: {
  accountLabel: string;
  isSigningOut: boolean;
  onSignOut: () => void;
  selectedAllergyIds: string[];
  selectedProfileIds: string[];
  profiles: ReturnType<typeof useAllergyProfile>["profiles"];
}) {
  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  const openSupport = () => {
    void Linking.openURL("mailto:truflag@dnatechgroup.com?subject=Allergy%20App%20Support");
  };
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const selectedProfiles = profiles.filter((profile) =>
    selectedProfileIds.includes(profile.id),
  );
  const selectedProfileNames = selectedProfiles.map((profile) => profile.name).join(" + ");

  return (
    <View style={styles.signedInContent}>
      <AccountMark />
      <Text style={styles.title}>Account</Text>
      <Text style={styles.subtitle}>{accountLabel}</Text>

      <AllergyProfileManagerModal
        onClose={() => setProfileManagerOpen(false)}
        visible={profileManagerOpen}
      />
      <MyRequestsModal onClose={() => setRequestsOpen(false)} visible={requestsOpen} />
      <MyReportsModal onClose={() => setReportsOpen(false)} visible={reportsOpen} />
      <MyReviewsModal onClose={() => setReviewsOpen(false)} visible={reviewsOpen} />

      <View style={styles.settingsGroup}>
        <SettingsRow
          Icon={ClipboardList}
          label="Allergy Profile"
          onPress={() => setProfileManagerOpen(true)}
          subcontent={
            <View style={styles.profileSummary}>
              <Text style={[styles.settingsSublabel, styles.profileSummaryText]}>
                {selectedProfileNames || "My Profile"} · {selectedProfiles.length} profile
                {selectedProfiles.length === 1 ? "" : "s"}
              </Text>
              <AllergyIconChips
                allergyIds={selectedAllergyIds}
                compact
                highlightedIds={[]}
                overlap
                size={22}
                style={styles.profileSummaryIcons}
              />
            </View>
          }
        />
        <SettingsRow
          Icon={ClipboardList}
          label="My Requests"
          onPress={() => setRequestsOpen(true)}
          sublabel="Restaurants you've requested"
        />
        <SettingsRow
          Icon={MessageSquareWarning}
          label="My Reports"
          onPress={() => setReportsOpen(true)}
          sublabel="Menu item issues you've sent"
        />
        <SettingsRow
          Icon={HeartPulse}
          label="My Reviews"
          onPress={() => setReviewsOpen(true)}
          sublabel="Allergy reviews you've left"
        />
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

function MyRequestsModal({
  onClose,
  visible,
}: {
  onClose: () => void;
  visible: boolean;
}) {
  const [requests, setRequests] = useState<RestaurantRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;

    setLoading(true);
    fetchMyRestaurantRequests()
      .then((nextRequests) => {
        if (active) {
          setRequests(nextRequests);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <ModalScreen actionIcon={X} actionLabel="Close requests" onActionPress={onClose}>
        <ScrollView contentContainerStyle={styles.requestsModalContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>My Requests</Text>
          <Text style={styles.subtitle}>Restaurants you’ve asked us to review.</Text>

          <View style={styles.requestsGroup}>
            {loading ? (
              <View style={styles.requestsEmpty}>
                <SereneLoader size="small" />
                <Text style={styles.requestsEmptyText}>Loading requests...</Text>
              </View>
            ) : requests.length ? (
              <View style={styles.requestsList}>
                {requests.map((request) => (
                  <View key={request.id} style={styles.requestRow}>
                    <View style={styles.requestTextWrap}>
                      <Text numberOfLines={1} style={styles.requestName}>
                        {request.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.requestMeta}>
                        {request.locationHint ||
                          firstLine(request.displayAddress) ||
                          request.website ||
                          "No location added"}
                      </Text>
                    </View>
                    <RequestStatusBadge status={request.status} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.requestsEmpty}>
                <Clock3 color={colors.muted} size={18} strokeWidth={2.35} />
                <Text style={styles.requestsEmptyText}>No restaurant requests yet.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ModalScreen>
    </Modal>
  );
}

function MyReportsModal({
  onClose,
  visible,
}: {
  onClose: () => void;
  visible: boolean;
}) {
  const [reports, setReports] = useState<MenuItemReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { restaurants } = useRestaurantData();
  const restaurantById = useMemo(() => createRestaurantLookup(restaurants), [restaurants]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;

    setLoading(true);
    fetchMyMenuItemReports()
      .then((nextReports) => {
        if (active) {
          setReports(nextReports);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <ModalScreen actionIcon={X} actionLabel="Close reports" onActionPress={onClose}>
        <ScrollView contentContainerStyle={styles.requestsModalContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>My Reports</Text>
          <Text style={styles.subtitle}>Menu item issues you’ve sent to our team.</Text>

          <View style={styles.requestsGroup}>
            {loading ? (
              <View style={styles.requestsEmpty}>
                <SereneLoader size="small" />
                <Text style={styles.requestsEmptyText}>Loading reports...</Text>
              </View>
            ) : reports.length ? (
              <View style={styles.requestsList}>
                {reports.map((report) => {
                  const restaurant = restaurantById.get(report.restaurantId);
                  const itemName = getReportMenuItemName(report, restaurant);

                  return (
                    <View key={report.id} style={styles.requestRow}>
                      <View style={styles.requestTextWrap}>
                        <Text numberOfLines={1} style={styles.requestName}>
                          {itemName}
                        </Text>
                        <Text numberOfLines={1} style={styles.requestMeta}>
                          {[formatReportReason(report.reason), getRestaurantDisplayName(report.restaurantId, restaurant)]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      {report.comment ? (
                        <Text numberOfLines={2} style={styles.requestDetail}>
                          {report.comment}
                        </Text>
                      ) : null}
                      </View>
                      <RequestStatusBadge status={report.status} />
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.requestsEmpty}>
                <MessageSquareWarning color={colors.muted} size={18} strokeWidth={2.35} />
                <Text style={styles.requestsEmptyText}>No reports yet.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ModalScreen>
    </Modal>
  );
}

function MyReviewsModal({
  onClose,
  visible,
}: {
  onClose: () => void;
  visible: boolean;
}) {
  const [reviews, setReviews] = useState<MyAllergyReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { restaurants } = useRestaurantData();
  const restaurantById = useMemo(() => createRestaurantLookup(restaurants), [restaurants]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;

    setLoading(true);
    fetchMyAllergyReviews()
      .then((nextReviews) => {
        if (active) {
          setReviews(nextReviews);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <ModalScreen actionIcon={X} actionLabel="Close reviews" onActionPress={onClose}>
        <ScrollView contentContainerStyle={styles.requestsModalContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>My Reviews</Text>
          <Text style={styles.subtitle}>Allergy ratings and notes you’ve left.</Text>

          <View style={styles.requestsGroup}>
            {loading ? (
              <View style={styles.requestsEmpty}>
                <SereneLoader size="small" />
                <Text style={styles.requestsEmptyText}>Loading reviews...</Text>
              </View>
            ) : reviews.length ? (
              <View style={styles.requestsList}>
                {reviews.map((review) => (
                  <View key={review.id} style={styles.requestRow}>
                    <View style={styles.requestTextWrap}>
                      <View style={styles.reviewRowHeader}>
                        <Text style={styles.reviewRatingText}>{review.rating}/5</Text>
                        <HeartPulse color={colors.coral} size={15} strokeWidth={2.45} />
                      </View>
                      <Text numberOfLines={1} style={styles.requestName}>
                        {review.menuItemName || "Restaurant allergy review"}
                      </Text>
                      <Text numberOfLines={1} style={styles.requestMeta}>
                        {getRestaurantDisplayName(review.restaurantId, restaurantById.get(review.restaurantId))}
                      </Text>
                      {review.body ? (
                        <Text numberOfLines={2} style={styles.requestDetail}>
                          {review.body}
                        </Text>
                      ) : null}
                    </View>
                    <RequestStatusBadge status={review.communityStatus} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.requestsEmpty}>
                <HeartPulse color={colors.muted} size={18} strokeWidth={2.35} />
                <Text style={styles.requestsEmptyText}>No allergy reviews yet.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ModalScreen>
    </Modal>
  );
}

function RequestStatusBadge({ status }: { status: CommunityStatus }) {
  const isApproved = status === "approved";
  const isRejected = status === "rejected";
  const label = isApproved ? "Approved" : isRejected ? "Rejected" : "Pending";

  return (
    <View
      style={[
        styles.requestStatusBadge,
        isApproved ? styles.requestStatusApproved : null,
        isRejected ? styles.requestStatusRejected : null,
      ]}
    >
      <Text
        style={[
          styles.requestStatusText,
          isApproved ? styles.requestStatusTextApproved : null,
          isRejected ? styles.requestStatusTextRejected : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function firstLine(value?: string | null) {
  return value?.split("\n").find(Boolean) ?? null;
}

function createRestaurantLookup(restaurants: Restaurant[]) {
  return new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
}

function getRestaurantDisplayName(restaurantId: string, restaurant?: Restaurant) {
  return restaurant?.name ?? humanizeSlug(restaurantId) ?? restaurantId;
}

function getReportMenuItemName(report: MenuItemReportSummary, restaurant?: Restaurant) {
  if (!report.menuItemId) {
    return "Restaurant-level report";
  }

  const menuItem = restaurant?.items.find((item) => item.id === report.menuItemId);
  return menuItem?.name ?? humanizeSlug(report.menuItemId) ?? report.menuItemId;
}

function humanizeSlug(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatReportReason(reason?: string | null) {
  if (!reason) {
    return "Report";
  }

  return reason
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SettingsRow({
  Icon,
  label,
  onPress,
  subcontent,
  sublabel,
  tone = "default",
}: {
  Icon: typeof UserRound;
  label: string;
  onPress: () => void;
  subcontent?: ReactNode;
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
        {subcontent}
        {sublabel ? <Text style={styles.settingsSublabel}>{sublabel}</Text> : null}
      </View>
      <ChevronRight color="#C7C7CC" size={18} strokeWidth={2.6} />
    </Pressable>
  );
}

function AccountMark({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const collapseProgress = useSharedValue(isCollapsed ? 1 : 0);

  useEffect(() => {
    collapseProgress.value = withTiming(isCollapsed ? 1 : 0, {
      duration: 420,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
  }, [collapseProgress, isCollapsed]);

  const wrapperStyle = useAnimatedStyle(() => ({
    height: interpolate(collapseProgress.value, [0, 1], [142, 0], Extrapolation.CLAMP),
    marginBottom: interpolate(collapseProgress.value, [0, 1], [spacing.three, 0], Extrapolation.CLAMP),
    marginTop: interpolate(collapseProgress.value, [0, 1], [14, 0], Extrapolation.CLAMP),
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(collapseProgress.value, [0, 1], [0, -34], Extrapolation.CLAMP),
      },
      { scale: interpolate(collapseProgress.value, [0, 1], [1, 0.94], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View style={[styles.heroWrap, wrapperStyle]}>
      <Animated.View style={markStyle}>
        <View style={styles.safePlateLogoFrame}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={safePlateIcon}
            style={styles.safePlateLogo}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  authOptions: {
    gap: 10,
    marginTop: spacing.four,
    width: "100%",
  },
  content: {
    alignItems: "flex-start",
    flexGrow: 1,
    paddingBottom: spacing.four * 2,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  field: {
    width: "100%",
  },
  passwordFlow: {
    gap: 13,
    marginTop: spacing.four,
    width: "100%",
  },
  heroWrap: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    width: "100%",
  },
  safePlateLogo: {
    height: "100%",
    width: "100%",
  },
  safePlateLogoFrame: {
    borderCurve: "continuous",
    borderRadius: 30,
    boxShadow: "0 18px 38px rgba(0, 92, 214, 0.16)",
    height: 112,
    overflow: "hidden",
    width: 112,
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
  loadingAccount: {
    alignItems: "center",
    alignSelf: "center",
    gap: 12,
    justifyContent: "center",
    minHeight: 280,
    width: "100%",
  },
  loadingAccountText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "700",
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
  profileSummary: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 1,
  },
  profileSummaryIcons: {
    marginTop: 0,
  },
  profileSummaryText: {
    marginTop: 0,
  },
  requestMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  requestDetail: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 6,
  },
  requestName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  requestRow: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  requestStatusApproved: {
    backgroundColor: "#EAF8EF",
  },
  requestStatusBadge: {
    backgroundColor: "#FFF6E5",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  requestStatusRejected: {
    backgroundColor: "#FFF0F0",
  },
  requestStatusText: {
    color: "#A66A00",
    fontSize: 12,
    fontWeight: "900",
  },
  requestStatusTextApproved: {
    color: "#167A3D",
  },
  requestStatusTextRejected: {
    color: colors.coral,
  },
  requestTextWrap: {
    flex: 1,
  },
  requestsEmpty: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  requestsEmptyText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  requestsGroup: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: spacing.two,
    overflow: "hidden",
    width: "100%",
  },
  requestsList: {
    width: "100%",
  },
  requestsModalContent: {
    padding: spacing.three,
    paddingBottom: spacing.four,
  },
  reviewRatingText: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900",
  },
  reviewRowHeader: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    marginBottom: 4,
  },
  title: {
    color: colors.ink,
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 36,
  },
});
