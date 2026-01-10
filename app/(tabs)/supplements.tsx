import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { SupplementCard } from "@/features/supplements/components/SupplementCard";
import { colors, spacing } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { router } from "expo-router";

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

  const sorted = [...supplements].sort((a, b) => a.timeMinutes - b.timeMinutes);

  const isEmpty = sorted.length === 0;

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
    marginTop: spacing.xl,
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
