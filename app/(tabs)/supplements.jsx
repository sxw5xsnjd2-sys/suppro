import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { SupplementCard } from "@/features/supplements/components/SupplementCard";
import { colors, spacing, radius, shadows } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import { getRatingStyle } from "@/utils/ratingStyles";

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No supplements added</Text>
      <Text style={styles.emptyText}>Add your stack to manage dosage and schedule reminders.</Text>
    </View>
  );
}

export default function SupplementsScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const [ratingByCatalog, setRatingByCatalog] = useState({});
  const sorted = [...supplements].sort((a, b) => a.timeMinutes - b.timeMinutes);

  useEffect(() => {
    let active = true;
    const catalogIds = Array.from(new Set(sorted.map((s) => s.catalogId).filter(Boolean)));
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

  const iconColorFor = (catalogId) => {
    if (!catalogId) return undefined;
    const score = ratingByCatalog[catalogId];
    if (typeof score !== "number") return undefined;
    return getRatingStyle(score).gradient[0];
  };

  return (
    <Screen header={<Header title="Supplements" subtitle="Your complete stack" centered />}>
      <View style={styles.section}>
        <View style={styles.panel}>
          {sorted.length === 0 ? (
            <EmptyState />
          ) : (
            sorted.map((s) => (
              <SupplementCard
                key={s.id}
                name={s.name}
                subtitle={s.dose ? `${s.dose} · ${s.time}` : s.time}
                route={s.route}
                iconBackgroundColor={iconColorFor(s.catalogId)}
                showCheckbox={false}
                onInfoPress={() =>
                  router.push({
                    pathname: "/modal/supplement-info",
                    params: { id: s.catalogId, name: s.name },
                  })
                }
                onPress={() =>
                  router.push({
                    pathname: "/modal/supplement",
                    params: { id: s.id },
                  })
                }
              />
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  panel: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  empty: {
    padding: spacing.md,
    backgroundColor: colors.background.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
});
