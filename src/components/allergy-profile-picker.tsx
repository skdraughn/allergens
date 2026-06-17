import { ScrollView, StyleSheet, View } from "react-native";

import { SelectionGroup } from "@/components/selection-group";
import { SetupScreenHeader } from "@/components/setup-screen-header";
import { allergyOptions } from "@/constants/allergies";
import { spacing } from "@/constants/theme";

type AllergyProfilePickerProps = {
  selectedAllergyIds: string[];
  embedded?: boolean;
  onToggleAllergy: (id: string) => void;
};

export function AllergyProfilePicker({
  embedded = false,
  onToggleAllergy,
  selectedAllergyIds,
}: AllergyProfilePickerProps) {
  const selectedCount = selectedAllergyIds.length;
  const content = (
    <>
      {embedded ? null : (
        <SetupScreenHeader
          subtitle="Choose the foods you avoid"
          title="Allergy Profile"
        />
      )}

      <SelectionGroup
        hideHeader
        meta={selectedCount === 0 ? "Optional" : `${selectedCount} selected`}
        onToggle={onToggleAllergy}
        options={allergyOptions}
        selectedIds={selectedAllergyIds}
        title="Allergies"
      />
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedContent}>{content}</View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  embeddedContent: {
    paddingTop: spacing.two,
  },
});
