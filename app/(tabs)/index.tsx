import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { Screen } from "@/components/layout/Screen";
import { HomeHeader } from "@/components/home/HomeHeader";
import { SupplementCard } from "@/components/cards/SupplementCard";
import { colors, spacing } from "@/theme";
import { useSupplementsStore } from "@/store/supplementStore";
import { router } from "expo-router";

export default function HomeScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);

  const takenTimes = takenTimesByDate[selectedDate] ?? {};

  const toggleTaken = useSupplementsStore((s) => s.toggleTaken);
  const deleteSupplement = useSupplementsStore((s) => s.deleteSupplement);

  const supplementsByTime = supplements.reduce<
    Record<number, typeof supplements>
  >((acc, s) => {
    if (!acc[s.timeMinutes]) acc[s.timeMinutes] = [];
    acc[s.timeMinutes].push(s);
    return acc;
  }, {});

  return (
    <Screen header={<HomeHeader />}>
      <View style={styles.content}>
        {Object.entries(supplementsByTime)
          .sort(([a], [b]) => Number(a) - Number(b)) // ✅ time order
          .map(([timeMinutes, items]) => (
            <View key={timeMinutes} style={styles.timeSection}>
              <Text style={styles.timeLabel}>
                {items[0].time} {/* display HH:mm */}
              </Text>

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
                      onLongPress={() => {
                        router.push({
                          pathname: "/modal/supplement",
                          params: { id: s.id },
                        });
                      }}
                    />
                  );
                })}
              </View>
            </View>
          ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
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
});
