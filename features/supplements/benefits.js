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
import { appTheme } from "@/theme";
import {
  calculateProductBenefitScore as calculateCanonicalProductBenefitScore,
  formatProductBenefitScoreText as formatCanonicalProductBenefitScoreText,
  formatProductBenefitScoreValue as formatCanonicalProductBenefitScoreValue,
  getProductBenefitScoreProgress as getCanonicalProductBenefitScoreProgress,
  selectProductBenefitDriver as selectCanonicalProductBenefitDriver,
} from "@/features/supplements/productBenefitScoring";

export const BENEFIT_ICON_MAP = {
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

export const BENEFIT_ICON_NUDGE = {
  "Bone health": 2,
  "Joint health": 4,
  "Immune health": 2,
};

export const SOLID_METAL_COLORS = {
  gold: appTheme.colors.evidenceBadge,
  silver: "#A9B4C7",
  bronze: "#C96B27",
};

const GOLD_SHEEN_LOCATIONS = [0.30985, 0.47574, 0.63187, 0.7392, 0.81727];

export const METAL_BADGE_GRADIENTS = {
  gold: appTheme.gradients.evidenceBadge,
  silver: ["#DCE4EF", "#EEF3F9", "#F7FAFE", "#D7E0EB", "#B4C0D0"],
  bronze: ["#D99B67", "#E7B88D", "#F3D8BE", "#C9844C", "#B06831"],
};

export const BENEFIT_RANK = {
  gold: 0,
  silver: 1,
  bronze: 2,
};

export const METAL_BADGE_LOCATIONS = {
  gold: GOLD_SHEEN_LOCATIONS,
  silver: [0.18, 0.38, 0.52, 0.72, 0.92],
  bronze: [0.18, 0.4, 0.54, 0.74, 0.92],
};

export function getBenefitIconComponent(label) {
  return BENEFIT_ICON_MAP[label] ?? MedalIcon;
}

export function compareBenefits(left, right) {
  const leftScore = getBenefitScore(left);
  const rightScore = getBenefitScore(right);

  const leftDotCount = !Number.isFinite(leftScore)
    ? 0
    : leftScore >= 75
    ? 3
    : leftScore >= 50
    ? 2
    : 1;
  const rightDotCount = !Number.isFinite(rightScore)
    ? 0
    : rightScore >= 75
    ? 3
    : rightScore >= 50
    ? 2
    : 1;

  if (leftDotCount !== rightDotCount) {
    return rightDotCount - leftDotCount;
  }

  if (leftScore !== rightScore) {
    return (rightScore ?? -1) - (leftScore ?? -1);
  }

  return String(left?.label ?? "").localeCompare(String(right?.label ?? ""));
}

export function getBenefitColor(icon) {
  return SOLID_METAL_COLORS[icon] ?? appTheme.colors.iconSurfaceMuted;
}

export function getBenefitScore(benefit) {
  const candidates = [
    benefit?.score,
    benefit?.benefit_score,
    benefit?.evidence_score,
    benefit?.ranking_score,
  ];

  const numeric = candidates.find((value) => Number.isFinite(value));
  return Number.isFinite(numeric) ? numeric : null;
}

export function calculateProductBenefitScore({
  rawActiveIngredientBenefitScore,
  validatedDoseFactor,
  doseComparisonStatus,
  doseComparisonValid,
}) {
  return calculateCanonicalProductBenefitScore({
    rawActiveIngredientBenefitScore,
    validatedDoseFactor,
    doseComparisonStatus,
    doseComparisonValid,
  });
}

export function formatProductBenefitScoreText(productBenefitScore) {
  return formatCanonicalProductBenefitScoreText(productBenefitScore);
}

export function formatProductBenefitScoreValue(productBenefitScore) {
  return formatCanonicalProductBenefitScoreValue(productBenefitScore);
}

export function getProductBenefitScoreProgress(productBenefitScore) {
  return getCanonicalProductBenefitScoreProgress(productBenefitScore);
}

export function selectProductBenefitDriver(ingredientDrivers) {
  return selectCanonicalProductBenefitDriver(ingredientDrivers);
}

export function getProductDetailBenefitDriver(benefit) {
  const driverCandidates = Array.isArray(benefit?.productBenefitDrivers)
    ? benefit.productBenefitDrivers
    : Array.isArray(benefit?.scanSupportDrivers)
    ? benefit.scanSupportDrivers
    : [];
  const selectedDriver =
    benefit?.productBenefitDriver ?? benefit?.scanSupportDriver ?? null;

  return selectProductBenefitDriver([
    ...driverCandidates,
    ...(selectedDriver ? [selectedDriver] : []),
  ]);
}

export function getProductDetailBenefitContributors(benefit) {
  const driverCandidates = Array.isArray(benefit?.productBenefitDrivers)
    ? benefit.productBenefitDrivers
    : Array.isArray(benefit?.scanSupportDrivers)
    ? benefit.scanSupportDrivers
    : [];
  const selectedDriver =
    benefit?.productBenefitDriver ?? benefit?.scanSupportDriver ?? null;
  const contributors = [];
  const seen = new Set();

  [...driverCandidates, ...(selectedDriver ? [selectedDriver] : [])].forEach(
    (driver) => {
      const hasBenefitStudy =
        driver?.hasBenefitStudy === true ||
        (Array.isArray(driver?.benefitEvidenceSourceUrls) &&
          driver.benefitEvidenceSourceUrls.length > 0) ||
        (Array.isArray(driver?.evidenceSourceUrls) &&
          driver.evidenceSourceUrls.length > 0) ||
        (Array.isArray(driver?.referenceItems) &&
          driver.referenceItems.some((item) => String(item?.url ?? "").trim()));
      if (!hasBenefitStudy) return;

      const ingredientName = String(driver?.ingredientName ?? "")
        .trim()
        .replace(/\s+/g, " ");
      const identity =
        String(
          driver?.canonicalIngredientId ??
            driver?.catalogId ??
            ingredientName
        )
          .trim()
          .toLowerCase();
      if (!ingredientName || !identity || seen.has(identity)) return;
      seen.add(identity);
      contributors.push({
        canonicalIngredientId: driver?.canonicalIngredientId ?? null,
        ingredientName,
      });
    }
  );

  return contributors;
}

export function getProductDetailBenefitScore(benefit) {
  return getProductDetailBenefitDriver(benefit)?.productBenefitScore ?? null;
}

export function getProductDetailBenefitAccessibilityLabel(benefit) {
  const label = String(benefit?.label ?? "Benefit");
  const driver = getProductDetailBenefitDriver(benefit);
  const contributors = getProductDetailBenefitContributors(benefit);
  const score = driver?.productBenefitScore;

  if (!Number.isFinite(score)) {
    return `${label}, not rated`;
  }

  const contributorNames = contributors
    .map((contributor) => contributor.ingredientName)
    .join(", ");
  return `${label}, ${Math.round(score)} out of 100${
    contributorNames ? `, supported by ${contributorNames}` : ""
  }`;
}

export function compareProductDetailBenefits(left, right) {
  const leftScore = getProductDetailBenefitScore(left);
  const rightScore = getProductDetailBenefitScore(right);

  if (leftScore !== rightScore) {
    return (rightScore ?? -1) - (leftScore ?? -1);
  }

  return String(left?.label ?? "").localeCompare(String(right?.label ?? ""));
}

export function getScanBenefitSortScore(benefit) {
  const productBenefitScore = benefit?.scanSupportDriver?.productBenefitScore;

  if (Number.isFinite(productBenefitScore)) {
    return productBenefitScore;
  }

  return getBenefitScore(benefit);
}

/**
 * @deprecated Legacy percentile display semantics. Product detail must use the
 * canonical product-benefit helpers above.
 */
export function getScanBenefitDisplayScore(benefit, ranking = null) {
  const doseFactor = Number(benefit?.scanSupportDriver?.doseFactor);

  if (ranking && Number.isFinite(doseFactor)) {
    return getScanBenefitProgress(ranking, doseFactor);
  }

  return getScanBenefitSortScore(benefit);
}

/** @deprecated Legacy percentile ordering retained for compatibility only. */
export function compareScanBenefits(
  left,
  right,
  leftRanking = null,
  rightRanking = null
) {
  const leftScore = getScanBenefitDisplayScore(left, leftRanking);
  const rightScore = getScanBenefitDisplayScore(right, rightRanking);

  if (leftScore !== rightScore) {
    return (rightScore ?? -1) - (leftScore ?? -1);
  }

  const leftWeightedScore = getScanBenefitSortScore(left);
  const rightWeightedScore = getScanBenefitSortScore(right);

  if (leftWeightedScore !== rightWeightedScore) {
    return (rightWeightedScore ?? -1) - (leftWeightedScore ?? -1);
  }

  const leftRawScore =
    left?.scanSupportDriver?.rawActiveIngredientBenefitScore ??
    left?.scanSupportDriver?.benefitScore;
  const rightRawScore =
    right?.scanSupportDriver?.rawActiveIngredientBenefitScore ??
    right?.scanSupportDriver?.benefitScore;

  if (leftRawScore !== rightRawScore) {
    return (rightRawScore ?? -1) - (leftRawScore ?? -1);
  }

  return String(left?.label ?? "").localeCompare(String(right?.label ?? ""));
}

function getBenefitRankingSourceScore(benefit) {
  if (
    Number.isFinite(
      benefit?.scanSupportDriver?.rawActiveIngredientBenefitScore
    )
  ) {
    return benefit.scanSupportDriver.rawActiveIngredientBenefitScore;
  }

  if (Number.isFinite(benefit?.scanSupportDriver?.benefitScore)) {
    return benefit.scanSupportDriver.benefitScore;
  }

  return getBenefitScore(benefit);
}

/**
 * @deprecated Legacy rank-percentile progress. Do not use for product detail.
 */
export function getScanBenefitProgress(ranking, doseFactor) {
  const rank = Number(ranking?.rank);
  const total = Number(ranking?.total);
  const normalizedDoseFactor = Number(doseFactor);

  if (
    !Number.isFinite(rank) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isFinite(normalizedDoseFactor)
  ) {
    return 0;
  }

  const relativeRank = (total - rank + 1) / total;
  return Math.min(Math.max(relativeRank * normalizedDoseFactor, 0), 1);
}

function compareBenefitRankItems(left, right) {
  const leftTone = BENEFIT_RANK[left?.icon] ?? Number.MAX_SAFE_INTEGER;
  const rightTone = BENEFIT_RANK[right?.icon] ?? Number.MAX_SAFE_INTEGER;

  if (leftTone !== rightTone) {
    return leftTone - rightTone;
  }

  const leftScore = Number.isFinite(left?.score) ? left.score : -1;
  const rightScore = Number.isFinite(right?.score) ? right.score : -1;

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const leftEvidence = Number.isFinite(left?.evidenceScore)
    ? left.evidenceScore
    : -1;
  const rightEvidence = Number.isFinite(right?.evidenceScore)
    ? right.evidenceScore
    : -1;

  if (leftEvidence !== rightEvidence) {
    return rightEvidence - leftEvidence;
  }

  return String(left?.name ?? "").localeCompare(String(right?.name ?? ""));
}

export function buildBenefitRankings(benefits, rankingRows) {
  const groupedRows = (rankingRows ?? []).reduce((accumulator, row) => {
    if (!row?.label || !Number.isFinite(row?.score)) return accumulator;
    if (!accumulator[row.label]) accumulator[row.label] = [];
    accumulator[row.label].push({
      score: row.score,
      icon: row.icon ?? null,
      evidenceScore: Number.isFinite(row?.evidence_score)
        ? row.evidence_score
        : null,
      name: row?.supplement_name ?? "",
    });
    return accumulator;
  }, {});

  const rankedRowsByLabel = Object.fromEntries(
    Object.entries(groupedRows).map(([label, rows]) => [
      label,
      rows.slice().sort(compareBenefitRankItems),
    ])
  );

  return benefits.reduce((accumulator, benefit) => {
    const score = getBenefitRankingSourceScore(benefit);
    const icon = benefit?.icon ?? null;
    const rowsForLabel = rankedRowsByLabel[benefit.label] ?? [];

    if (!Number.isFinite(score) || rowsForLabel.length === 0) {
      accumulator[benefit.id] = null;
      return accumulator;
    }

    const rankIndex = rowsForLabel.findIndex(
      (row) => row.score === score && (row.icon ?? null) === icon
    );

    const fallbackRankIndex = rowsForLabel.findIndex((row) => row.score === score);
    const resolvedRankIndex = rankIndex >= 0 ? rankIndex : fallbackRankIndex;

    accumulator[benefit.id] = {
      rank: resolvedRankIndex >= 0 ? resolvedRankIndex + 1 : null,
      total: rowsForLabel.length,
      score,
      icon: icon ?? rowsForLabel[resolvedRankIndex]?.icon ?? null,
    };
    return accumulator;
  }, {});
}

export function getBenefitToneLabel(icon) {
  if (icon === "gold") return "Gold";
  if (icon === "silver") return "Silver";
  if (icon === "bronze") return "Bronze";
  return "Unranked";
}

export function buildRankedBenefitSupplements(rows) {
  const normalizedRows = (rows ?? [])
    .map((row) => {
      const benefit = Array.isArray(row?.supplement_benefits)
        ? row.supplement_benefits.find((item) => item?.label)
        : null;
      const fallbackName =
        typeof benefit?.supplement_name === "string"
          ? benefit.supplement_name.trim()
          : "";
      const displayName =
        typeof row?.name === "string" && row.name.trim()
          ? row.name.trim()
          : fallbackName || "Supplement";

      return {
        id: row?.id ?? null,
        name: displayName,
        evidenceScore: Number.isFinite(row?.evidence_score)
          ? row.evidence_score
          : null,
        benefit,
        benefitScore: getBenefitScore(benefit),
      };
    })
    .filter((row) => row.id && row.benefit?.label);

  const total = normalizedRows.length;

  const sortedRows = normalizedRows.slice().sort((left, right) =>
    compareBenefitRankItems(
      {
        icon: left.benefit?.icon,
        score: left.benefitScore,
        evidenceScore: left.evidenceScore,
        name: left.name,
      },
      {
        icon: right.benefit?.icon,
        score: right.benefitScore,
        evidenceScore: right.evidenceScore,
        name: right.name,
      }
    )
  );

  return sortedRows.map((row, index) => ({
    ...row,
    rank: Number.isFinite(row.benefitScore) ? index + 1 : null,
    total,
  }));
}
