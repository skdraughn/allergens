import { HeartPulse } from "lucide-react-native";
import { ScrollView, StyleSheet } from "react-native";

import { SelectionGroup } from "@/components/selection-group";
import { SetupScreenHeader } from "@/components/setup-screen-header";
import { allergyOptions } from "@/constants/allergies";
import { spacing } from "@/constants/theme";

type AllergyProfilePickerProps = {
  selectedAllergyIds: string[];
  onToggleAllergy: (id: string) => void;
};

export function AllergyProfilePicker({
  onToggleAllergy,
  selectedAllergyIds,
}: AllergyProfilePickerProps) {
  const selectedCount = selectedAllergyIds.length;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SetupScreenHeader
        Icon={HeartPulse}
        subtitle="Choose the foods you avoid"
        title="Allergy Profile"
      />

      <SelectionGroup
        meta={selectedCount === 0 ? "Optional" : `${selectedCount} selected`}
        onToggle={onToggleAllergy}
        options={allergyOptions}
        selectedIds={selectedAllergyIds}
        title="Allergies"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.two,
    paddingHorizontal: spacing.three,
  },
});
