import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  PrimaryCard,
  StatusPill,
} from "@/components/common/ui";
import { BenefitIconBadge } from "@/features/supplements/components/BenefitIconBadge";
import {
  buildRankedBenefitSupplements,
  getBenefitColor,
  getBenefitIconComponent,
} from "@/features/supplements/benefits";
import { appTheme, spacing, typography } from "@/theme";
import { supabase } from "@src/lib/supabase";

function normalizeParam(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export default function BenefitRankingScreen() {
  const params = useLocalSearchParams();
  const benefitLabel = normalizeParam(params.label).trim();
  const [rankedSupplements, setRankedSupplements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadRankings = async () => {
      if (!benefitLabel) {
        if (!active) return;
        setRankedSupplements([]);
        setLoading(false);
        setErrorMessage("No benefit was selected.");
        return;
      }

      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("supplements")
        .select(
          "id, name, status, evidence_score, supplement_benefits!inner(id, supplement_name, label, icon, score)"
        )
        .in("status", ["approved", "pending"])
        .eq("supplement_benefits.label", benefitLabel);

      if (!active) return;

      if (error) {
        console.error("Failed to load benefit rankings", error);
        setRankedSupplements([]);
        setErrorMessage("Could not load rankings for this benefit.");
        setLoading(false);
        return;
      }

      setRankedSupplements(buildRankedBenefitSupplements(data ?? []));
      setLoading(false);
    };

    loadRankings();

    return () => {
      active = false;
    };
  }, [benefitLabel]);

  return (
    <BackdropScreen
      bottomInsetOffset={72}
      minBottomPadding={96}
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
          title={benefitLabel || "Benefit"}
          titleStyle={styles.headerTitle}
          titleAccessory={
            <StatusPill
              label={`${rankedSupplements.length} supplements`}
              tone="neutral"
              style={styles.headerCount}
            />
          }
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              All supplements currently ranked for this benefit
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      {loading ? (
        <PrimaryCard style={styles.stateCard}>
          <Text style={styles.stateText}>Loading ranked supplements...</Text>
        </PrimaryCard>
      ) : null}

      {!loading && errorMessage ? (
        <EmptyStateCard
          title="Ranking unavailable"
          description={errorMessage}
        />
      ) : null}

      {!loading && !errorMessage && rankedSupplements.length === 0 ? (
        <EmptyStateCard
          title="No ranked supplements"
          description="No catalog supplements are currently ranked for this benefit."
        />
      ) : null}

      {!loading && !errorMessage
        ? rankedSupplements.map((item) => {
            const itemIcon = getBenefitIconComponent(item.benefit?.label);
            const itemColor = getBenefitColor(item.benefit?.icon);

            return (
              <PrimaryCard
                key={item.id}
                onPress={() =>
                  router.push({
                    pathname: "/modal/supplement-info",
                    params: { id: item.id, name: item.name },
                  })
                }
                style={styles.rankCard}
                pressedStyle={styles.rankCardPressed}
              >
                <View style={styles.rankRow}>
                  <View style={styles.rankLeft}>
                    <View style={styles.rankNumberWrap}>
                      <Text style={styles.rankNumber}>
                        {item.rank ? `#${item.rank}` : "—"}
                      </Text>
                    </View>

                    <BenefitIconBadge
                      label={item.benefit?.label}
                      color={itemColor}
                      tone={item.benefit?.icon}
                      Icon={itemIcon}
                      size={22}
                      containerSize={44}
                    />

                    <View style={styles.rankCopy}>
                      <Text style={styles.rankName}>{item.name}</Text>
                      <Text style={styles.rankMeta}>
                        {item.rank
                          ? `Rank ${item.rank} of ${item.total}`
                          : "No benefit score available"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.scoreRow}>
                  <Text style={styles.scoreText}>
                    Evidence rating:{" "}
                    {Number.isFinite(item.evidenceScore)
                      ? `${item.evidenceScore}/100`
                      : "Not rated"}
                  </Text>
                </View>
              </PrimaryCard>
            );
          })
        : null}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    marginRight: spacing.md,
  },
  headerCount: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  stateCard: {
    marginBottom: spacing.md,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  rankCard: {
    marginBottom: spacing.md,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  rankCardPressed: {
    opacity: 0.94,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rankLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  rankNumberWrap: {
    width: 42,
    marginRight: spacing.sm,
  },
  rankNumber: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingBlack,
    color: appTheme.colors.textPrimary,
  },
  rankCopy: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  rankName: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  rankMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  scoreRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSubtle,
  },
  scoreText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
});
