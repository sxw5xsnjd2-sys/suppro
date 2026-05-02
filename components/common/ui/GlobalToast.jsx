import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { typography } from "@/theme";
import { useToastStore } from "@/features/toast/toastStore";

export function GlobalToast() {
  const message = useToastStore((s) => s.message);
  const target = useToastStore((s) => s.target);
  const clear = useToastStore((s) => s.clear);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message || target !== "global") return;

    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => clear());
  }, [clear, message, opacity, target]);

  if (!message || target !== "global") return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 14, opacity }]}
    >
      <View style={styles.pill}>
        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
    pointerEvents: "none",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "rgba(23,21,27,0.92)",
    shadowColor: "#1A1820",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  text: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#FFFFFF",
  },
});
