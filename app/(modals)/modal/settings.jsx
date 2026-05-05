import React from "react";
import {
  Alert,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Purchases from "react-native-purchases";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader } from "@/components/common/ui";
import AccountIcon from "@/assets/icons/profile/account.svg";
import ConnectionsIcon from "@/assets/icons/profile/connections.svg";
import FavouriteIcon from "@/assets/icons/profile/favourite.svg";
import QuestionnaireIcon from "@/assets/icons/profile/questionnaire.svg";
import { appTheme, spacing, typography } from "@/theme";

function SupplementsIcon({ width, height, color }) {
  return (
    <Ionicons
      name="nutrition-outline"
      size={Math.min(width, height)}
      color={color}
    />
  );
}

function SubscriptionIcon({ width, height, color }) {
  return (
    <Ionicons
      name="card-outline"
      size={Math.min(width, height)}
      color={color}
    />
  );
}

function RestoreIcon({ width, height, color }) {
  return (
    <Ionicons
      name="refresh-outline"
      size={Math.min(width, height)}
      color={color}
    />
  );
}

function ContactIcon({ width, height, color }) {
  return (
    <Ionicons
      name="mail-outline"
      size={Math.min(width, height)}
      color={color}
    />
  );
}

function ShareIcon({ width, height, color }) {
  return (
    <Ionicons
      name="paper-plane-outline"
      size={Math.min(width, height)}
      color={color}
    />
  );
}

async function inviteFriendsAndFamily() {
  try {
    await Share.share({
      message:
        "I've been using Suppro to track my supplements. Check it out at https://suppro.co.uk",
      url: "https://suppro.co.uk",
    });
  } catch (_error) {
    // share sheet dismissed or failed — no action needed
  }
}

async function contactSupport() {
  await Linking.openURL("mailto:hello@suppro.co.uk");
}

const SETTINGS_ITEMS = [
  {
    key: "account",
    label: "Account",
    route: "/account",
    Icon: AccountIcon,
  },
  {
    key: "manage-subscription",
    label: "Manage subscription",
    onPress: manageSubscription,
    Icon: SubscriptionIcon,
  },
  {
    key: "restore-purchases",
    label: "Restore purchases",
    onPress: restorePurchases,
    Icon: RestoreIcon,
  },
  {
    key: "my-supplements",
    label: "My supplements",
    route: "/my-supplements",
    Icon: SupplementsIcon,
  },
  {
    key: "connections",
    label: "Connections",
    route: "/connections",
    Icon: ConnectionsIcon,
  },
  {
    key: "favourites",
    label: "Favourites",
    route: "/favourites",
    Icon: FavouriteIcon,
  },
  {
    key: "questionnaire",
    label: "Retake questionnaire",
    route: "/onboarding?mode=retake",
    Icon: QuestionnaireIcon,
  },
  {
    key: "invite",
    label: "Invite friends and family",
    onPress: inviteFriendsAndFamily,
    Icon: ShareIcon,
  },
  {
    key: "contact-us",
    label: "Need help? Contact us",
    onPress: contactSupport,
    Icon: ContactIcon,
  },
];

function SettingsItemRow({ item, showBorder = false }) {
  const IconComponent = item.Icon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPress={() => {
        if (item.onPress) {
          item.onPress();
          return;
        }

        router.push(item.route);
      }}
      style={({ pressed }) => [
        styles.itemRow,
        showBorder && styles.itemRowBorder,
        pressed && styles.itemRowPressed,
      ]}
    >
      <View style={styles.itemRowCopy}>
        <View style={styles.itemIconShell}>
          <IconComponent
            width={18}
            height={18}
            color={appTheme.colors.textStrong}
            fill={appTheme.colors.textStrong}
            stroke={appTheme.colors.textStrong}
            strokeWidth={0.55}
          />
        </View>
        <Text style={styles.itemLabel}>{item.label}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

async function manageSubscription() {
  try {
    await Purchases.showManageSubscriptions();
  } catch (_error) {
    console.log("Manage subscription error:", _error);

    Alert.alert("Manage subscription error", _error?.message || String(_error));
  }
}

async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restorePurchases();

    const entitlementId =
      process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "Suppro Premium";

    const isPremium = !!customerInfo.entitlements.active[entitlementId];

    if (isPremium) {
      Alert.alert("Purchases restored", "Your premium access is active.");
    } else {
      Alert.alert("No active subscription found");
    }
  } catch (_error) {
    Alert.alert("Restore failed", "Please try again.");
  }
}

export default function SettingsScreen() {
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
              Supplements, account, connections, and more
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <View style={styles.shortcutsList}>
        <View style={styles.divider} />
        {SETTINGS_ITEMS.slice(0, 3).map((item) => (
          <SettingsItemRow key={item.key} item={item} />
        ))}

        <View style={styles.divider} />

        {SETTINGS_ITEMS.slice(3, 7).map((item) => (
          <SettingsItemRow key={item.key} item={item} />
        ))}

        <View style={styles.divider} />

        {SETTINGS_ITEMS.slice(7).map((item) => (
          <SettingsItemRow key={item.key} item={item} />
        ))}
      </View>
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
  shortcutsList: {},
  divider: {
    height: 1,
    backgroundColor: appTheme.colors.borderSubtle,
  },
  itemRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  itemRowPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  itemRowCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  itemIconShell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
