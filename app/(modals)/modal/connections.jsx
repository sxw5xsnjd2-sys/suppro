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
import { appTheme, spacing, typography } from "@/theme";
import {
  APPLE_HEALTH_UNAVAILABLE_MESSAGE,
  formatLastSynced,
  useAppleHealthConnection,
} from "@/features/health/useAppleHealthConnection";

export default function ConnectionsScreen() {
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
          title="CONNECTIONS"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Manage app integrations
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <PrimaryCard style={styles.appleHealthCard}>
        <SectionTitle
          title="Apple Health"
          subtitle="Manage your sync connection."
          action={
            <StatusPill
              label={statusLabel}
              tone={statusTone}
              style={styles.statusPill}
              textStyle={styles.statusText}
            />
          }
          style={styles.appleHealthHeader}
        />
        <Text style={styles.appleHealthBody}>{helperText}</Text>

        <View style={styles.buttonRow}>
          <AppButton
            label={isSyncing ? "Refreshing..." : "Refresh"}
            variant="primary"
            size="sm"
            onPress={refreshAppleHealth}
            disabled={isSyncing || !isAppleHealthConnected}
            textStyle={styles.primaryButtonText}
            style={styles.button}
          />
          <AppButton
            label={isSyncing ? "Reconnecting..." : "Reconnect"}
            variant="overlay"
            size="sm"
            onPress={reconnectAppleHealth}
            disabled={isSyncing}
            textStyle={styles.secondaryButtonText}
            style={styles.button}
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
  appleHealthCard: {
    gap: spacing.sm,
  },
  appleHealthHeader: {
    marginBottom: spacing.xs,
  },
  appleHealthBody: {
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
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  button: {
    minHeight: 40,
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: "#FFFFFF",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
