import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { AppButton, AppModalSurface, SectionTitle } from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
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

  const [selectedMetricKey, setSelectedMetricKey] = useState(
    firstAvailablePreset?.key ?? CUSTOM_METRIC_KEY
  );
  const [metricName, setMetricName] = useState("");
  const [customTrackerType, setCustomTrackerType] = useState(
    TRACKER_TYPES.SCALE
  );

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
  const customNameConflict =
    isCustomMetric &&
    customMetricKey &&
    existingMetricKeys.has(customMetricKey);

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
  }, [
    isCustomMetric,
    selectedMetricKey,
    metricName,
    customTrackerType,
    customMetricKey,
  ]);

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
        ? {
            key: "custom_metric",
            label: "Custom metric",
            trackerType: TRACKER_TYPES.SCALE,
            enabled: true,
          }
        : PRESET_METRICS_BY_KEY[nextMetricKey]
    );
    const defaultValue = defaultEntryValue(metricForDefaults);

    setScaleValue(typeof defaultValue === "number" ? defaultValue : 5);
    setNumericInput(
      metricForDefaults?.trackerType === TRACKER_TYPES.NUMBER ||
        metricForDefaults?.trackerType === TRACKER_TYPES.HOURS
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
  }, [visible, selectedMetricKey, customTrackerType, selectedMetric]);

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
  }, [
    selectedMetric,
    isCustomMetric,
    metricName,
    customMetricKey,
    customNameConflict,
    textInput,
    scaleValue,
    numericInput,
    bpSystolicInput,
    bpDiastolicInput,
  ]);

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <AppModalSurface cardStyle={styles.card}>
        <View style={styles.header}>
          <SectionTitle
            title="Add metric"
            subtitle="Choose a tracker and log today's first value."
            titleStyle={styles.title}
            subtitleStyle={styles.subtitle}
            action={
              <AppButton
                accessibilityLabel="Close add metric modal"
                onPress={onClose}
                size="icon"
                variant="overlay"
                style={styles.closeButton}
              >
                <Text style={styles.closeGlyph}>×</Text>
              </AppButton>
            }
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.field}>
            <Text style={styles.label}>Metric type</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setTrackerDropdownOpen(false);
                setMetricDropdownOpen((prev) => !prev);
              }}
              style={({ pressed }) => [
                styles.selector,
                pressed && styles.selectorPressed,
              ]}
            >
              <Text style={styles.selectorText}>{selectedMetricLabel}</Text>
              <Text style={styles.selectorChevron}>
                {metricDropdownOpen ? "▴" : "▾"}
              </Text>
            </Pressable>

            {metricDropdownOpen ? (
              <View style={styles.dropdownPanel}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={styles.dropdownScroll}
                >
                  {PRESET_METRICS.map((metric, index) => {
                    const alreadyAdded = existingMetricKeys.has(metric.key);
                    return (
                      <Pressable
                        key={metric.key}
                        accessibilityRole="button"
                        disabled={alreadyAdded}
                        onPress={() => {
                          setSelectedMetricKey(metric.key);
                          setMetricDropdownOpen(false);
                          setError("");
                        }}
                        style={({ pressed }) => [
                          styles.dropdownItem,
                          index > 0 && styles.dropdownItemBorder,
                          selectedMetricKey === metric.key &&
                            styles.dropdownItemSelected,
                          alreadyAdded && styles.dropdownItemDisabled,
                          pressed &&
                            !alreadyAdded &&
                            styles.dropdownItemPressed,
                        ]}
                      >
                        <View style={styles.dropdownTextBlock}>
                          <Text
                            style={[
                              styles.dropdownItemText,
                              selectedMetricKey === metric.key &&
                                styles.dropdownItemTextSelected,
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
                        {alreadyAdded ? (
                          <Text style={styles.dropdownMeta}>Added</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedMetricKey(CUSTOM_METRIC_KEY);
                      setMetricDropdownOpen(false);
                      setError("");
                    }}
                    style={({ pressed }) => [
                      styles.dropdownItem,
                      styles.dropdownItemBorder,
                      selectedMetricKey === CUSTOM_METRIC_KEY &&
                        styles.dropdownItemSelected,
                      pressed && styles.dropdownItemPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        selectedMetricKey === CUSTOM_METRIC_KEY &&
                          styles.dropdownItemTextSelected,
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
                  placeholderTextColor={appTheme.colors.textMuted}
                  style={styles.input}
                />
                {customNameConflict ? (
                  <Text style={styles.helperError}>
                    A metric with this name already exists.
                  </Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>How to track it</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setMetricDropdownOpen(false);
                    setTrackerDropdownOpen((prev) => !prev);
                  }}
                  style={({ pressed }) => [
                    styles.selector,
                    pressed && styles.selectorPressed,
                  ]}
                >
                  <Text style={styles.selectorText}>
                    {CUSTOM_TRACKER_OPTIONS.find(
                      (option) => option.key === customTrackerType
                    )?.label ?? "Select tracker"}
                  </Text>
                  <Text style={styles.selectorChevron}>
                    {trackerDropdownOpen ? "▴" : "▾"}
                  </Text>
                </Pressable>

                {trackerDropdownOpen ? (
                  <View style={styles.dropdownPanel}>
                    {CUSTOM_TRACKER_OPTIONS.map((option, index) => (
                      <Pressable
                        key={option.key}
                        accessibilityRole="button"
                        onPress={() => {
                          setCustomTrackerType(option.key);
                          setTrackerDropdownOpen(false);
                          setError("");
                        }}
                        style={({ pressed }) => [
                          styles.dropdownItem,
                          index > 0 && styles.dropdownItemBorder,
                          customTrackerType === option.key &&
                            styles.dropdownItemSelected,
                          pressed && styles.dropdownItemPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            customTrackerType === option.key &&
                              styles.dropdownItemTextSelected,
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
              <View style={styles.valuePanel}>
                <View style={styles.sliderHeader}>
                  <View style={styles.valueCopy}>
                    <Text style={styles.label}>{trackerLabelFor(selectedMetric)}</Text>
                    {selectedMetric.description ? (
                      <Text style={styles.valueDescription}>
                        {selectedMetric.description}
                      </Text>
                    ) : null}
                  </View>
                  {selectedMetric.trackerType === TRACKER_TYPES.SCALE ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
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
                    <View style={styles.scale}>
                      <Text style={styles.scaleText}>
                        {selectedMetric.lowLabel ?? "Low"}
                      </Text>
                      <Text style={styles.scaleText}>
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
                      onChangeText={(value) => {
                        setNumericInput(value);
                        setError("");
                      }}
                      placeholder={selectedMetric.placeholder ?? "Enter value"}
                      placeholderTextColor={appTheme.colors.textMuted}
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
                      placeholderTextColor={appTheme.colors.textMuted}
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
                      placeholderTextColor={appTheme.colors.textMuted}
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
                    placeholderTextColor={appTheme.colors.textMuted}
                    style={[styles.input, styles.textarea]}
                    multiline
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.helperError}>{error}</Text> : null}

          <AppButton
            accessibilityLabel="Save metric"
            disabled={!canSave}
            label="Save metric"
            onPress={handleSave}
            size="md"
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            textStyle={styles.saveText}
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
    minHeight: "74%",
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
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
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
  scrollContent: {
    paddingBottom: spacing.xs,
  },
  field: {
    marginTop: spacing.md,
  },
  label: {
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
    marginBottom: spacing.xs,
    letterSpacing: -0.1,
  },
  selector: {
    minHeight: 52,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  selectorPressed: {
    opacity: 0.84,
  },
  selectorText: {
    flex: 1,
    marginRight: spacing.sm,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  selectorChevron: {
    fontSize: 14,
    color: appTheme.colors.textTertiary,
  },
  dropdownPanel: {
    marginTop: spacing.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.card.radius,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  dropdownScroll: {
    maxHeight: 240,
  },
  dropdownItem: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  dropdownItemBorder: {
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSubtle,
  },
  dropdownItemSelected: {
    backgroundColor: appTheme.colors.surfaceOverlay,
  },
  dropdownItemDisabled: {
    opacity: 0.55,
  },
  dropdownItemPressed: {
    opacity: 0.82,
  },
  dropdownTextBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  dropdownItemText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  dropdownItemDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  dropdownItemTextSelected: {
    color: appTheme.colors.textPrimary,
  },
  dropdownItemTextDisabled: {
    color: appTheme.colors.textMuted,
  },
  dropdownMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textTertiary,
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
  textarea: {
    minHeight: 116,
    textAlignVertical: "top",
    paddingTop: spacing.md,
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
  valueDescription: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  badge: {
    minWidth: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  scale: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  scaleText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textTertiary,
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
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  unitText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
  },
  helperError: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.danger,
  },
  saveButton: {
    width: "100%",
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
  saveButtonDisabled: {
    backgroundColor: appTheme.colors.borderInactive,
  },
  saveText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
