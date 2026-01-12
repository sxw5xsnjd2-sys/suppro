import React, { useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, gradients } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSupplementsStore } from "@/features/supplements/store";

/* ----------------------------------------
   Date helpers
----------------------------------------- */

// Narrower width so we can show ~7 days on most screens instead of ~5
const ITEM_WIDTH = 44 + spacing.sm; // item + gap

const toISODate = (d: Date) => d.toISOString().split("T")[0];

const todayISO = () => toISODate(new Date());

const formatDay = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { weekday: "short" });

const formatMonthYear = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

const formatFullDate = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
  });

const formatFullDateWithYear = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const DAY_MS = 24 * 60 * 60 * 1000;

const buildDateRange = (daysBefore = 180, daysAfter = 180) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startTime = today.getTime() - daysBefore * DAY_MS;
  const total = daysBefore + daysAfter + 1;

  return Array.from({ length: total }, (_, i) => {
    const d = new Date(startTime + i * DAY_MS);
    return d.toISOString().split("T")[0];
  });
};

type HomeHeaderProps = {
  searchSlot?: React.ReactNode;
};

/* ----------------------------------------
   Component
----------------------------------------- */

export function HomeHeader({ searchSlot }: HomeHeaderProps) {
  const insets = useSafeAreaInsets();

  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const setSelectedDate = useSupplementsStore((s) => s.setSelectedDate);

  const scrollRef = useRef<ScrollView>(null);

  const dates = useMemo(() => buildDateRange(), []);

  const todayIndex = dates.indexOf(todayISO());

  const visibleDateLabel = formatFullDateWithYear(selectedDate);

  /* ----------------------------------------
     Auto-center today on mount
  ----------------------------------------- */

  useEffect(() => {
    if (todayIndex > -1) {
      scrollRef.current?.scrollTo({
        x: Math.max(0, todayIndex * ITEM_WIDTH - 150),
        animated: false,
      });
    }
  }, [todayIndex]);

  /* ----------------------------------------
     Scroll handler → month indicator
  ----------------------------------------- */

  const isTodaySelected = selectedDate === todayISO();

  const jumpToToday = () => {
    const today = todayISO();
    setSelectedDate(today);
    if (todayIndex > -1) {
      scrollRef.current?.scrollTo({
        x: Math.max(0, todayIndex * ITEM_WIDTH - 150),
        animated: true,
      });
    }
  };

  return (
    <LinearGradient
      colors={gradients.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + spacing.md }]}
    >
      {/* Top row */}
      <View style={styles.topRow}>
        <Image
          source={require("@/assets/icons/Supprologo.png")}
          style={styles.logo}
        />
        <Text style={styles.brandText}>Suppro</Text>
      </View>

      <View style={styles.monthRow}>
        <Text style={styles.monthLabel}>{visibleDateLabel}</Text>

        <Pressable onPress={jumpToToday} style={[styles.todayButton]}>
          <Text style={[styles.todayText]}>Today</Text>
        </Pressable>
      </View>

      {/* Scrollable date strip */}
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
              style={[styles.dayItem, active && styles.dayItemActive]}
            >
              <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>
                {formatDay(date)}
              </Text>

              <Text
                style={[styles.dateLabel, active && styles.dateLabelActive]}
              >
                {new Date(date).getDate()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {searchSlot ? (
        <View style={styles.searchShell}>
          <View style={styles.searchDivider} />
          {searchSlot}
        </View>
      ) : null}
    </LinearGradient>
  );
}

/* ----------------------------------------
   Styles
----------------------------------------- */

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
  },

  topRow: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },

  logo: {
    width: 45,
    height: 45,
    resizeMode: "contain",
  },

  brandText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.inverse,
  },

  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  monthLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
  },

  weekRow: {
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },

  dayItem: {
    width: 44,
    alignItems: "center",
    opacity: 0.55,
  },

  dayItemActive: {
    opacity: 1,
  },

  dayLabel: {
    fontSize: 13,
    color: colors.text.inverse,
  },

  dayLabelActive: {
    fontWeight: "600",
  },

  dateLabel: {
    marginTop: spacing.xs,
    fontSize: 20,
    color: colors.text.inverse,
  },

  dateLabelActive: {
    backgroundColor: colors.brand.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    overflow: "hidden",
  },

  searchShell: {
    marginTop: 0,
    backgroundColor: colors.background.app,
    borderRadius: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginHorizontal: -spacing.lg, // extend to edges to remove blue margin
    marginBottom: -spacing.lg,
  },

  searchDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginBottom: spacing.sm,
  },

  todayButton: {
    alignSelf: "flex-end",
    marginTop: spacing.sm,
  },

  todayText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.inverse,
  },
});
