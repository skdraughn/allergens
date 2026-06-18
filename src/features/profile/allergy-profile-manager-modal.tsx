import { Check, Edit3, Plus, Trash2, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AllergyIconChips } from "@/components/allergy-icon-chips";
import { AllergyProfilePicker } from "@/components/allergy-profile-picker";
import { ModalScreen } from "@/components/modal-screen";
import { colors, radius, spacing } from "@/constants/theme";
import { useAllergyProfile } from "@/features/profile/allergy-profile-context";

type AllergyProfileManagerModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function AllergyProfileManagerModal({
  onClose,
  visible,
}: AllergyProfileManagerModalProps) {
  const {
    activeProfileId,
    createProfile,
    deleteProfile,
    profiles,
    renameProfile,
    selectedAllergyIds,
    switchProfile,
    toggleAllergy,
  } = useAllergyProfile();
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const nameInputRef = useRef<TextInput>(null);
  const [draftName, setDraftName] = useState(activeProfile?.name ?? "");
  const [suggestedProfileId, setSuggestedProfileId] = useState<string | null>(null);

  const showingSuggestedName = Boolean(
    activeProfile && suggestedProfileId === activeProfile.id,
  );

  useEffect(() => {
    setDraftName(showingSuggestedName ? "" : activeProfile?.name ?? "");
  }, [activeProfile?.id, activeProfile?.name, showingSuggestedName]);

  useEffect(() => {
    if (!visible) {
      setSuggestedProfileId(null);
    }
  }, [visible]);

  const trimmedDraftName = draftName.trim();
  const hasNameChange = Boolean(
    activeProfile && trimmedDraftName && trimmedDraftName !== activeProfile.name,
  );

  const saveName = () => {
    if (!activeProfile || !trimmedDraftName) {
      setDraftName(showingSuggestedName ? "" : activeProfile?.name ?? "");
      return;
    }

    setSuggestedProfileId(null);
    void renameProfile(activeProfile.id, trimmedDraftName);
  };

  const saveNameAndBlur = () => {
    saveName();
    nameInputRef.current?.blur();
  };

  const handleCreateProfile = async () => {
    const createdProfile = await createProfile();
    setSuggestedProfileId(createdProfile.id);
    setDraftName("");
  };

  const handleSwitchProfile = (id: string) => {
    if (id !== suggestedProfileId) {
      setSuggestedProfileId(null);
    }
    void switchProfile(id);
  };

  const confirmDeleteProfile = (profile: { id: string; name: string }) => {
    Alert.alert(
      "Delete Allergy Profile?",
      `This removes ${profile.name} from this device and your account. This cannot be undone.`,
      [
        {
          style: "cancel",
          text: "Cancel",
        },
        {
          onPress: () => void deleteProfile(profile.id),
          style: "destructive",
          text: "Delete",
        },
      ],
    );
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <View style={styles.modalRoot}>
        <ModalScreen actionIcon={X} actionLabel="Close allergy profiles" onActionPress={onClose}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Allergy Profile</Text>
            <Text style={styles.subtitle}>Switch profiles or update the foods you avoid.</Text>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Profiles</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleCreateProfile()}
                  style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
                >
                  <Plus color={colors.primary} size={17} strokeWidth={2.7} />
                  <Text style={styles.addButtonText}>Add</Text>
                </Pressable>
              </View>

              <View style={styles.profileList}>
                {profiles.map((profile, index) => {
                  const active = profile.id === activeProfileId;
                  const canDelete = profiles.length > 1;

                  return (
                    <View
                      key={profile.id}
                      style={[
                        styles.profileRow,
                        index !== profiles.length - 1 ? styles.profileRowDivider : null,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => handleSwitchProfile(profile.id)}
                        style={({ pressed }) => [
                          styles.profileSelect,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <View style={styles.profileText}>
                          <Text style={styles.profileName}>{profile.name}</Text>
                          <AllergyIconChips
                            allergyIds={profile.selectedAllergyIds}
                            compact
                            highlightedIds={[]}
                            overlap
                            style={styles.profileIconChips}
                          />
                        </View>
                        {active ? (
                          <View style={styles.checkBadge}>
                            <Check color={colors.primary} size={18} strokeWidth={3} />
                          </View>
                        ) : null}
                      </Pressable>
                      {canDelete ? (
                        <Pressable
                          accessibilityLabel={`Delete ${profile.name}`}
                          accessibilityRole="button"
                          onPress={() => confirmDeleteProfile(profile)}
                          style={({ pressed }) => [
                            styles.deleteButton,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          <Trash2 color={colors.coral} size={18} strokeWidth={2.4} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profile Name</Text>
              <View style={styles.nameEditor}>
                <Edit3 color={colors.muted} size={17} strokeWidth={2.3} />
                <TextInput
                  autoCapitalize="words"
                  onBlur={saveName}
                  onChangeText={setDraftName}
                  onSubmitEditing={saveNameAndBlur}
                  placeholder={showingSuggestedName ? activeProfile?.name : "Profile name"}
                  placeholderTextColor="#8E8E93"
                  ref={nameInputRef}
                  returnKeyType="done"
                  style={styles.nameInput}
                  value={draftName}
                />
                {hasNameChange ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={saveNameAndBlur}
                    style={({ pressed }) => [styles.saveButton, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Foods Avoided</Text>
              <Text style={styles.sectionCopy}>
                These selections update the active profile used to check restaurant menus.
              </Text>
              <AllergyProfilePicker
                embedded
                onToggleAllergy={toggleAllergy}
                selectedAllergyIds={selectedAllergyIds}
              />
            </View>
          </ScrollView>
        </ModalScreen>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  checkBadge: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  content: {
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.one,
  },
  nameEditor: {
    alignItems: "center",
    backgroundColor: "#F7F7FA",
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    marginTop: spacing.one,
    minHeight: 52,
    paddingHorizontal: 13,
  },
  modalRoot: {
    flex: 1,
  },
  nameInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 19,
    fontWeight: "700",
    minHeight: 52,
  },
  pressed: {
    opacity: 0.65,
  },
  deleteButton: {
    alignItems: "center",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  profileList: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: spacing.one,
    overflow: "hidden",
  },
  profileName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  profileIconChips: {
    marginTop: 3,
  },
  profileRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  profileRowDivider: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileText: {
    flex: 1,
  },
  profileSelect: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "800",
  },
  section: {
    marginTop: spacing.three,
  },
  sectionCopy: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: spacing.one,
    marginTop: 4,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.one,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 18,
    lineHeight: 24,
    marginTop: 6,
  },
  title: {
    color: colors.ink,
    fontSize: 33,
    fontWeight: "800",
    lineHeight: 39,
  },
});
