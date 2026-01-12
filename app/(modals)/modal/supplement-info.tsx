import React, { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, gradients } from "@/theme";
import { metalGradients, type MetalGradient } from "@/utils/metalStyles";
import { getSupplementById } from "@src/data/getSupplement";
import type { SupplementWithBenefits } from "@src/types/supplements";
import type { SvgProps } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MedalIcon from "@/assets/icons/supplements/medal.svg";
import { getRatingStyle } from "@/utils/ratingStyles";
import HappyIcon from "@/assets/icons/supplements/happy.svg";
import NeutralIcon from "@/assets/icons/supplements/neutral.svg";
import SadIcon from "@/assets/icons/supplements/sad.svg";
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

const BENEFIT_ICON_MAP: Record<string, ComponentType<SvgProps>> = {
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

const BENEFIT_ICON_NUDGE: Record<string, number> = {
  "Bone health": 2,
  "Joint health": 4,
  "Immune health": 2,
};
const SOLID_METAL_COLORS = {
  gold: metalGradients.gold[1],
  silver: metalGradients.silver[1],
  bronze: metalGradients.bronze[1],
};
const HEART_STORE_KEY = "supplement-heart-flags";

/* ---------------- Screen ---------------- */

export default function SupplementInfoModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [data, setData] = useState<SupplementWithBenefits | null>(null);

  useEffect(() => {
    if (!id) return;
    getSupplementById(id).then(setData);
  }, [id]);

  const rating = data?.evidence_score ?? 0;
  const ratingStyle = getRatingStyle(rating);
  const RatingIcon =
    rating < 50 ? SadIcon : rating < 75 ? NeutralIcon : HappyIcon;
  const [hearted, setHearted] = useState(false);

  useEffect(() => {
    setHearted(false);
    let isActive = true;
    if (!data?.id) return;

    AsyncStorage.getItem(HEART_STORE_KEY)
      .then((raw) => {
        if (!isActive) return;
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Record<string, boolean>;
          setHearted(Boolean(parsed[data.id]));
        } catch (err) {
          console.error("Failed to parse heart storage", err);
        }
      })
      .catch((err) => console.error("Failed to load heart state", err));

    return () => {
      isActive = false;
    };
  }, [data?.id]);

  const benefits = useMemo(() => data?.supplement_benefits ?? [], [data]);

  const handleHeartPress = () => {
    if (!data?.id) return;

    setHearted((prev) => {
      const next = !prev;

      AsyncStorage.getItem(HEART_STORE_KEY)
        .then((raw) => {
          let parsed: Record<string, boolean> = {};
          if (raw) {
            try {
              parsed = JSON.parse(raw) as Record<string, boolean>;
            } catch (err) {
              console.error("Failed to parse heart storage", err);
            }
          }

          if (next) {
            parsed[data.id] = true;
          } else {
            delete parsed[data.id];
          }

          return AsyncStorage.setItem(
            HEART_STORE_KEY,
            JSON.stringify(parsed)
          ).catch((err) => console.error("Failed to persist heart", err));
        })
        .catch((err) => console.error("Failed to load heart state", err));

      return next;
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.headerBand}>
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>
              {(data?.name?.[0] ?? "S").toUpperCase()}
            </Text>
          </View>
          <Text style={styles.pageTitle}>{data?.name ?? "Supplement"}</Text>
        </View>
      </View>

      {/* Rating + Benefits Card */}
      <View style={styles.heroCard}>
        <LinearGradient
          colors={ratingStyle.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.scoreCard, { borderColor: ratingStyle.border }]}
        >
          <View style={styles.scoreCardRow}>
            <View style={styles.scoreIcon}>
              <RatingIcon width={48} height={48} />
            </View>
            <View style={styles.scoreValueWrap}>
              <Text style={styles.scoreText}>{rating} / 100</Text>
            </View>
            <Pressable
              onPress={handleHeartPress}
              style={styles.scoreIcon}
              hitSlop={8}
            >
              <View style={styles.heartBox}>
                <Text
                  style={[
                    styles.heart,
                    { color: hearted ? "#EF4444" : ratingStyle.gradient[0] },
                  ]}
                >
                  {hearted ? "♥" : "♡"}
                </Text>
              </View>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.metricRow}>
          {benefits.map((b) => (
            <Metric
              key={b.id}
              label={b.label}
              Icon={BENEFIT_ICON_MAP[b.label] ?? MedalIcon}
              color={
                b.icon === "gold"
                  ? SOLID_METAL_COLORS.gold
                  : b.icon === "silver"
                  ? SOLID_METAL_COLORS.silver
                  : SOLID_METAL_COLORS.bronze
              }
            />
          ))}
        </View>
      </View>

      <Pressable
        style={[
          styles.addButton,
          (!data?.id || !data?.name) && styles.addButtonDisabled,
        ]}
        onPress={() => {
          if (!data?.id || !data?.name) return;
          router.push({
            pathname: "/(modals)/modal/supplement",
            params: {
              newCatalogId: data.id,
              newCatalogName: data.name,
            },
          });
        }}
        disabled={!data?.id || !data?.name}
      >
        <LinearGradient
          colors={gradients.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.addButtonInner}
        >
          <Text style={styles.addButtonText}>+ Add to supplements</Text>
        </LinearGradient>
      </Pressable>

      {/* Info Sections */}
      <View style={styles.whiteCard}>
        <SectionRow label="What is it?" value={data?.what_is_it} />
        <SectionRow label="Why use it?" value={data?.why_use_it} />
        <SectionRow
          label="Risks & interactions"
          value={data?.risks_and_interactions}
        />
      </View>

      {/* Evidence */}
      <View style={styles.evidenceCard}>
        <View style={styles.evidenceHeaderRow}>
          <Text style={styles.evidenceHeading}>Evidence</Text>
          {/* <Text style={styles.chevron}>›</Text> */}
        </View>
        {benefits.length === 0 ? (
          <Text style={styles.emptyEvidence}>No evidence listed yet.</Text>
        ) : (
          benefits.map((b) => (
            <EvidenceRow
              key={b.id}
              label={b.label}
              Icon={BENEFIT_ICON_MAP[b.label] ?? MedalIcon}
              color={
                b.icon === "gold"
                  ? SOLID_METAL_COLORS.gold
                  : b.icon === "silver"
                  ? SOLID_METAL_COLORS.silver
                  : SOLID_METAL_COLORS.bronze
              }
            />
          ))
        )}
      </View>

      <Pressable onPress={() => router.back()} style={styles.closeButton}>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ---------------- Components ---------------- */

function Metric({
  label,
  color,
  Icon,
}: {
  label: string;
  color: string;
  Icon: ComponentType<SvgProps>;
}) {
  const nudge = BENEFIT_ICON_NUDGE[label] ?? 0;

  return (
    <View style={styles.metricItem}>
      <View style={styles.metricCircleWrapper}>
        <View style={[styles.metricCircle, { backgroundColor: color }]}>
          <Icon
            width={24}
            height={24}
            style={nudge ? { transform: [{ translateX: nudge }] } : undefined}
          />
        </View>
      </View>
      <View style={styles.metricLabelWrap}>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

function SectionRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const body = value?.trim() ? value : "—";
  const [open, setOpen] = useState(false);

  return (
    <Pressable
      onPress={() => setOpen((prev) => !prev)}
      style={styles.sectionRow}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionText}>{label}</Text>
        <Text style={styles.chevron}>{open ? "⌄" : "›"}</Text>
      </View>
      {open && <Text style={styles.sectionBody}>{body}</Text>}
    </Pressable>
  );
}

function EvidenceRow({
  label,
  color,
  Icon,
}: {
  label: string;
  color: string;
  Icon: ComponentType<SvgProps>;
}) {
  const nudge = BENEFIT_ICON_NUDGE[label] ?? 0;

  return (
    <View style={styles.evidenceRow}>
      <View style={styles.evidenceLeft}>
        <View style={[styles.evidenceBadge, { backgroundColor: color }]}>
          <Icon
            width={20}
            height={20}
            style={nudge ? { transform: [{ translateX: nudge }] } : undefined}
          />
        </View>
        <Text style={styles.evidenceText}>{label}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </View>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl * 2,
    backgroundColor: "#F4F5F7",
    flexGrow: 1,
  },

  headerBand: {
    backgroundColor: "#FFFFFF",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    marginHorizontal: -spacing.md,
    marginTop: -spacing.lg,
    alignItems: "flex-start",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
  },

  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
  },

  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  scoreCard: {
    borderRadius: 18,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    opacity: 0.8,
  },

  scoreCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  scoreIcon: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
  },

  scoreValueWrap: {
    flex: 1,
    alignItems: "center",
  },

  scoreText: {
    fontSize: 38,
    fontWeight: "700",
    color: "#111",
  },

  heart: {
    fontSize: 22,
    fontWeight: "700",
  },

  heartBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingBottom: spacing.sm,
  },

  metricItem: {
    flexBasis: "30%",
    maxWidth: "30%",
    minWidth: 90,
    alignItems: "center",
    marginHorizontal: spacing.xs,
    marginVertical: spacing.xs,
  },

  metricCircleWrapper: {
    width: 52,
    height: 52,
    marginBottom: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },

  metricCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.75,
  },

  metricLabelWrap: {
    marginTop: -8,
    maxWidth: 64,
    minHeight: 18,
    alignItems: "center",
  },

  metricLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.text.secondary,
    textAlign: "center",
  },

  addButton: {
    marginTop: spacing.xs - 1,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: "hidden",
  },

  addButtonInner: {
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },

  addButtonDisabled: {
    opacity: 0.7,
  },

  addButtonText: {
    color: colors.text.inverse,
    fontSize: 16,
    fontWeight: "700",
  },

  whiteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  sectionRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border.subtle,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sectionText: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: "600",
  },

  chevron: {
    fontSize: 18,
    color: colors.text.secondary,
  },

  sectionBody: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: spacing.xs / 2,
    lineHeight: 20,
  },

  evidenceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#E8D9B0",
  },

  evidenceHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },

  evidenceHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#8A6A2F",
  },

  evidenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    alignItems: "center",
  },

  evidenceLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  evidenceBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  evidenceText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: spacing.sm,
  },

  emptyEvidence: {
    color: colors.text.secondary,
    fontSize: 14,
  },

  closeButton: {
    marginTop: spacing.xl,
    alignItems: "center",
  },

  closeText: {
    color: colors.text.muted,
  },
});
