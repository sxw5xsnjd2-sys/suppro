import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { appTheme, typography } from "@/theme";
import { useHealthStore } from "@/features/health/store";
import {
  INPUT_ARCHETYPES,
  PRESET_METRICS,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import { GROUP_ACCENTS } from "@/features/health/groupAccents";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";
import { MetricGlyph } from "./MetricGlyph";

const GROUP_ORDER = [
  "Recovery",
  "Training",
  "Daily wellbeing",
  "Cognition",
  "Load",
  "Symptoms",
  "Hormones",
  "Measurements",
];

function archetypeLabel(inputArchetype) {
  if (inputArchetype === INPUT_ARCHETYPES.DURATION) return "Duration";
  if (inputArchetype === INPUT_ARCHETYPES.SCORE_1_10) return "Score";
  if (inputArchetype === INPUT_ARCHETYPES.PRESSURE_1_10) return "Pressure";
  if (inputArchetype === INPUT_ARCHETYPES.SEVERITY_0_10) return "Severity";
  if (inputArchetype === INPUT_ARCHETYPES.NUMERIC_FREE) return "Measurement";
  return "Metric";
}

function AppleHealthBadge() {
  return (
    <View style={styles.healthBadge}>
      <Svg width={9} height={9} viewBox="0 0 16 16">
        <Path
          d="M8 14S2 10 2 6.5C2 4.6 3.4 3 5.2 3 6.4 3 7.4 3.6 8 4.6 8.6 3.6 9.6 3 10.8 3 12.6 3 14 4.6 14 6.5 14 10 8 14 8 14z"
          fill="#E83E5C"
        />
      </Svg>
      <Text style={styles.healthBadgeText}>HEALTH</Text>
    </View>
  );
}

function SearchIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Circle cx="7" cy="7" r="4.5" stroke={appTheme.input.icon} strokeWidth={1.8} />
      <Path d="M10.5 10.5L13.5 13.5" stroke={appTheme.input.icon} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function GroupHeader({ name, on, total }) {
  const accent = GROUP_ACCENTS[name] ?? GROUP_ACCENTS.Measurements;
  return (
    <View style={styles.groupHeader}>
      <View style={styles.groupHeaderLeft}>
        <View style={[styles.groupDot, { backgroundColor: accent.tint }]} />
        <Text style={styles.groupName}>{name.toUpperCase()}</Text>
      </View>
      <Text style={styles.groupCount}>{on}/{total}</Text>
    </View>
  );
}

function MetricPill({ enabled }) {
  return (
    <View style={[styles.pill, enabled ? styles.pillEnabled : styles.pillDisabled]}>
      {enabled && (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
          <Path
            d="M3 8.5l3 3 7-7"
            stroke="#fff"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
      <Text style={[styles.pillText, enabled ? styles.pillTextEnabled : styles.pillTextDisabled]}>
        {enabled ? "On" : "Add"}
      </Text>
    </View>
  );
}

function MetricRow({ metric, enabled, onToggle }) {
  const accent = GROUP_ACCENTS[metric.group] ?? GROUP_ACCENTS.Measurements;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={enabled ? { selected: true } : {}}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.metricRow,
        enabled
          ? [styles.metricRowEnabled, { borderColor: appTheme.colors.borderPill }]
          : styles.metricRowDisabled,
        pressed && styles.metricRowPressed,
      ]}
    >
      {/* Icon chip */}
      <View
        style={[
          styles.iconChip,
          { backgroundColor: enabled ? appTheme.colors.iconSurface : accent.soft },
        ]}
      >
        <MetricGlyph metricKey={metric.key} size={18} color={accent.tint} />
      </View>

      {/* Copy */}
      <View style={styles.metricCopy}>
        <View style={styles.labelRow}>
          <Text style={styles.metricLabel}>{metric.label}</Text>
          {IS_APPLE_HEALTH_SUPPORTED_PLATFORM && metric.appleHealthSupported ? (
            <AppleHealthBadge />
          ) : null}
        </View>
        <Text numberOfLines={2} style={styles.metricDescription}>
          {metric.description}
        </Text>
        <View style={styles.archetypeRow}>
          <View style={[styles.archetypeDot, { backgroundColor: accent.tint }]} />
          <Text style={[styles.archetypeLabel, { color: accent.tint }]}>
            {archetypeLabel(metric.inputArchetype).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Toggle pill — separate tap target */}
      <Pressable onPress={onToggle} hitSlop={8} style={styles.pillWrapper}>
        <MetricPill enabled={enabled} />
      </Pressable>
    </Pressable>
  );
}

export function AddMetricModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const addMetric = useHealthStore((s) => s.addMetric);
  const enableMetric = useHealthStore((s) => s.enableMetric);
  const disableMetric = useHealthStore((s) => s.disableMetric);
  const metrics = useHealthStore((s) => s.metrics);

  const [query, setQuery] = useState("");
  const existingByKey = useMemo(() => {
    const map = new Map();
    (metrics ?? [])
      .map((m) => normalizeMetric(m))
      .filter(Boolean)
      .forEach((m) => map.set(m.key, m));
    return map;
  }, [metrics]);

  const enabledCount = useMemo(
    () => Array.from(existingByKey.values()).filter((x) => x.enabled).length,
    [existingByKey]
  );

  const groupStats = useMemo(() => {
    const map = new Map();
    PRESET_METRICS.forEach((m) => {
      const e = map.get(m.group) ?? { on: 0, total: 0 };
      e.total += 1;
      if (existingByKey.get(m.key)?.enabled) e.on += 1;
      map.set(m.group, e);
    });
    return map;
  }, [existingByKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRESET_METRICS.filter((m) => {
      if (!q) return true;
      return [m.label, m.shortLabel, m.description, m.group, archetypeLabel(m.inputArchetype)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map(GROUP_ORDER.map((g) => [g, []]));
    filtered.forEach((m) => {
      if (!map.has(m.group)) map.set(m.group, []);
      map.get(m.group).push(m);
    });
    return Array.from(map.entries()).filter(([, items]) => items.length > 0);
  }, [filtered]);

  const toggleMetric = (metric) => {
    const existing = existingByKey.get(metric.key);
    if (existing?.enabled) return disableMetric(metric.key);
    if (existing) return enableMetric(metric.key);
    addMetric({ ...metric, enabled: true });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Pick metrics</Text>
            <Text style={styles.subtitle}>Choose daily inputs to log on the Health tab.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close metric picker"
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={8}
          >
            <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
              <Path d="M4 4l8 8M12 4l-8 8" stroke={appTheme.colors.textPrimary} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>

        {/* Summary chip */}
        <View style={styles.summaryChip}>
          <Text style={styles.summaryCount}>{enabledCount}</Text>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>
              {enabledCount === 1 ? "metric on Health tab" : "metrics on Health tab"}
            </Text>
            <Text style={styles.summaryBody}>
              Tap any row to add or remove. Reorder later from the Health tab.
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchField}>
          <SearchIcon />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search metrics"
            placeholderTextColor={appTheme.input.placeholder}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear metric search"
              onPress={() => setQuery("")}
              style={styles.searchClear}
              hitSlop={8}
            >
              <Text style={styles.searchClearText}>×</Text>
            </Pressable>
          )}
        </View>

        {/* Grouped list */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {grouped.map(([groupName, items]) => {
            const stats = groupStats.get(groupName) ?? { on: 0, total: 0 };
            return (
              <View key={groupName} style={styles.group}>
                <GroupHeader name={groupName} on={stats.on} total={stats.total} />
                <View style={styles.metricList}>
                  {items.map((m) => (
                    <MetricRow
                      key={m.key}
                      metric={m}
                      enabled={existingByKey.get(m.key)?.enabled === true}
                      onToggle={() => toggleMetric(m)}
                    />
                  ))}
                </View>
              </View>
            );
          })}

          {grouped.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No metrics found</Text>
              <Text style={styles.emptyBody}>Try a symptom, score, or measurement.</Text>
            </View>
          )}
        </ScrollView>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appTheme.screen.background,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 24,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.7,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: appTheme.colors.textBody,
    lineHeight: 18,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: appTheme.colors.surfaceOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  // Summary chip
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    marginBottom: 16,
  },
  summaryCount: {
    fontFamily: typography.fontFamily.headingSemiBold,
    fontSize: 24,
    color: appTheme.colors.textStrong,
    letterSpacing: -0.4,
    lineHeight: 28,
    minWidth: 32,
    textAlign: "center",
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    fontFamily: typography.fontFamily.headingSemiBold,
    fontSize: 13,
    color: appTheme.colors.textStrong,
    letterSpacing: -0.1,
  },
  summaryBody: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11.5,
    color: appTheme.colors.textBody,
    lineHeight: 16,
    marginTop: 1,
  },
  // Search
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: appTheme.input.background,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: typography.fontFamily.body,
    fontSize: 15,
    color: appTheme.input.text,
    padding: 0,
  },
  searchClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: appTheme.colors.iconSurfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  searchClearText: {
    color: appTheme.colors.textStrong,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
    marginTop: -1,
  },
  // Scroll content
  scrollContent: {
    paddingBottom: 32,
  },
  // Group
  group: {
    marginBottom: 22,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 8,
    marginTop: 4,
  },
  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  groupName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 13,
    color: appTheme.colors.textPrimary,
    letterSpacing: 0.2,
  },
  groupCount: {
    fontFamily: typography.fontFamily.monoMedium,
    fontSize: 11,
    color: appTheme.colors.textMuted,
    letterSpacing: 0.4,
  },
  metricList: {
    gap: 8,
  },
  // Metric row
  metricRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  metricRowDisabled: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderSubtle,
  },
  metricRowEnabled: {
    borderWidth: 1,
    backgroundColor: appTheme.colors.surfaceAccent,
    borderColor: appTheme.colors.borderPill,
  },
  metricRowPressed: {
    opacity: 0.8,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  metricLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 14.5,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  metricDescription: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: appTheme.colors.textBody,
    lineHeight: 17,
  },
  archetypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  archetypeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  archetypeLabel: {
    fontFamily: typography.fontFamily.monoMedium,
    fontSize: 9.5,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  pillWrapper: {
    alignSelf: "center",
  },
  // Pill
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pillEnabled: {
    backgroundColor: appTheme.colors.textStrong,
  },
  pillDisabled: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  pillText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  pillTextEnabled: {
    color: "#fff",
  },
  pillTextDisabled: {
    color: appTheme.colors.textStrong,
  },
  // Apple Health badge
  healthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#FFE3EA",
  },
  healthBadgeText: {
    fontFamily: typography.fontFamily.monoMedium,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: "#B83A53",
    lineHeight: 12,
  },
  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 16,
    color: appTheme.colors.textPrimary,
  },
  emptyBody: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: appTheme.colors.textBody,
    marginTop: 4,
  },
});
