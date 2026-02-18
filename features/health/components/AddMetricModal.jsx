import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable, TextInput, ScrollView } from "react-native";
import Slider from "@react-native-community/slider";
import { colors, spacing, radius, shadows, typography } from "@/theme";
import { useHealthStore } from "@/features/health/store";
import {
  BLOOD_PRESSURE_METRIC_KEY,
  CUSTOM_METRIC_KEY,
  CUSTOM_TRACKER_OPTIONS,
  PRESET_METRICS,
  PRESET_METRICS_BY_KEY,
  TRACKER_TYPES,
  defaultEntryValue,
  isBloodPressureMetric,
  isValidBloodPressureValue,
  makeCustomMetric,
  normalizeMetric,
  normalizeBloodPressureValue,
  normalizeNumericValue,
  parseNumericText,
  toMetricKey,
} from "@/features/health/metricDefinitions";

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function trackerLabelFor(metric) {
  if (!metric) return "Value";
  if (isBloodPressureMetric(metric)) return "Today's blood pressure";
  if (metric.trackerType === TRACKER_TYPES.SCALE) return "Today's score";
  if (metric.trackerType === TRACKER_TYPES.TEXT) return "Today's entry";
  return "Today's value";
}

export function AddMetricModal({ visible, onClose }) {
  const addMetric = useHealthStore((s) => s.addMetric);
  const addEntry = useHealthStore((s) => s.addEntry);
  const metrics = useHealthStore((s) => s.metrics);

  const existingMetricKeys = useMemo(
    () =>
      new Set(
        (metrics ?? [])
          .map((metric) => metric?.key)
          .filter(Boolean)
      ),
    [metrics]
  );

  const firstAvailablePreset = useMemo(
    () => PRESET_METRICS.find((metric) => !existingMetricKeys.has(metric.key)),
    [existingMetricKeys]
  );

  const [selectedMetricKey, setSelectedMetricKey] = useState(firstAvailablePreset?.key ?? CUSTOM_METRIC_KEY);
  const [metricName, setMetricName] = useState("");
  const [customTrackerType, setCustomTrackerType] = useState(TRACKER_TYPES.SCALE);

  const [metricDropdownOpen, setMetricDropdownOpen] = useState(false);
  const [trackerDropdownOpen, setTrackerDropdownOpen] = useState(false);

  const [scaleValue, setScaleValue] = useState(5);
  const [numericInput, setNumericInput] = useState("");
  const [bpSystolicInput, setBpSystolicInput] = useState("");
  const [bpDiastolicInput, setBpDiastolicInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState("");

  const isCustomMetric = selectedMetricKey === CUSTOM_METRIC_KEY;
  const customMetricKey = toMetricKey(metricName);
  const customNameConflict = isCustomMetric && customMetricKey && existingMetricKeys.has(customMetricKey);

  const selectedMetric = useMemo(() => {
    if (isCustomMetric) {
      return normalizeMetric({
        key: customMetricKey || "custom_metric",
        label: metricName.trim() || "Custom metric",
        trackerType: customTrackerType,
        enabled: true,
      });
    }
    return normalizeMetric(PRESET_METRICS_BY_KEY[selectedMetricKey]);
  }, [isCustomMetric, selectedMetricKey, metricName, customTrackerType, customMetricKey]);

  const selectedMetricLabel = useMemo(() => {
    if (isCustomMetric) return "Custom metric";
    return PRESET_METRICS_BY_KEY[selectedMetricKey]?.label ?? "Select metric";
  }, [isCustomMetric, selectedMetricKey]);

  useEffect(() => {
    if (!visible) return;

    const nextMetricKey = firstAvailablePreset?.key ?? CUSTOM_METRIC_KEY;
    setSelectedMetricKey(nextMetricKey);
    setMetricName("");
    setCustomTrackerType(TRACKER_TYPES.SCALE);
    setMetricDropdownOpen(false);
    setTrackerDropdownOpen(false);
    setError("");

    const metricForDefaults = normalizeMetric(
      nextMetricKey === CUSTOM_METRIC_KEY
        ? { key: "custom_metric", label: "Custom metric", trackerType: TRACKER_TYPES.SCALE, enabled: true }
        : PRESET_METRICS_BY_KEY[nextMetricKey]
    );
    const defaultValue = defaultEntryValue(metricForDefaults);

    setScaleValue(typeof defaultValue === "number" ? defaultValue : 5);
    setNumericInput(
      metricForDefaults?.trackerType === TRACKER_TYPES.NUMBER || metricForDefaults?.trackerType === TRACKER_TYPES.HOURS
        ? String(defaultValue ?? "")
        : ""
    );
    setBpSystolicInput("");
    setBpDiastolicInput("");
    setTextInput("");
  }, [visible, firstAvailablePreset]);

  useEffect(() => {
    if (!visible || !selectedMetric) return;
    const defaultValue = defaultEntryValue(selectedMetric);

    if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
      setScaleValue(typeof defaultValue === "number" ? defaultValue : 5);
      setBpSystolicInput("");
      setBpDiastolicInput("");
    } else if (
      selectedMetric.trackerType === TRACKER_TYPES.NUMBER ||
      selectedMetric.trackerType === TRACKER_TYPES.HOURS
    ) {
      if (isBloodPressureMetric(selectedMetric)) {
        setBpSystolicInput(String(defaultValue ?? 120));
        setBpDiastolicInput("80");
        setNumericInput("");
      } else {
        setNumericInput(String(defaultValue ?? ""));
        setBpSystolicInput("");
        setBpDiastolicInput("");
      }
    } else {
      setTextInput("");
      setBpSystolicInput("");
      setBpDiastolicInput("");
    }
  }, [visible, selectedMetricKey, customTrackerType]);

  const canSave = useMemo(() => {
    if (!selectedMetric) return false;
    if (isCustomMetric) {
      if (!metricName.trim()) return false;
      if (!customMetricKey) return false;
      if (customNameConflict) return false;
    }

    if (selectedMetric.trackerType === TRACKER_TYPES.TEXT) {
      return textInput.trim().length > 0;
    }
    if (selectedMetric.trackerType === TRACKER_TYPES.SCALE) {
      return Number.isFinite(scaleValue);
    }
    if (isBloodPressureMetric(selectedMetric)) {
      return isValidBloodPressureValue({
        systolic: bpSystolicInput,
        diastolic: bpDiastolicInput,
      });
    }
    return parseNumericText(numericInput) != null;
  }, [selectedMetric, isCustomMetric, metricName, customMetricKey, customNameConflict, textInput, scaleValue, numericInput, bpSystolicInput, bpDiastolicInput]);

  const handleSave = () => {
    if (!selectedMetric) return;
    setError("");

    let metricToSave = selectedMetric;
    if (isCustomMetric) {
      const customMetric = makeCustomMetric(metricName, customTrackerType);
      if (!customMetric?.key) {
        setError("Enter a valid custom metric name.");
        return;
      }
      if (existingMetricKeys.has(customMetric.key)) {
        setError("A metric with that name already exists.");
        return;
      }
      metricToSave = customMetric;
    } else if (existingMetricKeys.has(selectedMetric.key)) {
      setError("This metric is already in your tracker list.");
      return;
    }

    let entryValue;
    if (metricToSave.trackerType === TRACKER_TYPES.TEXT) {
      const textValue = textInput.trim();
      if (!textValue) {
        setError("Add text so this metric can be tracked.");
        return;
      }
      entryValue = textValue;
    } else if (metricToSave.trackerType === TRACKER_TYPES.SCALE) {
      const nextValue = normalizeNumericValue(scaleValue, metricToSave);
      if (!Number.isFinite(nextValue)) {
        setError("Select a valid score.");
        return;
      }
      entryValue = nextValue;
    } else {
      if (isBloodPressureMetric(metricToSave)) {
        const bpValue = normalizeBloodPressureValue({
          systolic: bpSystolicInput,
          diastolic: bpDiastolicInput,
        });
        if (!isValidBloodPressureValue(bpValue)) {
          setError("Enter valid systolic and diastolic values.");
          return;
        }
        entryValue = bpValue;
      } else {
      const parsed = parseNumericText(numericInput);
      if (parsed == null) {
        setError("Enter a numeric value.");
        return;
      }
      const nextValue = normalizeNumericValue(parsed, metricToSave);
      if (!Number.isFinite(nextValue)) {
        setError("Enter a valid numeric value.");
        return;
      }
      entryValue = nextValue;
      }
    }

    addMetric({
      ...metricToSave,
      enabled: true,
    });
    addEntry({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: metricToSave.key,
      value: entryValue,
      date: todayYYYYMMDD(),
    });

    setMetricName("");
    setCustomTrackerType(TRACKER_TYPES.SCALE);
    setScaleValue(5);
    setNumericInput("");
    setBpSystolicInput("");
    setBpDiastolicInput("");
    setTextInput("");
    setError("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Add metric</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.field}>
              <Text style={styles.label}>Metric type</Text>
              <Pressable
                onPress={() => {
                  setTrackerDropdownOpen(false);
                  setMetricDropdownOpen((prev) => !prev);
                }}
                style={styles.selector}
              >
                <Text style={styles.selectorText}>{selectedMetricLabel}</Text>
                <Text style={styles.selectorChevron}>{metricDropdownOpen ? "▴" : "▾"}</Text>
              </Pressable>

              {metricDropdownOpen ? (
                <View style={styles.dropdownPanel}>
                  <ScrollView nestedScrollEnabled style={styles.dropdownScroll}>
                    {PRESET_METRICS.map((metric) => {
                      const alreadyAdded = existingMetricKeys.has(metric.key);
                      return (
                        <Pressable
                          key={metric.key}
                          disabled={alreadyAdded}
                          onPress={() => {
                            setSelectedMetricKey(metric.key);
                            setMetricDropdownOpen(false);
                            setError("");
                          }}
                          style={[
                            styles.dropdownItem,
                            selectedMetricKey === metric.key && styles.dropdownItemSelected,
                            alreadyAdded && styles.dropdownItemDisabled,
                          ]}
                        >
                          <View style={styles.dropdownTextBlock}>
                            <Text
                              style={[
                                styles.dropdownItemText,
                                selectedMetricKey === metric.key && styles.dropdownItemTextSelected,
                                alreadyAdded && styles.dropdownItemTextDisabled,
                              ]}
                            >
                              {metric.label}
                            </Text>
                            {metric.description ? (
                              <Text style={styles.dropdownItemDescription}>
                                {metric.description}
                              </Text>
                            ) : null}
                          </View>
                          {alreadyAdded ? <Text style={styles.dropdownMeta}>Added</Text> : null}
                        </Pressable>
                      );
                    })}

                    <Pressable
                      onPress={() => {
                        setSelectedMetricKey(CUSTOM_METRIC_KEY);
                        setMetricDropdownOpen(false);
                        setError("");
                      }}
                      style={[
                        styles.dropdownItem,
                        styles.dropdownItemTopBorder,
                        selectedMetricKey === CUSTOM_METRIC_KEY && styles.dropdownItemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selectedMetricKey === CUSTOM_METRIC_KEY && styles.dropdownItemTextSelected,
                        ]}
                      >
                        Custom metric
                      </Text>
                    </Pressable>
                  </ScrollView>
                </View>
              ) : null}
            </View>

            {isCustomMetric ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Custom metric name</Text>
                  <TextInput
                    value={metricName}
                    onChangeText={(value) => {
                      setMetricName(value);
                      setError("");
                    }}
                    placeholder="e.g. Hydration score"
                    placeholderTextColor={colors.text.muted}
                    style={styles.input}
                  />
                  {customNameConflict ? <Text style={styles.helperError}>A metric with this name already exists.</Text> : null}
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>How to track it</Text>
                  <Pressable
                    onPress={() => {
                      setMetricDropdownOpen(false);
                      setTrackerDropdownOpen((prev) => !prev);
                    }}
                    style={styles.selector}
                  >
                    <Text style={styles.selectorText}>
                      {CUSTOM_TRACKER_OPTIONS.find((option) => option.key === customTrackerType)?.label ?? "Select tracker"}
                    </Text>
                    <Text style={styles.selectorChevron}>{trackerDropdownOpen ? "▴" : "▾"}</Text>
                  </Pressable>

                  {trackerDropdownOpen ? (
                    <View style={styles.dropdownPanel}>
                      {CUSTOM_TRACKER_OPTIONS.map((option) => (
                        <Pressable
                          key={option.key}
                          onPress={() => {
                            setCustomTrackerType(option.key);
                            setTrackerDropdownOpen(false);
                            setError("");
                          }}
                          style={[
                            styles.dropdownItem,
                            customTrackerType === option.key && styles.dropdownItemSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              customTrackerType === option.key && styles.dropdownItemTextSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {selectedMetric ? (
              <View style={styles.field}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.label}>{trackerLabelFor(selectedMetric)}</Text>
                  {selectedMetric.trackerType === TRACKER_TYPES.SCALE ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{Math.round(scaleValue)}</Text>
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
                      minimumTrackTintColor={colors.brand.primary}
                      maximumTrackTintColor={colors.border.subtle}
                      thumbTintColor={colors.brand.primary}
                    />
                    <View style={styles.scale}>
                      <Text style={styles.scaleText}>{selectedMetric.lowLabel ?? "Low"}</Text>
                      <Text style={styles.scaleText}>{selectedMetric.highLabel ?? "High"}</Text>
                    </View>
                  </>
                ) : null}

                {(selectedMetric.trackerType === TRACKER_TYPES.NUMBER ||
                  selectedMetric.trackerType === TRACKER_TYPES.HOURS) &&
                !isBloodPressureMetric(selectedMetric) ? (
                  <View style={styles.numericRow}>
                    <TextInput
                      value={numericInput}
                      onChangeText={(value) => {
                        setNumericInput(value);
                        setError("");
                      }}
                      placeholder={selectedMetric.placeholder ?? "Enter value"}
                      placeholderTextColor={colors.text.muted}
                      style={[styles.input, styles.numericInput]}
                      keyboardType="decimal-pad"
                    />
                    {selectedMetric.unit ? (
                      <View style={styles.unitBadge}>
                        <Text style={styles.unitText}>{selectedMetric.unit}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {selectedMetric.key === BLOOD_PRESSURE_METRIC_KEY ? (
                  <View style={styles.numericRow}>
                    <TextInput
                      value={bpSystolicInput}
                      onChangeText={(value) => {
                        setBpSystolicInput(value);
                        setError("");
                      }}
                      placeholder="Systolic"
                      placeholderTextColor={colors.text.muted}
                      style={[styles.input, styles.bloodPressureInput]}
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      value={bpDiastolicInput}
                      onChangeText={(value) => {
                        setBpDiastolicInput(value);
                        setError("");
                      }}
                      placeholder="Diastolic"
                      placeholderTextColor={colors.text.muted}
                      style={[styles.input, styles.bloodPressureInput]}
                      keyboardType="decimal-pad"
                    />
                    <View style={styles.unitBadge}>
                      <Text style={styles.unitText}>mmHg</Text>
                    </View>
                  </View>
                ) : null}

                {selectedMetric.trackerType === TRACKER_TYPES.TEXT ? (
                  <TextInput
                    value={textInput}
                    onChangeText={(value) => {
                      setTextInput(value);
                      setError("");
                    }}
                    placeholder={selectedMetric.placeholder ?? "Write your entry"}
                    placeholderTextColor={colors.text.muted}
                    style={[styles.input, styles.textarea]}
                    multiline
                  />
                ) : null}
              </View>
            ) : null}

            {error ? <Text style={styles.helperError}>{error}</Text> : null}

            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveButton,
                !canSave && styles.saveButtonDisabled,
                pressed && canSave && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.saveText}>Save metric</Text>
            </Pressable>
          </ScrollView>
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
    maxHeight: "92%",
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
  textarea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  selector: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.background.card,
  },
  selectorText: {
    fontSize: 14,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  selectorChevron: {
    color: colors.text.secondary,
    fontSize: 12,
  },
  dropdownPanel: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.background.card,
  },
  dropdownScroll: {
    maxHeight: 240,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dropdownItemSelected: {
    backgroundColor: colors.brand.soft,
  },
  dropdownItemDisabled: {
    backgroundColor: colors.background.elevated,
  },
  dropdownItemTopBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  dropdownTextBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  dropdownItemText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  dropdownItemDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
  },
  dropdownItemTextSelected: {
    color: colors.brand.dark,
    fontWeight: "600",
  },
  dropdownItemTextDisabled: {
    color: colors.text.muted,
  },
  dropdownMeta: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "600",
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
  unitBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  unitText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  helperError: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.status.danger,
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
    marginBottom: spacing.xs,
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
