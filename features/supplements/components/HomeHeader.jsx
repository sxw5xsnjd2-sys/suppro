import React, { useMemo, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { colors, spacing, gradients, radius, shadows } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSupplementsStore } from "@/features/supplements/store";
import StatsIcon from "@/assets/icons/tab/statistics.svg";

const ITEM_WIDTH = 74;
const ITEM_GAP = spacing.sm;
const ITEM_PITCH = ITEM_WIDTH + ITEM_GAP;

const toLocalISODate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalISODate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const todayISO = () => toLocalISODate(new Date());

const formatDay = (date) =>
  parseLocalISODate(date).toLocaleDateString("en-GB", { weekday: "short" });

const formatShort = (date) =>
  (() => {
    const parsed = parseLocalISODate(date);
    const day = String(parsed.getDate()).padStart(2, "0");
    const rawMonth = parsed
      .toLocaleDateString("en-GB", { month: "short" })
      .replace(".", "");
    const month =
      rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1).toLowerCase();
    return `${day} ${month}`;
  })();

const buildDateRange = (daysBefore = 90, daysAfter = 90) => {
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - daysBefore);
  const total = daysBefore + daysAfter + 1;
  const values = [];
  for (let i = 0; i < total; i += 1) {
    values.push(toLocalISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return values;
};

export function HomeHeader({ searchSlot }) {
  const insets = useSafeAreaInsets();
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const setSelectedDate = useSupplementsStore((s) => s.setSelectedDate);
  const scrollRef = useRef(null);
  const itemOffsetsRef = useRef({});
  const dates = useMemo(() => buildDateRange(), []);
  const todayIndex = dates.indexOf(todayISO());

  const scrollToDate = (date, animated) => {
    const measuredX = itemOffsetsRef.current[date];
    const fallbackIndex = dates.indexOf(date);
    const fallbackX = fallbackIndex > -1 ? fallbackIndex * ITEM_PITCH : 0;
    const x = typeof measuredX === "number" ? measuredX : fallbackX;
    scrollRef.current?.scrollTo({
      x: Math.max(0, x - 140),
      animated,
    });
  };

  useEffect(() => {
    if (todayIndex > -1) {
      requestAnimationFrame(() => {
        scrollToDate(todayISO(), false);
      });
    }
  }, [todayIndex, dates]);

  const jumpToToday = () => {
    const today = todayISO();
    setSelectedDate(today);
    if (todayIndex > -1) {
      requestAnimationFrame(() => {
        scrollToDate(today, true);
      });
    }
  };

  return (
    <LinearGradient
      colors={gradients.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + spacing.xs }]}
    >
      <View style={styles.topRow}>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.push("/stats")}
        >
          <StatsIcon
            width={20}
            height={20}
            color={colors.icon.primary}
            fill={colors.icon.primary}
            stroke={colors.icon.primary}
            strokeWidth={0.55}
          />
        </Pressable>

        <Text style={styles.welcome}>Suppro</Text>

        <Pressable
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
          onPress={() => router.push("/profile")}
        >
          <Text style={styles.avatarText}>S</Text>
        </Pressable>
      </View>
      <View style={styles.dateCard}>
        <View style={styles.dateCardHeader}>
          <Pressable onPress={jumpToToday}>
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekRow}
        >
          {dates.map((date, index) => {
            const active = date === selectedDate;
            return (
              <Pressable
                key={`${date}-${index}`}
                onPress={() => setSelectedDate(date)}
                onLayout={(e) => {
                  itemOffsetsRef.current[date] = e.nativeEvent.layout.x;
                }}
                style={styles.dayItem}
              >
                {active ? (
                  <LinearGradient
                    colors={gradients.cta}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.dayActive}
                  >
                    <Text style={styles.dayLabelActive} numberOfLines={1}>
                      {formatDay(date)}
                    </Text>
                    <Text style={styles.dateLabelActive} numberOfLines={1}>
                      {formatShort(date)}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.dayIdle}>
                    <Text style={styles.dayLabel} numberOfLines={1}>
                      {formatDay(date)}
                    </Text>
                    <Text style={styles.dateLabel} numberOfLines={1}>
                      {formatShort(date)}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {searchSlot ? <View style={styles.searchShell}>{searchSlot}</View> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPressed: {
    opacity: 0.85,
  },
  avatarText: {
    color: colors.brand.dark,
    fontSize: 16,
    fontWeight: "700",
  },
  welcome: {
    fontSize: 36,
    lineHeight: 38,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 18,
    lineHeight: 23,
    color: colors.text.secondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  dateCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  dateCardHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  todayText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.brand.primary,
  },
  weekRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  dayItem: {
    width: ITEM_WIDTH,
  },
  dayIdle: {
    width: "100%",
    minHeight: 30,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.elevated,
  },
  dayActive: {
    width: "100%",
    minHeight: 30,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  dayLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: "600",
    textAlign: "center",
  },
  dateLabel: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.muted,
    textAlign: "center",
  },
  dayLabelActive: {
    fontSize: 13,
    color: colors.text.inverse,
    fontWeight: "700",
    textAlign: "center",
  },
  dateLabelActive: {
    marginTop: 2,
    fontSize: 13,
    color: colors.text.inverse,
    fontWeight: "700",
    textAlign: "center",
  },
  searchShell: {
    marginTop: spacing.sm,
  },
});
