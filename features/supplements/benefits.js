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
  const leftRank = BENEFIT_RANK[left?.icon] ?? Number.MAX_SAFE_INTEGER;
  const rightRank = BENEFIT_RANK[right?.icon] ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
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

export function buildBenefitRankings(benefits, rankingRows) {
  const groupedRows = (rankingRows ?? []).reduce((accumulator, row) => {
    if (!row?.label || !Number.isFinite(row?.score)) return accumulator;
    if (!accumulator[row.label]) accumulator[row.label] = [];
    accumulator[row.label].push(row.score);
    return accumulator;
  }, {});

  return benefits.reduce((accumulator, benefit) => {
    const score = getBenefitScore(benefit);
    const scoresForLabel = groupedRows[benefit.label] ?? [];

    if (!Number.isFinite(score) || scoresForLabel.length === 0) {
      accumulator[benefit.id] = null;
      return accumulator;
    }

    const higherScores = scoresForLabel.filter((value) => value > score).length;
    accumulator[benefit.id] = {
      rank: higherScores + 1,
      total: scoresForLabel.length,
      score,
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

  const sortedRows = normalizedRows.slice().sort((left, right) => {
    const leftScore = left.benefitScore ?? -1;
    const rightScore = right.benefitScore ?? -1;

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const leftTone = BENEFIT_RANK[left.benefit?.icon] ?? Number.MAX_SAFE_INTEGER;
    const rightTone =
      BENEFIT_RANK[right.benefit?.icon] ?? Number.MAX_SAFE_INTEGER;

    if (leftTone !== rightTone) {
      return leftTone - rightTone;
    }

    const leftEvidence = left.evidenceScore ?? -1;
    const rightEvidence = right.evidenceScore ?? -1;

    if (leftEvidence !== rightEvidence) {
      return rightEvidence - leftEvidence;
    }

    return String(left.name).localeCompare(String(right.name));
  });

  const allScores = sortedRows
    .map((row) => row.benefitScore)
    .filter((score) => Number.isFinite(score));

  return sortedRows.map((row) => ({
    ...row,
    rank: Number.isFinite(row.benefitScore)
      ? allScores.filter((score) => score > row.benefitScore).length + 1
      : null,
    total,
  }));
}
