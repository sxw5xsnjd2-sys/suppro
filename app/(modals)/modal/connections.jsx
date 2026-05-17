import React from "react";
import { Alert, Image, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  PrimaryCard,
} from "@/components/common/ui";
import { appTheme, typography } from "@/theme";
import {
  APPLE_HEALTH_NO_DATA_MESSAGE,
  APPLE_HEALTH_PRE_PERMISSION_BODY,
  APPLE_HEALTH_PRE_PERMISSION_TITLE,
  APPLE_HEALTH_SETTINGS_SUBTITLE,
  APPLE_HEALTH_TITLE,
  APPLE_HEALTH_UNAVAILABLE_MESSAGE,
  formatLastSynced,
  getAppleHealthConnectionStatusLabel,
  useAppleHealthConnection,
} from "@/features/health/useAppleHealthConnection";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";

import AppleHealthLogoAsset from "@/assets/icons/apple-health-logo.png";

function AppleHealthLogo() {
  return (
    <View style={styles.logoTile}>
      <Image
        source={AppleHealthLogoAsset}
        style={styles.logoImage}
        resizeMode="contain"
      />
    </View>
  );
}

export default function ConnectionsScreen() {
  const {
    connection,
    connectionError,
    lastSyncedAt,
    isSyncing,
    isAppleHealthReady,
    hasCheckedAppleHealthAvailability,
    isAppleHealthConnected,
    refreshAppleHealth,
    reconnectAppleHealth,
    disconnectFromAppleHealth,
  } = useAppleHealthConnection();
  const appleHealthStatus = getAppleHealthConnectionStatusLabel(
    isAppleHealthConnected,
  );
  const showsAppleHealthConnection = IS_APPLE_HEALTH_SUPPORTED_PLATFORM;

  let helperText = `Last sync ${formatLastSynced(lastSyncedAt)}.`;
  if (!hasCheckedAppleHealthAvailability) {
    helperText = "Checking Apple Health availability...";
  } else if (!showsAppleHealthConnection || !isAppleHealthReady) {
    helperText = APPLE_HEALTH_UNAVAILABLE_MESSAGE;
  } else if (!isAppleHealthConnected) {
    helperText =
      connection === "error" && connectionError
        ? connectionError
        : "Not connected";
  } else if (connection === "error" && connectionError) {
    helperText = `${connectionError} Last successful sync ${formatLastSynced(
      lastSyncedAt
    )}.`;
  }

  const handleAppleHealthToggle = (nextValue) => {
    if (isSyncing) return;

    if (nextValue) {
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
        ]
      );
      return;
    }

    Alert.alert(
      "Disconnect Apple Health?",
      "This will remove Apple Health data imported into Suppro. Apple Health permissions on your iPhone will stay unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: disconnectFromAppleHealth,
        },
      ]
    );
  };

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
            showsAppleHealthConnection ? (
              <Text style={styles.headerSubtitle}>
                Manage Apple Health
              </Text>
            ) : undefined
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      {showsAppleHealthConnection ? (
        <PrimaryCard style={styles.appleHealthCard}>
          <View style={styles.appleHealthRow}>
            <AppleHealthLogo />
            <View style={styles.appleHealthContent}>
              <View style={styles.appleHealthTitleRow}>
                <View style={styles.appleHealthTitleGroup}>
                  <Text style={styles.appleHealthTitle}>{APPLE_HEALTH_TITLE}</Text>
                  <Text style={styles.appleHealthStatus}>
                    Status: {appleHealthStatus}
                  </Text>
                </View>
                <Switch
                  value={isAppleHealthConnected}
                  onValueChange={handleAppleHealthToggle}
                  disabled={
                    isSyncing ||
                    !showsAppleHealthConnection ||
                    !hasCheckedAppleHealthAvailability
                  }
                  trackColor={{ false: "#D9D4CF", true: "#3D8CE8" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#D9D4CF"
                  style={styles.appleHealthSwitch}
                />
              </View>
              {!isAppleHealthConnected ? (
                <Text style={styles.appleHealthDescription}>
                  {APPLE_HEALTH_SETTINGS_SUBTITLE}
                </Text>
              ) : null}
              {isAppleHealthConnected ? (
                <View style={styles.syncRow}>
                  <Text style={[styles.appleHealthBody, styles.syncText]}>
                    {helperText}
                  </Text>
                  <AppButton
                    label={isSyncing ? "Refreshing..." : "Refresh"}
                    variant="overlay"
                    size="sm"
                    onPress={refreshAppleHealth}
                    disabled={isSyncing}
                    textStyle={styles.secondaryButtonText}
                    style={styles.refreshButton}
                  />
                </View>
              ) : (
                <Text style={styles.appleHealthBody}>{helperText}</Text>
              )}
            </View>
          </View>
          {!isAppleHealthConnected &&
          connection === "error" &&
          connectionError === APPLE_HEALTH_NO_DATA_MESSAGE ? (
            <Text style={styles.appleHealthNote}>
              Follow this path on your iPhone: Settings &gt; Apple Health &gt;
              {" "}Suppro &gt; Turn On All.
            </Text>
          ) : null}
        </PrimaryCard>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No connections are available on this device.
          </Text>
        </View>
      )}
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
  emptyState: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  emptyStateText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  appleHealthCard: {
    gap: 10,
    padding: 12,
  },
  appleHealthRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  appleHealthContent: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingTop: 2,
  },
  appleHealthTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  appleHealthTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  logoTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(20,20,20,0.06)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#141414",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  logoImage: {
    width: 40,
    height: 40,
  },
  appleHealthTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  appleHealthStatus: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  appleHealthDescription: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textBody,
  },
  appleHealthSwitch: {
    transform: [{ scaleX: 0.84 }, { scaleY: 0.84 }],
    marginRight: -4,
  },
  appleHealthBody: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  syncText: {
    flex: 1,
    minWidth: 0,
  },
  appleHealthNote: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  refreshButton: {
    minHeight: 34,
    flexShrink: 0,
  },
});
