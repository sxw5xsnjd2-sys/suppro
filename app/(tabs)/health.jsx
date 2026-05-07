import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { ChatFloatingButton } from "@/components/common/ui";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { appTheme, colors, typography } from "@/theme";
import {
  INPUT_ARCHETYPES,
  MANUAL_ENTRY_SOURCE,
  PRESET_METRICS_BY_KEY,
  isPresetMetricKey,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import { useHealthStore } from "@/features/health/store";
import { getEffectiveEntries } from "@/features/health/selectors";
import { AddMetricModal } from "@/features/health/components/AddMetricModal";
import {
  AddMetricPlaceholder,
  FullMetricCard,
  HalfMetricCard,
} from "@/features/health/components/HealthInlineMetricCard";
import { useAppleHealthConnection } from "@/features/health/useAppleHealthConnection";

const AUTO_REFRESH_STALE_MS = 60 * 60 * 1000;

function todayYYYYMMDD(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHeaderDate() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function latestEntryForDate(entries, date) {
  const filtered = (entries ?? []).filter((e) => e.date === date);
  return filtered.sort((a, b) => String(a.id).localeCompare(String(b.id))).pop() ?? null;
}

function isScaleArchetype(metric) {
  return (
    metric.inputArchetype === INPUT_ARCHETYPES.SCORE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.PRESSURE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.SEVERITY_0_10
  );
}

function buildDisplayRows(enabledMetrics) {
  const rows = [];
  let halfBuffer = [];

  for (const metric of enabledMetrics) {
    if (isScaleArchetype(metric)) {
      halfBuffer.push(metric);
      if (halfBuffer.length === 2) {
        rows.push({ type: "halves", metrics: [...halfBuffer], showAdd: false });
        halfBuffer = [];
      }
    } else {
      if (halfBuffer.length > 0) {
        rows.push({ type: "halves", metrics: [...halfBuffer], showAdd: false });
        halfBuffer = [];
      }
      rows.push({ type: "full", metric });
    }
  }

  if (halfBuffer.length === 1) {
    rows.push({ type: "halves", metrics: halfBuffer, showAdd: true });
  } else if (halfBuffer.length === 0) {
    rows.push({ type: "halves", metrics: [], showAdd: true });
  } else {
    rows.push({ type: "halves", metrics: halfBuffer, showAdd: false });
    rows.push({ type: "halves", metrics: [], showAdd: true });
  }

  return rows;
}

function AppleHealthPill({ isConnected, isSyncing, onPress }) {
  let label, bg, textColor, iconColor;
  if (isSyncing) {
    label = "Sync Apple Health";
    bg = colors.background.shell;
    textColor = colors.text.muted;
    iconColor = colors.text.muted;
  } else if (isConnected) {
    label = "Apple Health connected";
    bg = "#E3F5E9";
    textColor = "#1A7A38";
    iconColor = "#34C759";
  } else {
    label = "Connect Apple Health";
    bg = colors.background.shell;
    textColor = appTheme.colors.textStrong;
    iconColor = appTheme.colors.textStrong;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isSyncing}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        isConnected
          ? "Open Apple Health connection settings."
          : "Connect Suppro to Apple Health."
      }
      style={({ pressed }) => [
        styles.ahPill,
        { backgroundColor: bg },
        pressed && !isSyncing && styles.ahPillPressed,
      ]}
    >
      <Ionicons name="logo-apple" size={14} color={iconColor} />
      <Text style={[styles.ahLabel, { color: textColor }]}>
        {label}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={14}
        color={textColor}
        style={styles.ahChevron}
      />
    </Pressable>
  );
}

function PlusIcon({ size = 16, color: c = appTheme.colors.textStrong }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 3v10M3 8h10"
        stroke={c}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function HealthScreen() {
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();

  const effectiveEntries = useHealthStore((state) => getEffectiveEntries(state));
  const metrics = useHealthStore((state) => state.metrics);
  const addEntry = useHealthStore((state) => state.addEntry);

  const {
    isIOS,
    isSyncing,
    lastSyncedAt,
    isAppleHealthConnected,
    refreshAppleHealth,
    reconnectAppleHealth,
  } = useAppleHealthConnection();

  const today = useMemo(() => todayYYYYMMDD(), []);
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);

  useEffect(() => {
    if (hasActiveAccess || !isResolved) {
      return;
    }

    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

  const normalizedMetrics = useMemo(() => {
    const currentMetrics = new Map(
      (metrics ?? [])
        .map((m) => normalizeMetric(m))
        .filter(Boolean)
        .map((m) => [m.key, m])
    );
    Object.values(PRESET_METRICS_BY_KEY).forEach((preset) => {
      if (!currentMetrics.has(preset.key)) return;
      currentMetrics.set(preset.key, {
        ...preset,
        ...currentMetrics.get(preset.key),
      });
    });
    return Array.from(currentMetrics.values());
  }, [metrics]);

  const enabledMetrics = useMemo(
    () =>
      normalizedMetrics
        .filter((m) => m.enabled && isPresetMetricKey(m.key))
        .sort((a, b) => {
          if (a.key === "sleep") return -1;
          if (b.key === "sleep") return 1;
          return String(a.group || "").localeCompare(String(b.group || ""));
        }),
    [normalizedMetrics]
  );

  const entriesByMetric = useMemo(() => {
    const next = new Map();
    enabledMetrics.forEach((m) => {
      const metricEntries = (effectiveEntries ?? [])
        .filter((e) => e.type === m.key)
        .sort((a, b) => a.date.localeCompare(b.date));
      next.set(m.key, metricEntries);
    });
    return next;
  }, [effectiveEntries, enabledMetrics]);

  const displayRows = useMemo(() => buildDisplayRows(enabledMetrics), [enabledMetrics]);

  // Score draft values (live slider state, commited on change)
  const [scoreDrafts, setScoreDrafts] = useState({});

  const getScoreValue = (metric) => {
    if (scoreDrafts[metric.key] != null) return scoreDrafts[metric.key];
    const todayEntry = latestEntryForDate(entriesByMetric.get(metric.key), today);
    return Number(todayEntry?.value) || metric.defaultValue || metric.min || 0;
  };

  const handleScoreChange = (metric, value) => {
    if (!requireSubscriptionAccess("health_metric_entry")) {
      return;
    }

    setScoreDrafts((prev) => ({ ...prev, [metric.key]: value }));
    addEntry({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: metric.key,
      value,
      date: today,
      source: MANUAL_ENTRY_SOURCE,
    });
  };

  useEffect(() => {
    if (!isIOS || !isFocused || isSyncing) return;
    if (!isAppleHealthConnected || !lastSyncedAt) return;
    const parsed = new Date(lastSyncedAt);
    if (Number.isNaN(parsed.getTime())) return;
    if (Date.now() - parsed.getTime() <= AUTO_REFRESH_STALE_MS) return;
    refreshAppleHealth();
  }, [isAppleHealthConnected, isFocused, isIOS, isSyncing, lastSyncedAt, refreshAppleHealth]);

  if (!hasActiveAccess) {
    return <BackdropScreen scrollable={false} />;
  }

  return (
    <BackdropScreen
      headerBehavior="collapsible"
      collapsedTitle="HEALTH"
      bottomInsetOffset={72}
      minBottomPadding={96}
      floatingSlot={<ChatFloatingButton />}
      header={
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>HEALTH</Text>
            <Pressable
              onPress={() => {
                if (!requireSubscriptionAccess("health_metrics")) {
                  return;
                }

                setMetricPickerOpen(true);
              }}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Add metric"
            >
              <PlusIcon size={16} />
            </Pressable>
          </View>
          <Text style={styles.headerSubtitle}>
            {formatHeaderDate()} · Tap any metric for details
          </Text>
        </View>
      }
    >
      {enabledMetrics.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Track what your stack changes</Text>
          <Text style={styles.emptyBody}>
            Pick a few daily metrics, then log them inline alongside your supplement routine.
          </Text>
          <Pressable
            onPress={() => {
              if (!requireSubscriptionAccess("health_metrics")) {
                return;
              }

              setMetricPickerOpen(true);
            }}
            style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.emptyActionText}>Pick metrics to track</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.feed}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Today</Text>
            {isIOS && (
              <AppleHealthPill
                isConnected={isAppleHealthConnected}
                isSyncing={isSyncing}
                onPress={() => {
                  if (isAppleHealthConnected) {
                    router.push("/connections");
                    return;
                  }
                  reconnectAppleHealth();
                }}
              />
            )}
          </View>

          {displayRows.map((row, rowIndex) => {
            if (row.type === "full") {
              const m = row.metric;
              const entries = entriesByMetric.get(m.key) ?? [];
              const todayEntry = latestEntryForDate(entries, today);
              return (
                <FullMetricCard
                  key={m.key}
                  metric={m}
                  todayEntry={todayEntry}
                  entries={entries}
                  onPress={() => {
                    if (!requireSubscriptionAccess("health_metric_detail")) {
                      return;
                    }

                    router.push(`/health/${m.key}`);
                  }}
                />
              );
            }

            if (row.type === "halves") {
              const key = `halves-${rowIndex}`;
              return (
                <View key={key} style={styles.halfRow}>
                  {row.metrics.map((m) => {
                    const entries = entriesByMetric.get(m.key) ?? [];
                    return (
                      <HalfMetricCard
                        key={m.key}
                        metric={m}
                        entries={entries}
                        value={getScoreValue(m)}
                        onValueChange={(v) => handleScoreChange(m, v)}
                        onPress={() => {
                          if (!requireSubscriptionAccess("health_metric_detail")) {
                            return;
                          }

                          router.push(`/health/${m.key}`);
                        }}
                      />
                    );
                  })}
                  {row.showAdd && (
                    <AddMetricPlaceholder
                      onPress={() => {
                        if (!requireSubscriptionAccess("health_metrics")) {
                          return;
                        }

                        setMetricPickerOpen(true);
                      }}
                    />
                  )}
                </View>
              );
            }

            return null;
          })}
        </View>
      )}

      <AddMetricModal
        visible={metricPickerOpen}
        onClose={() => setMetricPickerOpen(false)}
      />
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: appTheme.screen.sidePadding,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headerTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 24,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.7,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: appTheme.colors.surfaceOverlayStrong,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: appTheme.colors.textStrong,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: appTheme.colors.textSecondary,
  },
  feed: {
    gap: 12,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 22,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: 8,
    marginBottom: 2,
    paddingLeft: 4,
  },
  ahPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginTop: 6,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  ahPillPressed: {
    opacity: 0.82,
  },
  ahLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 12,
  },
  ahChevron: {
    marginLeft: 1,
  },
  halfRow: {
    flexDirection: "row",
    gap: 10,
  },
  emptyState: {
    marginTop: 40,
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 18,
    color: appTheme.colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 8,
    backgroundColor: appTheme.colors.textStrong,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyActionText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 14,
    color: appTheme.colors.surface,
  },
});
