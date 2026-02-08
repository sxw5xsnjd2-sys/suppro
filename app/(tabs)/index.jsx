import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { router } from "expo-router";
import { Screen } from "@/components/common/layout/Screen";
import { HomeHeader } from "@/features/supplements/components/HomeHeader";
import { colors, spacing, radius, shadows } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import { getRatingStyle } from "@/utils/ratingStyles";

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No supplements due</Text>
      <Text style={styles.emptyText}>You don’t have anything scheduled for this date.</Text>
    </View>
  );
}

function StatCircle({ value, label, accent, subLabel, progress = 1, variant = "progress" }) {
  const size = 86;
  const strokeWidth = 8;
  const radiusValue = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const normalizedProgress = Math.max(0, Math.min(progress, 1));
  const progressLength = circumference * normalizedProgress;
  const remainderLength = Math.max(circumference - progressLength, 0.0001);

  return (
    <View style={styles.statCol}>
      <View style={styles.statRing}>
        <Svg width={size} height={size} style={styles.statSvg}>
          <Circle
            cx={center}
            cy={center}
            r={radiusValue}
            stroke={`${accent}33`}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {variant === "solid" ? (
            <Circle
              cx={center}
              cy={center}
              r={radiusValue}
              stroke={accent}
              strokeWidth={strokeWidth}
              fill="none"
            />
          ) : (
            <Circle
              cx={center}
              cy={center}
              r={radiusValue}
              stroke={accent}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${progressLength} ${remainderLength}`}
              transform={`rotate(-90 ${center} ${center})`}
            />
          )}
        </Svg>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      {subLabel ? <Text style={styles.statSubLabel}>{subLabel}</Text> : null}
    </View>
  );
}

function periodForMinutes(minutes) {
  if (minutes < 12 * 60) return "Morning";
  if (minutes < 17 * 60) return "Afternoon";
  return "Evening";
}

export default function HomeScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const toggleTaken = useSupplementsStore((s) => s.toggleTaken);
  const metricEntries = useHealthStore((s) => s.entries);

  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [ratingByCatalog, setRatingByCatalog] = useState({});

  const [year, month, day] = selectedDate.split("-").map(Number);
  const selectedDay = new Date(year, (month || 1) - 1, day || 1).getDay();
  const dueSupplements = useMemo(
    () =>
      supplements
        .filter((s) => Array.isArray(s.daysOfWeek) && s.daysOfWeek.includes(selectedDay))
        .sort((a, b) => a.timeMinutes - b.timeMinutes),
    [supplements, selectedDay]
  );

  const visibleSupplements = useMemo(() => {
    if (!searchQuery.trim()) return dueSupplements;
    const q = searchQuery.toLowerCase();
    return dueSupplements.filter((s) => s.name.toLowerCase().includes(q));
  }, [dueSupplements, searchQuery]);

  const takenTimes = useMemo(() => takenTimesByDate[selectedDate] ?? {}, [takenTimesByDate, selectedDate]);
  const takenCount = visibleSupplements.filter((s) => Boolean(takenTimes[s.id])).length;
  const completion = visibleSupplements.length
    ? Math.round((takenCount / visibleSupplements.length) * 100)
    : 0;
  const metricsTrackedCount = useMemo(
    () => metricEntries.filter((entry) => entry.date === selectedDate).length,
    [metricEntries, selectedDate]
  );

  const groupedSchedule = useMemo(() => {
    const groups = { Morning: [], Afternoon: [], Evening: [] };
    visibleSupplements.forEach((s) => {
      groups[periodForMinutes(s.timeMinutes)].push(s);
    });
    return groups;
  }, [visibleSupplements]);

  const ratingColorFor = (catalogId) => {
    if (!catalogId) return colors.brand.primary;
    const score = ratingByCatalog[catalogId];
    if (typeof score !== "number") return colors.brand.primary;
    return getRatingStyle(score).gradient[0];
  };

  useEffect(() => {
    let active = true;
    const catalogIds = Array.from(new Set(visibleSupplements.map((s) => s.catalogId).filter(Boolean)));
    if (catalogIds.length === 0) {
      setRatingByCatalog({});
      return;
    }
    getSupplementRatings(catalogIds).then((map) => {
      if (active) setRatingByCatalog(map);
    });
    return () => {
      active = false;
    };
  }, [visibleSupplements]);

  useEffect(() => {
    let active = true;
    if (!searchQuery.trim()) {
      setMatches([]);
      return;
    }
    searchSupplementCatalog(searchQuery).then((results) => {
      if (active) setMatches(results);
    });
    return () => {
      active = false;
    };
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Screen
      header={
        <HomeHeader
          searchSlot={
            <View style={styles.searchUtility}>
              <Ionicons name="search" size={16} color={colors.icon.primary} style={styles.searchInlineIcon} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search supplements"
                placeholderTextColor={colors.text.muted}
                style={styles.searchInputUtility}
                clearButtonMode="while-editing"
              />
            </View>
          }
        />
      }
    >
      <View style={styles.content}>
        {isSearching ? (
          <View style={styles.searchResults}>
            {matches.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  setSearchQuery("");
                  setMatches([]);
                  router.push({ pathname: "/modal/supplement-info", params: { id: m.id, name: m.name } });
                }}
                style={styles.searchResultItem}
              >
                <Text style={styles.searchResultText}>{m.name}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => {
                setSearchQuery("");
                setMatches([]);
                router.push("/(modals)/modal/add-supplement-catalog");
              }}
              style={[styles.searchResultItem, styles.searchResultAdd]}
            >
              <Text style={styles.searchResultText}>+ Add new supplement</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.progressCard}>
              <Text style={styles.cardTitle}>Today’s Progress</Text>
              <View style={styles.statsRow}>
                <StatCircle
                  value={`${takenCount}/${visibleSupplements.length || 0}`}
                  label="Supplements taken"
                  subLabel={`${completion}% complete`}
                  accent={colors.status.success}
                  progress={visibleSupplements.length ? takenCount / visibleSupplements.length : 0}
                  variant="progress"
                />
                <StatCircle
                  value={String(metricsTrackedCount)}
                  label="Metrics tracked"
                  subLabel={`${metricsTrackedCount} points`}
                  accent={colors.status.info}
                  variant="solid"
                />
              </View>
            </View>

            <View style={styles.scheduleCard}>
              <Text style={styles.cardTitle}>Today’s Schedule</Text>
              {visibleSupplements.length === 0 ? (
                <EmptyState />
              ) : (
                Object.entries(groupedSchedule).map(([period, items]) => {
                  if (!items.length) return null;
                  return (
                    <View key={period} style={styles.periodBlock}>
                      <Text style={styles.periodTitle}>{period}</Text>
                      <View style={styles.periodList}>
                        {items.map((s) => {
                          const taken = Boolean(takenTimes[s.id]);
                          const iconColor = ratingColorFor(s.catalogId);
                          return (
                            <Pressable
                              key={s.id}
                              onPress={() => toggleTaken(s.id)}
                              onLongPress={() =>
                                router.push({
                                  pathname: "/modal/supplement",
                                  params: { id: s.id },
                                })
                              }
                              style={[styles.scheduleItem, taken && styles.scheduleItemTaken]}
                            >
                              <View style={[styles.itemIconWrap, { backgroundColor: `${iconColor}22` }]}> 
                                <View style={[styles.itemIcon, { backgroundColor: iconColor }]} />
                              </View>

                              <View style={styles.itemTextWrap}>
                                <Text style={styles.itemTitle}>{s.name}</Text>
                                <Text style={styles.itemSubtitle}>
                                  {s.time}{s.dose ? ` · ${s.dose}` : ""}
                                </Text>
                              </View>

                              <View style={styles.trailingStatus}>
                                <Ionicons
                                  name={taken ? "checkmark-circle" : "ellipse-outline"}
                                  size={22}
                                  color={taken ? colors.status.success : colors.border.strong}
                                />
                                {taken && takenTimes[s.id] ? (
                                  <Text style={styles.takenStamp}>Taken at {takenTimes[s.id]}</Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },
  searchUtility: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.card,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.card,
  },
  searchInlineIcon: {
    marginRight: spacing.sm,
  },
  searchInputUtility: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
  },
  progressCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
  },
  statRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.elevated,
    overflow: "hidden",
  },
  statSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },
  statLabel: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    textAlign: "center",
  },
  statSubLabel: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: "center",
  },
  scheduleCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  periodBlock: {
    marginBottom: spacing.md,
  },
  periodTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  periodList: {
    gap: spacing.sm,
  },
  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: spacing.sm,
  },
  scheduleItemTaken: {
    opacity: 0.75,
  },
  itemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  itemIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  itemSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.text.secondary,
  },
  trailingStatus: {
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  takenStamp: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    textAlign: "center",
  },
  searchResults: {
    marginTop: spacing.sm,
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
    ...shadows.card,
  },
  searchResultItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  searchResultAdd: {
    opacity: 0.8,
  },
  searchResultText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  empty: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.text.secondary,
  },
});
