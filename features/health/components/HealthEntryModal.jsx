import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import {
  AppButton,
  AppModalSurface,
  SectionTitle,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { useHealthStore } from "@/features/health/store";
import {
  APPLE_HEALTH_ENTRY_SOURCE,
  MANUAL_ENTRY_SOURCE,
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

function withOrdinal(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatDisplayDate(isoDate) {
  const [year, month, day] = String(isoDate || "")
    .split("-")
    .map(Number);
  const parsed = new Date(year || 1970, (month || 1) - 1, day || 1);
  const monthLabel = parsed.toLocaleDateString("en-GB", { month: "long" });
  return `${withOrdinal(
    parsed.getDate()
  )} ${monthLabel} ${parsed.getFullYear()}`;
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
  const displayDate = useMemo(() => formatDisplayDate(date), [date]);

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
      .filter(
        (entry) =>
          entry.type === metric &&
          entry.date === date &&
          entry.source !== APPLE_HEALTH_ENTRY_SOURCE
      )
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
        const nextText =
          typeof existingToday.value === "string"
            ? existingToday.value
            : String(existingToday.value ?? "");
        setTextInput(nextText);
        setBpSystolicInput("");
        setBpDiastolicInput("");
      } else if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
        const nextScale = normalizeNumericValue(
          existingToday.value,
          selectedMetric
        );
        setScaleValue(
          Number.isFinite(nextScale)
            ? nextScale
            : Number(defaultEntryValue(selectedMetric) || 5)
        );
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
      source: MANUAL_ENTRY_SOURCE,
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <AppModalSurface cardStyle={styles.card}>
        <View style={styles.header}>
          <SectionTitle
            title={selectedMetric.label || humanizeMetricKey(metric)}
            subtitle={displayDate}
            titleStyle={styles.title}
            subtitleStyle={styles.subtitle}
            action={
              <AppButton
                accessibilityLabel="Close health entry modal"
                onPress={onClose}
                size="icon"
                variant="overlay"
                style={styles.closeButton}
              >
                <Text style={styles.closeGlyph}>×</Text>
              </AppButton>
            }
          />
          {selectedMetric.description ? (
            <Text style={styles.metricDescription}>
              {selectedMetric.description}
            </Text>
          ) : null}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.field}>
            <View style={styles.valuePanel}>
              <View style={styles.sliderHeader}>
                <View style={styles.valueCopy}>
                  <Text style={styles.label}>
                    {valueLabelFor(selectedMetric)}
                  </Text>
                </View>
                {selectedMetric.trackerType === TRACKER_TYPES.SCALE ? (
                  <View style={styles.valueBadge}>
                    <Text style={styles.valueBadgeText}>
                      {Math.round(scaleValue)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {selectedMetric.trackerType === TRACKER_TYPES.SCALE ? (
                <>
                  <Slider
                    minimumValue={selectedMetric.min ?? 1}
                    maximumValue={selectedMetric.max ?? 10}
                    step={selectedMetric.step ?? 1}
                    value={scaleValue}
                    onValueChange={setScaleValue}
                    minimumTrackTintColor={appTheme.colors.textStrong}
                    maximumTrackTintColor={appTheme.colors.borderInactive}
                    thumbTintColor={appTheme.colors.textStrong}
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>
                      {selectedMetric.lowLabel ?? "Low"}
                    </Text>
                    <Text style={styles.sliderLabel}>
                      {selectedMetric.highLabel ?? "High"}
                    </Text>
                  </View>
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
                    placeholderTextColor={appTheme.colors.textMuted}
                    style={[styles.input, styles.numericInput]}
                    keyboardType="decimal-pad"
                  />
                  {selectedMetric.unit ? (
                    <View style={styles.unitPill}>
                      <Text style={styles.unitPillText}>
                        {selectedMetric.unit}
                      </Text>
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
                    placeholderTextColor={appTheme.colors.textMuted}
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
                    placeholderTextColor={appTheme.colors.textMuted}
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
                  placeholderTextColor={appTheme.colors.textMuted}
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              ) : null}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add note..."
              placeholderTextColor={appTheme.colors.textMuted}
              style={[styles.input, styles.textarea]}
              multiline
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <AppButton
            accessibilityLabel={existingToday ? "Save today's update" : "Save"}
            disabled={!canSave}
            label={existingToday ? "Save (updates today)" : "Save"}
            onPress={handleSave}
            size="md"
            style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
            textStyle={styles.primaryBtnText}
            variant="primary"
          />
        </ScrollView>
      </AppModalSurface>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: "72%",
  },
  header: {
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
    color: appTheme.colors.textPrimary,
  },
  closeButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
  },
  closeGlyph: {
    fontSize: 22,
    lineHeight: 22,
    color: appTheme.colors.textStrong,
    fontFamily: typography.fontFamily.body,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  metricDescription: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  scrollContent: {
    paddingBottom: spacing.xs,
  },
  field: {
    marginTop: spacing.md,
  },
  valuePanel: {
    borderRadius: appTheme.card.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: appTheme.colors.surfaceAccent,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  sliderHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  valueCopy: {
    flex: 1,
  },
  valueBadge: {
    minWidth: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  valueBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  sliderLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textTertiary,
  },
  label: {
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
    marginBottom: spacing.xs,
    letterSpacing: -0.1,
  },
  input: {
    minHeight: 52,
    borderRadius: appTheme.card.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.textPrimary,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
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
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  unitPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
  },
  textarea: {
    minHeight: 116,
    textAlignVertical: "top",
    paddingTop: spacing.md,
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.danger,
  },
  primaryBtn: {
    width: "100%",
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
  primaryBtnDisabled: {
    backgroundColor: appTheme.colors.borderInactive,
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
