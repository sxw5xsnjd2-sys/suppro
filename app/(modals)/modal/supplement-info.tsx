import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing } from "@/theme";
import { metalGradients } from "@/utils/metalStyles";
import { getSupplementById } from "@src/data/getSupplement";
import type { SupplementWithBenefits } from "@src/types/supplements";

/* ---------------- Helpers ---------------- */

const getTier = (score: number) => {
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped <= 33) return "bronze";
  if (clamped <= 66) return "silver";
  return "gold";
};

/* ---------------- Screen ---------------- */

export default function SupplementInfoModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<SupplementWithBenefits | null>(null);

  useEffect(() => {
    if (!id) return;
    getSupplementById(id).then(setData);
  }, [id]);

  const rating = data?.evidence_score ?? 0;
  const tier = getTier(rating);

  const benefits = useMemo(() => data?.supplement_benefits ?? [], [data]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{data?.name ?? "Supplement"}</Text>
      </View>

      {/* Score Card */}
      <LinearGradient
        colors={metalGradients[tier]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.scoreCard}
      >
        <Text style={styles.scoreText}>{rating} / 100</Text>
      </LinearGradient>

      {/* Dynamic Metrics */}
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

      {/* Info Rows */}
      <SectionRow label="What is it?" />
      <SectionRow label="Why use it?" />
      <SectionRow label="Risks / interactions?" />

      {/* Evidence */}
      <View style={styles.evidenceBox}>
        <Text style={styles.evidenceTitle}>Evidence</Text>
        <EvidenceRow label={data?.evidence ?? "No evidence summary yet"} />
      </View>

      {/* Close */}
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
  gradient: readonly string[];
}) {
  return (
    <View style={styles.metricItem}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.metricCircle}
      />
      <Text style={styles.metricLabel}>{label}</Text>
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

function EvidenceRow({ label }: { label: string }) {
  return (
    <View style={styles.evidenceRow}>
      <Text style={styles.evidenceText}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </View>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background.app,
  },

  header: {
    marginBottom: spacing.lg,
  },

  title: {
    fontSize: 22,
    fontWeight: "600",
  },

  scoreCard: {
    borderRadius: 16,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },

  scoreText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111",
  },

  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },

  metricItem: {
    flex: 1,
    alignItems: "center",
  },

  metricCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  metricLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
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
  },

  chevron: {
    fontSize: 18,
    opacity: 0.4,
  },

  evidenceBox: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderColor: colors.border.subtle,
  },

  evidenceTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },

  evidenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },

  evidenceText: {
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
