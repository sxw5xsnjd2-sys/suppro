import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  PrimaryCard,
  SectionTitle,
  StatusPill,
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

  const statusLabel = isAppleHealthConnected ? "CONNECTED" : "DISCONNECTED";
  const statusTone = isAppleHealthConnected ? "success" : "neutral";

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
      <PrimaryCard style={styles.heroCard}>
        <View style={styles.heroLead}>
          <View style={styles.iconShell}>
            <SettingsIcon
              width={18}
              height={18}
              color={appTheme.colors.textStrong}
              fill={appTheme.colors.textStrong}
              stroke={appTheme.colors.textStrong}
              strokeWidth={0.55}
            />
          </View>

          <View style={styles.heroCopy}>
            <StatusPill label="CONNECTIONS" tone="neutral" />
            <Text style={styles.heroTitle}>Apple Health</Text>
            <Text style={styles.heroBody}>{helperText}</Text>
          </View>

          <StatusPill
            label={statusLabel}
            tone={statusTone}
            style={styles.statusPill}
            textStyle={styles.statusText}
          />
        </View>
      </PrimaryCard>

      <PrimaryCard style={styles.sectionCard}>
        <SectionTitle
          title="Sync controls"
          subtitle="Keep Apple Health data available throughout the app."
        />

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
  heroCard: {
    marginBottom: spacing.sm,
  },
  heroLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconShell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    marginTop: spacing.xs,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.5,
  },
  heroBody: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  statusPill: {
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 11,
    lineHeight: 20,
  },
  sectionCard: {
    gap: spacing.md,
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
});
