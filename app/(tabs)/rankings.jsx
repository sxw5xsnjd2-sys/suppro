import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppHeader,
  ChatFloatingButton,
  EmptyStateCard,
  PrimaryCard,
} from "@/components/common/ui";
import { BenefitIconBadge } from "@/features/supplements/components/BenefitIconBadge";
import {
  getBenefitIconComponent,
} from "@/features/supplements/benefits";
import {
  BENEFIT_RANKING_ENTITY_TYPES,
  resolveBenefitRankingEntityType,
} from "@/features/supplements/productRankingContract";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { appTheme, spacing, typography } from "@/theme";
import { supabase } from "@src/lib/supabase";

const BENEFIT_BADGE_COLORS = {
  "Anti-aging": "#F2E4D8",
  "Anti-inflammatory": "#F4DDD6",
  "Blood pressure control": "#DDEAF4",
  "Blood sugar control": "#E7E4F7",
  "Bone health": "#E7F0E1",
  "Cardiovascular health": "#DCEAF2",
  "Cholesterol support": "#E0EDF5",
  "Cognitive support": "#E5E0F4",
  "Concentration enhancing": "#E6DFF6",
  "Digestive health": "#E6F1DF",
  "Endurance enhancing": "#F6E3D3",
  "Energy enhancing": "#F7E7D1",
  "Exercise recovery": "#F4E0D4",
  "Female fertility": "#F3DCE6",
  "Female hormone balance": "#F1D9E3",
  "Female sexual arousal": "#F4D9E1",
  "Hair health": "#EFE6D8",
  "Immune health": "#E1EEDB",
  "Injury recovery": "#F2DED4",
  "Joint health": "#E7ECD8",
  "Lymphatic/swelling support": "#DFEFE5",
  "Male fertility": "#DCE4F3",
  "Male sexual performance": "#E2DDF5",
  "Memory enhancing": "#E4DEF3",
  "Mood support": "#EADCF2",
  "Skin health": "#F2E2D8",
  "Sleep support": "#E7E1F4",
  "Stress relief": "#ECDFF1",
  "Strength enhancing": "#F4E1D5",
  "Testosterone boosting": "#E3DDF2",
  "Urine system health": "#DFEEE8",
  "Weight management": "#F4E8CF",
};

function normalizeBenefits(rows) {
  const byLabel = {};

  for (const row of rows ?? []) {
    const benefits = Array.isArray(row?.supplement_benefits)
      ? row.supplement_benefits
      : [];

    for (const benefit of benefits) {
      const label =
        typeof benefit?.label === "string" ? benefit.label.trim() : "";

      if (!label) continue;

      if (!byLabel[label]) {
        byLabel[label] = {
          label,
          icon: benefit?.icon ?? null,
        };
        continue;
      }

      if (!byLabel[label].icon && benefit?.icon) {
        byLabel[label].icon = benefit.icon;
      }
    }
  }

  return Object.values(byLabel).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

function RankingSegmentedControl({ value, onChange }) {
  const segments = [
    {
      label: "Active ingredients",
      value: BENEFIT_RANKING_ENTITY_TYPES.ACTIVE_INGREDIENT,
    },
    { label: "Products", value: BENEFIT_RANKING_ENTITY_TYPES.PRODUCT },
  ];

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Ranking type"
      style={styles.segmentedControl}
    >
      {segments.map((segment) => {
        const selected = value === segment.value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityLabel={`${segment.label} rankings`}
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
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
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BenefitListItem({
  item,
  showBorder,
  requireSubscriptionAccess,
  rankingEntity,
}) {
  const Icon = getBenefitIconComponent(item.label);
  const badgeColor =
    BENEFIT_BADGE_COLORS[item.label] ?? appTheme.colors.iconSurfaceMuted;
  const isProductRanking =
    resolveBenefitRankingEntityType(rankingEntity) ===
    BENEFIT_RANKING_ENTITY_TYPES.PRODUCT;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={`Open ${
        isProductRanking ? "product" : "active ingredient"
      } rankings for ${item.label}.`}
      onPress={() => {
        if (!requireSubscriptionAccess("benefit_ranking")) {
          return;
        }

        router.push({
          pathname: "/benefit-ranking",
          params: isProductRanking
            ? { label: item.label, entity: BENEFIT_RANKING_ENTITY_TYPES.PRODUCT }
            : { label: item.label },
        });
      }}
      style={({ pressed }) => [
        styles.benefitItem,
        showBorder && styles.benefitItemBorder,
        pressed && styles.benefitItemPressed,
      ]}
    >
      <View style={styles.benefitLeft}>
        <BenefitIconBadge
          label={item.label}
          color={badgeColor}
          Icon={Icon}
          size={18}
          containerSize={32}
          borderRadius={10}
        />
        <Text style={styles.benefitLabel}>{item.label}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

export default function RankingsScreen() {
  const { hasActiveAccess, requireSubscriptionAccess } = useSubscriptionAccess();
  const [benefits, setBenefits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRankingInfo, setShowRankingInfo] = useState(false);
  const [rankingEntity, setRankingEntity] = useState(
    BENEFIT_RANKING_ENTITY_TYPES.ACTIVE_INGREDIENT,
  );
  const isProductRanking =
    rankingEntity === BENEFIT_RANKING_ENTITY_TYPES.PRODUCT;

  useEffect(() => {
    if (!hasActiveAccess) {
      setBenefits([]);
      setLoading(false);
      setErrorMessage("");
      return;
    }

    let active = true;

    const loadBenefits = async () => {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("supplements")
        .select("supplement_benefits(label, icon)")
        .in("status", ["approved", "pending"]);

      if (!active) return;

      if (error) {
        console.error("Failed to load supplement ranking benefits", error);
        setBenefits([]);
        setErrorMessage("Could not load ranked benefits.");
        setLoading(false);
        return;
      }

      setBenefits(normalizeBenefits(data ?? []));
      setLoading(false);
    };

    loadBenefits();

    return () => {
      active = false;
    };
  }, [hasActiveAccess]);

  return (
    <BackdropScreen
      bottomInsetOffset={72}
      minBottomPadding={96}
      floatingSlot={<ChatFloatingButton />}
      headerBehavior="collapsible"
      collapsedTitle="SUPPLEMENT RANKINGS"
      header={
        <AppHeader
          title="SUPPLEMENT RANKINGS"
          titleStyle={styles.headerTitle}
          titleRowStyle={styles.headerTitleRow}
          titleAccessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showRankingInfo
                  ? "Hide supplement rankings explanation"
                  : "Show supplement rankings explanation"
              }
              accessibilityHint={
                isProductRanking
                  ? "Explains how product benefit rankings work."
                  : "Explains how supplement ranking evidence and medals work."
              }
              onPress={() => setShowRankingInfo((prev) => !prev)}
              style={({ pressed }) => [
                styles.infoButton,
                pressed && styles.infoButtonPressed,
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={appTheme.colors.textSecondary}
              />
            </Pressable>
          }
          bottomSlot={
            <View style={styles.headerBottomContent}>
              {showRankingInfo ? (
                <View style={styles.infoBubbleWrap}>
                  <View style={styles.infoBubble}>
                    <Text style={styles.infoBubbleText}>
                      {isProductRanking
                        ? "Products are ranked by their benefit-specific ingredient evidence adjusted by a genuinely comparable dose. Overall product evidence remains separate, and only eligible verified canonical products are included."
                        : "Supplements are ranked by the strength of the evidence for that particular benefit. So 1st place has the strongest evidence for that benefit. Gold medals mean robust studies with randomised controlled trials and meta-analyses. Silver medals are less robust studies and bronze medals are poorly conducted studies, or those which have no human studies."}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.headerSubtitle}>
                {isProductRanking
                  ? "Browse products ranked for a specific benefit"
                  : "Browse active ingredients ranked for a specific benefit"}
              </Text>
            </View>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      <RankingSegmentedControl
        value={rankingEntity}
        onChange={(nextValue) =>
          setRankingEntity(resolveBenefitRankingEntityType(nextValue))
        }
      />

      {loading ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>Loading ranked benefits...</Text>
        </View>
      ) : null}

      {!loading && errorMessage ? (
        <EmptyStateCard
          title="Rankings unavailable"
          description={errorMessage}
        />
      ) : null}

      {hasActiveAccess && !loading && !errorMessage && benefits.length === 0 ? (
        <EmptyStateCard
          title={isProductRanking ? "No product benefits" : "No ranked benefits"}
          description={
            isProductRanking
              ? "No benefits are available to browse for product rankings yet."
              : "No approved supplement benefits are available yet."
          }
        />
      ) : null}

      {!loading && !errorMessage && benefits.length > 0 ? (
        <PrimaryCard style={styles.resultsCard}>
          <View style={styles.list}>
            {benefits.map((item, index) => (
              <BenefitListItem
                key={item.label}
                item={item}
                showBorder={index < benefits.length - 1}
                requireSubscriptionAccess={requireSubscriptionAccess}
                rankingEntity={rankingEntity}
              />
            ))}
          </View>
        </PrimaryCard>
      ) : null}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    justifyContent: "flex-start",
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerBottomContent: {
    gap: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  infoButtonPressed: {
    opacity: 0.68,
  },
  infoBubbleWrap: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  infoBubble: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(26,24,32,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#1A1820",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  infoBubbleText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  segmentedControl: {
    flexDirection: "row",
    minHeight: 48,
    padding: 4,
    marginBottom: spacing.md,
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
    shadowColor: "#1A1820",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentButtonPressed: {
    opacity: 0.72,
  },
  segmentLabel: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  segmentLabelSelected: {
    color: appTheme.colors.textStrong,
  },
  stateCard: {
    marginBottom: spacing.md,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.card.radius,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  list: {
    overflow: "hidden",
  },
  resultsCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  benefitItem: {
    minHeight: 72,
    paddingHorizontal: appTheme.card.paddingSpacious,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  benefitItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  benefitItemPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  benefitLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  benefitLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
