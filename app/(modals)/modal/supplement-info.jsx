import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  PrimaryCard,
  SectionTitle,
  StatusPill,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { getSupplementById } from "@src/data/getSupplement";
import {
  isSupplementHearted,
  setSupplementHearted,
} from "@/features/supplements/favouritesStorage";
import MedalIcon from "@/assets/icons/supplements/medal.svg";
import AntiAgingIcon from "@/assets/icons/supplements/anti-aging.svg";
import AntiInflammatoryIcon from "@/assets/icons/supplements/anti-inflammatory.svg";
import BloodPressureControlIcon from "@/assets/icons/supplements/blood-pressure-control.svg";
import BloodSugarControlIcon from "@/assets/icons/supplements/blood-sugar-control.svg";
import BoneHealthIcon from "@/assets/icons/supplements/bone-health.svg";
import CardiovascularHealthIcon from "@/assets/icons/supplements/cardiovascular-health.svg";
import CholesterolSupportIcon from "@/assets/icons/supplements/cholesterol-support.svg";
import CognitiveSupportIcon from "@/assets/icons/supplements/cognitive-support.svg";
import ConcentrationEnhancingIcon from "@/assets/icons/supplements/concentration-enhancing.svg";
import DigestiveHealthIcon from "@/assets/icons/supplements/digestive-health.svg";
import EnduranceEnhancingIcon from "@/assets/icons/supplements/endurance-enhancing.svg";
import EnergyEnhancingIcon from "@/assets/icons/supplements/energy-enhancing.svg";
import ExerciseRecoveryIcon from "@/assets/icons/supplements/exercise-recovery.svg";
import FemaleFertilityIcon from "@/assets/icons/supplements/female-fertility.svg";
import FemaleHormoneBalanceIcon from "@/assets/icons/supplements/female-hormone-balance.svg";
import FemaleSexualArousalIcon from "@/assets/icons/supplements/female-sexual-arousal.svg";
import HairHealthIcon from "@/assets/icons/supplements/hair-health.svg";
import ImmuneHealthIcon from "@/assets/icons/supplements/immune-health.svg";
import InjuryRecoveryIcon from "@/assets/icons/supplements/injury-recovery.svg";
import JointHealthIcon from "@/assets/icons/supplements/joint-health.svg";
import LymphaticSupportIcon from "@/assets/icons/supplements/lymphatic-support.svg";
import MaleFertilityIcon from "@/assets/icons/supplements/male-fertility.svg";
import MaleSexualPerformanceIcon from "@/assets/icons/supplements/male-sexual-performance.svg";
import MemoryEnhancingIcon from "@/assets/icons/supplements/memory-enhancing.svg";
import MoodSupportIcon from "@/assets/icons/supplements/mood-support.svg";
import SkinHealthIcon from "@/assets/icons/supplements/skin-health.svg";
import SleepSupportIcon from "@/assets/icons/supplements/sleep-support.svg";
import StressReliefIcon from "@/assets/icons/supplements/stress-relief.svg";
import TestosteroneEnhancementIcon from "@/assets/icons/supplements/testosterone-enhancement.svg";
import UrineSystemHealthIcon from "@/assets/icons/supplements/urine-system-health.svg";
import WeightManagementIcon from "@/assets/icons/supplements/weight-management.svg";
import StrengthEnhancingIcon from "@/assets/icons/supplements/strength-enhancing.svg";

const BENEFIT_ICON_MAP = {
  "Weight management": WeightManagementIcon,
  "Urine system health": UrineSystemHealthIcon,
  "Testosterone boosting": TestosteroneEnhancementIcon,
  "Stress relief": StressReliefIcon,
  "Sleep support": SleepSupportIcon,
  "Skin health": SkinHealthIcon,
  "Mood support": MoodSupportIcon,
  "Memory enhancing": MemoryEnhancingIcon,
  "Male sexual performance": MaleSexualPerformanceIcon,
  "Male fertility": MaleFertilityIcon,
  "Lymphatic/swelling support": LymphaticSupportIcon,
  "Joint health": JointHealthIcon,
  "Injury recovery": InjuryRecoveryIcon,
  "Immune health": ImmuneHealthIcon,
  "Hair health": HairHealthIcon,
  "Female sexual arousal": FemaleSexualArousalIcon,
  "Female hormone balance": FemaleHormoneBalanceIcon,
  "Female fertility": FemaleFertilityIcon,
  "Exercise recovery": ExerciseRecoveryIcon,
  "Energy enhancing": EnergyEnhancingIcon,
  "Endurance enhancing": EnduranceEnhancingIcon,
  "Digestive health": DigestiveHealthIcon,
  "Concentration enhancing": ConcentrationEnhancingIcon,
  "Cognitive support": CognitiveSupportIcon,
  "Cholesterol support": CholesterolSupportIcon,
  "Cardiovascular health": CardiovascularHealthIcon,
  "Bone health": BoneHealthIcon,
  "Blood sugar control": BloodSugarControlIcon,
  "Blood pressure control": BloodPressureControlIcon,
  "Anti-inflammatory": AntiInflammatoryIcon,
  "Anti-aging": AntiAgingIcon,
  "Strength enhancing": StrengthEnhancingIcon,
};

const BENEFIT_ICON_NUDGE = {
  "Bone health": 2,
  "Joint health": 4,
  "Immune health": 2,
};
const SOLID_METAL_COLORS = {
  gold: appTheme.colors.evidenceBadge,
  silver: "#A9B4C7",
  bronze: "#C96B27",
};
const GOLD_SHEEN_LOCATIONS = [0.30985, 0.47574, 0.63187, 0.7392, 0.81727];
const METAL_BADGE_GRADIENTS = {
  gold: appTheme.gradients.evidenceBadge,
  silver: ["#DCE4EF", "#EEF3F9", "#F7FAFE", "#D7E0EB", "#B4C0D0"],
  bronze: ["#D99B67", "#E7B88D", "#F3D8BE", "#C9844C", "#B06831"],
};
const BENEFIT_RANK = {
  gold: 0,
  silver: 1,
  bronze: 2,
};
const METAL_BADGE_LOCATIONS = {
  gold: GOLD_SHEEN_LOCATIONS,
  silver: [0.18, 0.38, 0.52, 0.72, 0.92],
  bronze: [0.18, 0.4, 0.54, 0.74, 0.92],
};
const SCORE_ANIMATION_DURATION_MS = 1100;
const EVIDENCE_GAUGE_WIDTH = 261;
const EVIDENCE_GAUGE_FRAME_HEIGHT = 116;
const EVIDENCE_GAUGE_HEIGHT = 105;
const EVIDENCE_GAUGE_CENTER_X = EVIDENCE_GAUGE_WIDTH / 2;
const EVIDENCE_GAUGE_CENTER_Y = EVIDENCE_GAUGE_WIDTH / 2;
const EVIDENCE_GAUGE_RADIUS = 121;
const EVIDENCE_GAUGE_STROKE_WIDTH = 13;
const EVIDENCE_GAUGE_LENGTH = Math.PI * EVIDENCE_GAUGE_RADIUS;
const EVIDENCE_GAUGE_PATH = `M ${EVIDENCE_GAUGE_CENTER_X - EVIDENCE_GAUGE_RADIUS} ${EVIDENCE_GAUGE_CENTER_Y} A ${EVIDENCE_GAUGE_RADIUS} ${EVIDENCE_GAUGE_RADIUS} 0 0 1 ${EVIDENCE_GAUGE_CENTER_X + EVIDENCE_GAUGE_RADIUS} ${EVIDENCE_GAUGE_CENTER_Y}`;
function getRatingSummary(score) {
  if (!Number.isFinite(score)) {
    return {
      label: "UNRATED",
      pillTone: "neutral",
      caption: "This entry has not been rated yet.",
      colors: ["rgba(23,21,27,0.06)", "rgba(255,255,255,0.96)"],
      borderColor: appTheme.colors.borderSubtle,
      iconSurface: appTheme.colors.surfaceOverlayStrong,
    };
  }

  if (score >= 90) {
    return {
      label: "STRONG EVIDENCE",
      pillTone: "highlight",
      caption: "Well-supported in the catalog.",
      colors: ["rgba(39,174,96,0.24)", "rgba(255,255,255,0.96)"],
      borderColor: "rgba(39,174,96,0.16)",
      iconSurface: "rgba(255,255,255,0.48)",
    };
  }

  if (score >= 75) {
    return {
      label: "GOOD EVIDENCE",
      pillTone: "neutral",
      caption: "Well-supported in the catalog.",
      colors: ["rgba(39,174,96,0.24)", "rgba(255,255,255,0.96)"],
      borderColor: "rgba(39,174,96,0.16)",
      iconSurface: "rgba(255,255,255,0.48)",
    };
  }

  if (score >= 50) {
    return {
      label: "MODERATE EVIDENCE",
      pillTone: "neutral",
      caption: "Promising support with mixed strength.",
      colors: ["rgba(245,166,35,0.24)", "rgba(255,255,255,0.96)"],
      borderColor: "rgba(245,166,35,0.18)",
      iconSurface: "rgba(255,255,255,0.48)",
    };
  }

  return {
    label: "LIMITED EVIDENCE",
    pillTone: "neutral",
    caption: "Early or weaker catalog support.",
    colors: ["rgba(231,76,60,0.22)", "rgba(255,255,255,0.96)"],
    borderColor: "rgba(231,76,60,0.16)",
    iconSurface: "rgba(255,255,255,0.48)",
  };
}

function compareBenefits(left, right) {
  const leftRank = BENEFIT_RANK[left?.icon] ?? Number.MAX_SAFE_INTEGER;
  const rightRank = BENEFIT_RANK[right?.icon] ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return String(left?.label ?? "").localeCompare(String(right?.label ?? ""));
}

function getBenefitColor(icon) {
  return SOLID_METAL_COLORS[icon] ?? appTheme.colors.iconSurfaceMuted;
}

function clampEvidenceScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function getEvidenceGaugePalette(score) {
  if (!Number.isFinite(score)) {
    return {
      accentColor: "#EBCFBA",
      startColor: "#E8E4E0",
      progressColor: appTheme.colors.evidenceUnknown,
      textColor: appTheme.colors.textSecondary,
      trackColor: "#E4E4E4",
    };
  }

  if (score >= 75) {
    return {
      accentColor: "#F2D7C0",
      startColor: "#CFEAA8",
      progressColor: "#34C759",
      textColor: "#2FBD59",
      trackColor: "#E7E7E7",
    };
  }

  if (score >= 50) {
    return {
      accentColor: "#F2D7C0",
      startColor: "#F2E1A7",
      progressColor: appTheme.colors.evidenceModerate,
      textColor: "#D1911A",
      trackColor: "#E7E7E7",
    };
  }

  return {
    accentColor: "#F2D7C0",
    startColor: "#F0C7BC",
    progressColor: appTheme.colors.evidenceLow,
    textColor: "#D96050",
    trackColor: "#E7E7E7",
  };
}

function EvidenceRatingGauge({ value, toneScore }) {
  const hasRating = Number.isFinite(toneScore);
  const displayScore = clampEvidenceScore(value);
  const progress = hasRating ? displayScore / 100 : 0;
  const palette = getEvidenceGaugePalette(toneScore);
  const dashOffset = EVIDENCE_GAUGE_LENGTH * (1 - progress);
  const theta = Math.PI - Math.PI * progress;
  const indicatorX =
    EVIDENCE_GAUGE_CENTER_X + EVIDENCE_GAUGE_RADIUS * Math.cos(theta);
  const indicatorY =
    EVIDENCE_GAUGE_CENTER_Y - EVIDENCE_GAUGE_RADIUS * Math.sin(theta);
  const indicatorRotation = (90 - (theta * 180) / Math.PI) * 0.55;

  return (
    <View style={styles.scorePanel}>
      <Svg
        width={EVIDENCE_GAUGE_WIDTH}
        height={EVIDENCE_GAUGE_HEIGHT}
        viewBox={`0 0 ${EVIDENCE_GAUGE_WIDTH} ${EVIDENCE_GAUGE_HEIGHT}`}
      >
        <Defs>
          <SvgLinearGradient
            id="evidenceGaugeGradient"
            x1="0%"
            y1="100%"
            x2="100%"
            y2="0%"
          >
            <Stop offset="0%" stopColor={palette.accentColor} />
            <Stop offset="34%" stopColor={palette.startColor} />
            <Stop offset="100%" stopColor={palette.progressColor} />
          </SvgLinearGradient>
        </Defs>

        <Path
          d={EVIDENCE_GAUGE_PATH}
          fill="none"
          stroke={palette.trackColor}
          strokeWidth={EVIDENCE_GAUGE_STROKE_WIDTH}
          strokeLinecap="round"
        />

        <Path
          d={EVIDENCE_GAUGE_PATH}
          fill="none"
          stroke="url(#evidenceGaugeGradient)"
          strokeWidth={EVIDENCE_GAUGE_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${EVIDENCE_GAUGE_LENGTH} ${EVIDENCE_GAUGE_LENGTH}`}
          strokeDashoffset={dashOffset}
        />

        {hasRating ? (
          <G
            transform={`translate(${indicatorX} ${indicatorY}) rotate(${indicatorRotation})`}
          >
            <Rect
              x={-8.321}
              y={-11.6515}
              width={16.642}
              height={23.303}
              rx={5}
              fill={palette.progressColor}
            />
          </G>
        ) : null}
      </Svg>

      <View pointerEvents="none" style={styles.scoreTextWrap}>
        <Text style={[styles.scoreEyebrow, { color: palette.textColor }]}>
          Evidence Rating
        </Text>
        <Text
          style={[
            styles.scoreValue,
            !hasRating && styles.scoreUnavailable,
            { color: palette.textColor },
          ]}
        >
          {hasRating ? `${displayScore}/100` : "Not rated"}
        </Text>
      </View>
    </View>
  );
}

export default function SupplementInfoModal() {
  const { id, name: paramName } = useLocalSearchParams();
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [hearted, setHearted] = useState(false);
  const [displayedRating, setDisplayedRating] = useState(0);

  useEffect(() => {
    if (!id) return;

    setLoaded(false);
    getSupplementById(id)
      .then(setData)
      .finally(() => setLoaded(true));
  }, [id]);

  useEffect(() => {
    setHearted(false);
    let isActive = true;

    if (!data?.id) return;

    isSupplementHearted(data.id)
      .then((value) => {
        if (isActive) setHearted(value);
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [data?.id]);

  const benefits = useMemo(
    () => [...(data?.supplement_benefits ?? [])].sort(compareBenefits),
    [data]
  );
  const fallbackName = data?.name ?? paramName ?? "Supplement";
  const rating = data?.evidence_score;
  const hasRating = Number.isFinite(rating);
  const ratingSummary = getRatingSummary(rating);
  const isVerified = data?.verified ?? false;
  const canAddSupplement = Boolean(data?.id && data?.name);
  const headerSubtitle = loaded ? "" : "Loading supplement details";
  const visibleRating = hasRating ? displayedRating : null;

  useEffect(() => {
    if (!loaded || !hasRating) {
      setDisplayedRating(0);
      return;
    }

    let frameId;
    const startedAt = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(elapsed / SCORE_ANIMATION_DURATION_MS, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(rating * easedProgress);

      setDisplayedRating(nextValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    setDisplayedRating(0);
    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [hasRating, loaded, rating]);

  const handleHeartPress = () => {
    if (!data?.id) return;

    setHearted((previous) => {
      const next = !previous;
      setSupplementHearted(data.id, next);
      return next;
    });
  };

  const handleAddSupplement = () => {
    if (!canAddSupplement) return;

    router.push({
      pathname: "/(modals)/modal/supplement",
      params: {
        newCatalogId: data.id,
        newCatalogName: data.name,
      },
    });
  };

  return (
    <BackdropScreen
      bottomInsetOffset={72}
      minBottomPadding={96}
      header={
        <AppHeader
          topInsetOffset={appTheme.modal.headerTopInsetOffset}
          bottomPadding={3}
          leftSlot={
            <AppButton
              onPress={() => router.back()}
              variant="overlay"
              size="icon"
              accessibilityLabel="Close supplement info"
            >
              <Ionicons
                name="close"
                size={20}
                color={appTheme.colors.textStrong}
              />
            </AppButton>
          }
          rightSlot={
            <Pressable
              onPress={handleAddSupplement}
              disabled={!canAddSupplement}
              accessibilityLabel="Add supplement to your supplements"
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerAddAction,
                pressed && styles.headerAddActionPressed,
                !canAddSupplement && styles.addButtonDisabled,
              ]}
            >
              <Text style={styles.headerAddActionText}>
                +Add to supplements
              </Text>
            </Pressable>
          }
          title={fallbackName}
          titleStyle={styles.headerTitle}
          titleNumberOfLines={2}
          titleEllipsizeMode="tail"
          bottomSlot={
            <View>
              <View style={styles.headerMetaRow}>
                <StatusPill
                  label={isVerified ? "VERIFIED" : "USER SUBMITTED"}
                  tone={isVerified ? "success" : "neutral"}
                />
                <StatusPill
                  label={ratingSummary.label}
                  tone={ratingSummary.pillTone}
                  style={styles.headerEvidencePill}
                />
              </View>
              <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
            </View>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      <PrimaryCard style={styles.heroCard}>
        <View style={styles.scorePanelWrap}>
          <AppButton
            onPress={handleHeartPress}
            variant="overlay"
            size="icon"
            accessibilityLabel={
              hearted
                ? "Remove supplement from favourites"
                : "Add supplement to favourites"
            }
            style={styles.scoreFavouriteAction}
          >
            <Text
              style={[
                styles.heartIcon,
                hearted && { color: "#EF4444" },
                !hearted &&
                  hasRating && {
                    color: getEvidenceGaugePalette(rating).progressColor,
                  },
              ]}
            >
              {hearted ? "♥" : "♡"}
            </Text>
          </AppButton>

          <EvidenceRatingGauge value={visibleRating} toneScore={rating} />
        </View>

        {benefits.length > 0 ? (
          <View style={styles.benefitsSection}>
            <SectionTitle
              title={`${benefits.length} benefits`}
              style={styles.sectionTitle}
              titleStyle={styles.sectionTitleText}
              subtitleStyle={styles.sectionSubtitleText}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.benefitRow}
            >
              {benefits.map((benefit) => (
                <BenefitChip key={benefit.id} benefit={benefit} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </PrimaryCard>

      <PrimaryCard style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>Details</Text>

        <View style={styles.sectionList}>
          <DetailRow label="What is it?" value={data?.what_is_it} />
          <DetailRow label="Why use it?" value={data?.why_use_it} />
          <DetailRow
            label="Risks & interactions"
            value={data?.risks_and_interactions}
            hideBorder
          />
        </View>
      </PrimaryCard>

      <PrimaryCard style={styles.sectionCard}>
        <SectionTitle
          title="Evidence"
          subtitle={
            benefits.length > 0
              ? "Benefits linked to this supplement"
              : "No evidence listed yet"
          }
          style={styles.sectionTitle}
          titleStyle={styles.sectionTitleText}
          subtitleStyle={styles.sectionSubtitleText}
        />

        {benefits.length === 0 ? (
          <Text style={styles.emptyStateText}>No evidence listed yet.</Text>
        ) : (
          benefits.map((benefit, index) => (
            <EvidenceRow
              key={benefit.id}
              benefit={benefit}
              evidenceText={data?.evidence}
              showBorder={index < benefits.length - 1}
            />
          ))
        )}
      </PrimaryCard>
    </BackdropScreen>
  );
}

function BenefitIconBadge({
  label,
  color,
  tone,
  Icon,
  size = 20,
  containerSize = 40,
}) {
  const nudge = BENEFIT_ICON_NUDGE[label] ?? 0;
  const iconNode = (
    <Icon
      width={size}
      height={size}
      style={nudge ? { transform: [{ translateX: nudge }] } : undefined}
    />
  );

  if (tone && METAL_BADGE_GRADIENTS[tone]) {
    return (
      <LinearGradient
        colors={METAL_BADGE_GRADIENTS[tone]}
        locations={METAL_BADGE_LOCATIONS[tone]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[
          styles.benefitBadge,
          {
            width: containerSize,
            height: containerSize,
            borderRadius: containerSize / 2,
          },
        ]}
      >
        {iconNode}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.benefitBadge,
        {
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: color,
        },
      ]}
    >
      {iconNode}
    </View>
  );
}

function BenefitChip({ benefit }) {
  const Icon = BENEFIT_ICON_MAP[benefit.label] ?? MedalIcon;
  const color = getBenefitColor(benefit.icon);

  return (
    <View style={styles.benefitChip}>
      <BenefitIconBadge
        label={benefit.label}
        color={color}
        tone={benefit.icon}
        Icon={Icon}
        size={22}
        containerSize={42}
      />

      <View style={styles.benefitChipCopy}>
        <Text style={styles.benefitChipLabel}>{benefit.label}</Text>
      </View>
    </View>
  );
}

function DetailRow({ label, value, hideBorder = false }) {
  const [open, setOpen] = useState(false);
  const body = value?.trim() ? value : "—";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}. ${open ? "Collapse" : "Expand"} section.`}
      onPress={() => setOpen((previous) => !previous)}
      style={[
        styles.detailRow,
        !hideBorder && styles.detailRowBorder,
        open && styles.detailRowOpen,
      ]}
    >
      <View style={styles.detailHeader}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Ionicons
          name={open ? "chevron-down" : "chevron-forward"}
          size={18}
          color={appTheme.colors.textSecondary}
        />
      </View>

      {open ? <Text style={styles.detailBody}>{body}</Text> : null}
    </Pressable>
  );
}

function EvidenceRow({ benefit, evidenceText, showBorder }) {
  const [open, setOpen] = useState(false);
  const Icon = BENEFIT_ICON_MAP[benefit.label] ?? MedalIcon;
  const color = getBenefitColor(benefit.icon);
  const body = evidenceText?.trim()
    ? evidenceText.trim()
    : "No evidence summary is available for this supplement yet.";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${benefit.label}. ${
        open ? "Collapse" : "Expand"
      } evidence.`}
      onPress={() => setOpen((previous) => !previous)}
      style={[
        styles.evidenceRow,
        showBorder && styles.evidenceRowBorder,
        open && styles.evidenceRowOpen,
      ]}
    >
      <View style={styles.evidenceTopRow}>
        <View style={styles.evidenceLeft}>
          <BenefitIconBadge
            label={benefit.label}
            color={color}
            tone={benefit.icon}
            Icon={Icon}
            size={18}
            containerSize={34}
          />

          <View style={styles.evidenceCopy}>
            <Text style={styles.evidenceLabel}>{benefit.label}</Text>
          </View>
        </View>

        <Ionicons
          name={open ? "chevron-down" : "chevron-forward"}
          size={18}
          color={appTheme.colors.textSecondary}
        />
      </View>

      {open ? <Text style={styles.evidenceBody}>{body}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    marginRight: spacing.md,
  },
  headerBottom: {
    marginTop: 2,
  },
  headerMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  headerEvidencePill: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  heartIcon: {
    fontSize: 21,
    lineHeight: 28,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textStrong,
    paddingTop: 2,
  },
  headerAddAction: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  headerAddActionPressed: {
    opacity: 0.68,
  },
  headerAddActionText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    letterSpacing: -0.2,
    color: appTheme.colors.textStrong,
  },
  heroCard: {
    marginBottom: spacing.md,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  scorePanelWrap: {
    position: "relative",
    alignItems: "center",
  },
  scorePanel: {
    width: EVIDENCE_GAUGE_WIDTH,
    height: EVIDENCE_GAUGE_FRAME_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  scoreEyebrow: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingBlack,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  scoreTextWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 50,
    alignItems: "center",
  },
  scoreValue: {
    marginTop: 14,
    fontSize: 32,
    lineHeight: 32,
    fontFamily: typography.fontFamily.headingBlack,
    letterSpacing: -0.8,
    textAlign: "center",
  },
  scoreUnavailable: {
    marginTop: 14,
    fontSize: 24,
    fontFamily: typography.fontFamily.headingSemiBold,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  scoreFavouriteAction: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 1,
  },
  benefitsSection: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  sectionTitleText: {
    fontSize: 18,
    color: appTheme.colors.textHeading,
  },
  sectionSubtitleText: {
    color: appTheme.colors.textSecondary,
  },
  benefitRow: {
    paddingRight: spacing.xs,
  },
  benefitChip: {
    width: 152,
    minHeight: 94,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginRight: spacing.sm,
  },
  benefitBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  benefitChipCopy: {
    marginTop: 10,
  },
  benefitChipLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  sectionCard: {
    marginBottom: spacing.md,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  sectionHeading: {
    marginBottom: spacing.sm,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
  },
  sectionList: {
    marginTop: 2,
  },
  detailRow: {
    minHeight: 56,
    paddingVertical: 14,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  detailRowOpen: {
    paddingBottom: 16,
  },
  detailHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  detailLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  detailBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
    paddingRight: spacing.md,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  evidenceRow: {
    minHeight: 62,
    paddingVertical: 12,
  },
  evidenceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  evidenceRowOpen: {
    paddingBottom: 16,
  },
  evidenceTopRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  evidenceLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  evidenceCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  evidenceLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  evidenceBody: {
    marginTop: 10,
    marginLeft: 46,
    paddingRight: spacing.md,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  addButtonDisabled: {
    opacity: 0.56,
  },
});
