import React, { useMemo, useRef, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Animated,
} from "react-native";
import Svg, { Path, Text as SvgText, Line, Circle } from "react-native-svg";
import { colors, spacing, typography } from "@/theme";
import { HealthEntry } from "@/types/HealthMetric";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  Swipeable,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { DeleteMetricModal } from "./DeleteMetricModal";

type Props = {
  visible: boolean;
  label?: string;
  metricKey: string | null;
  entries: HealthEntry[];
  onClose: () => void;
  onDeleteMetric: () => void;
  onDeleteEntry: (id: string) => void;
};

const CHART_HEIGHT = 260;
const SIDE_PADDING = 32;
const TOP_PADDING = 56;
const BOTTOM_PADDING = 64;
const SWIPE_ACTION_WIDTH = 96;

const withOrdinal = (n: number) => {
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

const formatEntryDate = (dateString: string) => {
  const d = new Date(dateString);
  const day = withOrdinal(d.getDate());
  const month = d
    .toLocaleString("en-GB", { month: "short" })
    .replace(/^./, (c) => c.toUpperCase());
  return `${day} ${month}`;
};

type TimelineEntryRowProps = {
  entry: HealthEntry;
  onDeletePress: (entry: HealthEntry) => void;
  onSelect: (entry: HealthEntry) => void;
};

function TimelineEntryRow({
  entry,
  onDeletePress,
  onSelect,
}: TimelineEntryRowProps) {
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);

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
                style={styles.swipeDelete}
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
          style={styles.timelineContent}
          onPress={() => onSelect(entry)}
        >
          <View
            style={styles.timelineHeader}
            onLayout={({ nativeEvent }) => {
              const nextHeight = nativeEvent.layout.height;
              setHeaderHeight((prev) =>
                prev === nextHeight ? prev : nextHeight
              );
            }}
          >
            <Text style={styles.timelineDate}>
              {formatEntryDate(entry.date)}
            </Text>

            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>{entry.value}/10</Text>
            </View>
          </View>

          {entry.note ? (
            <Text style={styles.timelineNote}>{entry.note}</Text>
          ) : null}
        </Pressable>
      </View>
    </Swipeable>
  );
}

export function HealthMetricSummaryModal({
  visible,
  label,
  metricKey,
  entries,
  onClose,
  onDeleteMetric,
  onDeleteEntry,
}: Props) {
  const safeEntries = entries ?? [];

  const sorted = useMemo(
    () => [...safeEntries].sort((a, b) => a.date.localeCompare(b.date)),
    [safeEntries]
  );

  useEffect(() => {
    if (visible) {
      // Small delay ensures layout is complete before scrolling
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [visible]);

  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(sorted.length * 48, screenWidth - spacing.md * 2);

  const TOP = TOP_PADDING;
  const BOTTOM = CHART_HEIGHT - BOTTOM_PADDING;
  const PLOT_HEIGHT = BOTTOM - TOP;

  const getX = (i: number) =>
    SIDE_PADDING +
    (i / Math.max(sorted.length - 1, 1)) * (width - SIDE_PADDING * 2);

  const getY = (value: number) => TOP + ((10 - value) / 9) * PLOT_HEIGHT;

  const path =
    sorted.length >= 2
      ? sorted
          .map((e, i) => {
            const x = getX(i);
            const y = getY(e.value);
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ")
      : "";

  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const reversedEntries = useMemo(() => [...sorted].reverse(), [sorted]);
  const entryIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    sorted.forEach((e, i) => {
      map[e.id] = i;
    });
    return map;
  }, [sorted]);

  const notesScrollRef = useRef<ScrollView>(null);
  const entryLayouts = useRef<Record<string, number>>({});

  const [showDeleteModal, setShowDeleteModal] = useState(false); // entry-level delete
  const [showMetricDeleteModal, setShowMetricDeleteModal] = useState(false);

  const handleDelete = () => {
    if (!metricKey) return;
    setShowMetricDeleteModal(true);
  };

  const [entryToDelete, setEntryToDelete] = useState<HealthEntry | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const handleEntryDeletePress = (entry: HealthEntry) => {
    setEntryToDelete(entry);
    setShowDeleteModal(true);
  };
  const handleEntrySelect = (entry: HealthEntry) => {
    setSelectedEntryId(entry.id);

    const index = entryIndexMap[entry.id];
    if (index !== undefined) {
      const x = getX(index);
      const maxOffset = Math.max(width - screenWidth, 0);
      const targetX = Math.min(Math.max(x - screenWidth / 2, 0), maxOffset);
      scrollRef.current?.scrollTo({ x: targetX, animated: true });
    }
  };

  if (!safeEntries.length) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <SafeAreaView
            style={styles.safeArea}
            edges={["top", "left", "right"]}
          >
            {/* Header */}
            <View
              style={[
                styles.header,
                { paddingTop: insets.top + spacing.xs / 2 },
              ]}
            >
              <Text style={styles.title}>{label}</Text>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Pressable onPress={handleDelete} hitSlop={12}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>

                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  style={{ marginLeft: spacing.md }}
                >
                  <Text style={styles.close}>×</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.chartRow}>
              {/* Fixed Y axis */}
              <View style={styles.yAxis}>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) => (
                  <Text
                    key={v}
                    style={[
                      styles.yLabel,
                      { top: getY(v) - 6 }, // align text to SVG scale
                    ]}
                  >
                    {v}
                  </Text>
                ))}
              </View>

              {/* Scrollable chart */}
              <View style={styles.chartContainer}>
                <ScrollView
                  ref={scrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  <Svg width={width} height={CHART_HEIGHT}>
                    {/* X axis */}
                    <Line
                      x1={SIDE_PADDING}
                      y1={BOTTOM}
                      x2={width - SIDE_PADDING}
                      y2={BOTTOM}
                      stroke={colors.border.subtle}
                    />

                    {/* Midline */}
                    <Line
                      x1={SIDE_PADDING}
                      y1={getY(5)}
                      x2={width - SIDE_PADDING}
                      y2={getY(5)}
                      stroke={colors.border.subtle}
                      strokeDasharray="3 3"
                    />

                    {/* Line */}
                    {sorted.length >= 2 && (
                      <Path
                        d={path}
                        stroke={colors.brand.primary}
                        strokeWidth={2.5}
                        fill="none"
                      />
                    )}

                    {/* Points + X labels */}
                    {sorted.map((e, i) => {
                      const x = getX(i);
                      const y = getY(e.value);

                      return (
                        <React.Fragment key={`${e.id}-${i}`}>
                          <Circle
                            cx={x}
                            cy={y}
                            r={16}
                            fill="transparent"
                            onPress={() => {
                              setSelectedEntryId(e.id);

                              const targetY = entryLayouts.current[e.id];
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
                            r={selectedEntryId === e.id ? 8 : 6}
                            fill={colors.brand.primary}
                            stroke={
                              selectedEntryId === e.id
                                ? colors.brand.primary
                                : "transparent"
                            }
                            strokeWidth={selectedEntryId === e.id ? 2 : 0}
                          />
                          <SvgText
                            x={x}
                            y={BOTTOM + 18}
                            fontSize="10"
                            fill={colors.text.muted}
                            textAnchor="middle"
                          >
                            {e.date.split("-").reverse().slice(0, 2).join("/")}
                          </SvgText>
                        </React.Fragment>
                      );
                    })}
                  </Svg>
                </ScrollView>
              </View>
            </View>

            <ScrollView
              ref={notesScrollRef}
              style={styles.notes}
              contentContainerStyle={styles.notesContent}
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
                    onDeletePress={handleEntryDeletePress}
                    onSelect={handleEntrySelect}
                  />
                </View>
              ))}
            </ScrollView>
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
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.text.primary,
  },
  close: {
    fontSize: 28,
    fontWeight: "300",
    color: colors.text.muted,
  },
  chartContainer: {
    height: CHART_HEIGHT,
    marginBottom: spacing.md,
    flex: 1,
  },
  notes: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  notesContent: {
    paddingBottom: spacing.lg,
  },
  noteRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  noteDate: {
    fontSize: 12,
    color: colors.text.muted,
  },
  noteValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  noteText: {
    marginTop: 2,
    fontSize: 14,
    color: colors.text.secondary,
  },

  chartRow: {
    flexDirection: "row",
    height: CHART_HEIGHT,
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
    color: colors.text.muted,
  },

  timelineCard: {
    flexDirection: "row",
    paddingVertical: spacing.md,
  },

  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
    marginTop: 8,
    marginRight: spacing.md,
  },

  timelineContent: {
    flex: 1,
    paddingBottom: spacing.md,
  },

  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  timelineDate: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
  },

  scorePill: {
    backgroundColor: colors.brand.primary + "22",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  scoreText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand.primary,
  },

  timelineNote: {
    marginTop: 2,
    fontSize: 14,
    color: colors.text.secondary,
  },

  delete: {
    fontSize: 14,
    fontWeight: "600",
    color: "#C62828",
  },

  deleteAction: {
    backgroundColor: "#C62828",
    justifyContent: "center",
    alignItems: "center",
    width: 88,
    marginVertical: spacing.sm,
    borderRadius: 8,
  },

  deleteActionText: {
    color: "#fff",
    fontWeight: "600",
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
    backgroundColor: "#C62828",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    minWidth: 84,
    height: 34,
    borderRadius: 8,
  },

  swipeDeleteText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },

  selectedRow: {
    backgroundColor: colors.brand.primary + "0F",
    borderRadius: 8,
  },

  timelineRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
});
