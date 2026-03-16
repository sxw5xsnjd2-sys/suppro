import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  PrimaryCard,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { supabase } from "@src/lib/supabase";

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

function BenefitListItem({ item, showBorder }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={`Open supplement rankings for ${item.label}.`}
      onPress={() =>
        router.push({
          pathname: "/benefit-ranking",
          params: { label: item.label },
        })
      }
      style={({ pressed }) => [
        styles.benefitItem,
        showBorder && styles.benefitItemBorder,
        pressed && styles.benefitItemPressed,
      ]}
    >
      <View style={styles.benefitLeft}>
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

export default function SupplementRankingsScreen() {
  const [benefits, setBenefits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadBenefits = async () => {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("supplements")
        .select("supplement_benefits(label, icon)")
        .eq("status", "approved");

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
  }, []);

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
          title="Supplement Rankings"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Browse benefits alphabetically and open ranked supplements for each one
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      {loading ? (
        <PrimaryCard style={styles.stateCard}>
          <Text style={styles.stateText}>Loading ranked benefits...</Text>
        </PrimaryCard>
      ) : null}

      {!loading && errorMessage ? (
        <EmptyStateCard
          title="Rankings unavailable"
          description={errorMessage}
        />
      ) : null}

      {!loading && !errorMessage && benefits.length === 0 ? (
        <EmptyStateCard
          title="No ranked benefits"
          description="No approved supplement benefits are available yet."
        />
      ) : null}

      {!loading && !errorMessage && benefits.length > 0 ? (
        <PrimaryCard style={styles.listCard}>
          {benefits.map((item, index) => (
            <BenefitListItem
              key={item.label}
              item={item}
              showBorder={index < benefits.length - 1}
            />
          ))}
        </PrimaryCard>
      ) : null}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    marginRight: spacing.md,
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
  listCard: {
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
