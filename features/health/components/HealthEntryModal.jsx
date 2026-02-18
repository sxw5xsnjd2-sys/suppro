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
import { useHealthStore } from "@/features/health/store";
import {
  BLOOD_PRESSURE_METRIC_KEY,
  isBloodPressureMetric,
  isValidBloodPressureValue,
  TRACKER_TYPES,
  defaultEntryValue,
  normalizeMetric,
  normalizeBloodPressureValue,
  normalizeNumericValue,
  parseNumericText,
} from "@/features/health/metricDefinitions";

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function humanizeMetricKey(metricKey) {
  if (!metricKey) return "Metric";
  return metricKey
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function valueLabelFor(metric) {
  if (!metric) return "Value";
  if (isBloodPressureMetric(metric)) return "Blood pressure";
  if (metric.trackerType === TRACKER_TYPES.SCALE) return "Score";
  if (metric.trackerType === TRACKER_TYPES.TEXT) return "Entry";
  return "Value";
}

export function HealthEntryModal({ visible, metric, onClose }) {
  const addEntry = useHealthStore((s) => s.addEntry);
  const entries = useHealthStore((s) => s.entries);
  const metrics = useHealthStore((s) => s.metrics);

  const date = useMemo(() => todayYYYYMMDD(), []);

  const selectedMetric = useMemo(() => {
    if (!metric) return null;
    const existingMetric = (metrics ?? []).find((item) => item?.key === metric);
    return (
      normalizeMetric(existingMetric) ||
      normalizeMetric({
        key: metric,
        label: humanizeMetricKey(metric),
        trackerType: TRACKER_TYPES.SCALE,
        enabled: true,
      })
    );
  }, [metric, metrics]);

  const existingToday = useMemo(() => {
    if (!metric) return null;
    const todays = entries
      .filter((entry) => entry.type === metric && entry.date === date)
      .slice();
    return todays.length ? todays[todays.length - 1] : null;
  }, [entries, metric, date]);

  const [scaleValue, setScaleValue] = useState(5);
  const [numericInput, setNumericInput] = useState("");
  const [bpSystolicInput, setBpSystolicInput] = useState("");
  const [bpDiastolicInput, setBpDiastolicInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !selectedMetric) return;

    if (existingToday) {
      if (selectedMetric.trackerType === TRACKER_TYPES.TEXT) {
        const nextText = typeof existingToday.value === "string" ? existingToday.value : String(existingToday.value ?? "");
        setTextInput(nextText);
        setBpSystolicInput("");
        setBpDiastolicInput("");
      } else if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
        const nextScale = normalizeNumericValue(existingToday.value, selectedMetric);
        setScaleValue(Number.isFinite(nextScale) ? nextScale : Number(defaultEntryValue(selectedMetric) || 5));
        setBpSystolicInput("");
        setBpDiastolicInput("");
      } else {
        if (isBloodPressureMetric(selectedMetric)) {
          const bpValue = normalizeBloodPressureValue(existingToday.value);
          setBpSystolicInput(String(bpValue?.systolic ?? 120));
          setBpDiastolicInput(String(bpValue?.diastolic ?? 80));
          setNumericInput("");
        } else {
          const numeric = Number(existingToday.value);
          const nextNumeric = Number.isFinite(numeric)
            ? numeric
            : Number(defaultEntryValue(selectedMetric) || 0);
          setNumericInput(String(nextNumeric));
          setBpSystolicInput("");
          setBpDiastolicInput("");
        }
      }
      setNote(existingToday.note ?? "");
    } else {
      const defaultValue = defaultEntryValue(selectedMetric);
      if (selectedMetric.trackerType === TRACKER_TYPES.TEXT) {
        setTextInput("");
        setBpSystolicInput("");
        setBpDiastolicInput("");
      } else if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
        setScaleValue(typeof defaultValue === "number" ? defaultValue : 5);
        setBpSystolicInput("");
        setBpDiastolicInput("");
      } else {
        if (isBloodPressureMetric(selectedMetric)) {
          setBpSystolicInput(String(defaultValue ?? 120));
          setBpDiastolicInput("80");
          setNumericInput("");
        } else {
          setNumericInput(String(defaultValue ?? ""));
          setBpSystolicInput("");
          setBpDiastolicInput("");
        }
      }
      setNote("");
    }
    setError("");
  }, [visible, existingToday, selectedMetric]);

  if (!metric || !selectedMetric) return null;

  const handleSave = () => {
    setError("");

    let value;
    if (selectedMetric.trackerType === TRACKER_TYPES.TEXT) {
      const trimmed = textInput.trim();
      if (!trimmed) {
        setError("Please enter text for this metric.");
        return;
      }
      value = trimmed;
    } else if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
      const numericValue = normalizeNumericValue(scaleValue, selectedMetric);
      if (!Number.isFinite(numericValue)) {
        setError("Please select a valid score.");
        return;
      }
      value = numericValue;
    } else {
      if (isBloodPressureMetric(selectedMetric)) {
        const bpValue = normalizeBloodPressureValue({
          systolic: bpSystolicInput,
          diastolic: bpDiastolicInput,
        });
        if (!isValidBloodPressureValue(bpValue)) {
          setError("Please enter valid systolic and diastolic values.");
          return;
        }
        value = bpValue;
      } else {
      const parsed = parseNumericText(numericInput);
      if (parsed == null) {
        setError("Please enter a numeric value.");
        return;
      }
      const numericValue = normalizeNumericValue(parsed, selectedMetric);
      if (!Number.isFinite(numericValue)) {
        setError("Please enter a valid numeric value.");
        return;
      }
      value = numericValue;
      }
    }

    addEntry({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: metric,
      value,
      date,
      note: note.trim() ? note.trim() : undefined,
    });
    onClose();
  };

  const canSave =
    selectedMetric.trackerType === TRACKER_TYPES.TEXT
      ? textInput.trim().length > 0
      : selectedMetric.trackerType === TRACKER_TYPES.SCALE
      ? Number.isFinite(scaleValue)
      : isBloodPressureMetric(selectedMetric)
      ? isValidBloodPressureValue({
          systolic: bpSystolicInput,
          diastolic: bpDiastolicInput,
        })
      : parseNumericText(numericInput) != null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{selectedMetric.label || humanizeMetricKey(metric)}</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={styles.close}>Close</Text>
              </Pressable>
            </View>

            <Text style={styles.subtitle}>{date}</Text>
            {selectedMetric.description ? (
              <Text style={styles.metricDescription}>
                {selectedMetric.description}
              </Text>
            ) : null}

            <View style={styles.field}>
              <View style={styles.sliderHeader}>
                <Text style={styles.label}>{valueLabelFor(selectedMetric)}</Text>
                {selectedMetric.trackerType === TRACKER_TYPES.SCALE ? (
                  <Text style={styles.valueBadge}>{Math.round(scaleValue)}</Text>
                ) : null}
              </View>

              {selectedMetric.trackerType === TRACKER_TYPES.SCALE ? (
                <>
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>{selectedMetric.lowLabel ?? "Low"}</Text>
                    <Text style={styles.sliderLabel}>{selectedMetric.highLabel ?? "High"}</Text>
                  </View>
                  <Slider
                    minimumValue={selectedMetric.min ?? 1}
                    maximumValue={selectedMetric.max ?? 10}
                    step={selectedMetric.step ?? 1}
                    value={scaleValue}
                    onValueChange={setScaleValue}
                    minimumTrackTintColor={colors.brand.primary}
                    maximumTrackTintColor={colors.border.subtle}
                    thumbTintColor={colors.brand.primary}
                  />
                </>
              ) : null}

              {(selectedMetric.trackerType === TRACKER_TYPES.NUMBER ||
                selectedMetric.trackerType === TRACKER_TYPES.HOURS) &&
              !isBloodPressureMetric(selectedMetric) ? (
                <View style={styles.numericRow}>
                  <TextInput
                    value={numericInput}
                    onChangeText={(nextValue) => {
                      setNumericInput(nextValue);
                      setError("");
                    }}
                    placeholder={selectedMetric.placeholder ?? "Enter value"}
                    placeholderTextColor={colors.text.muted}
                    style={[styles.input, styles.numericInput]}
                    keyboardType="decimal-pad"
                  />
                  {selectedMetric.unit ? (
                    <View style={styles.unitPill}>
                      <Text style={styles.unitPillText}>{selectedMetric.unit}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {selectedMetric.key === BLOOD_PRESSURE_METRIC_KEY ? (
                <View style={styles.numericRow}>
                  <TextInput
                    value={bpSystolicInput}
                    onChangeText={(nextValue) => {
                      setBpSystolicInput(nextValue);
                      setError("");
                    }}
                    placeholder="Systolic"
                    placeholderTextColor={colors.text.muted}
                    style={[styles.input, styles.bloodPressureInput]}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    value={bpDiastolicInput}
                    onChangeText={(nextValue) => {
                      setBpDiastolicInput(nextValue);
                      setError("");
                    }}
                    placeholder="Diastolic"
                    placeholderTextColor={colors.text.muted}
                    style={[styles.input, styles.bloodPressureInput]}
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.unitPill}>
                    <Text style={styles.unitPillText}>mmHg</Text>
                  </View>
                </View>
              ) : null}

              {selectedMetric.trackerType === TRACKER_TYPES.TEXT ? (
                <TextInput
                  value={textInput}
                  onChangeText={(nextValue) => {
                    setTextInput(nextValue);
                    setError("");
                  }}
                  placeholder={selectedMetric.placeholder ?? "Write your entry"}
                  placeholderTextColor={colors.text.muted}
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Short context..."
                placeholderTextColor={colors.text.muted}
                style={[styles.input, styles.textarea]}
                multiline
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.primaryBtn,
                !canSave && styles.primaryBtnDisabled,
                pressed && canSave && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.primaryBtnText}>{existingToday ? "Save (updates today)" : "Save"}</Text>
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
    flex: 1,
    marginRight: spacing.sm,
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
  metricDescription: {
    marginTop: spacing.xs,
    ...typography.caption,
    color: colors.text.secondary,
    lineHeight: 18,
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
  numericRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  numericInput: {
    flex: 1,
  },
  bloodPressureInput: {
    flex: 1,
    minWidth: 0,
  },
  unitPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  unitPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  textarea: {
    minHeight: 84,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.status.danger,
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
