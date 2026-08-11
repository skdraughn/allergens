import { useAuthenticator } from "@aws-amplify/ui-react-native";
import { Check, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type ScrollView as ScrollViewType,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ModalScreen } from "@/components/modal-screen";
import { PrimaryButton } from "@/components/primary-button";
import { SereneLoader } from "@/components/serene-loader";
import { SelectableChip } from "@/components/selectable-chip";
import { useSnackbar } from "@/components/snackbar-provider";
import { SecondaryButton } from "@/components/secondary-button";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import type { MenuItem, Restaurant } from "@/data/restaurants";
import {
  createGooglePlacesSessionToken,
  fetchRestaurantPlaceDetails,
  fetchRestaurantPlaceSuggestions,
  isGooglePlacesConfigured,
  type GooglePlaceSuggestion,
} from "@/features/community/google-places-service";
import { useCommunitySubmission } from "@/features/community/use-restaurant-community";
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

type RequestMenuDraft = {
  allergens: string[];
  category: string;
  description: string;
  mayContain: string[];
  name: string;
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

const emptyRequestMenuDraft = (): RequestMenuDraft => ({
  allergens: [],
  category: "",
  description: "",
  mayContain: [],
  name: "",
});

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
  const submissions = useCommunitySubmission(restaurant?.id);
  const [form, setForm] = useState<FormState>(() => ({
    ...defaultForm,
    category: item?.category ?? "",
    name: initialRestaurantName ?? "",
  }));
  const [requestMenuItems, setRequestMenuItems] = useState<RequestMenuDraft[]>([]);
  const [placeLocation, setPlaceLocation] = useState<RestaurantSearchLocation | null>(null);
  const [placeLookupError, setPlaceLookupError] = useState<string | null>(null);
  const [placeLookupLoading, setPlaceLookupLoading] = useState(false);
  const [placeSearchText, setPlaceSearchText] = useState(initialRestaurantName ?? "");
  const [placeSessionToken, setPlaceSessionToken] = useState(createGooglePlacesSessionToken);
  const [placeSuggestions, setPlaceSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const notesSectionYRef = useRef(0);
  const scrollViewRef = useRef<ScrollViewType>(null);
  const [submitted, setSubmitted] = useState(false);
  const content = mode ? modalContent(mode, restaurant?.name, item?.name) : null;
  const isSubmitting =
    submissions.submitReport.isPending ||
    submissions.submitRestaurantRequest.isPending;

  useEffect(() => {
    if (!mode) {
      return;
    }

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
    setRequestMenuItems([]);
  }, [initialRestaurantName, item?.category, mode]);

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
      return;
    }

    const query = placeSearchText.trim();

    if (query.length < 3 || form.googlePlaceId) {
      setPlaceSuggestions([]);
      setPlaceLookupError(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setPlaceLookupLoading(true);
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
              error instanceof Error ? error.message : "Restaurant lookup is unavailable right now.",
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
  }, [form.googlePlaceId, mode, placeLocation, placeSearchText, placeSessionToken]);

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
    setForm((current) => ({
      ...current,
      googleMapsUri: "",
      googlePlaceId: "",
      lat: null,
      lng: null,
      name: value,
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
        error instanceof Error ? error.message : "Restaurant details are unavailable right now.",
      );
    } finally {
      setPlaceLookupLoading(false);
    }
  };

  const addRequestMenuItem = () => {
    setRequestMenuItems((current) => [...current, emptyRequestMenuDraft()]);
  };

  const removeRequestMenuItem = (index: number) => {
    setRequestMenuItems((current) => current.filter((_, nextIndex) => nextIndex !== index));
  };

  const updateRequestMenuItem = (
    index: number,
    field: Exclude<keyof RequestMenuDraft, "allergens" | "mayContain">,
    value: string,
  ) => {
    setRequestMenuItems((current) =>
      current.map((draft, nextIndex) =>
        nextIndex === index ? { ...draft, [field]: value } : draft,
      ),
    );
  };

  const toggleRequestMenuAllergen = (
    index: number,
    field: "allergens" | "mayContain",
    id: string,
  ) => {
    setRequestMenuItems((current) =>
      current.map((draft, nextIndex) => {
        if (nextIndex !== index) {
          return draft;
        }

        return {
          ...draft,
          [field]: draft[field].includes(id)
            ? draft[field].filter((value) => value !== id)
            : [...draft[field], id],
        };
      }),
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
        await submissions.submitRestaurantRequest.mutateAsync({
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
          notes: formatRestaurantRequestNotes(form.notes, requestMenuItems),
          postalCode: form.postalCode,
          region: form.region,
          website: form.website,
        });
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
      const message = nextError instanceof Error ? nextError.message : "Submission failed.";
      showSnackbar({ message, title: "Submission Error", tone: "error" });
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={Boolean(mode)}
    >
      {mode && content ? (
        <ModalScreen
          actionIcon={X}
          actionLabel="Close contribution modal"
          headerContent={
            <>
              <Text style={styles.kicker}>{content.kicker}</Text>
              <Text style={styles.title}>{content.title}</Text>
            </>
          }
          onActionPress={onClose}
        >
          {submitted ? (
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
          ) : (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.formShell}
            >
              <ScrollView
                contentContainerStyle={[
                  styles.content,
                  mode === "restaurant-request" && styles.restaurantRequestContent,
                ]}
                keyboardShouldPersistTaps="handled"
                ref={scrollViewRef}
              >
              {content.helper ? <Text style={styles.helper}>{content.helper}</Text> : null}

              {mode === "restaurant-request" ? (
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
                    autoCapitalize="none"
                    label="Website"
                    onChangeText={(value) => update("website", value)}
                    placeholder="https://..."
                    value={form.website}
                  />
                  <Field
                    label="Location"
                    onChangeText={(value) => update("locationHint", value)}
                    placeholder="City, state, or region"
                    value={form.locationHint}
                  />
                  <Field
                    label="Street address"
                    onChangeText={(value) => update("addressLine1", value)}
                    placeholder="Optional"
                    value={form.addressLine1}
                  />
                  <Field
                    label="Unit or suite"
                    onChangeText={(value) => update("addressLine2", value)}
                    placeholder="Optional"
                    value={form.addressLine2}
                  />
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldRowPrimary}>
                      <Field
                        label="City"
                        onChangeText={(value) => update("city", value)}
                        placeholder="Optional"
                        value={form.city}
                      />
                    </View>
                    <View style={styles.fieldRowRegion}>
                      <Field
                        autoCapitalize="characters"
                        label="State"
                        onChangeText={(value) => update("region", value)}
                        placeholder="ST"
                        value={form.region}
                      />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldRowPrimary}>
                      <Field
                        label="ZIP"
                        onChangeText={(value) => update("postalCode", value)}
                        placeholder="Optional"
                        value={form.postalCode}
                      />
                    </View>
                    <View style={styles.fieldRowRegion}>
                      <Field
                        autoCapitalize="characters"
                        label="Country"
                        onChangeText={(value) => update("country", value)}
                        placeholder="US"
                        value={form.country}
                      />
                    </View>
                  </View>
                  <View
                    onLayout={(event) => {
                      notesSectionYRef.current = event.nativeEvent.layout.y;
                    }}
                    style={styles.notesSection}
                  >
                    <Field
                      label="Notes"
                      multiline
                      onChangeText={(value) => update("notes", value)}
                      placeholder="Why should we add it?"
                      value={form.notes}
                    />
                    <RestaurantRequestMenuSection
                      items={requestMenuItems}
                      onAdd={addRequestMenuItem}
                      onRemove={removeRequestMenuItem}
                      onToggleAllergen={toggleRequestMenuAllergen}
                      onUpdate={updateRequestMenuItem}
                    />
                  </View>
                </>
              ) : null}

              {mode === "report" ? (
                <>
                  <ReasonPicker onSelect={(value) => update("reason", value)} selected={form.reason} />
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

                {mode !== "restaurant-request" ? (
                  <>
                    <PrimaryButton
                      disabled={!canSubmit || isSubmitting}
                      label={isSubmitting ? "Submitting..." : content.submitLabel}
                      loading={isSubmitting}
                      onPress={submit}
                    />
                  </>
                ) : null}
              </ScrollView>
              {mode === "restaurant-request" ? (
                <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <PrimaryButton
                    disabled={!canSubmit || isSubmitting}
                    label={isSubmitting ? "Submitting..." : content.submitLabel}
                    loading={isSubmitting}
                    onPress={submit}
                  />
                </View>
              ) : null}
            </KeyboardAvoidingView>
          )}
        </ModalScreen>
      ) : null}
    </Modal>
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
          placeholder="Search restaurants"
          placeholderTextColor="#8E8E93"
          style={styles.placeInput}
          value={value}
        />
        {loading ? <SereneLoader size="small" /> : null}
      </View>

      {!placesEnabled ? (
        <Text style={styles.placeHelper}>Enter the restaurant manually.</Text>
      ) : null}

      {error ? <Text style={styles.placeError}>{error}</Text> : null}

      {suggestions.length > 0 && !selectedPlaceId ? (
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
                  <Text numberOfLines={1} style={styles.placeSuggestionSubtitle}>
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

function RestaurantRequestMenuSection({
  items,
  onAdd,
  onRemove,
  onToggleAllergen,
  onUpdate,
}: {
  items: RequestMenuDraft[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onToggleAllergen: (index: number, field: "allergens" | "mayContain", id: string) => void;
  onUpdate: (
    index: number,
    field: Exclude<keyof RequestMenuDraft, "allergens" | "mayContain">,
    value: string,
  ) => void;
}) {
  return (
    <View style={styles.optionalMenu}>
      <View style={styles.optionalMenuHeader}>
        <View style={styles.optionalMenuText}>
          <Text style={styles.optionalMenuTitle}>Optional menu info</Text>
          <Text style={styles.optionalMenuCopy}>
            Add item names and allergen details if you already have them.
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onAdd} style={styles.addMenuButton}>
          <Text style={styles.addMenuButtonText}>{items.length ? "Add" : "Add item"}</Text>
        </Pressable>
      </View>

      {items.map((draft, index) => (
        <View key={index} style={styles.requestMenuCard}>
          <View style={styles.requestMenuCardHeader}>
            <Text style={styles.requestMenuCardTitle}>Menu item {index + 1}</Text>
            <Pressable
              accessibilityLabel={`Remove menu item ${index + 1}`}
              accessibilityRole="button"
              onPress={() => onRemove(index)}
              style={styles.removeMenuButton}
            >
              <X color={colors.muted} size={16} strokeWidth={2.6} />
            </Pressable>
          </View>
          <Field
            label="Item name"
            onChangeText={(value) => onUpdate(index, "name", value)}
            placeholder="Menu item"
            value={draft.name}
          />
          <Field
            label="Category"
            onChangeText={(value) => onUpdate(index, "category", value)}
            placeholder="Entrees, sides, drinks..."
            value={draft.category}
          />
          <Field
            label="Description"
            multiline
            onChangeText={(value) => onUpdate(index, "description", value)}
            placeholder="Optional item details"
            value={draft.description}
          />
          <AllergenPicker
            label="Contains"
            onToggle={(id) => onToggleAllergen(index, "allergens", id)}
            selectedIds={draft.allergens}
          />
          <AllergenPicker
            label="Cross-contact"
            onToggle={(id) => onToggleAllergen(index, "mayContain", id)}
            selectedIds={draft.mayContain}
          />
        </View>
      ))}
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

function AllergenPicker({
  label,
  onToggle,
  selectedIds,
}: {
  label: string;
  onToggle: (id: string) => void;
  selectedIds: string[];
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {allergyOptions.map((option) => {
          const selected = selectedIds.includes(option.id);

          return (
            <SelectableChip
              accessibilityRole="checkbox"
              key={option.id}
              label={option.label}
              onPress={() => onToggle(option.id)}
              selected={selected}
            />
          );
        })}
      </View>
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

function modalContent(mode: ContributionMode, restaurantName?: string, itemName?: string) {
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

function formatRestaurantRequestNotes(notes: string, menuItems: RequestMenuDraft[]) {
  const cleanNotes = notes.trim();
  const filledItems = menuItems
    .map((item) => ({
      allergens: labelsForAllergens(item.allergens),
      category: item.category.trim(),
      description: item.description.trim(),
      mayContain: labelsForAllergens(item.mayContain),
      name: item.name.trim(),
    }))
    .filter(
      (item) =>
        item.name || item.category || item.description || item.allergens || item.mayContain,
    );

  if (filledItems.length === 0) {
    return cleanNotes;
  }

  const menuNotes = filledItems
    .map((item, index) => {
      const lines = [`${index + 1}. ${item.name || "Unnamed item"}`];

      if (item.category) {
        lines.push(`Category: ${item.category}`);
      }

      if (item.description) {
        lines.push(`Description: ${item.description}`);
      }

      if (item.allergens) {
        lines.push(`Contains: ${item.allergens}`);
      }

      if (item.mayContain) {
        lines.push(`Cross-contact: ${item.mayContain}`);
      }

      return lines.join("; ");
    })
    .join("\n");

  return [cleanNotes, "Suggested menu/allergen info:", menuNotes].filter(Boolean).join("\n\n");
}

function formatDisplayAddress(form: FormState) {
  const cityRegion = [form.city.trim(), form.region.trim()].filter(Boolean).join(", ");

  return [
    form.addressLine1.trim(),
    form.addressLine2.trim(),
    [cityRegion, form.postalCode.trim()].filter(Boolean).join(" "),
    form.country.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

function labelsForAllergens(ids: string[]) {
  return ids
    .map((id) => allergyOptions.find((option) => option.id === id)?.label ?? id)
    .join(", ");
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
    paddingBottom: 130,
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
  fieldRow: {
    flexDirection: "row",
    gap: spacing.two,
  },
  fieldRowPrimary: {
    flex: 1,
  },
  fieldRowRegion: {
    width: 98,
  },
  formShell: {
    flex: 1,
  },
  addMenuButton: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 13,
  },
  addMenuButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  helper: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
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
  optionalMenu: {
    backgroundColor: "#F8F8FA",
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.two,
    padding: spacing.two,
  },
  optionalMenuCopy: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 2,
  },
  optionalMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.two,
  },
  optionalMenuText: {
    flex: 1,
  },
  optionalMenuTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
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
  removeMenuButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  requestMenuCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: spacing.two,
    padding: spacing.two,
  },
  requestMenuCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  requestMenuCardTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  stickyFooter: {
    backgroundColor: "rgba(255,255,255,0.94)",
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
