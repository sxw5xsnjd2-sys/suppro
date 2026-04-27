import React, { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { appTheme, typography } from "@/theme";

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function InlineScoreSlider({ metric, value, onChange, color, compact = false }) {
  const min = Number.isFinite(metric.min) ? metric.min : 0;
  const max = Number.isFinite(metric.max) ? metric.max : 10;
  const range = max - min;
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);

  // draftValue tracks the thumb position during a drag without committing to the store.
  // null means we're not dragging — use the external value prop instead.
  const [draftValue, setDraftValue] = useState(null);
  const lastHapticRef = useRef(value);

  const displayValue = draftValue ?? value;
  const pct = Math.max(0, Math.min(1, (displayValue - min) / (range || 1)));
  const thumbSize = compact ? 24 : 28;
  const trackHeight = compact ? 28 : 34;
  const tickCount = range + 1;

  const computeValue = (locationX) => {
    const w = trackWidthRef.current;
    if (!w) return displayValue;
    const ratio = Math.max(0, Math.min(1, locationX / w));
    return Math.round(min + ratio * range);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const newVal = computeValue(e.nativeEvent.locationX);
        lastHapticRef.current = newVal;
        setDraftValue(newVal);
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (e) => {
        const newVal = computeValue(e.nativeEvent.locationX);
        setDraftValue(newVal);
        if (newVal !== lastHapticRef.current) {
          lastHapticRef.current = newVal;
          Haptics.selectionAsync().catch(() => {});
        }
      },
      onPanResponderRelease: (e) => {
        const newVal = computeValue(e.nativeEvent.locationX);
        setDraftValue(null);
        onChange(newVal);
      },
      onPanResponderTerminate: () => {
        setDraftValue(null);
      },
    })
  ).current;

  const thumbLeft = trackWidth > 0
    ? Math.max(0, Math.min(trackWidth - thumbSize, pct * trackWidth - thumbSize / 2))
    : 0;

  return (
    <View>
      <View
        {...panResponder.panHandlers}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setTrackWidth(w);
          trackWidthRef.current = w;
        }}
        style={[styles.track, { height: trackHeight, borderRadius: trackHeight / 2 }]}
      >
        {/* Filled gradient portion */}
        <LinearGradient
          colors={[hexToRgba(color, 0.53), color]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            StyleSheet.absoluteFill,
            { width: `${pct * 100}%`, borderRadius: trackHeight / 2 },
          ]}
        />

        {/* Tick marks */}
        <View style={styles.ticks} pointerEvents="none">
          {Array.from({ length: tickCount }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                {
                  backgroundColor:
                    i <= displayValue - min
                      ? "rgba(255,255,255,0.7)"
                      : appTheme.colors.borderPill,
                },
              ]}
            />
          ))}
        </View>

        {/* Thumb */}
        {trackWidth > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbSize / 2,
                left: thumbLeft,
                borderColor: color,
              },
            ]}
          >
            <Text
              style={[
                styles.thumbText,
                { fontSize: compact ? 11 : 12 },
              ]}
            >
              {displayValue}
            </Text>
          </View>
        )}
      </View>

      {!compact && (
        <View style={styles.labels}>
          <Text style={styles.labelText}>{metric.lowLabel}</Text>
          <Text style={styles.labelText}>{metric.highLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    backgroundColor: appTheme.colors.surfaceMuted,
    justifyContent: "center",
    overflow: "hidden",
  },
  ticks: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  tick: {
    width: 2,
    height: 6,
    borderRadius: 1,
  },
  thumb: {
    position: "absolute",
    backgroundColor: appTheme.colors.surface,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: appTheme.colors.textStrong,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  thumbText: {
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textStrong,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  labelText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11,
    color: appTheme.colors.textTertiary,
  },
});
