import { useAuthenticator } from "@aws-amplify/ui-react-native";
import { Check, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
  KeyboardStickyView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import Animated, {
  FadeInDown,
  FadeOutDown,
  LinearTransition,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedContentSwap } from "@/components/animated-content-swap";
import { AllergyRatingPicker } from "@/components/allergy-rating-picker";
import { ModalScreen } from "@/components/modal-screen";
import { PrimaryButton } from "@/components/primary-button";
import { SereneLoader } from "@/components/serene-loader";
import { SelectableChip } from "@/components/selectable-chip";
import { useSnackbar } from "@/components/snackbar-provider";
import { SecondaryButton } from "@/components/secondary-button";
import {
  allergyOptions,
  getAllergyLabels,
  normalizeAllergyIds,
} from "@/constants/allergies";
import { colors, spacing } from "@/constants/theme";
import type { MenuItem, Restaurant } from "@/data/restaurants";
import {
  createGooglePlacesSessionToken,
  fetchRestaurantPlaceDetails,
  fetchRestaurantPlaceSuggestions,
  isGooglePlacesConfigured,
  type GooglePlaceSuggestion,
} from "@/features/community/google-places-service";
import { useCommunitySubmission } from "@/features/community/use-restaurant-community";
import { DuplicateRestaurantRequestError } from "@/features/community/community-service";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";
import {
  getRestaurantSearchLocation,
  type RestaurantSearchLocation,
} from "@/features/restaurants/restaurant-search-service";

export type ContributionMode = "report" | "restaurant-request";

type CommunityContributionModalProps = {
  initialRestaurantName?: string;
  item?: MenuItem | null;
  mode: ContributionMode | null;
  onClose: () => void;
  onSignInRequired: () => void;
  restaurant?: Restaurant | null;
};

type FormState = {
  addressLine1: string;
  addressLine2: string;
  allergyContext: string;
  allergens: string[];
  body: string;
  category: string;
  city: string;
  comment: string;
  country: string;
  description: string;
  googleMapsUri: string;
  googlePlaceId: string;
  lat: number | null;
  locationHint: string;
  lng: number | null;
  mayContain: string[];
  name: string;
  notes: string;
  postalCode: string;
  region: string;
  reason: string;
  sourceUrl: string;
  website: string;
};

const defaultForm: FormState = {
  addressLine1: "",
  addressLine2: "",
  allergyContext: "",
  allergens: [],
  body: "",
  category: "",
  city: "",
  comment: "",
  country: "",
  description: "",
  googleMapsUri: "",
  googlePlaceId: "",
  lat: null,
  locationHint: "",
  lng: null,
  mayContain: [],
  name: "",
  notes: "",
  postalCode: "",
  region: "",
  reason: "outdated-allergen-info",
  sourceUrl: "",
  website: "",
};

const reportReasons = [
  { id: "outdated-allergen-info", label: "Outdated allergen info" },
  { id: "missing-allergen", label: "Missing allergen" },
  { id: "wrong-menu-item", label: "Wrong menu item" },
  { id: "other", label: "Other" },
];

export function CommunityContributionModal({
  initialRestaurantName,
  item,
  mode,
  onClose,
  onSignInRequired,
  restaurant,
}: CommunityContributionModalProps) {
  const { showSnackbar } = useSnackbar();
  const insets = useSafeAreaInsets();
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const { selectedAllergyIds } = useAllergyProfile();
  const submissions = useCommunitySubmission(restaurant?.id);
  const [form, setForm] = useState<FormState>(() => ({
    ...defaultForm,
    category: item?.category ?? "",
    name: initialRestaurantName ?? "",
  }));
  const [requestReviewAllergyIds, setRequestReviewAllergyIds] = useState<
    string[]
  >(() => normalizeAllergyIds(selectedAllergyIds));
  const [requestReviewRating, setRequestReviewRating] = useState(0);
  const [requestedRestaurantId, setRequestedRestaurantId] = useState<
    string | null
  >(null);
  const [placeLocation, setPlaceLocation] =
    useState<RestaurantSearchLocation | null>(null);
  const [placeLookupError, setPlaceLookupError] = useState<string | null>(null);
  const [placeLookupLoading, setPlaceLookupLoading] = useState(false);
  const [placeSearchText, setPlaceSearchText] = useState(
    initialRestaurantName ?? "",
  );
  const [placeSessionToken, setPlaceSessionToken] = useState(
    createGooglePlacesSessionToken,
  );
  const [placeSuggestions, setPlaceSuggestions] = useState<
    GooglePlaceSuggestion[]
  >([]);
  const notesSectionYRef = useRef(0);
  const scrollViewRef = useRef<KeyboardAwareScrollViewRef>(null);
  const [stickyFooterHeight, setStickyFooterHeight] = useState(0);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [submitted, setSubmitted] = useState(false);
  const [presentedMode, setPresentedMode] = useState<ContributionMode | null>(
    mode,
  );
  const [presentedItem, setPresentedItem] = useState<
    MenuItem | null | undefined
  >(item);
  const displayMode = mode ?? presentedMode;
  const displayItem = item ?? presentedItem;
  const content = displayMode
    ? modalContent(displayMode, restaurant?.name, displayItem?.name)
    : null;
  const isSubmitting =
    submissions.submitReport.isPending ||
    submissions.submitRestaurantRequest.isPending;
  const stickyFooterBottomInset = Math.max(insets.bottom, 12);

  useEffect(() => {
    if (!mode) {
      return;
    }

    setPresentedMode(mode);
    setPresentedItem(item);
    setSubmitted(false);
    setForm({
      ...defaultForm,
      category: item?.category ?? "",
      name: initialRestaurantName ?? "",
    });
    setPlaceLookupError(null);
    setPlaceLookupLoading(false);
    setPlaceSearchText(initialRestaurantName ?? "");
    setPlaceSessionToken(createGooglePlacesSessionToken());
    setPlaceSuggestions([]);
    setRequestReviewAllergyIds(normalizeAllergyIds(selectedAllergyIds));
    setRequestReviewRating(0);
    setRequestedRestaurantId(null);
  }, [initialRestaurantName, item, mode, selectedAllergyIds]);

  useEffect(() => {
    if (mode !== "restaurant-request" || !isGooglePlacesConfigured()) {
      return;
    }

    let active = true;

    getRestaurantSearchLocation().then((location) => {
      if (active) {
        setPlaceLocation(location);
      }
    });

    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "restaurant-request" || !isGooglePlacesConfigured()) {
      setPlaceSuggestions([]);
      setPlaceLookupLoading(false);
      return;
    }

    const query = placeSearchText.trim();

    if (query.length < 3 || form.googlePlaceId) {
      setPlaceSuggestions([]);
      setPlaceLookupError(null);
      setPlaceLookupLoading(false);
      return;
    }

    let active = true;
    setPlaceLookupLoading(true);
    const timer = setTimeout(() => {
      fetchRestaurantPlaceSuggestions({
        input: query,
        location: placeLocation,
        sessionToken: placeSessionToken,
      })
        .then((suggestions) => {
          if (active) {
            setPlaceSuggestions(suggestions);
            setPlaceLookupError(null);
          }
        })
        .catch((error) => {
          if (active) {
            setPlaceSuggestions([]);
            setPlaceLookupError(
              error instanceof Error
                ? error.message
                : "Restaurant lookup is unavailable right now.",
            );
          }
        })
        .finally(() => {
          if (active) {
            setPlaceLookupLoading(false);
          }
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    form.googlePlaceId,
    mode,
    placeLocation,
    placeSearchText,
    placeSessionToken,
  ]);

  const canSubmit = useMemo(() => {
    if (!mode) {
      return false;
    }

    if (mode === "restaurant-request") {
      return Boolean(form.name.trim());
    }

    if (mode === "report") {
      return Boolean(restaurant?.id && form.comment.trim());
    }

    return false;
  }, [form, mode, restaurant?.id]);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateRestaurantName = (value: string) => {
    setPlaceSearchText(value);
    setPlaceLookupLoading(
      isGooglePlacesConfigured() && value.trim().length >= 3,
    );
    setForm((current) => ({
      ...current,
      googleMapsUri: "",
      googlePlaceId: "",
      lat: null,
      lng: null,
      name: value,
    }));
  };

  const updateRestaurantLocation = (value: string) => {
    setForm((current) => ({
      ...current,
      addressLine1: "",
      addressLine2: "",
      city: "",
      country: "",
      googleMapsUri: "",
      lat: null,
      lng: null,
      locationHint: value,
      postalCode: "",
      region: "",
    }));
  };

  const selectPlaceSuggestion = async (suggestion: GooglePlaceSuggestion) => {
    setPlaceLookupError(null);
    setPlaceLookupLoading(true);

    try {
      const details = await fetchRestaurantPlaceDetails({
        placeId: suggestion.id,
        sessionToken: placeSessionToken,
      });
      const nextName = details.name || suggestion.mainText;

      setPlaceSearchText(nextName);
      setPlaceSuggestions([]);
      setForm((current) => ({
        ...current,
        addressLine1: details.addressLine1,
        city: details.city,
        country: details.country,
        googleMapsUri: details.googleMapsUri ?? "",
        googlePlaceId: details.id,
        lat: details.lat ?? null,
        lng: details.lng ?? null,
        locationHint: [details.city, details.region].filter(Boolean).join(", "),
        name: nextName,
        postalCode: details.postalCode,
        region: details.region,
        website: details.website ?? current.website,
      }));
      setPlaceSessionToken(createGooglePlacesSessionToken());
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          animated: true,
          y: Math.max(0, notesSectionYRef.current - 12),
        });
      }, 120);
    } catch (error) {
      setPlaceLookupError(
        error instanceof Error
          ? error.message
          : "Restaurant details are unavailable right now.",
      );
    } finally {
      setPlaceLookupLoading(false);
    }
  };

  const toggleRequestReviewAllergy = (id: string) => {
    setRequestReviewAllergyIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : normalizeAllergyIds([...current, id]),
    );
  };

  const submit = async () => {
    if (mode !== "restaurant-request" && authStatus !== "authenticated") {
      onClose();
      onSignInRequired();
      return;
    }

    if (!mode) {
      return;
    }

    try {
      if (mode === "restaurant-request") {
        const request = await submissions.submitRestaurantRequest.mutateAsync({
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          country: form.country,
          displayAddress: formatDisplayAddress(form),
          googleMapsUri: form.googleMapsUri,
          googlePlaceId: form.googlePlaceId,
          lat: form.lat ?? undefined,
          lng: form.lng ?? undefined,
          locationHint: form.locationHint,
          name: form.name,
          notes: form.notes,
          postalCode: form.postalCode,
          region: form.region,
          website: form.website,
        });
        Keyboard.dismiss();
        setRequestedRestaurantId(request.id);
        return;
      } else if (mode === "report" && restaurant) {
        await submissions.submitReport.mutateAsync({
          comment: form.comment,
          menuItemId: item?.id ?? null,
          reason: form.reason,
          restaurantId: restaurant.id,
          sourceUrl: form.sourceUrl,
        });
      }

      setSubmitted(true);
    } catch (nextError) {
      if (nextError instanceof DuplicateRestaurantRequestError) {
        showSnackbar({
          message:
            "You already submitted this restaurant. You can edit it from My Requests in Settings.",
          placement: "top",
          title: "Already Requested",
          tone: "info",
        });
        return;
      }

      const message =
        nextError instanceof Error ? nextError.message : "Submission failed.";
      showSnackbar({ message, title: "Submission Error", tone: "error" });
    }
  };

  const submitRequestedRestaurantReview = async () => {
    if (!requestedRestaurantId || requestReviewRating < 1) {
      return;
    }

    if (authStatus !== "authenticated") {
      onClose();
      onSignInRequired();
      return;
    }

    try {
      await submissions.submitReview.mutateAsync({
        allergyContext: formatAllergyContext(requestReviewAllergyIds),
        body: form.body,
        rating: requestReviewRating,
        restaurantId: `request:${requestedRestaurantId}`,
      });
      setSubmitted(true);
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Review submission failed.";
      showSnackbar({ message, title: "Submission Error", tone: "error" });
    }
  };

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onDismiss={() => {
        if (!mode) {
          setPresentedMode(null);
          setPresentedItem(null);
        }
      }}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={Boolean(mode)}
    >
      {displayMode && content ? (
        <ModalScreen
          actionIcon={X}
          actionLabel="Close contribution modal"
          headerContent={
            displayMode === "restaurant-request" ? (
              <AnimatedContentSwap
                primary={
                  <View>
                    <Text style={styles.kicker}>{content.kicker}</Text>
                    <Text style={styles.title}>{content.title}</Text>
                  </View>
                }
                secondary={
                  <AnimatedContentSwap
                    primary={
                      <View>
                        <Text style={styles.kicker}>Request sent</Text>
                        <Text style={styles.title}>Add a Review?</Text>
                      </View>
                    }
                    secondary={
                      <View>
                        <Text style={styles.kicker}>Thank you</Text>
                        <Text style={styles.title}>Queued for Review</Text>
                      </View>
                    }
                    showSecondary={submitted}
                  />
                }
                showSecondary={Boolean(requestedRestaurantId)}
                style={styles.headerTransition}
              />
            ) : (
              <>
                <Text style={styles.kicker}>{content.kicker}</Text>
                <Text style={styles.title}>{content.title}</Text>
              </>
            )
          }
          includeBottomInset={false}
          onActionPress={onClose}
        >
          <AnimatedContentSwap
            primary={
              submitted && !requestedRestaurantId ? (
                <SubmissionDone onClose={onClose} />
              ) : (
                <View style={styles.formShell}>
              <KeyboardAwareScrollView
                bottomOffset={
                  displayMode === "restaurant-request"
                    ? Math.max(stickyFooterHeight + 4, 20)
                    : 20
                }
                contentContainerStyle={[
                  styles.content,
                  displayMode === "restaurant-request" &&
                    styles.restaurantRequestContent,
                ]}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                ref={scrollViewRef}
                style={styles.formScroll}
              >
                {content.helper ? (
                  <Text style={styles.helper}>{content.helper}</Text>
                ) : null}

                {displayMode === "restaurant-request" ? (
                  <>
                    <RestaurantPlaceLookup
                      error={placeLookupError}
                      loading={placeLookupLoading}
                      onChangeText={updateRestaurantName}
                      onSelect={selectPlaceSuggestion}
                      selectedPlaceId={form.googlePlaceId}
                      suggestions={placeSuggestions}
                      value={placeSearchText}
                    />
                    <Field
                      label="Location (optional)"
                      onChangeText={updateRestaurantLocation}
                      placeholder="City, state, or region"
                      value={form.locationHint}
                    />
                    <Field
                      autoCapitalize="none"
                      label="Website (optional)"
                      onChangeText={(value) => update("website", value)}
                      placeholder="https://..."
                      value={form.website}
                    />
                    <View
                      onLayout={(event) => {
                        notesSectionYRef.current = event.nativeEvent.layout.y;
                      }}
                      style={styles.notesSection}
                    >
                      <Field
                        label="Notes (optional)"
                        multiline
                        onChangeText={(value) => update("notes", value)}
                        placeholder="Why should we add it?"
                        value={form.notes}
                      />
                    </View>
                  </>
                ) : null}

                {displayMode === "report" ? (
                  <>
                    <ReasonPicker
                      onSelect={(value) => update("reason", value)}
                      selected={form.reason}
                    />
                    <Field
                      label="What should we fix?"
                      multiline
                      onChangeText={(value) => update("comment", value)}
                      placeholder="Tell us what looks inaccurate."
                      value={form.comment}
                    />
                    <Field
                      autoCapitalize="none"
                      label="Source URL (optional)"
                      onChangeText={(value) => update("sourceUrl", value)}
                      placeholder="Optional link to the correct source"
                      value={form.sourceUrl}
                    />
                  </>
                ) : null}

                {displayMode !== "restaurant-request" ? (
                  <>
                    <PrimaryButton
                      disabled={!canSubmit || isSubmitting}
                      label={
                        isSubmitting ? "Submitting..." : content.submitLabel
                      }
                      loading={isSubmitting}
                      onPress={submit}
                    />
                  </>
                ) : null}
              </KeyboardAwareScrollView>
              {displayMode === "restaurant-request" ? (
                <KeyboardStickyView
                  onLayout={(event) =>
                    setStickyFooterHeight(event.nativeEvent.layout.height)
                  }
                  offset={{
                    closed: 0,
                    opened: Math.max(0, stickyFooterBottomInset - 6),
                  }}
                  style={[
                    styles.stickyFooter,
                    { paddingBottom: stickyFooterBottomInset },
                  ]}
                >
                  <PrimaryButton
                    disabled={!canSubmit || isSubmitting}
                    label={isSubmitting ? "Submitting..." : content.submitLabel}
                    loading={isSubmitting}
                    onPress={submit}
                  />
                </KeyboardStickyView>
              ) : null}
                </View>
              )
            }
            secondary={
              <AnimatedContentSwap
                primary={
                  <View style={styles.formShell}>
                  <KeyboardAwareScrollView
                    bottomOffset={Math.max(stickyFooterHeight + 4, 20)}
                    contentContainerStyle={styles.reviewPageContent}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={styles.reviewApprovalNote}>
                      Published only if the restaurant and review are approved.
                    </Text>
                    <RestaurantRequestReviewSection
                      allergyIds={requestReviewAllergyIds}
                      body={form.body}
                      onBodyChange={(value) => update("body", value)}
                      onChangeRating={setRequestReviewRating}
                      onToggleAllergy={toggleRequestReviewAllergy}
                      rating={requestReviewRating}
                    />
                  </KeyboardAwareScrollView>
                  <KeyboardStickyView
                    onLayout={(event) =>
                      setStickyFooterHeight(event.nativeEvent.layout.height)
                    }
                    offset={{
                      closed: 0,
                      opened: Math.max(0, stickyFooterBottomInset - 6),
                    }}
                    style={[
                      styles.reviewPageActions,
                      { paddingBottom: stickyFooterBottomInset },
                    ]}
                  >
                    {!keyboardVisible ? (
                      <Animated.View
                        entering={FadeInDown.duration(300)}
                        exiting={FadeOutDown.duration(180)}
                        layout={LinearTransition.duration(240)}
                      >
                        <SecondaryButton label="Not now" onPress={onClose} />
                      </Animated.View>
                    ) : null}
                    <PrimaryButton
                      disabled={requestReviewRating < 1}
                      label={
                        authStatus === "authenticated"
                          ? "Submit review"
                          : "Sign in to submit review"
                      }
                      loading={submissions.submitReview.isPending}
                      onPress={submitRequestedRestaurantReview}
                    />
                  </KeyboardStickyView>
                  </View>
                }
                secondary={<SubmissionDone onClose={onClose} />}
                showSecondary={submitted}
              />
            }
            showSecondary={Boolean(requestedRestaurantId)}
          />
        </ModalScreen>
      ) : null}
    </Modal>
  );
}

function SubmissionDone({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.done}>
      <View style={styles.doneIcon}>
        <Check color={colors.primary} size={30} strokeWidth={2.8} />
      </View>
      <Text style={styles.doneTitle}>Queued for review</Text>
      <Text style={styles.doneCopy}>
        Thanks. We&rsquo;ll review your request soon!
      </Text>
      <SecondaryButton label="Close" onPress={onClose} />
    </View>
  );
}

function RestaurantPlaceLookup({
  error,
  loading,
  onChangeText,
  onSelect,
  selectedPlaceId,
  suggestions,
  value,
}: {
  error: string | null;
  loading: boolean;
  onChangeText: (value: string) => void;
  onSelect: (suggestion: GooglePlaceSuggestion) => void;
  selectedPlaceId: string;
  suggestions: GooglePlaceSuggestion[];
  value: string;
}) {
  const placesEnabled = isGooglePlacesConfigured();

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Restaurant name</Text>
      <View style={styles.placeInputShell}>
        <TextInput
          autoCapitalize="words"
          onChangeText={onChangeText}
          placeholder="Search restaurants..."
          placeholderTextColor="#8E8E93"
          style={styles.placeInput}
          value={value}
        />
      </View>

      {!placesEnabled ? (
        <Text style={styles.placeHelper}>Enter the restaurant manually.</Text>
      ) : null}

      {error ? <Text style={styles.placeError}>{error}</Text> : null}

      {loading && !selectedPlaceId ? (
        <View style={styles.placeSuggestions}>
          <View style={styles.placeLoadingState}>
            <SereneLoader size="small" />
            <Text style={styles.placeLoadingText}>Finding restaurants...</Text>
          </View>
        </View>
      ) : suggestions.length > 0 && !selectedPlaceId ? (
        <View style={styles.placeSuggestions}>
          {suggestions.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.id}
              onPress={() => onSelect(suggestion)}
              style={styles.placeSuggestion}
            >
              <View style={styles.placeSuggestionText}>
                <Text numberOfLines={1} style={styles.placeSuggestionTitle}>
                  {suggestion.mainText}
                </Text>
                {suggestion.secondaryText ? (
                  <Text
                    numberOfLines={1}
                    style={styles.placeSuggestionSubtitle}
                  >
                    {suggestion.secondaryText}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RestaurantRequestReviewSection({
  allergyIds,
  body,
  onBodyChange,
  onChangeRating,
  onToggleAllergy,
  rating,
}: {
  allergyIds: string[];
  body: string;
  onBodyChange: (value: string) => void;
  onChangeRating: (rating: number) => void;
  onToggleAllergy: (id: string) => void;
  rating: number;
}) {
  return (
    <View style={styles.reviewForm}>
      <AllergyRatingPicker
        label="Rating"
        onChange={onChangeRating}
        rating={rating}
      />
      {rating ? (
        <>
          <Field
            label="Review (optional)"
            multiline
            onChangeText={onBodyChange}
            placeholder="What should someone with allergies know?"
            value={body}
          />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Relevant allergies (optional)</Text>
            <View style={styles.chipWrap}>
              {allergyOptions.map((option) => (
                <SelectableChip
                  accessibilityRole="checkbox"
                  key={option.id}
                  label={option.label}
                  onPress={() => onToggleAllergy(option.id)}
                  selected={allergyIds.includes(option.id)}
                />
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Field({
  label,
  multiline = false,
  ...props
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#8E8E93"
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function ReasonPicker({
  onSelect,
  selected,
}: {
  onSelect: (id: string) => void;
  selected: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Reason</Text>
      <View style={styles.reasonList}>
        {reportReasons.map((reason) => (
          <SelectableChip
            accessibilityRole="radio"
            key={reason.id}
            label={reason.label}
            onPress={() => onSelect(reason.id)}
            selected={selected === reason.id}
          />
        ))}
      </View>
    </View>
  );
}

function modalContent(
  mode: ContributionMode,
  restaurantName?: string,
  itemName?: string,
) {
  const target = itemName ?? restaurantName ?? "this restaurant";

  if (mode === "restaurant-request") {
    return {
      helper: null,
      kicker: "Suggest",
      submitLabel: "Request restaurant",
      title: "Request Restaurant",
    };
  }

  return {
    helper: `Tell us what looks wrong with ${target}. Reports are private and reviewed by our team.`,
    kicker: "Report",
    submitLabel: "Send report",
    title: "Report Inaccurate Info",
  };
}

function formatAllergyContext(allergyIds: string[]) {
  const labels = getAllergyLabels(allergyIds);

  return labels.length > 0
    ? `Relevant allergies: ${labels.join(", ")}`
    : "General restaurant note";
}

function formatDisplayAddress(form: FormState) {
  const cityRegion = [form.city.trim(), form.region.trim()]
    .filter(Boolean)
    .join(", ");

  return [
    form.addressLine1.trim(),
    form.addressLine2.trim(),
    [cityRegion, form.postalCode.trim()].filter(Boolean).join(" "),
    form.country.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  content: {
    gap: spacing.two,
    padding: spacing.three,
    paddingBottom: spacing.four,
  },
  restaurantRequestContent: {
    paddingBottom: spacing.four,
  },
  done: {
    flex: 1,
    gap: spacing.two,
    justifyContent: "center",
    padding: spacing.three,
  },
  doneCopy: {
    color: colors.muted,
    fontSize: 18,
    lineHeight: 25,
    textAlign: "center",
  },
  doneIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 38,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  doneTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  formShell: {
    flex: 1,
  },
  formScroll: {
    flex: 1,
  },
  helper: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  headerTransition: {
    height: 52,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.two,
    paddingVertical: 13,
  },
  kicker: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  multiline: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  notesSection: {
    gap: spacing.two,
  },
  placeError: {
    color: "#C0362C",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  placeHelper: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  placeInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    minHeight: 50,
    paddingVertical: 12,
  },
  placeInputShell: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: spacing.two,
  },
  placeLoadingState: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: spacing.two,
  },
  placeLoadingText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  placeSuggestion: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: spacing.two,
    paddingVertical: 12,
  },
  placeSuggestionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  placeSuggestionText: {
    flex: 1,
  },
  placeSuggestionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  placeSuggestions: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  reasonList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reviewApprovalNote: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  reviewForm: {
    gap: spacing.three,
  },
  reviewPageActions: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderTopWidth: 1,
    gap: 10,
    paddingHorizontal: spacing.three,
    paddingTop: 12,
  },
  reviewPageContent: {
    gap: spacing.three,
    padding: spacing.three,
    paddingBottom: spacing.four,
  },
  stickyFooter: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderTopWidth: 1,
    paddingHorizontal: spacing.three,
    paddingTop: 12,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "800",
    lineHeight: 29,
  },
});
