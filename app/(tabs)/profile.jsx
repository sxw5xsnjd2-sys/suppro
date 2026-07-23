import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  ChatFloatingButton,
  PrimaryCard,
} from "@/components/common/ui";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { HealthContent } from "@/features/health/components/HealthContent";
import { StatsContent } from "@/features/stats/components/StatsContent";
import {
  ME_SEGMENTS,
  resolveMeSegment,
} from "@src/lib/routeCompatibility";
import { appTheme, spacing, typography } from "@/theme";
import SettingsIcon from "@/assets/icons/profile/settings.svg";

export default function ProfileScreen() {
  const { segment } = useLocalSearchParams();
  const scrollViewRef = React.useRef(null);
  const {
    hasActiveAccess,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const activeSegment = resolveMeSegment(segment);

  const selectSegment = (nextSegment) => {
    if (nextSegment === activeSegment) {
      return;
    }

    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    router.setParams({ segment: nextSegment });
  };

  return (
    <BackdropScreen
      scrollViewRef={scrollViewRef}
      contentStyle={styles.content}
      floatingSlot={hasActiveAccess ? <ChatFloatingButton /> : null}
      headerBehavior="collapsible"
      collapsedTitle="ME"
      header={
        <AppHeader
          leftSlot={<Text style={styles.headerTopTitle}>ME</Text>}
          rightSlot={
            <AppButton
              onPress={() => router.push("/settings")}
              variant="overlay"
              size="icon"
              accessibilityLabel="Open settings"
            >
              <SettingsIcon
                width={18}
                height={18}
                color={appTheme.colors.textStrong}
                fill={appTheme.colors.textStrong}
                stroke={appTheme.colors.textStrong}
                strokeWidth={0.55}
              />
            </AppButton>
          }
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Me section"
        style={styles.segmentedControl}
      >
        {[
          { label: "Stats", value: ME_SEGMENTS.STATS },
          { label: "Health", value: ME_SEGMENTS.HEALTH },
        ].map((item) => {
          const selected = item.value === activeSegment;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityLabel={`${item.label} section`}
              accessibilityState={{ selected }}
              onPress={() => selectSegment(item.value)}
              style={({ pressed }) => [
                styles.segmentButton,
                selected && styles.segmentButtonSelected,
                pressed && styles.segmentButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  selected && styles.segmentLabelSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {hasActiveAccess ? (
        activeSegment === ME_SEGMENTS.HEALTH ? (
          <HealthContent
            requireSubscriptionAccess={requireSubscriptionAccess}
          />
        ) : (
          <StatsContent />
        )
      ) : (
        <PrimaryCard style={styles.lockedCard}>
          <Text style={styles.lockedTitle}>Premium required</Text>
          <Text style={styles.lockedBody}>
            Restore or restart Premium to unlock your saved stats, health
            tracking, charts, and personalised profile insights.
          </Text>
          <View style={styles.lockedActions}>
            <AppButton
              label="Open Premium"
              variant="primary"
              onPress={() => openSubscriptionPaywall()}
            />
          </View>
        </PrimaryCard>
      )}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  segmentedControl: {
    flexDirection: "row",
    minHeight: 48,
    padding: 4,
    borderRadius: 14,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonSelected: {
    backgroundColor: appTheme.colors.surface,
    shadowColor: appTheme.colors.textStrong,
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentButtonPressed: {
    opacity: 0.72,
  },
  segmentLabel: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  segmentLabelSelected: {
    color: appTheme.colors.textStrong,
  },
  lockedCard: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 14,
  },
  lockedTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  lockedBody: {
    color: appTheme.colors.textBody,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
  },
  lockedActions: {
    gap: 10,
  },
  headerTopTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
  },
});
