import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Slider from "@react-native-community/slider";
import { colors, spacing, radius, shadows, typography } from "@/theme";
import type { HealthMetricType } from "@/features/health/types";
import { useHealthStore } from "@/features/health/store";

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const METRIC_LABEL: Record<HealthMetricType, string> = {
  sleep: "Sleep",
  mood: "Mood",
  energy: "Energy",
  stress: "Stress",
  weight: "Weight",
  resting_hr: "Resting HR",
};

type Props = {
  visible: boolean;
  metric: string | null;
  onClose: () => void;
};

export function HealthEntryModal({ visible, metric, onClose }: Props) {
  const addEntry = useHealthStore((s) => s.addEntry);
  const entries = useHealthStore((s) => s.entries);

  const date = useMemo(() => todayYYYYMMDD(), []);
  const existingToday = useMemo(() => {
    if (!metric) return null;
    // if multiple exist today, use the latest
    const todays = entries
      .filter((e) => e.type === metric && e.date === date)
      .slice();
    return todays.length ? todays[todays.length - 1] : null;
  }, [entries, metric, date]);

  const [value, setValue] = useState<number>(5);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (!visible) return;
    if (existingToday) {
      setValue(existingToday.value);
      setNote(existingToday.note ?? "");
    } else {
      setValue(5);
      setNote("");
    }
  }, [visible, existingToday]);

  if (!metric) return null;

  const label =
    METRIC_LABEL[metric as HealthMetricType] ?? metric ?? "Metric";

  const clampToScale = (n: number) => {
    // most metrics are 1–10 for now as per your model
    // weight/resting_hr could later be treated differently; keep 1–10 today
    return Math.max(1, Math.min(10, n));
  };

  const handleSave = () => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    addEntry({
      id,
      type: metric,
      value: clampToScale(value),
      date,
      note: note.trim() ? note.trim() : undefined,
    });

    onClose();
  };

  const canSave = Number.isFinite(value);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{label}</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={styles.close}>Close</Text>
              </Pressable>
            </View>

            <Text style={styles.subtitle}>{date}</Text>

            <View style={styles.field}>
              <View style={styles.sliderHeader}>
                <Text style={styles.label}>Value (1–10)</Text>
                <Text style={styles.valueBadge}>{clampToScale(value)}</Text>
              </View>
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>1 (Terrible)</Text>
                <Text style={styles.sliderLabel}>10 (Amazing)</Text>
              </View>
              <Slider
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={clampToScale(value)}
                onValueChange={(v) => setValue(clampToScale(v))}
                minimumTrackTintColor={colors.brand.primary}
                maximumTrackTintColor={colors.border.subtle}
                thumbTintColor={colors.brand.primary}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Short context…"
                placeholderTextColor={colors.text.muted}
                style={[styles.input, styles.textarea]}
                multiline
              />
            </View>

            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.primaryBtn,
                !canSave && styles.primaryBtnDisabled,
                pressed && canSave && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {existingToday ? "Save (updates today)" : "Save"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.heading,
    color: colors.text.primary,
  },
  close: {
    ...typography.body,
    color: colors.text.secondary,
  },
  subtitle: {
    marginTop: spacing.xs,
    ...typography.caption,
    color: colors.text.muted,
  },
  field: {
    marginTop: spacing.md,
  },

  sliderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  valueBadge: {
    minWidth: 32,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.sm,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    textAlign: "center",
    ...typography.caption,
    color: colors.text.primary,
  },

  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },

  sliderLabel: {
    ...typography.caption,
    color: colors.text.secondary,
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
    paddingVertical: Platform.OS === "ios" ? spacing.sm : spacing.xs,
    color: colors.text.primary,
    backgroundColor: colors.background.card,
  },
  textarea: {
    minHeight: 84,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.brand.primary,
  },
  primaryBtnDisabled: {
    backgroundColor: colors.border.subtle,
  },
  primaryBtnText: {
    ...typography.body,
    color: colors.text.inverse,
  },
});
