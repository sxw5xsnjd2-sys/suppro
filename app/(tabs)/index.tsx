import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "@/components/common/layout/Screen";
import { HomeHeader } from "@/features/supplements/components/HomeHeader";
import { SupplementCard } from "@/features/supplements/components/SupplementCard";
import { colors, spacing } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { router } from "expo-router";

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No supplements due</Text>
      <Text style={styles.emptyText}>
        You don’t have any supplements scheduled for this day.
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);

  const todayDay = new Date(selectedDate).getDay();

  const dueSupplements = supplements.filter(
    (s) => Array.isArray(s.daysOfWeek) && s.daysOfWeek.includes(todayDay)
  );

  const takenTimes = takenTimesByDate[selectedDate] ?? {};

  const toggleTaken = useSupplementsStore((s) => s.toggleTaken);
  const supplementsByTime = dueSupplements.reduce<
    Record<number, typeof dueSupplements>
  >((acc, s) => {
    if (!acc[s.timeMinutes]) acc[s.timeMinutes] = [];
    acc[s.timeMinutes].push(s);
    return acc;
  }, {});

  return (
    <Screen header={<HomeHeader />}>
      <View style={styles.content}>
        {dueSupplements.length === 0 ? (
          <EmptyState />
        ) : (
          Object.entries(supplementsByTime)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([timeMinutes, items]) => (
              <View key={timeMinutes} style={styles.timeSection}>
                <Text style={styles.timeLabel}>{items[0].time}</Text>

                <View style={styles.cardGroup}>
                  {items.map((s) => {
                    const takenAt = takenTimes[s.id];

                    return (
                      <SupplementCard
                        key={s.id}
                        name={s.name}
                        subtitle={s.dose}
                        route={s.route}
                        taken={Boolean(takenAt)}
                        footer={takenAt ? `Taken at ${takenAt}` : undefined}
                        onPress={() => toggleTaken(s.id)}
                        onLongPress={() =>
                          router.push({
                            pathname: "/modal/supplement",
                            params: { id: s.id },
                          })
                        }
                      />
                    );
                  })}
                </View>
              </View>
            ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  timeSection: {
    marginBottom: spacing.xl,
  },
  timeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  cardGroup: {
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
  },
});
