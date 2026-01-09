import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
} from "react-native";
import Slider from "@react-native-community/slider";
import { colors, spacing, radius, shadows, typography } from "@/theme";
import { useHealthStore } from "@/features/health/store";

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AddMetricModal({ visible, onClose }: Props) {
  const addMetric = useHealthStore((s) => s.addMetric);
  const addEntry = useHealthStore((s) => s.addEntry);

  const [metricName, setMetricName] = useState("");
  const [value, setValue] = useState(5);

  const handleSave = () => {
    const name = metricName.trim();
    if (!name) return;

    const key = name.toLowerCase().replace(/\s+/g, "_");
    const clampedValue = Math.min(10, Math.max(1, value));

    addMetric({
      key,
      label: name,
      enabled: true,
    });

    addEntry({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: key,
      value: clampedValue,
      date: todayYYYYMMDD(),
    });

    // reset local state
    setMetricName("");
    setValue(5);

    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Add metric</Text>

            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          {/* Metric name */}
          <View style={styles.field}>
            <Text style={styles.label}>Metric name</Text>
            <TextInput
              value={metricName}
              onChangeText={setMetricName}
              placeholder="e.g. Focus, Anxiety, Pain"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />
          </View>

          {/* Slider */}
          <View style={styles.field}>
            <View style={styles.sliderHeader}>
              <Text style={styles.label}>Today’s value</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{value}</Text>
              </View>
            </View>

            <Slider
              minimumValue={1}
              maximumValue={10}
              step={1}
              value={value}
              onValueChange={setValue}
              minimumTrackTintColor={colors.brand.primary}
              maximumTrackTintColor={colors.border.subtle}
              thumbTintColor={colors.brand.primary}
            />

            <View style={styles.scale}>
              <Text style={styles.scaleText}>1 · Terrible</Text>
              <Text style={styles.scaleText}>10 · Amazing</Text>
            </View>
          </View>

          <Pressable
            onPress={handleSave}
            disabled={!metricName.trim()}
            style={({ pressed }) => [
              styles.saveButton,
              !metricName.trim() && styles.saveButtonDisabled,
              pressed && metricName.trim() && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.saveText}>Save metric</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  title: {
    ...typography.heading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  field: {
    marginTop: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    backgroundColor: colors.background.card,
  },
  sliderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.border.subtle,
  },
  badgeText: {
    fontSize: 12,
    color: colors.text.primary,
  },
  scale: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  scaleText: {
    fontSize: 12,
    color: colors.text.muted,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  close: {
    fontSize: 22,
    fontWeight: "300",
    color: colors.text.muted,
    lineHeight: 22,
  },

  saveButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.brand.primary,
  },

  saveButtonDisabled: {
    backgroundColor: colors.border.subtle,
  },

  saveText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.inverse,
  },
});
