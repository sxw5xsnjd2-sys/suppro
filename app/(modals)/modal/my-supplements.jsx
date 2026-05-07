import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
} from "@/components/common/ui";
import { resolveBackNavigationAction } from "@/features/subscriptions/accessPolicy";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { appTheme, spacing, typography } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { Icon } from "@/features/supplements/icons/Icon";
import { getSupplementScheduleLabel } from "@/features/supplements/schedule";

function SupplementRow({
  supplement,
  showBorder,
  requireSubscriptionAccess,
}) {
  const scheduleLabel = getSupplementScheduleLabel(supplement);

  const meta = [supplement.time, supplement.dose?.trim()]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${supplement.name}`}
      onPress={() => {
        if (!requireSubscriptionAccess("supplement_tracking")) {
          return;
        }

        router.push({
          pathname: "/(modals)/modal/supplement",
          params: { id: supplement.id },
        });
      }}
      style={({ pressed }) => [
        styles.row,
        showBorder && styles.rowBorder,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.iconCircle}>
        <Icon route={supplement.route || "tablet"} size={20} />
      </View>

      <View style={styles.rowCopy}>
        <Text style={styles.rowName} numberOfLines={1}>
          {supplement.name}
        </Text>
        {(meta || scheduleLabel) ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {[meta, scheduleLabel].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

export default function MySupplementsScreen() {
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const supplements = useSupplementsStore((s) => s.supplements);
  const sorted = [...(supplements ?? [])].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "")
  );
  const safeBackAction = React.useMemo(
    () =>
      resolveBackNavigationAction({
        canGoBack: typeof router.canGoBack === "function" && router.canGoBack(),
        fallbackHref: "/settings",
      }),
    []
  );

  React.useEffect(() => {
    if (hasActiveAccess || !isResolved) {
      return;
    }

    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

  return (
    <BackdropScreen
      header={
        <AppHeader
          leftSlot={
            <AppButton
              onPress={() => {
                if (safeBackAction.type === "back") {
                  router.back();
                  return;
                }

                router.replace(safeBackAction.href);
              }}
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
          title="MY SUPPLEMENTS"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              All supplements in your stack
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      {sorted.length === 0 ? (
        <EmptyStateCard
          title="No supplements yet"
          description="Add your first supplement from the home screen to get started."
        />
      ) : (
        <View style={styles.list}>
          {sorted.map((supplement, index) => (
            <SupplementRow
              key={supplement.id}
              supplement={supplement}
              showBorder={index < sorted.length - 1}
              requireSubscriptionAccess={requireSubscriptionAccess}
            />
          ))}
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
  list: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  rowPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
});
