import React, { useEffect, useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { appTheme, shadows, spacing, typography } from "@/theme";

const ITEM_HEIGHT = 44;
const PICKER_HEIGHT = 176;
const WHEEL_PADDING = (PICKER_HEIGHT - ITEM_HEIGHT) / 2;
// Lets a drag that ends without a fling still settle on the nearest row.
const DRAG_SETTLE_DELAY_MS = 80;
const MINUTES_PER_DAY = 24 * 60;

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

function pad(value) {
  return String(value).padStart(2, "0");
}

export function normalizeDoseTimeMinutes(value, fallback = 8 * 60) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes < MINUTES_PER_DAY
    ? minutes
    : fallback;
}

export function formatDoseTime(timeMinutes) {
  return `${pad(Math.floor(timeMinutes / 60))}:${pad(timeMinutes % 60)}`;
}

function toPickerDate(timeMinutes) {
  const date = new Date();
  date.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
  return date;
}

function fromPickerDate(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function clampIndex(index, length) {
  return Math.min(length - 1, Math.max(0, index));
}

function WheelColumn({ values, selected, onSelect, accessibilityLabel }) {
  const scrollRef = useRef(null);
  const settleTimerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const hasPositionedRef = useRef(false);
  const selectedIndex = Math.max(0, values.indexOf(selected));

  // Keeps the wheel aligned when the value changes from a tap, an
  // accessibility action, or the first render.
  useEffect(() => {
    if (isDraggingRef.current) return;
    scrollRef.current?.scrollTo({
      y: selectedIndex * ITEM_HEIGHT,
      animated: hasPositionedRef.current,
    });
    hasPositionedRef.current = true;
  }, [selectedIndex]);

  useEffect(() => () => clearTimeout(settleTimerRef.current), []);

  const settleAt = (offsetY) => {
    clearTimeout(settleTimerRef.current);
    isDraggingRef.current = false;
    const index = clampIndex(Math.round(offsetY / ITEM_HEIGHT), values.length);
    if (index !== selectedIndex) {
      onSelect(values[index]);
    } else {
      scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
    }
  };

  const stepBy = (delta) => {
    onSelect(values[clampIndex(selectedIndex + delta, values.length)]);
  };

  return (
    <View
      style={styles.column}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: pad(selected) }}
      accessibilityActions={[
        { name: "increment" },
        { name: "decrement" },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") stepBy(1);
        if (event.nativeEvent.actionName === "decrement") stepBy(-1);
      }}
    >
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={Platform.OS === "android"}
        keyboardShouldPersistTaps="handled"
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
        contentContainerStyle={styles.wheelContent}
        onScrollBeginDrag={() => {
          clearTimeout(settleTimerRef.current);
          isDraggingRef.current = true;
        }}
        onScrollEndDrag={(event) => {
          const offsetY = event.nativeEvent.contentOffset.y;
          settleTimerRef.current = setTimeout(
            () => settleAt(offsetY),
            DRAG_SETTLE_DELAY_MS
          );
        }}
        onMomentumScrollBegin={() => {
          clearTimeout(settleTimerRef.current);
        }}
        onMomentumScrollEnd={(event) => {
          settleAt(event.nativeEvent.contentOffset.y);
        }}
      >
        {values.map((value) => {
          const isSelected = value === selected;
          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
            >
              <Text style={[styles.itemText, isSelected && styles.itemTextActive]}>
                {pad(value)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// iOS: the system time wheel, inline in the form.
function IOSDoseTimePicker({ timeMinutes, onChange }) {
  return (
    <View style={styles.iosPicker}>
      <DateTimePicker
        mode="time"
        display="spinner"
        value={toPickerDate(timeMinutes)}
        onChange={(_event, date) => {
          if (date) onChange(fromPickerDate(date));
        }}
        themeVariant="light"
        textColor={appTheme.colors.textStrong}
        style={styles.iosSpinner}
      />
    </View>
  );
}

// Android: a field that opens the system clock dialog.
function AndroidDoseTimePicker({ timeMinutes, onChange }) {
  const openPicker = () => {
    DateTimePickerAndroid.open({
      mode: "time",
      value: toPickerDate(timeMinutes),
      onChange: (event, date) => {
        if (event.type === "set" && date) onChange(fromPickerDate(date));
      },
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Time, ${formatDoseTime(timeMinutes)}`}
      accessibilityHint="Opens the time picker"
      onPress={openPicker}
      style={({ pressed }) => [
        styles.androidField,
        pressed && styles.itemPressed,
      ]}
    >
      <Text style={styles.androidFieldText}>
        {formatDoseTime(timeMinutes)}
      </Text>
      <Ionicons
        name="time-outline"
        size={20}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

// Web has no native time picker, so it keeps the hour/minute wheels.
function WebDoseTimePicker({ timeMinutes, onChange }) {
  const hour = Math.floor(timeMinutes / 60);
  const minute = timeMinutes % 60;

  return (
    <View style={styles.picker}>
      <View pointerEvents="none" style={styles.selectionBand}>
        <LinearGradient
          colors={appTheme.tabBar.fabGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <WheelColumn
        values={HOURS}
        selected={hour}
        accessibilityLabel="Hour"
        onSelect={(nextHour) =>
          onChange((current) =>
            nextHour * 60 + (normalizeDoseTimeMinutes(current) % 60)
          )
        }
      />
      <Text style={styles.separator}>:</Text>
      <WheelColumn
        values={MINUTES}
        selected={minute}
        accessibilityLabel="Minute"
        onSelect={(nextMinute) =>
          onChange(
            (current) =>
              Math.floor(normalizeDoseTimeMinutes(current) / 60) * 60 +
              nextMinute
          )
        }
      />
    </View>
  );
}

export function DoseTimePicker({ value, onChange }) {
  const timeMinutes = normalizeDoseTimeMinutes(value);

  if (Platform.OS === "ios") {
    return <IOSDoseTimePicker timeMinutes={timeMinutes} onChange={onChange} />;
  }

  if (Platform.OS === "android") {
    return (
      <AndroidDoseTimePicker timeMinutes={timeMinutes} onChange={onChange} />
    );
  }

  return <WebDoseTimePicker timeMinutes={timeMinutes} onChange={onChange} />;
}

const styles = StyleSheet.create({
  iosPicker: {
    alignItems: "center",
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    overflow: "hidden",
  },
  iosSpinner: {
    alignSelf: "stretch",
  },
  androidField: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  androidFieldText: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  picker: {
    height: PICKER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    overflow: "hidden",
  },
  selectionBand: {
    position: "absolute",
    top: WHEEL_PADDING,
    left: spacing.sm,
    right: spacing.sm,
    height: ITEM_HEIGHT,
    borderRadius: ITEM_HEIGHT / 2,
    overflow: "hidden",
    ...shadows.card,
  },
  column: {
    flex: 1,
    maxWidth: 96,
    height: PICKER_HEIGHT,
  },
  wheelContent: {
    paddingVertical: WHEEL_PADDING,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  itemPressed: {
    opacity: 0.72,
  },
  itemText: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  itemTextActive: {
    color: appTheme.colors.textStrong,
    fontFamily: typography.fontFamily.bodySemiBold,
  },
  separator: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
