import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader } from "@/components/common/ui";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";
import { appTheme, typography } from "@/theme";

function AndroidConnectionsScreen() {
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
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          No connections are available on this device.
        </Text>
      </View>
    </BackdropScreen>
  );
}

export default function ConnectionsScreen() {
  if (IS_APPLE_HEALTH_SUPPORTED_PLATFORM) {
    const { IOSConnectionsScreen } = require(
      "@/features/health/components/IOSConnectionsScreen"
    );

    return <IOSConnectionsScreen />;
  }

  return <AndroidConnectionsScreen />;
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
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
});
