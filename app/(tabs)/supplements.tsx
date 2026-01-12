import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { SupplementCard } from "@/features/supplements/components/SupplementCard";
import { colors, spacing } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { router } from "expo-router";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import { getRatingStyle } from "@/utils/ratingStyles";

/* ----------------------------------------
   Empty State
----------------------------------------- */

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No supplements added</Text>
      <Text style={styles.emptyText}>
        Add the supplements you currently take to get reminders and health
        insights.
      </Text>
    </View>
  );
}

/* ----------------------------------------
   Screen
----------------------------------------- */

export default function SupplementsScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const [ratingByCatalog, setRatingByCatalog] = useState<Record<string, number>>(
    {}
  );

  const sorted = [...supplements].sort((a, b) => a.timeMinutes - b.timeMinutes);

  const isEmpty = sorted.length === 0;

  useEffect(() => {
    let active = true;

    const catalogIds = Array.from(
      new Set(sorted.map((s) => s.catalogId).filter(Boolean))
    );

    if (catalogIds.length === 0) {
      setRatingByCatalog({});
      return;
    }

    getSupplementRatings(catalogIds).then((map) => {
      if (active) setRatingByCatalog(map);
    });

    return () => {
      active = false;
    };
  }, [sorted]);

  const iconColorFor = (catalogId?: string) => {
    if (!catalogId) return undefined;
    const score = ratingByCatalog[catalogId];
    if (typeof score !== "number") return undefined;
    return getRatingStyle(score).gradient[0];
  };

  return (
    <Screen
      header={
        <Header
          title="Supplements"
          subtitle="What you’re currently taking"
          centered
        />
      }
    >
      <View style={styles.section}>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <View style={styles.list}>
            {sorted.map((s) => (
              <SupplementCard
                key={s.id}
                name={s.name}
                subtitle={s.dose ? `${s.dose} · ${s.time}` : s.time}
                route={s.route}
                iconBorderColor={iconColorFor(s.catalogId)}
                showCheckbox={false}
                onInfoPress={() =>
                  router.push({
                    pathname: "/modal/supplement-info",
                    params: { id: s.catalogId },
                  })
                }
                onPress={() =>
                  router.push({
                    pathname: "/modal/supplement",
                    params: { id: s.id },
                  })
                }
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

/* ----------------------------------------
   Styles
----------------------------------------- */

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },

  list: {
    gap: spacing.xs,
  },

  empty: {
    marginTop: -spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },

  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
});
