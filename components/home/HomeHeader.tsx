import React, { useMemo, useRef, useEffect, useState } from "react";
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
import { colors, spacing } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSupplementsStore } from "@/store/supplementStore";

/* ----------------------------------------
   Date helpers
----------------------------------------- */

const ITEM_WIDTH = 44 + spacing.lg; // item + gap

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

/* ----------------------------------------
   Component
----------------------------------------- */

export function HomeHeader() {
  const insets = useSafeAreaInsets();

  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const setSelectedDate = useSupplementsStore((s) => s.setSelectedDate);

  const scrollRef = useRef<ScrollView>(null);

  const dates = useMemo(() => buildDateRange(), []);

  const todayIndex = dates.indexOf(todayISO());

  const [visibleMonth, setVisibleMonth] = useState(
    formatMonthYear(selectedDate)
  );

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

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / ITEM_WIDTH);

    const date = dates[index];
    if (date) {
      const monthLabel = formatMonthYear(date);
      if (monthLabel !== visibleMonth) {
        setVisibleMonth(monthLabel);
      }
    }
  };

  const isTodaySelected = selectedDate === todayISO();

  const jumpToToday = () => {
    setSelectedDate(todayISO());
    if (todayIndex > -1) {
      scrollRef.current?.scrollTo({
        x: Math.max(0, todayIndex * ITEM_WIDTH - 150),
        animated: true,
      });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      {/* Top row */}
      <View style={styles.topRow}>
        <Image
          source={require("@/components/icons/Supprologo.png")}
          style={styles.logo}
        />
      </View>

      {/* Month indicator + Today */}
      <View style={styles.monthRow}>
        <Text style={styles.monthLabel}>{visibleMonth}</Text>

        <Pressable
          onPress={jumpToToday}
          disabled={isTodaySelected}
          style={[
            styles.todayButton,
            isTodaySelected
              ? styles.todayButtonHidden
              : styles.todayButtonVisible,
          ]}
        >
          <Text
            style={[
              styles.todayText,
              isTodaySelected && styles.todayTextHidden,
            ]}
          >
            Today
          </Text>
        </Pressable>
      </View>

      {/* Scrollable date strip */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekRow}
        onScroll={handleScroll}
        scrollEventThrottle={16}
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

      {/* Selected date label */}
      <Text style={styles.selectedDate}>{formatFullDate(selectedDate)}</Text>
    </View>
  );
}

/* ----------------------------------------
   Styles
----------------------------------------- */

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background.header,
  },

  topRow: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
  },

  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
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
    gap: spacing.lg,
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

  selectedDate: {
    marginTop: spacing.md,
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
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

  todayButtonHidden: {
    opacity: 0,
  },

  todayTextHidden: {
    color: "transparent",
  },

  todayButtonVisible: {
    opacity: 1,
  },
});
