import { X } from "lucide-react-native";
import { FlatList, Modal, StyleSheet, Text, View } from "react-native";

import { allergyOptions } from "@/constants/allergies";
import { colors, radius, spacing } from "@/constants/theme";

import { ModalScreen } from "./modal-screen";

type AllergyIconGuideModalProps = {
  onClose: () => void;
  visible: boolean;
};

export function AllergyIconGuideModal({ onClose, visible }: AllergyIconGuideModalProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <ModalScreen
        actionIcon={X}
        actionLabel="Close allergy icon guide"
        headerContent={
          <>
            <Text style={styles.kicker}>Guide</Text>
            <Text style={styles.title}>Allergy icons</Text>
          </>
        }
        onActionPress={onClose}
      >
        <FlatList
          contentContainerStyle={styles.content}
          data={allergyOptions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const Icon = item.Icon;

            return (
              <View style={styles.row}>
                <View style={[styles.symbol, { backgroundColor: item.surface }]}>
                  <Icon color={item.accent} size={36} strokeWidth={2.35} />
                </View>
                <View style={styles.textBlock}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.detail}>{item.detail}</Text>
                </View>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </ModalScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.four,
    paddingHorizontal: spacing.three,
    paddingTop: spacing.two,
  },
  detail: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 2,
  },
  kicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  label: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    marginBottom: 10,
    padding: 13,
  },
  symbol: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 29,
  },
});
