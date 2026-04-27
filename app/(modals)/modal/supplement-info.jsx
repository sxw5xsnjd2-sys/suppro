import React, { useEffect, useMemo, useState } from "react";
import {
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
import ShieldTrustIcon from "@/assets/icons/shield-trust 1.svg";
import {
  buildScannedSupplementFailurePayload,
  buildScannedSupplementPayload,
} from "@/features/scanner/buildScannedSupplementPayload";
import { leaveTopLevelScanModal } from "@/features/scanner/navigation";
import { useScannerStore } from "@/features/scanner/store";
import {
  buildBenefitRankings,
  compareBenefits,
  getBenefitColor,
  getBenefitIconComponent,
  METAL_BADGE_GRADIENTS,
  METAL_BADGE_LOCATIONS,
} from "@/features/supplements/benefits";
import {
  CATALOG_TYPES,
  createSupplementProductCatalogId,
} from "@/features/supplements/catalog";
import { useSupplementsStore } from "@/features/supplements/store";
import { getTrackedScanMatchedIngredients } from "@/features/supplements/trackedScanContext";
import { appTheme, typography } from "@/theme";
import { getSupplementById } from "@src/data/getSupplement";
import { supabase } from "@src/lib/supabase";

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

function getBenefitRankingProgress(ranking) {
  const rank = Number(ranking?.rank);
  const total = Number(ranking?.total);

  if (!Number.isFinite(rank) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  if (rank <= 1) {
    return 1;
  }

  return Math.max(0, Math.min(1, (total - rank) / total));
}

function getSectionBody(value) {
  const body = typeof value === "string" ? value.trim() : "";
  return body || "No details listed yet.";
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

  const explicitLines = body
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean);

  if (explicitLines.length >= 2) {
    return explicitLines.slice(0, 3);
  }

  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 18);

  if (sentences.length >= 2) {
    return sentences.slice(0, 3);
  }

  return [body];
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
          Evidence Rating
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

function HeaderAction({ icon, label, onPress, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerAction,
        pressed && styles.headerActionPressed,
        disabled && styles.headerActionDisabled,
      ]}
    >
      <Ionicons name={icon} size={15} color={appTheme.colors.textStrong} />
      <Text style={styles.headerActionText}>{label}</Text>
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

function BenefitRankingBar({ ranking, dimmed = false }) {
  const progress = getBenefitRankingProgress(ranking);
  const gradient = METAL_BADGE_GRADIENTS[ranking?.icon];
  const locations = METAL_BADGE_LOCATIONS[ranking?.icon];
  const fillColor = getBenefitColor(ranking?.icon);
  const trackColor = `${fillColor}29`;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.rankingBarTrack,
        { backgroundColor: dimmed ? `${fillColor}1A` : trackColor },
      ]}
    >
      {gradient ? (
        <LinearGradient
          colors={gradient}
          locations={locations}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.rankingBarFill,
            dimmed && styles.rankingBarFillDimmed,
            { width: `${progress * 100}%` },
          ]}
        />
      ) : (
        <View
          style={[
            styles.rankingBarFill,
            { backgroundColor: dimmed ? `${fillColor}D1` : fillColor },
            { width: `${progress * 100}%` },
          ]}
        />
      )}
    </View>
  );
}

function DetailCard({ icon, title, body }) {
  return (
    <PrimaryCard style={styles.detailCard}>
      <View style={styles.detailCardHeader}>
        <Ionicons name={icon} size={18} color={appTheme.colors.textStrong} />
        <Text style={styles.detailCardTitle}>{title}</Text>
      </View>
      <Text style={styles.detailCardBody}>{body}</Text>
    </PrimaryCard>
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
            {showRanking ? (
              <Text style={styles.benefitMeta}>
                {getBenefitRankText(benefit, ranking)}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.benefitRight,
            !showRanking && styles.benefitRightCompact,
          ]}
        >
          {showRanking ? (
            <BenefitRankingBar ranking={ranking} dimmed={dimmed} />
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
              {`Go to ${String(benefit.label).toLowerCase()}`}
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
  const isLiveScanSource = source === "scanned";
  const isTrackedScannedSource = source === "tracked-scanned";
  const isScanStyledSource = isLiveScanSource || isTrackedScannedSource;
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
    let active = true;

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
    setVerifiedInfoVisible(false);

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

    const loadBenefitRankings = async () => {
      if (isScanStyledSource) {
        if (active) {
          setBenefitRankings({});
        }
        return;
      }

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
        .select("label, score, icon")
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
  }, [data?.supplement_benefits, isScanStyledSource]);

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

  const benefits = useMemo(
    () => [...(data?.supplement_benefits ?? [])].sort(compareBenefits),
    [data]
  );
  const matchedIngredients = useMemo(
    () => [...(data?.matchedIngredients ?? [])],
    [data]
  );

  const supplementEvidence =
    typeof data?.evidence === "string" && data.evidence.trim()
      ? data.evidence.trim()
      : "";
  const scoreAdjustmentSummary =
    typeof data?.score_adjustment_summary === "string" &&
    data.score_adjustment_summary.trim()
      ? data.score_adjustment_summary.trim()
      : "";
  const fallbackName =
    data?.name ??
    scannerProduct?.productName ??
    paramName ??
    (isScanStyledSource ? "Scanned supplement" : "Supplement");
  const isScanFailure = isLiveScanSource && Boolean(data?.scanFailureMessage);
  const isProductNotRecognizedFailure =
    isScanFailure && data?.scanFailureStatus === "not_found";
  const isVerified = Boolean(data?.verified);
  const canAddSupplement = Boolean(
    (!isScanFailure && isLiveScanSource && fallbackName) ||
      (!isScanStyledSource && data?.id && data?.name)
  );
  const canImproveScanWithPhotos = Boolean(
    isLiveScanSource && isCurrentScanSession
  );
  const showShareAction = !isScanFailure;
  const showRanking = !isScanStyledSource;
  const visibleBenefitCount = showAllBenefits ? benefits.length : 6;
  const visibleBenefits = benefits.slice(0, visibleBenefitCount);
  const hiddenBenefitCount = Math.max(benefits.length - visibleBenefitCount, 0);
  const isSupplementProductDetail =
    data?.catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT;
  const showIngredientsSection =
    !isScanFailure &&
    (matchedIngredients.length > 0 || isSupplementProductDetail);

  const detailCards = [
    {
      key: "how-to-use",
      icon: "information-circle-outline",
      title: "How to use",
      body: getSectionBody(data?.how_to_use),
    },
    {
      key: "what-is-it",
      icon: "search-outline",
      title: "What is it?",
      body: getSectionBody(data?.what_is_it),
    },
    {
      key: "why-use-it",
      icon: "star-outline",
      title: "Why use it?",
      body: getSectionBody(data?.why_use_it),
    },
    {
      key: "risks",
      icon: "sparkles-outline",
      title: "Risks & Interactions",
      body: getSectionBody(data?.risks_and_interactions),
    },
  ];

  const handleAddSupplement = () => {
    if (!canAddSupplement) return;

    if (isLiveScanSource) {
      if (data?.id && data?.catalogType) {
        router.push({
          pathname: "/(modals)/modal/supplement",
          params: {
            newCatalogId: data.id,
            newCatalogName: data.name || fallbackName,
            newCatalogType: data.catalogType,
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

  const handleClose = () => {
    if (isLiveScanSource) {
      leaveTopLevelScanModal();
      return;
    }

    router.back();
  };

  const handleOpenIngredient = (item) => {
    if (!item?.catalogId) {
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
    router.back();
  };

  const handleImproveScanWithPhotos = () => {
    if (!canImproveScanWithPhotos) {
      return;
    }

    router.push({
      pathname: "/scanner/photo-rescue",
      params: {
        scanSessionId: String(effectiveScanSessionId ?? ""),
      },
    });
  };

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

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 14,
            paddingBottom: Math.max(insets.bottom + 28, 36),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close supplement info"
            hitSlop={8}
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Ionicons
              name="close"
              size={18}
              color={appTheme.colors.textStrong}
            />
          </Pressable>

          {!isProductNotRecognizedFailure ? (
            <View style={styles.titleRow}>
              <Text style={styles.pageTitle}>{fallbackName}</Text>
              {isVerified ? (
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
              ) : null}
            </View>
          ) : null}

          {canAddSupplement ||
          showShareAction ||
          (canImproveScanWithPhotos && !isProductNotRecognizedFailure) ? (
            <View style={styles.headerActionsRow}>
              {canImproveScanWithPhotos && !isProductNotRecognizedFailure ? (
                <HeaderAction
                  icon="camera-outline"
                  label="Improve with photos"
                  onPress={handleImproveScanWithPhotos}
                />
              ) : null}
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
                isProductNotRecognizedFailure &&
                  styles.summaryCardNotRecognized,
              ]}
            >
              {!isProductNotRecognizedFailure ? (
                <EvidenceRatingGauge
                  value={displayedRating}
                  toneScore={rating}
                />
              ) : null}

              {!isScanFailure && scoreAdjustmentSummary ? (
                <Text style={styles.scoreAdjustmentNote}>
                  {scoreAdjustmentSummary}
                </Text>
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
                  {showRanking ? (
                    <View style={styles.benefitHeaderRow}>
                      <Text style={styles.benefitHeaderText}>Benefit</Text>
                      <Text style={styles.benefitHeaderText}>Ranking</Text>
                    </View>
                  ) : null}

                  <View style={styles.benefitList}>
                    {visibleBenefits.map((benefit) => {
                      const isOpen = openBenefitId === benefit.id;
                      const dimmed = Boolean(openBenefitId && !isOpen);

                      return (
                        <BenefitRow
                          key={benefit.id}
                          benefit={benefit}
                          ranking={benefitRankings[benefit.id] ?? null}
                          open={isOpen}
                          dimmed={dimmed}
                          supplementEvidence={supplementEvidence}
                          showRanking={showRanking}
                          onPress={() =>
                            setOpenBenefitId((current) =>
                              current === benefit.id ? null : benefit.id
                            )
                          }
                          onBenefitPress={() =>
                            router.push({
                              pathname: "/benefit-ranking",
                              params: { label: benefit.label },
                            })
                          }
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
                      {matchedIngredients.map((item, index) => {
                        const ingredientName = String(
                          item?.ingredientName ??
                            item?.catalogName ??
                            "Matched ingredient"
                        );
                        const dosageDisplay = String(
                          item?.dosageDisplay ?? ""
                        ).trim();
                        const catalogName = String(item?.catalogName ?? "");
                        const showCatalogName =
                          catalogName &&
                          catalogName.trim().toLowerCase() !==
                            ingredientName.trim().toLowerCase();
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
                              index < matchedIngredients.length - 1 &&
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
                              {showCatalogName ? (
                                <Text style={styles.ingredientMeta}>
                                  {catalogName}
                                </Text>
                              ) : null}
                              {item?.doseStatusLabel ? (
                                <Text style={styles.ingredientDoseStatus}>
                                  {item.doseStatusLabel}
                                </Text>
                              ) : null}
                              {item?.scoreAdjustmentSummary ? (
                                <Text style={styles.ingredientDoseSummary}>
                                  {item.scoreAdjustmentSummary}
                                </Text>
                              ) : null}
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
                    icon={section.icon}
                    title={section.title}
                    body={section.body}
                  />
                ))
              : null}
          </>
        ) : null}
      </ScrollView>

      <VerifiedInfoModal
        visible={verifiedInfoVisible && isVerified}
        onClose={() => setVerifiedInfoVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: appTheme.screen.background,
  },
  notRecognizedScreenRoot: {
    backgroundColor: "transparent",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  headerBlock: {
    position: "relative",
    paddingRight: 44,
    marginBottom: 18,
  },
  closeButton: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.52)",
  },
  closeButtonPressed: {
    opacity: 0.72,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 2,
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
  verifiedBadgeButtonPressed: {
    opacity: 0.72,
  },
  headerActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
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
  benefitHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 8,
    paddingRight: 18,
  },
  benefitHeaderText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  benefitList: {
    gap: 2,
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
    textTransform: "lowercase",
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
