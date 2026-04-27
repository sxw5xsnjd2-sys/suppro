import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { appTheme, colors, typography } from "@/theme";
import { accentForMetric } from "@/features/health/groupAccents";
import { useHealthStore } from "@/features/health/store";
import {
  APPLE_HEALTH_ENTRY_SOURCE,
  BLOOD_PRESSURE_METRIC_KEY,
  MANUAL_ENTRY_SOURCE,
  TRACKER_TYPES,
  defaultEntryValue,
  isBloodPressureMetric,
  isValidBloodPressureValue,
  normalizeBloodPressureValue,
  normalizeMetric,
  normalizeNumericValue,
  parseNumericText,
} from "@/features/health/metricDefinitions";

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(isoDate) {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  const d = new Date(year || 1970, (month || 1) - 1, day || 1);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function humanizeMetricKey(metricKey) {
  if (!metricKey) return "Metric";
  return metricKey
    .split("_")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function CloseIcon({ size = 14, color: c = colors.text.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path
        d="M1 1l12 12M13 1L1 13"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function HealthEntryModal({ visible, metric, onClose }) {
  const insets = useSafeAreaInsets();
  const addEntry = useHealthStore((s) => s.addEntry);
  const entries = useHealthStore((s) => s.entries);
  const metrics = useHealthStore((s) => s.metrics);

  const date = useMemo(() => todayYYYYMMDD(), []);
  const displayDate = useMemo(() => formatDisplayDate(date), [date]);

  const selectedMetric = useMemo(() => {
    if (!metric) return null;
    const existing = (metrics ?? []).find((m) => m?.key === metric);
    return (
      normalizeMetric(existing) ||
      normalizeMetric({
        key: metric,
        label: humanizeMetricKey(metric),
        trackerType: TRACKER_TYPES.SCALE,
        enabled: true,
      })
    );
  }, [metric, metrics]);

  const accent = useMemo(() => accentForMetric(selectedMetric ?? {}), [selectedMetric]);

  const existingToday = useMemo(() => {
    if (!metric) return null;
    const todays = (entries ?? []).filter(
      (e) => e.type === metric && e.date === date && e.source !== APPLE_HEALTH_ENTRY_SOURCE
    );
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
        setTextInput(typeof existingToday.value === "string" ? existingToday.value : String(existingToday.value ?? ""));
        setBpSystolicInput(""); setBpDiastolicInput("");
      } else if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
        const v = normalizeNumericValue(existingToday.value, selectedMetric);
        setScaleValue(Number.isFinite(v) ? v : Number(defaultEntryValue(selectedMetric) || 5));
        setBpSystolicInput(""); setBpDiastolicInput("");
      } else {
        if (isBloodPressureMetric(selectedMetric)) {
          const bp = normalizeBloodPressureValue(existingToday.value);
          setBpSystolicInput(String(bp?.systolic ?? 120));
          setBpDiastolicInput(String(bp?.diastolic ?? 80));
          setNumericInput("");
        } else {
          const num = Number(existingToday.value);
          setNumericInput(String(Number.isFinite(num) ? num : defaultEntryValue(selectedMetric) ?? ""));
          setBpSystolicInput(""); setBpDiastolicInput("");
        }
      }
      setNote(existingToday.note ?? "");
    } else {
      const def = defaultEntryValue(selectedMetric);
      if (selectedMetric.trackerType === TRACKER_TYPES.TEXT) {
        setTextInput(""); setBpSystolicInput(""); setBpDiastolicInput("");
      } else if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
        setScaleValue(typeof def === "number" ? def : 5);
        setBpSystolicInput(""); setBpDiastolicInput("");
      } else {
        if (isBloodPressureMetric(selectedMetric)) {
          setBpSystolicInput(String(def ?? 120)); setBpDiastolicInput("80"); setNumericInput("");
        } else {
          setNumericInput(String(def ?? "")); setBpSystolicInput(""); setBpDiastolicInput("");
        }
      }
      setNote("");
    }
    setError("");
  }, [visible, existingToday, selectedMetric]);

  if (!metric || !selectedMetric) return null;

  const isScale = selectedMetric.trackerType === TRACKER_TYPES.SCALE;
  const isBP = metric === BLOOD_PRESSURE_METRIC_KEY;
  const isNumeric =
    (selectedMetric.trackerType === TRACKER_TYPES.NUMBER ||
      selectedMetric.trackerType === TRACKER_TYPES.HOURS) &&
    !isBP;
  const isText = selectedMetric.trackerType === TRACKER_TYPES.TEXT;

  const canSave = isText
    ? textInput.trim().length > 0
    : isScale
    ? Number.isFinite(scaleValue)
    : isBP
    ? isValidBloodPressureValue({ systolic: bpSystolicInput, diastolic: bpDiastolicInput })
    : parseNumericText(numericInput) != null;

  const handleSave = () => {
    setError("");
    let value;

    if (isText) {
      const trimmed = textInput.trim();
      if (!trimmed) { setError("Please enter text for this metric."); return; }
      value = trimmed;
    } else if (isScale) {
      const v = normalizeNumericValue(scaleValue, selectedMetric);
      if (!Number.isFinite(v)) { setError("Please select a valid score."); return; }
      value = v;
    } else if (isBP) {
      const bp = normalizeBloodPressureValue({ systolic: bpSystolicInput, diastolic: bpDiastolicInput });
      if (!isValidBloodPressureValue(bp)) { setError("Please enter valid systolic and diastolic values."); return; }
      value = bp;
    } else {
      const parsed = parseNumericText(numericInput);
      if (parsed == null) { setError("Please enter a numeric value."); return; }
      const v = normalizeNumericValue(parsed, selectedMetric);
      if (!Number.isFinite(v)) { setError("Please enter a valid numeric value."); return; }
      value = v;
    }

    addEntry({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: metric,
      value,
      date,
      source: MANUAL_ENTRY_SOURCE,
      note: note.trim() || undefined,
    });
    onClose();
  };

  const label = selectedMetric.label || humanizeMetricKey(metric);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
              <Text style={styles.dateLabel}>{displayDate}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Close"
            >
              <CloseIcon />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
          >
            {/* Score picker */}
            {isScale && (
              <View style={styles.section}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.inputLabel}>Score</Text>
                  <View style={[styles.scoreBadge, { borderColor: accent.tint }]}>
                    <Text style={[styles.scoreBadgeText, { color: accent.tint }]}>
                      {scaleValue} / {selectedMetric.max ?? 10}
                    </Text>
                  </View>
                </View>
                <View style={styles.scoreGrid}>
                  {Array.from({ length: (selectedMetric.max ?? 10) - (selectedMetric.min ?? 1) + 1 }, (_, i) => {
                    const v = (selectedMetric.min ?? 1) + i;
                    const active = v === scaleValue;
                    return (
                      <Pressable
                        key={v}
                        onPress={() => { setScaleValue(v); setError(""); }}
                        style={[
                          styles.scoreBtn,
                          active && { backgroundColor: accent.tint, borderColor: accent.tint },
                        ]}
                      >
                        <Text style={[styles.scoreBtnText, active && styles.scoreBtnTextActive]}>
                          {v}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.scoreRangeLabels}>
                  <Text style={styles.scoreRangeLabel}>{selectedMetric.lowLabel ?? "Low"}</Text>
                  <Text style={styles.scoreRangeLabel}>{selectedMetric.highLabel ?? "High"}</Text>
                </View>
              </View>
            )}

            {/* Numeric input */}
            {isNumeric && (
              <View style={styles.section}>
                <Text style={styles.inputLabel}>
                  {selectedMetric.unit ? `Value (${selectedMetric.unit})` : "Value"}
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={numericInput}
                    onChangeText={(v) => { setNumericInput(v); setError(""); }}
                    placeholder={selectedMetric.placeholder ?? "0"}
                    placeholderTextColor={colors.text.muted}
                    style={[styles.input, styles.inputFlex]}
                    keyboardType="decimal-pad"
                  />
                  {selectedMetric.unit ? (
                    <View style={styles.unitPill}>
                      <Text style={styles.unitPillText}>{selectedMetric.unit}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}

            {/* Blood pressure */}
            {isBP && (
              <View style={styles.section}>
                <Text style={styles.inputLabel}>Blood pressure (mmHg)</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={bpSystolicInput}
                    onChangeText={(v) => { setBpSystolicInput(v); setError(""); }}
                    placeholder="Systolic"
                    placeholderTextColor={colors.text.muted}
                    style={[styles.input, styles.inputFlex]}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.bpSlash}>/</Text>
                  <TextInput
                    value={bpDiastolicInput}
                    onChangeText={(v) => { setBpDiastolicInput(v); setError(""); }}
                    placeholder="Diastolic"
                    placeholderTextColor={colors.text.muted}
                    style={[styles.input, styles.inputFlex]}
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.unitPill}>
                    <Text style={styles.unitPillText}>mmHg</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Text entry */}
            {isText && (
              <View style={styles.section}>
                <Text style={styles.inputLabel}>Entry</Text>
                <TextInput
                  value={textInput}
                  onChangeText={(v) => { setTextInput(v); setError(""); }}
                  placeholder={selectedMetric.placeholder ?? "Write your entry…"}
                  placeholderTextColor={colors.text.muted}
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              </View>
            )}

            {/* Note */}
            <View style={styles.section}>
              <Text style={styles.inputLabel}>Note (optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a note…"
                placeholderTextColor={colors.text.muted}
                style={[styles.input, styles.noteArea]}
                multiline
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Save */}
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: canSave ? accent.tint : appTheme.colors.surfaceMuted },
                pressed && { opacity: 0.82 },
              ]}
            >
              <Text style={[styles.saveBtnText, { color: canSave ? "#FFFFFF" : colors.text.muted }]}>
                {existingToday ? "Update today" : "Save"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.modal.scrim,
  },
  sheet: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    shadowColor: "#1E2C4A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: appTheme.colors.borderSubtle,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  metricLabel: {
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 24,
    color: colors.text.primary,
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  dateLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginBottom: 18,
  },
  body: {
    gap: 18,
    paddingBottom: 8,
  },
  section: {
    gap: 8,
  },
  inputLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 13,
    color: colors.text.secondary,
    letterSpacing: -0.1,
  },
  scoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  scoreBadgeText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 13,
  },
  scoreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  scoreBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBtnText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 15,
    color: colors.text.primary,
  },
  scoreBtnTextActive: {
    color: "#FFFFFF",
  },
  scoreRangeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  scoreRangeLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11,
    color: colors.text.muted,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  input: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: typography.fontFamily.body,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  noteArea: {
    minHeight: 72,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  bpSlash: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 18,
    color: colors.text.muted,
  },
  unitPill: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: appTheme.colors.surfaceAccent,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    justifyContent: "center",
  },
  unitPillText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 13,
    color: colors.text.secondary,
  },
  errorText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: "#C0392B",
    marginTop: -6,
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 15,
    letterSpacing: -0.2,
  },
});
