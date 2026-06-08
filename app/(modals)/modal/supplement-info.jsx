import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { AppButton, PrimaryCard } from "@/components/common/ui";
import { COMPACT_TITLE_HEADER_TRIGGER_OFFSET } from "@/components/common/ui/CompactTitleHeader";
import ShieldTrustIcon from "@/assets/icons/shield-trust 1.svg";
import {
  buildScannedSupplementFailurePayload,
  buildScannedSupplementPayload,
} from "@/features/scanner/buildScannedSupplementPayload";
import { leaveTopLevelScanModal } from "@/features/scanner/navigation";
import { useScannerStore } from "@/features/scanner/store";
import {
  BENEFIT_RANK,
  buildBenefitRankings,
  compareScanBenefits,
  compareBenefits,
  getBenefitColor,
  getBenefitIconComponent,
  getScanBenefitProgress,
} from "@/features/supplements/benefits";
import {
  CATALOG_TYPES,
  createSupplementProductCatalogId,
} from "@/features/supplements/catalog";
import { BenefitIconBadge } from "@/features/supplements/components/BenefitIconBadge";
import { useSupplementsStore } from "@/features/supplements/store";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { resolveBackNavigationAction } from "@/features/subscriptions/accessPolicy";
import { useToastStore } from "@/features/toast/toastStore";
import { getTrackedScanMatchedIngredients } from "@/features/supplements/trackedScanContext";
import {
  isSupplementHearted,
  setSupplementHearted,
} from "@/features/supplements/favouritesStorage";
import { appTheme, gradients, typography } from "@/theme";
import { buildSupplementReferenceItems } from "@src/data/buildLinkedSupplementPayload";
import { getSupplementById } from "@src/data/getSupplement";
import { enrichProductImageIfNeeded } from "@src/lib/productImages";
import { supabase } from "@src/lib/supabase";

const DOSE_BAND_PILL_COLORS = {
  optimal: {
    bg: "rgba(102,177,94,0.15)",
    border: "rgba(102,177,94,0.4)",
    text: "#2E7728",
  },
  effective_below_target: {
    bg: "rgba(239,197,82,0.15)",
    border: "rgba(239,197,82,0.4)",
    text: "#7A5E0A",
  },
  underdosed: {
    bg: "rgba(228,120,50,0.15)",
    border: "rgba(228,120,50,0.4)",
    text: "#8A4010",
  },
  severely_underdosed: {
    bg: "rgba(201,87,87,0.15)",
    border: "rgba(201,87,87,0.4)",
    text: "#8B2020",
  },
  above_target: {
    bg: "rgba(124,143,183,0.15)",
    border: "rgba(124,143,183,0.4)",
    text: "#3A5080",
  },
};

const DOSE_STATUS_TOOLTIP_COPY = {
  missing_dose_scoringr_profile:
    "Dose target unavailable means we do not yet have a reliable target dose range for this ingredient, or it is not a supplement.",
  missing_actual_dose:
    "Dose unavailable means we could not determine a usable amount per serving from this product, so we cannot compare it with the target dose.",
  serving_size_unparseable:
    "Dose unavailable means the serving size on this product could not be read clearly enough to calculate the ingredient amount per serving.",
  unknown_amount_basis:
    "Dose unavailable means the product lists an amount, but not in a form we can confidently convert into a per-serving dose.",
  unit_mismatch:
    "Dose unavailable means the product dose and the target dose use units we cannot reliably compare yet.",
};

const B_COMPLEX_REFERENCE_ID = "68c7b7df-68a3-4c99-81c9-a09a6af9212b";
const B_COMPLEX_REFERENCE_NAME = "B Complex Vitamins";
const B_COMPLEX_REFERENCE_SOURCE_NAMES = new Set([
  "Riboflavin (Vitamin B2)",
  "Pantothenic Acid (Vitamin B5)",
  "Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)",
]);
const BENEFIT_SCORE_TOOLTIP_COPY = {
  scan: "This score estimates how well the scanned product supports this benefit by combining the matched ingredient's overall score with how effective the dose is. A fuller bar means stronger benefit support; lower bars can reflect weaker evidence, a lower dose, or both.",
  ranking:
    "A gold medal means there is strong evidence for this benefit while a silver medal means some evidence but not robust. A bronze medal means poor research studies performed for this benefit or no human studies performed.",
};
const REFERENCES_DISCLAIMER =
  "Suppro provides educational information only and is not medical advice. Always speak to a doctor, pharmacist, or qualified healthcare professional before starting supplements, especially if pregnant, taking medication, or managing a medical condition.";

function getDoseTooltipMessage(item) {
  const summary =
    typeof item?.scoreAdjustmentSummary === "string"
      ? item.scoreAdjustmentSummary.trim()
      : "";

  if (summary) {
    return summary;
  }

  return DOSE_STATUS_TOOLTIP_COPY[item?.doseComparisonStatus] ?? "";
}

const SCORE_ANIMATION_DURATION_MS = 1100;
const EVIDENCE_GAUGE_WIDTH = 261;
const EVIDENCE_GAUGE_FRAME_HEIGHT = 146;
const EVIDENCE_GAUGE_HEIGHT = 146;
const EVIDENCE_GAUGE_CENTER_X = EVIDENCE_GAUGE_WIDTH / 2;
const EVIDENCE_GAUGE_CENTER_Y = EVIDENCE_GAUGE_WIDTH / 2;
const EVIDENCE_GAUGE_RADIUS = 121;
const EVIDENCE_GAUGE_STROKE_WIDTH = 13;
const EVIDENCE_GAUGE_LENGTH = Math.PI * EVIDENCE_GAUGE_RADIUS;
const EVIDENCE_GAUGE_MARKER_RADIUS = 9;
const EVIDENCE_GAUGE_PATH = `M ${
  EVIDENCE_GAUGE_CENTER_X - EVIDENCE_GAUGE_RADIUS
} ${EVIDENCE_GAUGE_CENTER_Y} A ${EVIDENCE_GAUGE_RADIUS} ${EVIDENCE_GAUGE_RADIUS} 0 0 1 ${
  EVIDENCE_GAUGE_CENTER_X + EVIDENCE_GAUGE_RADIUS
} ${EVIDENCE_GAUGE_CENTER_Y}`;

function normalizeParam(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function normalizeIntegerParam(value) {
  const normalized = normalizeParam(value);
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDisplayImageUrl(value) {
  return (
    (typeof value?.image_url === "string" && value.image_url.trim()) ||
    (typeof value?.imageUrl === "string" && value.imageUrl.trim()) ||
    ""
  );
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
      trackColor: "#E9EAF1",
    };
  }

  if (score >= 75) {
    return {
      accentColor: "#FFE1BA",
      startColor: "#A4ED83",
      progressColor: "#34C759",
      textColor: "#34C759",
      trackColor: "#E9EAF1",
    };
  }

  if (score >= 50) {
    return {
      accentColor: "#FFDAB5",
      startColor: "#F5E88D",
      progressColor: appTheme.colors.evidenceModerate,
      textColor: appTheme.colors.evidenceModerate,
      trackColor: "#E9EAF1",
    };
  }

  return {
    accentColor: "#FFD3C8",
    startColor: "#FFAF96",
    progressColor: appTheme.colors.evidenceLow,
    textColor: appTheme.colors.evidenceLow,
    trackColor: "#E9EAF1",
  };
}

function getBenefitRankText(benefit, ranking) {
  const label = String(benefit?.label ?? "").toLowerCase();
  if (ranking?.rank) {
    return `#${ranking.rank} in ${label}`;
  }
  return "Evidence available";
}

function getSectionBody(value) {
  const body = typeof value === "string" ? value.trim() : "";
  return body || "No details listed yet.";
}

function normalizeDetailHeadingKey(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}

function splitDetailBodyBlocks(body) {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) {
    return [];
  }

  return text
    .split(/\n\s*\n+/)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return null;
      }

      return {
        heading: lines[0] ?? "",
        content: lines.slice(1).join("\n").trim(),
      };
    })
    .filter(Boolean);
}

function buildEvidenceSnippets(text) {
  if (Array.isArray(text)) {
    const snippets = text
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);

    if (snippets.length) {
      return snippets.slice(0, 3);
    }
  }

  const body = typeof text === "string" ? text.trim() : "";
  if (!body) {
    return ["No evidence summary is available for this benefit yet."];
  }

  const blocks = body
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.length ? blocks.slice(0, 3) : [body];
}

function getReferenceBenefitText(reference) {
  if (!Array.isArray(reference?.benefitLabels)) {
    return "";
  }

  return reference.benefitLabels
    .map((label) => String(label ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function formatReferenceMeta(reference) {
  return [reference?.sourceLabel, reference?.year].filter(Boolean).join(" • ");
}

function ReferenceRow({ reference, onPress }) {
  const benefitText = getReferenceBenefitText(reference);
  const referenceTitle =
    typeof reference?.citationTitle === "string" && reference.citationTitle.trim()
      ? reference.citationTitle.trim()
      : "Open source";
  const metaText = formatReferenceMeta(reference);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open source for ${
        benefitText || referenceTitle
      }`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.referenceRow,
        pressed && styles.referenceRowPressed,
      ]}
    >
      {benefitText ? (
        <Text style={styles.referenceBenefitLabel}>{benefitText}</Text>
      ) : null}
      <Text style={styles.referenceTitle}>{referenceTitle}</Text>
      {metaText ? <Text style={styles.referenceMeta}>{metaText}</Text> : null}
      <View style={styles.referenceUrlRow}>
        <Ionicons
          name="open-outline"
          size={14}
          color={appTheme.colors.textSecondary}
          style={styles.referenceUrlIcon}
        />
        <Text style={styles.referenceUrlText}>{reference.url}</Text>
      </View>
    </Pressable>
  );
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

  return (
    <View style={styles.gaugeWrap}>
      <Svg
        width={EVIDENCE_GAUGE_WIDTH}
        height={EVIDENCE_GAUGE_HEIGHT}
        viewBox={`0 0 ${EVIDENCE_GAUGE_WIDTH} ${EVIDENCE_GAUGE_HEIGHT}`}
        overflow="visible"
      >
        <Defs>
          <SvgLinearGradient
            id="supplementGaugeGradient"
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
          stroke="url(#supplementGaugeGradient)"
          strokeWidth={EVIDENCE_GAUGE_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${EVIDENCE_GAUGE_LENGTH} ${EVIDENCE_GAUGE_LENGTH}`}
          strokeDashoffset={dashOffset}
        />

        {hasRating ? (
          <G>
            <Circle
              cx={indicatorX}
              cy={indicatorY}
              r={EVIDENCE_GAUGE_MARKER_RADIUS}
              fill={palette.progressColor}
            />
          </G>
        ) : null}
      </Svg>

      <View pointerEvents="none" style={styles.gaugeTextWrap}>
        <Text style={[styles.gaugeEyebrow, { color: palette.textColor }]}>
          Overall score
        </Text>
        <Text
          style={[
            styles.gaugeValue,
            !hasRating && styles.gaugeValueUnavailable,
            { color: palette.textColor },
          ]}
        >
          {hasRating ? `${displayScore}/100` : "Not rated"}
        </Text>
      </View>
    </View>
  );
}

function HeaderAction({
  icon,
  label,
  onPress,
  disabled = false,
  accent = false,
  compact = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerAction,
        compact && styles.headerActionCompact,
        accent && styles.headerActionAccent,
        accent && compact && styles.headerActionAccentCompact,
        pressed && styles.headerActionPressed,
        disabled && styles.headerActionDisabled,
      ]}
    >
      {accent ? (
        <LinearGradient
          colors={gradients.cta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.headerActionAccentGradient,
            compact && styles.headerActionAccentGradientCompact,
          ]}
        >
          <Ionicons name={icon} size={compact ? 14 : 15} color="#FFFFFF" />
          <Text
            style={[
              styles.headerActionAccentText,
              compact && styles.headerActionAccentTextCompact,
            ]}
          >
            {label}
          </Text>
        </LinearGradient>
      ) : (
        <>
          <Ionicons
            name={icon}
            size={compact ? 14 : 15}
            color={appTheme.colors.textStrong}
          />
          <Text
            style={[
              styles.headerActionText,
              compact && styles.headerActionTextCompact,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function EvidenceSnippetCard({ text }) {
  return (
    <View style={styles.evidenceSnippetCard}>
      <Ionicons
        name="document-text-outline"
        size={15}
        color={appTheme.colors.textSecondary}
        style={styles.evidenceSnippetIcon}
      />
      <Text style={styles.evidenceSnippetText}>{text}</Text>
    </View>
  );
}

function EvidenceScorePill({ value, toneScore }) {
  const hasRating = Number.isFinite(toneScore);
  const displayScore = clampEvidenceScore(value);
  const palette = getEvidenceGaugePalette(toneScore);

  return (
    <View style={styles.evidenceScorePill}>
      <Text style={styles.evidenceScoreLabel}>Evidence score</Text>
      <Text
        style={[
          styles.evidenceScoreValue,
          !hasRating && styles.evidenceScoreValueUnavailable,
          { color: palette.textColor },
        ]}
      >
        {hasRating ? `${displayScore}/100` : "Not rated"}
      </Text>
    </View>
  );
}

function ActiveIngredientSummaryHeader({ value, toneScore }) {
  return (
    <View style={styles.activeIngredientSummaryHeader}>
      <EvidenceScorePill value={value} toneScore={toneScore} />
    </View>
  );
}

function BenefitRankingBar({
  ranking,
  dimmed = false,
  variant = "catalog",
  doseFactor = 1,
}) {
  const isScanVariant = variant === "scan";
  const progress = getScanBenefitProgress(ranking, doseFactor);

  if (!isScanVariant) {
    return null;
  }

  const fillColor = "#34C759";
  const trackColor = dimmed ? "rgba(52,199,89,0.08)" : "rgba(52,199,89,0.16)";

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.rankingBarTrack, { backgroundColor: trackColor }]}
    >
      <View
        style={[
          styles.rankingBarFill,
          { backgroundColor: dimmed ? "rgba(52,199,89,0.82)" : fillColor },
          { width: `${progress * 100}%` },
        ]}
      />
    </View>
  );
}

function BenefitGridCard({
  benefit,
  ranking,
  open,
  dimmed,
  onPress,
  onBenefitPress,
  supplementEvidence,
}) {
  const BenefitIcon = getBenefitIconComponent(benefit.label);
  const evidenceSource =
    Array.isArray(benefit?.evidenceItems) && benefit.evidenceItems.length
      ? benefit.evidenceItems
      : benefit?.evidence ?? benefit?.evidence_summary ?? supplementEvidence;
  const evidenceSnippets = buildEvidenceSnippets(evidenceSource);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${benefit.label}. ${
        open ? "Collapse" : "Expand"
      } evidence.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.benefitGridCard,
        open && styles.benefitGridCardOpen,
        dimmed && styles.benefitGridCardDimmed,
        pressed && styles.benefitGridCardPressed,
      ]}
    >
      <View style={styles.benefitGridCardTop}>
        {ranking?.icon ? (
          <View style={styles.benefitGridMedalWrap}>
            <BenefitIconBadge
              label={benefit.label}
              color={getBenefitColor(ranking.icon)}
              tone={ranking.icon}
              Icon={BenefitIcon}
              size={18}
              containerSize={34}
              borderRadius={17}
              iconOffsetX={benefit.label === "Joint health" ? -3 : 0}
            />
          </View>
        ) : (
          <View style={styles.benefitGridMedalPlaceholder} />
        )}

        <View style={styles.benefitGridCardRight}>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={15}
            color={appTheme.colors.textSecondary}
          />
        </View>
      </View>

      <Text style={styles.benefitGridLabel} numberOfLines={2}>
        {benefit.label}
      </Text>
      <Text style={styles.benefitGridMeta} numberOfLines={2}>
        {getBenefitRankText(benefit, ranking)}
      </Text>

      {open ? (
        <View style={styles.expandedEvidenceWrap}>
          {evidenceSnippets.map((snippet, index) => (
            <EvidenceSnippetCard
              key={`${benefit.id ?? benefit.label}-${index}`}
              text={snippet}
            />
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Go to ${benefit.label}`}
            onPress={(event) => {
              event.stopPropagation?.();
              onBenefitPress?.();
            }}
            style={({ pressed }) => [
              styles.benefitCta,
              pressed && styles.benefitCtaPressed,
            ]}
          >
            <Text style={styles.benefitCtaText}>
              {`Go to ${String(benefit.label)}`}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={14}
              color={appTheme.colors.textStrong}
            />
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

function BenefitRankingMedal({ ranking, benefitLabel, Icon, dimmed = false }) {
  if (!ranking?.icon) {
    return null;
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.rankingMedalWrap, dimmed && styles.rankingMedalDimmed]}
    >
      <BenefitIconBadge
        label={benefitLabel}
        color={getBenefitColor(ranking.icon)}
        tone={ranking.icon}
        Icon={Icon}
        size={12}
        containerSize={22}
        borderRadius={11}
        iconOffsetX={benefitLabel === "Joint health" ? -3 : 0}
      />
    </View>
  );
}

function DetailCard({
  sectionKey,
  icon,
  title,
  body,
  collapsibleBlocks = false,
  linkedItemsByHeading = null,
  onLinkedHeadingPress = null,
  expandedItems = {},
  onToggleItem = null,
}) {
  const blocks =
    body !== "No details listed yet." ? splitDetailBodyBlocks(body) : [];
  const showCollapsibleBlocks = collapsibleBlocks && blocks.length > 0;

  return (
    <PrimaryCard style={styles.detailCard}>
      <View style={styles.detailCardHeader}>
        <Ionicons name={icon} size={18} color={appTheme.colors.textStrong} />
        <Text style={styles.detailCardTitle}>{title}</Text>
      </View>
      {showCollapsibleBlocks ? (
        <View style={styles.detailCardBodyBlocks}>
          {blocks.map((block, index) => {
            const linkedItem =
              linkedItemsByHeading?.get(
                normalizeDetailHeadingKey(block.heading)
              ) ?? null;
            const itemName = block.heading || `Ingredient ${index + 1}`;
            const itemKey = `${sectionKey}:${normalizeDetailHeadingKey(
              block.heading
            )}:${index}`;
            const expanded = Boolean(expandedItems[itemKey]);

            return (
              <View
                key={`${title}-${block.heading}-${index}`}
                style={[
                  styles.detailCardBodyBlock,
                  index < blocks.length - 1 && styles.detailCardBodyBlockDivider,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${
                    expanded ? "Collapse" : "Expand"
                  } details for ${itemName} in ${title}`}
                  accessibilityState={{ expanded }}
                  onPress={() => onToggleItem?.(itemKey)}
                  style={({ pressed }) => [
                    styles.detailCardToggleRow,
                    pressed && styles.detailCardToggleRowPressed,
                  ]}
                >
                  {linkedItem ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${itemName}`}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        onLinkedHeadingPress?.(linkedItem);
                      }}
                      style={({ pressed }) => [
                        styles.detailCardLinkWrap,
                        pressed && styles.detailCardLinkWrapPressed,
                      ]}
                    >
                      <Text style={styles.detailCardLinkText}>{itemName}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.detailCardBodyHeading}>{itemName}</Text>
                  )}
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={appTheme.colors.textSecondary}
                  />
                </Pressable>

                {expanded ? (
                  <View style={styles.detailCardExpandedBody}>
                    {block.content ? (
                      <Text style={styles.detailCardBody}>{block.content}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.detailCardBody}>{body}</Text>
      )}
    </PrimaryCard>
  );
}

function BenefitSectionHeader({
  tooltipText,
  tooltipOpen,
  onTooltipPress,
  leftTitle = "Benefit",
  rightTitle = "Score",
  showRightGroup = true,
}) {
  return (
    <>
      <View style={styles.benefitHeaderRow}>
        <Text style={styles.benefitHeaderText}>{leftTitle}</Text>
        {showRightGroup ? (
          <View style={styles.benefitHeaderRightGroup}>
            <Text style={styles.benefitHeaderText}>{rightTitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`What this ${rightTitle.toLowerCase()} means`}
              hitSlop={8}
              onPress={onTooltipPress}
              style={({ pressed }) => [
                styles.benefitHeaderHelpButton,
                pressed && styles.benefitHeaderHelpButtonPressed,
              ]}
            >
              <Ionicons
                name="help-circle-outline"
                size={16}
                color={appTheme.colors.textSecondary}
              />
            </Pressable>
          </View>
        ) : null}
      </View>

      {showRightGroup && tooltipOpen ? (
        <View style={styles.benefitHeaderTooltipWrap}>
          <View style={styles.benefitHeaderTooltipArrow} />
          <View style={styles.doseTooltip}>
            <View style={styles.doseTooltipContent}>
              <Ionicons
                name="information-circle-outline"
                size={14}
                color="#FFFFFF"
                style={styles.doseTooltipIcon}
              />
              <Text style={styles.doseTooltipText}>{tooltipText}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

function VerifiedInfoModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.verifiedModalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close verified information"
          onPress={onClose}
          style={styles.verifiedModalBackdrop}
        />

        <LinearGradient
          colors={["#E9EBFD", "#F7E4E1", "#F5F5F5"]}
          locations={[0, 0.22, 1]}
          style={styles.verifiedSheet}
        >
          <View style={styles.verifiedSheetHeader}>
            <ShieldTrustIcon width={32} height={32} />
            <Text style={styles.verifiedSheetTitle}>Verified</Text>
          </View>

          <Text style={styles.verifiedSheetBody}>
            This badge means the supplement has been reviewed and meets our
            standards for safety, quality, and trust.
          </Text>

          <Text style={styles.verifiedSheetBody}>
            {"It's typically given to products that use well-known, widely "}
            {
              "accepted ingredients, are considered safe when used as directed, "
            }
            {
              "come from reputable brands with good manufacturing practices, and "
            }
            {"are popular among users with consistent, positive usage."}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Understood"
            onPress={onClose}
            style={({ pressed }) => [
              styles.verifiedSheetButtonWrap,
              pressed && styles.verifiedSheetButtonPressed,
            ]}
          >
            <LinearGradient
              colors={["rgba(237,181,181,0.2)", "#E5E1F9", "#F6E2E1"]}
              locations={[0, 0.05, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.verifiedSheetButton}
            >
              <Text style={styles.verifiedSheetButtonText}>Understood</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

function BenefitRow({
  benefit,
  ranking,
  open,
  dimmed,
  onPress,
  onBenefitPress,
  supplementEvidence,
  showRanking = true,
  scanSupportDriver = null,
}) {
  const BenefitIcon = getBenefitIconComponent(benefit.label);
  const evidenceSource =
    Array.isArray(benefit?.evidenceItems) && benefit.evidenceItems.length
      ? benefit.evidenceItems
      : benefit?.evidence ?? benefit?.evidence_summary ?? supplementEvidence;
  const evidenceSnippets = buildEvidenceSnippets(evidenceSource);
  const showScanSupportBar =
    ranking &&
    Number.isFinite(scanSupportDriver?.doseFactor) &&
    Number.isFinite(scanSupportDriver?.benefitScore);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${benefit.label}. ${
        open ? "Collapse" : "Expand"
      } evidence.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.benefitRow,
        open && styles.benefitRowOpen,
        dimmed && styles.benefitRowDimmed,
        pressed && styles.benefitRowPressed,
      ]}
    >
      <View style={styles.benefitRowTop}>
        <View style={styles.benefitRowLeft}>
          <View style={styles.benefitIconWrap}>
            <BenefitIcon width={20} height={20} />
          </View>

          <View style={styles.benefitCopy}>
            <Text style={styles.benefitLabel}>{benefit.label}</Text>
            {showRanking && !scanSupportDriver ? (
              <Text style={styles.benefitMeta}>
                {getBenefitRankText(benefit, ranking)}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.benefitRight,
            !showRanking && !showScanSupportBar && styles.benefitRightCompact,
          ]}
        >
          {showRanking && !scanSupportDriver ? (
            <BenefitRankingMedal
              ranking={ranking}
              benefitLabel={benefit.label}
              Icon={BenefitIcon}
              dimmed={dimmed}
            />
          ) : showScanSupportBar ? (
            <BenefitRankingBar
              ranking={ranking}
              dimmed={dimmed}
              variant="scan"
              doseFactor={scanSupportDriver.doseFactor}
            />
          ) : null}
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={15}
            color={appTheme.colors.textSecondary}
          />
        </View>
      </View>

      {open ? (
        <View style={styles.expandedEvidenceWrap}>
          {evidenceSnippets.map((snippet, index) => (
            <EvidenceSnippetCard
              key={`${benefit.id ?? benefit.label}-${index}`}
              text={snippet}
            />
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Go to ${benefit.label}`}
            onPress={(event) => {
              event.stopPropagation?.();
              onBenefitPress?.();
            }}
            style={({ pressed }) => [
              styles.benefitCta,
              pressed && styles.benefitCtaPressed,
            ]}
          >
            <Text style={styles.benefitCtaText}>
              {`Go to ${String(benefit.label)}`}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={14}
              color={appTheme.colors.textStrong}
            />
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function SupplementInfoModal() {
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const source = normalizeParam(params.source);
  const id = normalizeParam(params.id);
  const paramName = normalizeParam(params.name);
  const trackedSupplementId = normalizeParam(params.trackedSupplementId);
  const requestedScanSessionId = normalizeIntegerParam(params.scanSessionId);
  const scannerStatus = useScannerStore((state) => state.status);
  const scannerScanSessionId = useScannerStore((state) => state.scanSessionId);
  const scannerError = useScannerStore((state) => state.error);
  const scannerProduct = useScannerStore((state) => state.product);
  const scannerMatchedIngredients = useScannerStore(
    (state) => state.matchedIngredients
  );
  const resetScan = useScannerStore((state) => state.resetScan);
  const trackedSupplement = useSupplementsStore((state) =>
    trackedSupplementId
      ? state.supplements.find((item) => item.id === trackedSupplementId)
      : undefined
  );

  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [displayedRating, setDisplayedRating] = useState(0);
  const [benefitRankings, setBenefitRankings] = useState({});
  const [openBenefitId, setOpenBenefitId] = useState(null);
  const [showAllBenefits, setShowAllBenefits] = useState(false);
  const [verifiedInfoVisible, setVerifiedInfoVisible] = useState(false);
  const [isFavourite, setIsFavourite] = useState(false);
  const [showFavouriteToast, setShowFavouriteToast] = useState(false);
  const [favouriteToastText, setFavouriteToastText] = useState("");
  const [showAddToast, setShowAddToast] = useState(false);
  const [addToastText, setAddToastText] = useState("");
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [expandedDetailItems, setExpandedDetailItems] = useState({});
  const [openDoseTooltipKey, setOpenDoseTooltipKey] = useState(null);
  const [isBenefitScoreTooltipOpen, setIsBenefitScoreTooltipOpen] =
    useState(false);
  const [referencesExpanded, setReferencesExpanded] = useState(true);
  const scrollViewRef = useRef(null);
  const referencesSectionYRef = useRef(0);
  const imageRequestKeyRef = useRef("");
  const [headerAreaHeight, setHeaderAreaHeight] = useState(0);
  const collapsedHeaderAnimation = useRef(new Animated.Value(0)).current;
  const isCollapsedRef = useRef(false);
  const safeBackAction = useMemo(
    () =>
      resolveBackNavigationAction({
        canGoBack: typeof router.canGoBack === "function" && router.canGoBack(),
        fallbackHref: "/",
      }),
    []
  );
  const toastMessage = useToastStore((state) => state.message);
  const toastTarget = useToastStore((state) => state.target);
  const clearToast = useToastStore((state) => state.clear);
  const isLiveScanSource = source === "scanned";
  const isTrackedScannedSource = source === "tracked-scanned";
  const isScanStyledSource = isLiveScanSource || isTrackedScannedSource;
  const isSupplementProduct =
    data?.catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT;
  const useProductSupportBar = isScanStyledSource || isSupplementProduct;
  const effectiveScanSessionId = Number.isFinite(requestedScanSessionId)
    ? requestedScanSessionId
    : scannerScanSessionId;
  const isCurrentScanSession =
    Number.isFinite(effectiveScanSessionId) &&
    effectiveScanSessionId === scannerScanSessionId;
  const isActiveScanStatus = [
    "success",
    "error",
    "not_found",
    "no_ingredients",
  ].includes(scannerStatus);

  useEffect(() => {
    if (hasActiveAccess || !isResolved) {
      return;
    }

    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

  useEffect(() => {
    let active = true;

    if (!hasActiveAccess) {
      setData(null);
      setLoaded(false);
      return () => {
        active = false;
      };
    }

    if (!id) {
      if (!isScanStyledSource) {
        setData(null);
        setLoaded(true);
        return () => {
          active = false;
        };
      }
    }

    setLoaded(false);
    setOpenBenefitId(null);
    setShowAllBenefits(false);
    setShowAllIngredients(false);
    setExpandedDetailItems({});
    setVerifiedInfoVisible(false);
    setOpenDoseTooltipKey(null);
    setIsBenefitScoreTooltipOpen(false);
    setReferencesExpanded(true);

    if (isLiveScanSource) {
      const isActiveScan = isCurrentScanSession && isActiveScanStatus;
      const scanProductId = normalizeParam(scannerProduct?.productId);

      if (!isActiveScan) {
        setData(null);
        setLoaded(true);
        return () => {
          active = false;
        };
      }

      const loadLiveScanData = async () => {
        if (scanProductId) {
          const productDetail = await getSupplementById(
            createSupplementProductCatalogId(scanProductId),
            scannerProduct?.productName
          );

          if (productDetail) {
            return productDetail;
          }
        }

        if (scannerStatus !== "success") {
          return buildScannedSupplementFailurePayload({
            status: scannerStatus,
            error: scannerError,
            product: scannerProduct,
          });
        }

        return buildScannedSupplementPayload({
          product: scannerProduct,
          matchedIngredients: scannerMatchedIngredients,
        });
      };

      loadLiveScanData()
        .then((nextData) => {
          if (active) {
            setData(nextData);
          }
        })
        .catch((error) => {
          console.error("Failed to build scanned supplement payload", error);
          if (active) {
            setData(null);
          }
        })
        .finally(() => {
          if (active) {
            setLoaded(true);
          }
        });

      return () => {
        active = false;
      };
    }

    if (isTrackedScannedSource) {
      const matchedIngredients =
        getTrackedScanMatchedIngredients(trackedSupplement);

      if (!trackedSupplement || matchedIngredients.length === 0) {
        setData(null);
        setLoaded(true);
        return () => {
          active = false;
        };
      }

      buildScannedSupplementPayload({
        product: {
          productName: trackedSupplement.name,
          name: trackedSupplement.name,
          servingSizeText: trackedSupplement?.servingSizeText ?? null,
        },
        matchedIngredients,
      })
        .then((nextData) => {
          if (active) {
            setData({
              ...nextData,
              name: trackedSupplement.name || nextData?.name,
            });
          }
        })
        .catch((error) => {
          console.error(
            "Failed to build tracked scanned supplement payload",
            error
          );
          if (active) {
            setData(null);
          }
        })
        .finally(() => {
          if (active) {
            setLoaded(true);
          }
        });

      return () => {
        active = false;
      };
    }

    getSupplementById(id, paramName)
      .then((nextData) => {
        if (active) {
          setData(nextData);
        }
      })
      .finally(() => {
        if (active) {
          setLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [
    hasActiveAccess,
    id,
    isLiveScanSource,
    isTrackedScannedSource,
    isScanStyledSource,
    isActiveScanStatus,
    isCurrentScanSession,
    paramName,
    requestedScanSessionId,
    scannerError,
    scannerMatchedIngredients,
    scannerProduct,
    scannerScanSessionId,
    scannerStatus,
    trackedSupplement,
  ]);

  useEffect(() => {
    let active = true;

    if (!hasActiveAccess) {
      setBenefitRankings({});
      return () => {
        active = false;
      };
    }

    const loadBenefitRankings = async () => {
      const currentBenefits = data?.supplement_benefits ?? [];
      const labels = [
        ...new Set(
          currentBenefits.map((benefit) => benefit?.label).filter(Boolean)
        ),
      ];

      if (!labels.length) {
        if (active) setBenefitRankings({});
        return;
      }

      const { data: rankingRows, error } = await supabase
        .from("supplement_benefits")
        .select("id, label, score, icon")
        .in("label", labels);

      if (!active) return;

      if (error) {
        console.error("Failed to load benefit rankings", error);
        setBenefitRankings({});
        return;
      }

      setBenefitRankings(
        buildBenefitRankings(currentBenefits, rankingRows ?? [])
      );
    };

    loadBenefitRankings();

    return () => {
      active = false;
    };
  }, [data?.supplement_benefits, hasActiveAccess]);

  const rating = data?.evidence_score;

  useEffect(() => {
    if (!loaded || !Number.isFinite(rating)) {
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

    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [loaded, rating]);

  const benefits = useMemo(() => {
    const nextBenefits = [...(data?.supplement_benefits ?? [])];

    return nextBenefits.sort((left, right) => {
      const leftRanking = benefitRankings[left?.id] ?? null;
      const rightRanking = benefitRankings[right?.id] ?? null;
      const leftTone =
        BENEFIT_RANK[leftRanking?.icon ?? left?.icon] ??
        Number.MAX_SAFE_INTEGER;
      const rightTone =
        BENEFIT_RANK[rightRanking?.icon ?? right?.icon] ??
        Number.MAX_SAFE_INTEGER;

      if (leftTone !== rightTone) {
        return leftTone - rightTone;
      }

      return useProductSupportBar
        ? compareScanBenefits(left, right, leftRanking, rightRanking)
        : compareBenefits(left, right);
    });
  }, [benefitRankings, data?.supplement_benefits, useProductSupportBar]);
  const matchedIngredients = useMemo(
    () => [...(data?.matchedIngredients ?? [])],
    [data]
  );
  const linkedDetailItemsByHeading = useMemo(() => {
    if (
      !isScanStyledSource &&
      data?.catalogType !== CATALOG_TYPES.SUPPLEMENT_PRODUCT
    ) {
      return null;
    }

    const lookup = new Map();

    matchedIngredients.forEach((item) => {
      if (!item?.catalogId) {
        return;
      }

      [item?.catalogName, item?.ingredientName, item?.ingredientRaw].forEach(
        (name) => {
          const key = normalizeDetailHeadingKey(name);
          if (key && !lookup.has(key)) {
            lookup.set(key, item);
          }
        }
      );
    });

    return lookup;
  }, [data?.catalogType, isScanStyledSource, matchedIngredients]);
  const referenceItems = useMemo(() => {
    if (Array.isArray(data?.referenceItems) && data.referenceItems.length) {
      return data.referenceItems;
    }

    return buildSupplementReferenceItems(data?.supplement_benefits ?? []);
  }, [data?.referenceItems, data?.supplement_benefits]);

  const supplementEvidence =
    typeof data?.evidence === "string" && data.evidence.trim()
      ? data.evidence.trim()
      : "";
  const fallbackName =
    data?.name ??
    scannerProduct?.productName ??
    paramName ??
    (isScanStyledSource ? "Scanned supplement" : "Supplement");
  const isScanFailure = isLiveScanSource && Boolean(data?.scanFailureMessage);
  const isActiveIngredientDetail =
    data?.catalogType === CATALOG_TYPES.ACTIVE_INGREDIENT && !isScanFailure;
  const isProductNotRecognizedFailure =
    isScanFailure && data?.scanFailureStatus === "not_found";
  const isNoIngredientsScanFailure =
    isScanFailure && data?.scanFailureStatus === "no_ingredients";
  const isVerified = Boolean(data?.verified);
  const canAddSupplement = Boolean(
    (!isScanFailure && isLiveScanSource && fallbackName) ||
      (!isScanStyledSource && data?.id && data?.name)
  );
  const canImproveScanWithPhotos = Boolean(
    isLiveScanSource && isCurrentScanSession
  );
  const hasReferenceItems = referenceItems.length > 0;
  const showShareAction = !isScanFailure;
  const showRanking = !useProductSupportBar;
  const benefitHeaderTitle = showRanking ? "Evidence" : "Score";
  const visibleBenefitCount = showAllBenefits ? benefits.length : 6;
  const visibleBenefits = benefits.slice(0, visibleBenefitCount);
  const hiddenBenefitCount = Math.max(benefits.length - visibleBenefitCount, 0);
  const visibleIngredientCount = showAllIngredients ? matchedIngredients.length : 6;
  const visibleIngredients = matchedIngredients.slice(0, visibleIngredientCount);
  const hiddenIngredientCount = Math.max(
    matchedIngredients.length - visibleIngredientCount,
    0
  );
  const isSupplementProductDetail =
    data?.catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT;
  const productId = data?.product_id || data?.id;
  const shouldShowProductImage =
    !isScanFailure &&
    data?.catalogType !== CATALOG_TYPES.ACTIVE_INGREDIENT &&
    (isSupplementProductDetail ||
      data?.catalogType === "supplement_product" ||
      Boolean(
        data?.product_id ||
          data?.display_name ||
          data?.barcode ||
          data?.brand ||
          data?.brand_name
      ));
  const productImageUrl = getDisplayImageUrl(data);
  const showIngredientsSection =
    !isScanFailure &&
    (matchedIngredients.length > 0 || isSupplementProductDetail);
  const favouriteSupplementId =
    !isScanFailure && typeof data?.id === "string" && data.id.trim()
      ? data.id.trim()
      : !isScanFailure && !isScanStyledSource && id
      ? id
      : "";
  const canFavourite = Boolean(favouriteSupplementId);
  const showBComplexReference =
    !isScanFailure &&
    B_COMPLEX_REFERENCE_SOURCE_NAMES.has(
      typeof data?.name === "string" ? data.name.trim() : ""
    );
  const benefitScoreTooltipText = useProductSupportBar
    ? BENEFIT_SCORE_TOOLTIP_COPY.scan
    : BENEFIT_SCORE_TOOLTIP_COPY.ranking;
  const detailSectionTitles = useProductSupportBar
    ? {
        howToUse: "Ingredient guidance",
        whatIsIt: "Ingredient breakdown",
        whyUseIt: "Potential benefits",
      }
    : {
        howToUse: "How to use",
        whatIsIt: "What is it?",
        whyUseIt: "Why use it?",
      };

  const detailCards = useProductSupportBar
    ? [
        {
          key: "what-is-it",
          icon: "search-outline",
          title: detailSectionTitles.whatIsIt,
          body: getSectionBody(data?.what_is_it),
        },
        {
          key: "how-to-use",
          icon: "information-circle-outline",
          title: detailSectionTitles.howToUse,
          body: getSectionBody(data?.how_to_use),
        },
        {
          key: "why-use-it",
          icon: "star-outline",
          title: detailSectionTitles.whyUseIt,
          body: getSectionBody(data?.why_use_it),
        },
        {
          key: "risks",
          icon: "warning-outline",
          title: "Risks & Interactions",
          body: getSectionBody(data?.risks_and_interactions),
        },
      ]
    : [
        {
          key: "how-to-use",
          icon: "information-circle-outline",
          title: detailSectionTitles.howToUse,
          body: getSectionBody(data?.how_to_use),
        },
        {
          key: "what-is-it",
          icon: "search-outline",
          title: detailSectionTitles.whatIsIt,
          body: getSectionBody(data?.what_is_it),
        },
        {
          key: "why-use-it",
          icon: "star-outline",
          title: detailSectionTitles.whyUseIt,
          body: getSectionBody(data?.why_use_it),
        },
        {
          key: "how-it-works",
          icon: "flask-outline",
          title: "How it works",
          body: getSectionBody(data?.how_does_it_work),
        },
        {
          key: "who-might-benefit",
          icon: "people-outline",
          title: "Who might benefit",
          body: getSectionBody(data?.who_might_benefit),
        },
        {
          key: "side-effects",
          icon: "alert-circle-outline",
          title: "Side effects",
          body: getSectionBody(data?.side_effects),
        },
        {
          key: "risks",
          icon: "warning-outline",
          title: "Risks & Interactions",
          body: getSectionBody(data?.risks_and_interactions),
        },
      ];

  const handleToggleDetailItem = (itemKey) => {
    if (!itemKey) {
      return;
    }

    setExpandedDetailItems((current) => ({
      ...current,
      [itemKey]: !current[itemKey],
    }));
  };

  const toggleCollapsedHeader = (nextCollapsed) => {
    if (isCollapsedRef.current === nextCollapsed) return;
    isCollapsedRef.current = nextCollapsed;
    Animated.timing(collapsedHeaderAnimation, {
      toValue: nextCollapsed ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const handleHeaderAreaLayout = (event) => {
    setHeaderAreaHeight(event.nativeEvent.layout.height);
  };

  const handleScroll = (event) => {
    if (headerAreaHeight <= 0) return;
    const threshold = Math.max(
      0,
      16 + headerAreaHeight - COMPACT_TITLE_HEADER_TRIGGER_OFFSET
    );
    toggleCollapsedHeader(event.nativeEvent.contentOffset.y >= threshold);
  };

  const collapsedHeaderStyle = {
    opacity: collapsedHeaderAnimation,
    transform: [
      {
        translateY: collapsedHeaderAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
  };

  const handleAddSupplement = () => {
    if (!requireSubscriptionAccess("supplement_tracking")) {
      return;
    }

    if (!canAddSupplement) return;

    if (isLiveScanSource) {
      if (data?.id && data?.catalogType) {
        router.push({
          pathname: "/(modals)/modal/supplement",
          params: {
            newCatalogId: data.id,
            newCatalogName: data.name || fallbackName,
            newCatalogType: data.catalogType,
            toastTarget: "supplement-info",
          },
        });
        return;
      }

      router.push({
        pathname: "/(modals)/modal/supplement",
        params: {
          initialName: fallbackName,
          scanSource: "scanned_product",
          scanSessionId: String(effectiveScanSessionId ?? ""),
          toastTarget: "supplement-info",
        },
      });
      return;
    }

    router.push({
      pathname: "/(modals)/modal/supplement",
      params: {
        newCatalogId: data.id,
        newCatalogName: data.name,
        newCatalogType: data.catalogType,
        toastTarget: "supplement-info",
      },
    });
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${fallbackName} on Suppro${
          Number.isFinite(rating)
            ? ` • Evidence rating ${Math.round(rating)}/100`
            : ""
        }`,
      });
    } catch (error) {
      console.error("Failed to share supplement", error);
    }
  };

  const handleJumpToReferences = () => {
    if (!hasReferenceItems) {
      return;
    }

    setOpenBenefitId(null);
    setOpenDoseTooltipKey(null);
    setIsBenefitScoreTooltipOpen(false);
    setReferencesExpanded(true);

    scrollViewRef.current?.scrollTo({
      y: Math.max(0, referencesSectionYRef.current - 16),
      animated: true,
    });
  };

  const handleToggleReferences = () => {
    setReferencesExpanded((current) => !current);
  };

  const handleOpenReferenceUrl = async (url) => {
    const cleanUrl = typeof url === "string" ? url.trim() : "";
    if (!cleanUrl) {
      return;
    }

    try {
      await Linking.openURL(cleanUrl);
    } catch (_error) {
      Alert.alert("Link unavailable", "Unable to open that source right now.");
    }
  };

  const handleClose = () => {
    if (isLiveScanSource) {
      leaveTopLevelScanModal();
      return;
    }

    if (safeBackAction.type === "back") {
      router.back();
      return;
    }

    router.replace(safeBackAction.href);
  };

  const handleOpenIngredient = (item) => {
    if (!item?.catalogId) {
      return;
    }

    if (!requireSubscriptionAccess("supplement_info")) {
      return;
    }

    router.push({
      pathname: "/modal/supplement-info",
      params: {
        id: item.catalogId,
        name: item.catalogName || item.ingredientName,
      },
    });
  };

  const handleRescan = () => {
    resetScan();
    handleClose();
  };

  const handleOpenBComplexReference = () => {
    if (!requireSubscriptionAccess("supplement_info")) {
      return;
    }

    router.push({
      pathname: "/modal/supplement-info",
      params: {
        id: B_COMPLEX_REFERENCE_ID,
        name: B_COMPLEX_REFERENCE_NAME,
      },
    });
  };

  const handleImproveScanWithPhotos = () => {
    if (!requireSubscriptionAccess("photo_rescue")) {
      return;
    }

    if (!canImproveScanWithPhotos) {
      return;
    }

    router.push({
      pathname: "/scanner/photo-rescue",
      params: {
        entry: "supplement_info",
        scanSessionId: String(effectiveScanSessionId ?? ""),
      },
    });
  };

  const handleFavourite = async () => {
    if (!requireSubscriptionAccess("favourites")) {
      return;
    }

    if (!canFavourite) {
      return;
    }

    try {
      const nextFavouriteState = !isFavourite;
      await setSupplementHearted(favouriteSupplementId, nextFavouriteState);
      setIsFavourite(nextFavouriteState);
      setFavouriteToastText(
        nextFavouriteState ? "Added to favourites!" : "Removed from favourites!"
      );
      setShowFavouriteToast(true);
    } catch (error) {
      console.error("Failed to update favourite supplement", error);
    }
  };

  useEffect(() => {
    let active = true;

    if (!canFavourite) {
      setIsFavourite(false);
      return () => {
        active = false;
      };
    }

    isSupplementHearted(favouriteSupplementId)
      .then((hearted) => {
        if (active) {
          setIsFavourite(Boolean(hearted));
        }
      })
      .catch((error) => {
        console.error("Failed to load favourite state", error);
        if (active) {
          setIsFavourite(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canFavourite, favouriteSupplementId]);

  useEffect(() => {
    if (!showFavouriteToast) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setShowFavouriteToast(false);
    }, 1800);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [showFavouriteToast]);

  useEffect(() => {
    if (toastTarget !== "supplement-info" || !toastMessage) {
      return;
    }

    setAddToastText(toastMessage);
    setShowAddToast(true);
    clearToast();
  }, [clearToast, toastMessage, toastTarget]);

  useEffect(() => {
    if (!showAddToast) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setShowAddToast(false);
    }, 1800);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [showAddToast]);

  useEffect(() => {
    if (
      !hasActiveAccess ||
      !loaded ||
      !shouldShowProductImage ||
      !productId ||
      productImageUrl ||
      imageRequestKeyRef.current === productId
    ) {
      if (loaded && data) {
        console.log("product image enrichment skipped", {
          productId,
          catalogType: data?.catalogType,
          hasImage: Boolean(data?.image_url),
          displayName: data?.display_name,
          name: data?.name,
        });
      }
      return undefined;
    }

    let active = true;
    imageRequestKeyRef.current = productId;

    console.log("product image enrichment requested", { productId });
    enrichProductImageIfNeeded(data).then((result) => {
      if (!active || !result?.imageUrl) {
        return;
      }

      if (result.status !== "found" && result.status !== "cached") {
        return;
      }

      setData((current) => {
        const currentProductId = current?.product_id || current?.id;
        if (
          !current ||
          currentProductId !== productId ||
          getDisplayImageUrl(current)
        ) {
          return current;
        }

        return {
          ...current,
          image_url: result.imageUrl,
          image_thumbnail_url: result.thumbnailUrl ?? null,
          image_source_url: result.sourceUrl ?? null,
          image_query: result.query ?? null,
          image_confidence: result.confidence ?? null,
          image_status:
            result.status === "cached" ? current.image_status : "found",
        };
      });
    });

    return () => {
      active = false;
    };
  }, [
    data,
    hasActiveAccess,
    loaded,
    productId,
    productImageUrl,
    shouldShowProductImage,
  ]);

  if (!hasActiveAccess) {
    return <View style={styles.screenRoot} />;
  }

  if (loaded && isProductNotRecognizedFailure) {
    return (
      <View style={[styles.screenRoot, styles.notRecognizedScreenRoot]}>
        <PrimaryCard
          style={[
            styles.summaryCard,
            styles.summaryCardNotRecognized,
            styles.summaryCardNotRecognizedPopup,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close supplement info"
            hitSlop={8}
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,
              styles.closeButtonPopup,
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Ionicons
              name="close"
              size={18}
              color={appTheme.colors.textStrong}
            />
          </Pressable>

          <View
            style={[
              styles.scanFailureState,
              styles.scanFailureStateNotRecognized,
            ]}
          >
            <Text
              style={[
                styles.scanFailureBody,
                styles.scanFailureBodyCentered,
                styles.scanFailureBodyNotRecognized,
              ]}
            >
              {data?.scanFailureMessage}
            </Text>
            <View
              style={[
                styles.scanFailureActions,
                styles.scanFailureActionsStacked,
              ]}
            >
              <AppButton
                accessibilityLabel="Take pictures"
                variant="primary"
                onPress={handleImproveScanWithPhotos}
                contentStyle={styles.scanFailurePrimaryButtonContent}
                style={styles.scanFailurePrimaryButton}
              >
                <View style={styles.scanFailurePrimaryButtonInner}>
                  <Ionicons
                    name="camera-outline"
                    size={18}
                    color="#FFFFFF"
                    style={styles.scanFailurePrimaryButtonIcon}
                  />
                  <Text style={styles.scanFailurePrimaryButtonText}>
                    Take pictures
                  </Text>
                </View>
              </AppButton>
            </View>
          </View>
        </PrimaryCard>

        <VerifiedInfoModal
          visible={verifiedInfoVisible && isVerified}
          onClose={() => setVerifiedInfoVisible(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.screenRoot}>
      <LinearGradient
        colors={["#E9EBFD", "#F7E4E1", "#F4F4F4"]}
        locations={[0, 0.22, 1]}
        style={StyleSheet.absoluteFill}
      />

      {showFavouriteToast || showAddToast ? (
        <View
          pointerEvents="none"
          style={[
            styles.toastWrap,
            { bottom: Math.max(insets.bottom + 20, 32) },
          ]}
        >
          <View style={styles.toast}>
            <Ionicons
              name={showAddToast ? "checkmark-circle" : "heart"}
              size={14}
              color="#FFFFFF"
            />
            <Text style={styles.toastText}>
              {showAddToast ? addToastText : favouriteToastText}
            </Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom + 28, 36),
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.scrollInner} onLayout={handleHeaderAreaLayout}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close supplement info"
            hitSlop={8}
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,
              styles.closeButtonScroll,
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Ionicons
              name="close"
              size={18}
              color={appTheme.colors.textStrong}
            />
          </Pressable>

          {canFavourite ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isFavourite ? "Saved to favourites" : "Add to favourites"
              }
              accessibilityState={isFavourite ? { selected: true } : {}}
              hitSlop={8}
              onPress={handleFavourite}
              style={({ pressed }) => [
                styles.favouriteButton,
                styles.favouriteButtonScroll,
                { top: isActiveIngredientDetail ? 72 : 44 },
                isFavourite && styles.favouriteButtonActive,
                pressed && styles.closeButtonPressed,
              ]}
            >
              <Ionicons
                name={isFavourite ? "heart" : "heart-outline"}
                size={16}
                color={isFavourite ? "#A6685B" : appTheme.colors.textStrong}
              />
            </Pressable>
          ) : null}

          {isActiveIngredientDetail ? (
            <View style={styles.activeIngredientPageLabel}>
              <Ionicons
                name="book-outline"
                size={20}
                color={appTheme.colors.textStrong}
              />
              <Text style={styles.activeIngredientPageLabelText}>
                Active ingredient
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.headerBlock,
              isActiveIngredientDetail && styles.headerBlockActiveIngredient,
            ]}
          >
            {!isProductNotRecognizedFailure ? (
              <View style={styles.titleRow}>
                {shouldShowProductImage ? (
                  <View style={styles.productImageFrame}>
                    {productImageUrl ? (
                      <Image
                        source={{ uri: productImageUrl }}
                        style={styles.productImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons
                        name="cube-outline"
                        size={24}
                        color={appTheme.colors.textSecondary}
                      />
                    )}
                  </View>
                ) : null}
                <View style={styles.titleCopy}>
                  <View
                    style={[
                      styles.titleTextGroup,
                      isActiveIngredientDetail && styles.titleTextGroupInline,
                    ]}
                  >
                    <Text style={styles.pageTitle}>{fallbackName}</Text>
                    {isActiveIngredientDetail && isVerified ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Verified supplement information"
                        hitSlop={8}
                        onPress={() => setVerifiedInfoVisible(true)}
                        style={({ pressed }) => [
                          styles.verifiedBadgeButton,
                          styles.verifiedBadgeButtonInline,
                          pressed && styles.verifiedBadgeButtonPressed,
                        ]}
                      >
                        <ShieldTrustIcon width={16} height={16} />
                      </Pressable>
                    ) : null}
                  </View>
                  {!isActiveIngredientDetail && isVerified ? (
                    <View style={styles.titleActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Verified supplement information"
                        hitSlop={8}
                        onPress={() => setVerifiedInfoVisible(true)}
                        style={({ pressed }) => [
                          styles.verifiedBadgeButton,
                          pressed && styles.verifiedBadgeButtonPressed,
                        ]}
                      >
                        <ShieldTrustIcon width={16} height={16} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {hasReferenceItems ||
            canAddSupplement ||
            showShareAction ||
            (canImproveScanWithPhotos && !isProductNotRecognizedFailure) ? (
              <View style={styles.headerActionsContainer}>
                {canImproveScanWithPhotos && !isProductNotRecognizedFailure ? (
                  <View style={styles.headerActionsRow}>
                    <HeaderAction
                      icon="camera-outline"
                      label="Improve with photos"
                      onPress={handleImproveScanWithPhotos}
                      accent
                      compact
                    />
                    {hasReferenceItems ? (
                      <HeaderAction
                        icon="document-text-outline"
                        label="References"
                        onPress={handleJumpToReferences}
                        compact
                      />
                    ) : null}
                  </View>
                ) : hasReferenceItems ? (
                  <View style={styles.headerActionsRow}>
                    <HeaderAction
                      icon="document-text-outline"
                      label="References"
                      onPress={handleJumpToReferences}
                      compact
                    />
                  </View>
                ) : null}
                {canAddSupplement || showShareAction ? (
                  <View style={styles.headerActionsRow}>
                    {canAddSupplement ? (
                      <HeaderAction
                        icon="add"
                        label="Add to supplements"
                        onPress={handleAddSupplement}
                        disabled={!canAddSupplement}
                      />
                    ) : null}
                    {showShareAction ? (
                      <HeaderAction
                        icon="share-social-outline"
                        label="Share"
                        onPress={handleShare}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {!loaded ? (
          <PrimaryCard style={styles.loadingCard}>
            <Text style={styles.loadingText}>
              Loading supplement details...
            </Text>
          </PrimaryCard>
        ) : null}

        {loaded ? (
          <>
            <PrimaryCard
              style={[
                styles.summaryCard,
                isActiveIngredientDetail && styles.summaryCardActiveIngredient,
                isProductNotRecognizedFailure &&
                  styles.summaryCardNotRecognized,
              ]}
            >
              {isActiveIngredientDetail ? (
                <ActiveIngredientSummaryHeader
                  value={displayedRating}
                  toneScore={rating}
                />
              ) : !isProductNotRecognizedFailure ? (
                <EvidenceRatingGauge
                  value={displayedRating}
                  toneScore={rating}
                />
              ) : null}

              {showBComplexReference ? (
                <View style={styles.referenceNoteWrap}>
                  <Text style={styles.referenceNoteText}>
                    For more information see our page on
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open B Complex Vitamins"
                    onPress={handleOpenBComplexReference}
                    style={({ pressed }) => [
                      styles.referenceNoteButton,
                      pressed && styles.referenceNoteButtonPressed,
                    ]}
                  >
                    <Text style={styles.referenceNoteButtonText}>
                      B Complex Vitamins
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {isScanFailure ? (
                <View
                  style={[
                    styles.scanFailureState,
                    isProductNotRecognizedFailure &&
                      styles.scanFailureStateNotRecognized,
                  ]}
                >
                  {!isProductNotRecognizedFailure ? (
                    <Text style={styles.scanFailureTitle}>Scan issue</Text>
                  ) : null}
                  <Text
                    style={[
                      styles.scanFailureBody,
                      isProductNotRecognizedFailure &&
                        styles.scanFailureBodyCentered,
                      isProductNotRecognizedFailure &&
                        styles.scanFailureBodyNotRecognized,
                    ]}
                  >
                    {data?.scanFailureMessage}
                  </Text>
                  <View
                    style={[
                      styles.scanFailureActions,
                      isNoIngredientsScanFailure &&
                        styles.scanFailureActionsCentered,
                      isProductNotRecognizedFailure &&
                        styles.scanFailureActionsStacked,
                    ]}
                  >
                    {isProductNotRecognizedFailure ? (
                      <AppButton
                        accessibilityLabel="Take pictures"
                        variant="primary"
                        onPress={handleImproveScanWithPhotos}
                        contentStyle={styles.scanFailurePrimaryButtonContent}
                        style={styles.scanFailurePrimaryButton}
                      >
                        <View style={styles.scanFailurePrimaryButtonInner}>
                          <Ionicons
                            name="camera-outline"
                            size={18}
                            color="#FFFFFF"
                            style={styles.scanFailurePrimaryButtonIcon}
                          />
                          <Text style={styles.scanFailurePrimaryButtonText}>
                            Take pictures
                          </Text>
                        </View>
                      </AppButton>
                    ) : isNoIngredientsScanFailure ? (
                      canImproveScanWithPhotos ? (
                        <HeaderAction
                          icon="camera-outline"
                          label="Improve with photos"
                          onPress={handleImproveScanWithPhotos}
                          accent
                        />
                      ) : null
                    ) : (
                      <>
                        <AppButton
                          label="Rescan"
                          variant="primary"
                          onPress={handleRescan}
                        />
                        {canImproveScanWithPhotos ? (
                          <AppButton
                            label="Improve scan with photos"
                            variant="ghost"
                            onPress={handleImproveScanWithPhotos}
                          />
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
              ) : benefits.length > 0 ? (
                <>
                  <BenefitSectionHeader
                    leftTitle={
                      isActiveIngredientDetail ? "Benefits" : "Benefit"
                    }
                    rightTitle={benefitHeaderTitle}
                    showRightGroup={!isActiveIngredientDetail}
                    tooltipText={benefitScoreTooltipText}
                    tooltipOpen={isBenefitScoreTooltipOpen}
                    onTooltipPress={() => {
                      setOpenDoseTooltipKey(null);
                      setIsBenefitScoreTooltipOpen((current) => !current);
                    }}
                  />

                  <View
                    style={
                      isActiveIngredientDetail
                        ? styles.benefitGrid
                        : styles.benefitList
                    }
                  >
                    {visibleBenefits.map((benefit) => {
                      const isOpen = openBenefitId === benefit.id;
                      const dimmed = Boolean(openBenefitId && !isOpen);

                      return isActiveIngredientDetail ? (
                        <BenefitGridCard
                          key={benefit.id}
                          benefit={benefit}
                          ranking={benefitRankings[benefit.id] ?? null}
                          open={isOpen}
                          dimmed={dimmed}
                          supplementEvidence={supplementEvidence}
                          onPress={() => {
                            setIsBenefitScoreTooltipOpen(false);
                            setOpenBenefitId((current) =>
                              current === benefit.id ? null : benefit.id
                            );
                          }}
                          onBenefitPress={() => {
                            if (!requireSubscriptionAccess("benefit_ranking")) {
                              return;
                            }

                            setIsBenefitScoreTooltipOpen(false);
                            router.push({
                              pathname: "/benefit-ranking",
                              params: { label: benefit.label },
                            });
                          }}
                        />
                      ) : (
                        <BenefitRow
                          key={benefit.id}
                          benefit={benefit}
                          ranking={benefitRankings[benefit.id] ?? null}
                          open={isOpen}
                          dimmed={dimmed}
                          supplementEvidence={supplementEvidence}
                          showRanking={showRanking}
                          scanSupportDriver={
                            useProductSupportBar
                              ? benefit?.scanSupportDriver ?? null
                              : null
                          }
                          onPress={() => {
                            setIsBenefitScoreTooltipOpen(false);
                            setOpenBenefitId((current) =>
                              current === benefit.id ? null : benefit.id
                            );
                          }}
                          onBenefitPress={() => {
                            if (!requireSubscriptionAccess("benefit_ranking")) {
                              return;
                            }

                            setIsBenefitScoreTooltipOpen(false);
                            router.push({
                              pathname: "/benefit-ranking",
                              params: { label: benefit.label },
                            });
                          }}
                        />
                      );
                    })}

                    {hiddenBenefitCount > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${hiddenBenefitCount} more benefits`}
                        onPress={() => setShowAllBenefits(true)}
                        style={({ pressed }) => [
                          styles.moreBenefitsRow,
                          isActiveIngredientDetail &&
                            styles.benefitGridActionRow,
                          pressed && styles.moreBenefitsRowPressed,
                        ]}
                      >
                        <Text style={styles.moreBenefitsText}>
                          {`${hiddenBenefitCount} more benefits`}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={appTheme.colors.textStrong}
                        />
                      </Pressable>
                    ) : null}

                    {showAllBenefits && benefits.length > 6 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Show fewer benefits"
                        onPress={() => {
                          setShowAllBenefits(false);
                          if (
                            !benefits
                              .slice(0, 6)
                              .some((item) => item.id === openBenefitId)
                          ) {
                            setOpenBenefitId(null);
                          }
                        }}
                        style={({ pressed }) => [
                          styles.moreBenefitsRow,
                          isActiveIngredientDetail &&
                            styles.benefitGridActionRow,
                          pressed && styles.moreBenefitsRowPressed,
                        ]}
                      >
                        <Text style={styles.moreBenefitsText}>Show less</Text>
                        <Ionicons
                          name="chevron-up"
                          size={16}
                          color={appTheme.colors.textStrong}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={styles.emptyBenefitText}>
                  No linked benefits are listed for this supplement yet.
                </Text>
              )}

              {showIngredientsSection ? (
                <View style={styles.ingredientsSection}>
                  <Text style={styles.ingredientsSectionTitle}>
                    Ingredients
                  </Text>

                  {matchedIngredients.length > 0 ? (
                    <View style={styles.ingredientsList}>
                      {visibleIngredients.map((item, index) => {
                        const ingredientName = String(
                          item?.ingredientName ??
                            item?.catalogName ??
                            "Matched ingredient"
                        );
                        const dosageDisplay = String(
                          item?.dosageDisplay ?? ""
                        ).trim();
                        const canOpenIngredient = Boolean(item?.catalogId);

                        return (
                          <Pressable
                            accessibilityRole={
                              canOpenIngredient ? "button" : undefined
                            }
                            accessibilityLabel={
                              canOpenIngredient
                                ? `Open ${ingredientName}`
                                : undefined
                            }
                            disabled={!canOpenIngredient}
                            key={`${
                              item?.ingredientNormalized ?? ingredientName
                            }:${item?.catalogId ?? index}:${index}`}
                            onPress={() => handleOpenIngredient(item)}
                            style={({ pressed }) => [
                              styles.ingredientRow,
                              index < visibleIngredients.length - 1 &&
                                styles.ingredientRowDivider,
                              canOpenIngredient &&
                                pressed &&
                                styles.ingredientRowPressed,
                            ]}
                          >
                            <View style={styles.ingredientCopy}>
                              <View style={styles.ingredientTitleRow}>
                                <Text style={styles.ingredientTitle}>
                                  {ingredientName}
                                </Text>
                                {dosageDisplay ? (
                                  <Text style={styles.ingredientDoseInline}>
                                    {dosageDisplay}
                                  </Text>
                                ) : null}
                              </View>
                              {item?.doseConfidence === "unverified" ? (
                                <View style={styles.doseUnverifiedBadge}>
                                  <Ionicons
                                    name="alert-circle-outline"
                                    size={11}
                                    color="#7A6010"
                                    style={styles.doseUnverifiedIcon}
                                  />
                                  <Text style={styles.doseUnverifiedText}>
                                    Unverified dose
                                  </Text>
                                </View>
                              ) : null}
                              {item?.doseStatusLabel
                                ? (() => {
                                    const tooltipKey = `${
                                      item?.catalogId ?? index
                                    }:${index}`;
                                    const isTooltipOpen =
                                      openDoseTooltipKey === tooltipKey;
                                    const doseBand = item?.doseBand;
                                    const pillColors =
                                      DOSE_BAND_PILL_COLORS[doseBand] ?? null;
                                    const showWarning =
                                      doseBand === "underdosed" ||
                                      doseBand === "severely_underdosed";
                                    const tooltipMessage =
                                      getDoseTooltipMessage(item);
                                    const hasTooltip = Boolean(tooltipMessage);
                                    return (
                                      <View style={styles.doseStatusBlock}>
                                        <Pressable
                                          disabled={!hasTooltip}
                                          onPress={
                                            hasTooltip
                                              ? () => {
                                                  setIsBenefitScoreTooltipOpen(
                                                    false
                                                  );
                                                  setOpenDoseTooltipKey(
                                                    isTooltipOpen
                                                      ? null
                                                      : tooltipKey
                                                  );
                                                }
                                              : undefined
                                          }
                                          style={({ pressed }) => [
                                            styles.doseStatusPill,
                                            pillColors && {
                                              backgroundColor: pillColors.bg,
                                              borderColor: pillColors.border,
                                            },
                                            pressed &&
                                              styles.doseStatusPillPressed,
                                          ]}
                                        >
                                          {showWarning ? (
                                            <Ionicons
                                              name="warning"
                                              size={12}
                                              color={
                                                pillColors?.text ??
                                                appTheme.colors.textStrong
                                              }
                                              style={
                                                styles.doseStatusWarningIcon
                                              }
                                            />
                                          ) : null}
                                          <Text
                                            style={[
                                              styles.doseStatusPillText,
                                              pillColors && {
                                                color: pillColors.text,
                                              },
                                            ]}
                                          >
                                            {item.doseStatusLabel}
                                          </Text>
                                          {hasTooltip ? (
                                            <Ionicons
                                              name="information-circle-outline"
                                              size={13}
                                              color={
                                                pillColors?.text ??
                                                appTheme.colors.textSecondary
                                              }
                                              style={styles.doseStatusInfoIcon}
                                            />
                                          ) : null}
                                        </Pressable>
                                        {isTooltipOpen && hasTooltip ? (
                                          <View style={styles.doseTooltip}>
                                            <View
                                              style={styles.doseTooltipArrow}
                                            />
                                            <View
                                              style={styles.doseTooltipContent}
                                            >
                                              <Ionicons
                                                name="information-circle-outline"
                                                size={14}
                                                color="#FFFFFF"
                                                style={styles.doseTooltipIcon}
                                              />
                                              <Text
                                                style={styles.doseTooltipText}
                                              >
                                                {tooltipMessage}
                                              </Text>
                                            </View>
                                          </View>
                                        ) : null}
                                      </View>
                                    );
                                  })()
                                : null}
                            </View>

                            {canOpenIngredient ? (
                              <Ionicons
                                name="chevron-forward"
                                size={16}
                                color={appTheme.colors.textSecondary}
                              />
                            ) : null}
                          </Pressable>
                        );
                      })}

                      {hiddenIngredientCount > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Show ${hiddenIngredientCount} more ingredients`}
                          onPress={() => setShowAllIngredients(true)}
                          style={({ pressed }) => [
                            styles.moreBenefitsRow,
                            pressed && styles.moreBenefitsRowPressed,
                          ]}
                        >
                          <Text style={styles.moreBenefitsText}>
                            {`+ ${hiddenIngredientCount} more ingredients`}
                          </Text>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={appTheme.colors.textStrong}
                          />
                        </Pressable>
                      ) : null}

                      {showAllIngredients && matchedIngredients.length > 6 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Show fewer ingredients"
                          onPress={() => setShowAllIngredients(false)}
                          style={({ pressed }) => [
                            styles.moreBenefitsRow,
                            pressed && styles.moreBenefitsRowPressed,
                          ]}
                        >
                          <Text style={styles.moreBenefitsText}>Show less</Text>
                          <Ionicons
                            name="chevron-up"
                            size={16}
                            color={appTheme.colors.textStrong}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={styles.emptyIngredientText}>
                      No linked active ingredients yet.
                    </Text>
                  )}
                </View>
              ) : null}
            </PrimaryCard>

            {!isScanFailure
              ? detailCards.map((section) => (
                  <DetailCard
                    key={section.key}
                    sectionKey={section.key}
                    icon={section.icon}
                    title={section.title}
                    body={section.body}
                    collapsibleBlocks={Boolean(linkedDetailItemsByHeading)}
                    linkedItemsByHeading={linkedDetailItemsByHeading}
                    onLinkedHeadingPress={handleOpenIngredient}
                    expandedItems={expandedDetailItems}
                    onToggleItem={handleToggleDetailItem}
                  />
                ))
              : null}

            {!isScanFailure && hasReferenceItems ? (
              <View
                onLayout={(event) => {
                  referencesSectionYRef.current = event.nativeEvent.layout.y;
                }}
              >
                <PrimaryCard style={styles.referencesCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${
                      referencesExpanded ? "Collapse" : "Expand"
                    } references`}
                    accessibilityState={{ expanded: referencesExpanded }}
                    onPress={handleToggleReferences}
                    style={({ pressed }) => [
                      styles.referencesHeaderButton,
                      pressed && styles.referencesHeaderButtonPressed,
                    ]}
                  >
                    <View style={styles.referencesHeaderCopy}>
                      <View style={styles.referencesHeader}>
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color={appTheme.colors.textStrong}
                        />
                        <Text style={styles.referencesTitle}>References</Text>
                      </View>
                      <Text style={styles.referencesHeaderMeta}>
                        {`${referenceItems.length} source${
                          referenceItems.length === 1 ? "" : "s"
                        }`}
                      </Text>
                    </View>
                    <Ionicons
                      name={referencesExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={appTheme.colors.textSecondary}
                    />
                  </Pressable>

                  {referencesExpanded ? (
                    <>
                      <Text style={styles.referencesIntro}>
                        Open the source links behind the health claims on this
                        page.
                      </Text>

                      <View style={styles.referencesList}>
                        {referenceItems.map((reference) => (
                          <ReferenceRow
                            key={reference.url}
                            reference={reference}
                            onPress={() => handleOpenReferenceUrl(reference.url)}
                          />
                        ))}
                      </View>

                      <View style={styles.referencesDisclaimer}>
                        <Ionicons
                          name="information-circle-outline"
                          size={16}
                          color={appTheme.colors.textStrong}
                          style={styles.referencesDisclaimerIcon}
                        />
                        <Text style={styles.referencesDisclaimerText}>
                          {REFERENCES_DISCLAIMER}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </PrimaryCard>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <VerifiedInfoModal
        visible={verifiedInfoVisible && isVerified}
        onClose={() => setVerifiedInfoVisible(false)}
      />

      <Animated.View
        pointerEvents="none"
        style={[styles.compactHeaderOverlay, collapsedHeaderStyle]}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.compactHeaderTitle}
        >
          {fallbackName}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: appTheme.screen.background,
  },
  compactHeaderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: appTheme.screen.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSubtle,
    paddingHorizontal: appTheme.screen.sidePadding,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: "center",
  },
  compactHeaderTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  notRecognizedScreenRoot: {
    backgroundColor: "transparent",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  scrollInner: {
    position: "relative",
  },
  headerBlock: {
    marginBottom: 18,
    paddingTop: 42,
    paddingRight: 46,
  },
  headerBlockActiveIngredient: {
    paddingTop: 12,
  },
  favouriteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F1F1",
  },
  favouriteButtonScroll: {
    position: "absolute",
    right: -4,
    zIndex: 10,
  },
  favouriteButtonActive: {
    backgroundColor: "#E8E8E8",
  },
  closeButton: {
    position: "absolute",
    right: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F1F1",
    zIndex: 10,
  },
  closeButtonScroll: {
    top: 0,
    right: -4,
  },
  closeButtonPressed: {
    opacity: 0.72,
  },
  toastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(23,21,27,0.92)",
    shadowColor: "#1A1820",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  toastText: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#FFFFFF",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingTop: 2,
  },
  productImageFrame: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  productImage: {
    width: 54,
    height: 54,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  titleTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  titleTextGroupInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeIngredientPageLabel: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    marginTop: 38,
  },
  activeIngredientPageLabelText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  titleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    flexShrink: 0,
  },
  pageTitle: {
    flexShrink: 1,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textPrimary,
  },
  verifiedBadgeButton: {
    marginLeft: 6,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedBadgeButtonInline: {
    marginLeft: 0,
    flexShrink: 0,
  },
  verifiedBadgeButtonPressed: {
    opacity: 0.72,
  },
  headerActionsContainer: {
    gap: 8,
    marginTop: 16,
    marginRight: -46,
  },
  headerActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  headerAction: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  headerActionCompact: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 11,
  },
  headerActionAccent: {
    alignSelf: "flex-start",
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowColor: "#3A5480",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerActionAccentCompact: {
    borderRadius: 11,
  },
  headerActionAccentGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 7,
  },
  headerActionAccentGradientCompact: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 11,
    gap: 6,
  },
  headerActionAccentText: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#FFFFFF",
  },
  headerActionAccentTextCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  headerActionPressed: {
    opacity: 0.72,
  },
  headerActionDisabled: {
    opacity: 0.45,
  },
  headerActionText: {
    marginLeft: 6,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  headerActionTextCompact: {
    marginLeft: 5,
    fontSize: 12,
    lineHeight: 15,
  },
  loadingCard: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  summaryCard: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 16,
    marginBottom: 14,
  },
  summaryCardActiveIngredient: {
    paddingTop: 18,
  },
  summaryCardNotRecognized: {
    minHeight: 360,
    marginTop: 120,
    paddingHorizontal: 28,
    paddingTop: 44,
    paddingBottom: 40,
    borderRadius: 28,
    justifyContent: "center",
  },
  summaryCardNotRecognizedPopup: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    marginTop: 0,
    marginBottom: 0,
  },
  scoreAdjustmentNote: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  referenceNoteWrap: {
    marginTop: 12,
    alignItems: "center",
  },
  referenceNoteText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  referenceNoteButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F3E5E8",
  },
  referenceNoteButtonPressed: {
    opacity: 0.72,
  },
  referenceNoteButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
    textDecorationLine: "underline",
  },
  gaugeWrap: {
    width: EVIDENCE_GAUGE_WIDTH,
    height: EVIDENCE_GAUGE_FRAME_HEIGHT,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  gaugeTextWrap: {
    position: "absolute",
    top: 58,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  gaugeEyebrow: {
    fontSize: 14,
    lineHeight: 17,
    fontFamily: typography.fontFamily.headingSemiBold,
    textAlign: "center",
  },
  gaugeValue: {
    marginTop: 10,
    fontSize: 32,
    lineHeight: 34,
    fontFamily: typography.fontFamily.headingBlack,
    textAlign: "center",
  },
  gaugeValueUnavailable: {
    fontSize: 26,
    lineHeight: 28,
  },
  activeIngredientSummaryHeader: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  evidenceScorePill: {
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceScoreLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  evidenceScoreValue: {
    marginTop: 3,
    fontSize: 36,
    lineHeight: 39,
    fontFamily: typography.fontFamily.headingBlack,
    textAlign: "center",
  },
  evidenceScoreValueUnavailable: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  benefitHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingRight: 18,
  },
  benefitHeaderRightGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  benefitHeaderText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  benefitHeaderHelpButton: {
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitHeaderHelpButtonPressed: {
    opacity: 0.72,
  },
  benefitHeaderTooltipWrap: {
    position: "relative",
    alignSelf: "flex-end",
    width: 264,
    maxWidth: "100%",
    marginTop: 6,
    marginBottom: 8,
    marginRight: 2,
    zIndex: 4,
  },
  benefitHeaderTooltipArrow: {
    position: "absolute",
    top: -5,
    right: 18,
    width: 10,
    height: 10,
    backgroundColor: appTheme.colors.textPrimary,
    transform: [{ rotate: "45deg" }],
    borderRadius: 2,
  },
  benefitList: {
    gap: 2,
  },
  benefitGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 4,
  },
  benefitGridCard: {
    width: "48.4%",
    minHeight: 126,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#F8F8FA",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  benefitGridCardOpen: {
    width: "100%",
    minHeight: 0,
    backgroundColor: appTheme.colors.surface,
  },
  benefitGridCardDimmed: {
    opacity: 0.42,
  },
  benefitGridCardPressed: {
    opacity: 0.82,
  },
  benefitGridCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  benefitGridMedalWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  benefitGridMedalPlaceholder: {
    width: 34,
    height: 34,
  },
  benefitGridCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  benefitGridLabel: {
    minHeight: 36,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  benefitGridMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  benefitGridActionRow: {
    width: "100%",
  },
  benefitRow: {
    paddingVertical: 8,
    borderRadius: 16,
  },
  benefitRowOpen: {
    paddingBottom: 6,
  },
  benefitRowDimmed: {
    opacity: 0.42,
  },
  benefitRowPressed: {
    opacity: 0.82,
  },
  benefitRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  benefitRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  benefitIconWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitCopy: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  benefitLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  benefitMeta: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  benefitRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    width: 74,
  },
  benefitRightCompact: {
    width: "auto",
  },
  rankingMedalWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 35,
  },
  rankingMedalDimmed: {
    opacity: 0.82,
  },
  rankingBarTrack: {
    width: 40,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginRight: 10,
  },
  rankingBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  rankingBarFillDimmed: {
    opacity: 0.82,
  },
  expandedEvidenceWrap: {
    marginTop: 14,
    gap: 8,
  },
  evidenceSnippetCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 14,
    backgroundColor: "#F2F2F7",
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
  },
  evidenceSnippetIcon: {
    marginTop: 1,
    marginRight: 10,
  },
  evidenceSnippetText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textStrong,
    marginRight: 10,
  },
  benefitCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: "#F3E5E8",
    marginTop: 2,
  },
  benefitCtaPressed: {
    opacity: 0.72,
  },
  benefitCtaText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
    marginRight: 8,
  },
  moreBenefitsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  moreBenefitsRowPressed: {
    opacity: 0.72,
  },
  moreBenefitsText: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  emptyBenefitText: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  emptyIngredientText: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  scanFailureState: {
    marginTop: 18,
    gap: 14,
  },
  scanFailureStateNotRecognized: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginTop: 0,
  },
  scanFailureTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  scanFailureBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  scanFailureBodyCentered: {
    textAlign: "center",
  },
  scanFailureBodyNotRecognized: {
    fontSize: 24,
    lineHeight: 32,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
  },
  scanFailureActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  scanFailureActionsCentered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scanFailureActionsStacked: {
    alignItems: "center",
    justifyContent: "center",
  },
  scanFailurePrimaryButton: {
    minWidth: 240,
    minHeight: 56,
  },
  scanFailurePrimaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scanFailurePrimaryButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scanFailurePrimaryButtonIcon: {
    marginRight: 8,
  },
  scanFailurePrimaryButtonText: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: "#FFFFFF",
  },
  closeButtonPopup: {
    top: 18,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F4F4F4",
    zIndex: 2,
  },
  ingredientsSection: {
    marginTop: 20,
  },
  ingredientsSectionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
    marginBottom: 10,
  },
  ingredientsList: {
    backgroundColor: appTheme.colors.surface,
  },
  ingredientRow: {
    minHeight: 54,
    paddingHorizontal: 2,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  ingredientRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  ingredientRowPressed: {
    opacity: 0.72,
  },
  ingredientCopy: {
    flex: 1,
    minWidth: 0,
  },
  ingredientTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 4,
  },
  ingredientTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  ingredientDoseInline: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  doseUnverifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(239,197,82,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,197,82,0.4)",
  },
  doseUnverifiedIcon: {
    marginRight: 3,
  },
  doseUnverifiedText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#7A6010",
  },
  ingredientMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  ingredientDoseStatus: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  ingredientDoseSummary: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  doseStatusBlock: {
    marginTop: 5,
    alignSelf: "stretch",
  },
  doseStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  doseStatusPillPressed: {
    opacity: 0.7,
  },
  doseStatusWarningIcon: {
    marginRight: 1,
  },
  doseStatusInfoIcon: {
    marginLeft: 1,
  },
  doseStatusPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  doseTooltip: {
    marginTop: 6,
    backgroundColor: appTheme.colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "100%",
  },
  doseTooltipContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  doseTooltipArrow: {
    position: "absolute",
    top: -5,
    left: 14,
    width: 10,
    height: 10,
    backgroundColor: appTheme.colors.textPrimary,
    transform: [{ rotate: "45deg" }],
    borderRadius: 2,
  },
  doseTooltipIcon: {
    marginTop: 1,
    marginRight: 6,
  },
  doseTooltipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: "#FFFFFF",
  },
  detailCard: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 14,
  },
  detailCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  detailCardTitle: {
    marginLeft: 8,
    fontSize: 17,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  detailCardBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  detailCardBodyBlocks: {
    gap: 14,
  },
  detailCardBodyBlock: {
    gap: 8,
  },
  detailCardBodyBlockDivider: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
    paddingBottom: 14,
  },
  detailCardToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailCardToggleRowPressed: {
    opacity: 0.72,
  },
  detailCardExpandedBody: {
    gap: 8,
  },
  detailCardBodyHeading: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  detailCardLinkWrap: {
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "rgba(92,63,168,0.12)",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  detailCardLinkWrapPressed: {
    opacity: 0.72,
  },
  detailCardLinkText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.metrics.duration.accent,
    textDecorationLine: "underline",
  },
  referencesCard: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 14,
  },
  referencesHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  referencesHeaderButtonPressed: {
    opacity: 0.72,
  },
  referencesHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  referencesHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  referencesTitle: {
    marginLeft: 8,
    fontSize: 17,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  referencesHeaderMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  referencesIntro: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  referencesList: {
    marginTop: 14,
    gap: 10,
  },
  referenceRow: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#F8F8FA",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  referenceRowPressed: {
    opacity: 0.72,
  },
  referenceBenefitLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  referenceTitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  referenceMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  referenceUrlRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
  },
  referenceUrlIcon: {
    marginTop: 1,
    marginRight: 8,
  },
  referenceUrlText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
    textDecorationLine: "underline",
  },
  referencesDisclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#F6EFE9",
  },
  referencesDisclaimerIcon: {
    marginTop: 1,
    marginRight: 8,
  },
  referencesDisclaimerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textStrong,
  },
  verifiedModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  verifiedModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20,20,20,0.22)",
  },
  verifiedSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 30,
    paddingBottom: 50,
  },
  verifiedSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  verifiedSheetTitle: {
    marginLeft: 14,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textPrimary,
  },
  verifiedSheetBody: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textPrimary,
    marginBottom: 18,
  },
  verifiedSheetButtonWrap: {
    marginTop: 6,
  },
  verifiedSheetButtonPressed: {
    opacity: 0.72,
  },
  verifiedSheetButton: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  verifiedSheetButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
