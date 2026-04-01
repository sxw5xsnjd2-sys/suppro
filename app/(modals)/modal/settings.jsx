import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  PrimaryCard,
} from "@/components/common/ui";
import SettingsIcon from "@/assets/icons/profile/settings.svg";
import { appTheme, spacing, typography } from "@/theme";
import {
  APPLE_HEALTH_UNAVAILABLE_MESSAGE,
  formatLastSynced,
  useAppleHealthConnection,
} from "@/features/health/useAppleHealthConnection";

export default function SettingsScreen() {
  const {
    connection,
    connectionError,
    lastSyncedAt,
    isIOS,
    isSyncing,
    isAppleHealthReady,
    hasCheckedAppleHealthAvailability,
    isAppleHealthConnected,
    refreshAppleHealth,
    reconnectAppleHealth,
  } = useAppleHealthConnection();

  const statusLabel = isAppleHealthConnected ? "Connected" : "Disconnected";
  const statusPillStyle = isAppleHealthConnected
    ? styles.statusPillConnected
    : styles.statusPillDisconnected;

  let helperText = `Last sync ${formatLastSynced(lastSyncedAt)}.`;
  if (!hasCheckedAppleHealthAvailability) {
    helperText = "Checking Apple Health availability...";
  } else if (!isIOS || !isAppleHealthReady) {
    helperText = APPLE_HEALTH_UNAVAILABLE_MESSAGE;
  } else if (!isAppleHealthConnected) {
    helperText =
      connection === "error" && connectionError
        ? `${connectionError} Reconnect Apple Health to start syncing again.`
        : "Reconnect Apple Health to pull in the latest sleep, weight, blood pressure, and blood glucose data.";
  } else if (connection === "error" && connectionError) {
    helperText = `${connectionError} Last successful sync ${formatLastSynced(
      lastSyncedAt
    )}.`;
  }

  return (
    <BackdropScreen
      header={
        <AppHeader
          leftSlot={
            <AppButton
              onPress={() => router.back()}
              variant="overlay"
              size="icon"
              accessibilityLabel="Go back"
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={appTheme.colors.textStrong}
              />
            </AppButton>
          }
          title="SETTINGS"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              App connections and preferences
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <PrimaryCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardLead}>
            <View style={styles.iconShell}>
              <SettingsIcon
                width={18}
                height={18}
                color={appTheme.colors.textStrong}
                fill={appTheme.colors.textStrong}
                stroke={appTheme.colors.textStrong}
              />
            </View>

            <View style={styles.cardCopy}>
              <Text style={styles.sectionEyebrow}>Connections</Text>
              <Text style={styles.sectionTitle}>Apple Health</Text>
            </View>
          </View>

          <View style={[styles.statusPill, statusPillStyle]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.helperText}>{helperText}</Text>

        <View style={styles.buttonRow}>
          <AppButton
            label={isSyncing ? "Refreshing..." : "Refresh Apple Health"}
            variant="accent"
            size="md"
            onPress={refreshAppleHealth}
            disabled={isSyncing || !isAppleHealthConnected}
            textStyle={styles.primaryButtonText}
          />
          <AppButton
            label={isSyncing ? "Reconnecting..." : "Reconnect Apple Health"}
            variant="overlay"
            size="md"
            onPress={reconnectAppleHealth}
            disabled={isSyncing}
            textStyle={styles.secondaryButtonText}
          />
        </View>
      </PrimaryCard>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  card: {
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardLead: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconShell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.4,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillConnected: {
    backgroundColor: appTheme.colors.success,
  },
  statusPillDisconnected: {
    backgroundColor: appTheme.colors.danger,
  },
  statusText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
});
