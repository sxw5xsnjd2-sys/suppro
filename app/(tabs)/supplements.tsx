import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Screen } from "@/components/layout/Screen";
import { Header } from "@/components/layout/Header";
import { SupplementCard } from "@/components/cards/SupplementCard";
import { colors, spacing } from "@/theme";

type Supplement = {
  id: string;
  name: string;
  subtitle: string;
};

const supplements: Supplement[] = [
  {
    id: "1",
    name: "Magnesium Glycinate",
    subtitle: "Sleep & recovery",
  },
  {
    id: "2",
    name: "Omega-3",
    subtitle: "Cardiovascular health",
  },
  {
    id: "3",
    name: "Vitamin D3",
    subtitle: "Hormonal support",
  },
];

// Functions
function AddButton() {
  return (
    <Pressable style={styles.addButton}>
      <Text style={styles.addButtonText}>Add supplement</Text>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No supplements added</Text>
      <Text style={styles.emptyText}>
        Add the supplements you currently take to get reminders, protocols, and
        health insights.
      </Text>

      <AddButton />
    </View>
  );
}

export default function SupplementsScreen() {
  const isEmpty = supplements.length === 0;

  return (
    <Screen
      header={
        <Header title="Supplements" subtitle="What you’re currently taking" />
      }
    >
      <View style={styles.section}>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            <View style={styles.list}>
              {supplements.map((s) => (
                <SupplementCard
                  key={s.id}
                  name={s.name}
                  subtitle={s.subtitle}
                />
              ))}
            </View>

            <AddButton />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },

  list: {
    gap: spacing.md,
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
    marginBottom: spacing.lg,
  },

  addButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.brand.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },

  addButtonText: {
    color: colors.text.inverse,
    fontSize: 14,
    fontWeight: "600",
  },
});
