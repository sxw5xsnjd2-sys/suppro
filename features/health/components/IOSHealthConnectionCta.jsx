import React, { useEffect } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { appTheme, colors, typography } from "@/theme";
import {
  APPLE_HEALTH_PRE_PERMISSION_BODY,
  APPLE_HEALTH_PRE_PERMISSION_TITLE,
  useAppleHealthConnection,
} from "@/features/health/useAppleHealthConnection";

const AUTO_REFRESH_STALE_MS = 60 * 60 * 1000;

function AppleHealthPill({ isConnected, isSyncing, onPress }) {
  let label;
  let backgroundColor;
  let textColor;
  let iconColor;

  if (isSyncing) {
    label = "Syncing Apple Health";
    backgroundColor = colors.background.shell;
    textColor = colors.text.muted;
    iconColor = colors.text.muted;
  } else if (isConnected) {
    label = "Manage Apple Health";
    backgroundColor = "#E3F5E9";
    textColor = "#1A7A38";
    iconColor = "#34C759";
  } else {
    label = "Connect Apple Health";
    backgroundColor = colors.background.shell;
    textColor = appTheme.colors.textStrong;
    iconColor = appTheme.colors.textStrong;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isSyncing}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        isConnected
          ? "Open Apple Health connection settings."
          : "Connect Suppro to Apple Health."
      }
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor },
        pressed && !isSyncing && styles.pillPressed,
      ]}
    >
      <Ionicons name="logo-apple" size={14} color={iconColor} />
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={14}
        color={textColor}
        style={styles.chevron}
      />
    </Pressable>
  );
}

export function IOSHealthConnectionCta() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const {
    isSyncing,
    lastSyncedAt,
    isAppleHealthConnected,
    refreshAppleHealth,
    reconnectAppleHealth,
  } = useAppleHealthConnection();

  useEffect(() => {
    if (!isFocused || isSyncing) return;
    if (!isAppleHealthConnected || !lastSyncedAt) return;

    const parsed = new Date(lastSyncedAt);
    if (Number.isNaN(parsed.getTime())) return;
    if (Date.now() - parsed.getTime() <= AUTO_REFRESH_STALE_MS) return;

    refreshAppleHealth();
  }, [
    isAppleHealthConnected,
    isFocused,
    isSyncing,
    lastSyncedAt,
    refreshAppleHealth,
  ]);

  return (
    <AppleHealthPill
      isConnected={isAppleHealthConnected}
      isSyncing={isSyncing}
      onPress={() => {
        if (isAppleHealthConnected) {
          router.push("/connections");
          return;
        }

        Alert.alert(
          APPLE_HEALTH_PRE_PERMISSION_TITLE,
          APPLE_HEALTH_PRE_PERMISSION_BODY,
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Continue",
              onPress: () => {
                reconnectAppleHealth();
              },
            },
          ],
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillPressed: {
    opacity: 0.82,
  },
  label: {
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  chevron: {
    marginLeft: 2,
  },
});
