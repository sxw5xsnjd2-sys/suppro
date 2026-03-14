import React, { useMemo, useRef, useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
  TSpan,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import {
  AppBackdrop,
  AppButton,
  PrimaryCard,
  SectionTitle,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { DeleteMetricModal } from "./DeleteMetricModal";
import {
  BLOOD_PRESSURE_METRIC_KEY,
  TRACKER_TYPES,
  formatMetricValue,
  isNumericMetric,
  normalizeMetric,
} from "@/features/health/metricDefinitions";

const CHART_HEIGHT = 260;
const SIDE_PADDING = 32;
const TOP_PADDING = 56;
const BOTTOM_PADDING = 64;
const SWIPE_ACTION_WIDTH = 96;

const withOrdinal = (n) => {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

const formatEntryDate = (dateString) => {
  const d = new Date(dateString);
  const day = withOrdinal(d.getDate());
  const month = d
    .toLocaleString("en-GB", { month: "short" })
    .replace(/^./, (c) => c.toUpperCase());
  return `${day} ${month}`;
};

function TimelineEntryRow({
  entry,
  valueLabel,
  isTextMetric,
  onDeletePress,
  onSelect,
}) {
  const [headerHeight, setHeaderHeight] = useState(null);

  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={(progress) => {
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [SWIPE_ACTION_WIDTH, 0],
          extrapolate: "clamp",
        });

        return (
          <Animated.View
            style={[
              styles.swipeDeleteContainer,
              { width: SWIPE_ACTION_WIDTH, transform: [{ translateX }] },
            ]}
          >
            <View
              style={[
                styles.swipeDeleteSlot,
                headerHeight ? { height: headerHeight } : null,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.swipeDelete,
                  pressed && styles.swipeDeletePressed,
                ]}
                onPress={() => onDeletePress(entry)}
              >
                <Text style={styles.swipeDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </Animated.View>
        );
      }}
    >
      <View style={styles.timelineCard}>
        <View style={styles.timelineDot} />

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.timelineContent,
            pressed && styles.timelineContentPressed,
          ]}
          onPress={() => onSelect(entry)}
        >
          <View
            style={styles.timelineHeader}
            onLayout={({ nativeEvent }) => {
              const nextHeight = nativeEvent.layout.height;
              setHeaderHeight((prev) => (prev === nextHeight ? prev : nextHeight));
            }}
          >
            <Text style={styles.timelineDate}>{formatEntryDate(entry.date)}</Text>

            {!isTextMetric ? (
              <View style={styles.scorePill}>
                <Text style={styles.scoreText}>{valueLabel}</Text>
              </View>
            ) : null}
          </View>

          {isTextMetric ? (
            <Text style={styles.timelineValueText}>{valueLabel}</Text>
          ) : null}
          {entry.note ? <Text style={styles.timelineNote}>{entry.note}</Text> : null}
        </Pressable>
      </View>
    </Swipeable>
  );
}

export function HealthMetricSummaryModal({
  visible,
  label,
  metric,
  metricKey,
  entries,
  onClose,
  onDeleteMetric,
  onDeleteEntry,
  supplementMarkers,
}) {
  const safeEntries = entries ?? [];
  const sorted = useMemo(
    () => [...safeEntries].sort((a, b) => a.date.localeCompare(b.date)),
    [safeEntries]
  );
  const normalizedMetric = useMemo(
    () =>
      normalizeMetric(metric) ??
      normalizeMetric({
        key: metricKey ?? "metric",
        label: label ?? "Metric",
        trackerType: TRACKER_TYPES.SCALE,
        enabled: true,
      }),
    [metric, metricKey, label]
  );
  const isTextMetric = normalizedMetric?.trackerType === TRACKER_TYPES.TEXT;
  const isChartableMetric =
    isNumericMetric(normalizedMetric) &&
    normalizedMetric?.key !== BLOOD_PRESSURE_METRIC_KEY;
  const chartEntries = useMemo(() => {
    if (!isNumericMetric(normalizedMetric)) return [];
    return sorted
      .map((entry) => {
        const numericValue = Number(entry.value);
        if (!Number.isFinite(numericValue)) return null;
        return { ...entry, value: numericValue };
      })
      .filter(Boolean);
  }, [sorted, normalizedMetric]);

  const scrollRef = useRef(null);
  const notesScrollRef = useRef(null);
  const entryLayouts = useRef({});

  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [visible]);

  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(
    Math.max(chartEntries.length, 1) * 48,
    screenWidth - spacing.md * 2
  );
  const TOP = TOP_PADDING;
  const BOTTOM = CHART_HEIGHT - BOTTOM_PADDING;
  const PLOT_HEIGHT = BOTTOM - TOP;

  const chartMin = useMemo(() => {
    if (!chartEntries.length) return 0;
    const values = chartEntries.map((entry) => entry.value);
    const dataMin = Math.min(...values);
    const configuredMin = Number.isFinite(normalizedMetric?.min)
      ? normalizedMetric.min
      : dataMin;
    return Math.min(configuredMin, dataMin);
  }, [chartEntries, normalizedMetric]);

  const chartMax = useMemo(() => {
    if (!chartEntries.length) return 1;
    const values = chartEntries.map((entry) => entry.value);
    const dataMax = Math.max(...values);
    const configuredMax = Number.isFinite(normalizedMetric?.max)
      ? normalizedMetric.max
      : dataMax;
    const result = Math.max(configuredMax, dataMax);
    return result === chartMin ? result + 1 : result;
  }, [chartEntries, normalizedMetric, chartMin]);

  const getX = (i) =>
    SIDE_PADDING +
    (i / Math.max(chartEntries.length - 1, 1)) * (width - SIDE_PADDING * 2);

  const getY = (value) => {
    const lo = Math.min(chartMin, chartMax);
    const hi = Math.max(chartMin, chartMax);
    if (hi === lo) {
      return TOP + PLOT_HEIGHT / 2;
    }
    const bounded = Math.min(hi, Math.max(lo, value));
    return TOP + ((hi - bounded) / (hi - lo)) * PLOT_HEIGHT;
  };

  const yTicks = useMemo(() => {
    if (!chartEntries.length) return [];
    if (
      normalizedMetric?.trackerType === TRACKER_TYPES.SCALE &&
      Number.isInteger(chartMin) &&
      Number.isInteger(chartMax) &&
      chartMax - chartMin <= 10
    ) {
      const ticks = [];
      for (let v = chartMax; v >= chartMin; v -= 1) {
        ticks.push(v);
      }
      return ticks;
    }

    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, index) => {
      const value = chartMax - ((chartMax - chartMin) * index) / steps;
      return Number(value.toFixed(1));
    });
  }, [chartEntries, normalizedMetric, chartMin, chartMax]);

  const formatAxisValue = (value) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  const hasEntryNote = (entry) =>
    typeof entry.note === "string" && entry.note.trim().length > 0;

  const markersWithX = useMemo(() => {
    if (!supplementMarkers || supplementMarkers.length === 0) return [];
    if (chartEntries.length === 0) return [];

    const firstDate = chartEntries[0].date;
    const lastDate = chartEntries[chartEntries.length - 1].date;

    return supplementMarkers.map((marker) => {
      const startDate = marker.startDate;
      if (startDate <= firstDate) return { ...marker, x: getX(0) };
      if (startDate >= lastDate)
        return { ...marker, x: getX(chartEntries.length - 1) };
      const index = chartEntries.findIndex((e) => e.date >= startDate);
      return {
        ...marker,
        x: getX(index === -1 ? chartEntries.length - 1 : index),
      };
    });
  }, [chartEntries, supplementMarkers, width]);

  const markersWithStack = useMemo(() => {
    const countByX = {};
    return markersWithX.map((m) => {
      const count = countByX[m.x] ?? 0;
      countByX[m.x] = count + 1;
      return { ...m, stack: count };
    });
  }, [markersWithX]);

  const showCondensedMarkers = markersWithX.length > 3;
  const condensedMarkers = useMemo(() => {
    if (!showCondensedMarkers) return [];
    const byX = new Map();

    markersWithX.forEach((m) => {
      const existing = byX.get(m.x);
      if (existing) {
        byX.set(m.x, {
          ...existing,
          count: existing.count + 1,
          names: [...existing.names, m.name],
        });
      } else {
        byX.set(m.x, { count: 1, startDate: m.startDate, names: [m.name] });
      }
    });

    return Array.from(byX.entries()).map(([x, value]) => ({
      x,
      ...value,
    }));
  }, [markersWithX, showCondensedMarkers]);

  const handleCondensedMarkerPress = (marker) => {
    const supplementList = marker.names.join("\n");
    Alert.alert(
      `${marker.count} supplement${marker.count === 1 ? "" : "s"} started`,
      supplementList
    );
  };

  const path =
    chartEntries.length >= 2
      ? chartEntries
          .map((e, i) => {
            const x = getX(i);
            const y = getY(e.value);
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ")
      : "";

  const reversedEntries = useMemo(() => [...sorted].reverse(), [sorted]);
  const entryIndexMap = useMemo(() => {
    const map = {};
    chartEntries.forEach((e, i) => {
      map[e.id] = i;
    });
    return map;
  }, [chartEntries]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMetricDeleteModal, setShowMetricDeleteModal] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);

  const handleDelete = () => {
    if (!metricKey) return;
    setShowMetricDeleteModal(true);
  };

  const handleEntryDeletePress = (entry) => {
    setEntryToDelete(entry);
    setShowDeleteModal(true);
  };

  const handleEntrySelect = (entry) => {
    setSelectedEntryId(entry.id);
    const index = entryIndexMap[entry.id];
    if (index !== undefined && chartEntries.length > 0) {
      const x = getX(index);
      const maxOffset = Math.max(width - screenWidth, 0);
      const targetX = Math.min(Math.max(x - screenWidth / 2, 0), maxOffset);
      scrollRef.current?.scrollTo({ x: targetX, animated: true });
    }
  };

  if (!safeEntries.length) {
    return null;
  }

  const entryCountLabel = `${safeEntries.length} ${
    safeEntries.length === 1 ? "entry" : "entries"
  }`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.screen}>
          <AppBackdrop />

          <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
            <View style={styles.header}>
              <SectionTitle
                title={label}
                subtitle={normalizedMetric?.description || entryCountLabel}
                titleStyle={styles.title}
                subtitleStyle={styles.headerSubtitle}
                action={
                  <View style={styles.headerActions}>
                    <AppButton
                      label="Delete"
                      variant="danger"
                      size="sm"
                      onPress={handleDelete}
                      textStyle={styles.deleteButtonText}
                    />
                    <AppButton
                      accessibilityLabel="Close summary"
                      onPress={onClose}
                      size="icon"
                      variant="overlay"
                    >
                      <Text style={styles.close}>×</Text>
                    </AppButton>
                  </View>
                }
              />
            </View>

            <View style={styles.content}>
              {isChartableMetric ? (
                <PrimaryCard style={styles.chartCard}>
                  <SectionTitle
                    title="Trend"
                    subtitle={
                      chartEntries.length > 0
                        ? "Tap a point to focus its timeline entry."
                        : "No numeric values yet for charting."
                    }
                    titleStyle={styles.cardTitle}
                    subtitleStyle={styles.cardSubtitle}
                  />

                  {chartEntries.length > 0 ? (
                    <View style={styles.chartRow}>
                      <View style={styles.yAxis}>
                        {yTicks.map((value, index) => (
                          <Text
                            key={`${value}-${index}`}
                            style={[styles.yLabel, { top: getY(value) - 6 }]}
                          >
                            {formatAxisValue(value)}
                          </Text>
                        ))}
                      </View>

                      <View style={styles.chartContainer}>
                        <ScrollView
                          ref={scrollRef}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          <Svg width={width} height={CHART_HEIGHT}>
                            {showCondensedMarkers
                              ? condensedMarkers.map((marker, idx) => (
                                  <React.Fragment
                                    key={`${marker.startDate}-condensed-${idx}`}
                                  >
                                    {(() => {
                                      const BOX_WIDTH = 82;
                                      const BOX_HEIGHT = 32;
                                      const boxX = marker.x - BOX_WIDTH / 2;
                                      const boxY = TOP - BOX_HEIGHT - 6;
                                      const noun =
                                        marker.count === 1
                                          ? "supplement"
                                          : "supplements";

                                      return (
                                        <>
                                          <Rect
                                            x={boxX}
                                            y={boxY}
                                            width={BOX_WIDTH}
                                            height={BOX_HEIGHT}
                                            rx={8}
                                            fill={appTheme.colors.surface}
                                            stroke={appTheme.colors.borderSubtle}
                                            onPress={() =>
                                              handleCondensedMarkerPress(marker)
                                            }
                                          />
                                          <SvgText
                                            x={marker.x}
                                            y={boxY + 12}
                                            fontSize="10"
                                            fill={appTheme.colors.textSecondary}
                                            textAnchor="middle"
                                            onPress={() =>
                                              handleCondensedMarkerPress(marker)
                                            }
                                          >
                                            <TSpan>{`${marker.count} ${noun}`}</TSpan>
                                            <TSpan x={marker.x} dy={12}>
                                              started
                                            </TSpan>
                                          </SvgText>
                                        </>
                                      );
                                    })()}
                                    <Line
                                      x1={marker.x}
                                      y1={TOP}
                                      x2={marker.x}
                                      y2={BOTTOM}
                                      stroke={appTheme.colors.textTertiary}
                                      strokeWidth={1.5}
                                      strokeDasharray="4 3"
                                    />
                                  </React.Fragment>
                                ))
                              : markersWithStack.map((marker, idx) => {
                                  const stackOffset = marker.stack * 14;
                                  return (
                                    <React.Fragment key={`${marker.startDate}-${idx}`}>
                                      <Line
                                        x1={marker.x}
                                        y1={TOP}
                                        x2={marker.x}
                                        y2={BOTTOM}
                                        stroke={appTheme.colors.textTertiary}
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                      />
                                      <SvgText
                                        x={marker.x}
                                        y={TOP - 10 - stackOffset}
                                        fontSize="10"
                                        fill={appTheme.colors.textSecondary}
                                        textAnchor="middle"
                                      >
                                        {`${marker.name} start`}
                                      </SvgText>
                                    </React.Fragment>
                                  );
                                })}

                            <Line
                              x1={SIDE_PADDING}
                              y1={BOTTOM}
                              x2={width - SIDE_PADDING}
                              y2={BOTTOM}
                              stroke={appTheme.colors.borderSubtle}
                            />

                            <Line
                              x1={SIDE_PADDING}
                              y1={getY((chartMin + chartMax) / 2)}
                              x2={width - SIDE_PADDING}
                              y2={getY((chartMin + chartMax) / 2)}
                              stroke={appTheme.colors.borderSubtle}
                              strokeDasharray="3 3"
                            />

                            {chartEntries.length >= 2 ? (
                              <Path
                                d={path}
                                stroke={appTheme.colors.textStrong}
                                strokeWidth={2.5}
                                fill="none"
                              />
                            ) : null}

                            {chartEntries.map((entry, index) => {
                              const x = getX(index);
                              const y = getY(entry.value);
                              const pointColor = hasEntryNote(entry)
                                ? "#D9A441"
                                : appTheme.colors.textStrong;

                              return (
                                <React.Fragment key={`${entry.id}-${index}`}>
                                  <Circle
                                    cx={x}
                                    cy={y}
                                    r={16}
                                    fill="transparent"
                                    onPress={() => {
                                      setSelectedEntryId(entry.id);
                                      const targetY =
                                        entryLayouts.current[entry.id];
                                      if (targetY !== undefined) {
                                        notesScrollRef.current?.scrollTo({
                                          y: Math.max(targetY - spacing.md, 0),
                                          animated: true,
                                        });
                                      }
                                    }}
                                  />
                                  <Circle
                                    cx={x}
                                    cy={y}
                                    r={selectedEntryId === entry.id ? 8 : 6}
                                    fill={pointColor}
                                    stroke={
                                      selectedEntryId === entry.id
                                        ? appTheme.colors.surface
                                        : "transparent"
                                    }
                                    strokeWidth={
                                      selectedEntryId === entry.id ? 2 : 0
                                    }
                                  />
                                  <SvgText
                                    x={x}
                                    y={BOTTOM + 18}
                                    fontSize="10"
                                    fill={appTheme.colors.textMuted}
                                    textAnchor="middle"
                                  >
                                    {entry.date
                                      .split("-")
                                      .reverse()
                                      .slice(0, 2)
                                      .join("/")}
                                  </SvgText>
                                </React.Fragment>
                              );
                            })}
                          </Svg>
                        </ScrollView>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.noChartCard}>
                      <Text style={styles.noChartText}>
                        No numeric values yet for charting.
                      </Text>
                    </View>
                  )}
                </PrimaryCard>
              ) : null}

              <PrimaryCard style={styles.timelineSection}>
                <SectionTitle
                  title="Timeline"
                  subtitle="Swipe left on an entry to delete it."
                  titleStyle={styles.cardTitle}
                  subtitleStyle={styles.cardSubtitle}
                  style={styles.timelineHeaderBlock}
                />

                <ScrollView
                  ref={notesScrollRef}
                  style={styles.notes}
                  contentContainerStyle={styles.notesContent}
                  showsVerticalScrollIndicator={false}
                >
                  {reversedEntries.map((entry) => (
                    <View
                      key={entry.id}
                      onLayout={({ nativeEvent }) => {
                        entryLayouts.current[entry.id] = nativeEvent.layout.y;
                      }}
                      style={[
                        styles.timelineRow,
                        selectedEntryId === entry.id && styles.selectedRow,
                      ]}
                    >
                      <TimelineEntryRow
                        entry={entry}
                        valueLabel={formatMetricValue(normalizedMetric, entry.value)}
                        isTextMetric={isTextMetric}
                        onDeletePress={handleEntryDeletePress}
                        onSelect={handleEntrySelect}
                      />
                    </View>
                  ))}
                </ScrollView>
              </PrimaryCard>
            </View>

            <DeleteMetricModal
              visible={showDeleteModal}
              metricLabel={label}
              variant="entry"
              onCancel={() => {
                setShowDeleteModal(false);
                setEntryToDelete(null);
              }}
              onConfirm={() => {
                setShowDeleteModal(false);
                const id = entryToDelete?.id;
                setEntryToDelete(null);
                if (id) {
                  onDeleteEntry(id);
                }
              }}
            />

            <DeleteMetricModal
              visible={showMetricDeleteModal}
              metricLabel={label}
              variant="metric"
              onCancel={() => setShowMetricDeleteModal(false)}
              onConfirm={() => {
                onClose();
                requestAnimationFrame(() => {
                  setShowMetricDeleteModal(false);
                  onDeleteMetric();
                });
              }}
            />
          </SafeAreaView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: appTheme.screen.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: appTheme.screen.sidePadding,
    paddingBottom: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
    color: appTheme.colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  deleteButtonText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  close: {
    fontSize: 22,
    lineHeight: 26,
    marginTop: 4,
    color: appTheme.colors.textStrong,
    fontFamily: typography.fontFamily.body,
  },
  content: {
    flex: 1,
    paddingHorizontal: appTheme.screen.sidePadding,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  chartCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  chartRow: {
    flexDirection: "row",
    height: CHART_HEIGHT,
    marginTop: spacing.md,
  },
  chartContainer: {
    height: CHART_HEIGHT,
    flex: 1,
  },
  yAxis: {
    width: 36,
    height: CHART_HEIGHT,
    position: "relative",
    paddingRight: 6,
  },
  yLabel: {
    position: "absolute",
    right: 0,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textMuted,
  },
  noChartCard: {
    marginTop: spacing.md,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  noChartText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  timelineSection: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  timelineHeaderBlock: {
    marginBottom: spacing.sm,
  },
  notes: {
    flex: 1,
  },
  notesContent: {
    paddingBottom: spacing.sm,
  },
  timelineRow: {
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSubtle,
  },
  selectedRow: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderRadius: 16,
    borderTopColor: "transparent",
  },
  timelineCard: {
    flexDirection: "row",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: appTheme.colors.textStrong,
    marginTop: 8,
    marginRight: spacing.md,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  timelineContentPressed: {
    opacity: 0.82,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: spacing.sm,
  },
  timelineDate: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
  },
  scorePill: {
    backgroundColor: appTheme.colors.surfaceAccent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  scoreText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  timelineValueText: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
  },
  timelineNote: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  swipeDeleteContainer: {
    height: "100%",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: spacing.md,
  },
  swipeDeleteSlot: {
    justifyContent: "center",
    alignItems: "center",
  },
  swipeDelete: {
    backgroundColor: appTheme.colors.danger,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    minWidth: 84,
    height: 36,
    borderRadius: 999,
  },
  swipeDeletePressed: {
    opacity: 0.82,
  },
  swipeDeleteText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
