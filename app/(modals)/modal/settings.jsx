import React from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader } from "@/components/common/ui";
import { resolveBackNavigationAction } from "@/features/subscriptions/accessPolicy";
import { useRevenueCat } from "@/features/subscriptions/RevenueCatProvider";
import AccountIcon from "@/assets/icons/profile/account.svg";
import ConnectionsIcon from "@/assets/icons/profile/connections.svg";
import FavouriteIcon from "@/assets/icons/profile/favourite.svg";
import QuestionnaireIcon from "@/assets/icons/profile/questionnaire.svg";
import { appTheme, spacing, typography } from "@/theme";

const SUPPRO_BOOK_IMAGE = require("@/assets/images/suppro-book.png");

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

function BookPromoCard() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Buy the Suppro book"
      onPress={() =>
        openExternalUrl(
          "https://www.amazon.co.uk/SUPPRO-Supplements-Dr-Govind-Dhillon/dp/B0GYS1F7W5/ref=sr_1_1?crid=2CVZ0K963VTCI&dib=eyJ2IjoiMSJ9.ZvxxQpwbb8K06vWZu1iS7g.swCGkzXYCqC8P25zoUROy6DVVbnwZ_p4EzV_QRm-4uE&dib_tag=se&keywords=suppro&qid=1779905813&sprefix=suppro%2Caps%2C172&sr=8-1"
        )
      }
      style={({ pressed }) => [
        styles.bookPromoCard,
        pressed && styles.bookPromoCardPressed,
      ]}
    >
      <Image
        source={SUPPRO_BOOK_IMAGE}
        resizeMode="contain"
        style={styles.bookPromoImage}
      />
      <View style={styles.bookPromoCopy}>
        <Text style={styles.bookPromoEyebrow}>Want more?</Text>
        <Text style={styles.bookPromoTitle}>Buy our book</Text>
        <Text style={styles.bookPromoSubtitle}>
          The science behind supplements - from the doctors who built Suppro.
        </Text>
        <View style={styles.bookPromoCta}>
          <Text style={styles.bookPromoCtaText}>Get the book</Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={appTheme.colors.textPrimary}
          />
        </View>
      </View>
    </Pressable>
  );
}

function LegalFooter() {
  return (
    <View style={styles.legalFooter}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Privacy Policy"
        onPress={() => openExternalUrl("https://suppro.co.uk/privacy")}
        style={({ pressed }) => pressed && styles.legalFooterLinkPressed}
      >
        <Text style={styles.legalFooterLink}>Privacy Policy</Text>
      </Pressable>
      <View style={styles.legalFooterDot} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Terms of Service"
        onPress={() => openExternalUrl("https://suppro.co.uk/terms")}
        style={({ pressed }) => pressed && styles.legalFooterLinkPressed}
      >
        <Text style={styles.legalFooterLink}>Terms of Service</Text>
      </Pressable>
    </View>
  );
}

async function contactSupport() {
  await Linking.openURL("mailto:hello@suppro.co.uk");
}

async function openExternalUrl(url) {
  try {
    await Linking.openURL(url);
  } catch (_error) {
    Alert.alert("Link unavailable", "Unable to open that link right now.");
  }
}

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

function goBackOrFallback() {
  const action = resolveBackNavigationAction({
    canGoBack: typeof router.canGoBack === "function" && router.canGoBack(),
    fallbackHref: "/",
  });

  if (action.type === "back") {
    router.back();
    return;
  }

  router.replace(action.href);
}

export default function SettingsScreen() {
  const { openManageSubscription, restorePurchases } = useRevenueCat();

  const settingsSections = [
    {
      key: "account",
      items: [
        {
          key: "account",
          label: "Account",
          route: "/account",
          Icon: AccountIcon,
        },
        {
          key: "manage-subscription",
          label: "Manage subscription",
          onPress: async () => {
            const result = await openManageSubscription();

            if (!result?.opened) {
              Alert.alert(
                "Manage subscription error",
                result?.error || "Please try again."
              );
            }
          },
          Icon: SubscriptionIcon,
        },
        {
          key: "restore-purchases",
          label: "Restore purchases",
          onPress: async () => {
            const result = await restorePurchases();

            if (result?.error) {
              Alert.alert("Restore failed", result.error);
              return;
            }

            if (result?.hasPremiumAccess) {
              Alert.alert(
                "Purchases restored",
                "Your premium access is active."
              );
              return;
            }

            Alert.alert("No active subscription found");
          },
          Icon: RestoreIcon,
        },
      ],
    },
    {
      key: "preferences",
      items: [
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
      ],
    },
    {
      key: "support",
      items: [
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
      ],
    },
  ];

  return (
    <BackdropScreen
      header={
        <AppHeader
          leftSlot={
            <AppButton
              onPress={goBackOrFallback}
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
      <BookPromoCard />
      <View style={styles.shortcutsList}>
        {settingsSections.map((section) => (
          <React.Fragment key={section.key}>
            <View style={styles.divider} />
            {section.title ? (
              <Text style={styles.sectionLabel}>{section.title}</Text>
            ) : null}
            {section.items.map((item) => (
              <SettingsItemRow key={item.key} item={item} />
            ))}
          </React.Fragment>
        ))}
        <LegalFooter />
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
  bookPromoCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: spacing.md,
    borderRadius: 22,
    backgroundColor: appTheme.colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#2A1240",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 4,
  },
  bookPromoCardPressed: {
    transform: [{ scale: 0.985 }],
    shadowOpacity: 0.06,
  },
  bookPromoImage: {
    width: 86,
    height: 110,
    flexShrink: 0,
    transform: [{ rotate: "-1.5deg" }],
    shadowColor: "#3C1428",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  bookPromoCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookPromoEyebrow: {
    marginBottom: 4,
    fontSize: 11,
    fontFamily: typography.fontFamily.bodyBold,
    color: "#B5557A",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  bookPromoTitle: {
    fontSize: 19,
    lineHeight: 21,
    fontFamily: typography.fontFamily.headingBlack,
    color: appTheme.colors.textPrimary,
  },
  bookPromoSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  bookPromoCta: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  bookPromoCtaText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bodyBold,
    color: appTheme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: appTheme.colors.borderSubtle,
  },
  sectionLabel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    fontSize: 14,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  legalFooter: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  legalFooterLinkPressed: {
    opacity: 0.6,
  },
  legalFooterLink: {
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    letterSpacing: 0.1,
    color: appTheme.colors.textSecondary,
  },
  legalFooterDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: appTheme.colors.textMuted,
    opacity: 0.6,
  },
});
