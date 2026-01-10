import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing } from "@/theme";
import { metalGradients, type MetalGradient } from "@/utils/metalStyles";
import { getSupplementById } from "@src/data/getSupplement";
import type { SupplementWithBenefits } from "@src/types/supplements";
import MedalIcon from "@/assets/icons/supplements/medal.svg";
import { getRatingStyle } from "@/utils/ratingStyles";
import HappyIcon from "@/assets/icons/supplements/happy.svg";
import NeutralIcon from "@/assets/icons/supplements/neutral.svg";
import SadIcon from "@/assets/icons/supplements/sad.svg";

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

  const benefits = useMemo(() => data?.supplement_benefits ?? [], [data]);

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
            <View style={styles.scoreIcon}>
              <View style={styles.heartBox}>
                <Text
                  style={[styles.heart, { color: ratingStyle.gradient[0] }]}
                >
                  ♡
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.metricRow}>
          {benefits.map((b) => (
            <Metric
              key={b.id}
              label={b.label}
              gradient={
                b.icon === "gold"
                  ? metalGradients.gold
                  : b.icon === "silver"
                  ? metalGradients.silver
                  : metalGradients.bronze
              }
            />
          ))}
        </View>
      </View>

      {/* Info Sections */}
      <View style={styles.whiteCard}>
        <SectionRow label="What is it?" />
        <SectionRow label="Why use it?" />
        <SectionRow label="Risks & interactions" />
      </View>

      {/* Evidence */}
      <View style={styles.evidenceCard}>
        <View style={styles.evidenceHeaderRow}>
          <Text style={styles.evidenceHeading}>Evidence</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
        {benefits.length === 0 ? (
          <Text style={styles.emptyEvidence}>No evidence listed yet.</Text>
        ) : (
          benefits.map((b) => (
            <EvidenceRow
              key={b.id}
              label={b.label}
              gradient={
                b.icon === "gold"
                  ? metalGradients.gold
                  : b.icon === "silver"
                  ? metalGradients.silver
                  : metalGradients.bronze
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
  gradient,
}: {
  label: string;
  gradient: MetalGradient;
}) {
  return (
    <View style={styles.metricItem}>
      <View style={styles.metricCircleWrapper}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.metricCircle}
        />
        <MedalIcon width={26} height={26} style={styles.metricMedal} />
      </View>
      <View style={styles.metricLabelWrap}>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionText}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </View>
  );
}

function EvidenceRow({
  label,
  gradient,
}: {
  label: string;
  gradient: MetalGradient;
}) {
  return (
    <View style={styles.evidenceRow}>
      <View style={styles.evidenceLeft}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.evidenceBadge}
        >
          <MedalIcon width={20} height={20} />
        </LinearGradient>
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
    width: 56,
    height: 56,
    marginBottom: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },

  metricCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    alignItems: "center",
    justifyContent: "center",
  },

  metricMedal: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -13 }, { translateY: -13 }],
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
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border.subtle,
  },

  sectionText: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: "600",
  },

  chevron: {
    fontSize: 18,
    opacity: 0.4,
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
