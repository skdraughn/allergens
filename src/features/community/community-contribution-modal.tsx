import { useAuthenticator } from "@aws-amplify/ui-react-native";
import { Check, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ModalScreen } from "@/components/modal-screen";
import { PrimaryButton } from "@/components/primary-button";
import { SecondaryButton } from "@/components/secondary-button";
import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";
import type { MenuItem, Restaurant } from "@/data/restaurants";
import { useCommunitySubmission } from "@/features/community/use-restaurant-community";

export type ContributionMode = "comment" | "menu-item" | "report" | "restaurant-request";

type CommunityContributionModalProps = {
  initialRestaurantName?: string;
  item?: MenuItem | null;
  mode: ContributionMode | null;
  onClose: () => void;
  onSignInRequired: () => void;
  restaurant?: Restaurant | null;
};

type FormState = {
  allergyContext: string;
  allergens: string[];
  body: string;
  category: string;
  comment: string;
  description: string;
  locationHint: string;
  mayContain: string[];
  name: string;
  notes: string;
  reason: string;
  sourceUrl: string;
  website: string;
};

const defaultForm: FormState = {
  allergyContext: "",
  allergens: [],
  body: "",
  category: "",
  comment: "",
  description: "",
  locationHint: "",
  mayContain: [],
  name: "",
  notes: "",
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
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const submissions = useCommunitySubmission(restaurant?.id);
  const [form, setForm] = useState<FormState>(() => ({
    ...defaultForm,
    category: item?.category ?? "",
    name: initialRestaurantName ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const content = mode ? modalContent(mode, restaurant?.name, item?.name) : null;
  const isSubmitting =
    submissions.submitComment.isPending ||
    submissions.submitMenuItem.isPending ||
    submissions.submitReport.isPending ||
    submissions.submitRestaurantRequest.isPending;

  const canSubmit = useMemo(() => {
    if (!mode) {
      return false;
    }

    if (mode === "restaurant-request") {
      return Boolean(form.name.trim());
    }

    if (mode === "menu-item") {
      return Boolean(restaurant?.id && form.name.trim() && form.category.trim());
    }

    if (mode === "report") {
      return Boolean(restaurant?.id && form.comment.trim());
    }

    return Boolean(restaurant?.id && form.body.trim());
  }, [form, mode, restaurant?.id]);

  const update = (field: keyof FormState, value: string) => {
    setError(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleAllergen = (field: "allergens" | "mayContain", id: string) => {
    setError(null);
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((value) => value !== id)
        : [...current[field], id],
    }));
  };

  const submit = async () => {
    if (authStatus !== "authenticated") {
      onSignInRequired();
      return;
    }

    if (!mode) {
      return;
    }

    setError(null);

    try {
      if (mode === "restaurant-request") {
        await submissions.submitRestaurantRequest.mutateAsync({
          locationHint: form.locationHint,
          name: form.name,
          notes: form.notes,
          website: form.website,
        });
      } else if (mode === "menu-item" && restaurant) {
        await submissions.submitMenuItem.mutateAsync({
          allergens: form.allergens,
          category: form.category,
          description: form.description,
          mayContain: form.mayContain,
          name: form.name,
          restaurantId: restaurant.id,
          sourceUrl: form.sourceUrl,
        });
      } else if (mode === "report" && restaurant) {
        await submissions.submitReport.mutateAsync({
          comment: form.comment,
          menuItemId: item?.id ?? null,
          reason: form.reason,
          restaurantId: restaurant.id,
          sourceUrl: form.sourceUrl,
        });
      } else if (mode === "comment" && restaurant) {
        await submissions.submitComment.mutateAsync({
          allergyContext: form.allergyContext,
          body: form.body,
          menuItemId: item?.id ?? null,
          restaurantId: restaurant.id,
        });
      }

      setSubmitted(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Submission failed.");
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
                Thanks. We’ll review it before it appears for other users.
              </Text>
              <SecondaryButton label="Close" onPress={onClose} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={styles.helper}>{content.helper}</Text>

              {mode === "restaurant-request" ? (
                <>
                  <Field
                    label="Restaurant name"
                    onChangeText={(value) => update("name", value)}
                    placeholder="Restaurant or chain"
                    value={form.name}
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
                    label="Notes"
                    multiline
                    onChangeText={(value) => update("notes", value)}
                    placeholder="Why should we add it?"
                    value={form.notes}
                  />
                </>
              ) : null}

              {mode === "menu-item" ? (
                <>
                  <Field
                    label="Menu item name"
                    onChangeText={(value) => update("name", value)}
                    placeholder="Item name"
                    value={form.name}
                  />
                  <Field
                    label="Category"
                    onChangeText={(value) => update("category", value)}
                    placeholder="Entrees, sides, drinks..."
                    value={form.category}
                  />
                  <Field
                    label="Description"
                    multiline
                    onChangeText={(value) => update("description", value)}
                    placeholder="What is this item?"
                    value={form.description}
                  />
                  <AllergenPicker
                    label="Contains"
                    onToggle={(id) => toggleAllergen("allergens", id)}
                    selectedIds={form.allergens}
                  />
                  <AllergenPicker
                    label="Cross-contact"
                    onToggle={(id) => toggleAllergen("mayContain", id)}
                    selectedIds={form.mayContain}
                  />
                  <Field
                    autoCapitalize="none"
                    label="Source URL"
                    onChangeText={(value) => update("sourceUrl", value)}
                    placeholder="https://..."
                    value={form.sourceUrl}
                  />
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
                    label="Source URL"
                    onChangeText={(value) => update("sourceUrl", value)}
                    placeholder="https://..."
                    value={form.sourceUrl}
                  />
                </>
              ) : null}

              {mode === "comment" ? (
                <>
                  <Field
                    label="Comment"
                    multiline
                    onChangeText={(value) => update("body", value)}
                    placeholder="Share a helpful note for other users."
                    value={form.body}
                  />
                  <Field
                    label="Allergy context"
                    onChangeText={(value) => update("allergyContext", value)}
                    placeholder="Optional: peanut allergy, gluten-free..."
                    value={form.allergyContext}
                  />
                </>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                disabled={!canSubmit || isSubmitting}
                label={isSubmitting ? "Submitting..." : content.submitLabel}
                onPress={submit}
              />
              {isSubmitting ? <ActivityIndicator color={colors.primary} /> : null}
            </ScrollView>
          )}
        </ModalScreen>
      ) : null}
    </Modal>
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
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              key={option.id}
              onPress={() => onToggle(option.id)}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
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
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === reason.id }}
            key={reason.id}
            onPress={() => onSelect(reason.id)}
            style={[styles.reason, selected === reason.id && styles.reasonActive]}
          >
            <Text style={[styles.reasonText, selected === reason.id && styles.reasonTextActive]}>
              {reason.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function modalContent(mode: ContributionMode, restaurantName?: string, itemName?: string) {
  const target = itemName ?? restaurantName ?? "this restaurant";

  if (mode === "restaurant-request") {
    return {
      helper: "Tell us what to add. We’ll look for official allergen sources before publishing.",
      kicker: "Suggest",
      submitLabel: "Request restaurant",
      title: "Request Restaurant",
    };
  }

  if (mode === "menu-item") {
    return {
      helper: "Community menu items are reviewed and labeled separately from official sources.",
      kicker: restaurantName ?? "Community",
      submitLabel: "Submit item",
      title: "Add Menu Item",
    };
  }

  if (mode === "report") {
    return {
      helper: `Tell us what looks wrong with ${target}. Reports are private and reviewed by us.`,
      kicker: "Report",
      submitLabel: "Send report",
      title: "Report Inaccurate Info",
    };
  }

  return {
    helper: `Leave a helpful note about ${target}. Comments appear after review.`,
    kicker: "Community",
    submitLabel: "Submit comment",
    title: "Leave Comment",
  };
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  chipTextActive: {
    color: colors.primary,
  },
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
  error: {
    color: "#B42318",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 15,
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
  reason: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: spacing.two,
    paddingVertical: 13,
  },
  reasonActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  reasonList: {
    gap: 8,
  },
  reasonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  reasonTextActive: {
    color: colors.primary,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "800",
    lineHeight: 29,
  },
});
