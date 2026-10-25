import React, { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppButton } from "@/components/common/ui";
import {
  IS_SUPPLEMENT_REMINDERS_SUPPORTED,
  refreshSupplementReminderPermission,
  requestSupplementReminderPermission,
  setSupplementRemindersEnabled,
  useSupplementReminderState,
} from "@/features/reminders/supplementReminders";
import { appTheme, spacing, typography } from "@/theme";

const SWITCH_TRACK_COLORS = { false: "#D9D4CF", true: "#3D8CE8" };

function getReminderStatus({ enabled, permission, permissionLoaded }) {
  if (!enabled) {
    return { kind: "off", message: "Reminders are off." };
  }

  if (!permissionLoaded) {
    return { kind: "loading", message: "Checking notification access..." };
  }

  if (permission.status === "granted") {
    return {
      kind: "on",
      message: "You'll get a notification when a supplement is due.",
    };
  }

  if (permission.status === "undetermined" && permission.canAskAgain) {
    return {
      kind: "needs_permission",
      message: "Allow notifications so SUPPRO can remind you.",
    };
  }

  return {
    kind: "blocked",
    message:
      "Notifications are blocked for SUPPRO. Turn them on in your phone's settings to get reminders.",
  };
}

async function openPhoneSettings() {
  try {
    await Linking.openSettings();
  } catch (_error) {
    Alert.alert(
      "Settings unavailable",
      "Open your phone's Settings app and allow notifications for SUPPRO."
    );
  }
}

export function SupplementReminderSettings() {
  const reminderState = useSupplementReminderState();
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    refreshSupplementReminderPermission();
  }, []);

  if (!IS_SUPPLEMENT_REMINDERS_SUPPORTED) {
    return null;
  }

  const status = getReminderStatus(reminderState);
  const isReady =
    Boolean(reminderState.accountId) && reminderState.preferenceLoaded;
  const isBlocked = status.kind === "blocked";

  const runUpdate = async (task) => {
    setIsUpdating(true);
    try {
      await task();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.rowCopy}>
          <View style={styles.iconShell}>
            <Ionicons
              name="notifications-outline"
              size={18}
              color={appTheme.colors.textStrong}
            />
          </View>
          <Text style={styles.label}>Supplement reminders</Text>
        </View>
        <Switch
          accessibilityLabel="Supplement reminders"
          value={reminderState.enabled}
          onValueChange={(value) =>
            runUpdate(() => setSupplementRemindersEnabled(value))
          }
          disabled={!isReady || isUpdating}
          trackColor={SWITCH_TRACK_COLORS}
          thumbColor="#FFFFFF"
          ios_backgroundColor={SWITCH_TRACK_COLORS.false}
        />
      </View>
      <View style={styles.statusRow}>
        <Text
          style={[styles.statusText, isBlocked && styles.statusTextBlocked]}
          accessibilityLiveRegion="polite"
        >
          {status.message}
        </Text>
        {status.kind === "needs_permission" ? (
          <AppButton
            label="Allow"
            variant="overlay"
            size="sm"
            onPress={() => runUpdate(requestSupplementReminderPermission)}
            disabled={isUpdating}
            textStyle={styles.statusButtonText}
          />
        ) : null}
        {isBlocked ? (
          <AppButton
            label="Open settings"
            variant="overlay"
            size="sm"
            onPress={openPhoneSettings}
            accessibilityHint="Opens SUPPRO in your phone's settings"
            textStyle={styles.statusButtonText}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconShell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md + 40 + spacing.md,
    paddingRight: spacing.md,
    paddingBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  statusTextBlocked: {
    color: appTheme.colors.danger,
  },
  statusButtonText: {
    fontSize: 13,
  },
});
