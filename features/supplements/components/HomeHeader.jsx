import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { AppButton, AppHeader } from "@/components/common/ui";
import { appTheme, typography } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import StatsIcon from "@/assets/icons/tab/statistics.svg";
import AccountIcon from "@/assets/icons/profile/account.svg";

const PAGE_SIDE_PADDING = appTheme.screen.sidePadding;
const PILL_HEIGHT = appTheme.header.progressPillHeight;
const DATE_ITEM_GAP = 10;
const DATE_ITEM_SPAN = appTheme.header.dayItemWidth + DATE_ITEM_GAP;

const toLocalISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalISODate = (value) => {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
};

const todayISO = () => toLocalISODate(new Date());

const startOfWeek = (value) => {
  const date =
    typeof value === "string" ? parseLocalISODate(value) : new Date(value);
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const offset = (normalized.getDay() + 6) % 7;
  normalized.setDate(normalized.getDate() - offset);
  return normalized;
};

const endOfWeek = (value) => {
  const normalized = startOfWeek(value);
  normalized.setDate(normalized.getDate() + 6);
  return normalized;
};

const addDays = (value, days) => {
  const date =
    typeof value === "string" ? parseLocalISODate(value) : new Date(value);
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const buildWeekDates = (anchorDate, weeksBefore = 8, weeksAfter = 8) => {
  const start = startOfWeek(addDays(anchorDate, -(weeksBefore * 7)));
  const end = endOfWeek(addDays(anchorDate, weeksAfter * 7));
  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(toLocalISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const formatDayLabel = (date) =>
  parseLocalISODate(date)
    .toLocaleDateString("en-GB", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();

const formatDayNumber = (date) => String(parseLocalISODate(date).getDate());

function isScheduledOnDate(supplement, date) {
  if (supplement?.startDate && date < supplement.startDate) return false;
  if (supplement?.endDate && date > supplement.endDate) return false;

  const dayOfWeek = parseLocalISODate(date).getDay();
  if (
    Array.isArray(supplement?.daysOfWeek) &&
    supplement.daysOfWeek.length > 0
  ) {
    return supplement.daysOfWeek.includes(dayOfWeek);
  }

  return true;
}

function ProgressPill({ active, progress }) {
  const animatedValue = useRef(new Animated.Value(progress)).current;
  const completed = progress >= 0.999;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: progress,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [animatedValue, progress]);

  const fillHeight = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PILL_HEIGHT],
  });

  return (
    <View style={[styles.pillTrack, active && styles.pillTrackActive]}>
      <Animated.View
        style={[
          styles.pillFill,
          completed
            ? styles.pillFillComplete
            : active
            ? styles.pillFillActive
            : styles.pillFillInactive,
          { height: fillHeight },
        ]}
      />
    </View>
  );
}

export function HomeHeader({ onLayout }) {
  const { width } = useWindowDimensions();
  const selectedDate = useSupplementsStore((state) => state.selectedDate);
  const setSelectedDate = useSupplementsStore((state) => state.setSelectedDate);
  const supplements = useSupplementsStore((state) => state.supplements);
  const takenTimesByDate = useSupplementsStore(
    (state) => state.takenTimesByDate
  );
  const listRef = useRef(null);

  const today = todayISO();
  const selectedDateObject = parseLocalISODate(selectedDate || today);
  const rangeAnchorDate = useMemo(() => {
    const now = parseLocalISODate(today);
    const earliest = addDays(now, -(8 * 7));
    const latest = addDays(now, 8 * 7);
    if (selectedDateObject < earliest || selectedDateObject > latest) {
      return selectedDateObject;
    }
    return now;
  }, [selectedDateObject, today]);

  const weekDates = useMemo(
    () => buildWeekDates(rangeAnchorDate, 8, 8),
    [rangeAnchorDate]
  );
  const listWidth = Math.max(width - PAGE_SIDE_PADDING * 2, 1);
  const listSideInset = Math.max(
    0,
    (listWidth - appTheme.header.dayItemWidth) / 2
  );
  const selectedDateIndex = useMemo(
    () => Math.max(weekDates.indexOf(selectedDate || today), 0),
    [selectedDate, today, weekDates]
  );
  const todayIndex = useMemo(
    () => Math.max(weekDates.indexOf(today), 0),
    [today, weekDates]
  );

  const progressByDate = useMemo(
    () =>
      weekDates.reduce((acc, date) => {
        const plannedSupplements = (supplements ?? []).filter((supplement) =>
          isScheduledOnDate(supplement, date)
        );
        const takenLookup = takenTimesByDate?.[date] ?? {};
        const takenCount = plannedSupplements.reduce(
          (count, supplement) =>
            takenLookup[supplement.id] ? count + 1 : count,
          0
        );

        acc[date] = plannedSupplements.length
          ? Math.min(1, takenCount / plannedSupplements.length)
          : 0;
        return acc;
      }, {}),
    [supplements, takenTimesByDate, weekDates]
  );

  useEffect(() => {
    if (!weekDates.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: DATE_ITEM_SPAN * selectedDateIndex,
        animated: true,
      });
    });
  }, [selectedDateIndex, weekDates.length]);

  const scrollToDateIndex = (index, animated = true) => {
    listRef.current?.scrollToOffset({
      offset: DATE_ITEM_SPAN * index,
      animated,
    });
  };

  const handleTodayPress = () => {
    setSelectedDate(today);
    requestAnimationFrame(() => {
      scrollToDateIndex(todayIndex, true);
    });
  };

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      <AppHeader
        leftSlot={
          <AppButton
            onPress={() => router.push("/stats")}
            variant="overlay"
            size="icon"
            accessibilityLabel="Open stats"
          >
            <StatsIcon
              width={20}
              height={20}
              color="#141414"
              fill="#141414"
              stroke="#141414"
              strokeWidth={0.55}
            />
          </AppButton>
        }
        rightSlot={
          <AppButton
            onPress={() => router.push("/profile")}
            variant="overlay"
            size="icon"
            accessibilityLabel="Open profile"
            style={styles.profileButton}
          >
            <AccountIcon
              width={18}
              height={18}
              color="#141414"
              fill="#141414"
              stroke="#141414"
              strokeWidth={0.55}
            />
          </AppButton>
        }
        title="SUPPRO"
        titleStyle={styles.title}
        titleAccessory={
          <AppButton
            label="Today"
            onPress={handleTodayPress}
            variant="ghost"
            size="sm"
            textStyle={styles.todayText}
          />
        }
        titleRowStyle={styles.selectorTopRow}
        bottomSlotStyle={styles.selectorSection}
        bottomSlot={
          <FlatList
            ref={listRef}
            horizontal
            data={weekDates}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            snapToInterval={DATE_ITEM_SPAN}
            decelerationRate="fast"
            getItemLayout={(_, index) => ({
              length: DATE_ITEM_SPAN,
              offset: DATE_ITEM_SPAN * index,
              index,
            })}
            contentContainerStyle={[
              styles.dateListContent,
              { paddingHorizontal: listSideInset },
            ]}
            ItemSeparatorComponent={() => <View style={styles.dateItemGap} />}
            renderItem={({ item: date }) => {
              const active = date === selectedDate;
              return (
                <Pressable
                  key={date}
                  onPress={() => setSelectedDate(date)}
                  style={styles.dayItem}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      active && styles.dayLabelActive,
                    ]}
                  >
                    {formatDayLabel(date)}
                  </Text>
                  <View
                    style={[
                      styles.dayHighlight,
                      active && styles.dayHighlightActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        active && styles.dayNumberActive,
                      ]}
                    >
                      {formatDayNumber(date)}
                    </Text>
                    <ProgressPill
                      active={active}
                      progress={progressByDate[date] ?? 0}
                    />
                  </View>
                </Pressable>
              );
            }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "transparent",
  },
  profileButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  selectorSection: {
    paddingTop: 2,
  },
  selectorTopRow: {
    marginBottom: 8,
  },
  title: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 22,
    letterSpacing: -0.43,
    fontFamily: typography.fontFamily.headingBlack,
    fontWeight: "900",
  },
  todayText: {
    fontSize: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  dateListContent: {
    alignItems: "flex-start",
  },
  dateItemGap: {
    width: DATE_ITEM_GAP,
  },
  dayItem: {
    width: appTheme.header.dayItemWidth,
    alignItems: "center",
  },
  dayLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.dayLabel,
    marginBottom: 7,
  },
  dayLabelActive: {
    color: appTheme.colors.textHeading,
  },
  dayHighlight: {
    minWidth: 40,
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 7,
    borderRadius: 20,
  },
  dayHighlightActive: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  dayNumber: {
    fontSize: 16,
    fontFamily: typography.fontFamily.bodyBold,
    color: appTheme.colors.textHeading,
    marginBottom: 10,
  },
  dayNumberActive: {
    color: appTheme.colors.textPrimary,
  },
  pillTrack: {
    width: 16,
    height: PILL_HEIGHT,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: appTheme.colors.borderPill,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  pillTrackActive: {
    borderColor: "#173E2E",
    backgroundColor: appTheme.colors.surfaceOverlayStrong,
  },
  pillFill: {
    width: "100%",
  },
  pillFillInactive: {
    backgroundColor: appTheme.colors.success,
  },
  pillFillComplete: {
    backgroundColor: appTheme.colors.successComplete,
  },
  pillFillActive: {
    backgroundColor: appTheme.colors.successStrong,
  },
});
