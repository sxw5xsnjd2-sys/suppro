import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { PrimaryCard } from "@/components/common/ui";
import { appTheme } from "@/theme";
import {
  APPLE_HEALTH_SETTINGS_SUBTITLE,
  APPLE_HEALTH_TITLE,
  getAppleHealthConnectionStatusLabel,
  useAppleHealthConnection,
} from "@/features/health/useAppleHealthConnection";

export function IOSSettingsAppleHealthCard({ styles }) {
  const { isAppleHealthConnected } = useAppleHealthConnection({
    showAlerts: false,
  });
  const appleHealthStatus = getAppleHealthConnectionStatusLabel(
    isAppleHealthConnected,
  );

  return (
    <>
      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>Integrations</Text>
      <PrimaryCard
        onPress={() => router.push("/connections")}
        style={styles.appleHealthCard}
      >
        <View style={styles.appleHealthHeaderRow}>
          <View style={styles.appleHealthCopy}>
            <Text style={styles.appleHealthTitle}>{APPLE_HEALTH_TITLE}</Text>
            <Text style={styles.appleHealthStatus}>
              Status: {appleHealthStatus}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={appTheme.colors.textSecondary}
          />
        </View>
        <Text style={styles.appleHealthDescription}>
          {APPLE_HEALTH_SETTINGS_SUBTITLE}
        </Text>
      </PrimaryCard>
    </>
  );
}
